from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from ..core.models import ChartContext
from ..core.recursive_models import OpInventory, OpTask, StepComposeOutput
from ..runtime.artifacts import contains_object_ref, extract_scalar_ref_deps


_TASK_ID_RE = re.compile(r"^o[0-9]+$")
_NODE_ID_RE = re.compile(r"^n[0-9]+$")
_SENTENCE_LAYER_GROUP_RE = re.compile(r"^ops(?:\d+)?$")
_STRICT_SINGLE_GROUP_OPS: Set[str] = {
    "average",
    "count",
    "findExtremum",
    "sort",
    "determineRange",
    "retrieveValue",
    "lagDiff",
    "nth",
}

_VISUAL_DIRECTIVE_OPS: Set[str] = {
    "highlight",
    "draw",
    "split",
    "align",
    "reference_line",
    "referenceline",
    "reference line",
}

_VISUAL_DIRECTIVE_KEYWORDS: Tuple[str, ...] = (
    "highlight",
    "draw",
    "split",
    "align",
    "reference line",
    "reference-line",
)


def _is_visual_directive_task(task: OpTask) -> bool:
    op = str(task.op or "").strip().lower()
    if op in _VISUAL_DIRECTIVE_OPS:
        return True
    mention = str(task.mention or "").strip().lower()
    if any(k in mention for k in _VISUAL_DIRECTIVE_KEYWORDS):
        return True
    return False


def _domain_mentions(text: str, domain: List[Any]) -> List[str]:
    normalized = " ".join(str(text or "").strip().lower().split())
    out: List[str] = []
    for raw in domain:
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        value_norm = " ".join(value.lower().split())
        if value_norm and value_norm in normalized and value not in out:
            out.append(value)
    return out


def _format_errors(errors: Sequence[str], *, max_lines: int = 30) -> List[str]:
    lines = [line.strip() for line in errors if line.strip()]
    if len(lines) <= max_lines:
        return lines
    return lines[:max_lines] + [f"... ({len(lines) - max_lines} more)"]


def _allowed_param_keys_for_op(ops_contract: Dict[str, Any], op_name: str) -> Set[str]:
    contracts = ops_contract.get("op_contracts") if isinstance(ops_contract, dict) else None
    op_contract = contracts.get(op_name) if isinstance(contracts, dict) else None
    if not isinstance(op_contract, dict):
        return set()
    required = op_contract.get("required_fields") or []
    optional = op_contract.get("optional_fields") or []
    keys: Set[str] = set()
    for item in list(required) + list(optional):
        if isinstance(item, str) and item:
            keys.add(item)
    return keys


def _required_param_keys_for_op(ops_contract: Dict[str, Any], op_name: str) -> Set[str]:
    contracts = ops_contract.get("op_contracts") if isinstance(ops_contract, dict) else None
    op_contract = contracts.get(op_name) if isinstance(contracts, dict) else None
    if not isinstance(op_contract, dict):
        return set()
    required = op_contract.get("required_fields") or []
    out: Set[str] = set()
    for item in required:
        if isinstance(item, str) and item:
            out.add(item)
    return out


def _is_flat_value(value: Any) -> bool:
    if isinstance(value, (str, int, float, bool, type(None))):
        return True
    if isinstance(value, list):
        return all(isinstance(item, (str, int, float, bool, type(None))) for item in value)
    return False


def _validate_step_compose_group_semantics(
    *,
    op_name: str,
    op_spec: Dict[str, Any],
    chart_context: Optional[ChartContext],
    errors: List[str],
) -> None:
    if op_name not in _STRICT_SINGLE_GROUP_OPS:
        return
    if "group" not in op_spec:
        return

    raw_group = op_spec.get("group")
    if raw_group is None:
        return
    if isinstance(raw_group, list):
        errors.append(
            f"{op_name}.group must be a single series value string (not list). "
            "for year subsets, use filter(include=[...]) + average(inputs=[filter_node])."
        )
        return
    if not isinstance(raw_group, str):
        errors.append(f"{op_name}.group must be a non-empty string.")
        return

    token = raw_group.strip()
    if not token:
        errors.append(f"{op_name}.group must be a non-empty string.")
        return
    if _SENTENCE_LAYER_GROUP_RE.fullmatch(token):
        errors.append(
            f'{op_name}.group "{token}" is invalid; sentence-layer tokens (ops/ops2/...) are not series values.'
        )
        return

    if chart_context is None:
        return
    if not chart_context.series_field:
        errors.append(
            f"{op_name}.group is invalid because chart_context.series_field is empty. "
            "for year subsets, use filter(include=[...]) + average(inputs=[filter_node])."
        )
        return

    domain = chart_context.categorical_values.get(chart_context.series_field, [])
    if domain:
        domain_set = {str(v) for v in domain}
        if token not in domain_set:
            errors.append(
                f'{op_name}.group "{token}" is outside series domain for field "{chart_context.series_field}". '
                "for year subsets, use filter(include=[...]) + average(inputs=[filter_node])."
            )


