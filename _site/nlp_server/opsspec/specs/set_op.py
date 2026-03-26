from __future__ import annotations

from typing import Literal, Optional

from .base import BaseOpFields


class SetOp(BaseOpFields):
    """집합 연산(union/intersection).
    필수: `fn`.
    조건부: 실행 시 입력 노드 2개 이상 필요(meta.inputs로 연결).
    """

    op: Literal["setOp"] = "setOp"
    fn: Literal["intersection", "union"]  # 집합 함수명
    group: Optional[str] = None  # group/series 이름(선택)
