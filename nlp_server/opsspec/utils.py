from __future__ import annotations

from typing import Any, Dict, List, Optional


def to_float(value: Any) -> Optional[float]:
    """임의의 값을 float으로 변환합니다. 변환 불가 시 None 반환.

    - None / bool 은 숫자로 취급하지 않음.
    - 문자열이면 strip 후 float 변환 시도.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None
    return None


def prune_nulls(value: Any) -> Any:
    """None 값을 재귀적으로 제거합니다.

    - dict: None 값을 가진 키 제거
    - list: None 아이템 제거
    - 그 외: 원본 반환
    """
    if value is None:
        return None
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for k, v in value.items():
            if v is None:
                continue
            pruned = prune_nulls(v)
            if pruned is None:
                continue
            out[k] = pruned
        return out
    if isinstance(value, list):
        out_list: List[Any] = []
        for item in value:
            if item is None:
                continue
            pruned = prune_nulls(item)
            if pruned is None:
                continue
            out_list.append(pruned)
        return out_list
    return value
