from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple, Type

from ..specs.add import AddOp
from ..specs.aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from ..specs.base import BaseOpFields
from ..specs.compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp, PairDiffOp
from ..specs.filter import FilterOp
from ..specs.range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from ..specs.scale import ScaleOp
from ..specs.set_op import SetOp

COMMON_FIELDS: Tuple[str, ...] = ("op", "id", "meta", "chartId")


@dataclass(frozen=True)
class OpContract:
    op_name: str
    model_cls: Type[BaseOpFields]
    required_fields: Tuple[str, ...]
    semantic_rules: Tuple[str, ...]


def _alias_fields(model_cls: Type[BaseOpFields]) -> Tuple[str, ...]:
    names: List[str] = []
    for field_name, field_info in model_cls.model_fields.items():
        if field_name in COMMON_FIELDS:
            continue
        names.append(field_info.alias or field_name)
    return tuple(sorted(names))


_OP_SEQUENCE: Tuple[OpContract, ...] = (
    OpContract(
        op_name="retrieveValue",
        model_cls=RetrieveValueOp,
        required_fields=tuple(),
        semantic_rules=(
            "target must be a value from primary_dimension (e.g. 'Q1', '2022').",
            "If group is set, filter rows by that series value first, then select by target.",
            "If target is omitted, returns the first row value from the (optionally filtered) dataset.",
            "Use a scalar ref ('ref:nX') in target when the target value comes from a prior node.",
        ),
    ),
    OpContract(
        op_name="filter",
        model_cls=FilterOp,
        required_fields=tuple(),
        semantic_rules=(
            "Use exactly one mode: membership(include/exclude), comparison(operator+value), or group-only(series restriction).",
            "field must be one of chart_context.fields when membership/comparison modes are used.",
            "Membership mode: field must be a categorical field; values are labels from that field domain.",
            "Comparison mode: field must be a numeric measure field; operator is one of >, >=, <, <=, ==, !=.",
            "Comparison mode also supports operator='between' with value=[start,end] to return row-order slice from start to end (inclusive).",
            "Group-only mode: provide op.group only (string or list with OR semantics).",
            "Never filter on series_field directly; use op.group to restrict series instead.",
            "op.group can be a string or list of strings; a list means OR semantics across groups.",
        ),
    ),
    OpContract(
        op_name="findExtremum",
        model_cls=FindExtremumOp,
        required_fields=tuple(),
        semantic_rules=(
            "which='max' finds the target with the highest field value; 'min' finds the lowest.",
            "which defaults to 'max' when omitted.",
            "rank defaults to 1; rank=2 means second highest/lowest depending on which.",
            "field should be a numeric measure field; defaults to primary_measure when omitted.",
            "group restricts to a specific series slice before finding the extremum.",
            "Result is a scalar (the target label with the extreme value).",
        ),
    ),
    OpContract(
        op_name="determineRange",
        model_cls=DetermineRangeOp,
        required_fields=tuple(),
        semantic_rules=(
            "For numeric field: returns the min and max numeric values.",
            "For categorical field: returns alphabetically first and last target labels.",
            "field defaults to primary_measure when omitted.",
            "group restricts to a specific series slice before computing the range.",
        ),
    ),
    OpContract(
        op_name="compare",
        model_cls=CompareOp,
        required_fields=tuple(),
        semantic_rules=(
            "Compares two slices: targetA vs targetB (dimension labels) or groupA vs groupB (series values).",
            "which='max' returns the larger side; which='min' returns the smaller side; omit to return both.",
            "aggregate='sum' or 'average' computes an aggregate over the slice before comparing.",
            "Use scalar refs ('ref:nX') in targetA/targetB when values come from prior nodes.",
        ),
    ),
    OpContract(
        op_name="compareBool",
        model_cls=CompareBoolOp,
        required_fields=("operator",),
        semantic_rules=(
            "operator is required: one of >, >=, <, <=, ==, !=.",
            "Compares targetA against targetB (or a scalar ref) using the operator.",
            "Returns a boolean result (true/false).",
            "Use scalar refs ('ref:nX') when either side comes from a prior node.",
        ),
    ),
    OpContract(
        op_name="sort",
        model_cls=SortOp,
        required_fields=tuple(),
        semantic_rules=(
            "field is the column to sort by; defaults to primary_measure when omitted.",
            "order is 'asc' or 'desc'; defaults to 'asc' when omitted.",
            "group restricts to a specific series slice before sorting.",
            "Result is a sorted table (not a scalar); use nth after sort to pick a specific rank.",
        ),
    ),
    OpContract(
        op_name="sum",
        model_cls=SumOp,
        required_fields=tuple(),
        semantic_rules=(
            "field must be a numeric measure field; defaults to primary_measure when omitted.",
            'sum is allowed only for bar charts (simple or stacked).',
            "sum is for dataset row aggregation only (not scalar arithmetic).",
            "group can be a string or list of strings.",
            "In simple bar: if group is set, sum filtered rows; otherwise sum all rows.",
            "In stacked bar: group=None or multi-group means sum all rows; single group means sum that group only.",
            "Result is a scalar.",
        ),
    ),
    OpContract(
        op_name="average",
        model_cls=AverageOp,
        required_fields=tuple(),
        semantic_rules=(
            "field must be a numeric measure field; defaults to primary_measure when omitted.",
            "group restricts to a specific series slice before averaging.",
            "Result is a scalar.",
        ),
    ),
    OpContract(
        op_name="diff",
        model_cls=DiffOp,
        required_fields=tuple(),
        semantic_rules=(
            "Computes B - A (or (B-A)/A*100 when percent=true).",
            "Use targetA/targetB (dimension labels) to slice rows, or use scalar refs ('ref:nX') for prior node values.",
            "signed=false returns the absolute value of the difference.",
            "percent=true returns percentage change: (targetB - targetA) / targetA * 100.",
            "field specifies the numeric measure column for row-slice mode.",
        ),
    ),
    OpContract(
        op_name="lagDiff",
        model_cls=LagDiffOp,
        required_fields=tuple(),
        semantic_rules=(
            "Computes the difference between each adjacent pair of rows ordered by target.",
            "order='asc'/'desc' controls sort direction; defaults to 'asc'.",
            "absolute=true returns absolute differences.",
            "group restricts to a specific series slice before computing lag differences.",
            "field specifies which numeric column to diff; defaults to primary_measure.",
        ),
    ),
    OpContract(
        op_name="pairDiff",
        model_cls=PairDiffOp,
        required_fields=("by", "groupA", "groupB"),
        semantic_rules=(
            "Computes per-key differences between two groups by a key field (by).",
            "by must be a dimension field used as the result key.",
            "seriesField (optional) chooses which field groupA/groupB refer to; defaults to chart_context.series_field.",
            "Result is a row list keyed by `by`, not a single scalar.",
            "Difference direction is groupA - groupB (signed=true).",
        ),
    ),
    OpContract(
        op_name="nth",
        model_cls=NthOp,
        required_fields=("n",),
        semantic_rules=(
            "n is 1-based rank index (1 = first/top, 2 = second, etc.).",
            "n can also be a list of integers to select multiple ranks.",
            "Typically applied after sort to pick the n-th ranked row.",
            "Result is a scalar (single target-value pair).",
        ),
    ),
    OpContract(
        op_name="count",
        model_cls=CountOp,
        required_fields=tuple(),
        semantic_rules=(
            "Returns the count of rows as a scalar.",
            "group restricts to a specific series slice before counting.",
            "Typically applied after filter to count how many rows pass the filter.",
        ),
    ),
    OpContract(
        op_name="add",
        model_cls=AddOp,
        required_fields=("targetA", "targetB"),
        semantic_rules=(
            "Adds two scalar values and returns one scalar result.",
            "targetA and targetB must be scalar refs ('ref:nX') or numeric literals.",
            "add is scalar arithmetic only; use sum for dataset row aggregation.",
        ),
    ),
    OpContract(
        op_name="scale",
        model_cls=ScaleOp,
        required_fields=("target", "factor"),
        semantic_rules=(
            "Scales a scalar target by a constant factor and returns one scalar result.",
            "target must be a scalar ref string ('ref:nX') or a numeric literal.",
            "factor must be a numeric multiplier (e.g., 2.0 for doubling).",
        ),
    ),
    OpContract(
        op_name="setOp",
        model_cls=SetOp,
        required_fields=("fn",),
        semantic_rules=(
            "fn must be 'intersection' or 'union'.",
            "inputs must contain at least two nodeIds (passed via meta.inputs, not op_spec).",
            "intersection returns targets present in ALL input node results.",
            "union returns targets present in ANY input node result.",
        ),
    ),
)

