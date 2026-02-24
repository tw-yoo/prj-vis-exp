from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from .models import ChartContext, NumericStats
from .types import JsonValue, PrimitiveValue
from .utils import to_float


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _is_number(value: Any) -> bool:
    return to_float(value) is not None


def _extract_encoding_summary(spec: Dict[str, Any]) -> Dict[str, Dict[str, JsonValue]]:
    encoding = spec.get("encoding")
    if not isinstance(encoding, dict):
        return {}

    out: Dict[str, Dict[str, JsonValue]] = {}
    for channel, raw in encoding.items():
        if not isinstance(channel, str):
            continue
        source: Optional[Dict[str, Any]] = None
        if isinstance(raw, dict):
            source = raw
        elif isinstance(raw, list) and raw and isinstance(raw[0], dict):
            source = raw[0]
        if source is None:
            continue

        out[channel] = {
            "field": _as_text(source.get("field")) or None,
            "type": _as_text(source.get("type")) or None,
            "title": _as_text(source.get("title")) or None,
            "aggregate": _as_text(source.get("aggregate")) or None,
            "stack": source.get("stack") if "stack" in source else None,
        }
    return out


def _extract_mark(spec: Dict[str, Any]) -> str:
    mark = spec.get("mark")
    if isinstance(mark, str):
        return mark
    if isinstance(mark, dict):
        return _as_text(mark.get("type")) or "unknown"
    return "unknown"


def _is_stacked_bar(mark: str, encoding_summary: Dict[str, Dict[str, JsonValue]]) -> bool:
    if mark != "bar":
        return False
    if "color" not in encoding_summary:
        return False
    if "xOffset" in encoding_summary or "yOffset" in encoding_summary:
        return False
    for axis in ("x", "y"):
        stack = encoding_summary.get(axis, {}).get("stack")
        if stack is False:
            return False
        if isinstance(stack, str) and stack.lower() == "none":
            return False
    return True


def _all_data_fields(rows: List[Dict[str, Any]]) -> List[str]:
    fields: List[str] = []
    for row in rows:
        for key in row.keys():
            if key not in fields:
                fields.append(key)
    return fields


