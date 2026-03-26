from __future__ import annotations

import hashlib
import json
import re
from string import Template
from typing import Any, Dict, List, Optional

from ..core.llm import StructuredLLMClient
from ..core.recursive_models import OpInventory
from ..core.types import JsonValue


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_NUMBERED_STEP_RE = re.compile(r"(?:^|\n)\s*(\d+)\.\s*")
_BULLET_PREFIX_RE = re.compile(r"^\s*[-*]\s*")
_BETWEEN_RANGE_RE = re.compile(
    r"\bbetween\s+([0-9]{4}(?:\.[0-9]+)?)\s+and\s+([0-9]{4}(?:\.[0-9]+)?)\b",
    re.IGNORECASE,
)


def split_explanation_sentences(explanation: str) -> List[str]:
    raw = str(explanation or "").strip()
    if not raw:
        return []

    # Prefer explicit numbered steps when present:
    # "1. ...\n2. ...\n3. ..."
    numbered = list(_NUMBERED_STEP_RE.finditer(raw))
    if numbered:
        out: List[str] = []
        for idx, match in enumerate(numbered):
            start = match.end()
            end = numbered[idx + 1].start() if idx + 1 < len(numbered) else len(raw)
            chunk = raw[start:end].strip()
            if chunk:
                out.append(" ".join(chunk.split()))
        if out:
            return out

    # Then try line-based splitting (useful for bullet lists).
    if "\n" in raw:
        out = []
        for line in raw.splitlines():
            s = _BULLET_PREFIX_RE.sub("", line).strip()
            if s:
                out.append(" ".join(s.split()))
        if out:
            return out

    text = " ".join(raw.split())
    parts = _SENTENCE_SPLIT_RE.split(text)
    out: List[str] = []
    for part in parts:
        s = part.strip()
        if s:
            out.append(s)
    return out or [text]


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalize_year_token(value: str) -> str:
    text = str(value).strip()
    try:
        return str(int(float(text)))
    except Exception:
        return text


def _extract_between_ranges(text: str) -> List[str]:
    out: List[str] = []
    for match in _BETWEEN_RANGE_RE.finditer(str(text or "")):
        start = _normalize_year_token(match.group(1))
        end = _normalize_year_token(match.group(2))
        out.append(f"{start}..{end}")
    return out


def _build_range_mismatch_warning(question: str, explanation: str) -> Optional[str]:
    q_ranges = sorted(set(_extract_between_ranges(question)))
    e_ranges = sorted(set(_extract_between_ranges(explanation)))
    if not q_ranges or not e_ranges:
        return None
    if q_ranges == e_ranges:
        return None
    return (
        "question/explanation range mismatch detected: "
        f"question={q_ranges}, explanation={e_ranges}. "
        "Pipeline continues, but this may reduce inventory/step consistency."
    )


def render_inventory_prompt(
    *,
    prompt_template: str,
    shared_rules: str,
    question: str,
    explanation: str,
    explanation_sentences: List[str],
    chart_context: Dict[str, JsonValue],
    roles_summary: Dict[str, JsonValue],
    series_domain: List[JsonValue],
    measure_fields: List[str],
    rows_preview: List[Dict[str, JsonValue]],
    ops_contract: Dict[str, Any],
    validation_feedback: List[str],
    few_shot_examples: str,
) -> str:
    return Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        question=question,
        explanation=explanation,
        explanation_sentences_json=json.dumps(explanation_sentences, ensure_ascii=True, indent=2),
        roles_summary_json=json.dumps(roles_summary, ensure_ascii=True, indent=2),
        series_domain_json=json.dumps(series_domain, ensure_ascii=True, indent=2),
        measure_fields_json=json.dumps(measure_fields, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
        ops_contract_json=json.dumps(ops_contract, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
        few_shot_examples=few_shot_examples,
    )


def run_inventory_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    prompt_path: str,
    shared_rules: str,
    shared_rules_path: str,
    question: str,
    explanation: str,
    chart_context: Dict[str, JsonValue],
    roles_summary: Dict[str, JsonValue],
    series_domain: List[JsonValue],
    measure_fields: List[str],
    rows_preview: List[Dict[str, JsonValue]],
    ops_contract: Dict[str, Any],
    validation_feedback: Optional[List[str]] = None,
    few_shot_examples: str = "",
    include_debug_prompts: bool = False,
) -> Dict[str, Any]:
    validation_feedback = validation_feedback or []
    explanation_sentences = split_explanation_sentences(explanation)
    user_prompt = render_inventory_prompt(
        prompt_template=prompt_template,
        shared_rules=shared_rules,
        question=question,
        explanation=explanation,
        explanation_sentences=explanation_sentences,
        chart_context=chart_context,
        roles_summary=roles_summary,
        series_domain=series_domain,
        measure_fields=measure_fields,
        rows_preview=rows_preview,
        ops_contract=ops_contract,
        validation_feedback=validation_feedback,
        few_shot_examples=few_shot_examples,
    )
    system_prompt = (
        "You are the Inventory module. "
        "Extract a minimal set of operation tasks mentioned in the explanation. "
        "Return strict JSON only."
    )
    parsed = llm.complete(
        response_model=OpInventory,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        task_name="opsspec_inventory",
    )
    range_warning = _build_range_mismatch_warning(question, explanation)
    if range_warning:
        warnings = parsed.get("warnings")
        if not isinstance(warnings, list):
            warnings = []
        if range_warning not in warnings:
            warnings.append(range_warning)
        parsed["warnings"] = warnings
    if include_debug_prompts:
        parsed["_debug"] = {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "prompt_path": prompt_path,
            "prompt_sha256": _sha256_text(prompt_template),
            "shared_rules_path": shared_rules_path,
            "shared_rules_sha256": _sha256_text(shared_rules),
        }
    return parsed
