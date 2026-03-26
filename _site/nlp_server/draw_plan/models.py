from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, TypeAlias, Union

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


class DrawBandStyle(BaseModel):
    fill: str | None = None
    opacity: float | None = None
    stroke: str | None = None
    strokeWidth: float | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineHorizontalSpec(BaseModel):
    y: float

    model_config = ConfigDict(extra="forbid")


class DrawLinePairSpec(BaseModel):
    x: List[PrimitiveValue] = Field(min_length=2, max_length=2)

    model_config = ConfigDict(extra="forbid")


class DrawLineConnectEndpoint(BaseModel):
    target: PrimitiveValue
    series: PrimitiveValue | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineConnectBySpec(BaseModel):
    start: DrawLineConnectEndpoint
    end: DrawLineConnectEndpoint

    model_config = ConfigDict(extra="forbid")


class DrawLinePanelScalarEndpoint(BaseModel):
    chartId: str
    value: float
    nodeId: str | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLinePanelScalarConnectSpec(BaseModel):
    start: DrawLinePanelScalarEndpoint
    end: DrawLinePanelScalarEndpoint
    orientationHint: Literal["horizontal", "vertical"] | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineHorizontalFromYSpec(BaseModel):
    mode: Literal["horizontal-from-y"] = "horizontal-from-y"
    hline: DrawLineHorizontalSpec
    style: DrawLineStyle | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineConnectSpec(BaseModel):
    mode: Literal["connect"] = "connect"
    pair: DrawLinePairSpec | None = None
    connectBy: DrawLineConnectBySpec | None = None
    panelScalar: DrawLinePanelScalarConnectSpec | None = None
    style: DrawLineStyle | None = None

    model_config = ConfigDict(extra="forbid")


class DrawLineConnectPanelScalarSpec(BaseModel):
    mode: Literal["connect-panel-scalar"] = "connect-panel-scalar"
    panelScalar: DrawLinePanelScalarConnectSpec
    style: DrawLineStyle | None = None

    model_config = ConfigDict(extra="forbid")


DrawLineSpec: TypeAlias = Annotated[
    Union[
        DrawLineHorizontalFromYSpec,
        DrawLineConnectSpec,
        DrawLineConnectPanelScalarSpec,
    ],
    Field(discriminator="mode"),
]


class DrawGroupFilterSpec(BaseModel):
    groups: List[PrimitiveValue] | None = None
    include: List[PrimitiveValue] | None = None
    keep: List[PrimitiveValue] | None = None
    exclude: List[PrimitiveValue] | None = None
    reset: bool | None = None

    model_config = ConfigDict(extra="forbid")


class DrawSplitPanelSelector(BaseModel):
    include: List[PrimitiveValue] | None = None
    exclude: List[PrimitiveValue] | None = None
    all: bool | None = None

    model_config = ConfigDict(extra="forbid")


class DrawSplitSpec(BaseModel):
    mode: Literal["domain", "selector"] | None = None
    by: Literal["x"] | None = None
    groups: Dict[str, List[PrimitiveValue]] = Field(default_factory=dict)
    selectors: Dict[str, DrawSplitPanelSelector] | None = None
    restTo: str | None = None
    orientation: Literal["vertical", "horizontal"] | None = None

    model_config = ConfigDict(extra="forbid")


class DrawBandSpec(BaseModel):
    axis: Literal["x", "y"]
    range: List[PrimitiveValue] = Field(min_length=2, max_length=2)
    label: str | None = None
    style: DrawBandStyle | None = None

    model_config = ConfigDict(extra="forbid")


class DrawSumSpec(BaseModel):
    value: float
    label: str | None = None

    model_config = ConfigDict(extra="forbid")


class DrawScalarPanelValue(BaseModel):
    label: str
    value: float

    model_config = ConfigDict(extra="forbid")


class DrawScalarPanelDelta(BaseModel):
    label: str | None = None
    value: float

    model_config = ConfigDict(extra="forbid")


class DrawScalarPanelPosition(BaseModel):
    x: float
    y: float
    width: float
    height: float

    model_config = ConfigDict(extra="forbid")


class DrawScalarPanelStyle(BaseModel):
    leftFill: str | None = None
    rightFill: str | None = None
    panelFill: str | None = None
    panelStroke: str | None = None
    lineStroke: str | None = None
    arrowStroke: str | None = None
    textColor: str | None = None

    model_config = ConfigDict(extra="forbid")


