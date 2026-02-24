from __future__ import annotations

from typing import Any, Dict, Literal

from opsspec.models import ChartContext

ChartKind = Literal["simple_bar", "grouped_bar", "stacked_bar", "simple_line", "multi_line", "unknown"]


def derive_chart_kind(vega_lite_spec: Dict[str, Any], chart_context: ChartContext) -> ChartKind:
    mark_raw = vega_lite_spec.get("mark")
    if isinstance(mark_raw, str):
        mark = mark_raw.strip().lower()
    elif isinstance(mark_raw, dict):
        mark = str(mark_raw.get("type", "")).strip().lower()
    else:
        mark = ""

    has_series = bool(chart_context.series_field)
    if mark == "bar":
        if has_series and chart_context.is_stacked:
            return "stacked_bar"
        if has_series:
            return "grouped_bar"
        return "simple_bar"
    if mark == "line":
        if has_series:
            return "multi_line"
        return "simple_line"
    return "unknown"

