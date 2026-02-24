from __future__ import annotations

from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.types import constr

from .specs.base import OpsMetaView
from .specs.union import OperationSpec
from .types import JsonValue, PrimitiveValue


class NumericStats(BaseModel):
    min: float
    max: float
    mean: float

    model_config = ConfigDict(extra="forbid")


class ChartContext(BaseModel):
    fields: List[str] = Field(..., min_length=1)
    dimension_fields: List[str] = Field(default_factory=list)
    measure_fields: List[str] = Field(default_factory=list)
    primary_dimension: str = Field(..., min_length=1)
    primary_measure: str = Field(..., min_length=1)
    series_field: Optional[str] = None
    categorical_values: Dict[str, List[PrimitiveValue]] = Field(default_factory=dict)
    field_types: Dict[str, Literal["numeric", "categorical", "unknown"]] = Field(default_factory=dict)
    numeric_stats: Dict[str, NumericStats] = Field(default_factory=dict)
    mark: str = "unknown"
    is_stacked: bool = False
    encoding_summary: Dict[str, Dict[str, JsonValue]] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


NodeId = constr(pattern=r"^n[0-9]+$")  # type: ignore[valid-type]
# Sentence-layer groups only:
# - sentence 1 -> "ops"
# - sentence k -> f"ops{k}" for k>=2
GroupName = constr(pattern=r"^(ops|ops[2-9]|ops[1-9][0-9]+)$")  # type: ignore[valid-type]

# Decompose/Ground plan params must be flat to avoid invented nested schemas.
FlatValue = Union[str, int, float, bool, None, List[Union[str, int, float, bool, None]]]


class PlanNode(BaseModel):
    nodeId: NodeId
    op: str = Field(..., min_length=1)
    group: GroupName = "ops"
    params: Dict[str, FlatValue] = Field(default_factory=dict)
    inputs: List[NodeId] = Field(default_factory=list)
    sentenceIndex: int = Field(..., ge=1)
    view: Optional[OpsMetaView] = None
    id: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class PlanTree(BaseModel):
    nodes: List[PlanNode] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class GroundedPlanTree(BaseModel):
    nodes: List[PlanNode] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class PipelineTrace(BaseModel):
    context_built: Dict[str, JsonValue]
    decompose_plan: Dict[str, JsonValue]
    ground_plan: Dict[str, JsonValue]
    compile_opsspec: Dict[str, JsonValue]
    canonicalized: Dict[str, JsonValue]

    model_config = ConfigDict(extra="forbid")


class GenerateOpsSpecResponse(BaseModel):
    ops_spec: Dict[str, List[OperationSpec]] = Field(default_factory=dict)
    chart_context: ChartContext
    warnings: List[str] = Field(default_factory=list)
    trace: Optional[PipelineTrace] = None

    model_config = ConfigDict(extra="forbid")
