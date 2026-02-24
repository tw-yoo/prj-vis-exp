from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class OpsMetaView(BaseModel):
    split: Optional[Literal["vertical", "horizontal", "none"]] = None
    align: Optional[Literal["x", "y", "none"]] = None
    highlight: Optional[bool] = None
    reference_line: Optional[bool] = None
    note: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class OpsMeta(BaseModel):
    nodeId: Optional[str] = None
    inputs: List[str] = Field(default_factory=list)
    sentenceIndex: Optional[int] = None
    view: Optional[OpsMetaView] = None
    source: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class BaseOpFields(BaseModel):
    op: str
    id: Optional[str] = None
    # meta is required for all ops (tree/DAG reconstruction), but we allow
    # producers to omit it and fill a default here. Canonicalization will
    # then enforce deterministic nodeId/inputs.
    meta: OpsMeta = Field(default_factory=OpsMeta)
    chartId: Optional[str] = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
