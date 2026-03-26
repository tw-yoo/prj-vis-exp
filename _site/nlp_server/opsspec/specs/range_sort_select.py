from __future__ import annotations

from typing import List, Literal, Optional, Union

from pydantic import Field

from .base import BaseOpFields


class FindExtremumOp(BaseOpFields):
    """최대/최소(또는 N번째 최대/최소) 1개 선택.
    필수: `field`, `which` 권장.
    조건부: `rank`를 넣으면 1 이상의 정수(n번째), 없으면 1등.
    """

    op: Literal["findExtremum"] = "findExtremum"
    field: Optional[str] = None  # 비교할 수치 필드명(보통 y축)
    group: Optional[str] = None  # group/series 이름
    which: Optional[Literal["max", "min"]] = None  # 최대/최소 선택
    rank: Optional[int] = None  # 1=최대/최소, 2=두 번째, ...


class DetermineRangeOp(BaseOpFields):
    """범위(min/max) 파악.
    필수: `field`.
    선택: `group`으로 series/group 제한.
    """

    op: Literal["determineRange"] = "determineRange"
    field: Optional[str] = None  # 범위를 계산할 수치 필드명
    group: Optional[str] = None  # group/series 이름


class SortOp(BaseOpFields):
    """정렬된 리스트 반환.
    필수: `field` 또는 `orderField` 중 하나 권장.
    조건부: `orderField`가 있으면 해당 필드 기준 정렬, 없으면 `field` 기준.
    """

    op: Literal["sort"] = "sort"
    field: Optional[str] = None  # 기본 정렬 기준 필드명
    group: Optional[str] = None  # group/series 이름
    order: Optional[Literal["asc", "desc"]] = None  # 오름/내림차순
    orderField: Optional[str] = None  # 대체 정렬 기준 필드명


class NthOp(BaseOpFields):
    """정렬 후 n번째 값 선택.
    필수: `n`.
    조건부: `from_`는 n의 기준 방향(left/right), `orderField` 있으면 그 필드 기준 정렬.
    """

    op: Literal["nth"] = "nth"
    field: Optional[str] = None  # 선택 대상 필드명(보통 y축)
    group: Optional[str] = None  # group/series 이름
    order: Optional[Literal["asc", "desc"]] = None  # 정렬 방향
    orderField: Optional[str] = None  # 정렬 기준 필드명(예: x축/시간 필드)
    n: Optional[Union[int, List[int]]] = None  # n번째 인덱스(1-based 의미로 사용)
    from_: Optional[Literal["left", "right"]] = Field(default=None, alias="from")  # 왼쪽/오른쪽 기준
