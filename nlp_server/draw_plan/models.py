from __future__ import annotations

from typing import Annotated, Dict, List, Literal, TypeAlias, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

PrimitiveValue = Union[str, int, float, bool]


class DrawMeta(BaseModel):
    source: str = "python-draw-plan"
    nodeId: str | None = None
    sentenceIndex: int | None = None
    inputs: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class DrawSelect(BaseModel):
    mark: Literal["rect", "path", "circle"] | None = None
    keys: List[PrimitiveValue] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class DrawStyle(BaseModel):
    color: str | None = None
    opacity: float | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineStyle(BaseModel):
    stroke: str | None = None
    strokeWidth: float | None = None
    opacity: float | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineHorizontalSpec(BaseModel):
    y: float

    model_config = ConfigDict(extra="forbid")


class DrawLineSpec(BaseModel):
    mode: Literal["horizontal-from-y"]
    hline: DrawLineHorizontalSpec
    style: DrawLineStyle | None = None

    model_config = ConfigDict(extra="forbid")


class DrawGroupFilterSpec(BaseModel):
    groups: List[PrimitiveValue] | None = None
    include: List[PrimitiveValue] | None = None
    keep: List[PrimitiveValue] | None = None
    exclude: List[PrimitiveValue] | None = None
    reset: bool | None = None

    model_config = ConfigDict(extra="forbid")


class DrawOpBase(BaseModel):
    op: Literal["draw"] = "draw"
    action: str
    chartId: str | None = None
    meta: DrawMeta = Field(default_factory=DrawMeta)

    model_config = ConfigDict(extra="forbid")


class DrawClearOp(DrawOpBase):
    action: Literal["clear"] = "clear"


class DrawHighlightOp(DrawOpBase):
    action: Literal["highlight"] = "highlight"
    select: DrawSelect = Field(default_factory=DrawSelect)
    style: DrawStyle | None = None


class DrawLineOp(DrawOpBase):
    action: Literal["line"] = "line"
    line: DrawLineSpec


class DrawStackedFilterGroupsOp(DrawOpBase):
    action: Literal["stacked-filter-groups"] = "stacked-filter-groups"
    groupFilter: DrawGroupFilterSpec


class DrawGroupedFilterGroupsOp(DrawOpBase):
    action: Literal["grouped-filter-groups"] = "grouped-filter-groups"
    groupFilter: DrawGroupFilterSpec


DrawOperation: TypeAlias = Annotated[
    Union[
        DrawClearOp,
        DrawHighlightOp,
        DrawLineOp,
        DrawStackedFilterGroupsOp,
        DrawGroupedFilterGroupsOp,
    ],
    Field(discriminator="action"),
]

DrawOperationAdapter = TypeAdapter(DrawOperation)
DrawOpsGroupMap = Dict[str, List[DrawOperation]]


def dump_draw_groups(groups: DrawOpsGroupMap) -> Dict[str, List[Dict[str, object]]]:
    return {
        group_name: [op.model_dump(by_alias=True, exclude_none=True) for op in ops]
        for group_name, ops in groups.items()
    }

