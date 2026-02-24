from __future__ import annotations

import json
from string import Template
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field

from .llm import StructuredLLMClient
from .models import GroundedPlanTree
from .types import JsonValue


class GroundOutput(BaseModel):
    grounded_plan_tree: GroundedPlanTree
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


def run_ground_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    plan_tree: Dict[str, JsonValue],
    chart_context: Dict[str, JsonValue],
    rows_preview: List[Dict[str, JsonValue]],
) -> Dict[str, Any]:
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        plan_tree_json=json.dumps(plan_tree, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are module-2 (ground). "
        "Resolve role tokens to concrete field/value/group using chart context. "
        "Return strict JSON only."
    )
    return llm.complete(
        response_model=GroundOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_ground",
    )
