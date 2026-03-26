from __future__ import annotations

from typing import Literal, Optional

from ..core.types import JsonValue
from .base import BaseOpFields


class AddOp(BaseOpFields):
    """스칼라 덧셈.
    필수: `targetA`, `targetB`.
    값 규칙: 각 target은 숫자 literal 또는 "ref:nX" 스칼라 참조.
    선택: `field`는 의미 라벨용.
    """

    op: Literal["add"] = "add"
    targetA: JsonValue  # 피연산자 A (숫자 또는 "ref:nX")
    targetB: JsonValue  # 피연산자 B (숫자 또는 "ref:nX")
    field: Optional[str] = None  # 결과 의미를 나타낼 수치 필드명(선택)
    group: Optional[str] = None  # group/series 이름(선택)
