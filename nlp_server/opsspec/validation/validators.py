from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..core.models import ChartContext
from ..runtime.op_registry import ALLOWED_OPS, LEGACY_NON_DRAW_OPS
from ..specs.aggregate import AverageOp, SumOp
from ..specs.compare import CompareBoolOp
from ..specs.filter import FilterOp
from ..specs.range_sort_select import NthOp
from ..specs.set_op import SetOp
from ..specs.union import OperationSpec
from ..core.types import PrimitiveValue


def is_allowed_op(op_name: str) -> bool:
    return op_name in ALLOWED_OPS


def _sorted_unique(values: Iterable[PrimitiveValue]) -> List[PrimitiveValue]:
    unique: Dict[str, PrimitiveValue] = {}
    for value in values:
        key = f"{type(value).__name__}:{value}"
        if key not in unique:
            unique[key] = value
    return sorted(unique.values(), key=lambda item: str(item))


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

    _ensure_field_exists(updated.field, chart_context)

    # Enforce semantic single-path rules to reduce equivalent representations:
    # - Do NOT filter on series_field directly; series restriction must be encoded via op.group.
    if chart_context.series_field and updated.field == chart_context.series_field:
        raise ValueError(
            f'filter on series_field "{chart_context.series_field}" is forbidden; '
            'restrict series via op.group="<series value>" instead.'
        )

    has_include = bool(updated.include)
    has_exclude = bool(updated.exclude)
    has_operator = bool(updated.operator)
    has_value = updated.value is not None

    membership_mode = has_include or has_exclude
    comparison_mode = has_operator or has_value

    if not membership_mode and not comparison_mode:
        raise ValueError('filter requires either membership(include/exclude) or comparison(operator/value)')
    if membership_mode and comparison_mode:
        raise ValueError("filter cannot mix membership(include/exclude) and comparison(operator/value)")
    if has_operator and not has_value:
        raise ValueError('filter requires "value" when "operator" is provided')
    if has_value and not has_operator:
        raise ValueError('filter requires "operator" when "value" is provided')

    # Membership filters must select targets on the primary dimension only (x-axis).
    # This matches the legacy engine semantics and removes ambiguous representations.
    if membership_mode and updated.field != chart_context.primary_dimension:
        raise ValueError(
            f'filter membership mode must use primary_dimension "{chart_context.primary_dimension}", '
            f'got "{updated.field}"'
        )

    # Comparison filters must compare numeric measure values.
    if comparison_mode and chart_context.measure_fields and updated.field not in chart_context.measure_fields:
        raise ValueError(f'filter comparison mode requires numeric measure field, got "{updated.field}"')

    if runtime_scalars is not None and has_value:
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

    if isinstance(op, (AverageOp, SumOp)):
        updated, op_warnings = _validate_numeric_aggregate_field(op, chart_context=chart_context)
        warnings.extend(op_warnings)
        return updated, warnings

    if isinstance(op, SetOp):
        if op.meta is None or len(op.meta.inputs) < 2:
            raise ValueError('setOp requires meta.inputs with at least two nodeIds')
        return op, warnings

    if isinstance(op, CompareBoolOp) and not op.operator:
        raise ValueError("compareBool requires operator")

    if isinstance(op, NthOp) and op.n is None:
        raise ValueError("nth requires n")

    field = getattr(op, "field", None)
    if isinstance(field, str):
        if field in {"value", "category"}:
            raise ValueError(f'Generic field "{field}" is not allowed; use chart_context field name.')
        _ensure_field_exists(field, chart_context)

    return op, warnings
