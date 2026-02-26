"""
Module-2: Chart-Grounded Resolution

DataDive 원칙("LLM은 생성에, symbolic method는 그라운딩에")에 따라
4-step 서브프로세스로 plan_tree를 chart_context에 대해 안정적으로 그라운딩한다.

Step 1: Deterministic Token Resolution  — @token → 구체적 필드명 (LLM 불필요)
Step 2: Multi-Strategy Value Resolution — exact → case-insensitive → fuzzy (LLM 불필요)
Step 3: LLM-Assisted Disambiguation    — 잔여 모호성만 LLM 처리 (조건부 호출)
Step 4: Domain Validation              — 결과 검증 (LLM 불필요)
"""

from __future__ import annotations

import copy
import difflib
import json
from string import Template
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..core.models import ChartContext, GroundedPlanTree
from ..validation.resolve_validators import find_unresolved_tokens, validate_grounded_plan
from ..core.types import JsonValue


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Output Model (Step 3 LLM 응답 스키마)
# ─────────────────────────────────────────────────────────────────────────────

class ResolveOutput(BaseModel):
    grounded_plan_tree: GroundedPlanTree
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Deterministic Token Resolution
# ─────────────────────────────────────────────────────────────────────────────

def _replace_tokens(obj: Any, token_map: Dict[str, str]) -> Any:
    """dict/list/str 구조에서 role token을 재귀적으로 치환."""
    if isinstance(obj, str):
        return token_map.get(obj, obj)
    if isinstance(obj, dict):
        return {k: _replace_tokens(v, token_map) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_tokens(item, token_map) for item in obj]
    return obj


