"""test_grammar.py 정답 spec의 구조적 유효성 검증."""
from __future__ import annotations

import re
from typing import Any, Dict, List

from opsspec.specs.base import BaseOpFields

# ────────────────────────────────────────────────────────────────────────────
# Configuration (코드로 on/off)
# ────────────────────────────────────────────────────────────────────────────

# True: 검증 활성화, False: 스킵
VALIDATE_ENABLED = True

# ────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ────────────────────────────────────────────────────────────────────────────

_VALID_GROUP_NAMES = re.compile(r"^ops(\d+)?$")
_REF_PATTERN = re.compile(r"^ref:(n\d+)$")

# op별 필수 필드 정의
_OP_REQUIRED_FIELDS: Dict[str, List[str]] = {
    "nth": ["n"],
    "pairDiff": ["by", "groupA", "groupB"],
    "add": ["targetA", "targetB"],
    "scale": ["target", "factor"],
    "setOp": ["fn"],
    "compareBool": ["operator"],
}


def _collect_ref_ids(value: Any) -> List[str]:
    """value 내 모든 ref:nX 패턴의 nodeId를 수집한다."""
    results: List[str] = []
    if isinstance(value, str):
        m = _REF_PATTERN.match(value)
        if m:
            results.append(m.group(1))
    elif isinstance(value, list):
        for item in value:
            results.extend(_collect_ref_ids(item))
    elif isinstance(value, dict):
        for v in value.values():
            results.extend(_collect_ref_ids(v))
    return results


def _op_to_dict(op: BaseOpFields) -> Dict[str, Any]:
    return op.model_dump(by_alias=True, exclude_none=True)


def _expected_group_key(index: int) -> str:
    """sentenceIndex 1 → 'ops', 2 → 'ops2', ..."""
    return "ops" if index == 1 else f"ops{index}"


# ────────────────────────────────────────────────────────────────────────────
# Main validation function
# ────────────────────────────────────────────────────────────────────────────

def validate_spec_dict(spec_dict: dict) -> List[str]:
    """정답 spec dict의 구조적 유효성을 검사한다.

    Returns:
        오류 메시지 리스트. 빈 리스트 = valid.
    """
    if not VALIDATE_ENABLED:
        return []

    errors: List[str] = []

    # 1. 그룹 키 검증 ─ ops, ops2, ops3, ... 순서대로 gap 없이
    keys = list(spec_dict.keys())
    invalid_keys = [k for k in keys if not _VALID_GROUP_NAMES.match(k)]
    if invalid_keys:
        errors.append(f"올바르지 않은 그룹 키: {invalid_keys}")

    # 숫자 정렬: ops=1, ops2=2, ...
    def _key_order(k: str) -> int:
        return 1 if k == "ops" else int(k[3:])

    valid_keys = [k for k in keys if _VALID_GROUP_NAMES.match(k)]
    sorted_indices = sorted(_key_order(k) for k in valid_keys)
    expected_indices = list(range(1, len(sorted_indices) + 1))
    if sorted_indices != expected_indices:
        errors.append(
            f"그룹 키 순서/갭 오류: 있는 인덱스={sorted_indices}, 기대={expected_indices}"
        )

    # 2. op 순서대로 순회 (groups 순서 유지)
    seen_node_ids: List[str] = []  # 앞서 정의된 nodeId 목록 (순서 중요)
    seen_node_id_set: set = set()

    for group_key in sorted(valid_keys, key=_key_order):
        ops = spec_dict.get(group_key, [])
        if not isinstance(ops, list):
            errors.append(f"{group_key}: list가 아님 (type={type(ops).__name__})")
            continue

        for i, op in enumerate(ops):
            prefix = f"{group_key}[{i}]"

            # 2a. BaseOpFields 인스턴스 확인
            if not isinstance(op, BaseOpFields):
                errors.append(f"{prefix}: BaseOpFields 인스턴스가 아님 (type={type(op).__name__})")
                continue

            op_type = op.op
            node_id = op.meta.nodeId if op.meta else None
            op_id = op.id

            # 2b. id == meta.nodeId 일치
            if op_id and node_id and op_id != node_id:
                errors.append(f"{prefix}({op_type}): id='{op_id}'와 meta.nodeId='{node_id}' 불일치")

            # 2c. nodeId 존재 여부
            if not node_id:
                errors.append(f"{prefix}({op_type}): meta.nodeId 없음")
            else:
                # 2d. nodeId 중복
                if node_id in seen_node_id_set:
                    errors.append(f"{prefix}({op_type}): nodeId '{node_id}' 중복")
                else:
                    seen_node_id_set.add(node_id)
                    seen_node_ids.append(node_id)

            # 2e. meta.inputs가 앞서 정의된 nodeId만 참조하는지
            inputs: List[str] = op.meta.inputs if op.meta else []
            for inp in inputs:
                if inp not in seen_node_id_set or inp == node_id:
                    errors.append(
                        f"{prefix}({op_type}): meta.inputs의 '{inp}'가 앞서 정의된 nodeId가 아님"
                    )

            # 2f. 필드 내 ref:nX 참조가 유효한지
            op_dict = _op_to_dict(op)
            for fname, fval in op_dict.items():
                if fname in ("op", "id", "meta", "chartId"):
                    continue
                ref_ids = _collect_ref_ids(fval)
                for ref_id in ref_ids:
                    if ref_id not in seen_node_id_set:
                        errors.append(
                            f"{prefix}({op_type}).{fname}: 'ref:{ref_id}'가 정의되지 않은 nodeId를 참조"
                        )

            # 2g. op별 필수 필드
            required = _OP_REQUIRED_FIELDS.get(op_type, [])
            for req_field in required:
                val = getattr(op, req_field, None)
                if val is None:
                    errors.append(f"{prefix}({op_type}): 필수 필드 '{req_field}' 없음")

    return errors
