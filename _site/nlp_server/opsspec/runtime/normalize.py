from __future__ import annotations

from typing import Dict, List, Set, Tuple

from ..runtime.artifacts import extract_scalar_ref_deps
from ..specs.base import OpsMeta
from ..specs.set_op import SetOp
from ..specs.union import OperationSpec


def normalize_meta_inputs(
    groups: Dict[str, List[OperationSpec]],
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    """
    Minimal, deterministic normalization without rewriting nodeIds:
    - meta.inputs includes explicit inputs + scalar ref deps found in op params
    - remove self refs, dedupe + sort
    - for setOp, sort meta.inputs (commutative)
    """
    warnings: List[str] = []
    out: Dict[str, List[OperationSpec]] = {}

    for group_name, ops in (groups or {}).items():
        normalized_ops: List[OperationSpec] = []
        for op in (ops or []):
            dumped = op.model_dump(by_alias=True, exclude_none=True)
            meta_dict = dumped.get("meta") if isinstance(dumped.get("meta"), dict) else {}
            node_id = meta_dict.get("nodeId") or dumped.get("id")
            if not isinstance(node_id, str) or not node_id:
                normalized_ops.append(op)
                continue

            scalar_deps = set(extract_scalar_ref_deps({k: v for k, v in dumped.items() if k != "meta"}))
            explicit_inputs = set([inp for inp in (meta_dict.get("inputs") or []) if isinstance(inp, str) and inp])
            deps: Set[str] = set(explicit_inputs) | scalar_deps
            deps.discard(node_id)
            new_inputs = sorted(deps)

            meta = op.meta or OpsMeta()
            if sorted(meta.inputs or []) != new_inputs:
                meta = meta.model_copy(update={"inputs": new_inputs})
                warnings.append(f'meta.inputs normalized for node "{node_id}"')

            if isinstance(op, SetOp) and meta.inputs:
                sorted_inputs = sorted(meta.inputs)
                if sorted_inputs != meta.inputs:
                    meta = meta.model_copy(update={"inputs": sorted_inputs})
                    warnings.append(f'setOp meta.inputs sorted for node "{node_id}"')

            updated = op.model_copy(update={"meta": meta})
            normalized_ops.append(updated)

        # Stable ordering by numeric nodeId if possible.
        def _node_num(item: OperationSpec) -> int:
            meta = item.meta or OpsMeta()
            raw = meta.nodeId or item.id or "n0"
            try:
                return int(str(raw).lstrip("n"))
            except Exception:
                return 0

        out[group_name] = sorted(normalized_ops, key=_node_num)

    return out, warnings
