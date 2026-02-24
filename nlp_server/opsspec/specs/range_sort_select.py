from __future__ import annotations

from typing import List, Literal, Optional, Union

from pydantic import Field

from .base import BaseOpFields


class FindExtremumOp(BaseOpFields):
    op: Literal["findExtremum"] = "findExtremum"
    field: Optional[str] = None
    group: Optional[str] = None
    which: Optional[Literal["max", "min"]] = None


class DetermineRangeOp(BaseOpFields):
    op: Literal["determineRange"] = "determineRange"
    field: Optional[str] = None
    group: Optional[str] = None


class SortOp(BaseOpFields):
    op: Literal["sort"] = "sort"
    field: Optional[str] = None
    group: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = None
    orderField: Optional[str] = None


class NthOp(BaseOpFields):
    op: Literal["nth"] = "nth"
    field: Optional[str] = None
    group: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = None
    orderField: Optional[str] = None
    n: Optional[Union[int, List[int]]] = None
    from_: Optional[Literal["left", "right"]] = Field(default=None, alias="from")
