from __future__ import annotations

from typing import List, Literal, Optional, Union

from ..core.types import JsonValue, PrimitiveValue
from .base import BaseOpFields


class FilterOp(BaseOpFields):
    """행 필터링.
    모드1 membership: `field` + (`include` 또는 `exclude`) 필수.
    모드2 comparison: `field` + `operator` + `value` 필수.
    모드3 group-only: `group`만 사용(시리즈 제한).
    금지 조합: membership/comparison 동시 사용.
    """

    op: Literal["filter"] = "filter"
    field: Optional[str] = None  # 필터 기준 필드명 (x축/범주 필드명 또는 수치 필드명)
    include: Optional[List[PrimitiveValue]] = None  # 포함할 실제 데이터값 목록 (membership)
    exclude: Optional[List[PrimitiveValue]] = None  # 제외할 실제 데이터값 목록 (membership)
    operator: Optional[str] = None  # 비교 연산자 (예: >, <, ==, between)
    value: Optional[JsonValue] = None  # 비교값/범위값 (literal 또는 "ref:nX")
    group: Optional[Union[str, List[str]]] = None  # group/series 이름 1개 또는 여러 개(OR)
