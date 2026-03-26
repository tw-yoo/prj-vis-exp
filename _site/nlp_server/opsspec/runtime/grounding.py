from __future__ import annotations

import copy
import difflib
from typing import Any, Dict, List, Optional, Tuple

from ..core.models import ChartContext


def _replace_tokens(obj: Any, token_map: Dict[str, str]) -> Any:
    if isinstance(obj, str):
        return token_map.get(obj, obj)
    if isinstance(obj, list):
        return [_replace_tokens(item, token_map) for item in obj]
    if isinstance(obj, dict):
        return {k: _replace_tokens(v, token_map) for k, v in obj.items()}
    return obj


def resolve_role_tokens(op_spec: Dict[str, Any], chart_context: ChartContext) -> Tuple[Dict[str, Any], List[str]]:
    token_map: Dict[str, str] = {
        "@primary_measure": chart_context.primary_measure,
        "@primary_dimension": chart_context.primary_dimension,
    }
    if chart_context.series_field:
        token_map["@series_field"] = chart_context.series_field

    resolved = _replace_tokens(copy.deepcopy(op_spec), token_map)
    warnings: List[str] = []
    if "@series_field" in str(op_spec) and not chart_context.series_field:
        warnings.append("@series_field token appears but chart_context.series_field is None.")
    return resolved, warnings


def _resolve_single_value(value: str, domain: List[Any]) -> Tuple[str, Optional[str]]:
    domain_str = [str(v) for v in domain]
    if not domain_str:
        return value, None

    if value in domain_str:
        return value, "exact"

    value_lower = value.lower()
    for d in domain_str:
        if d.lower() == value_lower:
            return d, "case_insensitive"

    matches = difflib.get_close_matches(value, domain_str, n=1, cutoff=0.8)
    if matches:
        return matches[0], "fuzzy"
    return value, None


def _normalize_str_list(values: Any) -> List[str]:
    if isinstance(values, list):
        out: List[str] = []
        for item in values:
            if isinstance(item, str):
                s = item.strip()
                if s:
                    out.append(s)
        return out
    if isinstance(values, str) and values.strip():
        return [values.strip()]
    return []


