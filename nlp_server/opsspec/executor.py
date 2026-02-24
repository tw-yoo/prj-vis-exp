from __future__ import annotations

from dataclasses import replace
from typing import Any, Dict, List, Optional, Tuple

from .datum import DatumValue
from .models import ChartContext
from .specs.aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from .specs.compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp
from .specs.filter import FilterOp
from .specs.range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from .specs.set_op import SetOp
from .specs.union import OperationSpec
from .utils import to_float


def normalize_rows_to_datum_values(rows: List[Dict[str, Any]], chart_context: ChartContext) -> List[DatumValue]:
    out: List[DatumValue] = []
    dim = chart_context.primary_dimension
    measure = chart_context.primary_measure
    series_field = chart_context.series_field
    for row in rows:
        if not isinstance(row, dict):
            continue
        target = str(row.get(dim, "")).strip()
        if not target:
            continue
        numeric = to_float(row.get(measure))
        if numeric is None:
            continue
        group = None
        if series_field:
            raw_group = row.get(series_field)
            group = str(raw_group).strip() if raw_group is not None else None
        out.append(
            DatumValue(
                category=dim,
                measure=measure,
                target=target,
                group=group,
                value=numeric,
                id=str(row.get("id")) if row.get("id") is not None else None,
                name=str(row.get("name")) if row.get("name") is not None else None,
                lookup_id=str(row.get("lookupId")) if row.get("lookupId") is not None else None,
                series=group,
            )
        )
    return out


