from __future__ import annotations

import json
from string import Template
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..specs.union import OperationSpec


class SpecifyOutput(BaseModel):
    ops_spec: Dict[str, List[OperationSpec]] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


def run_specify_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    grounded_plan_tree: Dict[str, Any],
    chart_context: Dict[str, Any],
    ops_contract: Dict[str, Any],
    validation_feedback: Optional[List[str]] = None,
) -> Dict[str, Any]:
    validation_feedback = validation_feedback or []
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        grounded_plan_tree_json=json.dumps(grounded_plan_tree, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        ops_contract_json=json.dumps(ops_contract, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are Module-3 (Grammar Specification). "
        "Synthesize the grounded plan into a precise, executable OpsSpec grammar. "
        "Each plan node must produce exactly one OperationSpec with correct schema. "
        "Use legacy ops + setOp only. Return strict JSON."
    )
    return llm.complete(
        response_model=SpecifyOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_specify",
    )
