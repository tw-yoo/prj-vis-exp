from __future__ import annotations

import hashlib
import json
from string import Template
from typing import Any, Dict, List, Optional

from ..core.llm import StructuredLLMClient
from ..core.recursive_models import StepComposeOutput
from ..core.types import JsonValue


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def render_step_compose_prompt(
    *,
    prompt_template: str,
    shared_rules: str,
    question: str,
    explanation: str,
    current_task: Dict[str, JsonValue],
    remaining_tasks: List[Dict[str, JsonValue]],
    available_nodes: List[Dict[str, JsonValue]],
    chart_context: Dict[str, JsonValue],
    rows_preview: List[Dict[str, JsonValue]],
    ops_contract: Dict[str, Any],
    validation_feedback: List[str],
    few_shot_examples: str,
) -> str:
    return Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        question=question,
        explanation=explanation,
        current_task_json=json.dumps(current_task, ensure_ascii=True, indent=2),
        remaining_tasks_json=json.dumps(remaining_tasks, ensure_ascii=True, indent=2),
        available_nodes_json=json.dumps(available_nodes, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
        ops_contract_json=json.dumps(ops_contract, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
        few_shot_examples=few_shot_examples,
    )


def run_step_compose_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    prompt_path: str,
    shared_rules: str,
    shared_rules_path: str,
    question: str,
    explanation: str,
    current_task: Dict[str, JsonValue],
    remaining_tasks: List[Dict[str, JsonValue]],
    available_nodes: List[Dict[str, JsonValue]],
    chart_context: Dict[str, JsonValue],
    rows_preview: List[Dict[str, JsonValue]],
    ops_contract: Dict[str, Any],
    validation_feedback: Optional[List[str]] = None,
    few_shot_examples: str = "",
    include_debug_prompts: bool = False,
) -> Dict[str, Any]:
    validation_feedback = validation_feedback or []
    user_prompt = render_step_compose_prompt(
        prompt_template=prompt_template,
        shared_rules=shared_rules,
        question=question,
        explanation=explanation,
        current_task=current_task,
        remaining_tasks=remaining_tasks,
        available_nodes=available_nodes,
        chart_context=chart_context,
        rows_preview=rows_preview,
        ops_contract=ops_contract,
        validation_feedback=validation_feedback,
        few_shot_examples=few_shot_examples,
    )
    system_prompt = (
        "You are the Step-Compose module. "
        "The pipeline already selected the current task. "
        "Propose exactly one operation spec for that task. "
        "Return strict JSON only."
    )
    parsed = llm.complete(
        response_model=StepComposeOutput,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        task_name="opsspec_step_compose",
    )
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