def _infer_field_types(rows: List[Dict[str, Any]], fields: Iterable[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for field in fields:
        values = [row.get(field) for row in rows]
        non_null = [v for v in values if v is not None]
        if not non_null:
            out[field] = "unknown"
            continue
        out[field] = "numeric" if all(_is_number(v) for v in non_null) else "categorical"
    return out


def _override_field_types_from_encoding(
    field_types: Dict[str, str],
    encoding_summary: Dict[str, Dict[str, JsonValue]],
) -> Dict[str, str]:
    """
    Vega-Lite encoding types provide strong semantic hints:
    - nominal/ordinal/temporal are treated as categorical (dimensions)
    - quantitative is treated as numeric (measures)

    This avoids cases like an integer-coded month being inferred as numeric when the
    chart uses it as a categorical x-axis.
    """
    out = dict(field_types)
    for channel, enc in encoding_summary.items():
        _ = channel
        field = _as_text(enc.get("field"))
        enc_type = _as_text(enc.get("type")).lower()
        if not field or not enc_type:
            continue
        if enc_type in {"nominal", "ordinal", "temporal"}:
            out[field] = "categorical"
        elif enc_type in {"quantitative"}:
            out[field] = "numeric"
    return out


def _build_domains(rows: List[Dict[str, Any]], field_types: Dict[str, str]) -> Dict[str, List[PrimitiveValue]]:
    out: Dict[str, List[PrimitiveValue]] = {}
    for field, field_type in field_types.items():
        if field_type != "categorical":
            continue
        seen: Dict[str, PrimitiveValue] = {}
        for row in rows:
            value = row.get(field)
            if isinstance(value, bool) or value is None:
                continue
            if not isinstance(value, (str, int, float)):
                continue
            token = f"{type(value).__name__}:{value}"
            if token not in seen:
                seen[token] = value
        out[field] = sorted(seen.values(), key=lambda v: str(v))
    return out


def _build_numeric_stats(rows: List[Dict[str, Any]], field_types: Dict[str, str]) -> Dict[str, NumericStats]:
    out: Dict[str, NumericStats] = {}
    for field, field_type in field_types.items():
        if field_type != "numeric":
            continue
        numbers = [value for value in (to_float(row.get(field)) for row in rows) if value is not None]
        if not numbers:
            continue
        out[field] = NumericStats(min=min(numbers), max=max(numbers), mean=sum(numbers) / len(numbers))
    return out


def _pick_roles(
    encoding_summary: Dict[str, Dict[str, JsonValue]],
    field_types: Dict[str, str],
    fallback_fields: List[str],
) -> Tuple[str, str, Optional[str]]:
    x_field = _as_text(encoding_summary.get("x", {}).get("field")) or None
    y_field = _as_text(encoding_summary.get("y", {}).get("field")) or None
    color_field = _as_text(encoding_summary.get("color", {}).get("field")) or None

    category_fields = [f for f, t in field_types.items() if t == "categorical"]
    measure_fields = [f for f, t in field_types.items() if t == "numeric"]

    # primary_dimension: x축 카테고리 → y축 카테고리 → 첫 번째 카테고리 필드 → fallback
    if x_field and field_types.get(x_field) == "categorical":
        primary_dimension = x_field
    elif y_field and field_types.get(y_field) == "categorical":
        primary_dimension = y_field
    elif category_fields:
        primary_dimension = category_fields[0]
    else:
        primary_dimension = fallback_fields[0]

    # primary_measure: y축 수치 → x축 수치 → 첫 번째 수치 필드 → fallback
    if y_field and field_types.get(y_field) == "numeric":
        primary_measure = y_field
    elif x_field and field_types.get(x_field) == "numeric":
        primary_measure = x_field
    elif measure_fields:
        primary_measure = measure_fields[0]
    else:
        primary_measure = fallback_fields[0]

    # series_field: color 채널이 카테고리 타입인 경우에만 설정
    if color_field and field_types.get(color_field) == "categorical":
        series_field: Optional[str] = color_field
    else:
        series_field = None

    return primary_dimension, primary_measure, series_field


def build_chart_context(
    vega_lite_spec: Dict[str, Any],
    data_rows: List[Dict[str, Any]],
) -> Tuple[ChartContext, List[str], List[Dict[str, JsonValue]]]:
    warnings: List[str] = []
    rows = [row for row in data_rows if isinstance(row, dict)]
    if len(rows) != len(data_rows):
        warnings.append("Some data_rows entries were not objects and were ignored.")
    if not rows:
        raise ValueError("data_rows must contain at least one row object.")

    all_fields = _all_data_fields(rows)
    if not all_fields:
        raise ValueError("Could not infer fields from data_rows.")

    encoding_summary = _extract_encoding_summary(vega_lite_spec)
    mark = _extract_mark(vega_lite_spec)
    is_stacked = _is_stacked_bar(mark, encoding_summary)

    field_types = _infer_field_types(rows, all_fields)
    field_types = _override_field_types_from_encoding(field_types, encoding_summary)
    categorical_values = _build_domains(rows, field_types)
    numeric_stats = _build_numeric_stats(rows, field_types)
    primary_dimension, primary_measure, series_field = _pick_roles(encoding_summary, field_types, all_fields)

    dimension_fields = [field for field, field_type in field_types.items() if field_type == "categorical"]
    measure_fields = [field for field, field_type in field_types.items() if field_type == "numeric"]

    chart_context = ChartContext(
        fields=all_fields,
        dimension_fields=dimension_fields,
        measure_fields=measure_fields,
        primary_dimension=primary_dimension,
        primary_measure=primary_measure,
        series_field=series_field,
        categorical_values=categorical_values,
        field_types=field_types,  # type: ignore[arg-type]
        numeric_stats=numeric_stats,
        mark=mark,
        is_stacked=is_stacked,
        encoding_summary=encoding_summary,
    )

    rows_preview: List[Dict[str, JsonValue]] = []
    for row in rows[:40]:
        clean: Dict[str, JsonValue] = {}
        for key, value in row.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                clean[key] = value
            else:
                clean[key] = str(value)
        rows_preview.append(clean)

    return chart_context, warnings, rows_preview
