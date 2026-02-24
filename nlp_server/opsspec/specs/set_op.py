from __future__ import annotations

from typing import Literal, Optional

from .base import BaseOpFields


class SetOp(BaseOpFields):
    op: Literal["setOp"] = "setOp"
    fn: Literal["intersection", "union"]
    group: Optional[str] = None
