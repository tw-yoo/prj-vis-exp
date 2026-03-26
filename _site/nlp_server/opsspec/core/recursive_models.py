from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.types import constr

from .types import JsonValue


TaskId = constr(pattern=r"^o[0-9]+$")  # type: ignore[valid-type]


class OpTask(BaseModel):
    """
    An extracted "operation task" from the explanation text.

    - taskId is stable within a single request (o1, o2, ...)
    - op is one of op_registry.allowed_ops (validated later)
    - sentenceIndex ties the task to a sentence-layer group ("ops", "ops2", ...)
    - paramsHint is a *flat* hint dict (no nested objects) to keep prompting stable
    """

    taskId: TaskId
    op: str = Field(..., min_length=1)
    sentenceIndex: int = Field(..., ge=1)
    mention: str = Field(..., min_length=1)
    paramsHint: Dict[str, JsonValue] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class OpInventory(BaseModel):
    tasks: List[OpTask] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class StepComposeOutput(BaseModel):
    pickTaskId: Optional[TaskId] = None
    op_spec: Dict[str, JsonValue] = Field(default_factory=dict)
    inputs: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
