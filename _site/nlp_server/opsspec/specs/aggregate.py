from __future__ import annotations

from typing import List, Literal, Optional, Union

from ..core.types import JsonValue
from .base import BaseOpFields


class RetrieveValueOp(BaseOpFields):
    """단일 값 조회.
    필수: `field`, `target`.
    값 규칙: `field`는 조회 기준 필드명(보통 x축/차원 필드명), `target`은 해당 필드의 실제 데이터값.
    선택: `group`은 series/group 이름 제한.
    """

    op: Literal["retrieveValue"] = "retrieveValue"
    field: Optional[str] = None  # 필드명 (x축 필드명, 차원 필드명 등)
    target: Optional[JsonValue] = None  # 필드에서 찾을 실제 값 (예: "2017")
    group: Optional[str] = None  # group/series 이름 (예: "Commercial")


class AverageOp(BaseOpFields):
    """평균 계산(스칼라 반환).
    필수: `field`.
    값 규칙: `field`는 평균낼 y축 수치 필드명.
    선택: `group`은 특정 series/group만 대상으로 제한.
    """

    op: Literal["average"] = "average"
    field: Optional[str] = None  # 평균낼 수치 필드명 (보통 y축)
    group: Optional[str] = None  # group/series 이름


class SumOp(BaseOpFields):
    """합계 계산(스칼라 반환).
    필수: `field`.
    값 규칙: `field`는 합산할 y축 수치 필드명.
    조건부: `group`이 str이면 해당 group만, list면 규칙에 따라(예: stacked 예외) 전체/부분 합산.
    """

    op: Literal["sum"] = "sum"
    field: Optional[str] = None  # 합산할 수치 필드명 (보통 y축)
    group: Optional[Union[str, List[str]]] = None  # group/series 이름 1개 또는 여러 개


class CountOp(BaseOpFields):
    """개수 계산(스칼라 반환).
    필수: 보통 없음(`field` 생략 가능).
    값 규칙: `field`를 넣으면 해당 필드를 기준으로 count 의미를 명확화.
    선택: `group`은 특정 series/group 제한.
    """

    op: Literal["count"] = "count"
    field: Optional[str] = None  # count 해석 기준 필드명(선택)
    group: Optional[str] = None  # group/series 이름
