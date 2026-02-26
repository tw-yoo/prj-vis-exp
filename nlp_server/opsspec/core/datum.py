from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(slots=True)
class DatumValue:
    category: Optional[str]
    measure: Optional[str]
    target: str
    group: Optional[str]
    value: float
    id: Optional[str] = None
    name: Optional[str] = None
    lookup_id: Optional[str] = None
    prev_target: Optional[str] = None
    series: Optional[str] = None

