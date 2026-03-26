from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from draw_plan import build_draw_ops_spec, export_draw_plan_to_public, validate_draw_groups_payload
from opsspec.runtime.scheduler import schedule_ops_spec

from ..core.llm import StructuredLLMClient
from ..core.models import ChartContext, GenerateOpsSpecResponse, RecursivePipelineTrace, RecursiveStepTrace
from ..core.recursive_models import OpTask
from ..core.utils import prune_nulls
from ..runtime.artifacts import extract_scalar_ref_deps, summarize_runtime_values
from ..runtime.context_builder import build_chart_context
from ..runtime.executor import OpsSpecExecutor
from ..runtime.grounding import ground_op_spec
from ..runtime.normalize import normalize_meta_inputs
from ..runtime.op_registry import build_ops_contract_for_prompt
from ..specs.union import OperationSpec, parse_operation_spec
from ..validation.recursive_validators import validate_inventory, validate_step_compose_output
from ..validation.validators import validate_operation
from .module_inventory import run_inventory_module
from .prompt_examples import (
    build_inventory_few_shot_examples,
    build_step_compose_few_shot_examples,
    tune_few_shot_budget,
)
from .module_step_compose import run_step_compose_module

logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("pipeline_trace")


def _load_prompt(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise RuntimeError(f"Prompt file is empty: {path}")
    return text


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _debug_root_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "debug"


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


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(prune_nulls(payload), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_human_abstracted_json(path: Path, payload: Any) -> None:
    """Write human abstracted ops spec with compact one-line meta objects."""
    text = json.dumps(prune_nulls(payload), ensure_ascii=False, indent=2)
    meta_pattern = re.compile(r'"meta": \{\n(?P<body>(?:\s+"[^"]+": .*?(?:,\n|\n))+?)\s+\}')

    def _collapse_meta(match: re.Match[str]) -> str:
        body = match.group("body")
        parts = [line.strip() for line in body.splitlines() if line.strip()]
        return f'"meta": {{ {" ".join(parts)} }}'

    collapsed = meta_pattern.sub(_collapse_meta, text)
    path.write_text(collapsed + "\n", encoding="utf-8")


def _escape_dot_label(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _group_color(name: str) -> str:
    if name == "ops":
        return "#e8f0fe"
    if name.startswith("ops"):
        return "#e8f5e9"
    return "#f5f5f5"


def _build_ops_spec_dot(groups: Dict[str, Any]) -> str:
    node_meta: Dict[str, Dict[str, str]] = {}
    edges: List[Tuple[str, str]] = []

    for group_name, ops in (groups or {}).items():
        if not isinstance(group_name, str) or not isinstance(ops, list):
            continue
        for op in ops:
            if not isinstance(op, dict):
                continue
            meta = op.get("meta") if isinstance(op.get("meta"), dict) else {}
            node_id = meta.get("nodeId") or op.get("id")
            if not isinstance(node_id, str) or not node_id:
                continue
            op_name = op.get("op")
            label_parts = [str(node_id)]
            if isinstance(op_name, str) and op_name:
                label_parts.append(op_name)
            if isinstance(group_name, str) and group_name:
                label_parts.append(f"({group_name})")

            field = op.get("field")
            if isinstance(field, str) and field:
                label_parts.append(f"field={field}")
            group = op.get("group")
            if isinstance(group, str) and group:
                label_parts.append(f"group={group}")
            fn = op.get("fn")
            if isinstance(fn, str) and fn:
                label_parts.append(f"fn={fn}")

            node_meta[node_id] = {"label": " ".join(label_parts), "group": group_name}

            inputs = meta.get("inputs")
            if isinstance(inputs, list):
                for inp in inputs:
                    if isinstance(inp, str) and inp:
                        edges.append((inp, node_id))

    lines: List[str] = []
    lines.append("digraph OpsSpecTree {")
    lines.append('  graph [rankdir=LR, bgcolor="white"];')
    lines.append('  node [shape=box, style="rounded,filled", fillcolor="white", fontname="Helvetica"];')
    lines.append('  edge [color="#666666"];')

    groups_by_name: Dict[str, List[str]] = {}
    for node_id, meta in node_meta.items():
        groups_by_name.setdefault(meta["group"], []).append(node_id)

    def _group_sort_key(name: str) -> tuple[int, int, str]:
        if name == "ops":
            return (0, 1, name)
        if name.startswith("ops") and name[3:].isdigit():
            try:
                return (0, int(name[3:]), name)
            except Exception:
                return (0, 9999, name)
        return (1, 9999, name)

    for group_name, node_ids in sorted(groups_by_name.items(), key=lambda item: _group_sort_key(item[0])):
        cluster_name = f"cluster_{group_name}"
        lines.append(f'  subgraph "{cluster_name}" {{')
        lines.append(f'    label="{_escape_dot_label(group_name)}";')
        lines.append('    color="#bbbbbb";')
        lines.append('    style="rounded,filled";')
        lines.append(f'    fillcolor="{_group_color(group_name)}";')
        for node_id in sorted(node_ids):
            label = node_meta[node_id]["label"]
            lines.append(f'    "{node_id}" [label="{_escape_dot_label(label)}"];')
        lines.append("  }")

    for src, dst in edges:
        if src in node_meta and dst in node_meta:
            lines.append(f'  "{src}" -> "{dst}";')
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def _try_render_dot(dot_path: Path, *, out_base: Path) -> List[str]:
    warnings: List[str] = []
    dot_bin = shutil.which("dot")
    if not dot_bin:
        warnings.append('Graphviz "dot" not found in PATH; wrote .dot only.')
        return warnings

    try:
        svg_path = out_base.with_suffix(".svg")
        png_path = out_base.with_suffix(".png")
        subprocess.run([dot_bin, "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True, capture_output=True, text=True)
        subprocess.run([dot_bin, "-Tpng", str(dot_path), "-o", str(png_path)], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        warnings.append(f'Graphviz render failed: {stderr or exc}')
    except Exception as exc:
        warnings.append(f"Graphviz render failed: {exc}")
    return warnings


def _escape_mermaid_label(text: str) -> str:
    return str(text).replace('"', '\\"')


def _render_trace_markdown(
    *,
    tasks: List[OpTask],
    steps_debug: List[Dict[str, Any]],
    step_traces: List[RecursiveStepTrace],
) -> str:
    lines: List[str] = []
    lines.append("# Recursive Grammar Trace")
    lines.append("")
    lines.append("## Inventory (S(O))")
    lines.append(f"- total_tasks: {len(tasks)}")
    lines.append("")
    if tasks:
        lines.append("| taskId | op | sentenceIndex | mention | paramsHint |")
        lines.append("| --- | --- | --- | --- | --- |")
        for task in tasks:
            params = json.dumps(task.paramsHint, ensure_ascii=False)
            mention = str(task.mention).replace("|", "\\|")
            lines.append(f"| {task.taskId} | {task.op} | {task.sentenceIndex} | {mention} | `{params}` |")
    else:
        lines.append("_no tasks_")

    lines.append("")
    lines.append("## Steps")
    if not step_traces:
        lines.append("_no steps executed_")
        return "\n".join(lines) + "\n"

    for idx, step in enumerate(step_traces, start=1):
        debug_entry = steps_debug[idx - 1] if idx - 1 < len(steps_debug) else {}
        remaining_before = debug_entry.get("remaining_before") or []
        remaining_after = debug_entry.get("remaining_after") or []

        lines.append("")
        lines.append(f"### Step {step.step}")
        lines.append(f"- taskId: {step.taskId}")
        lines.append(f"- nodeId: {step.nodeId}")
        lines.append(f"- op: {step.op}")
        lines.append(f"- groupName: {step.groupName}")
        lines.append(f"- inputs: {step.inputs}")
        lines.append(f"- scalarRefs: {step.scalarRefs}")

        lines.append("")
        lines.append("#### Inventory delta")
        lines.append(f"- remaining_before_count: {len(remaining_before)}")
        lines.append(f"- remaining_after_count: {len(remaining_after)}")
        lines.append(f"- remaining_before: {[t.get('taskId') for t in remaining_before]}")
        lines.append(f"- remaining_after: {[t.get('taskId') for t in remaining_after]}")

        lines.append("")
        lines.append("#### Tree snapshot")
        lines.append("```mermaid")
        lines.append("flowchart LR")
        for t in step_traces[:idx]:
            label = _escape_mermaid_label(f"{t.nodeId}: {t.op}")
            lines.append(f'  {t.nodeId}["{label}"]')
        for t in step_traces[:idx]:
            for inp in t.inputs:
                lines.append(f"  {inp} --> {t.nodeId}")
        lines.append("```")

    lines.append("")
    return "\n".join(lines) + "\n"


def _persist_debug_bundle(payloads: Dict[str, Any]) -> Path:
    session_dir = _create_debug_session_dir()

    for filename, key in (
        ("00_request.json", "request"),
        ("01_context.json", "context"),
        ("02_inventory.json", "inventory"),
        ("00_trace.md", "trace_md"),
        ("90_final_grammar.json", "final_grammar"),
        ("92_human_abstracted_ops_spec.json", "human_abstracted_ops_spec"),
        ("95_draw_plan.json", "draw_plan"),
        ("99_error.json", "error"),
    ):
        data = payloads.get(key)
        if data is None:
            continue
        if filename.endswith(".md"):
            Path(session_dir / filename).write_text(str(data), encoding="utf-8")
        elif key == "human_abstracted_ops_spec":
            _write_human_abstracted_json(session_dir / filename, data)
        else:
            _write_json(session_dir / filename, data)

    steps = payloads.get("steps")
    if isinstance(steps, list):
        for idx, step in enumerate(steps, start=1):
            if not isinstance(step, dict):
                continue
            compose = step.get("compose")
            grounded = step.get("grounded")
            op_dump = step.get("op")
            exec_dump = step.get("exec")
            if compose is not None:
                _write_json(session_dir / f"03_step_{idx:02d}_compose.json", compose)
            if grounded is not None:
                _write_json(session_dir / f"04_step_{idx:02d}_grounded.json", grounded)
            if op_dump is not None:
                _write_json(session_dir / f"05_step_{idx:02d}_op.json", op_dump)
            if exec_dump is not None:
                _write_json(session_dir / f"06_step_{idx:02d}_exec.json", exec_dump)

    final_payload = payloads.get("final_grammar") or {}
    if isinstance(final_payload, dict):
        ops_spec = final_payload.get("ops_spec")
        if isinstance(ops_spec, dict):
            dot_text = _build_ops_spec_dot(ops_spec)
            dot_path = session_dir / "91_tree_ops_spec.dot"
            dot_path.write_text(dot_text, encoding="utf-8")
            render_warnings = _try_render_dot(dot_path, out_base=session_dir / "91_tree_ops_spec")
            if render_warnings:
                (session_dir / "91_tree_ops_spec_render_warnings.txt").write_text(
                    "\n".join(render_warnings) + "\n",
                    encoding="utf-8",
                )

    return session_dir


def _build_human_abstracted_ops_spec(ops_spec: Dict[str, Any]) -> Dict[str, Any]:
    """Build a compact, human-readable debug artifact from ops_spec groups."""
    abstracted: Dict[str, Any] = {}
    for group_name, ops in (ops_spec or {}).items():
        if not isinstance(ops, list):
            continue
        compact_ops: List[Dict[str, Any]] = []
        for op in ops:
            if not isinstance(op, dict):
                continue
            compact = dict(op)
            compact.pop("chartId", None)
            meta = compact.get("meta")
            if isinstance(meta, dict):
                meta_compact = dict(meta)
                meta_compact.pop("source", None)
                meta_compact.pop("view", None)
                compact["meta"] = meta_compact
            compact_ops.append(prune_nulls(compact))
        abstracted[group_name] = compact_ops
    return abstracted


def _group_name(sentence_index: int) -> str:
    return "ops" if int(sentence_index) == 1 else f"ops{int(sentence_index)}"


def _task_sort_key(task: OpTask) -> int:
    raw = str(task.taskId)
    try:
        return int(raw[1:])
    except Exception:
        return 10**9


def _select_next_task(
    remaining_by_id: Dict[str, OpTask],
    *,
    executed_node_ids: Set[str],
) -> Tuple[OpTask, List[str]]:
    candidates = sorted(list(remaining_by_id.values()), key=_task_sort_key)
    if not candidates:
        raise RuntimeError("select_next_task called with empty remaining_by_id.")

    ready: List[OpTask] = []
    for task in candidates:
        deps = extract_scalar_ref_deps(task.paramsHint or {})
        if deps.issubset(executed_node_ids):
            ready.append(task)

    if ready:
        return ready[0], []

    fallback = candidates[0]
    missing = sorted(list(extract_scalar_ref_deps(fallback.paramsHint or {}) - executed_node_ids))
    if missing:
        return (
            fallback,
            [
                f'deterministic task selector fallback: no ready tasks; selected "{fallback.taskId}" by minimum taskId '
                f'with unresolved refs {missing}.',
            ],
        )
    return (
        fallback,
        [f'deterministic task selector fallback: no ready tasks; selected "{fallback.taskId}" by minimum taskId.'],
    )


def _llm_debug_config(llm: StructuredLLMClient) -> Dict[str, Any]:
    # Keep stable and minimal. (Do not add secrets.)
    return {
        "backend": llm.backend,
        "ollama_model": llm.ollama_model,
        "ollama_base_url": llm.ollama_base_url,
        "instructor_mode": llm.instructor_mode,
        "OPENAI_MODEL": os.getenv("OPENAI_MODEL") if llm.backend == "openai_http" else None,
        "OPENAI_BASE_URL": os.getenv("OPENAI_BASE_URL") if llm.backend == "openai_http" else None,
        "LLM_BACKEND": os.getenv("LLM_BACKEND") or None,
    }


def _build_retry_feedback(attempt: int, max_retries: int, error: Exception) -> List[str]:
    """
    Validation error를 LLM에게 전달할 structured retry feedback으로 변환.
    Schema error / semantic error 유형을 구분해서 actionable 힌트를 제공.
    """
    err_str = str(error)
    err_lower = err_str.lower()
    lines = [f"[Attempt {attempt}/{max_retries} FAILED — fix and retry]"]

    if ".group" in err_lower or "group must be" in err_lower:
        lines.append(
            "[Type: Group Rule] group must be a single series value string (not year list or sentence-layer token)."
        )
        lines.append(
            "[Hint] For year subsets, use filter(include=[...]) first, then compute average/count/findExtremum using inputs=[<filter_node>]."
        )
    elif "schema error" in err_lower or "validation error" in err_lower or "field required" in err_lower:
        lines.append("[Type: Schema] Output did not match the required JSON schema.")
    elif "is not in allowed_ops" in err_str:
        lines.append("[Type: Invalid Op] Used an op name that is not listed in allowed_ops.")
    elif "filter" in err_lower and ("mode" in err_lower or "require" in err_lower or "membership" in err_lower):
        lines.append("[Type: Filter Rule] A filter membership/comparison constraint was violated.")
    elif "series" in err_lower or ("filter" in err_lower and "series_field" in err_lower):
        lines.append("[Type: Series Rule] Series restriction rule violated; use op.group instead of filtering on series_field.")
    elif "ref:" in err_lower or "scalar ref" in err_lower or "object reference" in err_lower:
        lines.append('[Type: Ref Rule] Scalar reference rule violated; use "ref:nX" string format only, never {"id":"nX"}.')
    elif "inputs" in err_lower and ("unknown" in err_lower or "future" in err_lower):
        lines.append("[Type: Input Rule] inputs[] references a nodeId that does not exist yet.")
    else:
        lines.append("[Type: Semantic] A semantic or contract constraint was violated.")

    lines.append(f"[Detail] {err_str}")
    lines.append("[Action Required] Fix the specific issue above and return valid JSON only.")
    return lines


def _resolve_draw_plan_mode() -> Tuple[str, List[str]]:
    raw = (os.getenv("DRAW_PLAN_MODE", "off") or "off").strip().lower()
    if raw in {"off", "validate", "export"}:
        return raw, []
    return "off", [f'Invalid DRAW_PLAN_MODE "{raw}" (allowed: off|validate|export). Fallback to "off".']


def _resolve_draw_failure_policy() -> Tuple[str, List[str]]:
    raw = (os.getenv("DRAW_PLAN_FAILURE_POLICY", "warn") or "warn").strip().lower()
    if raw in {"warn", "raise"}:
        return raw, []
    return "warn", [f'Invalid DRAW_PLAN_FAILURE_POLICY "{raw}" (allowed: warn|raise). Fallback to "warn".']


class OpsSpecPipeline:
    """
    Recursive Grammar Pipeline (MVP).

    - Inventory: explanation -> S(O)
    - Recursive loop: step-compose -> deterministic grounding/validation -> execute -> update artifacts
    - Output: OpsSpec group map (sentence-layer groups) with meta.nodeId/meta.inputs edges
    """

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
        self.inventory_prompt: Optional[str] = None
        self.step_compose_prompt: Optional[str] = None
        self.shared_rules_prompt: Optional[str] = None
        self.inventory_prompt_path: Optional[Path] = None
        self.step_compose_prompt_path: Optional[Path] = None
        self.shared_rules_prompt_path: Optional[Path] = None

    def load(self) -> None:
        self.llm.load()
        if self.inventory_prompt and self.step_compose_prompt and self.shared_rules_prompt is not None:
            return
        self.inventory_prompt_path = self.prompts_dir / "opsspec_inventory.md"
        self.step_compose_prompt_path = self.prompts_dir / "opsspec_step_compose.md"
        self.shared_rules_prompt_path = self.prompts_dir / "opsspec_shared_rules.md"

        self.inventory_prompt = _load_prompt(self.inventory_prompt_path)
        self.step_compose_prompt = _load_prompt(self.step_compose_prompt_path)
        self.shared_rules_prompt = _load_prompt(self.shared_rules_prompt_path) if self.shared_rules_prompt_path.exists() else ""

    def generate(
        self,
        *,
        question: str,
        explanation: str,
        vega_lite_spec: Dict[str, Any],
        data_rows: List[Dict[str, Any]],
        request_id: str,
        debug: bool,
    ) -> GenerateOpsSpecResponse:
        self.load()
        assert self.inventory_prompt is not None
        assert self.step_compose_prompt is not None
        assert self.shared_rules_prompt is not None
        assert self.inventory_prompt_path is not None
        assert self.step_compose_prompt_path is not None
        assert self.shared_rules_prompt_path is not None

        max_steps = int(os.getenv("RECURSIVE_MAX_STEPS", "25") or "25")
        max_retries = int(os.getenv("RECURSIVE_MAX_RETRIES", "3") or "3")
        artifact_preview_n = int(os.getenv("ARTIFACT_PREVIEW_N", "5") or "5")
        draw_plan_mode, draw_mode_notes = _resolve_draw_plan_mode()
        draw_failure_policy, draw_policy_notes = _resolve_draw_failure_policy()

        debug_payloads: Dict[str, Any] = {
            "request": {
                "request_id": request_id,
                "question": question,
                "explanation": explanation,
                "vega_lite_spec": vega_lite_spec,
                "data_rows": data_rows,
                "debug": debug,
                "env": {
                    "RECURSIVE_MAX_STEPS": max_steps,
                    "RECURSIVE_MAX_RETRIES": max_retries,
                    "ARTIFACT_PREVIEW_N": artifact_preview_n,
                    "DRAW_PLAN_MODE": draw_plan_mode,
                    "DRAW_PLAN_FAILURE_POLICY": draw_failure_policy,
                },
            }
        }

        chart_context, context_warnings, rows_preview = build_chart_context(vega_lite_spec, data_rows)
        debug_payloads["context"] = {
            "chart_context": chart_context.model_dump(mode="json"),
            "context_warnings": context_warnings,
            "rows_preview": rows_preview,
        }
        trace_logger.info(
            "[request:%s] context_built | fields=%d series_field=%s",
            request_id,
            len(chart_context.fields),
            chart_context.series_field or "-",
        )

        ops_contract = build_ops_contract_for_prompt()
        roles_summary = {
            "primary_measure": chart_context.primary_measure,
            "primary_dimension": chart_context.primary_dimension,
            "series_field": chart_context.series_field,
        }
        series_domain: List[Any] = []
        if chart_context.series_field:
            series_domain = list(chart_context.categorical_values.get(chart_context.series_field, []))
        measure_fields = list(chart_context.measure_fields)
        few_shot_budget = tune_few_shot_budget(
            question=question,
            explanation=explanation,
            chart_context=chart_context.model_dump(mode="json"),
        )
        inventory_few_shot = build_inventory_few_shot_examples(
            question=question,
            explanation=explanation,
            chart_context=chart_context.model_dump(mode="json"),
            max_examples=few_shot_budget.inventory_max_examples,
            max_chars=few_shot_budget.inventory_max_chars,
        )
        step_compose_few_shot = build_step_compose_few_shot_examples(
            question=question,
            explanation=explanation,
            chart_context=chart_context.model_dump(mode="json"),
            max_examples=few_shot_budget.step_max_examples,
            steps_per_example=few_shot_budget.step_steps_per_example,
            max_chars=few_shot_budget.step_max_chars,
        )

        # ─────────────────────────────────────────────────────────
        # Module 1: Inventory (LLM + strict retry)
        # ─────────────────────────────────────────────────────────
        inventory_feedback: List[str] = []
        inventory_retry_notes: List[str] = []
        inventory_payload: Dict[str, Any] = {}
        tasks_for_trace: List[OpTask] = []
        steps_debug: List[Dict[str, Any]] = []
        step_traces: List[RecursiveStepTrace] = []

        def _attach_trace_md() -> None:
            debug_payloads["trace_md"] = _render_trace_markdown(
                tasks=tasks_for_trace,
                steps_debug=steps_debug,
                step_traces=step_traces,
            )

        for attempt in range(1, max_retries + 1):
            try:
                inventory_payload = run_inventory_module(
                    llm=self.llm,
                    prompt_template=self.inventory_prompt,
                    prompt_path=str(self.inventory_prompt_path),
                    shared_rules=self.shared_rules_prompt,
                    shared_rules_path=str(self.shared_rules_prompt_path),
                    question=question,
                    explanation=explanation,
                    chart_context=chart_context.model_dump(mode="json"),
                    roles_summary=roles_summary,
                    series_domain=series_domain,
                    measure_fields=measure_fields,
                    rows_preview=rows_preview,
                    ops_contract=ops_contract,
                    validation_feedback=inventory_feedback,
                    few_shot_examples=inventory_few_shot.text,
                    include_debug_prompts=True,
                )
                inventory_validated = validate_inventory(
                    inventory_payload,
                    ops_contract=ops_contract,
                    chart_context=chart_context,
                )
                inventory_payload["_validated"] = inventory_validated.model_dump(mode="json")
                inventory_payload["_attempt"] = attempt
                inventory_payload["_validation_feedback_in"] = inventory_feedback
                break
            except Exception as exc:
                inventory_feedback = _build_retry_feedback(attempt, max_retries, exc)
                inventory_retry_notes.append(
                    f"inventory attempt {attempt}/{max_retries} failed with {len(inventory_feedback)} feedback lines"
                )
                trace_logger.warning(
                    "[request:%s] inventory_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_retries,
                    len(inventory_feedback),
                )
                if attempt == max_retries:
                    debug_payloads["error"] = {
                        "stage": "inventory_retry_exhausted",
                        "errors": inventory_feedback,
                        "attempts": max_retries,
                    }
                    debug_payloads["inventory"] = {
                        **(inventory_payload or {}),
                        "retry_notes": inventory_retry_notes,
                        "llm": _llm_debug_config(self.llm),
                        "ops_contract": ops_contract,
                    }
                    _attach_trace_md()
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "inventory failed after strict retries: "
                        + "; ".join(inventory_feedback[:8])
                        + f" (debug_bundle={session_dir})"
                    ) from exc

        inventory_validated = validate_inventory(
            inventory_payload.get("_validated") or inventory_payload,
            ops_contract=ops_contract,
            chart_context=chart_context,
        )

        # Deterministic ordering for prompting + trace.
        tasks: List[OpTask] = sorted(list(inventory_validated.tasks or []), key=_task_sort_key)
        tasks_for_trace = list(tasks)
        remaining_by_id: Dict[str, OpTask] = {str(t.taskId): t for t in tasks}
        debug_payloads["inventory"] = {
            "tasks": [t.model_dump(mode="json") for t in tasks],
            "warnings": list(inventory_payload.get("warnings") or []),
            "attempt": int(inventory_payload.get("_attempt") or 1),
            "validation_feedback_in": list(inventory_payload.get("_validation_feedback_in") or []),
            "retry_notes": inventory_retry_notes,
            "llm": _llm_debug_config(self.llm),
            # LLM raw output (Pydantic 검증 전 원본 JSON string) + latency.
            "raw_llm_response": inventory_payload.get("_raw_llm_response"),
            "llm_elapsed_ms": inventory_payload.get("_llm_elapsed_ms"),
            # 실제 LLM에 전달된 렌더링된 프롬프트 전문 (재현성).
            "rendered_prompts": inventory_payload.get("_debug"),
            "prompts": {
                "inventory": {
                    "path": str(self.inventory_prompt_path),
                    "sha256": _sha256_text(self.inventory_prompt),
                },
                "step_compose": {
                    "path": str(self.step_compose_prompt_path),
                    "sha256": _sha256_text(self.step_compose_prompt),
                },
                "shared_rules": {
                    "path": str(self.shared_rules_prompt_path),
                    "sha256": _sha256_text(self.shared_rules_prompt),
                },
            },
            "few_shot": {
                "inventory_example_ids": inventory_few_shot.ids,
                "step_compose_example_ids": step_compose_few_shot.ids,
                "budget": {
                    "inventory_max_examples": few_shot_budget.inventory_max_examples,
                    "inventory_max_chars": few_shot_budget.inventory_max_chars,
                    "step_max_examples": few_shot_budget.step_max_examples,
                    "step_max_chars": few_shot_budget.step_max_chars,
                    "step_steps_per_example": few_shot_budget.step_steps_per_example,
                },
            },
        }

        trace_logger.info(
            "[request:%s] inventory_done | tasks=%d warnings=%d llm_elapsed_ms=%s",
            request_id,
            len(tasks),
            len(inventory_payload.get("warnings") or []),
            inventory_payload.get("_llm_elapsed_ms", "?"),
        )

        # ─────────────────────────────────────────────────────────
        # Recursive synthesis loop
        # ─────────────────────────────────────────────────────────
        executor = OpsSpecExecutor(chart_context)
        executed_node_ids: List[str] = []
        ops_spec_groups: Dict[str, List[OperationSpec]] = {}
        available_nodes_prompt: List[Dict[str, Any]] = []
        step_retry_notes: List[str] = []

        def _remaining_tasks_prompt() -> List[Dict[str, Any]]:
            # Small, stable shape for prompting.
            remaining = sorted(list(remaining_by_id.values()), key=_task_sort_key)
            out: List[Dict[str, Any]] = []
            for t in remaining:
                out.append(
                    {
                        "taskId": str(t.taskId),
                        "op": t.op,
                        "sentenceIndex": int(t.sentenceIndex),
                        "mention": t.mention,
                        "paramsHint": t.paramsHint,
                    }
                )
            return out

        for step_idx in range(1, max_steps + 1):
            if not remaining_by_id:
                break

            step_feedback: List[str] = []
            compose_payload: Dict[str, Any] = {}
            selected_task, selection_warnings = _select_next_task(
                remaining_by_id,
                executed_node_ids=set(executed_node_ids),
            )
            picked_task: OpTask = selected_task
            grounded_op_spec: Dict[str, Any] = {}
            built_op: Optional[OperationSpec] = None
            scalar_deps: Set[str] = set()
            group_name: str = "ops"
            node_id: str = f"n{len(executed_node_ids) + 1}"
            step_warnings: List[str] = list(selection_warnings)
            remaining_before = _remaining_tasks_prompt()
            selected_task_prompt = {
                "taskId": str(selected_task.taskId),
                "op": selected_task.op,
                "sentenceIndex": int(selected_task.sentenceIndex),
                "mention": selected_task.mention,
                "paramsHint": selected_task.paramsHint,
            }

            for attempt in range(1, max_retries + 1):
                try:
                    compose_payload = run_step_compose_module(
                        llm=self.llm,
                        prompt_template=self.step_compose_prompt,
                        prompt_path=str(self.step_compose_prompt_path),
                        shared_rules=self.shared_rules_prompt,
                        shared_rules_path=str(self.shared_rules_prompt_path),
                        question=question,
                        explanation=explanation,
                        current_task=selected_task_prompt,
                        remaining_tasks=_remaining_tasks_prompt(),
                        available_nodes=sorted(
                            list(available_nodes_prompt),
                            key=lambda item: str(item.get("nodeId") or ""),
                        ),
                        chart_context=chart_context.model_dump(mode="json"),
                        rows_preview=rows_preview,
                        ops_contract=ops_contract,
                        validation_feedback=step_feedback,
                        few_shot_examples=step_compose_few_shot.text,
                        include_debug_prompts=True,
                    )

                    parsed = validate_step_compose_output(
                        compose_payload,
                        selected_task=selected_task,
                        executed_node_ids=set(executed_node_ids),
                        ops_contract=ops_contract,
                        chart_context=chart_context,
                    )

                    scalar_deps = set(extract_scalar_ref_deps(parsed.op_spec))
                    grounded_op_spec, grounding_warnings = ground_op_spec(
                        parsed.op_spec, chart_context=chart_context
                    )
                    step_warnings.extend(grounding_warnings)

                    group_name = _group_name(picked_task.sentenceIndex)
                    meta_inputs = sorted({*list(parsed.inputs or []), *list(scalar_deps)})
                    if node_id in meta_inputs:
                        meta_inputs = [x for x in meta_inputs if x != node_id]

                    op_dict = dict(grounded_op_spec)
                    op_dict["id"] = node_id
                    op_dict["meta"] = {
                        "nodeId": node_id,
                        "inputs": meta_inputs,
                        "sentenceIndex": int(picked_task.sentenceIndex),
                        "source": f"recursive_step={step_idx};taskId={picked_task.taskId}",
                    }

                    built = parse_operation_spec(op_dict)
                    normalized, op_warnings = validate_operation(built, chart_context=chart_context)
                    step_warnings.extend(op_warnings)
                    built_op = normalized
                    break
                except Exception as exc:
                    step_feedback = _build_retry_feedback(attempt, max_retries, exc)
                    step_feedback.append(
                        f"[Selected Task] taskId={selected_task.taskId}, op={selected_task.op}"
                    )
                    step_feedback.append(
                        "[Constraint] Do not select taskId in output. Compose op_spec/inputs for the selected task only."
                    )
                    step_retry_notes.append(
                        f"step {step_idx} attempt {attempt}/{max_retries} failed with {len(step_feedback)} feedback lines"
                    )
                    trace_logger.warning(
                        "[request:%s] step_retry | step=%d attempt=%d/%d errors=%d",
                        request_id,
                        step_idx,
                        attempt,
                        max_retries,
                        len(step_feedback),
                    )
                    if attempt == max_retries:
                        steps_debug.append(
                            {
                                "compose": {
                                    # Step-Compose LLM 출력 (명시적 추출 — failed path)
                                    "legacy_pickTaskId": (compose_payload or {}).get("pickTaskId"),
                                    "selected_task": selected_task_prompt,
                                    "op_spec": (compose_payload or {}).get("op_spec"),
                                    "inputs": (compose_payload or {}).get("inputs"),
                                    "warnings": (compose_payload or {}).get("warnings"),
                                    "raw_llm_response": (compose_payload or {}).get("_raw_llm_response"),
                                    "llm_elapsed_ms": (compose_payload or {}).get("_llm_elapsed_ms"),
                                    "rendered_prompts": (compose_payload or {}).get("_debug"),
                                    # 파이프라인 메타
                                    "step": step_idx,
                                    "attempt": attempt,
                                    "validation_feedback_in": step_feedback,
                                    "status": "failed",
                                }
                            }
                        )
                        debug_payloads["error"] = {
                            "stage": "step_retry_exhausted",
                            "step": step_idx,
                            "errors": step_feedback,
                            "attempts": max_retries,
                            "selected_task": selected_task_prompt,
                            "remaining_tasks": _remaining_tasks_prompt(),
                            "executed_nodes": available_nodes_prompt,
                        }
                        debug_payloads["steps"] = steps_debug
                        _attach_trace_md()
                        session_dir = _persist_debug_bundle(debug_payloads)
                        trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                        raise RuntimeError(
                            f"step-compose failed after strict retries (step={step_idx}): "
                            + "; ".join(step_feedback[:8])
                            + f" (debug_bundle={session_dir})"
                        ) from exc

            assert built_op is not None

            # Execute one op to grow artifacts (C).
            exec_warnings: List[str] = []
            try:
                _ = executor.execute(rows=data_rows, ops_spec={group_name: [built_op]})
            except Exception as exc:
                exec_warnings.append(f"executor failed: {exc}")
                debug_payloads["error"] = {
                    "stage": "executor_failed",
                    "step": step_idx,
                    "nodeId": node_id,
                    "error": str(exc),
                }
                debug_payloads["steps"] = steps_debug
                _attach_trace_md()
                session_dir = _persist_debug_bundle(debug_payloads)
                trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                raise

            runtime_values = executor.runtime.get(node_id, [])
            artifact = summarize_runtime_values(
                list(runtime_values),
                chart_context=chart_context,
                max_items=max(1, artifact_preview_n),
            )
            if any(math.isnan(float(item.value)) for item in runtime_values):
                data_parent = "base"
                if built_op.meta and built_op.meta.inputs:
                    data_parent = str((built_op.meta.inputs or [])[0])
                nan_warning = (
                    "executor produced NaN value; likely empty slice or invalid group restriction "
                    f"(nodeId={node_id}, op={built_op.op}, group={getattr(built_op, 'group', None)}, data_parent={data_parent})."
                )
                exec_warnings.append(nan_warning)
                artifact["nan_detected"] = True

            # Update graph + state
            ops_spec_groups.setdefault(group_name, []).append(built_op)
            executed_node_ids.append(node_id)
            remaining_by_id.pop(str(picked_task.taskId), None)
            remaining_after = _remaining_tasks_prompt()

            available_nodes_prompt.append(
                {
                    "nodeId": node_id,
                    "op": built_op.op,
                    "sentenceIndex": int(picked_task.sentenceIndex),
                    "groupName": group_name,
                    "artifact": artifact,
                }
            )

            step_debug_entry = {
                "compose": {
                    # Step-Compose LLM 출력 (명시적 추출 — success path)
                    "legacy_pickTaskId": compose_payload.get("pickTaskId"),
                    "selected_task": selected_task_prompt,
                    "op_spec": compose_payload.get("op_spec"),
                    "inputs": compose_payload.get("inputs"),
                    "warnings": compose_payload.get("warnings"),
                    "raw_llm_response": compose_payload.get("_raw_llm_response"),
                    "llm_elapsed_ms": compose_payload.get("_llm_elapsed_ms"),
                    "rendered_prompts": compose_payload.get("_debug"),
                    # 파이프라인이 결정론적으로 부여하는 메타
                    "step": step_idx,
                    "attempt": attempt,
                    "nodeId": node_id,
                    "groupName": group_name,
                    "grounding_warnings": step_warnings,
                    "status": "ok",
                },
                "grounded": {
                    "task": picked_task.model_dump(mode="json"),
                    "grounded_op_spec": grounded_op_spec,
                    "scalar_ref_deps": sorted(list(scalar_deps)),
                },
                "op": built_op.model_dump(by_alias=True, exclude_none=True),
                "exec": {
                    "artifact": artifact,
                    "warnings": exec_warnings,
                },
                "remaining_before": remaining_before,
                "remaining_after": remaining_after,
            }
            steps_debug.append(step_debug_entry)

            step_traces.append(
                RecursiveStepTrace(
                    step=step_idx,
                    taskId=str(picked_task.taskId),
                    nodeId=node_id,
                    groupName=group_name,
                    op=built_op.op,
                    inputs=[str(x) for x in (built_op.meta.inputs or [])],
                    scalarRefs=sorted(list(scalar_deps)),
                    grounded_op_spec=grounded_op_spec,
                    artifact=artifact,
                    warnings=list(step_warnings) + exec_warnings,
                )
            )

            trace_logger.info(
                "[request:%s] step_done | step=%d node=%s op=%s group=%s remaining=%d llm_elapsed_ms=%s",
                request_id,
                step_idx,
                node_id,
                built_op.op,
                group_name,
                len(remaining_by_id),
                compose_payload.get("_llm_elapsed_ms", "?"),
            )

        if remaining_by_id:
            debug_payloads["error"] = {
                "stage": "max_steps_exhausted",
                "executed_steps": len(executed_node_ids),
                "max_steps": max_steps,
                "remaining_tasks": _remaining_tasks_prompt(),
            }
            debug_payloads["steps"] = steps_debug
            _attach_trace_md()
            session_dir = _persist_debug_bundle(debug_payloads)
            trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
            raise RuntimeError(
                f"recursive synthesis exhausted max steps ({max_steps}) with {len(remaining_by_id)} tasks remaining."
            )

        # ─────────────────────────────────────────────────────────
        # Normalize meta.inputs (no nodeId rewriting)
        # ─────────────────────────────────────────────────────────
        normalized_groups, normalize_warnings = normalize_meta_inputs(ops_spec_groups)

        # Preserve pre-schedule grammar for logging/debug
        pre_schedule_groups = {k: [op.model_copy() for op in v] for k, v in normalized_groups.items()}

        # ─────────────────────────────────────────────────────────
        # Schedule grammar (phase/parallel hints injected into meta.view)
        # ─────────────────────────────────────────────────────────
        scheduled_groups = schedule_ops_spec(normalized_groups)

        # ─────────────────────────────────────────────────────────
        # Draw Plan
        # ─────────────────────────────────────────────────────────
        draw_plan_warnings: List[str] = []
        draw_plan_warnings.extend(draw_mode_notes)
        draw_plan_warnings.extend(draw_policy_notes)
        if draw_plan_mode in {"validate", "export"}:
            try:
                draw_ops_spec_raw = build_draw_ops_spec(
                    ops_spec=scheduled_groups,
                    chart_context=chart_context,
                    data_rows=data_rows,
                    vega_lite_spec=vega_lite_spec,
                )
                draw_ops_spec = validate_draw_groups_payload(draw_ops_spec_raw)
                draw_debug: Dict[str, Any] = {
                    "mode": draw_plan_mode,
                    "groups": {k: len(v) for k, v in draw_ops_spec.items()},
                    "draw_ops_spec": draw_ops_spec,
                }
                if draw_plan_mode == "export":
                    draw_plan_path = export_draw_plan_to_public(draw_ops_spec, request_id=request_id)
                    draw_debug["path"] = str(draw_plan_path)
                    trace_logger.info(
                        "[request:%s] draw_plan_exported | groups=%d path=%s",
                        request_id,
                        len(draw_ops_spec),
                        str(draw_plan_path),
                    )
                else:
                    trace_logger.info(
                        "[request:%s] draw_plan_validated | groups=%d",
                        request_id,
                        len(draw_ops_spec),
                    )
                debug_payloads["draw_plan"] = draw_debug
            except Exception as exc:
                err = f"draw plan {draw_plan_mode} failed: {exc}"
                debug_payloads["draw_plan"] = {"mode": draw_plan_mode, "error": str(exc)}
                if draw_failure_policy == "raise":
                    debug_payloads["error"] = {
                        "stage": "draw_plan_failed",
                        "mode": draw_plan_mode,
                        "error": str(exc),
                    }
                    debug_payloads["steps"] = steps_debug
                    _attach_trace_md()
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(f"{err} (debug_bundle={session_dir})") from exc
                draw_plan_warnings.append(err)
                trace_logger.warning("[request:%s] draw_plan_failed | error=%s", request_id, str(exc))

        # ─────────────────────────────────────────────────────────
        # Collect warnings + trace
        # ─────────────────────────────────────────────────────────
        all_warnings: List[str] = []
        all_warnings.extend(context_warnings)
        all_warnings.extend(list(inventory_payload.get("warnings") or []))
        all_warnings.extend(inventory_retry_notes)
        all_warnings.extend(step_retry_notes)
        all_warnings.extend(normalize_warnings)
        all_warnings.extend(draw_plan_warnings)

        trace: RecursivePipelineTrace | None = None
        if debug:
            trace = RecursivePipelineTrace(
                context_built={
                    "chart_context": chart_context.model_dump(mode="json"),
                    "context_warnings": context_warnings,
                    "rows_preview_count": len(rows_preview),
                },
                inventory={
                    "tasks_count": len(tasks),
                    "tasks": [t.model_dump(mode="json") for t in tasks],
                    "warnings": list(inventory_payload.get("warnings") or []),
                    "retry_notes": inventory_retry_notes,
                },
                steps=step_traces,
                finalized={
                    "groups": {key: len(value) for key, value in scheduled_groups.items()},
                    "warnings": normalize_warnings,
                },
            )

        result = GenerateOpsSpecResponse(
            ops_spec=scheduled_groups,
            chart_context=chart_context,
            warnings=all_warnings,
            trace=trace,
        )

        # 성공 시에도 항상 debug 번들 저장 (debug=True/False 무관).
        # debug=True 인 경우에만 draw_plan/trace 객체가 API 응답에 포함됨.
        debug_payloads["steps"] = steps_debug
        debug_payloads["final_grammar"] = result.model_dump(mode="json", by_alias=True)
        debug_payloads["human_abstracted_ops_spec"] = _build_human_abstracted_ops_spec(
            debug_payloads["final_grammar"].get("ops_spec", {})
        )
        debug_payloads["pre_schedule_grammar"] = {
            group: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
            for group, ops in pre_schedule_groups.items()
        }
        _attach_trace_md()
        session_dir = _persist_debug_bundle(debug_payloads)
        trace_logger.info("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
        return result
