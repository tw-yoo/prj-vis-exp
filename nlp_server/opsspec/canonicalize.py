from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from .models import ChartContext
from .specs.base import OpsMeta
from .specs.set_op import SetOp
from .specs.union import OperationSpec, parse_operation_spec

_REF_RE = re.compile(r"^ref:(n[0-9]+)$")


def _strip_none_fields(op: OperationSpec) -> OperationSpec:
    dumped = op.model_dump(by_alias=True, exclude_none=True)
    return parse_operation_spec(dumped)


def _node_signature(branch_name: str, op: OperationSpec) -> str:
    dumped = op.model_dump(by_alias=True, exclude_none=True)
    dumped.pop("id", None)
    meta = dumped.get("meta")
    if isinstance(meta, dict):
        meta.pop("nodeId", None)
        meta.pop("inputs", None)
        if not meta:
            dumped.pop("meta", None)
    body = {"branch": branch_name, "op": dumped}
    return json.dumps(body, sort_keys=True, ensure_ascii=True)


def _extract_old_node_id(op: OperationSpec, *, fallback: str) -> str:
    meta = op.meta or OpsMeta()
    node_id = meta.nodeId
    if isinstance(node_id, str) and node_id:
        return node_id
    return fallback


def _rewrite_refs(value: Any, *, id_map: Dict[str, str]) -> Any:
    # Rewrite "ref:nX" strings and {"id":"nX"} objects using id_map.
    if value is None:
        return None
    if isinstance(value, str):
        m = _REF_RE.match(value)
        if m:
            old = m.group(1)
            new = id_map.get(old)
            return f"ref:{new}" if new else value
        return value
    if isinstance(value, dict):
        if set(value.keys()) == {"id"} and isinstance(value.get("id"), str):
            old = value["id"]
            new = id_map.get(old)
            return {"id": new} if new else value
        return {k: _rewrite_refs(v, id_map=id_map) for k, v in value.items()}
    if isinstance(value, list):
        return [_rewrite_refs(item, id_map=id_map) for item in value]
    return value


