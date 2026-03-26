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
ValidationIssue = Dict[str, Any]


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


def _scan_ref_strings_with_paths(value: Any, path: str = "$") -> List[Tuple[str, str]]:
    """value 내 모든 "ref:..." 문자열과 경로를 수집합니다."""
    refs: List[Tuple[str, str]] = []
    if value is None:
        return refs
    if isinstance(value, str):
        if value.startswith("ref:"):
            refs.append((value, path))
        return refs
    if isinstance(value, dict):
        for key, item in value.items():
            next_path = f"{path}.{key}" if path != "$" else str(key)
            refs.extend(_scan_ref_strings_with_paths(item, next_path))
        return refs
    if isinstance(value, list):
        for idx, item in enumerate(value):
            refs.extend(_scan_ref_strings_with_paths(item, f"{path}[{idx}]"))
        return refs
    return refs


def _issue(
    *,
    code: str,
    message: str,
    stage: str,
    group: Optional[str] = None,
    op_index: Optional[int] = None,
    path: Optional[str] = None,
    op: Optional[str] = None,
    node_id: Optional[str] = None,
) -> ValidationIssue:
    out: ValidationIssue = {
        "code": code,
        "stage": stage,
        "message": message,
    }
    if group is not None:
        out["group"] = group
    if op_index is not None:
        out["opIndex"] = op_index
    if path is not None:
        out["path"] = path
    if op is not None:
        out["op"] = op
    if node_id is not None:
        out["nodeId"] = node_id
    return out


def _group_to_sentence_index(group_name: str) -> Optional[int]:
    """그룹명에서 sentence index를 추출합니다.

    - "ops"       → 1
    - "ops2"~     → 2, 3, ...
    - 그 외 커스텀 이름 → 9999 (최하위 우선순위, 허용됨)
    """
    if group_name == "ops":
        return 1
    if group_name.startswith("ops") and group_name[3:].isdigit():
        try:
            idx = int(group_name[3:])
            return idx if idx >= 2 else None
        except Exception:
            return None
    # 커스텀 그룹 이름 허용 (예: "split_demo", "filter_asia", "merge" 등)
    return 9999


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
    groups, warnings, errors, _issues = _validate_and_parse_ops_spec_groups_impl(
        raw_groups,
        chart_context,
        collect_issues=False,
    )
    return groups, warnings, errors


def _validate_and_parse_ops_spec_groups_impl(
    raw_groups: Dict[str, Any],
    chart_context: ChartContext,
    *,
    collect_issues: bool,
) -> Tuple[Dict[str, List[OperationSpec]], List[str], List[str], List[ValidationIssue]]:
    warnings: List[str] = []
    errors: List[str] = []
    issues: List[ValidationIssue] = []
    groups: Dict[str, List[OperationSpec]] = {}

    for group_name, raw_ops in raw_groups.items():
        if group_name == "last":
            msg = 'group "last" is forbidden (sentence-layer groups only)'
            errors.append(msg)
            if collect_issues:
                issues.append(_issue(code="forbidden_group", message=msg, stage="group", group=group_name))
            continue

        sentence_index = _group_to_sentence_index(group_name)
        if sentence_index is None:
            msg = f'invalid group name "{group_name}" (expected "ops" or "opsN" with N>=2)'
            errors.append(msg)
            if collect_issues:
                issues.append(_issue(code="invalid_group_name", message=msg, stage="group", group=group_name))
            continue
        # sentence_index == 9999 이면 커스텀 이름 — 경고 없이 통과

        if raw_ops is None:
            raw_ops = []
        if not isinstance(raw_ops, list):
            msg = f'group "{group_name}" must be a list'
            errors.append(msg)
            if collect_issues:
                issues.append(_issue(code="group_not_list", message=msg, stage="group", group=group_name))
            continue

        parsed_ops: List[OperationSpec] = []
        for i, raw in enumerate(raw_ops):
            if not isinstance(raw, dict):
                msg = f'group "{group_name}" ops[{i}] must be an object'
                errors.append(msg)
                if collect_issues:
                    issues.append(_issue(code="op_not_object", message=msg, stage="schema", group=group_name, op_index=i))
                continue
            op_name = raw.get("op") if isinstance(raw.get("op"), str) else None

            if _scan_forbidden_ref_objects(raw):
                msg = f'group "{group_name}" ops[{i}] contains forbidden ref object (use "ref:nX" strings only)'
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="forbidden_ref_object",
                            message=msg,
                            stage="schema",
                            group=group_name,
                            op_index=i,
                            op=op_name,
                        )
                    )
                continue

            for ref in _scan_ref_strings(raw):
                if not _REF_STR_RE.match(ref):
                    msg = f'group "{group_name}" ops[{i}] has invalid ref string "{ref}" (must be "ref:nX")'
                    errors.append(msg)
                    if collect_issues:
                        issues.append(
                            _issue(
                                code="invalid_ref_string",
                                message=msg,
                                stage="schema",
                                group=group_name,
                                op_index=i,
                                op=op_name,
                            )
                        )

            if isinstance(raw, dict) and raw.get('op') == 'draw':
                # draw ops는 클라이언트 전용 시각화 명령 — 서버 스키마 검증 없이 스킵
                continue

            try:
                op = parse_operation_spec(raw)
            except Exception as exc:
                msg = f'group "{group_name}" ops[{i}] failed schema validation: {exc}'
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="schema_validation_error",
                            message=msg,
                            stage="schema",
                            group=group_name,
                            op_index=i,
                            op=op_name,
                        )
                    )
                continue

            dumped = op.model_dump(by_alias=True, exclude_none=False)
            meta = dumped.get("meta") if isinstance(dumped, dict) else None
            if not isinstance(meta, dict):
                meta = {}

            # nodeId 검증
            node_id = meta.get("nodeId")
            if node_id is None:
                msg = f'group "{group_name}" ops[{i}] meta.nodeId is required (e.g., "n1")'
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="missing_node_id",
                            message=msg,
                            stage="meta",
                            group=group_name,
                            op_index=i,
                            path="meta.nodeId",
                            op=op.op,
                        )
                    )
            elif not (isinstance(node_id, str) and re.match(r"^n[0-9]+$", node_id)):
                msg = f'group "{group_name}" ops[{i}] meta.nodeId must match "^n[0-9]+$" (got {node_id!r})'
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="invalid_node_id",
                            message=msg,
                            stage="meta",
                            group=group_name,
                            op_index=i,
                            path="meta.nodeId",
                            op=op.op,
                        )
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
                msg = f'group "{group_name}" ops[{i}] meta.inputs must be a string array'
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="invalid_inputs_type",
                            message=msg,
                            stage="meta",
                            group=group_name,
                            op_index=i,
                            path="meta.inputs",
                            op=op.op,
                        )
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
                msg = (
                    f'group "{group_name}" ops[{i}] meta.sentenceIndex={si} '
                    f'mismatches group sentence index {sentence_index}'
                )
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="sentence_index_mismatch",
                            message=msg,
                            stage="meta",
                            group=group_name,
                            op_index=i,
                            path="meta.sentenceIndex",
                            op=op.op,
                            node_id=node_id if isinstance(node_id, str) else None,
                        )
                    )

            # 의미 규칙 검증 (generic field 정규화 포함)
            try:
                op2, op_warnings = validate_operation(op, chart_context=chart_context)
                warnings.extend(op_warnings)
                parsed_ops.append(op2)
            except Exception as exc:
                msg = f'group "{group_name}" ops[{i}] failed semantic validation: {exc}'
                errors.append(msg)
                if collect_issues:
                    issues.append(
                        _issue(
                            code="semantic_validation_error",
                            message=msg,
                            stage="semantic",
                            group=group_name,
                            op_index=i,
                            op=op.op,
                            node_id=node_id if isinstance(node_id, str) else None,
                        )
                    )

        groups[group_name] = parsed_ops

    return groups, warnings, errors, issues


