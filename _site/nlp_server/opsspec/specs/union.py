from __future__ import annotations

from typing import Annotated, Any, Dict, List, TypeAlias, Union

from pydantic import Field, TypeAdapter

from .add import AddOp
from .aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from .compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp, PairDiffOp
from .filter import FilterOp
from .range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from .scale import ScaleOp
from .set_op import SetOp

OperationSpec: TypeAlias = Annotated[
    Union[
        RetrieveValueOp,
        FilterOp,
        FindExtremumOp,
        DetermineRangeOp,
        CompareOp,
        CompareBoolOp,
        SortOp,
        SumOp,
        AverageOp,
        DiffOp,
        LagDiffOp,
        PairDiffOp,
        NthOp,
        CountOp,
        AddOp,
        ScaleOp,
        SetOp,
    ],
    Field(discriminator="op"),
]

OperationSpecAdapter = TypeAdapter(OperationSpec)


def parse_operation_spec(raw: Dict[str, Any]) -> OperationSpec:
    return OperationSpecAdapter.validate_python(raw)
