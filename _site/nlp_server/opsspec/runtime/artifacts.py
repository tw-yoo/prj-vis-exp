from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

from ..core.datum import DatumValue
from ..core.models import ChartContext
from ..core.types import JsonValue


_REF_RE = re.compile(r"^ref:(n[0-9]+)$")


def extract_scalar_ref_deps(obj: Any) -> Set[str]:
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
            deps |= extract_scalar_ref_deps(item)
        return deps
    if isinstance(obj, dict):
        for _, item in obj.items():
            deps |= extract_scalar_ref_deps(item)
        return deps
    return deps


def contains_object_ref(obj: Any) -> bool:
    """
    Forbidden scalar reference style: {"id":"n1"}.
    We treat *any* dict with exactly {"id": <str>} as forbidden to keep references canonical.
    """
    if obj is None:
        return False
    if isinstance(obj, dict):
        if set(obj.keys()) == {"id"} and isinstance(obj.get("id"), str):
            return True
        return any(contains_object_ref(v) for v in obj.values())
    if isinstance(obj, list):
        return any(contains_object_ref(item) for item in obj)
    return False


def _safe_str(value: Optional[str]) -> str:
    return str(value or "").strip()


def summarize_runtime_values(
    values: List[DatumValue],
    *,
    chart_context: ChartContext,
    max_items: int,
) -> Dict[str, JsonValue]:
    """
    Deterministic, compact summary of executor runtime output for LLM prompting/debug.
    """
    out: Dict[str, JsonValue] = {"count": len(values)}
    if not values:
        out["kind"] = "empty"
        out["scalarRefOk"] = False
        out["preview"] = []
        return out

    all_categories = {_safe_str(v.category) for v in values}
    is_scalar_like = all_categories <= {"result"} and len(values) >= 1
    out["kind"] = "scalar" if is_scalar_like else "table"
    out["scalarRefOk"] = bool(is_scalar_like)

    last = values[-1]
    out["last"] = {"target": last.target, "group": last.group, "value": float(last.value)}

    # Stable preview: sort by (group, target, value)
    def _key(v: DatumValue) -> tuple[str, str, float]:
        return (_safe_str(v.group), _safe_str(v.target), float(v.value))

    ordered = sorted(values, key=_key)
    preview: List[Dict[str, JsonValue]] = []
    for v in ordered[: max(0, int(max_items))]:
        preview.append(
            {
                "target": v.target,
                "group": v.group,
                "value": float(v.value),
                "category": v.category,
                "measure": v.measure,
            }
        )
    out["preview"] = preview

    # Helpful domain hints (small + stable)
    if not is_scalar_like:
        targets = sorted({str(v.target) for v in values if str(v.target).strip()})
        out["targets_preview"] = targets[: max_items]
    out["primary_dimension"] = chart_context.primary_dimension
    out["primary_measure"] = chart_context.primary_measure
    out["series_field"] = chart_context.series_field
    return out