def validate_inventory(
    inventory_dict: Dict[str, Any],
    *,
    ops_contract: Dict[str, Any],
    chart_context: ChartContext,
) -> OpInventory:
    sanitized = {k: v for k, v in (inventory_dict or {}).items() if k != "_debug" and not str(k).startswith("_")}
    try:
        inventory = OpInventory.model_validate(sanitized)
    except Exception as exc:
        raise ValueError(f"inventory schema error: {exc}") from exc

    errors: List[str] = []

    allowed_ops = set(ops_contract.get("allowed_ops") or [])

    # Visual directives (highlight/draw/split/align/reference line) are NOT part of the non-draw
    # OpsSpec pipeline. Drop them from tasks and surface them as warnings.
    kept_tasks: List[OpTask] = []
    dropped_visual: List[OpTask] = []
    dropped_series_field_filter: List[OpTask] = []

    series_domain: List[Any] = []
    if chart_context.series_field:
        series_domain = list(chart_context.categorical_values.get(chart_context.series_field, []))
    for task in inventory.tasks:
        if allowed_ops and task.op not in allowed_ops and _is_visual_directive_task(task):
            dropped_visual.append(task)
            continue

        # Hard rule: never model series restriction as a filter on the series field.
        # Treat it as a directive and encode it via op_spec.group in later steps.
        if task.op == "filter" and chart_context.series_field:
            hint_field = (task.paramsHint or {}).get("field")
            if isinstance(hint_field, str) and hint_field in {"@series_field", chart_context.series_field}:
                dropped_series_field_filter.append(task)
                continue

        kept_tasks.append(task)

    if dropped_visual:
        inventory.warnings.extend(
            [
                f'ignored visual directive: op="{t.op}" sentenceIndex={t.sentenceIndex} mention="{t.mention}"'
                for t in dropped_visual
            ]
        )

    if dropped_series_field_filter:
        for t in dropped_series_field_filter:
            hint = t.paramsHint or {}
            include = hint.get("include")
            exclude = hint.get("exclude")
            suffix = ""
            if isinstance(include, list) and include:
                suffix = f" include={include}"
            elif isinstance(exclude, list) and exclude:
                suffix = f" exclude={exclude}"
            inventory.warnings.append(
                "ignored filter on series_field; represent series restriction via op_spec.group instead: "
                f'op="{t.op}" sentenceIndex={t.sentenceIndex} mention="{t.mention}"{suffix}'
            )

    inventory.tasks = kept_tasks

    task_ids = [t.taskId for t in inventory.tasks]
    if not inventory.tasks:
        errors.append("inventory.tasks must not be empty.")
    if len(set(task_ids)) != len(task_ids):
        errors.append("inventory.taskId must be unique.")

    for idx, task in enumerate(inventory.tasks):
        if not _TASK_ID_RE.match(str(task.taskId)):
            errors.append(f'tasks[{idx}].taskId must match "o<digits>" (got "{task.taskId}").')
        if allowed_ops and task.op not in allowed_ops:
            errors.append(f'tasks[{idx}].op "{task.op}" is not in allowed_ops.')
        allowed_keys = _allowed_param_keys_for_op(ops_contract, task.op)
        for key, value in (task.paramsHint or {}).items():
            if allowed_keys and key not in allowed_keys:
                errors.append(f'tasks[{idx}].paramsHint has forbidden key "{key}" for op "{task.op}".')
            if not _is_flat_value(value):
                errors.append(f'tasks[{idx}].paramsHint["{key}"] must be a scalar or list of scalars.')

        # Series restriction: do not allow filter on series_field at all.
        if task.op == "filter":
            field = task.paramsHint.get("field")
            if isinstance(field, str) and chart_context.series_field and field in {"@series_field", chart_context.series_field}:
                errors.append(
                    f'tasks[{idx}] filter on series_field is forbidden; use op_spec.group="<series value>" or op_spec.group=["A","B"] instead.'
                )

    if errors:
        raise ValueError("\n".join(_format_errors(errors)))
    return inventory


