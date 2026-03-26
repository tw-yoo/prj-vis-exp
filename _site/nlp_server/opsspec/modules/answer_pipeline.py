from __future__ import annotations

import csv
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime
from io import StringIO
from pathlib import Path
from string import Template
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..core.utils import prune_nulls
from ..runtime.context_builder import build_chart_context

logger = logging.getLogger(__name__)


class ChartAnswerOutput(BaseModel):
    plan: List[str] = Field(default_factory=list, description="1–3 short bullets.")
    answer: str = Field(..., min_length=1)
    explanation: str = Field(..., min_length=1)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


def _load_prompt(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise RuntimeError(f"Prompt file is empty: {path}")
    return text


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _debug_root_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "debug_answers"


def _create_debug_session_dir() -> Path:
    base = _debug_root_dir()
    base.mkdir(parents=True, exist_ok=True)
    stem = datetime.now().strftime("%m%d%H%M")
    candidate = base / stem
    if not candidate.exists():
        candidate.mkdir(parents=True, exist_ok=False)
        return candidate
    suffix = 1
    while True:
        alt = base / f"{stem}_{suffix:02d}"
        if not alt.exists():
            alt.mkdir(parents=True, exist_ok=False)
            return alt
        suffix += 1


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(prune_nulls(payload), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _extract_encoding_fields(spec: Dict[str, Any]) -> List[str]:
    encoding = spec.get("encoding")
    if not isinstance(encoding, dict):
        return []
    fields: List[str] = []
    for channel_spec in encoding.values():
        if not isinstance(channel_spec, dict):
            continue
        field = channel_spec.get("field")
        if isinstance(field, str) and field and field not in fields:
            fields.append(field)
    return fields


def _rows_to_csv(rows: List[Dict[str, Any]], *, preferred_fields: List[str]) -> str:
    """
    Deterministically serialize rows into a CSV string for LLM prompting.

    Field order:
      1) preferred_fields (stable, deduped)
      2) remaining keys in sorted order
    """
    all_keys: List[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in row.keys():
            if isinstance(key, str) and key and key not in all_keys:
                all_keys.append(key)

    ordered: List[str] = []
    for key in preferred_fields:
        if key in all_keys and key not in ordered:
            ordered.append(key)
    for key in sorted([k for k in all_keys if k not in ordered]):
        ordered.append(key)

    buf = StringIO()
    writer = csv.DictWriter(buf, fieldnames=ordered, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        if not isinstance(row, dict):
            continue
        writer.writerow({k: row.get(k) for k in ordered})
    return buf.getvalue().strip() + "\n"


def _resolve_path_under_root(raw_path: str, *, root: Path) -> Path:
    value = str(raw_path).strip()
    if not value:
        raise ValueError("path is empty.")
    as_path = Path(value)
    candidate = as_path.resolve() if as_path.is_absolute() else (root / as_path).resolve()
    if not _path_is_within(candidate, root.resolve()):
        raise ValueError(f"path must be within project root: {value}")
    if not candidate.exists():
        raise ValueError(f"file not found: {value}")
    if not candidate.is_file():
        raise ValueError(f"path is not a file: {value}")
    return candidate


def _load_json_file(path: Path) -> Dict[str, Any]:
    if path.suffix.lower() != ".json":
        raise ValueError("vega_lite_spec_path must point to a .json file.")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("vega-lite spec JSON must be an object.")
    return payload


def _load_csv_file(path: Path) -> tuple[str, List[Dict[str, Any]]]:
    if path.suffix.lower() != ".csv":
        raise ValueError("data file must be a .csv file.")
    text = path.read_text(encoding="utf-8")
    reader = csv.DictReader(StringIO(text))
    rows: List[Dict[str, Any]] = []
    for row in reader:
        if isinstance(row, dict):
            rows.append(dict(row))
    return text, rows


class ChartAnswerPipeline:
    def __init__(
        self,
        *,
        ollama_model: str,
        ollama_base_url: str,
        ollama_api_key: str,
        prompts_dir: Path,
    ) -> None:
        self.llm = StructuredLLMClient(
            ollama_model=ollama_model,
            ollama_base_url=ollama_base_url,
            ollama_api_key=ollama_api_key,
        )
        self.prompts_dir = prompts_dir
        self.answer_prompt: Optional[str] = None

    def load(self) -> None:
        self.llm.load()
        if self.answer_prompt is not None:
            return
        self.answer_prompt = _load_prompt(self.prompts_dir / "chart_answer.md")

    def answer(
        self,
        *,
        question: str,
        vega_lite_spec: Dict[str, Any],
        data_rows: List[Dict[str, Any]],
        chart_csv_override: Optional[str] = None,
        request_id: str,
        debug: bool,
        llm_choice: Literal["chatgpt", "gemini"] = "chatgpt",
    ) -> Dict[str, Any]:
        self.load()
        assert self.answer_prompt is not None

        encoding_fields = _extract_encoding_fields(vega_lite_spec)
        chart_csv = chart_csv_override or _rows_to_csv(data_rows, preferred_fields=encoding_fields)
        chart_vl_spec = json.dumps(vega_lite_spec, ensure_ascii=False, indent=2)

        prompt = Template(self.answer_prompt).safe_substitute(
            chart_csv=chart_csv,
            chart_vl_spec=chart_vl_spec,
            question=question,
        )
        system_prompt = (
            "You are a data visualization analyst. "
            "Return strict JSON only. Do not include markdown fences."
        )

        debug_dir: Path | None = None
        payloads: Dict[str, Dict[str, Any]] = {}
        if debug:
            debug_dir = _create_debug_session_dir()
            chart_context, context_warnings, rows_preview = build_chart_context(vega_lite_spec, data_rows)
            payloads["00_request"] = {
                "request_id": request_id,
                "question": question,
                "vega_lite_spec": vega_lite_spec,
                "data_rows_count": len(data_rows),
                "debug": True,
            }
            payloads["01_context"] = {
                "chart_context": chart_context.model_dump(mode="json"),
                "context_warnings": context_warnings,
                "rows_preview": rows_preview,
            }
            payloads["02_prompt"] = {
                "prompt_path": str(self.prompts_dir / "chart_answer.md"),
                "system_prompt": system_prompt,
                "user_prompt": prompt,
                "llm_backend": self.llm.backend,
                "llm_config": {
                    "ollama_model": self.llm.ollama_model,
                    "ollama_base_url": self.llm.ollama_base_url,
                    "instructor_mode": self.llm.instructor_mode,
                    "OPENAI_MODEL": os.getenv("OPENAI_MODEL") if self.llm.backend == "openai_http" else None,
                    "OPENAI_BASE_URL": os.getenv("OPENAI_BASE_URL") if self.llm.backend == "openai_http" else None,
                },
            }

        parsed_output: Dict[str, Any]
        try:
            if llm_choice == "gemini":
                raw = self._call_gemini_api(system_prompt=system_prompt, user_prompt=prompt)
                parsed_output = json.loads(raw)
            else:
                parsed_output = self.llm.complete(
                    response_model=ChartAnswerOutput,
                    system_prompt=system_prompt,
                    user_prompt=prompt,
                    task_name="chart_answer",
                )
        except Exception as exc:
            if debug and debug_dir is not None:
                payloads["99_error"] = {"error": str(exc)}
                for name, obj in payloads.items():
                    _write_json(debug_dir / f"{name}.json", obj)
            raise

        validated = ChartAnswerOutput.model_validate(parsed_output)
        if debug and debug_dir is not None:
            payloads["03_response"] = parsed_output
            for name, obj in payloads.items():
                _write_json(debug_dir / f"{name}.json", obj)
        return validated.model_dump(by_alias=True)

    def answer_from_paths(
        self,
        *,
        question: str,
        vega_lite_spec_path: str,
        data_csv_path: str,
        request_id: str,
        debug: bool,
        llm_choice: Literal["chatgpt", "gemini"] = "chatgpt",
        _allowed_root: Optional[Path] = None,
    ) -> Dict[str, Any]:
        """
        Convenience entry for the API: accept file paths and parse them server-side.

        Security: paths must be within the project root by default.
        """
        root = (_allowed_root or _project_root()).resolve()
        spec_path = _resolve_path_under_root(vega_lite_spec_path, root=root)
        csv_path = _resolve_path_under_root(data_csv_path, root=root)

        spec = _load_json_file(spec_path)
        csv_text, rows = _load_csv_file(csv_path)

        return self.answer(
            question=question,
            vega_lite_spec=spec,
            data_rows=rows,
            chart_csv_override=csv_text,
            request_id=request_id,
            debug=debug,
            llm_choice=llm_choice,
        )

    def _call_gemini_api(self, *, system_prompt: str, user_prompt: str) -> str:
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is required for llm=gemini")
        model = os.getenv("GEMINI_MODEL", "models/text-bison-001").strip()
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateText"
        payload = {
            "prompt": {"text": f"{system_prompt}\n\n{user_prompt}"},
            "temperature": 0.2,
            "candidateCount": 1,
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Gemini HTTP error ({exc.code}): {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to call Gemini API: {exc}") from exc

        try:
            parsed = json.loads(raw)
            candidates = parsed.get("candidates") or []
            if not candidates:
                raise RuntimeError("Gemini response missing candidates")
            output = candidates[0].get("output")
            if isinstance(output, dict):
                return json.dumps(output)
            if isinstance(output, str):
                return output
            raise RuntimeError("Gemini candidate output has unexpected shape")
        except Exception as exc:
            raise RuntimeError(f"Failed to parse Gemini response: {exc}") from exc
