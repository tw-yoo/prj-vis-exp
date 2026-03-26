"""test_grammar.py 정답 spec 구조 검증 테스트."""
from __future__ import annotations

import pytest

from opsspec.tests import test_grammar
from opsspec.tests.validators import validate_spec_dict
from opsspec.tests.comparators import serialize_spec_dict

# ────────────────────────────────────────────────────────────────────────────
# 모든 spec_ 변수 수집
# ────────────────────────────────────────────────────────────────────────────

ALL_SPECS: dict[str, dict] = {
    name: val
    for name, val in vars(test_grammar).items()
    if name.startswith("spec_") and isinstance(val, dict)
}

# ────────────────────────────────────────────────────────────────────────────
# (1) 구조 검증 테스트
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("spec_name,spec_dict", list(ALL_SPECS.items()))
def test_validate_spec(spec_name: str, spec_dict: dict) -> None:
    """각 ground truth spec이 구조적으로 올바른지 검증한다.

    검증 항목:
    - 그룹 키 순서/갭 없는지 (ops, ops2, ops3, ...)
    - id == meta.nodeId 일치
    - nodeId 중복 없음
    - meta.inputs가 앞선 nodeId만 참조
    - ref:nX 참조가 유효한 nodeId를 가리키는지
    - op별 필수 필드 존재 (NthOp.n, PairDiffOp.by/groupA/groupB 등)
    """
    errors = validate_spec_dict(spec_dict)
    assert not errors, f"[{spec_name}] 구조 검증 오류:\n" + "\n".join(errors)


# ────────────────────────────────────────────────────────────────────────────
# (2) 직렬화 가능성 테스트
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("spec_name,spec_dict", list(ALL_SPECS.items()))
def test_serialize_spec(spec_name: str, spec_dict: dict) -> None:
    """각 ground truth spec이 JSON 직렬화 가능한지 확인한다."""
    serialized = serialize_spec_dict(spec_dict)

    assert serialized, f"[{spec_name}] 직렬화 결과가 비어 있음"
    assert all(
        isinstance(v, list) for v in serialized.values()
    ), f"[{spec_name}] 모든 그룹 값이 list여야 함"
    assert all(
        isinstance(op, dict)
        for ops in serialized.values()
        for op in ops
    ), f"[{spec_name}] 모든 op가 dict여야 함"

    # 각 op에 'op' 필드(type discriminator)가 있는지
    for group_key, ops in serialized.items():
        for i, op in enumerate(ops):
            assert "op" in op, f"[{spec_name}] {group_key}[{i}]: 'op' 필드 없음"
