from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from opsspec.models import ChartContext as OpsChartContext, PipelineTrace
from opsspec.specs.union import OperationSpec


class LambdaChartContext(BaseModel):
    fields: List[str] = Field(..., min_length=1)
    dimension_fields: List[str] = Field(default_factory=list)
    measure_fields: List[str] = Field(default_factory=list)
    primary_dimension: str = Field(..., min_length=1)
    primary_measure: str = Field(..., min_length=1)
    series_field: Optional[str] = None
    categorical_values: dict[str, List[str]] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class GenerateLambdaRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Reasoning trace text")
    chart_context: LambdaChartContext

    model_config = ConfigDict(extra="forbid")


class LambdaStep(BaseModel):
    step: int = Field(..., ge=1)
    operation: str = Field(..., min_length=1)
    target: Optional[str] = None
    target_a: Optional[str] = None
    target_b: Optional[str] = None
    group: Optional[str] = None
    group_by: Optional[str] = None
    condition: Optional[str] = None
    output_variable: Optional[str] = None
    input_variable: Optional[str] = None
    field: Optional[str] = None
    value: Optional[Union[str, int, float, bool, List[Union[str, int, float, bool]]]] = None
    operator: Optional[str] = None
    which: Optional[str] = None
    order: Optional[str] = None
    order_field: Optional[str] = None
    n: Optional[int] = None
    from_: Optional[str] = Field(default=None, alias="from")
    mode: Optional[str] = None
    signed: Optional[bool] = None
    aggregate: Optional[str] = None
    precision: Optional[int] = None
    branch: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class SyntaxToken(BaseModel):
    id: int
    text: str
    lemma: Optional[str] = None
    upos: Optional[str] = None
    head: Optional[int] = None
    deprel: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class SyntaxFeature(BaseModel):
    sentence_index: int
    text: str
    root_action: str
    target_hint: Optional[str] = None
    condition_hint: Optional[str] = None
    mark_terms: List[str] = Field(default_factory=list)
    descriptive_terms: List[str] = Field(default_factory=list)
    visual_attribute_terms: List[str] = Field(default_factory=list)
    visual_operation_terms: List[str] = Field(default_factory=list)
    tokens: List[SyntaxToken] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class RewriteTraceStep(BaseModel):
    step: str
    before: str
    after: str

    model_config = ConfigDict(extra="forbid")


class OpsSpecOperation(BaseModel):
    op: str = Field(..., min_length=1)
    chartId: Optional[str] = None
    field: Optional[str] = None
    include: Optional[List[Union[str, int, float]]] = None
    exclude: Optional[List[Union[str, int, float]]] = None
    operator: Optional[str] = None
    value: Optional[Union[str, int, float, bool, List[Union[str, int, float, bool]]]] = None
    group: Optional[str] = None
    groupA: Optional[str] = None
    groupB: Optional[str] = None
    aggregate: Optional[str] = None
    which: Optional[str] = None
    order: Optional[str] = None
    orderField: Optional[str] = None
    signed: Optional[bool] = None
    mode: Optional[str] = None
    percent: Optional[bool] = None
    scale: Optional[float] = None
    precision: Optional[int] = None
    target: Optional[Union[str, int, float, List[Union[str, int, float]], dict]] = None
    targetA: Optional[Union[str, int, float, List[Union[str, int, float]], dict]] = None
    targetB: Optional[Union[str, int, float, List[Union[str, int, float]], dict]] = None
    targetName: Optional[str] = None
    n: Optional[Union[int, List[int]]] = None
    from_: Optional[str] = Field(default=None, alias="from")
    absolute: Optional[bool] = None
    seconds: Optional[float] = None
    duration: Optional[float] = None
    id: Optional[str] = None
    key: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class GenerateLambdaResponse(BaseModel):
    resolved_text: str
    lambda_expression: List[LambdaStep]
    ops_spec: dict[str, List[OpsSpecOperation]] = Field(default_factory=dict)
    syntax_features: List[SyntaxFeature] = Field(default_factory=list)
    mark_terms: List[str] = Field(default_factory=list)
    visual_terms: List[str] = Field(default_factory=list)
    rewrite_trace: List[RewriteTraceStep] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class GenerateGrammarRequest(BaseModel):
    question: str = Field(..., min_length=1)
    explanation: str = Field(..., min_length=1)
    vega_lite_spec: dict = Field(..., description="Vega-Lite spec JSON")
    data_rows: list[dict] = Field(..., description="Raw data rows (<500 lines assumed)")
    debug: bool = False

    model_config = ConfigDict(extra="forbid")


class GenerateGrammarResponse(BaseModel):
    ops_spec: dict[str, list[OperationSpec]] = Field(default_factory=dict)
    chart_context: OpsChartContext
    warnings: list[str] = Field(default_factory=list)
    trace: PipelineTrace | None = None

    model_config = ConfigDict(extra="forbid")


class RunPythonPlanRequest(BaseModel):
    scenario_path: str = Field(..., min_length=1)
    debug: bool = False

    model_config = ConfigDict(extra="forbid")


class RunPythonPlanResponse(BaseModel):
    scenario_path: str = Field(..., min_length=1)
    vega_lite_spec: dict = Field(default_factory=dict)
    draw_plan: dict[str, list[dict]] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class CanonicalizeOpsSpecRequest(BaseModel):
    question: str = Field(..., min_length=1)
    explanation: str = Field(..., min_length=1)
    vega_lite_spec: dict = Field(..., description="Vega-Lite spec JSON")
    data_rows: list[dict] = Field(..., description="Raw data rows (<500 lines assumed)")
    ops_spec: dict[str, list[dict]] = Field(default_factory=dict, description="OpsSpec group map (raw dict ops)")

    model_config = ConfigDict(extra="forbid")


class CanonicalizeOpsSpecResponse(BaseModel):
    ops_spec: dict[str, list[dict]] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    chart_context: OpsChartContext

    model_config = ConfigDict(extra="forbid")
