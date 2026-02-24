from __future__ import annotations

from typing import Literal, Optional

from ..types import JsonValue
from .base import BaseOpFields


class CompareOp(BaseOpFields):
    op: Literal["compare"] = "compare"
    field: Optional[str] = None
    targetA: Optional[JsonValue] = None
    targetB: Optional[JsonValue] = None
    group: Optional[str] = None
    groupA: Optional[str] = None
    groupB: Optional[str] = None
    aggregate: Optional[str] = None
    which: Optional[Literal["max", "min"]] = None


class CompareBoolOp(BaseOpFields):
    op: Literal["compareBool"] = "compareBool"
    field: Optional[str] = None
    targetA: Optional[JsonValue] = None
    targetB: Optional[JsonValue] = None
    group: Optional[str] = None
    groupA: Optional[str] = None
    groupB: Optional[str] = None
    aggregate: Optional[str] = None
    operator: Optional[str] = None


class DiffOp(BaseOpFields):
    op: Literal["diff"] = "diff"
    field: Optional[str] = None
    targetA: Optional[JsonValue] = None
    targetB: Optional[JsonValue] = None
    group: Optional[str] = None
    groupA: Optional[str] = None
    groupB: Optional[str] = None
    aggregate: Optional[str] = None
    signed: Optional[bool] = None
    mode: Optional[str] = None
    percent: Optional[bool] = None
    scale: Optional[float] = None
    precision: Optional[int] = None
    targetName: Optional[str] = None


class LagDiffOp(BaseOpFields):
    op: Literal["lagDiff"] = "lagDiff"
    field: Optional[str] = None
    group: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = None
    absolute: Optional[bool] = None
