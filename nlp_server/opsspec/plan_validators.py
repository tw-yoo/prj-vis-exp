from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence, Set, Tuple

from .models import ChartContext, PlanTree

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
