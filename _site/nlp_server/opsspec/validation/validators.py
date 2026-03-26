from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..core.models import ChartContext
from ..runtime.op_registry import ALLOWED_OPS, LEGACY_NON_DRAW_OPS
from ..specs.add import AddOp
from ..specs.aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from ..specs.compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp, PairDiffOp
from ..specs.filter import FilterOp
from ..specs.range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from ..specs.scale import ScaleOp
from ..specs.set_op import SetOp
from ..specs.union import OperationSpec
from ..core.types import PrimitiveValue
from ..core.utils import to_float


def is_allowed_op(op_name: str) -> bool:
    return op_name in ALLOWED_OPS


_SENTENCE_LAYER_GROUP_RE = re.compile(r"^ops(?:\d+)?$")


def _sorted_unique(values: Iterable[PrimitiveValue]) -> List[PrimitiveValue]:
    unique: Dict[str, PrimitiveValue] = {}
    for value in values:
        key = f"{type(value).__name__}:{value}"
        if key not in unique:
            unique[key] = value
    return sorted(unique.values(), key=lambda item: str(item))


def _normalize_series_group_for_single_group_ops(
    *,
    raw_group: Any,
    chart_context: ChartContext,
    op_name: str,
) -> Optional[str]:
    if raw_group is None:
        return None
    if isinstance(raw_group, list):
        raise ValueError(
            f'{op_name}.group must be a single series value string (not list). '
            'For dimension subsets, use filter(include=[...]) then pass inputs=[<filter_node>].'
        )
    if not isinstance(raw_group, str):
        raise ValueError(f"{op_name}.group must be a string.")

    token = raw_group.strip()
    if not token:
        raise ValueError(f"{op_name}.group must be a non-empty string.")
    if _SENTENCE_LAYER_GROUP_RE.fullmatch(token):
        raise ValueError(
            f'{op_name}.group "{token}" is invalid: sentence-layer tokens (ops/ops2/...) are not series values.'
        )

    series_field = chart_context.series_field
    if not series_field:
        raise ValueError(
            f'{op_name}.group is invalid because chart_context.series_field is empty. '
            'For dimension subsets, use filter(include=[...]) and consume that node via inputs.'
        )

    series_domain = chart_context.categorical_values.get(series_field, [])
    if series_domain:
        domain_set = {str(v) for v in series_domain}
        if token not in domain_set:
            raise ValueError(
                f'{op_name}.group "{token}" is outside series domain for field "{series_field}". '
                'For dimension subsets, use filter(include=[...]) then inputs=[<filter_node>].'
            )
    return token


def _resolve_scalar_reference(raw: Any, runtime_scalars: Dict[str, float]) -> Tuple[Any, Optional[str]]:
    if isinstance(raw, dict) and isinstance(raw.get("id"), str):
        key = raw["id"]
        if key in runtime_scalars:
            return runtime_scalars[key], None
        return raw, f'Unknown scalar reference id: "{key}"'
    if isinstance(raw, str) and raw.startswith("ref:n"):
        key = raw[len("ref:") :]
        if key in runtime_scalars:
            return runtime_scalars[key], None
        return raw, f'Unknown scalar reference id: "{key}"'
    return raw, None


def _ensure_field_exists(field: str, chart_context: ChartContext) -> None:
    if field not in chart_context.fields:
        raise ValueError(f'Unknown field "{field}". Must be one of chart_context.fields.')


def _validate_include_exclude_domain(op: FilterOp, chart_context: ChartContext) -> None:
    if not op.field:
        return
    domain = chart_context.categorical_values.get(op.field)
    if not domain:
        return
    domain_set = {str(item) for item in domain}
    for value in op.include or []:
        if str(value) not in domain_set:
            raise ValueError(f'filter include value "{value}" is outside domain for field "{op.field}"')
    for value in op.exclude or []:
        if str(value) not in domain_set:
            raise ValueError(f'filter exclude value "{value}" is outside domain for field "{op.field}"')


