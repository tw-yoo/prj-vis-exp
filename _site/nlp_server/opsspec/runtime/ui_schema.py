from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union, get_args, get_origin

from pydantic.fields import FieldInfo

from .op_registry import OpContract, list_contracts
from ..specs.base import BaseOpFields


@dataclass(frozen=True)
class UiField:
    key: str
    kind: str
    required: bool
    options: Optional[List[str]] = None
    options_source: Optional[str] = None
    ref_allowed: bool = False
    description: Optional[str] = None


@dataclass(frozen=True)
class UiOp:
    op: str
    label: str
    fields: List[UiField]
    semantic_notes: List[str]


def _unwrap_optional(annotation: Any) -> Any:
    origin = get_origin(annotation)
    if origin is Union:
        args = [arg for arg in get_args(annotation) if arg is not type(None)]  # noqa: E721
        if len(args) == 1:
            return args[0]
    return annotation


def _is_list_of_primitives(annotation: Any) -> bool:
    origin = get_origin(annotation)
    if origin not in (list, List):
        return False
    args = get_args(annotation)
    if len(args) != 1:
        return False
    item = _unwrap_optional(args[0])
    item_origin = get_origin(item)
    if item_origin is Union:
        item_args = [a for a in get_args(item) if a is not type(None)]  # noqa: E721
        return all(a in (str, int, float, bool) for a in item_args)
    return item in (str, int, float, bool)


def _literal_options(annotation: Any) -> Optional[List[str]]:
    origin = get_origin(annotation)
    if origin is not None and str(origin).endswith("Literal"):
        values = [v for v in get_args(annotation)]
        return [str(v) for v in values]
    return None


def _infer_kind(annotation: Any) -> Tuple[str, Optional[List[str]]]:
    annotation = _unwrap_optional(annotation)

    options = _literal_options(annotation)
    if options is not None:
        return "enum", options

    origin = get_origin(annotation)
    if origin in (list, List):
        if _is_list_of_primitives(annotation):
            return "stringOrNumberArray", None
        return "stringArray", None

    if origin is Union:
        args = [a for a in get_args(annotation) if a is not type(None)]  # noqa: E721
        if set(args).issubset({str, int, float, bool}):
            if str in args and (int in args or float in args):
                return "stringOrNumber", None
            if str in args:
                return "string", None
            if bool in args:
                return "boolean", None
            return "number", None
        return "stringOrMap", None

    if annotation is bool:
        return "boolean", None
    if annotation in (int, float):
        return "number", None
    if annotation is str:
        return "string", None
    return "stringOrMap", None


def _field_is_required(field_info: FieldInfo, *, contract_required: bool) -> bool:
    # contract-required wins over type optionality.
    if contract_required:
        return True
    return field_info.is_required()


def _options_source_for_field(op_name: str, field_name: str) -> Optional[str]:
    # OptionsSource is resolved by the UI using chart_context.
    if field_name in {"target", "targetA", "targetB"}:
        return "targets"
    if field_name in {"group", "groupA", "groupB"}:
        return "series_domain"
    if field_name in {"field", "orderField"}:
        # Most ops treat `field` as a measure field; validators will enforce numeric where needed.
        if op_name in {"retrieveValue"}:
            return "fields"
        return "measure_fields"
    if field_name in {"by"}:
        return "dimension_fields"
    if field_name in {"seriesField"}:
        return "fields"
    return None


def _ref_allowed(op_name: str, field_name: str) -> bool:
    # Scalar refs are always "ref:nX" strings.
    if field_name in {"value", "target", "targetA", "targetB"}:
        return True
    return False


def _ui_fields_for_model(
    op_name: str,
    *,
    model_cls: type[BaseOpFields],
    required_fields: Tuple[str, ...],
) -> List[UiField]:
    out: List[UiField] = []
    for name, field_info in model_cls.model_fields.items():
        if name in {"op", "id", "meta", "chartId"}:
            continue
        alias = field_info.alias or name
        kind, enum_options = _infer_kind(field_info.annotation)
        out.append(
            UiField(
                key=alias,
                kind=kind,
                required=_field_is_required(field_info, contract_required=alias in required_fields),
                options=enum_options,
                options_source=_options_source_for_field(op_name, alias),
                ref_allowed=_ref_allowed(op_name, alias),
                description=str(field_info.description) if field_info.description else None,
            )
        )
    return out


def build_op_registry_ui_schema() -> Dict[str, object]:
    ops: List[Dict[str, object]] = []

    for contract in list_contracts():
        fields = _ui_fields_for_model(
            contract.op_name,
            model_cls=contract.model_cls,
            required_fields=contract.required_fields,
        )

        semantic_notes = list(contract.semantic_rules)
        # UI-friendly emphasis for ref rules.
        if any(f.ref_allowed for f in fields):
            semantic_notes.append('Scalar references must use the format "ref:nX" (string only).')

        ops.append(
            {
                "op": contract.op_name,
                "label": contract.op_name,
                "fields": [
                    {
                        "key": f.key,
                        "kind": f.kind,
                        "required": f.required,
                        **({"options": f.options} if f.options else {}),
                        **({"optionsSource": f.options_source} if f.options_source else {}),
                        **({"refAllowed": True} if f.ref_allowed else {}),
                        **({"description": f.description} if f.description else {}),
                    }
                    for f in fields
                ],
                "semanticNotes": semantic_notes,
            }
        )

    return {
        "version": 1,
        "ops": ops,
        "meta": {
            "nodeIdRequired": True,
            "inputsRequired": True,
            "sentenceIndexRequired": True,
            "refFormat": "ref:nX",
        },
    }