OP_REGISTRY: Dict[str, OpContract] = {contract.op_name: contract for contract in _OP_SEQUENCE}
LEGACY_NON_DRAW_OPS: Tuple[str, ...] = tuple(contract.op_name for contract in _OP_SEQUENCE if contract.op_name != "setOp")
ALLOWED_OPS: Tuple[str, ...] = tuple(contract.op_name for contract in _OP_SEQUENCE)

def list_contracts() -> Tuple[OpContract, ...]:
    # Stable ordering for UI/docs: keep the declared sequence.
    return _OP_SEQUENCE


def get_contract(op_name: str) -> OpContract:
    if op_name not in OP_REGISTRY:
        raise KeyError(f"Unknown op contract: {op_name}")
    return OP_REGISTRY[op_name]


def build_ops_contract_for_prompt() -> Dict[str, object]:
    all_fields: List[str] = sorted(
        {field_name for contract in _OP_SEQUENCE for field_name in _alias_fields(contract.model_cls)}
    )

    op_contracts: Dict[str, Dict[str, object]] = {}
    for contract in _OP_SEQUENCE:
        allowed = set(_alias_fields(contract.model_cls))
        required = set(contract.required_fields)
        optional = sorted(allowed - required)
        forbidden = sorted(set(all_fields) - allowed)
        op_contracts[contract.op_name] = {
            "required_fields": sorted(required),
            "optional_fields": optional,
            "forbidden_fields": forbidden,
            "semantic_rules": list(contract.semantic_rules),
        }

    return {
        "allowed_ops": list(ALLOWED_OPS),
        "legacy_non_draw_ops": list(LEGACY_NON_DRAW_OPS),
        "common_fields": list(COMMON_FIELDS),
        "op_contracts": op_contracts,
        "meta_rules": {
            "nodeId": "required per op",
            "inputs": "dependency edge nodeIds",
            "sentenceIndex": "required (must match sentence-layer group)",
            "view": "optional rendering hints only",
        },
    }
