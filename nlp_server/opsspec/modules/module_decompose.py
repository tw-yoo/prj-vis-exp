from __future__ import annotations

import json
import re
from string import Template
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..core.models import PlanTree
from ..core.types import JsonValue


class DecomposeOutput(BaseModel):
    plan_tree: PlanTree
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\\s+")


def _split_explanation_sentences(explanation: str) -> List[str]:
    text = " ".join(explanation.strip().split())
    if not text:
        return []
    parts = _SENTENCE_SPLIT_RE.split(text)
    out: List[str] = []
    for part in parts:
        s = part.strip()
        if s:
            out.append(s)
    return out or [text]


def run_decompose_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    question: str,
    explanation: str,
    chart_context: Dict[str, JsonValue],
    roles_summary: Dict[str, JsonValue],
    series_domain: List[JsonValue],
    measure_fields: List[str],
    rows_preview: List[Dict[str, JsonValue]],
    validation_feedback: Optional[List[str]] = None,
) -> Dict[str, Any]:
    validation_feedback = validation_feedback or []
    explanation_sentences = _split_explanation_sentences(explanation)
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        question=question,
        explanation=explanation,
        explanation_sentences_json=json.dumps(explanation_sentences, ensure_ascii=True, indent=2),
        roles_summary_json=json.dumps(roles_summary, ensure_ascii=True, indent=2),
        series_domain_json=json.dumps(series_domain, ensure_ascii=True, indent=2),
        measure_fields_json=json.dumps(measure_fields, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are Module-1 (Explanation Decomposition). "
        "Step 1: Analyze the question and align each explanation sentence to the goal. "
        "Step 2: Synthesize the minimal plan tree from that analysis. "
        "Return strict JSON with plan_tree only."
    )
    return llm.complete(
        response_model=DecomposeOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_decompose",
    )