def validate_step_compose_output(
    payload: Dict[str, Any],
    *,
    selected_task: OpTask,
    executed_node_ids: Set[str],
    ops_contract: Dict[str, Any],
    chart_context: Optional[ChartContext] = None,
) -> StepComposeOutput:
    sanitized = {k: v for k, v in (payload or {}).items() if k != "_debug" and not str(k).startswith("_")}
    try:
        parsed = StepComposeOutput.model_validate(sanitized)
    except Exception as exc:
        raise ValueError(f"step-compose schema error: {exc}") from exc

    errors: List[str] = []
    task = selected_task

    if not isinstance(parsed.op_spec, dict) or not parsed.op_spec:
        errors.append("op_spec must be a non-empty object.")
        raise ValueError("\n".join(_format_errors(errors)))

    # Forbid non-canonical refs and forbidden top-level keys.
    if contains_object_ref(parsed.op_spec):
        errors.append('Object reference like {"id":"nX"} is forbidden; use string "ref:nX" only.')
    for forbidden in ("id", "meta", "chartId"):
        if forbidden in parsed.op_spec:
            errors.append(f'op_spec must NOT include "{forbidden}". It is assigned deterministically by the pipeline.')

    op_name = parsed.op_spec.get("op")
    if not isinstance(op_name, str) or not op_name:
        errors.append('op_spec.op must be a non-empty string.')
    elif op_name != task.op:
        errors.append(f'op_spec.op must match task.op "{task.op}" (got "{op_name}").')
    if isinstance(op_name, str) and op_name:
        _validate_step_compose_group_semantics(
            op_name=op_name,
            op_spec=parsed.op_spec,
            chart_context=chart_context,
            errors=errors,
        )

    # Contract-based key validation.
    if isinstance(op_name, str) and op_name:
        allowed_keys = _allowed_param_keys_for_op(ops_contract, op_name)
        required_keys = _required_param_keys_for_op(ops_contract, op_name)
        for key in parsed.op_spec.keys():
            if key == "op":
                continue
            if allowed_keys and key not in allowed_keys:
                errors.append(f'op_spec has forbidden key "{key}" for op "{op_name}".')
        missing = sorted([k for k in required_keys if k not in parsed.op_spec])
        if missing:
            errors.append(f'op_spec missing required keys for "{op_name}": {missing}')

        # Minimal semantic checks (for better feedback).
        if op_name == "filter":
            has_inc_exc = bool(parsed.op_spec.get("include")) or bool(parsed.op_spec.get("exclude"))
            has_op = "operator" in parsed.op_spec
            has_val = "value" in parsed.op_spec
            has_group = bool(parsed.op_spec.get("group"))
            if has_inc_exc and (has_op or has_val):
                errors.append("filter cannot mix include/exclude with operator/value.")
            if has_op != has_val:
                errors.append("filter comparison mode requires both operator and value.")
            if not has_inc_exc and not (has_op and has_val) and not has_group:
                errors.append("filter requires one mode: include/exclude, operator+value, or group-only.")
        if op_name == "setOp":
            if len(parsed.inputs) < 2:
                errors.append("setOp requires inputs with at least two nodeIds.")
        if op_name == "add":
            has_a = "targetA" in parsed.op_spec
            has_b = "targetB" in parsed.op_spec
            if not has_a or not has_b:
                errors.append('add requires both targetA and targetB.')

        # diff/compare/compareBool: targetA/targetB 또는 scalar ref inputs 중 하나 이상 필요.
        # 없으면 executor가 슬라이스/scalar를 찾지 못해 런타임 오류가 발생하므로 조기 감지.
        if op_name in ("diff", "compare", "compareBool"):
            has_target = (
                bool(parsed.op_spec.get("targetA"))
                or bool(parsed.op_spec.get("targetB"))
                or bool(parsed.op_spec.get("target"))
            )
            has_inputs = bool(parsed.inputs)
            if not has_target and not has_inputs:
                errors.append(
                    f'op "{op_name}" requires at least one of targetA/targetB/target (dimension labels) '
                    'or inputs[] (nodeIds for scalar refs). '
                    'Provide target values or reference prior nodes via "ref:nX" in op_spec fields.'
                )

    # Validate inputs + refs against executed nodes.
    for idx, node_id in enumerate(parsed.inputs or []):
        if not isinstance(node_id, str) or not _NODE_ID_RE.match(node_id):
            errors.append(f'inputs[{idx}] must be a nodeId "n<digits>" (got "{node_id}").')
            continue
        if node_id not in executed_node_ids:
            errors.append(f'inputs[{idx}] references unknown or future nodeId "{node_id}".')

    scalar_deps = set(extract_scalar_ref_deps(parsed.op_spec))
    missing_refs = sorted([nid for nid in scalar_deps if nid not in executed_node_ids])
    if missing_refs:
        errors.append(f'op_spec has scalar refs to unknown nodeIds: {missing_refs}')

    # Data-parent constraint (executor semantics): only one non-scalar data parent except setOp.
    if isinstance(op_name, str) and op_name and op_name != "setOp":
        data_parents = [nid for nid in (parsed.inputs or []) if nid not in scalar_deps]
        if len(data_parents) > 1:
            errors.append(
                f'op "{op_name}" can have at most 1 data parent input (got {data_parents}). '
                "Use scalar refs for scalar dependencies."
            )

    if errors:
        raise ValueError("\n".join(_format_errors(errors)))
    return parsed
