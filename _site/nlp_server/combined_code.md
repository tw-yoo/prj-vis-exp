## core/datum.py

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(slots=True)
class DatumValue:
    category: Optional[str]
    measure: Optional[str]
    target: str
    group: Optional[str]
    value: float
    id: Optional[str] = None
    name: Optional[str] = None
    lookup_id: Optional[str] = None
    prev_target: Optional[str] = None
    series: Optional[str] = None


```

## core/llm.py

```python
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Type

from pydantic import BaseModel

try:
    import instructor
except ImportError:  # pragma: no cover
    instructor = None

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

logger = logging.getLogger(__name__)


class StructuredLLMClient:
    def __init__(
        self,
        ollama_model: str,
        ollama_base_url: str,
        ollama_api_key: str,
        instructor_mode: str = "JSON",
    ) -> None:
        self.ollama_model = ollama_model
        self.ollama_base_url = ollama_base_url
        self.ollama_api_key = ollama_api_key
        self.instructor_mode = instructor_mode
        self.backend: Optional[str] = None
        self.client: Any = None

    def load(self) -> None:
        if self.backend is not None:
            return

        forced_backend = os.getenv("LLM_BACKEND", "").strip().lower()
        has_openai_key = bool(os.getenv("OPENAI_API_KEY", "").strip())

        # Default to ChatGPT/OpenAI API when credentials are available.
        # Use LLM_BACKEND to override (e.g., "ollama" for local runs).
        if forced_backend in {"", "openai", "chatgpt"} and has_openai_key:
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
            self.backend = "openai_http"
            self.client = None
            logger.info(
                "LLM backend: openai_http | model=%s base_url=%s",
                model,
                os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            )
            return

        if forced_backend in {"openai", "chatgpt"} and not has_openai_key:
            raise RuntimeError("LLM_BACKEND=openai requires OPENAI_API_KEY.")

        if instructor is not None and OpenAI is not None:
            base = OpenAI(base_url=self.ollama_base_url, api_key=self.ollama_api_key)
            mode = getattr(getattr(instructor, "Mode", None), self.instructor_mode, None)
            if mode is None:
                mode = instructor.Mode.JSON
            self.client = instructor.from_openai(base, mode=mode)
            self.backend = "instructor_openai"
            logger.info(
                "LLM backend: instructor_openai | model=%s base_url=%s mode=%s",
                self.ollama_model,
                self.ollama_base_url,
                self.instructor_mode,
            )
            return

        self.backend = "ollama_native"
        self.client = None
        logger.warning(
            "LLM backend: ollama_native (fallback) | model=%s base_url=%s"
            " — instructor/openai not installed.",
            self.ollama_model,
            self.ollama_base_url,
        )

    def complete(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        if self.backend == "instructor_openai":
            return self._complete_instructor(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                task_name=task_name,
            )
        if self.backend == "openai_http":
            return self._complete_openai_http(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                task_name=task_name,
            )
        if self.backend == "ollama_native":
            return self._complete_native(
                response_model=response_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
        raise RuntimeError("LLM backend is not initialized.")

    def _complete_instructor(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        try:
            parsed = self.client.chat.completions.create(
                model=self.ollama_model,
                response_model=response_model,
                temperature=0,
                top_p=1,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                extra_body={
                    "format": response_model.model_json_schema(),
                    "options": {"temperature": 0, "top_p": 1},
                },
            )
        except Exception as exc:
            raise RuntimeError(f"{task_name} completion failed: {exc}") from exc

        try:
            payload = parsed if isinstance(parsed, dict) else parsed.model_dump()
            validated = response_model.model_validate(payload)
            return validated.model_dump(by_alias=True)
        except Exception as exc:
            raise RuntimeError(f"{task_name} response validation failed: {exc}") from exc

    def _complete_native(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        base_url = self.ollama_base_url.rstrip("/")
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]
        endpoint = f"{base_url}/api/chat"
        payload = {
            "model": self.ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "format": response_model.model_json_schema(),
            "options": {"temperature": 0, "top_p": 1},
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Ollama HTTP error ({exc.code}): {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to call Ollama native API: {exc}") from exc

        try:
            outer = json.loads(raw)
            inner = json.loads(outer["message"]["content"])
            validated = response_model.model_validate(inner)
            return validated.model_dump(by_alias=True)
        except Exception as exc:
            raise RuntimeError(f"Failed to parse native structured output: {exc}") from exc

    def _complete_openai_http(
        self,
        *,
        response_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        task_name: str,
    ) -> Dict[str, Any]:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        endpoint = f"{base_url}/chat/completions"

        payload = {
            "model": model,
            "temperature": 0,
            "top_p": 1,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            # Ask for JSON object; we still validate using Pydantic after parsing.
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"OpenAI HTTP error ({exc.code}): {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Failed to call OpenAI API: {exc}") from exc

        try:
            outer = json.loads(raw)
            content = outer["choices"][0]["message"]["content"]
            inner = json.loads(content) if isinstance(content, str) else content
            validated = response_model.model_validate(inner)
            return validated.model_dump(by_alias=True)
        except Exception as exc:
            raise RuntimeError(f"{task_name} response parsing/validation failed: {exc}") from exc

```

## core/models.py

```python
from __future__ import annotations

from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.types import constr

from ..specs.base import OpsMetaView
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
    resolve_plan: Dict[str, JsonValue]
    specify_opsspec: Dict[str, JsonValue]
    canonicalized: Dict[str, JsonValue]

    model_config = ConfigDict(extra="forbid")


class GenerateOpsSpecResponse(BaseModel):
    ops_spec: Dict[str, List[OperationSpec]] = Field(default_factory=dict)
    chart_context: ChartContext
    warnings: List[str] = Field(default_factory=list)
    trace: Optional[PipelineTrace] = None

    model_config = ConfigDict(extra="forbid")

```

## core/types.py

```python
from __future__ import annotations

from typing import TypeAlias, Union

from pydantic import JsonValue as PydanticJsonValue

JsonPrimitive: TypeAlias = Union[str, int, float, bool, None]
JsonValue: TypeAlias = PydanticJsonValue
PrimitiveValue: TypeAlias = Union[str, int, float]

```

## core/utils.py

```python
from __future__ import annotations

from typing import Any, Dict, List, Optional


def to_float(value: Any) -> Optional[float]:
    """임의의 값을 float으로 변환합니다. 변환 불가 시 None 반환.

    - None / bool 은 숫자로 취급하지 않음.
    - 문자열이면 strip 후 float 변환 시도.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None
    return None


def prune_nulls(value: Any) -> Any:
    """None 값을 재귀적으로 제거합니다.

    - dict: None 값을 가진 키 제거
    - list: None 아이템 제거
    - 그 외: 원본 반환
    """
    if value is None:
        return None
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for k, v in value.items():
            if v is None:
                continue
            pruned = prune_nulls(v)
            if pruned is None:
                continue
            out[k] = pruned
        return out
    if isinstance(value, list):
        out_list: List[Any] = []
        for item in value:
            if item is None:
                continue
            pruned = prune_nulls(item)
            if pruned is None:
                continue
            out_list.append(pruned)
        return out_list
    return value

```

## specs/aggregate.py

```python
from __future__ import annotations

from typing import Literal, Optional

from ..core.types import JsonValue
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

```

## specs/base.py

```python
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

```

## specs/compare.py

```python
from __future__ import annotations

from typing import Literal, Optional

from ..core.types import JsonValue
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

```

## specs/filter.py

```python
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

```

## specs/range_sort_select.py

```python
from __future__ import annotations

from typing import List, Literal, Optional, Union

from pydantic import Field

from .base import BaseOpFields


class FindExtremumOp(BaseOpFields):
    op: Literal["findExtremum"] = "findExtremum"
    field: Optional[str] = None
    group: Optional[str] = None
    which: Optional[Literal["max", "min"]] = None


class DetermineRangeOp(BaseOpFields):
    op: Literal["determineRange"] = "determineRange"
    field: Optional[str] = None
    group: Optional[str] = None


class SortOp(BaseOpFields):
    op: Literal["sort"] = "sort"
    field: Optional[str] = None
    group: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = None
    orderField: Optional[str] = None


class NthOp(BaseOpFields):
    op: Literal["nth"] = "nth"
    field: Optional[str] = None
    group: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = None
    orderField: Optional[str] = None
    n: Optional[Union[int, List[int]]] = None
    from_: Optional[Literal["left", "right"]] = Field(default=None, alias="from")

```

## specs/set_op.py

```python
from __future__ import annotations

from typing import Literal, Optional

from .base import BaseOpFields


class SetOp(BaseOpFields):
    op: Literal["setOp"] = "setOp"
    fn: Literal["intersection", "union"]
    group: Optional[str] = None

```

## specs/union.py

```python
from __future__ import annotations

from typing import Annotated, Any, Dict, List, TypeAlias, Union

from pydantic import Field, TypeAdapter

from .aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from .compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp
from .filter import FilterOp
from .range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from .set_op import SetOp

OperationSpec: TypeAlias = Annotated[
    Union[
        RetrieveValueOp,
        FilterOp,
        FindExtremumOp,
        DetermineRangeOp,
        CompareOp,
        CompareBoolOp,
        SortOp,
        SumOp,
        AverageOp,
        DiffOp,
        LagDiffOp,
        NthOp,
        CountOp,
        SetOp,
    ],
    Field(discriminator="op"),
]

OperationSpecAdapter = TypeAdapter(OperationSpec)


def parse_operation_spec(raw: Dict[str, Any]) -> OperationSpec:
    return OperationSpecAdapter.validate_python(raw)

```

## runtime/canonicalize.py

```python
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from ..core.models import ChartContext
from ..specs.base import OpsMeta
from ..specs.set_op import SetOp
from ..specs.union import OperationSpec, parse_operation_spec

_REF_RE = re.compile(r"^ref:(n[0-9]+)$")


def _strip_none_fields(op: OperationSpec) -> OperationSpec:
    dumped = op.model_dump(by_alias=True, exclude_none=True)
    return parse_operation_spec(dumped)


def _node_signature(branch_name: str, op: OperationSpec) -> str:
    dumped = op.model_dump(by_alias=True, exclude_none=True)
    dumped.pop("id", None)
    meta = dumped.get("meta")
    if isinstance(meta, dict):
        meta.pop("nodeId", None)
        meta.pop("inputs", None)
        if not meta:
            dumped.pop("meta", None)
    body = {"branch": branch_name, "op": dumped}
    return json.dumps(body, sort_keys=True, ensure_ascii=True)


def _extract_old_node_id(op: OperationSpec, *, fallback: str) -> str:
    meta = op.meta or OpsMeta()
    node_id = meta.nodeId
    if isinstance(node_id, str) and node_id:
        return node_id
    return fallback


def _rewrite_refs(value: Any, *, id_map: Dict[str, str]) -> Any:
    # Rewrite "ref:nX" strings and {"id":"nX"} objects using id_map.
    if value is None:
        return None
    if isinstance(value, str):
        m = _REF_RE.match(value)
        if m:
            old = m.group(1)
            new = id_map.get(old)
            return f"ref:{new}" if new else value
        return value
    if isinstance(value, dict):
        if set(value.keys()) == {"id"} and isinstance(value.get("id"), str):
            old = value["id"]
            new = id_map.get(old)
            return {"id": new} if new else value
        return {k: _rewrite_refs(v, id_map=id_map) for k, v in value.items()}
    if isinstance(value, list):
        return [_rewrite_refs(item, id_map=id_map) for item in value]
    return value


def _reassign_node_ids_and_rewrite_refs(
    groups: Dict[str, List[OperationSpec]],
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    """
    Deterministically reassign meta.nodeId/id across the entire graph and rewrite "ref:nX".

    Ordering:
    - Topological sort based on derived dependencies:
      - explicit scalar refs "ref:nX" appearing in op params
      - explicit meta.inputs edges for ALL ops
    - Tie-break using a stable semantic signature (op+params, minus nodeId/inputs/id).
    """
    warnings: List[str] = []

    # Collect nodes across all groups.
    nodes: Dict[str, Tuple[str, OperationSpec]] = {}
    order_fallback_counter = 0

    for branch_name, ops in groups.items():
        if not isinstance(ops, list):
            continue
        for op in ops:
            order_fallback_counter += 1
            fallback = f"_tmp{order_fallback_counter}"
            old_id = _extract_old_node_id(op, fallback=fallback)
            if old_id in nodes:
                # Should not happen; keep deterministic by suffixing.
                suffix = 1
                while f"{old_id}_{suffix}" in nodes:
                    suffix += 1
                old_id = f"{old_id}_{suffix}"
                warnings.append(f'duplicate meta.nodeId encountered; renamed internal key to "{old_id}"')
            nodes[old_id] = (branch_name, op)

    edges_out: Dict[str, List[str]] = {nid: [] for nid in nodes.keys()}
    indeg: Dict[str, int] = {nid: 0 for nid in nodes.keys()}

    def _scan_ref_deps(obj: Any) -> Set[str]:
        deps: Set[str] = set()
        if obj is None:
            return deps
        if isinstance(obj, str):
            m = _REF_RE.match(obj)
            if m:
                deps.add(m.group(1))
            return deps
        if isinstance(obj, list):
            for item in obj:
                deps |= _scan_ref_deps(item)
            return deps
        if isinstance(obj, dict):
            for _, item in obj.items():
                deps |= _scan_ref_deps(item)
            return deps
        return deps

    def _add_edge(src: str, dst: str) -> None:
        if src not in nodes or dst not in nodes:
            return
        edges_out.setdefault(src, []).append(dst)
        indeg[dst] = indeg.get(dst, 0) + 1

    # (1) scalar ref edges
    for dst_id, (_, op) in nodes.items():
        dumped = op.model_dump(by_alias=True, exclude_none=True)
        dumped.pop("meta", None)  # ignore meta contents for ref scanning
        for src in sorted(_scan_ref_deps(dumped)):
            if src not in nodes:
                warnings.append(f'unknown scalar reference "{src}" for node "{dst_id}" ignored during canonicalization')
                continue
            _add_edge(src, dst_id)

    # (2) explicit meta.inputs edges for ALL ops (tree/DAG structure)
    for dst_id, (_, op) in nodes.items():
        for src in list((op.meta.inputs or []) if op.meta else []):
            if src not in nodes:
                warnings.append(f'unknown meta.inputs reference "{src}" for node "{dst_id}" ignored during canonicalization')
                continue
            _add_edge(src, dst_id)

    # Initialize available set (in-degree 0), with stable tie-break.
    available: List[str] = []
    for node_id, deg in indeg.items():
        if deg == 0:
            available.append(node_id)

    def _group_index(branch_name: str) -> int:
        if branch_name == "ops":
            return 1
        if branch_name.startswith("ops") and branch_name[3:].isdigit():
            try:
                return int(branch_name[3:])
            except Exception:
                return 9999
        return 9999

    def _avail_key(node_id: str) -> Tuple[int, str, str]:
        branch_name, op = nodes[node_id]
        return (_group_index(branch_name), _node_signature(branch_name, op), node_id)

    available.sort(key=_avail_key)

    topo: List[str] = []
    while available:
        current = available.pop(0)
        topo.append(current)
        for child in sorted(edges_out.get(current, []), key=lambda nid: _avail_key(nid)):
            indeg[child] -= 1
            if indeg[child] == 0:
                available.append(child)
                available.sort(key=_avail_key)

    if len(topo) != len(nodes):
        # 사이클 또는 해결 불가능한 참조 → 조용한 복구 대신 명시적으로 실패시킵니다.
        # 유효한 입력에서는 절대 발생하지 않아야 하므로, 발생 시 원인을 파악할 수 있도록
        # 관련 노드 목록을 포함한 ValueError를 던집니다.
        remaining = sorted(
            [nid for nid in nodes.keys() if nid not in set(topo)],
            key=_avail_key,
        )
        cycle_detail = ", ".join(remaining[:10])
        raise ValueError(
            f"OpsSpec 그래프에 사이클 또는 해결 불가능한 참조가 감지되었습니다. "
            f"관련 노드: [{cycle_detail}]. "
            f"meta.inputs 또는 ref:nX 참조가 서로 순환하지 않는지 확인하세요."
        )

    id_map: Dict[str, str] = {}
    for idx, old_id in enumerate(topo, start=1):
        id_map[old_id] = f"n{idx}"

    # Rewrite ops with new ids and ref strings.
    out: Dict[str, List[OperationSpec]] = {name: [] for name in groups.keys()}
    for branch_name, ops in groups.items():
        rewritten_ops: List[OperationSpec] = []
        for op in ops:
            old_id = _extract_old_node_id(op, fallback="")
            new_id = id_map.get(old_id)
            dumped = op.model_dump(by_alias=True, exclude_none=True)

            dumped["id"] = new_id or dumped.get("id") or old_id or None
            meta = dumped.get("meta")
            if not isinstance(meta, dict):
                meta = {}
            meta["nodeId"] = new_id or meta.get("nodeId") or old_id

            # Sentence index: derive from the sentence-layer group if missing.
            if meta.get("sentenceIndex") is None and isinstance(branch_name, str):
                if branch_name == "ops":
                    meta["sentenceIndex"] = 1
                elif branch_name.startswith("ops") and branch_name[3:].isdigit():
                    try:
                        meta["sentenceIndex"] = int(branch_name[3:])
                    except Exception:
                        pass

            # Canonical meta.inputs for ALL ops: preserve explicit inputs + add ref deps.
            deps: Set[str] = set()
            for inp in (meta.get("inputs") or []):
                if isinstance(inp, str) and inp:
                    deps.add(id_map.get(inp, inp))

            without_meta = dict(dumped)
            without_meta.pop("meta", None)
            for src_old in _scan_ref_deps(without_meta):
                src_new = id_map.get(src_old)
                if src_new:
                    deps.add(src_new)
            deps.discard(str(meta.get("nodeId")))
            meta["inputs"] = sorted(deps)
            dumped["meta"] = meta

            dumped = _rewrite_refs(dumped, id_map=id_map)
            rewritten = parse_operation_spec(dumped)
            rewritten_ops.append(rewritten)
        out[branch_name] = rewritten_ops

    return out, warnings


def canonicalize_ops_spec_groups(
    groups: Dict[str, List[OperationSpec]],
    *,
    chart_context: ChartContext,
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    """
    Canonicalization to improve 1:1 mapping between "tree" and opsSpec:
    1) Reassign nodeIds deterministically based on the graph and semantic tie-break.
       Also rewrite all "ref:nX" strings consistently.
    2) Strip None fields for stable JSON.
    """
    warnings: List[str] = []

    _ = chart_context  # reserved for future semantic canonicalization
    rewritten_groups, rewrite_warnings = _reassign_node_ids_and_rewrite_refs(groups)
    warnings.extend(rewrite_warnings)

    # Final normalization: ensure meta exists, fill missing ids (should not happen after rewrite),
    # sort commutative setOp inputs, and strip None keys.
    out: Dict[str, List[OperationSpec]] = {}
    for group_name, ops in rewritten_groups.items():
        normalized_ops: List[OperationSpec] = []
        for op in ops:
            meta = op.meta or OpsMeta()
            node_id = meta.nodeId
            if not node_id:
                # Deterministic fallback (rare): based on current output size.
                node_id = f"n{sum(len(v) for v in out.values()) + len(normalized_ops) + 1}"
                meta = meta.model_copy(update={"nodeId": node_id})
                warnings.append(f'meta.nodeId missing; assigned "{node_id}"')
            if not op.id:
                op = op.model_copy(update={"id": node_id})
                warnings.append(f'op.id missing; assigned "{node_id}"')

            if isinstance(op, SetOp):
                if meta.inputs:
                    sorted_inputs = sorted(meta.inputs)
                    if sorted_inputs != meta.inputs:
                        meta = meta.model_copy(update={"inputs": sorted_inputs})
                        warnings.append(f'setOp meta.inputs sorted for node "{node_id}"')

            op = op.model_copy(update={"meta": meta})
            op = _strip_none_fields(op)
            normalized_ops.append(op)

        # Stable ordering inside group by numeric nodeId.
        def _node_num(item: OperationSpec) -> int:
            meta = item.meta or OpsMeta()
            raw = meta.nodeId or item.id or "n0"
            try:
                return int(str(raw).lstrip("n"))
            except Exception:
                return 0

        out[group_name] = sorted(normalized_ops, key=_node_num)

    out.setdefault("ops", [])
    return out, warnings

```

## runtime/context_builder.py

```python
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..core.models import ChartContext, NumericStats
from ..core.types import JsonValue, PrimitiveValue
from ..core.utils import to_float


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _is_number(value: Any) -> bool:
    return to_float(value) is not None


def _extract_encoding_summary(spec: Dict[str, Any]) -> Dict[str, Dict[str, JsonValue]]:
    encoding = spec.get("encoding")
    if not isinstance(encoding, dict):
        return {}

    out: Dict[str, Dict[str, JsonValue]] = {}
    for channel, raw in encoding.items():
        if not isinstance(channel, str):
            continue
        source: Optional[Dict[str, Any]] = None
        if isinstance(raw, dict):
            source = raw
        elif isinstance(raw, list) and raw and isinstance(raw[0], dict):
            source = raw[0]
        if source is None:
            continue

        out[channel] = {
            "field": _as_text(source.get("field")) or None,
            "type": _as_text(source.get("type")) or None,
            "title": _as_text(source.get("title")) or None,
            "aggregate": _as_text(source.get("aggregate")) or None,
            "stack": source.get("stack") if "stack" in source else None,
        }
    return out


def _extract_mark(spec: Dict[str, Any]) -> str:
    mark = spec.get("mark")
    if isinstance(mark, str):
        return mark
    if isinstance(mark, dict):
        return _as_text(mark.get("type")) or "unknown"
    return "unknown"


def _is_stacked_bar(mark: str, encoding_summary: Dict[str, Dict[str, JsonValue]]) -> bool:
    if mark != "bar":
        return False
    if "color" not in encoding_summary:
        return False
    if "xOffset" in encoding_summary or "yOffset" in encoding_summary:
        return False
    for axis in ("x", "y"):
        stack = encoding_summary.get(axis, {}).get("stack")
        if stack is False:
            return False
        if isinstance(stack, str) and stack.lower() == "none":
            return False
    return True


def _all_data_fields(rows: List[Dict[str, Any]]) -> List[str]:
    fields: List[str] = []
    for row in rows:
        for key in row.keys():
            if key not in fields:
                fields.append(key)
    return fields


def _infer_field_types(rows: List[Dict[str, Any]], fields: Iterable[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for field in fields:
        values = [row.get(field) for row in rows]
        non_null = [v for v in values if v is not None]
        if not non_null:
            out[field] = "unknown"
            continue
        out[field] = "numeric" if all(_is_number(v) for v in non_null) else "categorical"
    return out


def _override_field_types_from_encoding(
    field_types: Dict[str, str],
    encoding_summary: Dict[str, Dict[str, JsonValue]],
) -> Dict[str, str]:
    """
    Vega-Lite encoding types provide strong semantic hints:
    - nominal/ordinal/temporal are treated as categorical (dimensions)
    - quantitative is treated as numeric (measures)

    This avoids cases like an integer-coded month being inferred as numeric when the
    chart uses it as a categorical x-axis.
    """
    out = dict(field_types)
    for channel, enc in encoding_summary.items():
        _ = channel
        field = _as_text(enc.get("field"))
        enc_type = _as_text(enc.get("type")).lower()
        if not field or not enc_type:
            continue
        if enc_type in {"nominal", "ordinal", "temporal"}:
            out[field] = "categorical"
        elif enc_type in {"quantitative"}:
            out[field] = "numeric"
    return out


def _build_domains(rows: List[Dict[str, Any]], field_types: Dict[str, str]) -> Dict[str, List[PrimitiveValue]]:
    out: Dict[str, List[PrimitiveValue]] = {}
    for field, field_type in field_types.items():
        if field_type != "categorical":
            continue
        seen: Dict[str, PrimitiveValue] = {}
        for row in rows:
            value = row.get(field)
            if isinstance(value, bool) or value is None:
                continue
            if not isinstance(value, (str, int, float)):
                continue
            token = f"{type(value).__name__}:{value}"
            if token not in seen:
                seen[token] = value
        out[field] = sorted(seen.values(), key=lambda v: str(v))
    return out


def _build_numeric_stats(rows: List[Dict[str, Any]], field_types: Dict[str, str]) -> Dict[str, NumericStats]:
    out: Dict[str, NumericStats] = {}
    for field, field_type in field_types.items():
        if field_type != "numeric":
            continue
        numbers = [value for value in (to_float(row.get(field)) for row in rows) if value is not None]
        if not numbers:
            continue
        out[field] = NumericStats(min=min(numbers), max=max(numbers), mean=sum(numbers) / len(numbers))
    return out


def _pick_roles(
    encoding_summary: Dict[str, Dict[str, JsonValue]],
    field_types: Dict[str, str],
    fallback_fields: List[str],
) -> Tuple[str, str, Optional[str]]:
    x_field = _as_text(encoding_summary.get("x", {}).get("field")) or None
    y_field = _as_text(encoding_summary.get("y", {}).get("field")) or None
    color_field = _as_text(encoding_summary.get("color", {}).get("field")) or None

    category_fields = [f for f, t in field_types.items() if t == "categorical"]
    measure_fields = [f for f, t in field_types.items() if t == "numeric"]

    # primary_dimension: x축 카테고리 → y축 카테고리 → 첫 번째 카테고리 필드 → fallback
    if x_field and field_types.get(x_field) == "categorical":
        primary_dimension = x_field
    elif y_field and field_types.get(y_field) == "categorical":
        primary_dimension = y_field
    elif category_fields:
        primary_dimension = category_fields[0]
    else:
        primary_dimension = fallback_fields[0]

    # primary_measure: y축 수치 → x축 수치 → 첫 번째 수치 필드 → fallback
    if y_field and field_types.get(y_field) == "numeric":
        primary_measure = y_field
    elif x_field and field_types.get(x_field) == "numeric":
        primary_measure = x_field
    elif measure_fields:
        primary_measure = measure_fields[0]
    else:
        primary_measure = fallback_fields[0]

    # series_field: color 채널이 카테고리 타입인 경우에만 설정
    if color_field and field_types.get(color_field) == "categorical":
        series_field: Optional[str] = color_field
    else:
        series_field = None

    return primary_dimension, primary_measure, series_field


def build_chart_context(
    vega_lite_spec: Dict[str, Any],
    data_rows: List[Dict[str, Any]],
) -> Tuple[ChartContext, List[str], List[Dict[str, JsonValue]]]:
    warnings: List[str] = []
    rows = [row for row in data_rows if isinstance(row, dict)]
    if len(rows) != len(data_rows):
        warnings.append("Some data_rows entries were not objects and were ignored.")
    if not rows:
        raise ValueError("data_rows must contain at least one row object.")

    all_fields = _all_data_fields(rows)
    if not all_fields:
        raise ValueError("Could not infer fields from data_rows.")

    encoding_summary = _extract_encoding_summary(vega_lite_spec)
    mark = _extract_mark(vega_lite_spec)
    is_stacked = _is_stacked_bar(mark, encoding_summary)

    field_types = _infer_field_types(rows, all_fields)
    field_types = _override_field_types_from_encoding(field_types, encoding_summary)
    categorical_values = _build_domains(rows, field_types)
    numeric_stats = _build_numeric_stats(rows, field_types)
    primary_dimension, primary_measure, series_field = _pick_roles(encoding_summary, field_types, all_fields)

    dimension_fields = [field for field, field_type in field_types.items() if field_type == "categorical"]
    measure_fields = [field for field, field_type in field_types.items() if field_type == "numeric"]

    chart_context = ChartContext(
        fields=all_fields,
        dimension_fields=dimension_fields,
        measure_fields=measure_fields,
        primary_dimension=primary_dimension,
        primary_measure=primary_measure,
        series_field=series_field,
        categorical_values=categorical_values,
        field_types=field_types,  # type: ignore[arg-type]
        numeric_stats=numeric_stats,
        mark=mark,
        is_stacked=is_stacked,
        encoding_summary=encoding_summary,
    )

    rows_preview: List[Dict[str, JsonValue]] = []
    for row in rows[:40]:
        clean: Dict[str, JsonValue] = {}
        for key, value in row.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                clean[key] = value
            else:
                clean[key] = str(value)
        rows_preview.append(clean)

    return chart_context, warnings, rows_preview

```

## runtime/executor.py

```python
from __future__ import annotations

from dataclasses import replace
from typing import Any, Dict, List, Optional, Tuple

from ..core.datum import DatumValue
from ..core.models import ChartContext
from ..specs.aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from ..specs.compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp
from ..specs.filter import FilterOp
from ..specs.range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from ..specs.set_op import SetOp
from ..specs.union import OperationSpec
from ..core.utils import to_float


def normalize_rows_to_datum_values(rows: List[Dict[str, Any]], chart_context: ChartContext) -> List[DatumValue]:
    out: List[DatumValue] = []
    dim = chart_context.primary_dimension
    measure = chart_context.primary_measure
    series_field = chart_context.series_field
    for row in rows:
        if not isinstance(row, dict):
            continue
        target = str(row.get(dim, "")).strip()
        if not target:
            continue
        numeric = to_float(row.get(measure))
        if numeric is None:
            continue
        group = None
        if series_field:
            raw_group = row.get(series_field)
            group = str(raw_group).strip() if raw_group is not None else None
        out.append(
            DatumValue(
                category=dim,
                measure=measure,
                target=target,
                group=group,
                value=numeric,
                id=str(row.get("id")) if row.get("id") is not None else None,
                name=str(row.get("name")) if row.get("name") is not None else None,
                lookup_id=str(row.get("lookupId")) if row.get("lookupId") is not None else None,
                series=group,
            )
        )
    return out


class OpsSpecExecutor:
    def __init__(self, chart_context: ChartContext) -> None:
        self.chart_context = chart_context
        self.runtime: Dict[str, List[DatumValue]] = {}

    def execute(
        self,
        *,
        rows: List[Dict[str, Any]],
        ops_spec: Dict[str, List[OperationSpec]],
    ) -> Dict[str, List[DatumValue]]:
        base = normalize_rows_to_datum_values(rows, self.chart_context)
        # Sentence-layer mode: groups represent explanation sentences, and nodes inside a
        # group may be parallel (no implicit chaining). Execute as a DAG based on meta.inputs
        # and scalar refs ("ref:nX"), not by sequential order within each group.
        ordered_ops: List[Tuple[int, str, OperationSpec]] = []
        for group_name, ops in (ops_spec or {}).items():
            if not isinstance(group_name, str) or not isinstance(ops, list):
                continue
            for op in ops:
                node_id = (op.meta.nodeId if op.meta else None) or op.id or "n0"
                try:
                    node_num = int(str(node_id).lstrip("n"))
                except Exception:
                    node_num = 0
                ordered_ops.append((node_num, group_name, op))
        ordered_ops.sort(key=lambda item: item[0])

        results_by_group: Dict[str, List[DatumValue]] = {name: [] for name in self._ordered_group_names(ops_spec)}

        for _, group_name, op in ordered_ops:
            data_input = self._select_data_input(base, op)
            result = self._execute_single(data_input, op)
            self._store_runtime(op, result)
            results_by_group.setdefault(group_name, []).extend([replace(item) for item in result])

        # Stable output ordering by sentence-layer group name.
        ordered_out: Dict[str, List[DatumValue]] = {}
        for name in self._ordered_group_names(results_by_group):
            ordered_out[name] = results_by_group.get(name, [])
        for name, items in results_by_group.items():
            if name not in ordered_out:
                ordered_out[name] = items
        return ordered_out

    def _ordered_group_names(self, groups: Dict[str, Any]) -> List[str]:
        names = [n for n in list((groups or {}).keys()) if isinstance(n, str)]
        ordered: List[str] = []
        if "ops" in names:
            ordered.append("ops")
        ordered.extend(sorted([n for n in names if n.startswith("ops") and n[3:].isdigit()], key=lambda n: int(n[3:])))
        ordered.extend(sorted([n for n in names if n not in ordered]))
        return ordered

    def _extract_ref_deps(self, obj: Any) -> List[str]:
        deps: List[str] = []
        if obj is None:
            return deps
        if isinstance(obj, str) and obj.startswith("ref:n"):
            deps.append(obj[len("ref:") :])
            return deps
        if isinstance(obj, list):
            for item in obj:
                deps.extend(self._extract_ref_deps(item))
            return deps
        if isinstance(obj, dict):
            for _, item in obj.items():
                deps.extend(self._extract_ref_deps(item))
            return deps
        return deps

    def _select_data_input(self, base: List[DatumValue], op: OperationSpec) -> List[DatumValue]:
        # Pick a single "data parent" dependency if present.
        # - meta.inputs contains both dataset and scalar dependencies.
        # - scalar deps are those referenced via "ref:nX" strings in op params.
        dumped = op.model_dump(by_alias=True, exclude_none=True)
        dumped.pop("meta", None)
        scalar_deps = set(self._extract_ref_deps(dumped))
        inputs = list((op.meta.inputs or []) if op.meta else [])
        data_parents = [inp for inp in inputs if inp not in scalar_deps]
        if not data_parents:
            return base
        parent = data_parents[0]
        return self.runtime.get(parent, base)

    def _store_runtime(self, op: OperationSpec, result: List[DatumValue]) -> None:
        if op.id:
            self.runtime[op.id] = [replace(item) for item in result]
        if op.meta and op.meta.nodeId:
            self.runtime[op.meta.nodeId] = [replace(item) for item in result]

    def _execute_single(self, data: List[DatumValue], op: OperationSpec) -> List[DatumValue]:
        if isinstance(op, RetrieveValueOp):
            return self._op_retrieve_value(data, op)
        if isinstance(op, FilterOp):
            return self._op_filter(data, op)
        if isinstance(op, FindExtremumOp):
            return self._op_find_extremum(data, op)
        if isinstance(op, DetermineRangeOp):
            return self._op_determine_range(data, op)
        if isinstance(op, CompareOp):
            return self._op_compare(data, op)
        if isinstance(op, CompareBoolOp):
            return self._op_compare_bool(data, op)
        if isinstance(op, SortOp):
            return self._op_sort(data, op)
        if isinstance(op, SumOp):
            return self._op_sum(data, op)
        if isinstance(op, AverageOp):
            return self._op_average(data, op)
        if isinstance(op, DiffOp):
            return self._op_diff(data, op)
        if isinstance(op, LagDiffOp):
            return self._op_lag_diff(data, op)
        if isinstance(op, NthOp):
            return self._op_nth(data, op)
        if isinstance(op, CountOp):
            return self._op_count(data, op)
        if isinstance(op, SetOp):
            return self._op_set_op(data, op)
        return data

    def _slice_by_group(self, data: List[DatumValue], group: Optional[str]) -> List[DatumValue]:
        if not group:
            return data
        return [item for item in data if (item.group or "") == group]

    def _infer_field_kind(self, field: Optional[str]) -> Optional[str]:
        if not field:
            return None
        if field in {"value", self.chart_context.primary_measure}:
            return "measure"
        if field in {"target", self.chart_context.primary_dimension}:
            return "category"
        if field in self.chart_context.measure_fields:
            return "measure"
        if field in self.chart_context.dimension_fields:
            return "category"
        return None

    def _selector_to_target_and_group(self, selector: Any, default_group: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        if isinstance(selector, dict):
            if isinstance(selector.get("id"), str) and not any(k in selector for k in ("category", "target")):
                return None, None, selector["id"]
            category = selector.get("category")
            target = selector.get("target", category)
            series = selector.get("series", default_group)
            target_text = str(target) if target is not None else None
            series_text = str(series) if series is not None else None
            return target_text, series_text, None
        if isinstance(selector, str) and selector.startswith("ref:n"):
            # Scalar reference to a prior node's output, expressed in PlanTree style.
            return None, None, selector[len("ref:") :]
        if selector is None:
            return None, default_group, None
        return str(selector), default_group, None

    def _resolve_scalar_ref(self, raw: Any) -> Optional[float]:
        if isinstance(raw, dict) and isinstance(raw.get("id"), str):
            values = self.runtime.get(raw["id"], [])
            if not values:
                return None
            return values[-1].value
        if isinstance(raw, str) and raw.startswith("ref:n"):
            key = raw[len("ref:") :]
            values = self.runtime.get(key, [])
            if not values:
                return None
            return values[-1].value
        return to_float(raw)

    def _eval_operator(self, operator: str, left: Any, right: Any) -> bool:
        if operator == ">":
            return float(left) > float(right)
        if operator == ">=":
            return float(left) >= float(right)
        if operator == "<":
            return float(left) < float(right)
        if operator == "<=":
            return float(left) <= float(right)
        if operator in {"==", "eq"}:
            return left == right
        if operator == "!=":
            return left != right
        if operator == "in":
            return isinstance(right, list) and left in right
        if operator == "not-in":
            return isinstance(right, list) and left not in right
        if operator == "contains":
            if isinstance(left, str) and isinstance(right, str):
                return right in left
            if isinstance(left, str) and isinstance(right, list):
                return all(str(tok) in left for tok in right)
        raise ValueError(f"Unsupported operator: {operator}")

    def _value_key(self, item: DatumValue, field: Optional[str]) -> Any:
        kind = self._infer_field_kind(field)
        if kind == "category":
            return item.target
        return item.value

    def _aggregate(self, values: List[float], agg: Optional[str]) -> float:
        if not values:
            return float("nan")
        if agg == "avg":
            return sum(values) / len(values)
        if agg == "min":
            return min(values)
        if agg == "max":
            return max(values)
        return sum(values)

    def _slice_for_selector(self, data: List[DatumValue], selector: Any, group: Optional[str], field: Optional[str]) -> List[DatumValue]:
        target, series, scalar_ref = self._selector_to_target_and_group(selector, group)
        if scalar_ref:
            return self.runtime.get(scalar_ref, [])
        sliced = self._slice_by_group(data, series)
        if target is None:
            return sliced
        return [item for item in sliced if item.target == target]

    def _make_scalar(self, *, value: float, label: str, group: Optional[str], measure: Optional[str]) -> List[DatumValue]:
        return [
            DatumValue(
                category="result",
                measure=measure or self.chart_context.primary_measure,
                target=label,
                group=group,
                value=value,
                name=label,
            )
        ]

    def _op_retrieve_value(self, data: List[DatumValue], op: RetrieveValueOp) -> List[DatumValue]:
        target = op.target
        if isinstance(target, list):
            out: List[DatumValue] = []
            for entry in target:
                out.extend(self._slice_for_selector(data, entry, op.group, op.field))
            return out
        return self._slice_for_selector(data, target, op.group, op.field)

    def _op_filter(self, data: List[DatumValue], op: FilterOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        include_set = {str(v) for v in (op.include or [])}
        exclude_set = {str(v) for v in (op.exclude or [])}
        if include_set or exclude_set:
            sliced = [
                item
                for item in sliced
                if (not include_set or item.target in include_set) and (not exclude_set or item.target not in exclude_set)
            ]
        if not op.operator:
            return sliced

        right = self._resolve_scalar_ref(op.value)
        if right is None and op.value is not None and not isinstance(op.value, dict):
            right = op.value  # type: ignore[assignment]
        if right is None:
            return []
        field_kind = self._infer_field_kind(op.field)
        out: List[DatumValue] = []
        for item in sliced:
            left = item.value if field_kind != "category" else item.target
            if self._eval_operator(op.operator, left, right):
                out.append(item)
        return out

    def _op_find_extremum(self, data: List[DatumValue], op: FindExtremumOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        if not sliced:
            return []
        pick_max = op.which != "min"
        sorted_values = sorted(sliced, key=lambda item: self._value_key(item, op.field))
        return [sorted_values[-1] if pick_max else sorted_values[0]]

    def _op_determine_range(self, data: List[DatumValue], op: DetermineRangeOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        if not sliced:
            return []
        kind = self._infer_field_kind(op.field)
        if kind == "category":
            targets = sorted({item.target for item in sliced})
            return [
                DatumValue(category="range", measure=None, target="__min__", group=op.group, value=0.0, name=targets[0]),
                DatumValue(
                    category="range",
                    measure=None,
                    target="__max__",
                    group=op.group,
                    value=max(0.0, float(len(targets) - 1)),
                    name=targets[-1],
                ),
            ]
        values = [item.value for item in sliced]
        return [
            DatumValue(category="range", measure=op.field, target="__min__", group=op.group, value=min(values)),
            DatumValue(category="range", measure=op.field, target="__max__", group=op.group, value=max(values)),
        ]

    def _op_compare(self, data: List[DatumValue], op: CompareOp) -> List[DatumValue]:
        left = self._slice_for_selector(data, op.targetA, op.groupA or op.group, op.field)
        right = self._slice_for_selector(data, op.targetB, op.groupB or op.group, op.field)
        if not left or not right:
            return []
        left_value = self._aggregate([item.value for item in left], op.aggregate)
        right_value = self._aggregate([item.value for item in right], op.aggregate)
        pick_max = op.which != "min"
        return [left[-1] if (left_value >= right_value if pick_max else left_value <= right_value) else right[-1]]

    def _op_compare_bool(self, data: List[DatumValue], op: CompareBoolOp) -> List[DatumValue]:
        if not op.operator:
            return []
        left = self._slice_for_selector(data, op.targetA, op.groupA or op.group, op.field)
        right = self._slice_for_selector(data, op.targetB, op.groupB or op.group, op.field)
        if not left or not right:
            return []
        left_value = self._aggregate([item.value for item in left], op.aggregate)
        right_value = self._aggregate([item.value for item in right], op.aggregate)
        flag = self._eval_operator(op.operator, left_value, right_value)
        return self._make_scalar(value=1.0 if flag else 0.0, label="__compareBool__", group=op.group, measure=op.field)

    def _op_sort(self, data: List[DatumValue], op: SortOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        reverse = op.order == "desc"
        return sorted(sliced, key=lambda item: self._value_key(item, op.field), reverse=reverse)

    def _op_sum(self, data: List[DatumValue], op: SumOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        value = sum(item.value for item in sliced)
        return self._make_scalar(value=value, label="__sum__", group=op.group, measure=op.field)

    def _op_average(self, data: List[DatumValue], op: AverageOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        if not sliced:
            return self._make_scalar(value=float("nan"), label="__avg__", group=op.group, measure=op.field)
        value = sum(item.value for item in sliced) / len(sliced)
        return self._make_scalar(value=value, label="__avg__", group=op.group, measure=op.field)

    def _op_diff(self, data: List[DatumValue], op: DiffOp) -> List[DatumValue]:
        left_scalar = self._resolve_scalar_ref(op.targetA)
        right_scalar = self._resolve_scalar_ref(op.targetB)
        if left_scalar is None:
            left = self._slice_for_selector(data, op.targetA, op.groupA or op.group, op.field)
            left_scalar = self._aggregate([item.value for item in left], op.aggregate)
        if right_scalar is None:
            right = self._slice_for_selector(data, op.targetB, op.groupB or op.group, op.field)
            right_scalar = self._aggregate([item.value for item in right], op.aggregate)
        if left_scalar is None or right_scalar is None:
            return []

        if op.mode == "ratio":
            if right_scalar == 0:
                return []
            scale = op.scale if op.scale is not None else (100.0 if op.percent else 1.0)
            result = (left_scalar / right_scalar) * float(scale)
        else:
            result = left_scalar - right_scalar
            if op.signed is False:
                result = abs(result)
        if op.precision is not None:
            result = round(result, max(0, op.precision))
        return self._make_scalar(value=result, label=op.targetName or "__diff__", group=op.group, measure=op.field)

    def _op_lag_diff(self, data: List[DatumValue], op: LagDiffOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        reverse = op.order == "desc"
        ordered = sorted(sliced, key=lambda item: item.target, reverse=reverse)
        out: List[DatumValue] = []
        for idx in range(1, len(ordered)):
            prev = ordered[idx - 1]
            curr = ordered[idx]
            delta = curr.value - prev.value
            if op.absolute:
                delta = abs(delta)
            out.append(
                DatumValue(
                    category=curr.category,
                    measure=curr.measure,
                    target=curr.target,
                    group=curr.group,
                    value=delta,
                    prev_target=prev.target,
                )
            )
        return out

    def _op_nth(self, data: List[DatumValue], op: NthOp) -> List[DatumValue]:
        if op.n is None:
            return []
        n = op.n if isinstance(op.n, int) else (op.n[0] if op.n else None)
        if n is None:
            return []
        sliced = self._slice_by_group(data, op.group)
        reverse = op.order == "desc"
        ordered = sorted(sliced, key=lambda item: self._value_key(item, op.orderField or op.field), reverse=reverse)
        idx = max(1, n) - 1
        if idx >= len(ordered):
            return []
        return [ordered[idx]]

    def _op_count(self, data: List[DatumValue], op: CountOp) -> List[DatumValue]:
        sliced = self._slice_by_group(data, op.group)
        return self._make_scalar(value=float(len(sliced)), label="__count__", group=op.group, measure=op.field)

    def _op_set_op(self, data: List[DatumValue], op: SetOp) -> List[DatumValue]:
        _ = data
        inputs = op.meta.inputs if op.meta and op.meta.inputs else []
        if len(inputs) < 2:
            return []
        collections: List[List[DatumValue]] = [self.runtime.get(node_id, []) for node_id in inputs]
        if any(not coll for coll in collections):
            return []
        target_sets = [set(item.target for item in coll) for coll in collections]
        if op.fn == "intersection":
            merged = set.intersection(*target_sets)
        else:
            merged = set.union(*target_sets)
        ordered = sorted(merged)
        return [
            DatumValue(
                category=self.chart_context.primary_dimension,
                measure=self.chart_context.primary_measure,
                target=target,
                group=op.group,
                value=1.0,
                name=target,
            )
            for target in ordered
        ]

```

## runtime/op_registry.py

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple, Type

from ..specs.aggregate import AverageOp, CountOp, RetrieveValueOp, SumOp
from ..specs.base import BaseOpFields
from ..specs.compare import CompareBoolOp, CompareOp, DiffOp, LagDiffOp
from ..specs.filter import FilterOp
from ..specs.range_sort_select import DetermineRangeOp, FindExtremumOp, NthOp, SortOp
from ..specs.set_op import SetOp

COMMON_FIELDS: Tuple[str, ...] = ("op", "id", "meta", "chartId")


@dataclass(frozen=True)
class OpContract:
    op_name: str
    model_cls: Type[BaseOpFields]
    required_fields: Tuple[str, ...]
    semantic_rules: Tuple[str, ...]


def _alias_fields(model_cls: Type[BaseOpFields]) -> Tuple[str, ...]:
    names: List[str] = []
    for field_name, field_info in model_cls.model_fields.items():
        if field_name in COMMON_FIELDS:
            continue
        names.append(field_info.alias or field_name)
    return tuple(sorted(names))


_OP_SEQUENCE: Tuple[OpContract, ...] = (
    OpContract(
        op_name="retrieveValue",
        model_cls=RetrieveValueOp,
        required_fields=tuple(),
        semantic_rules=(
            "Use target for selector values or scalar refs.",
            "If group is set, restrict rows by series/group first.",
        ),
    ),
    OpContract(
        op_name="filter",
        model_cls=FilterOp,
        required_fields=("field",),
        semantic_rules=(
            "Use membership(include/exclude) OR comparison(operator+value), never both.",
            "field must be one of chart_context.fields.",
        ),
    ),
    OpContract(
        op_name="findExtremum",
        model_cls=FindExtremumOp,
        required_fields=tuple(),
        semantic_rules=("which defaults to max when missing.",),
    ),
    OpContract(
        op_name="determineRange",
        model_cls=DetermineRangeOp,
        required_fields=tuple(),
        semantic_rules=("If field is categorical, return min/max target labels.",),
    ),
    OpContract(
        op_name="compare",
        model_cls=CompareOp,
        required_fields=tuple(),
        semantic_rules=("compare targetA and targetB (or aggregated slices) and return selected side.",),
    ),
    OpContract(
        op_name="compareBool",
        model_cls=CompareBoolOp,
        required_fields=("operator",),
        semantic_rules=("operator is required.",),
    ),
    OpContract(
        op_name="sort",
        model_cls=SortOp,
        required_fields=tuple(),
        semantic_rules=("order defaults to asc when missing.",),
    ),
    OpContract(
        op_name="sum",
        model_cls=SumOp,
        required_fields=tuple(),
        semantic_rules=("field should be numeric measure field.",),
    ),
    OpContract(
        op_name="average",
        model_cls=AverageOp,
        required_fields=tuple(),
        semantic_rules=("field defaults to chart_context.primary_measure when missing.",),
    ),
    OpContract(
        op_name="diff",
        model_cls=DiffOp,
        required_fields=tuple(),
        semantic_rules=("Uses scalar refs or aggregated targetA/targetB slices.",),
    ),
    OpContract(
        op_name="lagDiff",
        model_cls=LagDiffOp,
        required_fields=tuple(),
        semantic_rules=("Computes adjacent delta by target order.",),
    ),
    OpContract(
        op_name="nth",
        model_cls=NthOp,
        required_fields=("n",),
        semantic_rules=("n is 1-based index.",),
    ),
    OpContract(
        op_name="count",
        model_cls=CountOp,
        required_fields=tuple(),
        semantic_rules=("Returns count as scalar datum.",),
    ),
    OpContract(
        op_name="setOp",
        model_cls=SetOp,
        required_fields=("fn",),
        semantic_rules=(
            "fn must be intersection or union.",
            "meta.inputs must contain at least two nodeIds.",
        ),
    ),
)

OP_REGISTRY: Dict[str, OpContract] = {contract.op_name: contract for contract in _OP_SEQUENCE}
LEGACY_NON_DRAW_OPS: Tuple[str, ...] = tuple(contract.op_name for contract in _OP_SEQUENCE if contract.op_name != "setOp")
ALLOWED_OPS: Tuple[str, ...] = tuple(contract.op_name for contract in _OP_SEQUENCE)

def list_contracts() -> Tuple[OpContract, ...]:
    # Stable ordering for UI/docs: keep the declared sequence.
    return _OP_SEQUENCE


def get_contract(op_name: str) -> OpContract:
    if op_name not in OP_REGISTRY:
        raise KeyError(f"Unknown op contract: {op_name}")
    return OP_REGISTRY[op_name]


def build_ops_contract_for_prompt() -> Dict[str, object]:
    all_fields: List[str] = sorted(
        {field_name for contract in _OP_SEQUENCE for field_name in _alias_fields(contract.model_cls)}
    )

    op_contracts: Dict[str, Dict[str, object]] = {}
    for contract in _OP_SEQUENCE:
        allowed = set(_alias_fields(contract.model_cls))
        required = set(contract.required_fields)
        optional = sorted(allowed - required)
        forbidden = sorted(set(all_fields) - allowed)
        op_contracts[contract.op_name] = {
            "required_fields": sorted(required),
            "optional_fields": optional,
            "forbidden_fields": forbidden,
            "semantic_rules": list(contract.semantic_rules),
        }

    return {
        "allowed_ops": list(ALLOWED_OPS),
        "legacy_non_draw_ops": list(LEGACY_NON_DRAW_OPS),
        "common_fields": list(COMMON_FIELDS),
        "op_contracts": op_contracts,
        "meta_rules": {
            "nodeId": "required per op",
            "inputs": "dependency edge nodeIds",
            "sentenceIndex": "required (must match sentence-layer group)",
            "view": "optional rendering hints only",
        },
    }

```

## runtime/python_scenario_loader.py

```python
from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path
from types import ModuleType
from typing import Any

from models import GenerateGrammarRequest


class PythonScenarioLoadError(ValueError):
    """Raised when a python scenario cannot be loaded or validated."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _allowed_root() -> Path:
    return _repo_root() / "data" / "expert"


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _resolve_candidate_path(scenario_path: str) -> Path:
    raw = scenario_path.strip()
    if not raw:
        raise PythonScenarioLoadError("scenario_path is empty.")

    root = _allowed_root().resolve()
    as_path = Path(raw)
    if as_path.is_absolute():
        candidate = as_path.resolve()
    else:
        candidate = (_repo_root() / as_path).resolve()

    if candidate.suffix.lower() != ".py":
        raise PythonScenarioLoadError("scenario_path must point to a .py file.")
    if not _path_is_within(candidate, root):
        raise PythonScenarioLoadError("scenario_path must be under data/expert.")
    if not candidate.exists():
        raise PythonScenarioLoadError(f"scenario file not found: {scenario_path}")
    if not candidate.is_file():
        raise PythonScenarioLoadError(f"scenario path is not a file: {scenario_path}")
    return candidate


def _load_module_from_path(path: Path) -> ModuleType:
    module_name = f"python_scenario_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise PythonScenarioLoadError(f"failed to import scenario module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def _extract_request_payload(module: ModuleType) -> dict[str, Any]:
    if hasattr(module, "build_request"):
        build_request = getattr(module, "build_request")
        if not callable(build_request):
            raise PythonScenarioLoadError('"build_request" exists but is not callable.')
        payload = build_request()
    elif hasattr(module, "REQUEST"):
        payload = getattr(module, "REQUEST")
    else:
        raise PythonScenarioLoadError('scenario must define "build_request()" or "REQUEST".')

    if not isinstance(payload, dict):
        raise PythonScenarioLoadError("scenario request payload must be a dict object.")
    return payload


def load_python_scenario_request(scenario_path: str) -> tuple[GenerateGrammarRequest, str]:
    """
    Load scenario request from a Python file under data/expert.

    Contract:
    - Either `build_request() -> dict` or `REQUEST = {...}` must exist.
    - The payload must satisfy GenerateGrammarRequest schema.
    """
    candidate = _resolve_candidate_path(scenario_path)
    module = _load_module_from_path(candidate)
    payload = _extract_request_payload(module)
    request = GenerateGrammarRequest.model_validate(payload)
    relative_path = str(candidate.relative_to(_repo_root().resolve()))
    return request, relative_path

```

## runtime/ui_schema.py

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union, get_args, get_origin

from pydantic.fields import FieldInfo

from .op_registry import OpContract, list_contracts
from ..specs.base import BaseOpFields


@dataclass(frozen=True)
class UiField:
    key: str
    kind: str
    required: bool
    options: Optional[List[str]] = None
    options_source: Optional[str] = None
    ref_allowed: bool = False
    description: Optional[str] = None


@dataclass(frozen=True)
class UiOp:
    op: str
    label: str
    fields: List[UiField]
    semantic_notes: List[str]


def _unwrap_optional(annotation: Any) -> Any:
    origin = get_origin(annotation)
    if origin is Union:
        args = [arg for arg in get_args(annotation) if arg is not type(None)]  # noqa: E721
        if len(args) == 1:
            return args[0]
    return annotation


def _is_list_of_primitives(annotation: Any) -> bool:
    origin = get_origin(annotation)
    if origin not in (list, List):
        return False
    args = get_args(annotation)
    if len(args) != 1:
        return False
    item = _unwrap_optional(args[0])
    item_origin = get_origin(item)
    if item_origin is Union:
        item_args = [a for a in get_args(item) if a is not type(None)]  # noqa: E721
        return all(a in (str, int, float, bool) for a in item_args)
    return item in (str, int, float, bool)


def _literal_options(annotation: Any) -> Optional[List[str]]:
    origin = get_origin(annotation)
    if origin is not None and str(origin).endswith("Literal"):
        values = [v for v in get_args(annotation)]
        return [str(v) for v in values]
    return None


def _infer_kind(annotation: Any) -> Tuple[str, Optional[List[str]]]:
    annotation = _unwrap_optional(annotation)

    options = _literal_options(annotation)
    if options is not None:
        return "enum", options

    origin = get_origin(annotation)
    if origin in (list, List):
        if _is_list_of_primitives(annotation):
            return "stringOrNumberArray", None
        return "stringArray", None

    if origin is Union:
        args = [a for a in get_args(annotation) if a is not type(None)]  # noqa: E721
        if set(args).issubset({str, int, float, bool}):
            if str in args and (int in args or float in args):
                return "stringOrNumber", None
            if str in args:
                return "string", None
            if bool in args:
                return "boolean", None
            return "number", None
        return "stringOrMap", None

    if annotation is bool:
        return "boolean", None
    if annotation in (int, float):
        return "number", None
    if annotation is str:
        return "string", None
    return "stringOrMap", None


def _field_is_required(field_info: FieldInfo, *, contract_required: bool) -> bool:
    # contract-required wins over type optionality.
    if contract_required:
        return True
    return field_info.is_required()


def _options_source_for_field(op_name: str, field_name: str) -> Optional[str]:
    # OptionsSource is resolved by the UI using chart_context.
    if field_name in {"target", "targetA", "targetB"}:
        return "targets"
    if field_name in {"group", "groupA", "groupB"}:
        return "series_domain"
    if field_name in {"field", "orderField"}:
        # Most ops treat `field` as a measure field; validators will enforce numeric where needed.
        if op_name in {"retrieveValue"}:
            return "fields"
        return "measure_fields"
    return None


def _ref_allowed(op_name: str, field_name: str) -> bool:
    # Scalar refs are always "ref:nX" strings.
    if field_name in {"value", "target", "targetA", "targetB"}:
        return True
    return False


def _ui_fields_for_model(
    op_name: str,
    *,
    model_cls: type[BaseOpFields],
    required_fields: Tuple[str, ...],
) -> List[UiField]:
    out: List[UiField] = []
    for name, field_info in model_cls.model_fields.items():
        if name in {"op", "id", "meta", "chartId"}:
            continue
        alias = field_info.alias or name
        kind, enum_options = _infer_kind(field_info.annotation)
        out.append(
            UiField(
                key=alias,
                kind=kind,
                required=_field_is_required(field_info, contract_required=alias in required_fields),
                options=enum_options,
                options_source=_options_source_for_field(op_name, alias),
                ref_allowed=_ref_allowed(op_name, alias),
                description=str(field_info.description) if field_info.description else None,
            )
        )
    return out


def build_op_registry_ui_schema() -> Dict[str, object]:
    ops: List[Dict[str, object]] = []

    for contract in list_contracts():
        fields = _ui_fields_for_model(
            contract.op_name,
            model_cls=contract.model_cls,
            required_fields=contract.required_fields,
        )

        semantic_notes = list(contract.semantic_rules)
        # UI-friendly emphasis for ref rules.
        if any(f.ref_allowed for f in fields):
            semantic_notes.append('Scalar references must use the format "ref:nX" (string only).')

        ops.append(
            {
                "op": contract.op_name,
                "label": contract.op_name,
                "fields": [
                    {
                        "key": f.key,
                        "kind": f.kind,
                        "required": f.required,
                        **({"options": f.options} if f.options else {}),
                        **({"optionsSource": f.options_source} if f.options_source else {}),
                        **({"refAllowed": True} if f.ref_allowed else {}),
                        **({"description": f.description} if f.description else {}),
                    }
                    for f in fields
                ],
                "semanticNotes": semantic_notes,
            }
        )

    return {
        "version": 1,
        "ops": ops,
        "meta": {
            "nodeIdRequired": True,
            "inputsRequired": True,
            "sentenceIndexRequired": True,
            "refFormat": "ref:nX",
        },
    }


```

## tests/test_canonicalize.py

```python
from __future__ import annotations

import unittest

from opsspec.runtime.canonicalize import canonicalize_ops_spec_groups
from opsspec.core.models import ChartContext
from opsspec.specs.aggregate import AverageOp
from opsspec.specs.base import OpsMeta
from opsspec.specs.set_op import SetOp


class CanonicalizeTest(unittest.TestCase):
    def test_assigns_node_id_and_id_and_sorts_set_inputs(self) -> None:
        context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"category": ["Broadcasting", "Commercial"]},
        )
        groups = {
            "ops": [AverageOp(op="average", field="Revenue_Million_Euros", meta=OpsMeta(nodeId="n1"))],
            "ops2": [AverageOp(op="average", field="Revenue_Million_Euros", meta=OpsMeta(nodeId="n3"))],
            "ops3": [
                SetOp(
                    op="setOp",
                    fn="intersection",
                    meta=OpsMeta(nodeId="n2", inputs=["n3", "n1"]),
                )
            ],
        }
        normalized, warnings = canonicalize_ops_spec_groups(groups, chart_context=context)
        self.assertTrue(normalized["ops"][0].id)
        self.assertTrue(normalized["ops"][0].meta and normalized["ops"][0].meta.nodeId)
        self.assertEqual(normalized["ops3"][0].meta.inputs, ["n1", "n2"])
        self.assertIsNotNone(warnings)


if __name__ == "__main__":
    unittest.main()

```

## tests/test_draw_plan.py

```python
from __future__ import annotations

import unittest

from draw_plan.build_draw_plan import build_draw_ops_spec
from opsspec.core.models import ChartContext
from opsspec.specs.base import OpsMeta
from opsspec.specs.filter import FilterOp
from opsspec.specs.aggregate import AverageOp


class DrawPlanTest(unittest.TestCase):
    def test_builds_draw_ops_for_scalar_and_target_results(self) -> None:
        context = ChartContext(
            fields=["month", "weather", "count"],
            dimension_fields=["month", "weather"],
            measure_fields=["count"],
            primary_dimension="month",
            primary_measure="count",
            series_field="weather",
            categorical_values={
                "month": ["Jan", "Feb", "Mar"],
                "weather": ["rain", "sun"],
            },
            mark="bar",
            is_stacked=True,
        )
        data_rows = [
            {"month": "Jan", "weather": "rain", "count": 10},
            {"month": "Feb", "weather": "rain", "count": 20},
            {"month": "Mar", "weather": "rain", "count": 30},
            {"month": "Jan", "weather": "sun", "count": 12},
            {"month": "Feb", "weather": "sun", "count": 16},
            {"month": "Mar", "weather": "sun", "count": 18},
        ]
        ops_spec = {
            "ops": [
                AverageOp(op="average", field="count", group="rain", meta=OpsMeta(nodeId="n1", sentenceIndex=1)),
                FilterOp(
                    op="filter",
                    field="count",
                    operator=">",
                    value="ref:n1",
                    group="rain",
                    meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
                ),
            ]
        }

        draw_plan = build_draw_ops_spec(
            ops_spec=ops_spec,
            chart_context=context,
            data_rows=data_rows,
            vega_lite_spec={"mark": "bar"},
        )
        ops = draw_plan.get("ops", [])

        self.assertTrue(any(op.get("action") == "line" for op in ops))
        self.assertTrue(any(op.get("action") == "highlight" for op in ops))
        self.assertTrue(any(op.get("action") == "stacked-filter-groups" for op in ops))


if __name__ == "__main__":
    unittest.main()


```

## tests/test_executor.py

```python
from __future__ import annotations

import unittest

from opsspec.runtime.executor import OpsSpecExecutor
from opsspec.core.models import ChartContext
from opsspec.specs.base import OpsMeta
from opsspec.specs.filter import FilterOp
from opsspec.specs.set_op import SetOp


class ExecutorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season", "category"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"category": ["Broadcasting", "Commercial"]},
        )
        self.rows = [
            {"season": "2016/17", "category": "Broadcasting", "Revenue_Million_Euros": 220.0},
            {"season": "2017/18", "category": "Broadcasting", "Revenue_Million_Euros": 190.0},
            {"season": "2016/17", "category": "Commercial", "Revenue_Million_Euros": 300.0},
            {"season": "2017/18", "category": "Commercial", "Revenue_Million_Euros": 260.0},
        ]

    def test_setop_intersection(self) -> None:
        executor = OpsSpecExecutor(self.context)
        ops_spec = {
            "ops2": [
                FilterOp(
                    op="filter",
                    field="season",
                    group="Broadcasting",
                    include=["2016/17"],
                    id="a",
                    meta=OpsMeta(nodeId="n1"),
                ),
                FilterOp(
                    op="filter",
                    field="season",
                    group="Commercial",
                    include=["2016/17"],
                    id="b",
                    meta=OpsMeta(nodeId="n2"),
                )
            ],
            "ops3": [
                SetOp(op="setOp", fn="intersection", id="c", meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"]))
            ],
        }
        results = executor.execute(rows=self.rows, ops_spec=ops_spec)
        targets = [item.target for item in results["ops3"]]
        self.assertEqual(targets, ["2016/17"])


if __name__ == "__main__":
    unittest.main()

```

## tests/test_pipeline.py

```python
from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from opsspec.modules.pipeline import OpsSpecPipeline


class PipelineRetryTest(unittest.TestCase):
    def test_specify_retry_on_validation_failure(self) -> None:
        """Module 3 (Specify) 첫 번째 시도 실패 시 두 번째 시도에서 성공하는지 검증."""
        specify_calls: list[list[str]] = []

        def fake_decompose(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            question,
            explanation,
            chart_context,
            roles_summary,
            series_domain,
            measure_fields,
            rows_preview,
            validation_feedback,
        ):
            return {
                "goal_type": "RETURN_SCALARS",
                "plan_tree": {
                    "nodes": [
                        {
                            "nodeId": "n1",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "@primary_measure"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        }
                    ],
                    "warnings": [],
                },
                "warnings": [],
            }

        def fake_resolve(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            plan_tree,
            chart_context,
            rows_preview,
            validation_feedback,
        ):
            # Module 2는 @token을 실제 필드명으로 치환해서 반환
            return {
                "grounded_plan_tree": {
                    "nodes": [
                        {
                            "nodeId": "n1",
                            "op": "average",
                            "group": "ops",
                            "params": {"field": "Revenue_Million_Euros"},
                            "inputs": [],
                            "sentenceIndex": 1,
                        }
                    ],
                    "warnings": [],
                },
                "warnings": [],
                "llm_called": False,
                "_debug_steps": {},
            }

        def fake_specify(  # type: ignore[no-untyped-def]
            *,
            llm,
            prompt_template,
            shared_rules,
            grounded_plan_tree,
            chart_context,
            ops_contract,
            validation_feedback,
        ):
            specify_calls.append(list(validation_feedback or []))
            if len(specify_calls) == 1:
                # 첫 번째 시도: 존재하지 않는 field 반환 → validation 실패
                return {
                    "ops_spec": {
                        "ops": [
                            {
                                "op": "average",
                                "field": "not_a_field",
                                "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                            },
                        ]
                    },
                    "warnings": [],
                }
            # 두 번째 시도: 올바른 field 반환 → 성공
            return {
                "ops_spec": {
                    "ops": [
                        {
                            "op": "average",
                            "field": "Revenue_Million_Euros",
                            "meta": {"nodeId": "n1", "inputs": [], "sentenceIndex": 1},
                        },
                    ]
                },
                "warnings": [],
            }

        pipeline = OpsSpecPipeline(
            ollama_model="qwen2.5-coder:1.5b",
            ollama_base_url="http://localhost:11434/v1",
            ollama_api_key="ollama",
            prompts_dir=Path(__file__).resolve().parents[2] / "prompts",
        )

        spec = {
            "mark": "bar",
            "encoding": {
                "x": {"field": "season", "type": "nominal"},
                "y": {"field": "Revenue_Million_Euros", "type": "quantitative"},
                "color": {"field": "category", "type": "nominal"},
            },
        }
        rows = [
            {"season": "2016/17", "category": "Broadcasting", "Revenue_Million_Euros": 200.0},
            {"season": "2017/18", "category": "Commercial", "Revenue_Million_Euros": 240.0},
        ]

        with (
            patch("opsspec.modules.pipeline.run_decompose_module", side_effect=fake_decompose),
            patch("opsspec.modules.pipeline.run_resolve_module", side_effect=fake_resolve),
            patch("opsspec.modules.pipeline.run_specify_module", side_effect=fake_specify),
        ):
            result = pipeline.generate(
                question="Q",
                explanation="E",
                vega_lite_spec=spec,
                data_rows=rows,
                request_id="t1",
                debug=False,
            )

        self.assertEqual(len(specify_calls), 2)
        self.assertTrue(any("specify attempt 1/3 failed" in warn for warn in result.warnings))
        self.assertEqual(result.ops_spec["ops"][0].field, "Revenue_Million_Euros")


if __name__ == "__main__":
    unittest.main()

```

## tests/test_python_scenario_loader.py

```python
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from opsspec.runtime.python_scenario_loader import PythonScenarioLoadError, load_python_scenario_request


def _scenario_payload_literal() -> str:
    return """{
    "question": "Q",
    "explanation": "E",
    "vega_lite_spec": {"mark": "bar", "encoding": {"x": {"field": "month", "type": "nominal"}, "y": {"field": "count", "type": "quantitative"}}},
    "data_rows": [{"month": "Jan", "count": 1}],
    "debug": False
}"""


class PythonScenarioLoaderTest(unittest.TestCase):
    def test_loads_build_request_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            expert_root = repo_root / "data" / "expert" / "e1"
            expert_root.mkdir(parents=True, exist_ok=True)
            scenario_path = expert_root / "sample.py"
            scenario_path.write_text(
                "def build_request():\n"
                f"    return {_scenario_payload_literal()}\n",
                encoding="utf-8",
            )

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                request, normalized = load_python_scenario_request("data/expert/e1/sample.py")

            self.assertEqual(normalized, "data/expert/e1/sample.py")
            self.assertEqual(request.question, "Q")
            self.assertEqual(len(request.data_rows), 1)

    def test_loads_request_constant_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            expert_root = repo_root / "data" / "expert" / "e1"
            expert_root.mkdir(parents=True, exist_ok=True)
            scenario_path = expert_root / "sample_const.py"
            scenario_path.write_text(
                f"REQUEST = {_scenario_payload_literal()}\n",
                encoding="utf-8",
            )

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                request, normalized = load_python_scenario_request(str(scenario_path))

            self.assertEqual(normalized, "data/expert/e1/sample_const.py")
            self.assertEqual(request.explanation, "E")

    def test_rejects_path_outside_allowed_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            outside_file = repo_root / "outside.py"
            outside_file.write_text("REQUEST = {}", encoding="utf-8")

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                with self.assertRaises(PythonScenarioLoadError):
                    load_python_scenario_request(str(outside_file))

    def test_rejects_missing_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            expert_root = repo_root / "data" / "expert"
            expert_root.mkdir(parents=True, exist_ok=True)
            scenario_path = expert_root / "invalid.py"
            scenario_path.write_text("x = 1\n", encoding="utf-8")

            with (
                patch("opsspec.runtime.python_scenario_loader._repo_root", return_value=repo_root),
                patch("opsspec.runtime.python_scenario_loader._allowed_root", return_value=repo_root / "data" / "expert"),
            ):
                with self.assertRaises(PythonScenarioLoadError):
                    load_python_scenario_request("data/expert/invalid.py")


if __name__ == "__main__":
    unittest.main()

```

## tests/test_validators.py

```python
from __future__ import annotations

import unittest

from opsspec.core.models import ChartContext
from opsspec.specs.aggregate import AverageOp
from opsspec.specs.filter import FilterOp
from opsspec.validation.validators import validate_operation


class ValidatorsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.context = ChartContext(
            fields=["season", "category", "Revenue_Million_Euros"],
            dimension_fields=["season", "category"],
            measure_fields=["Revenue_Million_Euros"],
            primary_dimension="season",
            primary_measure="Revenue_Million_Euros",
            series_field="category",
            categorical_values={"category": ["Broadcasting", "Commercial"]},
        )

    def test_filter_membership_and_comparison_conflict_raises(self) -> None:
        op = FilterOp(
            op="filter",
            field="season",
            include=["2016/17"],
            operator=">",
            value=1,
        )
        with self.assertRaises(ValueError):
            validate_operation(op, chart_context=self.context)

    def test_average_defaults_to_primary_measure(self) -> None:
        op = AverageOp(op="average", field=None)
        normalized, _ = validate_operation(op, chart_context=self.context)
        self.assertEqual(normalized.field, "Revenue_Million_Euros")


if __name__ == "__main__":
    unittest.main()

```

## modules/module_decompose.py

```python
from __future__ import annotations

import json
import re
from string import Template
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..core.models import PlanTree
from ..core.types import JsonValue


class DecomposeOutput(BaseModel):
    # Phase 1 분석 결과: 질문 의도 유형 (디버깅/Ablation용)
    goal_type: str = Field(
        ...,
        description=(
            "질문의 목적 유형. "
            "LIST_TARGETS | RETURN_SCALARS | COMPARE_SCALARS | FIND_EXTREMUM | SET_INTERSECTION"
        ),
    )
    plan_tree: PlanTree
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\\s+")


def _split_explanation_sentences(explanation: str) -> List[str]:
    text = " ".join(explanation.strip().split())
    if not text:
        return []
    parts = _SENTENCE_SPLIT_RE.split(text)
    out: List[str] = []
    for part in parts:
        s = part.strip()
        if s:
            out.append(s)
    return out or [text]


def run_decompose_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    question: str,
    explanation: str,
    chart_context: Dict[str, JsonValue],
    roles_summary: Dict[str, JsonValue],
    series_domain: List[JsonValue],
    measure_fields: List[str],
    rows_preview: List[Dict[str, JsonValue]],
    validation_feedback: Optional[List[str]] = None,
) -> Dict[str, Any]:
    validation_feedback = validation_feedback or []
    explanation_sentences = _split_explanation_sentences(explanation)
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        question=question,
        explanation=explanation,
        explanation_sentences_json=json.dumps(explanation_sentences, ensure_ascii=True, indent=2),
        roles_summary_json=json.dumps(roles_summary, ensure_ascii=True, indent=2),
        series_domain_json=json.dumps(series_domain, ensure_ascii=True, indent=2),
        measure_fields_json=json.dumps(measure_fields, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are Module-1 (Explanation Decomposition). "
        "Phase 1: Analyze the question to determine goal_type "
        "(LIST_TARGETS | RETURN_SCALARS | COMPARE_SCALARS | FIND_EXTREMUM | SET_INTERSECTION) "
        "and align each explanation sentence to the goal. "
        "Phase 2: Synthesize the minimal plan tree from that analysis. "
        "Return strict JSON with goal_type and plan_tree."
    )
    return llm.complete(
        response_model=DecomposeOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_decompose",
    )

```

## modules/module_resolve.py

```python
"""
Module-2: Chart-Grounded Resolution

DataDive 원칙("LLM은 생성에, symbolic method는 그라운딩에")에 따라
4-step 서브프로세스로 plan_tree를 chart_context에 대해 안정적으로 그라운딩한다.

Step 1: Deterministic Token Resolution  — @token → 구체적 필드명 (LLM 불필요)
Step 2: Multi-Strategy Value Resolution — exact → case-insensitive → fuzzy (LLM 불필요)
Step 3: LLM-Assisted Disambiguation    — 잔여 모호성만 LLM 처리 (조건부 호출)
Step 4: Domain Validation              — 결과 검증 (LLM 불필요)
"""

from __future__ import annotations

import copy
import difflib
import json
from string import Template
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..core.models import ChartContext, GroundedPlanTree
from ..validation.resolve_validators import find_unresolved_tokens, validate_grounded_plan
from ..core.types import JsonValue


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Output Model (Step 3 LLM 응답 스키마)
# ─────────────────────────────────────────────────────────────────────────────

class ResolveOutput(BaseModel):
    grounded_plan_tree: GroundedPlanTree
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Deterministic Token Resolution
# ─────────────────────────────────────────────────────────────────────────────

def _replace_tokens(obj: Any, token_map: Dict[str, str]) -> Any:
    """dict/list/str 구조에서 role token을 재귀적으로 치환."""
    if isinstance(obj, str):
        return token_map.get(obj, obj)
    if isinstance(obj, dict):
        return {k: _replace_tokens(v, token_map) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_tokens(item, token_map) for item in obj]
    return obj


def _resolve_role_tokens(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Step 1: @primary_measure / @primary_dimension / @series_field
            → chart_context의 구체적 필드명으로 결정론적 치환.
    """
    token_map: Dict[str, str] = {
        "@primary_measure": chart_context.primary_measure,
        "@primary_dimension": chart_context.primary_dimension,
    }
    if chart_context.series_field:
        token_map["@series_field"] = chart_context.series_field

    resolved = _replace_tokens(copy.deepcopy(plan_tree), token_map)

    warnings: List[str] = []
    remaining = find_unresolved_tokens(resolved)
    if remaining:
        warnings.append(
            f"@series_field 토큰이 남아 있지만 chart_context.series_field가 None입니다: "
            f"{sorted(set(remaining))}"
        )
    return resolved, warnings


# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Multi-Strategy Value Resolution
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_single_value(
    value: str,
    domain: List[Any],
) -> Tuple[str, Optional[str]]:
    """
    단일 값에 대해 다중 전략으로 도메인 매칭 시도.
    반환: (resolved_value, strategy: "exact"|"case_insensitive"|"fuzzy"|None)
    """
    domain_str = [str(v) for v in domain]
    if not domain_str:
        return value, None

    # 전략 1: Exact match
    if value in domain_str:
        return value, "exact"

    # 전략 2: Case-insensitive
    value_lower = value.lower()
    for d in domain_str:
        if d.lower() == value_lower:
            return d, "case_insensitive"

    # 전략 3: Fuzzy (stdlib difflib; 외부 의존성 없음, cutoff=0.8)
    matches = difflib.get_close_matches(value, domain_str, n=1, cutoff=0.8)
    if matches:
        return matches[0], "fuzzy"

    return value, None


def _resolve_params_values(
    params: Dict[str, Any],
    chart_context: ChartContext,
    node_id: str,
) -> Tuple[Dict[str, Any], List[str]]:
    """노드 params 내 도메인 값을 다중 전략으로 해결."""
    warnings: List[str] = []
    resolved = dict(params)

    field = params.get("field")
    if not isinstance(field, str):
        field = None

    # params.group → series domain 매칭
    group_val = params.get("group")
    if isinstance(group_val, str) and group_val and chart_context.series_field:
        domain = list(chart_context.categorical_values.get(chart_context.series_field, []))
        resolved_v, strategy = _resolve_single_value(group_val, domain)
        if strategy and strategy != "exact":
            warnings.append(
                f'[step2] node {node_id}: group="{group_val}" → "{resolved_v}" ({strategy})'
            )
        resolved["group"] = resolved_v

    # params.include / params.exclude → field 의 categorical domain 매칭
    for param_key in ("include", "exclude"):
        vals = params.get(param_key)
        if not isinstance(vals, list):
            continue
        domain = []
        if field and field in chart_context.categorical_values:
            domain = list(chart_context.categorical_values[field])
        if not domain:
            continue
        new_vals: List[Any] = []
        for v in vals:
            if not isinstance(v, str):
                new_vals.append(v)
                continue
            resolved_v, strategy = _resolve_single_value(v, domain)
            if strategy and strategy != "exact":
                warnings.append(
                    f'[step2] node {node_id}: {param_key}="{v}" → "{resolved_v}" ({strategy})'
                )
            new_vals.append(resolved_v)
        resolved[param_key] = new_vals

    return resolved, warnings


def _resolve_values(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str]]:
    """Step 2: 모든 plan node에 대해 다중 전략 값 해결."""
    plan = copy.deepcopy(plan_tree)
    nodes = plan.get("nodes") or []
    all_warnings: List[str] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("nodeId", "?"))
        params = node.get("params")
        if not isinstance(params, dict):
            continue
        resolved_params, node_warnings = _resolve_params_values(params, chart_context, node_id)
        node["params"] = resolved_params
        all_warnings.extend(node_warnings)

    plan["nodes"] = nodes
    return plan, all_warnings


# ─────────────────────────────────────────────────────────────────────────────
# Step 3: LLM-Assisted Disambiguation (조건부 호출)
# ─────────────────────────────────────────────────────────────────────────────

def _has_unresolved_domain_values(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> bool:
    """Step 1-2 이후에도 도메인 매칭이 안 된 값이 남아 있는지 확인."""
    nodes = (plan_tree.get("nodes") or []) if isinstance(plan_tree, dict) else []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        params = node.get("params") or {}
        if not isinstance(params, dict):
            continue
        field = params.get("field")

        # group 값이 series domain에 없으면 LLM 필요
        group_val = params.get("group")
        if isinstance(group_val, str) and group_val and chart_context.series_field:
            series_strs = [
                str(v)
                for v in chart_context.categorical_values.get(chart_context.series_field, [])
            ]
            if group_val not in series_strs:
                return True

        # include/exclude 값이 field domain에 없으면 LLM 필요
        for param_key in ("include", "exclude"):
            vals = params.get(param_key)
            if not isinstance(vals, list):
                continue
            domain = []
            if isinstance(field, str) and field in chart_context.categorical_values:
                domain = [str(v) for v in chart_context.categorical_values[field]]
            if not domain:
                continue
            for v in vals:
                if isinstance(v, str) and v not in domain:
                    return True
    return False


def _llm_disambiguate(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
    rows_preview: List[Dict[str, JsonValue]],
    validation_feedback: Optional[List[str]],
) -> Dict[str, Any]:
    """Step 3: 잔여 모호성만 LLM에게 전달해 해결."""
    validation_feedback = validation_feedback or []
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        plan_tree_json=json.dumps(plan_tree, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(
            chart_context.model_dump(mode="json"), ensure_ascii=True, indent=2
        ),
        rows_preview_json=json.dumps(rows_preview, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are Module-2 (Chart-Grounded Resolution). "
        "Resolve remaining ambiguous value references using chart context. "
        "Preserve all deterministically resolved fields and refs. Return strict JSON only."
    )
    return llm.complete(
        response_model=ResolveOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_resolve",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public Entry Point
# ─────────────────────────────────────────────────────────────────────────────

def run_resolve_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    plan_tree: Dict[str, JsonValue],
    chart_context: ChartContext,
    rows_preview: List[Dict[str, JsonValue]],
    validation_feedback: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Chart-Grounded Resolution: 4-step 서브프로세스.

    Step 1: Deterministic token resolution  — @token → 구체적 필드명
    Step 2: Multi-strategy value resolution — exact → case-insensitive → fuzzy
    Step 3: LLM disambiguation             — 잔여 모호성만 LLM 처리 (조건부)
    Step 4: Domain validation              — 결과 검증

    반환 dict 키:
      - grounded_plan_tree: Dict  (GroundedPlanTree 호환 구조)
      - warnings: List[str]
      - llm_called: bool          (디버깅: Step 3 LLM 호출 여부)
      - _debug_steps: Dict        (디버그 번들용 단계별 스냅샷)
    """
    plan_tree_dict = dict(plan_tree)

    # Step 1: Token resolution (결정론적)
    after_step1, step1_warnings = _resolve_role_tokens(plan_tree_dict, chart_context)

    # Step 2: Value resolution (결정론적, 다중 전략)
    after_step2, step2_warnings = _resolve_values(after_step1, chart_context)

    # Step 3: LLM disambiguation (잔여 모호성이 있을 때만 호출)
    llm_called = False
    llm_warnings: List[str] = []
    resolved_tree_dict: Dict[str, Any]

    if _has_unresolved_domain_values(after_step2, chart_context):
        llm_result = _llm_disambiguate(
            llm=llm,
            prompt_template=prompt_template,
            shared_rules=shared_rules,
            plan_tree=after_step2,
            chart_context=chart_context,
            rows_preview=rows_preview,
            validation_feedback=validation_feedback,
        )
        resolved_tree_dict = llm_result.get("grounded_plan_tree") or after_step2
        llm_warnings = llm_result.get("warnings") or []
        llm_called = True
    else:
        # 결정론적 해결 완료 → LLM 호출 스킵
        resolved_tree_dict = after_step2

    # resolved_tree_dict가 Pydantic model이면 dict로 변환
    if hasattr(resolved_tree_dict, "model_dump"):
        resolved_tree_dict = resolved_tree_dict.model_dump(mode="json")

    # Step 4: Domain validation (결정론적)
    _, step4_warnings, errors = validate_grounded_plan(resolved_tree_dict, chart_context)
    if errors:
        raise ValueError(
            "Resolve domain validation failed:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

    # 단계별 prefix를 붙여 warnings 집계
    prefixed_warnings: List[str] = (
        [f"[step1] {w}" for w in step1_warnings]
        + [f"[step2] {w}" for w in step2_warnings]
        + ([f"[step3_llm] {w}" for w in llm_warnings] if llm_called else [])
        + [f"[step4] {w}" for w in step4_warnings]
    )

    return {
        "grounded_plan_tree": resolved_tree_dict,
        "warnings": prefixed_warnings,
        "llm_called": llm_called,
        # 디버그 번들용 단계별 스냅샷
        "_debug_steps": {
            "step1_token_resolved": after_step1,
            "step2_value_resolved": after_step2,
            "step3_llm_called": llm_called,
        },
    }

```

## modules/module_specify.py

```python
"""
Module-3: Grammar Specification

검증된 GroundedPlanTree를 실행 가능한 OpsSpec 문법으로 합성한다.
14개 연산 유형의 op contract(required/optional/forbidden)를 준수해야 한다.
"""

from __future__ import annotations

import json
from string import Template
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..core.llm import StructuredLLMClient
from ..specs.union import OperationSpec


class SpecifyOutput(BaseModel):
    ops_spec: Dict[str, List[OperationSpec]] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


def run_specify_module(
    *,
    llm: StructuredLLMClient,
    prompt_template: str,
    shared_rules: str,
    grounded_plan_tree: Dict[str, Any],
    chart_context: Dict[str, Any],
    ops_contract: Dict[str, Any],
    validation_feedback: Optional[List[str]] = None,
) -> Dict[str, Any]:
    validation_feedback = validation_feedback or []
    prompt = Template(prompt_template).safe_substitute(
        shared_rules=shared_rules,
        grounded_plan_tree_json=json.dumps(grounded_plan_tree, ensure_ascii=True, indent=2),
        chart_context_json=json.dumps(chart_context, ensure_ascii=True, indent=2),
        ops_contract_json=json.dumps(ops_contract, ensure_ascii=True, indent=2),
        validation_feedback_json=json.dumps(validation_feedback, ensure_ascii=True, indent=2),
    )
    system_prompt = (
        "You are Module-3 (Grammar Specification). "
        "Synthesize the grounded plan into a precise, executable OpsSpec grammar. "
        "Each plan node must produce exactly one OperationSpec with correct schema. "
        "Use legacy ops + setOp only. Return strict JSON."
    )
    return llm.complete(
        response_model=SpecifyOutput,
        system_prompt=system_prompt,
        user_prompt=prompt,
        task_name="opsspec_specify",
    )

```

## modules/pipeline.py

```python
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from draw_plan import build_draw_ops_spec, export_draw_plan_to_public

from ..runtime.canonicalize import canonicalize_ops_spec_groups
from ..runtime.context_builder import build_chart_context
from ..core.llm import StructuredLLMClient
from ..core.utils import prune_nulls
from ..core.models import ChartContext, GenerateOpsSpecResponse, GroundedPlanTree, PipelineTrace, PlanTree
from .module_decompose import run_decompose_module
from .module_resolve import run_resolve_module
from .module_specify import run_specify_module
from ..runtime.op_registry import build_ops_contract_for_prompt
from ..validation.plan_validators import validate_plan_against_intent, validate_plan_tree
from ..specs.union import OperationSpec, parse_operation_spec
from ..validation.validators import validate_operation

logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("pipeline_trace")


def _load_prompt(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise RuntimeError(f"Prompt file is empty: {path}")
    return text


def _debug_root_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "debug"


def _create_debug_session_dir() -> Path:
    base = _debug_root_dir()
    base.mkdir(parents=True, exist_ok=True)
    stem = datetime.now().strftime("%m%d%H%M")
    candidate = base / stem
    if not candidate.exists():
        candidate.mkdir(parents=True, exist_ok=False)
        return candidate
    suffix = 1
    while True:
        alt = base / f"{stem}_{suffix:02d}"
        if not alt.exists():
            alt.mkdir(parents=True, exist_ok=False)
            return alt
        suffix += 1


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(prune_nulls(payload), ensure_ascii=False, indent=2), encoding="utf-8")


def _escape_dot_label(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _group_color(name: str) -> str:
    if name == "ops":
        return "#e8f0fe"
    if name.startswith("ops"):
        return "#e8f5e9"
    return "#f5f5f5"


def _build_ops_spec_dot(groups: Dict[str, Any]) -> str:
    # Build a DOT graph from final ops_spec groups.
    # Each op is a node: meta.nodeId is used as the stable identifier.
    # Edges follow meta.inputs (tree/DAG structure).
    node_meta: Dict[str, Dict[str, str]] = {}
    edges: List[Tuple[str, str]] = []

    for group_name, ops in (groups or {}).items():
        if not isinstance(group_name, str) or not isinstance(ops, list):
            continue
        for op in ops:
            if not isinstance(op, dict):
                continue
            meta = op.get("meta") if isinstance(op.get("meta"), dict) else {}
            node_id = meta.get("nodeId") or op.get("id")
            if not isinstance(node_id, str) or not node_id:
                continue
            op_name = op.get("op")
            label_parts = [str(node_id)]
            if isinstance(op_name, str) and op_name:
                label_parts.append(op_name)
            if isinstance(group_name, str) and group_name:
                label_parts.append(f"({group_name})")

            # Add a few useful params (small and stable) for debugging.
            field = op.get("field")
            if isinstance(field, str) and field:
                label_parts.append(f"field={field}")
            group = op.get("group")
            if isinstance(group, str) and group:
                label_parts.append(f"group={group}")
            fn = op.get("fn")
            if isinstance(fn, str) and fn:
                label_parts.append(f"fn={fn}")

            node_meta[node_id] = {
                "label": " ".join(label_parts),
                "group": group_name,
            }

            inputs = meta.get("inputs")
            if isinstance(inputs, list):
                for inp in inputs:
                    if isinstance(inp, str) and inp:
                        edges.append((inp, node_id))

    lines: List[str] = []
    lines.append("digraph OpsSpecTree {")
    lines.append('  graph [rankdir=LR, bgcolor="white"];')
    lines.append('  node [shape=box, style="rounded,filled", fillcolor="white", fontname="Helvetica"];')
    lines.append('  edge [color="#666666"];')

    groups_by_name: Dict[str, List[str]] = {}
    for node_id, meta in node_meta.items():
        groups_by_name.setdefault(meta["group"], []).append(node_id)

    def _group_sort_key(name: str) -> tuple[int, int, str]:
        if name == "ops":
            return (0, 1, name)
        if name.startswith("ops") and name[3:].isdigit():
            try:
                return (0, int(name[3:]), name)
            except Exception:
                return (0, 9999, name)
        return (1, 9999, name)

    for group_name, node_ids in sorted(groups_by_name.items(), key=lambda item: _group_sort_key(item[0])):
        cluster_name = f"cluster_{group_name}"
        lines.append(f'  subgraph "{cluster_name}" {{')
        lines.append(f'    label="{_escape_dot_label(group_name)}";')
        lines.append('    color="#bbbbbb";')
        lines.append(f'    style="rounded,filled";')
        lines.append(f'    fillcolor="{_group_color(group_name)}";')
        for node_id in sorted(node_ids):
            label = node_meta[node_id]["label"]
            lines.append(f'    "{node_id}" [label="{_escape_dot_label(label)}"];')
        lines.append("  }")

    for src, dst in edges:
        if src in node_meta and dst in node_meta:
            lines.append(f'  "{src}" -> "{dst}";')
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def _try_render_dot(dot_path: Path, *, out_base: Path) -> List[str]:
    # Render DOT via Graphviz if available. We avoid extra Python deps.
    warnings: List[str] = []
    dot_bin = shutil.which("dot")
    if not dot_bin:
        warnings.append('Graphviz "dot" not found in PATH; wrote .dot only.')
        return warnings

    try:
        svg_path = out_base.with_suffix(".svg")
        png_path = out_base.with_suffix(".png")
        subprocess.run([dot_bin, "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True, capture_output=True, text=True)
        subprocess.run([dot_bin, "-Tpng", str(dot_path), "-o", str(png_path)], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        warnings.append(f'Graphviz render failed: {stderr or exc}')
    except Exception as exc:
        warnings.append(f"Graphviz render failed: {exc}")
    return warnings


def _persist_debug_bundle(payloads: Dict[str, Dict[str, Any]]) -> Path:
    session_dir = _create_debug_session_dir()
    ordered = [
        ("00_request.json", "request"),
        ("01_context.json", "context"),
        ("02_module1_decompose.json", "module1_decompose"),
        # Module 2 Resolve: step-level + final
        ("03_module2_resolve_step1.json", "module2_resolve_step1"),
        ("03_module2_resolve_step2.json", "module2_resolve_step2"),
        ("03_module2_resolve_step3_llm.json", "module2_resolve_step3_llm"),
        ("03_module2_resolve_final.json", "module2_resolve_final"),
        ("04_module3_specify.json", "module3_specify"),
        ("05_final_grammar.json", "final_grammar"),
        ("06_draw_plan.json", "draw_plan"),
        ("99_error.json", "error"),
    ]
    for filename, key in ordered:
        data = payloads.get(key)
        if data is None:
            continue
        _write_json(session_dir / filename, data)

    # Tree visualization (OpsSpec only): DOT always, SVG/PNG if graphviz is available.
    final_payload = payloads.get("final_grammar") or {}
    if isinstance(final_payload, dict):
        ops_spec = final_payload.get("ops_spec")
        if isinstance(ops_spec, dict):
            dot_text = _build_ops_spec_dot(ops_spec)
            dot_path = session_dir / "07_tree_ops_spec.dot"
            dot_path.write_text(dot_text, encoding="utf-8")
            render_warnings = _try_render_dot(dot_path, out_base=session_dir / "07_tree_ops_spec")
            if render_warnings:
                (session_dir / "07_tree_ops_spec_render_warnings.txt").write_text(
                    "\n".join(render_warnings) + "\n",
                    encoding="utf-8",
                )
    return session_dir


def _parse_and_validate_groups(
    *,
    raw_groups: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    parsed_groups: Dict[str, List[OperationSpec]] = {}
    validation_warnings: List[str] = []
    errors: List[str] = []

    for group_name, ops in raw_groups.items():
        if not isinstance(group_name, str):
            errors.append("Group name must be string.")
            continue
        if group_name == "last":
            errors.append('Group "last" is not allowed. Use sentence-layer groups only: "ops", "ops2", "ops3", ...')
            continue
        if group_name != "ops":
            if not group_name.startswith("ops") or not group_name[3:].isdigit() or int(group_name[3:]) < 2:
                errors.append(
                    f'Invalid group name "{group_name}". Use sentence-layer groups only: "ops", "ops2", "ops3", ...'
                )
                continue
        if not isinstance(ops, list):
            errors.append(f'{group_name}: group value must be list, got "{type(ops).__name__}"')
            continue

        group_ops: List[OperationSpec] = []
        for idx, raw_op in enumerate(ops):
            if not isinstance(raw_op, dict):
                errors.append(f"{group_name}[{idx}]: op entry must be object.")
                continue
            try:
                op = parse_operation_spec(raw_op)
            except Exception as exc:
                errors.append(f"{group_name}[{idx}] schema error: {exc}")
                continue

            try:
                normalized, op_warnings = validate_operation(op, chart_context=chart_context)
            except Exception as exc:
                errors.append(f"{group_name}[{idx}] semantic error: {exc}")
                continue

            group_ops.append(normalized)
            validation_warnings.extend([f"{group_name}[{idx}]: {msg}" for msg in op_warnings])
        parsed_groups[group_name] = group_ops

    if errors:
        raise ValueError("\n".join(errors))
    return parsed_groups, validation_warnings


def _validate_compiled_groups_match_plan(
    *,
    plan_tree: GroundedPlanTree,
    compiled_groups: Dict[str, List[OperationSpec]],
) -> None:
    """
    Specify output must be a faithful translation of the plan:
    - Every plan nodeId must appear exactly once as an OperationSpec meta.nodeId.
    - No extra nodes are allowed.
    - Group placement must match plan node.group.
    - meta.sentenceIndex must match plan node.sentenceIndex.
    """
    plan_nodes = list(plan_tree.nodes or [])
    plan_ids = [n.nodeId for n in plan_nodes]
    plan_by_id = {n.nodeId: n for n in plan_nodes}

    compiled_by_id: Dict[str, Tuple[str, OperationSpec]] = {}
    for group_name, ops in compiled_groups.items():
        for op in ops:
            node_id = (op.meta.nodeId if op.meta else None) or op.id
            if not isinstance(node_id, str) or not node_id:
                continue
            compiled_by_id[node_id] = (group_name, op)

    compiled_ids = set(compiled_by_id.keys())
    missing = sorted(set(plan_ids) - compiled_ids)
    extra = sorted(compiled_ids - set(plan_ids))
    errors: List[str] = []
    if missing:
        errors.append(f"specify output missing nodeIds from plan_tree: {missing[:12]}")
    if extra:
        errors.append(f"specify output has extra nodeIds not in plan_tree: {extra[:12]}")

    for node_id, plan_node in plan_by_id.items():
        entry = compiled_by_id.get(node_id)
        if not entry:
            continue
        compiled_group, op = entry
        if compiled_group != plan_node.group:
            errors.append(
                f'nodeId "{node_id}" must be placed in group "{plan_node.group}" (got "{compiled_group}").'
            )
        if not op.meta or op.meta.sentenceIndex is None:
            errors.append(f'nodeId "{node_id}" is missing meta.sentenceIndex.')
        elif op.meta.sentenceIndex != plan_node.sentenceIndex:
            errors.append(
                f'nodeId "{node_id}" meta.sentenceIndex must be {plan_node.sentenceIndex} (got {op.meta.sentenceIndex}).'
            )

    if errors:
        raise ValueError("\n".join(errors))


def _is_grounding_error(errors: List[str]) -> bool:
    """Module 3 실패가 그라운딩 문제(필드/값 미존재)에서 비롯됐는지 판단."""
    grounding_keywords = ("does not exist", "not in", "field", "domain", "not found", "semantic error")
    combined = " ".join(errors).lower()
    return any(kw in combined for kw in grounding_keywords)


class OpsSpecPipeline:
    def __init__(
        self,
        *,
        ollama_model: str,
        ollama_base_url: str,
        ollama_api_key: str,
        prompts_dir: Path,
    ) -> None:
        self.llm = StructuredLLMClient(
            ollama_model=ollama_model,
            ollama_base_url=ollama_base_url,
            ollama_api_key=ollama_api_key,
        )
        self.prompts_dir = prompts_dir
        self.decompose_prompt: str | None = None
        self.resolve_prompt: str | None = None
        self.specify_prompt: str | None = None
        self.shared_rules_prompt: str | None = None

    def load(self) -> None:
        self.llm.load()
        if (
            self.decompose_prompt
            and self.resolve_prompt
            and self.specify_prompt
            and self.shared_rules_prompt is not None
        ):
            return
        self.decompose_prompt = _load_prompt(self.prompts_dir / "opsspec_decompose.md")
        self.resolve_prompt = _load_prompt(self.prompts_dir / "opsspec_resolve.md")
        self.specify_prompt = _load_prompt(self.prompts_dir / "opsspec_specify.md")
        shared_rules_path = self.prompts_dir / "opsspec_shared_rules.md"
        self.shared_rules_prompt = _load_prompt(shared_rules_path) if shared_rules_path.exists() else ""

    def generate(
        self,
        *,
        question: str,
        explanation: str,
        vega_lite_spec: Dict[str, Any],
        data_rows: List[Dict[str, Any]],
        request_id: str,
        debug: bool,
    ) -> GenerateOpsSpecResponse:
        self.load()
        assert self.decompose_prompt is not None
        assert self.resolve_prompt is not None
        assert self.specify_prompt is not None
        assert self.shared_rules_prompt is not None

        debug_payloads: Dict[str, Dict[str, Any]] = {
            "request": {
                "request_id": request_id,
                "question": question,
                "explanation": explanation,
                "vega_lite_spec": vega_lite_spec,
                "data_rows": data_rows,
                "debug": debug,
            }
        }

        chart_context, context_warnings, rows_preview = build_chart_context(vega_lite_spec, data_rows)
        debug_payloads["context"] = {
            "chart_context": chart_context.model_dump(mode="json"),
            "context_warnings": context_warnings,
            "rows_preview": rows_preview,
        }
        trace_logger.info(
            "[request:%s] context_built | fields=%d series_field=%s",
            request_id,
            len(chart_context.fields),
            chart_context.series_field or "-",
        )

        # ─────────────────────────────────────────────────────────
        # Module 1: Explanation Decomposition (with retry)
        # ─────────────────────────────────────────────────────────
        decompose_payload: Dict[str, Any] = {}
        decompose_feedback: List[str] = []
        decompose_retry_notes: List[str] = []
        max_decompose_attempts = 3

        roles_summary = {
            "primary_measure": chart_context.primary_measure,
            "primary_dimension": chart_context.primary_dimension,
            "series_field": chart_context.series_field,
        }
        series_domain = []
        if chart_context.series_field:
            series_domain = list(chart_context.categorical_values.get(chart_context.series_field, []))
        measure_fields = list(chart_context.measure_fields)

        for attempt in range(1, max_decompose_attempts + 1):
            try:
                decompose_payload = run_decompose_module(
                    llm=self.llm,
                    prompt_template=self.decompose_prompt,
                    shared_rules=self.shared_rules_prompt,
                    question=question,
                    explanation=explanation,
                    chart_context=chart_context.model_dump(mode="json"),
                    roles_summary=roles_summary,  # type: ignore[arg-type]
                    series_domain=series_domain,  # type: ignore[arg-type]
                    measure_fields=measure_fields,
                    rows_preview=rows_preview,
                    validation_feedback=decompose_feedback,
                )
                debug_payloads["module1_decompose"] = {
                    **decompose_payload,
                    "attempt": attempt,
                    "validation_feedback_in": decompose_feedback,
                }
                plan_tree = decompose_payload.get("plan_tree")
                if not isinstance(plan_tree, dict):
                    raise ValueError("plan_tree must be an object.")
                plan_tree_model = PlanTree.model_validate(plan_tree)
                validate_plan_tree(plan_tree_model)
                validate_plan_against_intent(
                    plan_tree=plan_tree_model,
                    question=question,
                    explanation=explanation,
                    chart_context=chart_context,
                )
                break
            except Exception as exc:
                decompose_feedback = [line for line in str(exc).splitlines() if line.strip()]
                decompose_retry_notes.append(
                    f"decompose attempt {attempt}/{max_decompose_attempts} failed with {len(decompose_feedback)} validation errors"
                )
                trace_logger.warning(
                    "[request:%s] decompose_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_decompose_attempts,
                    len(decompose_feedback),
                )
                if attempt == max_decompose_attempts:
                    debug_payloads["error"] = {
                        "stage": "decompose_retry_exhausted",
                        "errors": decompose_feedback,
                        "attempts": max_decompose_attempts,
                    }
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "decompose_plan failed after strict retries: " + "; ".join(decompose_feedback[:8])
                    ) from exc

        goal_type = decompose_payload.get("goal_type", "UNKNOWN")
        trace_logger.info(
            "[request:%s] decompose_plan | goal_type=%s nodes=%d warnings=%d",
            request_id,
            goal_type,
            len(((decompose_payload.get("plan_tree") or {}).get("nodes") or [])),
            len(decompose_payload.get("warnings") or []),
        )

        # ─────────────────────────────────────────────────────────
        # Module 2: Chart-Grounded Resolution (with retry)
        # ─────────────────────────────────────────────────────────
        resolve_payload: Dict[str, Any] = {}
        resolve_feedback: List[str] = []
        resolve_retry_notes: List[str] = []
        max_resolve_attempts = 3

        for attempt in range(1, max_resolve_attempts + 1):
            try:
                resolve_payload = run_resolve_module(
                    llm=self.llm,
                    prompt_template=self.resolve_prompt,
                    shared_rules=self.shared_rules_prompt,
                    plan_tree=decompose_payload.get("plan_tree") or {},  # type: ignore[arg-type]
                    chart_context=chart_context,
                    rows_preview=rows_preview,
                    validation_feedback=resolve_feedback,
                )
                # Step-level 디버그 스냅샷 저장
                debug_steps = resolve_payload.pop("_debug_steps", {})
                if debug_steps.get("step1_token_resolved"):
                    debug_payloads["module2_resolve_step1"] = {
                        "plan_tree": debug_steps["step1_token_resolved"],
                        "attempt": attempt,
                    }
                if debug_steps.get("step2_value_resolved"):
                    debug_payloads["module2_resolve_step2"] = {
                        "plan_tree": debug_steps["step2_value_resolved"],
                        "attempt": attempt,
                    }
                if debug_steps.get("step3_llm_called"):
                    debug_payloads["module2_resolve_step3_llm"] = {
                        "llm_called": True,
                        "attempt": attempt,
                    }
                debug_payloads["module2_resolve_final"] = {
                    **resolve_payload,
                    "attempt": attempt,
                    "validation_feedback_in": resolve_feedback,
                }
                break
            except Exception as exc:
                resolve_feedback = [line for line in str(exc).splitlines() if line.strip()]
                resolve_retry_notes.append(
                    f"resolve attempt {attempt}/{max_resolve_attempts} failed with {len(resolve_feedback)} errors"
                )
                trace_logger.warning(
                    "[request:%s] resolve_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_resolve_attempts,
                    len(resolve_feedback),
                )
                if attempt == max_resolve_attempts:
                    debug_payloads["error"] = {
                        "stage": "resolve_retry_exhausted",
                        "errors": resolve_feedback,
                        "attempts": max_resolve_attempts,
                    }
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "resolve_plan failed after strict retries: " + "; ".join(resolve_feedback[:8])
                    ) from exc

        trace_logger.info(
            "[request:%s] resolve_plan | llm_called=%s nodes=%d warnings=%d",
            request_id,
            resolve_payload.get("llm_called", False),
            len(((resolve_payload.get("grounded_plan_tree") or {}).get("nodes") or [])),
            len(resolve_payload.get("warnings") or []),
        )

        # ─────────────────────────────────────────────────────────
        # Module 3: Grammar Specification (with retry + cross-module feedback)
        # ─────────────────────────────────────────────────────────
        ops_contract = build_ops_contract_for_prompt()
        specify_payload: Dict[str, Any] = {}
        validation_warnings: List[str] = []
        specify_retry_notes: List[str] = []
        parsed_groups: Dict[str, List[OperationSpec]] = {}

        feedback_errors: List[str] = []
        max_specify_attempts = 3
        grounded_plan_tree_dict = resolve_payload.get("grounded_plan_tree") or {}
        # cross-module 재시도 플래그: Module 3 실패가 그라운딩 문제이면 Module 2를 1회 재실행
        _cross_module_retry_used = False

        for attempt in range(1, max_specify_attempts + 1):
            specify_payload = run_specify_module(
                llm=self.llm,
                prompt_template=self.specify_prompt,
                shared_rules=self.shared_rules_prompt,
                grounded_plan_tree=grounded_plan_tree_dict,
                chart_context=chart_context.model_dump(mode="json"),
                ops_contract=ops_contract,
                validation_feedback=feedback_errors,
            )
            debug_payloads["module3_specify"] = {
                **specify_payload,
                "attempt": attempt,
                "validation_feedback_in": feedback_errors,
            }
            try:
                raw_groups = specify_payload.get("ops_spec") or {}
                parsed_groups, validation_warnings = _parse_and_validate_groups(
                    raw_groups=raw_groups,
                    chart_context=chart_context,
                )
                grounded_plan_tree_model = GroundedPlanTree.model_validate(grounded_plan_tree_dict)
                _validate_compiled_groups_match_plan(
                    plan_tree=grounded_plan_tree_model,
                    compiled_groups=parsed_groups,
                )
                break
            except ValueError as exc:
                feedback_errors = [line for line in str(exc).splitlines() if line.strip()]
                specify_retry_notes.append(
                    f"specify attempt {attempt}/{max_specify_attempts} failed with {len(feedback_errors)} validation errors"
                )
                trace_logger.warning(
                    "[request:%s] specify_retry | attempt=%d/%d errors=%d",
                    request_id,
                    attempt,
                    max_specify_attempts,
                    len(feedback_errors),
                )

                # Cross-module 피드백: 그라운딩 문제이면 Module 2를 1회 재실행
                if (
                    not _cross_module_retry_used
                    and attempt == max_specify_attempts
                    and _is_grounding_error(feedback_errors)
                ):
                    _cross_module_retry_used = True
                    trace_logger.info(
                        "[request:%s] cross_module_retry | grounding error → re-running resolve",
                        request_id,
                    )
                    try:
                        resolve_payload = run_resolve_module(
                            llm=self.llm,
                            prompt_template=self.resolve_prompt,
                            shared_rules=self.shared_rules_prompt,
                            plan_tree=decompose_payload.get("plan_tree") or {},  # type: ignore[arg-type]
                            chart_context=chart_context,
                            rows_preview=rows_preview,
                            validation_feedback=feedback_errors,
                        )
                        resolve_payload.pop("_debug_steps", None)
                        grounded_plan_tree_dict = resolve_payload.get("grounded_plan_tree") or {}
                        debug_payloads["module2_resolve_final"] = {
                            **resolve_payload,
                            "cross_module_retry": True,
                        }
                    except Exception as resolve_exc:
                        trace_logger.warning(
                            "[request:%s] cross_module_retry failed: %s", request_id, str(resolve_exc)
                        )
                    # Specify를 1회 더 시도
                    specify_payload = run_specify_module(
                        llm=self.llm,
                        prompt_template=self.specify_prompt,
                        shared_rules=self.shared_rules_prompt,
                        grounded_plan_tree=grounded_plan_tree_dict,
                        chart_context=chart_context.model_dump(mode="json"),
                        ops_contract=ops_contract,
                        validation_feedback=feedback_errors,
                    )
                    debug_payloads["module3_specify"] = {
                        **specify_payload,
                        "attempt": "cross_module_retry",
                        "validation_feedback_in": feedback_errors,
                    }
                    try:
                        raw_groups = specify_payload.get("ops_spec") or {}
                        parsed_groups, validation_warnings = _parse_and_validate_groups(
                            raw_groups=raw_groups,
                            chart_context=chart_context,
                        )
                        grounded_plan_tree_model = GroundedPlanTree.model_validate(grounded_plan_tree_dict)
                        _validate_compiled_groups_match_plan(
                            plan_tree=grounded_plan_tree_model,
                            compiled_groups=parsed_groups,
                        )
                        break
                    except ValueError:
                        pass  # 아래 exhausted 처리로 fall-through

                if attempt == max_specify_attempts:
                    debug_payloads["error"] = {
                        "stage": "specify_retry_exhausted",
                        "errors": feedback_errors,
                        "attempts": max_specify_attempts,
                        "cross_module_retry_used": _cross_module_retry_used,
                    }
                    session_dir = _persist_debug_bundle(debug_payloads)
                    trace_logger.error("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
                    raise RuntimeError(
                        "specify_opsspec failed after strict retries: "
                        + "; ".join(feedback_errors[:8])
                    ) from exc

        trace_logger.info(
            "[request:%s] specify_opsspec | groups=%d warnings=%d",
            request_id,
            len(specify_payload.get("ops_spec") or {}),
            len(specify_payload.get("warnings") or []),
        )

        # ─────────────────────────────────────────────────────────
        # Canonicalization
        # ─────────────────────────────────────────────────────────
        canonical_groups, canonical_warnings = canonicalize_ops_spec_groups(parsed_groups, chart_context=chart_context)
        trace_logger.info(
            "[request:%s] canonicalized | groups=%d warnings=%d",
            request_id,
            len(canonical_groups),
            len(canonical_warnings),
        )

        # ─────────────────────────────────────────────────────────
        # Draw Plan
        # ─────────────────────────────────────────────────────────
        draw_plan_warnings: List[str] = []
        try:
            draw_ops_spec = build_draw_ops_spec(
                ops_spec=canonical_groups,
                chart_context=chart_context,
                data_rows=data_rows,
                vega_lite_spec=vega_lite_spec,
            )
            draw_plan_path = export_draw_plan_to_public(draw_ops_spec, request_id=request_id)
            debug_payloads["draw_plan"] = {
                "draw_ops_spec": draw_ops_spec,
                "path": str(draw_plan_path),
            }
            trace_logger.info(
                "[request:%s] draw_plan_exported | groups=%d path=%s",
                request_id,
                len(draw_ops_spec),
                str(draw_plan_path),
            )
        except Exception as exc:
            draw_plan_warnings.append(f"draw plan generation failed: {exc}")
            debug_payloads["draw_plan"] = {"error": str(exc)}
            trace_logger.warning("[request:%s] draw_plan_failed | error=%s", request_id, str(exc))

        # ─────────────────────────────────────────────────────────
        # Collect all warnings
        # ─────────────────────────────────────────────────────────
        all_warnings: List[str] = []
        all_warnings.extend(context_warnings)
        all_warnings.extend(decompose_payload.get("warnings") or [])
        all_warnings.extend(decompose_retry_notes)
        all_warnings.extend(resolve_payload.get("warnings") or [])
        all_warnings.extend(resolve_retry_notes)
        all_warnings.extend(specify_payload.get("warnings") or [])
        all_warnings.extend(specify_retry_notes)
        all_warnings.extend(validation_warnings)
        all_warnings.extend(canonical_warnings)
        all_warnings.extend(draw_plan_warnings)

        trace: PipelineTrace | None = None
        if debug:
            trace = PipelineTrace(
                context_built={
                    "chart_context": chart_context.model_dump(mode="json"),
                    "context_warnings": context_warnings,
                    "rows_preview_count": len(rows_preview),
                },
                decompose_plan={
                    **decompose_payload,
                    "goal_type": goal_type,
                    "retry_notes": decompose_retry_notes,
                },
                resolve_plan={
                    **resolve_payload,
                    "retry_notes": resolve_retry_notes,
                },
                specify_opsspec={
                    **specify_payload,
                    "retry_errors": feedback_errors,
                    "retry_notes": specify_retry_notes,
                    "cross_module_retry_used": _cross_module_retry_used,
                },
                canonicalized={
                    "groups": {key: len(value) for key, value in canonical_groups.items()},
                    "warnings": canonical_warnings,
                },
            )

        result = GenerateOpsSpecResponse(
            ops_spec=canonical_groups,
            chart_context=chart_context,
            warnings=all_warnings,
            trace=trace,
        )
        debug_payloads["final_grammar"] = result.model_dump(mode="json", by_alias=True)
        session_dir = _persist_debug_bundle(debug_payloads)
        trace_logger.info("[request:%s] debug_dump_saved | path=%s", request_id, str(session_dir))
        return result

```

## validation/endpoint_validators.py

```python
"""
/canonicalize_opsspec 엔드포인트 전용 유효성 검증 로직.

main.py 핸들러에서 분리해 테스트 가능성과 가독성을 높입니다.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple

from ..core.models import ChartContext
from ..specs.union import OperationSpec, parse_operation_spec
from .validators import validate_operation

_REF_STR_RE = re.compile(r"^ref:(n[0-9]+)$")


# ---------------------------------------------------------------------------
# 내부 헬퍼
# ---------------------------------------------------------------------------

def _scan_forbidden_ref_objects(value: Any) -> bool:
    """{"id": "..."} 형태의 레거시 ref 오브젝트가 있으면 True 반환."""
    if value is None:
        return False
    if isinstance(value, dict):
        if set(value.keys()) == {"id"} and isinstance(value.get("id"), str):
            return True
        return any(_scan_forbidden_ref_objects(v) for v in value.values())
    if isinstance(value, list):
        return any(_scan_forbidden_ref_objects(v) for v in value)
    return False


def _scan_ref_strings(value: Any) -> List[str]:
    """value 내 모든 "ref:..." 문자열을 수집합니다."""
    refs: List[str] = []
    if value is None:
        return refs
    if isinstance(value, str):
        if value.startswith("ref:"):
            refs.append(value)
        return refs
    if isinstance(value, dict):
        for v in value.values():
            refs.extend(_scan_ref_strings(v))
        return refs
    if isinstance(value, list):
        for v in value:
            refs.extend(_scan_ref_strings(v))
        return refs
    return refs


def _group_to_sentence_index(group_name: str) -> Optional[int]:
    """그룹명에서 sentence index를 추출합니다. 유효하지 않으면 None 반환.

    - "ops"       → 1
    - "ops2"~     → 2, 3, ...
    - 그 외        → None (유효하지 않은 그룹명)
    """
    if group_name == "ops":
        return 1
    if group_name.startswith("ops") and group_name[3:].isdigit():
        try:
            idx = int(group_name[3:])
            return idx if idx >= 2 else None
        except Exception:
            return None
    return None


# ---------------------------------------------------------------------------
# 공개 API
# ---------------------------------------------------------------------------

def validate_and_parse_ops_spec_groups(
    raw_groups: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, List[OperationSpec]], List[str], List[str]]:
    """raw_groups를 파싱하고 스키마·의미 규칙을 검증합니다.

    Returns:
        groups:   파싱된 OperationSpec 그룹 맵
        warnings: 비치명적 경고 목록
        errors:   치명적 오류 목록 (비어있으면 성공)
    """
    warnings: List[str] = []
    errors: List[str] = []
    groups: Dict[str, List[OperationSpec]] = {}

    for group_name, raw_ops in raw_groups.items():
        if group_name == "last":
            errors.append('group "last" is forbidden (sentence-layer groups only)')
            continue

        sentence_index = _group_to_sentence_index(group_name)
        if sentence_index is None:
            errors.append(f'invalid group name "{group_name}" (expected "ops" or "opsN" with N>=2)')
            continue

        if raw_ops is None:
            raw_ops = []
        if not isinstance(raw_ops, list):
            errors.append(f'group "{group_name}" must be a list')
            continue

        parsed_ops: List[OperationSpec] = []
        for i, raw in enumerate(raw_ops):
            if not isinstance(raw, dict):
                errors.append(f'group "{group_name}" ops[{i}] must be an object')
                continue

            if _scan_forbidden_ref_objects(raw):
                errors.append(
                    f'group "{group_name}" ops[{i}] contains forbidden ref object '
                    f'(use "ref:nX" strings only)'
                )
                continue

            for ref in _scan_ref_strings(raw):
                if not _REF_STR_RE.match(ref):
                    errors.append(
                        f'group "{group_name}" ops[{i}] has invalid ref string '
                        f'"{ref}" (must be "ref:nX")'
                    )

            try:
                op = parse_operation_spec(raw)
            except Exception as exc:
                errors.append(f'group "{group_name}" ops[{i}] failed schema validation: {exc}')
                continue

            dumped = op.model_dump(by_alias=True, exclude_none=False)
            meta = dumped.get("meta") if isinstance(dumped, dict) else None
            if not isinstance(meta, dict):
                meta = {}

            # nodeId 검증
            node_id = meta.get("nodeId")
            if node_id is None:
                errors.append(f'group "{group_name}" ops[{i}] meta.nodeId is required (e.g., "n1")')
            elif not (isinstance(node_id, str) and re.match(r"^n[0-9]+$", node_id)):
                errors.append(
                    f'group "{group_name}" ops[{i}] meta.nodeId must match '
                    f'"^n[0-9]+$" (got {node_id!r})'
                )

            # inputs 기본값 처리
            inputs = meta.get("inputs")
            if inputs is None:
                meta["inputs"] = []
                op = parse_operation_spec({**dumped, "meta": meta})
                warnings.append(
                    f'group "{group_name}" ops[{i}] meta.inputs missing; defaulted to []'
                )
            elif not isinstance(inputs, list) or any(not isinstance(v, str) for v in inputs):
                errors.append(
                    f'group "{group_name}" ops[{i}] meta.inputs must be a string array'
                )

            # sentenceIndex 정합성 확인
            si = meta.get("sentenceIndex")
            if si is None:
                meta["sentenceIndex"] = sentence_index
                op = parse_operation_spec({**dumped, "meta": meta})
                warnings.append(
                    f'group "{group_name}" ops[{i}] meta.sentenceIndex missing; '
                    f'set to {sentence_index}'
                )
            elif isinstance(si, int) and si != sentence_index:
                errors.append(
                    f'group "{group_name}" ops[{i}] meta.sentenceIndex={si} '
                    f'mismatches group sentence index {sentence_index}'
                )

            # 의미 규칙 검증 (generic field 정규화 포함)
            try:
                op2, op_warnings = validate_operation(op, chart_context=chart_context)
                warnings.extend(op_warnings)
                parsed_ops.append(op2)
            except Exception as exc:
                errors.append(
                    f'group "{group_name}" ops[{i}] failed semantic validation: {exc}'
                )

        groups[group_name] = parsed_ops

    return groups, warnings, errors


def validate_refs_against_node_ids(
    groups: Dict[str, List[OperationSpec]],
) -> List[str]:
    """모든 meta.inputs 및 ref:nX 참조가 실제 nodeId를 가리키는지 검증합니다.

    Returns:
        errors: 오류 목록 (비어있으면 성공)
    """
    errors: List[str] = []
    node_ids: Set[str] = set()
    for ops in groups.values():
        for op in ops:
            if op.meta and isinstance(op.meta.nodeId, str):
                node_ids.add(op.meta.nodeId)

    for group_name, ops in groups.items():
        for i, op in enumerate(ops):
            dumped = op.model_dump(by_alias=True, exclude_none=True)
            meta = dumped.get("meta") if isinstance(dumped, dict) else None
            if isinstance(meta, dict):
                for inp in meta.get("inputs") or []:
                    if isinstance(inp, str) and inp and inp not in node_ids:
                        errors.append(
                            f'group "{group_name}" ops[{i}] meta.inputs '
                            f'references unknown nodeId "{inp}"'
                        )
            for ref in _scan_ref_strings(dumped):
                m = _REF_STR_RE.match(ref)
                if m and m.group(1) not in node_ids:
                    errors.append(
                        f'group "{group_name}" ops[{i}] references unknown scalar "{ref}"'
                    )

    return errors

```

## validation/plan_validators.py

```python
from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence, Set, Tuple

from ..core.models import ChartContext, PlanTree

_NODE_ID_RE = re.compile(r"^n[0-9]+$")
_GROUP_RE = re.compile(r"^(ops|ops[2-9]|ops[1-9][0-9]+)$")

# PlanTree.params should stay flat and stable to prevent "invented schemas"
# like {"field": {"name": ..., "role": ...}}.
_JSON_SCALAR_TYPES = (str, int, float, bool, type(None))

_ALLOWED_PARAMS_BY_OP: Dict[str, Set[str]] = {
    "retrieveValue": {"field", "target", "group"},
    "filter": {"field", "include", "exclude", "operator", "value", "group"},
    "findExtremum": {"field", "which", "group"},
    "determineRange": {"field", "group"},
    "compare": {"field", "targetA", "targetB", "group", "groupA", "groupB", "aggregate", "which"},
    "compareBool": {"field", "targetA", "targetB", "group", "groupA", "groupB", "aggregate", "operator"},
    "sort": {"field", "group", "order", "orderField"},
    "sum": {"field", "group"},
    "average": {"field", "group"},
    "diff": {
        "field",
        "targetA",
        "targetB",
        "group",
        "groupA",
        "groupB",
        "aggregate",
        "signed",
        "mode",
        "percent",
        "scale",
        "precision",
        "targetName",
    },
    "lagDiff": {"field", "group", "order", "absolute"},
    "nth": {"field", "group", "order", "orderField", "n", "from"},
    "count": {"field", "group"},
    "setOp": {"fn"},
}

_REQUIRED_PARAMS_BY_OP: Dict[str, Set[str]] = {
    "filter": {"field"},
    "determineRange": {"field"},
    "nth": {"n"},
    "setOp": {"fn"},
}


def _is_flat_json_value(value: Any) -> bool:
    if isinstance(value, _JSON_SCALAR_TYPES):
        return True
    if isinstance(value, list):
        return all(isinstance(item, _JSON_SCALAR_TYPES) for item in value)
    return False


def _format_errors(errors: Sequence[str], *, max_lines: int = 25) -> List[str]:
    lines = [line.strip() for line in errors if line.strip()]
    if len(lines) <= max_lines:
        return lines
    return lines[:max_lines] + [f"... ({len(lines) - max_lines} more)"]


def validate_plan_tree(plan_tree: PlanTree) -> Tuple[PlanTree, List[str]]:
    errors: List[str] = []
    warnings: List[str] = []

    if not plan_tree.nodes:
        errors.append("plan_tree.nodes must not be empty.")
        raise ValueError("\n".join(_format_errors(errors)))

    # nodeId uniqueness + format
    node_ids: List[str] = [node.nodeId for node in plan_tree.nodes]
    if len(set(node_ids)) != len(node_ids):
        errors.append("nodeId must be unique across all nodes.")

    for idx, node in enumerate(plan_tree.nodes):
        if not _NODE_ID_RE.match(node.nodeId):
            errors.append(f'nodes[{idx}].nodeId must match "n<digits>" (got "{node.nodeId}").')

        if not _GROUP_RE.match(node.group):
            errors.append(f'nodes[{idx}].group must be "ops", "ops2", "ops3", ... (got "{node.group}").')

        # Sentence-layer alignment is mandatory.
        expected_group = "ops" if node.sentenceIndex == 1 else f"ops{node.sentenceIndex}"
        if node.group != expected_group:
            errors.append(
                f'nodes[{idx}].group must match sentenceIndex (sentenceIndex={node.sentenceIndex} -> "{expected_group}", got "{node.group}").'
            )

        if node.op not in _ALLOWED_PARAMS_BY_OP:
            errors.append(f'nodes[{idx}].op "{node.op}" is not allowed.')

        # Flat params only, with stable keys.
        allowed_keys = _ALLOWED_PARAMS_BY_OP.get(node.op)
        if allowed_keys is None:
            errors.append(f'nodes[{idx}].op "{node.op}" has no plan param contract.')
            continue

        for key, value in node.params.items():
            if key not in allowed_keys:
                errors.append(f'nodes[{idx}].params has forbidden key "{key}" for op "{node.op}".')
                continue
            if not _is_flat_json_value(value):
                errors.append(f'nodes[{idx}].params["{key}"] must be a scalar or list of scalars (no objects).')

        required = _REQUIRED_PARAMS_BY_OP.get(node.op, set())
        missing = sorted(required - set(node.params.keys()))
        if missing:
            errors.append(f'nodes[{idx}] missing required params for "{node.op}": {missing}')

        # filter mode must be decided in module-1 to avoid later ambiguity.
        if node.op == "filter":
            has_inc_exc = bool(node.params.get("include")) or bool(node.params.get("exclude"))
            has_op_val = ("operator" in node.params) or ("value" in node.params)
            if has_inc_exc and has_op_val:
                errors.append(f"nodes[{idx}] filter cannot mix include/exclude with operator/value.")
            if ("operator" in node.params) != ("value" in node.params):
                errors.append(f"nodes[{idx}] filter requires both operator and value in comparison mode.")
            if not has_inc_exc and not has_op_val:
                errors.append(f"nodes[{idx}] filter must set include/exclude OR operator+value.")

        if node.op == "setOp":
            fn = node.params.get("fn")
            if fn not in ("intersection", "union"):
                errors.append(f'nodes[{idx}] setOp requires params.fn = "intersection" | "union".')
            if len(node.inputs) < 2:
                errors.append(f"nodes[{idx}] setOp requires inputs to reference at least two nodeIds.")

    # Inputs must reference earlier nodeIds (DAG, no forward refs).
    seen: Set[str] = set()
    for idx, node in enumerate(plan_tree.nodes):
        for inp in list(node.inputs):
            if inp not in seen:
                errors.append(f'nodes[{idx}].inputs references unknown or forward nodeId "{inp}".')
        seen.add(node.nodeId)

    if errors:
        raise ValueError("\n".join(_format_errors(errors)))
    return plan_tree, warnings


def _normalize_text(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _domain_mentions(text: str, domain: List[Any]) -> List[str]:
    # Case-insensitive exact substring match is sufficient for controlled domains like
    # "Broadcasting", "Commercial", "Europe", etc.
    normalized = _normalize_text(text)
    found: List[str] = []
    for raw in domain:
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        value_norm = _normalize_text(value)
        if value_norm and value_norm in normalized and value not in found:
            found.append(value)
    return found


def _infer_goal_signals(question: str) -> Dict[str, bool]:
    q = _normalize_text(question)
    return {
        "wants_list_targets": q.startswith("which ") or " which " in q,
        "wants_diff": "difference" in q or "gap" in q or "subtract" in q,
        "wants_intersection": " both " in f" {q} " or "in both" in q,
        "wants_extremum": any(tok in q for tok in ("largest", "biggest", "highest", "lowest", "smallest")),
        "wants_scalar_report": ("average" in q or "mean" in q or "sum" in q or "count" in q)
        and not (q.startswith("which ") or "difference" in q or "gap" in q),
    }


def validate_plan_against_intent(
    *,
    plan_tree: PlanTree,
    question: str,
    explanation: str,
    chart_context: ChartContext,
) -> None:
    errors: List[str] = []

    signals = _infer_goal_signals(question)
    series_field = chart_context.series_field
    series_domain: List[Any] = []
    if series_field:
        series_domain = list(chart_context.categorical_values.get(series_field, []))

    mentions = _domain_mentions(explanation, series_domain)
    wants_avg = "average" in _normalize_text(explanation) or "mean" in _normalize_text(explanation)

    # If the explanation clearly asks for average across multiple series values, require
    # per-series averages within sentence 1 (group="ops") using params.group="<value>".
    if wants_avg and len(mentions) >= 2:
        avg_nodes = [n for n in plan_tree.nodes if n.op == "average" and isinstance(n.params.get("group"), str)]
        groups_used = {(n.group, str(n.params.get("group"))) for n in avg_nodes}
        for value in mentions[:2]:
            if not any(group_value == value for _, group_value in groups_used):
                errors.append(f'Missing average branch for series value "{value}". Use params.group="{value}".')
        # Sentence-layer mode: do NOT require separate groups for series conjunction.
        # Averages should typically live in sentence 1 ("ops").
        if not any(n.group == "ops" and str(n.params.get("group")) in mentions for n in avg_nodes):
            errors.append('Series conjunction averages should be placed in group "ops" (sentenceIndex=1).')

    # If the question asks for intersection in both A and B, setOp(intersection) must exist.
    if signals["wants_intersection"] and signals["wants_list_targets"]:
        has_intersection = any(n.op == "setOp" and n.params.get("fn") == "intersection" for n in plan_tree.nodes)
        if not has_intersection:
            errors.append('Question implies "both" -> require setOp with params.fn="intersection".')

    # If question is scalar report, disallow joins.
    if signals["wants_scalar_report"]:
        has_setop = any(n.op == "setOp" for n in plan_tree.nodes)
        if has_setop:
            errors.append("Scalar-report question should not include setOp. Remove join operations.")

    if signals["wants_diff"]:
        has_diff = any(n.op == "diff" for n in plan_tree.nodes)
        if not has_diff:
            errors.append('Question asks for difference/gap -> require a "diff" node.')

    if signals["wants_extremum"]:
        has_extremum = any(n.op in {"findExtremum", "nth"} for n in plan_tree.nodes)
        if not has_extremum:
            errors.append('Question asks for largest/smallest -> require "findExtremum" or "nth".')

    if errors:
        raise ValueError("\n".join(_format_errors(errors)))

```

## validation/resolve_validators.py

```python
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from ..core.models import ChartContext

# 역할 토큰 집합: Step 1(토큰 해결) 이후 잔류하면 안 됨
_ROLE_TOKENS = {"@primary_measure", "@primary_dimension", "@series_field"}


def _collect_strings(obj: Any, into: List[str]) -> None:
    """dict/list/str 구조에서 모든 문자열 리프를 재귀적으로 수집."""
    if isinstance(obj, str):
        into.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect_strings(v, into)
    elif isinstance(obj, list):
        for item in obj:
            _collect_strings(item, into)


def find_unresolved_tokens(plan_tree: Dict[str, Any]) -> List[str]:
    """plan_tree 내에 아직 남아 있는 @token 문자열 목록을 반환."""
    strings: List[str] = []
    _collect_strings(plan_tree, strings)
    return [s for s in strings if s in _ROLE_TOKENS]


def validate_grounded_plan(
    plan_tree: Dict[str, Any],
    chart_context: ChartContext,
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """
    그라운딩된 plan_tree를 chart_context에 대해 검증.

    반환값: (plan_tree, warnings, errors)

    Hard errors (ValueError를 raise하는 조건):
      1. 미해결 @token 잔류
      2. params.field가 chart_context.fields에 없음
      3. ref:nX 참조가 존재하지 않는 nodeId를 가리킴
      4. inputs에 알 수 없는 nodeId 포함

    Soft warnings (경고만 발행):
      5. aggregate op의 field가 measure_fields에 없음
      6. group 값이 series domain에 없음
      7. include/exclude 값이 field의 categorical domain에 없음
    """
    warnings: List[str] = []
    errors: List[str] = []

    nodes = (plan_tree.get("nodes") or []) if isinstance(plan_tree, dict) else []

    # 알려진 nodeId 집합
    known_ids = {
        n["nodeId"]
        for n in nodes
        if isinstance(n, dict) and isinstance(n.get("nodeId"), str)
    }

    # series domain 캐시
    series_domain_strs: List[str] = []
    if chart_context.series_field:
        series_domain_strs = [
            str(v)
            for v in chart_context.categorical_values.get(chart_context.series_field, [])
        ]

    # 1. 미해결 @token 검사
    unresolved = find_unresolved_tokens(plan_tree)
    if unresolved:
        errors.append(
            f"미해결 역할 토큰이 남아 있음: {sorted(set(unresolved))}. "
            "모든 @token은 실제 필드명/값으로 치환돼야 합니다."
        )

    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"nodes[{idx}]: 객체여야 합니다.")
            continue

        node_id = node.get("nodeId", f"nodes[{idx}]")
        params = node.get("params") or {}
        if not isinstance(params, dict):
            continue

        field = params.get("field")

        # 2. field 존재 검사
        if isinstance(field, str) and field and field not in chart_context.fields:
            errors.append(
                f'node {node_id}: params.field="{field}"이 '
                f"chart_context.fields {chart_context.fields}에 없습니다."
            )

        # 5. aggregate op 필드는 measure여야 함 (warning)
        op = node.get("op", "")
        if op in ("average", "sum") and isinstance(field, str) and field:
            if field not in chart_context.measure_fields:
                warnings.append(
                    f'node {node_id}: op="{op}"의 field="{field}"이 '
                    f"measure_fields {chart_context.measure_fields}에 없습니다."
                )

        # 6. group 값이 series domain에 있는지 (warning)
        group_val = params.get("group")
        if isinstance(group_val, str) and group_val and series_domain_strs:
            if group_val not in series_domain_strs:
                warnings.append(
                    f'node {node_id}: group="{group_val}"이 '
                    f"series domain {series_domain_strs}에 없습니다."
                )

        # 7. include/exclude 값이 categorical domain에 있는지 (warning)
        for list_param in ("include", "exclude"):
            vals = params.get(list_param)
            if not isinstance(vals, list):
                continue
            if isinstance(field, str) and field in chart_context.categorical_values:
                domain = [
                    str(v) for v in chart_context.categorical_values.get(field, [])
                ]
                domain_lower = {d.lower() for d in domain}
                for val in vals:
                    if isinstance(val, str) and val.lower() not in domain_lower:
                        warnings.append(
                            f'node {node_id}: {list_param}="{val}"이 '
                            f'categorical_values["{field}"] domain에 없습니다. '
                            "대소문자 정확도를 확인하세요."
                        )

        # 3. ref:nX 참조 유효성
        for param_key, param_val in params.items():
            if isinstance(param_val, str) and param_val.startswith("ref:"):
                ref_target = param_val[4:]
                if ref_target not in known_ids:
                    errors.append(
                        f'node {node_id}: params.{param_key}="{param_val}"이 '
                        f'알 수 없는 nodeId "{ref_target}"를 참조합니다.'
                    )

        # 4. inputs nodeId 유효성
        inputs = node.get("inputs") or []
        if isinstance(inputs, list):
            for inp in inputs:
                if isinstance(inp, str) and inp not in known_ids:
                    errors.append(
                        f'node {node_id}: inputs에 알 수 없는 nodeId "{inp}"이 포함됩니다.'
                    )

    return plan_tree, warnings, errors

```

## validation/validators.py

```python
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..core.models import ChartContext
from ..runtime.op_registry import ALLOWED_OPS, LEGACY_NON_DRAW_OPS
from ..specs.aggregate import AverageOp, SumOp
from ..specs.compare import CompareBoolOp
from ..specs.filter import FilterOp
from ..specs.range_sort_select import NthOp
from ..specs.set_op import SetOp
from ..specs.union import OperationSpec
from ..core.types import PrimitiveValue


def is_allowed_op(op_name: str) -> bool:
    return op_name in ALLOWED_OPS


def _sorted_unique(values: Iterable[PrimitiveValue]) -> List[PrimitiveValue]:
    unique: Dict[str, PrimitiveValue] = {}
    for value in values:
        key = f"{type(value).__name__}:{value}"
        if key not in unique:
            unique[key] = value
    return sorted(unique.values(), key=lambda item: str(item))


def _resolve_scalar_reference(raw: Any, runtime_scalars: Dict[str, float]) -> Tuple[Any, Optional[str]]:
    if isinstance(raw, dict) and isinstance(raw.get("id"), str):
        key = raw["id"]
        if key in runtime_scalars:
            return runtime_scalars[key], None
        return raw, f'Unknown scalar reference id: "{key}"'
    if isinstance(raw, str) and raw.startswith("ref:n"):
        key = raw[len("ref:") :]
        if key in runtime_scalars:
            return runtime_scalars[key], None
        return raw, f'Unknown scalar reference id: "{key}"'
    return raw, None


def _ensure_field_exists(field: str, chart_context: ChartContext) -> None:
    if field not in chart_context.fields:
        raise ValueError(f'Unknown field "{field}". Must be one of chart_context.fields.')


def _validate_include_exclude_domain(op: FilterOp, chart_context: ChartContext) -> None:
    domain = chart_context.categorical_values.get(op.field)
    if not domain:
        return
    domain_set = {str(item) for item in domain}
    for value in op.include or []:
        if str(value) not in domain_set:
            raise ValueError(f'filter include value "{value}" is outside domain for field "{op.field}"')
    for value in op.exclude or []:
        if str(value) not in domain_set:
            raise ValueError(f'filter exclude value "{value}" is outside domain for field "{op.field}"')


def validate_filter_spec(
    op: FilterOp,
    *,
    chart_context: ChartContext,
    runtime_scalars: Optional[Dict[str, float]] = None,
) -> Tuple[FilterOp, List[str]]:
    warnings: List[str] = []

    # Canonicalize generic field tokens early.
    updated = op
    if updated.field == "value":
        updated = updated.model_copy(update={"field": chart_context.primary_measure})
        warnings.append(f'filter generic field "value" replaced with primary_measure "{chart_context.primary_measure}"')

    _ensure_field_exists(updated.field, chart_context)

    # Enforce semantic single-path rules to reduce equivalent representations:
    # - Do NOT filter on series_field directly; series restriction must be encoded via op.group.
    if chart_context.series_field and updated.field == chart_context.series_field:
        raise ValueError(
            f'filter on series_field "{chart_context.series_field}" is forbidden; '
            'restrict series via op.group="<series value>" instead.'
        )

    has_include = bool(updated.include)
    has_exclude = bool(updated.exclude)
    has_operator = bool(updated.operator)
    has_value = updated.value is not None

    membership_mode = has_include or has_exclude
    comparison_mode = has_operator or has_value

    if not membership_mode and not comparison_mode:
        raise ValueError('filter requires either membership(include/exclude) or comparison(operator/value)')
    if membership_mode and comparison_mode:
        raise ValueError("filter cannot mix membership(include/exclude) and comparison(operator/value)")
    if has_operator and not has_value:
        raise ValueError('filter requires "value" when "operator" is provided')
    if has_value and not has_operator:
        raise ValueError('filter requires "operator" when "value" is provided')

    # Membership filters must select targets on the primary dimension only (x-axis).
    # This matches the legacy engine semantics and removes ambiguous representations.
    if membership_mode and updated.field != chart_context.primary_dimension:
        raise ValueError(
            f'filter membership mode must use primary_dimension "{chart_context.primary_dimension}", '
            f'got "{updated.field}"'
        )

    # Comparison filters must compare numeric measure values.
    if comparison_mode and chart_context.measure_fields and updated.field not in chart_context.measure_fields:
        raise ValueError(f'filter comparison mode requires numeric measure field, got "{updated.field}"')

    if runtime_scalars is not None and has_value:
        resolved, warn = _resolve_scalar_reference(updated.value, runtime_scalars)
        if warn:
            warnings.append(warn)
        else:
            updated = updated.model_copy(update={"value": resolved})

    if updated.include:
        updated = updated.model_copy(update={"include": _sorted_unique(updated.include)})
    if updated.exclude:
        updated = updated.model_copy(update={"exclude": _sorted_unique(updated.exclude)})

    _validate_include_exclude_domain(updated, chart_context)
    return updated, warnings


def _validate_numeric_aggregate_field(
    op: OperationSpec,
    *,
    chart_context: ChartContext,
) -> Tuple[OperationSpec, List[str]]:
    warnings: List[str] = []
    field = getattr(op, "field", None)
    if not field:
        field = chart_context.primary_measure
        warnings.append(f'{op.op} field defaulted to primary_measure "{field}"')
        op = op.model_copy(update={"field": field})
    if field == "value":
        field = chart_context.primary_measure
        warnings.append(f'{op.op} generic field "value" replaced with primary_measure "{field}"')
        op = op.model_copy(update={"field": field})
    _ensure_field_exists(field, chart_context)
    if chart_context.measure_fields and field not in chart_context.measure_fields:
        raise ValueError(f'{op.op} requires numeric measure field, got "{field}"')
    return op, warnings


def validate_operation(
    op: OperationSpec,
    *,
    chart_context: ChartContext,
    runtime_scalars: Optional[Dict[str, float]] = None,
) -> Tuple[OperationSpec, List[str]]:
    warnings: List[str] = []

    if not is_allowed_op(op.op):
        raise ValueError(f'Unsupported operation "{op.op}"')

    if isinstance(op, FilterOp):
        return validate_filter_spec(op, chart_context=chart_context, runtime_scalars=runtime_scalars)

    if isinstance(op, (AverageOp, SumOp)):
        updated, op_warnings = _validate_numeric_aggregate_field(op, chart_context=chart_context)
        warnings.extend(op_warnings)
        return updated, warnings

    if isinstance(op, SetOp):
        if op.meta is None or len(op.meta.inputs) < 2:
            raise ValueError('setOp requires meta.inputs with at least two nodeIds')
        return op, warnings

    if isinstance(op, CompareBoolOp) and not op.operator:
        raise ValueError("compareBool requires operator")

    if isinstance(op, NthOp) and op.n is None:
        raise ValueError("nth requires n")

    field = getattr(op, "field", None)
    if isinstance(field, str):
        if field in {"value", "category"}:
            raise ValueError(f'Generic field "{field}" is not allowed; use chart_context field name.')
        _ensure_field_exists(field, chart_context)

    return op, warnings

```

