from __future__ import annotations

from typing import Any, Dict, List

from ..specs.union import OperationSpec


def _group_to_sentence_index(group_name: str) -> int:
    if group_name == "ops":
        return 1
    if group_name.startswith("ops") and group_name[3:].isdigit():
        value = int(group_name[3:])
        return value if value >= 2 else 1
    return 1


def _ordered_group_names(group_names: List[str]) -> List[str]:
    unique: List[str] = []
    seen: set[str] = set()
    for name in group_names:
        if not isinstance(name, str):
            continue
        if name in seen:
            continue
        seen.add(name)
        unique.append(name)
    ordered: List[str] = []
    if "ops" in unique:
        ordered.append("ops")
    ordered.extend(
        sorted(
            [name for name in unique if name.startswith("ops") and name[3:].isdigit()],
            key=lambda name: int(name[3:]),
        )
    )
    ordered.extend(sorted([name for name in unique if name not in ordered]))
    return ordered


def _infer_sentence_index_for_group(group_name: str, group_ops: List[OperationSpec]) -> int:
    indices: List[int] = []
    for op in group_ops:
        meta = op.meta if op else None
        sentence_index = getattr(meta, "sentenceIndex", None) if meta else None
        if isinstance(sentence_index, int) and sentence_index >= 1:
            indices.append(int(sentence_index))
    if not indices:
        return _group_to_sentence_index(group_name)
    return min(indices)


def build_sentence_execution_plan(
    *,
    ops_spec: Dict[str, List[OperationSpec]],
    draw_plan_groups: Dict[str, List[Dict[str, Any]]] | None = None,
) -> Dict[str, Any]:
    sentence_to_groups: Dict[int, List[str]] = {}
    ordered_groups = _ordered_group_names(list(ops_spec.keys()))
    for group_name in ordered_groups:
        sentence_index = _infer_sentence_index_for_group(group_name, ops_spec.get(group_name, []))
        sentence_to_groups.setdefault(sentence_index, []).append(group_name)

    draw_groups = draw_plan_groups or {}
    steps: List[Dict[str, Any]] = []
    for sentence_index in sorted(sentence_to_groups.keys()):
        group_names = sentence_to_groups.get(sentence_index, [])

        draw_group_names = [name for name in group_names if isinstance(draw_groups.get(name), list)]
        step: Dict[str, Any] = {
            "id": f"s{sentence_index}",
            "sentenceIndex": int(sentence_index),
            "groupNames": group_names,
            "drawGroupNames": draw_group_names,
            "parallel": True,
        }
        steps.append(step)

    return {
        "mode": "sentence-step",
        "steps": steps,
    }
