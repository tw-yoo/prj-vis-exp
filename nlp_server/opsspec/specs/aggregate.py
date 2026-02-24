from __future__ import annotations

from typing import Literal, Optional

from ..types import JsonValue
from .base import BaseOpFields


class RetrieveValueOp(BaseOpFields):
    op: Literal["retrieveValue"] = "retrieveValue"
    field: Optional[str] = None
    target: Optional[JsonValue] = None
    group: Optional[str] = None


class AverageOp(BaseOpFields):
    op: Literal["average"] = "average"
    field: Optional[str] = None
    group: Optional[str] = None


class SumOp(BaseOpFields):
    op: Literal["sum"] = "sum"
    field: Optional[str] = None
    group: Optional[str] = None


class CountOp(BaseOpFields):
    op: Literal["count"] = "count"
    field: Optional[str] = None
    group: Optional[str] = None