def _normalize_group_selector(raw: Any) -> Optional[str | List[str]]:
    if raw is None:
        return None
    if isinstance(raw, str):
        token = raw.strip()
        if not token:
            raise ValueError("filter group must be a non-empty string")
        return token
    if isinstance(raw, list):
        if not raw:
            raise ValueError("filter group list must contain at least one value")
        out: List[str] = []
        for item in raw:
            if not isinstance(item, str):
                raise ValueError("filter group list must contain strings only")
            token = item.strip()
            if not token:
                raise ValueError("filter group list cannot contain empty strings")
            if token not in out:
                out.append(token)
        if not out:
            raise ValueError("filter group list must contain at least one non-empty value")
        return out
    raise ValueError("filter group must be a string or list of strings")


def _validate_group_domain(group: Optional[str | List[str]], chart_context: ChartContext) -> None:
    if not chart_context.series_field:
        return
    domain = chart_context.categorical_values.get(chart_context.series_field)
    if not domain:
        return
    domain_set = {str(item) for item in domain}
    values = [group] if isinstance(group, str) else list(group or [])
    for value in values:
        if value not in domain_set:
            raise ValueError(
                f'filter group value "{value}" is outside series domain for field "{chart_context.series_field}"'
            )


def _normalize_sum_group_selector(raw: Any) -> Optional[str | List[str]]:
    if raw is None:
        return None
    if isinstance(raw, str):
        token = raw.strip()
        if not token:
            raise ValueError("sum group must be a non-empty string")
        return token
    if isinstance(raw, list):
        if not raw:
            raise ValueError("sum group list must contain at least one value")
        out: List[str] = []
        for item in raw:
            if not isinstance(item, str):
                raise ValueError("sum group list must contain strings only")
            token = item.strip()
            if not token:
                raise ValueError("sum group list cannot contain empty strings")
            if token not in out:
                out.append(token)
        if not out:
            raise ValueError("sum group list must contain at least one non-empty value")
        return out
    raise ValueError("sum group must be a string or list of strings")


def _validate_sum_group_domain(group: Optional[str | List[str]], chart_context: ChartContext) -> None:
    if not chart_context.series_field or group is None:
        return
    domain = chart_context.categorical_values.get(chart_context.series_field)
    if not domain:
        return
    domain_set = {str(item) for item in domain}
    values = [group] if isinstance(group, str) else list(group)
    for value in values:
        if value not in domain_set:
            raise ValueError(
                f'sum group value "{value}" is outside series domain for field "{chart_context.series_field}"'
            )