def validate_refs_against_node_ids(
    groups: Dict[str, List[OperationSpec]],
) -> List[str]:
    """모든 meta.inputs 및 ref:nX 참조가 실제 nodeId를 가리키는지 검증합니다.

    Returns:
        errors: 오류 목록 (비어있으면 성공)
    """
    diagnostics = validate_refs_against_node_ids_diagnostics(groups)
    return [str(item.get("message", "")) for item in diagnostics]


def validate_refs_against_node_ids_diagnostics(
    groups: Dict[str, List[OperationSpec]],
) -> List[ValidationIssue]:
    """meta.inputs/ref:nX의 교차 참조를 구조화된 에러로 반환합니다."""
    issues: List[ValidationIssue] = []
    node_ids: Set[str] = set()
    for ops in groups.values():
        for op in ops:
            if op.meta and isinstance(op.meta.nodeId, str):
                node_ids.add(op.meta.nodeId)

    for group_name, ops in groups.items():
        for i, op in enumerate(ops):
            dumped = op.model_dump(by_alias=True, exclude_none=True)
            meta = dumped.get("meta") if isinstance(dumped, dict) else None
            op_name = op.op
            node_id = op.meta.nodeId if op.meta else None
            if isinstance(meta, dict):
                for idx, inp in enumerate(meta.get("inputs") or []):
                    if isinstance(inp, str) and inp and inp not in node_ids:
                        msg = f'group "{group_name}" ops[{i}] meta.inputs references unknown nodeId "{inp}"'
                        issues.append(
                            _issue(
                                code="unknown_input_node",
                                message=msg,
                                stage="refs",
                                group=group_name,
                                op_index=i,
                                path=f"meta.inputs[{idx}]",
                                op=op_name,
                                node_id=node_id if isinstance(node_id, str) else None,
                            )
                        )
            for ref, path in _scan_ref_strings_with_paths(dumped):
                m = _REF_STR_RE.match(ref)
                if m and m.group(1) not in node_ids:
                    msg = f'group "{group_name}" ops[{i}] references unknown scalar "{ref}"'
                    issues.append(
                        _issue(
                            code="unknown_scalar_ref",
                            message=msg,
                            stage="refs",
                            group=group_name,
                            op_index=i,
                            path=path,
                            op=op_name,
                            node_id=node_id if isinstance(node_id, str) else None,
                        )
                    )

    return issues


def validate_ops_spec_with_diagnostics(
    raw_groups: Dict[str, Any],
    chart_context: ChartContext,
) -> Dict[str, Any]:
    """OpsSpec 전체를 검증하고 op 단위 구조화 진단을 반환합니다."""
    groups, warnings, _errors, parse_issues = _validate_and_parse_ops_spec_groups_impl(
        raw_groups,
        chart_context,
        collect_issues=True,
    )
    ref_issues = validate_refs_against_node_ids_diagnostics(groups)
    issues = parse_issues + ref_issues
    return {
        "valid": len(issues) == 0,
        "warnings": warnings,
        "errors": issues,
        "groups": groups,
    }