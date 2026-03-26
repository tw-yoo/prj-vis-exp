from __future__ import annotations

from typing import Literal, Optional

from ..core.types import JsonValue
from .base import BaseOpFields


class ScaleOp(BaseOpFields):
    """스칼라 배율 연산.
    필수: `target`, `factor`.
    값 규칙: `target`은 숫자 literal 또는 "ref:nX" 스칼라 참조, `factor`는 배율.
    """

    op: Literal["scale"] = "scale"
    target: JsonValue  # 기준 값 (숫자 또는 "ref:nX")
    factor: float  # 곱할 배율 (예: 2.0, 1/6)
    field: Optional[str] = None  # 결과 의미를 나타낼 수치 필드명(선택)
    group: Optional[str] = None  # group/series 이름(선택)