def validate_filter_spec(
    op: FilterOp,
    *,
    chart_context: ChartContext,
    runtime_scalars: Optional[Dict[str, float]] = None,
) -> Tuple[FilterOp, List[str]]:
    warnings: List[str] = []

    # Canonicalize generic field tokens early.
    updated = op
    if updated.field == "value":
        updated = updated.model_copy(update={"field": chart_context.primary_measure})
        warnings.append(f'filter generic field "value" replaced with primary_measure "{chart_context.primary_measure}"')

    # Enforce semantic single-path rules to reduce equivalent representations:
    # - Do NOT filter on series_field directly; series restriction must be encoded via op.group.
    if chart_context.series_field and updated.field == chart_context.series_field:
        raise ValueError(
            f'filter on series_field "{chart_context.series_field}" is forbidden; '
            'restrict series via op.group="<series value>" or op.group=["A","B"] instead.'
        )

    normalized_group = _normalize_group_selector(updated.group)
    updated = updated.model_copy(update={"group": normalized_group})
    _validate_group_domain(normalized_group, chart_context)

    has_include = bool(updated.include)
    has_exclude = bool(updated.exclude)
    has_operator = bool(updated.operator)
    has_value = updated.value is not None

    membership_mode = has_include or has_exclude
    comparison_mode = has_operator or has_value
    group_only_mode = bool(updated.group) and not membership_mode and not comparison_mode

    if not membership_mode and not comparison_mode and not group_only_mode:
        raise ValueError('filter requires one mode: membership(include/exclude), comparison(operator/value), or group-only')
    if membership_mode and comparison_mode:
        raise ValueError("filter cannot mix membership(include/exclude) and comparison(operator/value)")
    if has_operator and not has_value:
        raise ValueError('filter requires "value" when "operator" is provided')
    if has_value and not has_operator:
        raise ValueError('filter requires "operator" when "value" is provided')

    if membership_mode or comparison_mode:
        if not updated.field:
            raise ValueError('filter field is required for membership/comparison modes')
        _ensure_field_exists(updated.field, chart_context)

    if membership_mode:
        field = updated.field or ""
        is_categorical = (
            chart_context.field_types.get(field) == "categorical"
            or field in chart_context.categorical_values
            or field in chart_context.dimension_fields
        )
        if not is_categorical:
            raise ValueError(f'filter membership mode requires categorical field, got "{field}"')

    if comparison_mode and updated.operator == "between":
        if not isinstance(updated.value, list) or len(updated.value) != 2:
            raise ValueError("filter between requires value=[start,end]")
        for boundary in updated.value:
            if not isinstance(boundary, (str, int, float)):
                raise ValueError("filter between requires scalar boundaries in value=[start,end]")
        domain = chart_context.categorical_values.get(updated.field or "")
        if domain:
            domain_set = {str(item) for item in domain}
            for boundary in updated.value:
                token = str(boundary)
                if token not in domain_set:
                    raise ValueError(
                        f'filter between boundary "{boundary}" is outside domain for field "{updated.field}"'
                    )
    # Non-between comparison filters must compare numeric measure values.
    elif comparison_mode and chart_context.measure_fields and updated.field not in chart_context.measure_fields:
        raise ValueError(f'filter comparison mode requires numeric measure field, got "{updated.field}"')

    if runtime_scalars is not None and comparison_mode and has_value:
        resolved, warn = _resolve_scalar_reference(updated.value, runtime_scalars)
        if warn:
            warnings.append(warn)
        else:
            updated = updated.model_copy(update={"value": resolved})

    if updated.include:
        updated = updated.model_copy(update={"include": _sorted_unique(updated.include)})
    if updated.exclude:
        updated = updated.model_copy(update={"exclude": _sorted_unique(updated.exclude)})

    _validate_include_exclude_domain(updated, chart_context)
    return updated, warnings


def _validate_numeric_aggregate_field(
    op: OperationSpec,
    *,
    chart_context: ChartContext,
) -> Tuple[OperationSpec, List[str]]:
    warnings: List[str] = []
    field = getattr(op, "field", None)
    if not field:
        field = chart_context.primary_measure
        warnings.append(f'{op.op} field defaulted to primary_measure "{field}"')
        op = op.model_copy(update={"field": field})
    if field == "value":
        field = chart_context.primary_measure
        warnings.append(f'{op.op} generic field "value" replaced with primary_measure "{field}"')
        op = op.model_copy(update={"field": field})
    _ensure_field_exists(field, chart_context)
    if chart_context.measure_fields and field not in chart_context.measure_fields:
        raise ValueError(f'{op.op} requires numeric measure field, got "{field}"')
    return op, warnings


def _pairdiff_candidate_series_fields(op: PairDiffOp, chart_context: ChartContext) -> List[str]:
    candidates: List[str] = []
    for field, domain in chart_context.categorical_values.items():
        domain_set = {str(v) for v in domain}
        if op.groupA in domain_set and op.groupB in domain_set:
            candidates.append(field)

    preferred = op.seriesField or chart_context.series_field
    if preferred and preferred in candidates:
        ordered = [preferred] + [x for x in candidates if x != preferred]
        return ordered
    return candidates