def _resolve_role_tokens(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Step 1: @primary_measure / @primary_dimension / @series_field
            → chart_context의 구체적 필드명으로 결정론적 치환.
    """
    token_map: Dict[str, str] = {
        "@primary_measure": chart_context.primary_measure,
        "@primary_dimension": chart_context.primary_dimension,
    }
    if chart_context.series_field:
        token_map["@series_field"] = chart_context.series_field

    resolved = _replace_tokens(copy.deepcopy(plan_tree), token_map)

    warnings: List[str] = []
    remaining = find_unresolved_tokens(resolved)
    if remaining:
        warnings.append(
            f"@series_field 토큰이 남아 있지만 chart_context.series_field가 None입니다: "
            f"{sorted(set(remaining))}"
        )
    return resolved, warnings


# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Multi-Strategy Value Resolution
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_single_value(
    value: str,
    domain: List[Any],
) -> Tuple[str, Optional[str]]:
    """
    단일 값에 대해 다중 전략으로 도메인 매칭 시도.
    반환: (resolved_value, strategy: "exact"|"case_insensitive"|"fuzzy"|None)
    """
    domain_str = [str(v) for v in domain]
    if not domain_str:
        return value, None

    # 전략 1: Exact match
    if value in domain_str:
        return value, "exact"

    # 전략 2: Case-insensitive
    value_lower = value.lower()
    for d in domain_str:
        if d.lower() == value_lower:
            return d, "case_insensitive"

    # 전략 3: Fuzzy (stdlib difflib; 외부 의존성 없음, cutoff=0.8)
    matches = difflib.get_close_matches(value, domain_str, n=1, cutoff=0.8)
    if matches:
        return matches[0], "fuzzy"

    return value, None


def _resolve_params_values(
    params: Dict[str, Any],
    chart_context: ChartContext,
    node_id: str,
) -> Tuple[Dict[str, Any], List[str]]:
    """노드 params 내 도메인 값을 다중 전략으로 해결."""
    warnings: List[str] = []
    resolved = dict(params)

    field = params.get("field")
    if not isinstance(field, str):
        field = None

    # params.group → series domain 매칭
    group_val = params.get("group")
    if isinstance(group_val, str) and group_val and chart_context.series_field:
        domain = list(chart_context.categorical_values.get(chart_context.series_field, []))
        resolved_v, strategy = _resolve_single_value(group_val, domain)
        if strategy and strategy != "exact":
            warnings.append(
                f'[step2] node {node_id}: group="{group_val}" → "{resolved_v}" ({strategy})'
            )
        resolved["group"] = resolved_v

    # params.include / params.exclude → field 의 categorical domain 매칭
    for param_key in ("include", "exclude"):
        vals = params.get(param_key)
        if not isinstance(vals, list):
            continue
        domain = []
        if field and field in chart_context.categorical_values:
            domain = list(chart_context.categorical_values[field])
        if not domain:
            continue
        new_vals: List[Any] = []
        for v in vals:
            if not isinstance(v, str):
                new_vals.append(v)
                continue
            resolved_v, strategy = _resolve_single_value(v, domain)
            if strategy and strategy != "exact":
                warnings.append(
                    f'[step2] node {node_id}: {param_key}="{v}" → "{resolved_v}" ({strategy})'
                )
            new_vals.append(resolved_v)
        resolved[param_key] = new_vals

    return resolved, warnings


def _resolve_values(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    """Step 2: 모든 plan node에 대해 다중 전략 값 해결."""
    plan = copy.deepcopy(plan_tree)
    nodes = plan.get("nodes") or []
    all_warnings: List[str] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("nodeId", "?"))
        params = node.get("params")
        if not isinstance(params, dict):
            continue
        resolved_params, node_warnings = _resolve_params_values(params, chart_context, node_id)
        node["params"] = resolved_params
        all_warnings.extend(node_warnings)

    plan["nodes"] = nodes
    return plan, all_warnings


# ─────────────────────────────────────────────────────────────────────────────
# Step 3: LLM-Assisted Disambiguation (조건부 호출)
# ─────────────────────────────────────────────────────────────────────────────

def _has_unresolved_domain_values(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> bool:
    """Step 1-2 이후에도 도메인 매칭이 안 된 값이 남아 있는지 확인."""
    nodes = (plan_tree.get("nodes") or []) if isinstance(plan_tree, dict) else []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        params = node.get("params") or {}
        if not isinstance(params, dict):
            continue
        field = params.get("field")

        # group 값이 series domain에 없으면 LLM 필요
        group_val = params.get("group")
        if isinstance(group_val, str) and group_val and chart_context.series_field:
            series_strs = [
                str(v)
                for v in chart_context.categorical_values.get(chart_context.series_field, [])
            ]
            if group_val not in series_strs:
                return True

        # include/exclude 값이 field domain에 없으면 LLM 필요
        for param_key in ("include", "exclude"):
            vals = params.get(param_key)
            if not isinstance(vals, list):
                continue
            domain = []
            if isinstance(field, str) and field in chart_context.categorical_values:
                domain = [str(v) for v in chart_context.categorical_values[field]]
            if not domain:
                continue
            for v in vals:
                if isinstance(v, str) and v not in domain:
                    return True
    return False


def _llm_disambiguate(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
    rows_preview: List[Dict[str, JsonValue]],
    validation_feedback: Optional[List[str]],
) -> Dict[str, Any]:
    """Step 3: 잔여 모호성만 LLM에게 전달해 해결."""
    validation_feedback = validation_feedback or []
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        plan_tree_json=json.dumps(plan_tree, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(
            chart_context.model_dump(mode="json"), ensure_ascii=True, indent=2
        ),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are Module-2 (Chart-Grounded Resolution). "
        "Resolve remaining ambiguous value references using chart context. "
        "Preserve all deterministically resolved fields and refs. Return strict JSON only."
    )
    return llm.complete(
        response_model=ResolveOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_resolve",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public Entry Point
# ─────────────────────────────────────────────────────────────────────────────

def run_resolve_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    plan_tree: Dict[str, JsonValue],
    chart_context: ChartContext,
    rows_preview: List[Dict[str, JsonValue]],
    validation_feedback: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Chart-Grounded Resolution: 4-step sub processes.

    Step 1: Deterministic token resolution  — @token → 구체적 필드명
    Step 2: Multi-strategy value resolution — exact → case-insensitive → fuzzy
    Step 3: LLM disambiguation             — 잔여 모호성만 LLM 처리 (조건부)
    Step 4: Domain validation              — 결과 검증

    반환 dict 키:
      - grounded_plan_tree: Dict  (GroundedPlanTree 호환 구조)
      - warnings: List[str]
      - llm_called: bool          (디버깅: Step 3 LLM 호출 여부)
      - _debug_steps: Dict        (디버그 번들용 단계별 스냅샷)
    """
    plan_tree_dict = dict(plan_tree)

    # Step 1: Token resolution
    after_step1, step1_warnings = _resolve_role_tokens(plan_tree_dict, chart_context)

    # Step 2: Value resolution
    after_step2, step2_warnings = _resolve_values(after_step1, chart_context)

    # Step 3: LLM disambiguation
    llm_called = False
    llm_warnings: List[str] = []
    resolved_tree_dict: Dict[str, Any]

    if _has_unresolved_domain_values(after_step2, chart_context):
        llm_result = _llm_disambiguate(
            llm=llm,
            prompt_template=prompt_template,
            shared_rules=shared_rules,
            plan_tree=after_step2,
            chart_context=chart_context,
            rows_preview=rows_preview,
            validation_feedback=validation_feedback,
        )
        resolved_tree_dict = llm_result.get("grounded_plan_tree") or after_step2
        llm_warnings = llm_result.get("warnings") or []
        llm_called = True
    else:
        # 결정론적 해결 완료 → LLM 호출 스킵
        resolved_tree_dict = after_step2

    # resolved_tree_dict가 Pydantic model이면 dict로 변환
    if hasattr(resolved_tree_dict, "model_dump"):
        resolved_tree_dict = resolved_tree_dict.model_dump(mode="json")

    # Step 4: Domain validation (결정론적)
    _, step4_warnings, errors = validate_grounded_plan(resolved_tree_dict, chart_context)
    if errors:
        raise ValueError(
            "Resolve domain validation failed:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

    # 단계별 prefix를 붙여 warnings 집계
    prefixed_warnings: List[str] = (
        [f"[step1] {w}" for w in step1_warnings]
        + [f"[step2] {w}" for w in step2_warnings]
        + ([f"[step3_llm] {w}" for w in llm_warnings] if llm_called else [])
        + [f"[step4] {w}" for w in step4_warnings]
    )

    return {
        "grounded_plan_tree": resolved_tree_dict,
        "warnings": prefixed_warnings,
        "llm_called": llm_called,
        # 디버그 번들용 단계별 스냅샷
        "_debug_steps": {
            "step1_token_resolved": after_step1,
            "step2_value_resolved": after_step2,
            "step3_llm_called": llm_called,
        },
    }
