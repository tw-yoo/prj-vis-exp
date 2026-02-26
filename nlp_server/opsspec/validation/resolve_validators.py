from __future__ import annotations

from typing import Any, Dict, List, Tuple

from ..core.models import ChartContext

# 역할 토큰 집합: Step 1(토큰 해결) 이후 잔류하면 안 됨
_ROLE_TOKENS = {"@primary_measure", "@primary_dimension", "@series_field"}


def _collect_strings(obj: Any, into: List[str]) -> None:
    """dict/list/str 구조에서 모든 문자열 리프를 재귀적으로 수집."""
    if isinstance(obj, str):
        into.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect_strings(v, into)
    elif isinstance(obj, list):
        for item in obj:
            _collect_strings(item, into)


def find_unresolved_tokens(plan_tree: Dict[str, Any]) -> List[str]:
    """plan_tree 내에 아직 남아 있는 @token 문자열 목록을 반환."""
    strings: List[str] = []
    _collect_strings(plan_tree, strings)
    return [s for s in strings if s in _ROLE_TOKENS]


def validate_grounded_plan(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """
    그라운딩된 plan_tree를 chart_context에 대해 검증.

    반환값: (plan_tree, warnings, errors)

    Hard errors (ValueError를 raise하는 조건):
      1. 미해결 @token 잔류
      2. params.field가 chart_context.fields에 없음
      3. ref:nX 참조가 존재하지 않는 nodeId를 가리킴
      4. inputs에 알 수 없는 nodeId 포함

    Soft warnings (경고만 발행):
      5. aggregate op의 field가 measure_fields에 없음
      6. group 값이 series domain에 없음
      7. include/exclude 값이 field의 categorical domain에 없음
    """
    warnings: List[str] = []
    errors: List[str] = []

    nodes = (plan_tree.get("nodes") or []) if isinstance(plan_tree, dict) else []

    # 알려진 nodeId 집합
    known_ids = {
        n["nodeId"]
        for n in nodes
        if isinstance(n, dict) and isinstance(n.get("nodeId"), str)
    }

    # series domain 캐시
    series_domain_strs: List[str] = []
    if chart_context.series_field:
        series_domain_strs = [
            str(v)
            for v in chart_context.categorical_values.get(chart_context.series_field, [])
        ]

    # 1. 미해결 @token 검사
    unresolved = find_unresolved_tokens(plan_tree)
    if unresolved:
        errors.append(
            f"미해결 역할 토큰이 남아 있음: {sorted(set(unresolved))}. "
            "모든 @token은 실제 필드명/값으로 치환돼야 합니다."
        )

    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"nodes[{idx}]: 객체여야 합니다.")
            continue

        node_id = node.get("nodeId", f"nodes[{idx}]")
        params = node.get("params") or {}
        if not isinstance(params, dict):
            continue

        field = params.get("field")

        # 2. field 존재 검사
        if isinstance(field, str) and field and field not in chart_context.fields:
            errors.append(
                f'node {node_id}: params.field="{field}"이 '
                f"chart_context.fields {chart_context.fields}에 없습니다."
            )

        # 5. aggregate op 필드는 measure여야 함 (warning)
        op = node.get("op", "")
        if op in ("average", "sum") and isinstance(field, str) and field:
            if field not in chart_context.measure_fields:
                warnings.append(
                    f'node {node_id}: op="{op}"의 field="{field}"이 '
                    f"measure_fields {chart_context.measure_fields}에 없습니다."
                )

        # 6. group 값이 series domain에 있는지 (warning)
        group_val = params.get("group")
        if isinstance(group_val, str) and group_val and series_domain_strs:
            if group_val not in series_domain_strs:
                warnings.append(
                    f'node {node_id}: group="{group_val}"이 '
                    f"series domain {series_domain_strs}에 없습니다."
                )

        # 7. include/exclude 값이 categorical domain에 있는지 (warning)
        for list_param in ("include", "exclude"):
            vals = params.get(list_param)
            if not isinstance(vals, list):
                continue
            if isinstance(field, str) and field in chart_context.categorical_values:
                domain = [
                    str(v) for v in chart_context.categorical_values.get(field, [])
                ]
                domain_lower = {d.lower() for d in domain}
                for val in vals:
                    if isinstance(val, str) and val.lower() not in domain_lower:
                        warnings.append(
                            f'node {node_id}: {list_param}="{val}"이 '
                            f'categorical_values["{field}"] domain에 없습니다. '
                            "대소문자 정확도를 확인하세요."
                        )

        # 3. ref:nX 참조 유효성
        for param_key, param_val in params.items():
            if isinstance(param_val, str) and param_val.startswith("ref:"):
                ref_target = param_val[4:]
                if ref_target not in known_ids:
                    errors.append(
                        f'node {node_id}: params.{param_key}="{param_val}"이 '
                        f'알 수 없는 nodeId "{ref_target}"를 참조합니다.'
                    )

        # 4. inputs nodeId 유효성
        inputs = node.get("inputs") or []
        if isinstance(inputs, list):
            for inp in inputs:
                if isinstance(inp, str) and inp not in known_ids:
                    errors.append(
                        f'node {node_id}: inputs에 알 수 없는 nodeId "{inp}"이 포함됩니다.'
                    )

    return plan_tree, warnings, errors