def resolve_domain_values(
    op_spec: Dict[str, Any],
    *,
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Deterministically normalize domain values in the op spec using chart_context:
    - group/groupA/groupB against series_field domain
    - include/exclude against categorical domain for op_spec.field (when available)
    - target/targetA/targetB against primary_dimension domain (when available)

    Strategy: exact -> case-insensitive -> fuzzy(difflib cutoff=0.8)
    """
    updated = copy.deepcopy(op_spec)
    warnings: List[str] = []

    series_domain: List[Any] = []
    series_field_for_group: Optional[str] = None
    raw_series_field = updated.get("seriesField")
    if isinstance(raw_series_field, str) and raw_series_field in chart_context.categorical_values:
        series_field_for_group = raw_series_field
    elif chart_context.series_field:
        series_field_for_group = chart_context.series_field
    if series_field_for_group:
        series_domain = list(chart_context.categorical_values.get(series_field_for_group, []))

    def _resolve_series_value(key: str) -> None:
        raw = updated.get(key)
        if not series_domain:
            return
        if isinstance(raw, str):
            if not raw.strip() or raw.startswith("ref:"):
                return
            resolved, strategy = _resolve_single_value(raw, series_domain)
            if strategy and strategy != "exact":
                warnings.append(f'{key}="{raw}" -> "{resolved}" ({strategy})')
            updated[key] = resolved
            return
        if key == "group" and isinstance(raw, list):
            resolved_list: List[Any] = []
            for entry in raw:
                if not isinstance(entry, str):
                    resolved_list.append(entry)
                    continue
                token = entry.strip()
                if not token or token.startswith("ref:"):
                    resolved_list.append(entry)
                    continue
                resolved, strategy = _resolve_single_value(token, series_domain)
                if strategy and strategy != "exact":
                    warnings.append(f'{key}="{entry}" -> "{resolved}" ({strategy})')
                resolved_list.append(resolved)
            updated[key] = resolved_list

    for k in ("group", "groupA", "groupB"):
        _resolve_series_value(k)

    field = updated.get("field")
    if isinstance(field, str) and field in chart_context.categorical_values:
        domain = list(chart_context.categorical_values.get(field, []))
        for list_key in ("include", "exclude"):
            raw_list = updated.get(list_key)
            if not isinstance(raw_list, list):
                continue
            new_list: List[Any] = []
            for entry in raw_list:
                if not isinstance(entry, str) or not entry.strip() or entry.startswith("ref:"):
                    new_list.append(entry)
                    continue
                resolved, strategy = _resolve_single_value(entry, domain)
                if strategy and strategy != "exact":
                    warnings.append(f'{list_key}="{entry}" -> "{resolved}" ({strategy})')
                new_list.append(resolved)
            updated[list_key] = new_list

    dim_domain: List[Any] = list(chart_context.categorical_values.get(chart_context.primary_dimension, []))

    def _resolve_dim_value(key: str) -> None:
        raw = updated.get(key)
        if not dim_domain:
            return
        if isinstance(raw, str):
            if not raw.strip() or raw.startswith("ref:"):
                return
            resolved, strategy = _resolve_single_value(raw, dim_domain)
            if strategy and strategy != "exact":
                warnings.append(f'{key}="{raw}" -> "{resolved}" ({strategy})')
            updated[key] = resolved
            return
        if isinstance(raw, list):
            new_list: List[Any] = []
            for entry in raw:
                if not isinstance(entry, str) or not entry.strip() or entry.startswith("ref:"):
                    new_list.append(entry)
                    continue
                resolved, strategy = _resolve_single_value(entry, dim_domain)
                if strategy and strategy != "exact":
                    warnings.append(f'{key}="{entry}" -> "{resolved}" ({strategy})')
                new_list.append(resolved)
            updated[key] = new_list

    for k in ("target", "targetA", "targetB"):
        _resolve_dim_value(k)

    return updated, warnings


def _normalize_field_name(
    raw_field: Any,
    chart_context: ChartContext,
) -> Tuple[Any, Optional[str]]:
    """
    field 이름을 case-insensitive로 chart_context.fields 키에서 찾아 정규화.
    정확히 매칭되면 그대로 반환. 대소문자 불일치 시 canonical name + warning 반환.
    매칭 안 되면 원본 반환 (validator에서 에러 처리).
    """
    if not isinstance(raw_field, str):
        return raw_field, None
    if raw_field in chart_context.fields:
        return raw_field, None
    lower = raw_field.lower()
    for canonical in chart_context.fields:
        if canonical.lower() == lower:
            return canonical, f'field "{raw_field}" normalized to "{canonical}" (case mismatch)'
    return raw_field, None


def _normalize_field_like_key(
    payload: Dict[str, Any],
    *,
    key: str,
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    if key not in payload:
        return payload, []
    raw = payload.get(key)
    if not isinstance(raw, str):
        return payload, []
    if raw in chart_context.fields:
        return payload, []
    lower = raw.lower()
    for canonical in chart_context.fields:
        if canonical.lower() == lower:
            out = dict(payload)
            out[key] = canonical
            return out, [f'{key} "{raw}" normalized to "{canonical}" (case mismatch)']
    return payload, []


def ground_op_spec(
    op_spec: Dict[str, Any],
    *,
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    token_resolved, token_warnings = resolve_role_tokens(op_spec, chart_context)

    # domain resolution 전에 field 이름 대소문자 정규화.
    # (resolve_domain_values가 field 키로 categorical_values를 조회하므로 먼저 정규화해야 함)
    field_normalized = dict(token_resolved)
    field_warnings: List[str] = []
    if "field" in field_normalized:
        normalized_field, warn = _normalize_field_name(field_normalized["field"], chart_context)
        if warn:
            field_warnings.append(warn)
            field_normalized["field"] = normalized_field

    # pairDiff / compare 계열의 field-like 키 정규화(by, seriesField)
    field_normalized, by_warnings = _normalize_field_like_key(
        field_normalized, key="by", chart_context=chart_context
    )
    field_warnings.extend(by_warnings)
    field_normalized, series_warnings = _normalize_field_like_key(
        field_normalized, key="seriesField", chart_context=chart_context
    )
    field_warnings.extend(series_warnings)

    domain_resolved, domain_warnings = resolve_domain_values(field_normalized, chart_context=chart_context)
    return domain_resolved, token_warnings + field_warnings + domain_warnings
