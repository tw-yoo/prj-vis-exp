from __future__ import annotations

from typing import List, Literal, Optional

from ..core.types import JsonValue, PrimitiveValue
from .base import BaseOpFields


class FilterOp(BaseOpFields):
    op: Literal["filter"] = "filter"
    field: str
    include: Optional[List[PrimitiveValue]] = None
    exclude: Optional[List[PrimitiveValue]] = None
    operator: Optional[str] = None
    value: Optional[JsonValue] = None
    group: Optional[str] = None