class DrawScalarPanelSpec(BaseModel):
    mode: Literal["base", "diff"] = "base"
    layout: Literal["inset", "full-replace"] | None = None
    absolute: bool | None = None
    left: DrawScalarPanelValue
    right: DrawScalarPanelValue
    delta: DrawScalarPanelDelta | None = None
    position: DrawScalarPanelPosition | None = None
    style: DrawScalarPanelStyle | None = None

    model_config = ConfigDict(extra="forbid")


class DrawOpBase(BaseModel):
    op: Literal["draw"] = "draw"
    action: str
    chartId: str | None = None
    meta: DrawMeta = Field(default_factory=DrawMeta)

    model_config = ConfigDict(extra="forbid")


class DrawClearOp(DrawOpBase):
    action: Literal["clear"] = "clear"


class DrawSplitOp(DrawOpBase):
    action: Literal["split"] = "split"
    split: DrawSplitSpec


class DrawUnsplitOp(DrawOpBase):
    action: Literal["unsplit"] = "unsplit"


class DrawHighlightOp(DrawOpBase):
    action: Literal["highlight"] = "highlight"
    select: DrawSelect = Field(default_factory=DrawSelect)
    style: DrawStyle | None = None


class DrawLineOp(DrawOpBase):
    action: Literal["line"] = "line"
    line: DrawLineSpec


class DrawTextStyle(BaseModel):
    color: str | None = None
    fontSize: float | None = None
    fontWeight: str | int | None = None
    opacity: float | None = None

    model_config = ConfigDict(extra="forbid")


class DrawTextNormalizedPosition(BaseModel):
    x: float
    y: float

    model_config = ConfigDict(extra="forbid")


class DrawTextSpec(BaseModel):
    value: str
    mode: Literal["normalized"] = "normalized"
    # Normalized coordinates follow frontend runtime convention: x,y in [0,1], y=0(bottom), y=1(top).
    position: DrawTextNormalizedPosition = Field(default_factory=lambda: DrawTextNormalizedPosition(x=0.92, y=0.92))
    style: DrawTextStyle | None = None

    model_config = ConfigDict(extra="forbid")


class DrawTextOp(DrawOpBase):
    action: Literal["text"] = "text"
    text: DrawTextSpec


class DrawStackedFilterGroupsOp(DrawOpBase):
    action: Literal["stacked-filter-groups"] = "stacked-filter-groups"
    groupFilter: DrawGroupFilterSpec


class DrawGroupedFilterGroupsOp(DrawOpBase):
    action: Literal["grouped-filter-groups"] = "grouped-filter-groups"
    groupFilter: DrawGroupFilterSpec


class DrawBandOp(DrawOpBase):
    action: Literal["band"] = "band"
    band: DrawBandSpec


class DrawSumOp(DrawOpBase):
    action: Literal["sum"] = "sum"
    sum: DrawSumSpec


class DrawScalarPanelOp(DrawOpBase):
    action: Literal["scalar-panel"] = "scalar-panel"
    scalarPanel: DrawScalarPanelSpec


DrawOperation: TypeAlias = Annotated[
    Union[
        DrawClearOp,
        DrawSplitOp,
        DrawUnsplitOp,
        DrawHighlightOp,
        DrawLineOp,
        DrawTextOp,
        DrawStackedFilterGroupsOp,
        DrawGroupedFilterGroupsOp,
        DrawBandOp,
        DrawSumOp,
        DrawScalarPanelOp,
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


def validate_draw_groups_payload(payload: Dict[str, Any]) -> Dict[str, List[Dict[str, object]]]:
    if not isinstance(payload, dict):
        raise ValueError("draw plan payload must be an object")
    validated: Dict[str, List[Dict[str, object]]] = {}
    for group_name, ops in payload.items():
        if not isinstance(group_name, str) or not group_name:
            raise ValueError(f'Invalid draw group name: "{group_name}"')
        if not isinstance(ops, list):
            raise ValueError(f'draw plan group "{group_name}" must be a list')
        validated_ops: List[Dict[str, object]] = []
        for idx, op_payload in enumerate(ops):
            try:
                parsed = DrawOperationAdapter.validate_python(op_payload)
            except Exception as exc:
                raise ValueError(f'draw plan group "{group_name}" op[{idx}] schema error: {exc}') from exc
            validated_ops.append(parsed.model_dump(by_alias=True, exclude_none=True))
        validated[group_name] = validated_ops
    return validated
