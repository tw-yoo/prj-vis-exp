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
