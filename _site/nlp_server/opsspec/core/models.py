from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.types import constr

from ..specs.union import OperationSpec
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

# Sentence-layer groups:
# - sentence 1 -> "ops"
# - sentence k -> f"ops{k}" for k>=2
GroupName = constr(pattern=r"^(ops|ops[2-9]|ops[1-9][0-9]+)$")  # type: ignore[valid-type]


class RecursiveStepTrace(BaseModel):
    step: int = Field(..., ge=1)
    taskId: str = Field(..., min_length=1)
    nodeId: NodeId
    groupName: GroupName
    op: str = Field(..., min_length=1)
    inputs: List[NodeId] = Field(default_factory=list)
    scalarRefs: List[NodeId] = Field(default_factory=list)
    grounded_op_spec: Dict[str, JsonValue] = Field(default_factory=dict)
    artifact: Dict[str, JsonValue] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class RecursivePipelineTrace(BaseModel):
    context_built: Dict[str, JsonValue] = Field(default_factory=dict)
    inventory: Dict[str, JsonValue] = Field(default_factory=dict)
    steps: List[RecursiveStepTrace] = Field(default_factory=list)
    finalized: Dict[str, JsonValue] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class GenerateOpsSpecResponse(BaseModel):
    ops_spec: Dict[str, List[OperationSpec]] = Field(default_factory=dict)
    chart_context: ChartContext
    warnings: List[str] = Field(default_factory=list)
    trace: Optional[RecursivePipelineTrace] = None

    model_config = ConfigDict(extra="forbid")