def _reassign_node_ids_and_rewrite_refs(
    groups: Dict[str, List[OperationSpec]],
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    """
    Deterministically reassign meta.nodeId/id across the entire graph and rewrite "ref:nX".

    Ordering:
    - Topological sort based on derived dependencies:
      - explicit scalar refs "ref:nX" appearing in op params
      - explicit meta.inputs edges for ALL ops
    - Tie-break using a stable semantic signature (op+params, minus nodeId/inputs/id).
    """
    warnings: List[str] = []

    # Collect nodes across all groups.
    nodes: Dict[str, Tuple[str, OperationSpec]] = {}
    order_fallback_counter = 0

    for branch_name, ops in groups.items():
        if not isinstance(ops, list):
            continue
        for op in ops:
            order_fallback_counter += 1
            fallback = f"_tmp{order_fallback_counter}"
            old_id = _extract_old_node_id(op, fallback=fallback)
            if old_id in nodes:
                # Should not happen; keep deterministic by suffixing.
                suffix = 1
                while f"{old_id}_{suffix}" in nodes:
                    suffix += 1
                old_id = f"{old_id}_{suffix}"
                warnings.append(f'duplicate meta.nodeId encountered; renamed internal key to "{old_id}"')
            nodes[old_id] = (branch_name, op)

    edges_out: Dict[str, List[str]] = {nid: [] for nid in nodes.keys()}
    indeg: Dict[str, int] = {nid: 0 for nid in nodes.keys()}

    def _scan_ref_deps(obj: Any) -> Set[str]:
        deps: Set[str] = set()
        if obj is None:
            return deps
        if isinstance(obj, str):
            m = _REF_RE.match(obj)
            if m:
                deps.add(m.group(1))
            return deps
        if isinstance(obj, list):
            for item in obj:
                deps |= _scan_ref_deps(item)
            return deps
        if isinstance(obj, dict):
            for _, item in obj.items():
                deps |= _scan_ref_deps(item)
            return deps
        return deps

    def _add_edge(src: str, dst: str) -> None:
        if src not in nodes or dst not in nodes:
            return
        edges_out.setdefault(src, []).append(dst)
        indeg[dst] = indeg.get(dst, 0) + 1

    # (1) scalar ref edges
    for dst_id, (_, op) in nodes.items():
        dumped = op.model_dump(by_alias=True, exclude_none=True)
        dumped.pop("meta", None)  # ignore meta contents for ref scanning
        for src in sorted(_scan_ref_deps(dumped)):
            if src not in nodes:
                warnings.append(f'unknown scalar reference "{src}" for node "{dst_id}" ignored during canonicalization')
                continue
            _add_edge(src, dst_id)

    # (2) explicit meta.inputs edges for ALL ops (tree/DAG structure)
    for dst_id, (_, op) in nodes.items():
        for src in list((op.meta.inputs or []) if op.meta else []):
            if src not in nodes:
                warnings.append(f'unknown meta.inputs reference "{src}" for node "{dst_id}" ignored during canonicalization')
                continue
            _add_edge(src, dst_id)

    # Initialize available set (in-degree 0), with stable tie-break.
    available: List[str] = []
    for node_id, deg in indeg.items():
        if deg == 0:
            available.append(node_id)

    def _group_index(branch_name: str) -> int:
        if branch_name == "ops":
            return 1
        if branch_name.startswith("ops") and branch_name[3:].isdigit():
            try:
                return int(branch_name[3:])
            except Exception:
                return 9999
        return 9999

    def _avail_key(node_id: str) -> Tuple[int, str, str]:
        branch_name, op = nodes[node_id]
        return (_group_index(branch_name), _node_signature(branch_name, op), node_id)

    available.sort(key=_avail_key)

    topo: List[str] = []
    while available:
        current = available.pop(0)
        topo.append(current)
        for child in sorted(edges_out.get(current, []), key=lambda nid: _avail_key(nid)):
            indeg[child] -= 1
            if indeg[child] == 0:
                available.append(child)
                available.sort(key=_avail_key)

    if len(topo) != len(nodes):
        # Cycle or unresolved references. Make result deterministic by appending remaining nodes by signature.
        remaining = [nid for nid in nodes.keys() if nid not in set(topo)]
        remaining.sort(key=_avail_key)
        warnings.append("cycle or unresolved graph detected; appended remaining nodes by signature order")
        topo.extend(remaining)

    id_map: Dict[str, str] = {}
    for idx, old_id in enumerate(topo, start=1):
        id_map[old_id] = f"n{idx}"

    # Rewrite ops with new ids and ref strings.
    out: Dict[str, List[OperationSpec]] = {name: [] for name in groups.keys()}
    for branch_name, ops in groups.items():
        rewritten_ops: List[OperationSpec] = []
        for op in ops:
            old_id = _extract_old_node_id(op, fallback="")
            new_id = id_map.get(old_id)
            dumped = op.model_dump(by_alias=True, exclude_none=True)

            dumped["id"] = new_id or dumped.get("id") or old_id or None
            meta = dumped.get("meta")
            if not isinstance(meta, dict):
                meta = {}
            meta["nodeId"] = new_id or meta.get("nodeId") or old_id

            # Sentence index: derive from the sentence-layer group if missing.
            if meta.get("sentenceIndex") is None and isinstance(branch_name, str):
                if branch_name == "ops":
                    meta["sentenceIndex"] = 1
                elif branch_name.startswith("ops") and branch_name[3:].isdigit():
                    try:
                        meta["sentenceIndex"] = int(branch_name[3:])
                    except Exception:
                        pass

            # Canonical meta.inputs for ALL ops: preserve explicit inputs + add ref deps.
            deps: Set[str] = set()
            for inp in (meta.get("inputs") or []):
                if isinstance(inp, str) and inp:
                    deps.add(id_map.get(inp, inp))

            without_meta = dict(dumped)
            without_meta.pop("meta", None)
            for src_old in _scan_ref_deps(without_meta):
                src_new = id_map.get(src_old)
                if src_new:
                    deps.add(src_new)
            deps.discard(str(meta.get("nodeId")))
            meta["inputs"] = sorted(deps)
            dumped["meta"] = meta

            dumped = _rewrite_refs(dumped, id_map=id_map)
            rewritten = parse_operation_spec(dumped)
            rewritten_ops.append(rewritten)
        out[branch_name] = rewritten_ops

    return out, warnings


def canonicalize_ops_spec_groups(
    groups: Dict[str, List[OperationSpec]],
    *,
    chart_context: ChartContext,
) -> Tuple[Dict[str, List[OperationSpec]], List[str]]:
    """
    Canonicalization to improve 1:1 mapping between "tree" and opsSpec:
    1) Reassign nodeIds deterministically based on the graph and semantic tie-break.
       Also rewrite all "ref:nX" strings consistently.
    2) Strip None fields for stable JSON.
    """
    warnings: List[str] = []

    _ = chart_context  # reserved for future semantic canonicalization
    rewritten_groups, rewrite_warnings = _reassign_node_ids_and_rewrite_refs(groups)
    warnings.extend(rewrite_warnings)

    # Final normalization: ensure meta exists, fill missing ids (should not happen after rewrite),
    # sort commutative setOp inputs, and strip None keys.
    out: Dict[str, List[OperationSpec]] = {}
    for group_name, ops in rewritten_groups.items():
        normalized_ops: List[OperationSpec] = []
        for op in ops:
            meta = op.meta or OpsMeta()
            node_id = meta.nodeId
            if not node_id:
                # Deterministic fallback (rare): based on current output size.
                node_id = f"n{sum(len(v) for v in out.values()) + len(normalized_ops) + 1}"
                meta = meta.model_copy(update={"nodeId": node_id})
                warnings.append(f'meta.nodeId missing; assigned "{node_id}"')
            if not op.id:
                op = op.model_copy(update={"id": node_id})
                warnings.append(f'op.id missing; assigned "{node_id}"')

            if isinstance(op, SetOp):
                if meta.inputs:
                    sorted_inputs = sorted(meta.inputs)
                    if sorted_inputs != meta.inputs:
                        meta = meta.model_copy(update={"inputs": sorted_inputs})
                        warnings.append(f'setOp meta.inputs sorted for node "{node_id}"')

            op = op.model_copy(update={"meta": meta})
            op = _strip_none_fields(op)
            normalized_ops.append(op)

        # Stable ordering inside group by numeric nodeId.
        def _node_num(item: OperationSpec) -> int:
            meta = item.meta or OpsMeta()
            raw = meta.nodeId or item.id or "n0"
            try:
                return int(str(raw).lstrip("n"))
            except Exception:
                return 0

        out[group_name] = sorted(normalized_ops, key=_node_num)

    out.setdefault("ops", [])
    return out, warnings