class OpsSpecExecutor:
    def __init__(self, chart_context: ChartContext) -> None:
        self.chart_context = chart_context
        self.runtime: Dict[str, List[DatumValue]] = {}

    def execute(
        self,
        *,
        rows: List[Dict[str, Any]],
        ops_spec: Dict[str, List[OperationSpec]],
    ) -> Dict[str, List[DatumValue]]:
        base = normalize_rows_to_datum_values(rows, self.chart_context)
        # Sentence-layer mode: groups represent explanation sentences, and nodes inside a
        # group may be parallel (no implicit chaining). Execute as a DAG based on meta.inputs
        # and scalar refs ("ref:nX"), not by sequential order within each group.
        ordered_ops: List[Tuple[int, str, OperationSpec]] = []
        for group_name, ops in (ops_spec or {}).items():
            if not isinstance(group_name, str) or not isinstance(ops, list):
                continue
            for op in ops:
                node_id = (op.meta.nodeId if op.meta else None) or op.id or "n0"
                try:
                    node_num = int(str(node_id).lstrip("n"))
                except Exception:
                    node_num = 0
                ordered_ops.append((node_num, group_name, op))
        ordered_ops.sort(key=lambda item: item[0])

        results_by_group: Dict[str, List[DatumValue]] = {name: [] for name in self._ordered_group_names(ops_spec)}

        for _, group_name, op in ordered_ops:
            data_input = self._select_data_input(base, op)
            result = self._execute_single(data_input, op)
            self._store_runtime(op, result)
            results_by_group.setdefault(group_name, []).extend([replace(item) for item in result])

        # Stable output ordering by sentence-layer group name.
        ordered_out: Dict[str, List[DatumValue]] = {}
        for name in self._ordered_group_names(results_by_group):
            ordered_out[name] = results_by_group.get(name, [])
        for name, items in results_by_group.items():
            if name not in ordered_out:
                ordered_out[name] = items
        return ordered_out

    def _ordered_group_names(self, groups: Dict[str, Any]) -> List[str]:
        names = [n for n in list((groups or {}).keys()) if isinstance(n, str)]
        ordered: List[str] = []
        if "ops" in names:
            ordered.append("ops")
        ordered.extend(sorted([n for n in names if n.startswith("ops") and n[3:].isdigit()], key=lambda n: int(n[3:])))
        ordered.extend(sorted([n for n in names if n not in ordered]))
        return ordered

    def _extract_ref_deps(self, obj: Any) -> List[str]:
        deps: List[str] = []
        if obj is None:
            return deps
        if isinstance(obj, str) and obj.startswith("ref:n"):
            deps.append(obj[len("ref:") :])
            return deps
        if isinstance(obj, list):
            for item in obj:
                deps.extend(self._extract_ref_deps(item))
            return deps
        if isinstance(obj, dict):
            for _, item in obj.items():
                deps.extend(self._extract_ref_deps(item))
            return deps
        return deps

    def _select_data_input(self, base: List[DatumValue], op: OperationSpec) -> List[DatumValue]:
        # Pick a single "data parent" dependency if present.
        # - meta.inputs contains both dataset and scalar dependencies.
        # - scalar deps are those referenced via "ref:nX" strings in op params.
        dumped = op.model_dump(by_alias=True, exclude_none=True)
        dumped.pop("meta", None)
        scalar_deps = set(self._extract_ref_deps(dumped))
        inputs = list((op.meta.inputs or []) if op.meta else [])
        data_parents = [inp for inp in inputs if inp not in scalar_deps]
        if not data_parents:
            return base
        parent = data_parents[0]
        return self.runtime.get(parent, base)

    def _store_runtime(self, op: OperationSpec, result: List[DatumValue]) -> None:
        if op.id:
            self.runtime[op.id] = [replace(item) for item in result]
        if op.meta and op.meta.nodeId:
            self.runtime[op.meta.nodeId] = [replace(item) for item in result]

    def _execute_single(self, data: List[DatumValue], op: OperationSpec) -> List[DatumValue]:
        if isinstance(op, RetrieveValueOp):
            return self._op_retrieve_value(data, op)
        if isinstance(op, FilterOp):
            return self._op_filter(data, op)
        if isinstance(op, FindExtremumOp):
            return self._op_find_extremum(data, op)
        if isinstance(op, DetermineRangeOp):
            return self._op_determine_range(data, op)
        if isinstance(op, CompareOp):
            return self._op_compare(data, op)
        if isinstance(op, CompareBoolOp):
            return self._op_compare_bool(data, op)
        if isinstance(op, SortOp):
            return self._op_sort(data, op)
        if isinstance(op, SumOp):
            return self._op_sum(data, op)
        if isinstance(op, AverageOp):
            return self._op_average(data, op)
        if isinstance(op, DiffOp):
            return self._op_diff(data, op)
        if isinstance(op, LagDiffOp):
            return self._op_lag_diff(data, op)
        if isinstance(op, NthOp):
            return self._op_nth(data, op)
        if isinstance(op, CountOp):
            return self._op_count(data, op)
        if isinstance(op, SetOp):
            return self._op_set_op(data, op)
        return data

    def _slice_by_group(self, data: List[DatumValue], group: Optional[str]) -> List[DatumValue]:
        if not group:
            return data
        return [item for item in data if (item.group or "") == group]

    def _infer_field_kind(self, field: Optional[str]) -> Optional[str]:
        if not field:
            return None
        if field in {"value", self.chart_context.primary_measure}:
            return "measure"
        if field in {"target", self.chart_context.primary_dimension}:
            return "category"
        if field in self.chart_context.measure_fields:
            return "measure"
        if field in self.chart_context.dimension_fields:
            return "category"
        return None

    def _selector_to_target_and_group(self, selector: Any, default_group: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        if isinstance(selector, dict):
            if isinstance(selector.get("id"), str) and not any(k in selector for k in ("category", "target")):
                return None, None, selector["id"]
            category = selector.get("category")
            target = selector.get("target", category)
            series = selector.get("series", default_group)
            target_text = str(target) if target is not None else None
            series_text = str(series) if series is not None else None
            return target_text, series_text, None
        if isinstance(selector, str) and selector.startswith("ref:n"):
            # Scalar reference to a prior node's output, expressed in PlanTree style.
            return None, None, selector[len("ref:") :]
        if selector is None:
            return None, default_group, None
        return str(selector), default_group, None

    def _resolve_scalar_ref(self, raw: Any) -> Optional[float]:
        if isinstance(raw, dict) and isinstance(raw.get("id"), str):
            values = self.runtime.get(raw["id"], [])
            if not values:
                return None
            return values[-1].value
        if isinstance(raw, str) and raw.startswith("ref:n"):
            key = raw[len("ref:") :]
            values = self.runtime.get(key, [])
            if not values:
                return None
            return values[-1].value
        return to_float(raw)

    def _eval_operator(self, operator: str, left: Any, right: Any) -> bool:
        if operator == ">":
            return float(left) > float(right)
        if operator == ">=":
            return float(left) >= float(right)
        if operator == "<":
            return float(left) < float(right)
        if operator == "<=":
            return float(left) <= float(right)
        if operator in {"==", "eq"}:
            return left == right
        if operator == "!=":
            return left != right
        if operator == "in":
            return isinstance(right, list) and left in right
        if operator == "not-in":
            return isinstance(right, list) and left not in right
        if operator == "contains":
            if isinstance(left, str) and isinstance(right, str):
                return right in left
            if isinstance(left, str) and isinstance(right, list):
                return all(str(tok) in left for tok in right)
        raise ValueError(f"Unsupported operator: {operator}")

    def _value_key(self, item: DatumValue, field: Optional[str]) -> Any:
        kind = self._infer_field_kind(field)
        if kind == "category":
            return item.target
        return item.value

    def _aggregate(self, values: List[float], agg: Optional[str]) -> float:
        if not values:
            return float("nan")
        if agg == "avg":
            return sum(values) / len(values)
        if agg == "min":
            return min(values)
        if agg == "max":
            return max(values)
        return sum(values)

    def _slice_for_selector(self, data: List[DatumValue], selector: Any, group: Optional[str], field: Optional[str]) -> List[DatumValue]:
        target, series, scalar_ref = self._selector_to_target_and_group(selector, group)
        if scalar_ref:
            return self.runtime.get(scalar_ref, [])
        sliced = self._slice_by_group(data, series)
        if target is None:
            return sliced
        return [item for item in sliced if item.target == target]

    def _make_scalar(self, *, value: float, label: str, group: Optional[str], measure: Optional[str]) -> List[DatumValue]:
        return [
            DatumValue(
                category="result",
                measure=measure or self.chart_context.primary_measure,
                target=label,
                group=group,
                value=value,
                name=label,
            )
        ]

    def _op_retrieve_value(self, data: List[DatumValue], op: RetrieveValueOp) -> List[DatumValue]:
        target = op.target
        if isinstance(target, list):
            out: List[DatumValue] = []
            for entry in target:
                out.extend(self._slice_for_selector(data, entry, op.group, op.field))
            return out
        return self._slice_for_selector(data, target, op.group, op.field)

    def _op_filter(self, data: List[DatumValue], op: FilterOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        include_set = {str(v) for v in (op.include or [])}
        exclude_set = {str(v) for v in (op.exclude or [])}
        if include_set or exclude_set:
            sliced = [
                item
                for item in sliced
                if (not include_set or item.target in include_set) and (not exclude_set or item.target not in exclude_set)
            ]
        if not op.operator:
            return sliced

        right = self._resolve_scalar_ref(op.value)
        if right is None and op.value is not None and not isinstance(op.value, dict):
            right = op.value  # type: ignore[assignment]
        if right is None:
            return []
        field_kind = self._infer_field_kind(op.field)
        out: List[DatumValue] = []
        for item in sliced:
            left = item.value if field_kind != "category" else item.target
            if self._eval_operator(op.operator, left, right):
                out.append(item)
        return out

    def _op_find_extremum(self, data: List[DatumValue], op: FindExtremumOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        if not sliced:
            return []
        pick_max = op.which != "min"
        sorted_values = sorted(sliced, key=lambda item: self._value_key(item, op.field))
        return [sorted_values[-1] if pick_max else sorted_values[0]]

    def _op_determine_range(self, data: List[DatumValue], op: DetermineRangeOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        if not sliced:
            return []
        kind = self._infer_field_kind(op.field)
        if kind == "category":
            targets = sorted({item.target for item in sliced})
            return [
                DatumValue(category="range", measure=None, target="__min__", group=op.group, value=0.0, name=targets[0]),
                DatumValue(
                    category="range",
                    measure=None,
                    target="__max__",
                    group=op.group,
                    value=max(0.0, float(len(targets) - 1)),
                    name=targets[-1],
                ),
            ]
        values = [item.value for item in sliced]
        return [
            DatumValue(category="range", measure=op.field, target="__min__", group=op.group, value=min(values)),
            DatumValue(category="range", measure=op.field, target="__max__", group=op.group, value=max(values)),
        ]

    def _op_compare(self, data: List[DatumValue], op: CompareOp) -> List[DatumValue]:
        left = self._slice_for_selector(data, op.targetA, op.groupA or op.group, op.field)
        right = self._slice_for_selector(data, op.targetB, op.groupB or op.group, op.field)
        if not left or not right:
            return []
        left_value = self._aggregate([item.value for item in left], op.aggregate)
        right_value = self._aggregate([item.value for item in right], op.aggregate)
        pick_max = op.which != "min"
        return [left[-1] if (left_value >= right_value if pick_max else left_value <= right_value) else right[-1]]

    def _op_compare_bool(self, data: List[DatumValue], op: CompareBoolOp) -> List[DatumValue]:
        if not op.operator:
            return []
        left = self._slice_for_selector(data, op.targetA, op.groupA or op.group, op.field)
        right = self._slice_for_selector(data, op.targetB, op.groupB or op.group, op.field)
        if not left or not right:
            return []
        left_value = self._aggregate([item.value for item in left], op.aggregate)
        right_value = self._aggregate([item.value for item in right], op.aggregate)
        flag = self._eval_operator(op.operator, left_value, right_value)
        return self._make_scalar(value=1.0 if flag else 0.0, label="__compareBool__", group=op.group, measure=op.field)

    def _op_sort(self, data: List[DatumValue], op: SortOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        reverse = op.order == "desc"
        return sorted(sliced, key=lambda item: self._value_key(item, op.field), reverse=reverse)

    def _op_sum(self, data: List[DatumValue], op: SumOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        value = sum(item.value for item in sliced)
        return self._make_scalar(value=value, label="__sum__", group=op.group, measure=op.field)

    def _op_average(self, data: List[DatumValue], op: AverageOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        if not sliced:
            return self._make_scalar(value=float("nan"), label="__avg__", group=op.group, measure=op.field)
        value = sum(item.value for item in sliced) / len(sliced)
        return self._make_scalar(value=value, label="__avg__", group=op.group, measure=op.field)

    def _op_diff(self, data: List[DatumValue], op: DiffOp) -> List[DatumValue]:
        left_scalar = self._resolve_scalar_ref(op.targetA)
        right_scalar = self._resolve_scalar_ref(op.targetB)
        if left_scalar is None:
            left = self._slice_for_selector(data, op.targetA, op.groupA or op.group, op.field)
            left_scalar = self._aggregate([item.value for item in left], op.aggregate)
        if right_scalar is None:
            right = self._slice_for_selector(data, op.targetB, op.groupB or op.group, op.field)
            right_scalar = self._aggregate([item.value for item in right], op.aggregate)
        if left_scalar is None or right_scalar is None:
            return []

        if op.mode == "ratio":
            if right_scalar == 0:
                return []
            scale = op.scale if op.scale is not None else (100.0 if op.percent else 1.0)
            result = (left_scalar / right_scalar) * float(scale)
        else:
            result = left_scalar - right_scalar
            if op.signed is False:
                result = abs(result)
        if op.precision is not None:
            result = round(result, max(0, op.precision))
        return self._make_scalar(value=result, label=op.targetName or "__diff__", group=op.group, measure=op.field)

    def _op_lag_diff(self, data: List[DatumValue], op: LagDiffOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        reverse = op.order == "desc"
        ordered = sorted(sliced, key=lambda item: item.target, reverse=reverse)
        out: List[DatumValue] = []
        for idx in range(1, len(ordered)):
            prev = ordered[idx - 1]
            curr = ordered[idx]
            delta = curr.value - prev.value
            if op.absolute:
                delta = abs(delta)
            out.append(
                DatumValue(
                    category=curr.category,
                    measure=curr.measure,
                    target=curr.target,
                    group=curr.group,
                    value=delta,
                    prev_target=prev.target,
                )
            )
        return out

    def _op_nth(self, data: List[DatumValue], op: NthOp) -> List[DatumValue]:
        if op.n is None:
            return []
        n = op.n if isinstance(op.n, int) else (op.n[0] if op.n else None)
        if n is None:
            return []
        sliced = self._slice_by_group(data, op.group)
        reverse = op.order == "desc"
        ordered = sorted(sliced, key=lambda item: self._value_key(item, op.orderField or op.field), reverse=reverse)
        idx = max(1, n) - 1
        if idx >= len(ordered):
            return []
        return [ordered[idx]]

    def _op_count(self, data: List[DatumValue], op: CountOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        return self._make_scalar(value=float(len(sliced)), label="__count__", group=op.group, measure=op.field)

    def _op_set_op(self, data: List[DatumValue], op: SetOp) -> List[DatumValue]:
        _ = data
        inputs = op.meta.inputs if op.meta and op.meta.inputs else []
        if len(inputs) < 2:
            return []
        collections: List[List[DatumValue]] = [self.runtime.get(node_id, []) for node_id in inputs]
        if any(not coll for coll in collections):
            return []
        target_sets = [set(item.target for item in coll) for coll in collections]
        if op.fn == "intersection":
            merged = set.intersection(*target_sets)
        else:
            merged = set.union(*target_sets)
        ordered = sorted(merged)
        return [
            DatumValue(
                category=self.chart_context.primary_dimension,
                measure=self.chart_context.primary_measure,
                target=target,
                group=op.group,
                value=1.0,
                name=target,
            )
            for target in ordered
        ]
