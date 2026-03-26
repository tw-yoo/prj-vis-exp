from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Set

from opsspec.runtime.executor import OpsSpecExecutor
from opsspec.core.models import ChartContext
from opsspec.specs.union import OperationSpec

from .chart_type import ChartKind, derive_chart_kind
from .models import (
    DrawClearOp,
    DrawGroupFilterSpec,
    DrawGroupedFilterGroupsOp,
    DrawHighlightOp,
    DrawLineHorizontalSpec,
    DrawLineOp,
    DrawLineSpec,
    DrawLineStyle,
    DrawMeta,
    DrawOpsGroupMap,
    DrawSelect,
    DrawStackedFilterGroupsOp,
    DrawStyle,
    dump_draw_groups,
)

HIGHLIGHT_OPS: Set[str] = {
    "retrieveValue",
    "filter",
    "findExtremum",
    "nth",
    "setOp",
    "lagDiff",
}
SCALAR_LINE_OPS: Set[str] = {"average", "sum", "diff", "count"}


def _ordered_groups(group_names: Iterable[str]) -> List[str]:
    names = [name for name in set(group_names) if isinstance(name, str)]
    ordered: List[str] = []
    if "ops" in names:
        ordered.append("ops")
    ordered.extend(sorted([name for name in names if name.startswith("ops") and name[3:].isdigit()], key=lambda item: int(item[3:])))
    ordered.extend(sorted([name for name in names if name not in ordered]))
    return ordered


def _build_meta(op: OperationSpec) -> DrawMeta:
    node_id = op.meta.nodeId if op.meta else None
    sentence_index = op.meta.sentenceIndex if op.meta else None
    inputs = list(op.meta.inputs if op.meta else [])
    return DrawMeta(nodeId=node_id, sentenceIndex=sentence_index, inputs=inputs)


def _unique_targets(result_rows: List[Any]) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for row in result_rows:
        target = getattr(row, "target", None)
        if target is None:
            continue
        text = str(target).strip()
        if not text or text.startswith("__"):
            continue
        if text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _resolve_scalar(result_rows: List[Any]) -> float | None:
    for row in reversed(result_rows):
        value = getattr(row, "value", None)
        if isinstance(value, bool) or value is None:
            continue
        try:
            numeric = float(value)
        except Exception:
            continue
        if math.isfinite(numeric):
            return numeric
    return None


def _group_filter_action(chart_kind: ChartKind) -> str | None:
    if chart_kind == "stacked_bar":
        return "stacked-filter-groups"
    if chart_kind == "grouped_bar":
        return "grouped-filter-groups"
    return None


def build_draw_ops_spec(
    *,
    ops_spec: Dict[str, List[OperationSpec]],
    chart_context: ChartContext,
    data_rows: List[Dict[str, Any]],
    vega_lite_spec: Dict[str, Any],
) -> Dict[str, List[Dict[str, object]]]:
    """
    Build TS-executable draw ops JSON from Python data-op execution results.

    Output shape is OpsSpecGroupMap-compatible:
    {
      "ops":  [ { op:"draw", ... }, ... ],
      "ops2": [ ... ]
    }
    """
    chart_kind = derive_chart_kind(vega_lite_spec, chart_context)
    group_filter_action = _group_filter_action(chart_kind)

    executor = OpsSpecExecutor(chart_context)
    executor.execute(rows=data_rows, ops_spec=ops_spec)
    runtime = executor.runtime

    draw_groups: DrawOpsGroupMap = {}
    for group_name in _ordered_groups(ops_spec.keys()):
        group_ops = ops_spec.get(group_name, [])
        draw_ops = draw_groups.setdefault(group_name, [])
        draw_ops.append(DrawClearOp(meta=DrawMeta(source="python-draw-plan", inputs=[])))

        for op in group_ops:
            op_name = str(op.op)
            node_id = (op.meta.nodeId if op.meta else None) or op.id
            if not node_id:
                continue
            result_rows = runtime.get(node_id, [])
            if not result_rows:
                continue

            meta = _build_meta(op)
            op_group = getattr(op, "group", None)
            scoped = bool(op_group and isinstance(op_group, str) and op_group.strip() and group_filter_action)
            if scoped and group_filter_action:
                if group_filter_action == "stacked-filter-groups":
                    draw_ops.append(
                        DrawStackedFilterGroupsOp(
                            meta=meta,
                            groupFilter=DrawGroupFilterSpec(groups=[str(op_group)]),
                        )
                    )
                else:
                    draw_ops.append(
                        DrawGroupedFilterGroupsOp(
                            meta=meta,
                            groupFilter=DrawGroupFilterSpec(groups=[str(op_group)]),
                        )
                    )

            if op_name in HIGHLIGHT_OPS:
                targets = _unique_targets(result_rows)
                if targets:
                    draw_ops.append(
                        DrawHighlightOp(
                            meta=meta,
                            select=DrawSelect(keys=targets),
                            style=DrawStyle(color="#ef4444", opacity=1.0),
                        )
                    )
            elif op_name in SCALAR_LINE_OPS:
                scalar = _resolve_scalar(result_rows)
                if scalar is not None:
                    draw_ops.append(
                        DrawLineOp(
                            meta=meta,
                            line=DrawLineSpec(
                                mode="horizontal-from-y",
                                hline=DrawLineHorizontalSpec(y=float(scalar)),
                                style=DrawLineStyle(stroke="#ef4444", strokeWidth=2.0, opacity=1.0),
                            ),
                        )
                    )

            if scoped and group_filter_action:
                if group_filter_action == "stacked-filter-groups":
                    draw_ops.append(
                        DrawStackedFilterGroupsOp(
                            meta=meta,
                            groupFilter=DrawGroupFilterSpec(reset=True),
                        )
                    )
                else:
                    draw_ops.append(
                        DrawGroupedFilterGroupsOp(
                            meta=meta,
                            groupFilter=DrawGroupFilterSpec(reset=True),
                        )
                    )

    dumped = dump_draw_groups(draw_groups)
    if not dumped:
        return {"ops": []}
    if "ops" not in dumped:
        dumped["ops"] = []
    return dumped

