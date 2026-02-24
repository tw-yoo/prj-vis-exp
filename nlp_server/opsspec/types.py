from __future__ import annotations

from typing import TypeAlias, Union

from pydantic import JsonValue as PydanticJsonValue

JsonPrimitive: TypeAlias = Union[str, int, float, bool, None]
JsonValue: TypeAlias = PydanticJsonValue
PrimitiveValue: TypeAlias = Union[str, int, float]