def _pick_pairdiff_by_field(chart_context: ChartContext, *, series_field: str) -> Optional[str]:
    dims = list(chart_context.dimension_fields or [])
    if not dims:
        return None

    if chart_context.primary_dimension in dims and chart_context.primary_dimension != series_field:
        return chart_context.primary_dimension
    for field in dims:
        if field != series_field:
            return field
    return None


def validate_operation(
    op: OperationSpec,
    *,
    chart_context: ChartContext,
    runtime_scalars: Optional[Dict[str, float]] = None,
) -> Tuple[OperationSpec, List[str]]:
    warnings: List[str] = []

    if not is_allowed_op(op.op):
        raise ValueError(f'Unsupported operation "{op.op}"')

    if isinstance(op, FilterOp):
        return validate_filter_spec(op, chart_context=chart_context, runtime_scalars=runtime_scalars)

    if isinstance(
        op,
        (
            AverageOp,
            CountOp,
            FindExtremumOp,
            SortOp,
            DetermineRangeOp,
            RetrieveValueOp,
            LagDiffOp,
            NthOp,
        ),
    ):
        normalized_group = _normalize_series_group_for_single_group_ops(
            raw_group=getattr(op, "group", None),
            chart_context=chart_context,
            op_name=op.op,
        )
        op = op.model_copy(update={"group": normalized_group})

    if isinstance(op, AverageOp):
        updated, op_warnings = _validate_numeric_aggregate_field(op, chart_context=chart_context)
        warnings.extend(op_warnings)
        return updated, warnings

    if isinstance(op, SumOp):
        if chart_context.mark != "bar":
            raise ValueError('sum is allowed only for bar charts (chart_context.mark must be "bar")')
        updated, op_warnings = _validate_numeric_aggregate_field(op, chart_context=chart_context)
        warnings.extend(op_warnings)
        normalized_group = _normalize_sum_group_selector(updated.group)
        updated = updated.model_copy(update={"group": normalized_group})
        _validate_sum_group_domain(normalized_group, chart_context)
        return updated, warnings

    if isinstance(op, SetOp):
        if op.meta is None or len(op.meta.inputs) < 2:
            raise ValueError('setOp requires meta.inputs with at least two nodeIds')
        return op, warnings

    if isinstance(op, DiffOp):
        if op.targetA is None:
            raise ValueError('diff targetA는 필수입니다 (scalar ref "ref:nX" 형식)')
        if op.targetB is None:
            raise ValueError('diff targetB는 필수입니다 (scalar ref "ref:nX" 형식)')
        if op.meta is not None and len(op.meta.inputs) != 2:
            raise ValueError(
                f'diff meta.inputs에 정확히 2개의 nodeId가 필요합니다 (현재 {len(op.meta.inputs)}개)'
            )
        return op, warnings

    if isinstance(op, CompareOp):
        if op.targetA is None:
            raise ValueError('compare targetA는 필수입니다 (scalar ref "ref:nX" 형식)')
        if op.targetB is None:
            raise ValueError('compare targetB는 필수입니다 (scalar ref "ref:nX" 형식)')
        if op.which is None:
            raise ValueError('compare which는 필수입니다 ("min" 또는 "max")')
        if op.meta is not None and len(op.meta.inputs) != 2:
            raise ValueError(
                f'compare meta.inputs에 정확히 2개의 nodeId가 필요합니다 (현재 {len(op.meta.inputs)}개)'
            )
        return op, warnings

    if isinstance(op, ScaleOp):
        target = op.target
        if isinstance(target, str):
            if re.fullmatch(r"ref:n\d+", target) is None:
                raise ValueError('scale target must be numeric literal or scalar ref string format "ref:n<digits>"')
        elif to_float(target) is None:
            raise ValueError("scale target must be numeric literal or scalar ref")
        return op, warnings

    if isinstance(op, AddOp):
        for key, value in (("targetA", op.targetA), ("targetB", op.targetB)):
            if isinstance(value, str):
                if re.fullmatch(r"ref:n\d+", value) is None and to_float(value) is None:
                    raise ValueError(
                        f'add {key} must be numeric literal or scalar ref string format "ref:n<digits>"'
                    )
            elif to_float(value) is None:
                raise ValueError(f"add {key} must be numeric literal or scalar ref")
        return op, warnings

    if isinstance(op, PairDiffOp):
        updated = op
        series_field = updated.seriesField or chart_context.series_field
        if not series_field:
            inferred = _pairdiff_candidate_series_fields(updated, chart_context)
            if inferred:
                series_field = inferred[0]
                updated = updated.model_copy(update={"seriesField": series_field})
                warnings.append(f'pairDiff seriesField inferred as "{series_field}" from groupA/groupB domain')
            else:
                raise ValueError("pairDiff requires seriesField or chart_context.series_field")

        if series_field not in chart_context.fields:
            raise ValueError(f'pairDiff seriesField "{series_field}" must be one of chart_context.fields')

        series_domain = chart_context.categorical_values.get(series_field, [])
        domain_set = {str(v) for v in series_domain}
        if updated.groupA not in domain_set or updated.groupB not in domain_set:
            inferred = _pairdiff_candidate_series_fields(updated, chart_context)
            if inferred and inferred[0] != series_field:
                series_field = inferred[0]
                updated = updated.model_copy(update={"seriesField": series_field})
                warnings.append(f'pairDiff seriesField corrected to "{series_field}" from groupA/groupB domain')
                series_domain = chart_context.categorical_values.get(series_field, [])
                domain_set = {str(v) for v in series_domain}

        if updated.by == series_field:
            alt_by = _pick_pairdiff_by_field(chart_context, series_field=series_field)
            if alt_by:
                updated = updated.model_copy(update={"by": alt_by})
                warnings.append(f'pairDiff by field changed to "{alt_by}" to avoid by==seriesField "{series_field}"')

        if updated.by not in chart_context.fields:
            raise ValueError(f'pairDiff by field "{updated.by}" must be one of chart_context.fields')
        if chart_context.dimension_fields and updated.by not in chart_context.dimension_fields:
            alt_by = _pick_pairdiff_by_field(chart_context, series_field=series_field)
            if alt_by and alt_by in chart_context.dimension_fields:
                updated = updated.model_copy(update={"by": alt_by})
                warnings.append(f'pairDiff by field corrected to dimension field "{alt_by}"')
            else:
                raise ValueError(f'pairDiff by field "{updated.by}" must be a dimension field')

        if updated.groupA not in domain_set:
            raise ValueError(f'pairDiff groupA "{updated.groupA}" is outside domain of seriesField "{series_field}"')
        if updated.groupB not in domain_set:
            raise ValueError(f'pairDiff groupB "{updated.groupB}" is outside domain of seriesField "{series_field}"')
        if updated.groupA == updated.groupB:
            raise ValueError("pairDiff requires groupA and groupB to be different")
        if updated.precision is not None and updated.precision < 0:
            raise ValueError("pairDiff precision must be >= 0")
        updated, op_warnings = _validate_numeric_aggregate_field(updated, chart_context=chart_context)
        warnings.extend(op_warnings)
        return updated, warnings

    if isinstance(op, CompareBoolOp) and not op.operator:
        raise ValueError("compareBool requires operator")

    if isinstance(op, FindExtremumOp):
        if op.rank is not None and op.rank < 1:
            raise ValueError("findExtremum rank must be >= 1")
        return op, warnings

    if isinstance(op, NthOp) and op.n is None:
        raise ValueError("nth requires n")

    field = getattr(op, "field", None)
    if isinstance(field, str):
        if field in {"value", "category"}:
            raise ValueError(f'Generic field "{field}" is not allowed; use chart_context field name.')
        _ensure_field_exists(field, chart_context)

    return op, warnings
