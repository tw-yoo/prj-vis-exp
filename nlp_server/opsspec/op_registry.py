from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple, Type

from .specs.aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from .specs.base import BaseOpFields
from .specs.compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp
from .specs.filter import FilterOp
from .specs.range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from .specs.set_op import SetOp

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
            "Use target for selector values or scalar refs.",
            "If group is set, restrict rows by series/group first.",
        ),
    ),
    OpContract(
        op_name="filter",
        model_cls=FilterOp,
        required_fields=("field",),
        semantic_rules=(
            "Use membership(include/exclude) OR comparison(operator+value), never both.",
            "field must be one of chart_context.fields.",
        ),
    ),
    OpContract(
        op_name="findExtremum",
        model_cls=FindExtremumOp,
        required_fields=tuple(),
        semantic_rules=("which defaults to max when missing.",),
    ),
    OpContract(
        op_name="determineRange",
        model_cls=DetermineRangeOp,
        required_fields=tuple(),
        semantic_rules=("If field is categorical, return min/max target labels.",),
    ),
    OpContract(
        op_name="compare",
        model_cls=CompareOp,
        required_fields=tuple(),
        semantic_rules=("compare targetA and targetB (or aggregated slices) and return selected side.",),
    ),
    OpContract(
        op_name="compareBool",
        model_cls=CompareBoolOp,
        required_fields=("operator",),
        semantic_rules=("operator is required.",),
    ),
    OpContract(
        op_name="sort",
        model_cls=SortOp,
        required_fields=tuple(),
        semantic_rules=("order defaults to asc when missing.",),
    ),
    OpContract(
        op_name="sum",
        model_cls=SumOp,
        required_fields=tuple(),
        semantic_rules=("field should be numeric measure field.",),
    ),
    OpContract(
        op_name="average",
        model_cls=AverageOp,
        required_fields=tuple(),
        semantic_rules=("field defaults to chart_context.primary_measure when missing.",),
    ),
    OpContract(
        op_name="diff",
        model_cls=DiffOp,
        required_fields=tuple(),
        semantic_rules=("Uses scalar refs or aggregated targetA/targetB slices.",),
    ),
    OpContract(
        op_name="lagDiff",
        model_cls=LagDiffOp,
        required_fields=tuple(),
        semantic_rules=("Computes adjacent delta by target order.",),
    ),
    OpContract(
        op_name="nth",
        model_cls=NthOp,
        required_fields=("n",),
        semantic_rules=("n is 1-based index.",),
    ),
    OpContract(
        op_name="count",
        model_cls=CountOp,
        required_fields=tuple(),
        semantic_rules=("Returns count as scalar datum.",),
    ),
    OpContract(
        op_name="setOp",
        model_cls=SetOp,
        required_fields=("fn",),
        semantic_rules=(
            "fn must be intersection or union.",
            "meta.inputs must contain at least two nodeIds.",
        ),
    ),
)

OP_REGISTRY: Dict[str, OpContract] = {contract.op_name: contract for contract in _OP_SEQUENCE}
LEGACY_NON_DRAW_OPS: Tuple[str, ...] = tuple(contract.op_name for contract in _OP_SEQUENCE if contract.op_name != "setOp")
ALLOWED_OPS: Tuple[str, ...] = tuple(contract.op_name for contract in _OP_SEQUENCE)


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
