from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


def _prune_nulls(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key, item in value.items():
            if item is None:
                continue
            next_value = _prune_nulls(item)
            if next_value is None:
                continue
            out[key] = next_value
        return out
    if isinstance(value, list):
        out_list: List[Any] = []
        for item in value:
            if item is None:
                continue
            next_value = _prune_nulls(item)
            if next_value is None:
                continue
            out_list.append(next_value)
        return out_list
    return value


def export_draw_plan_to_public(draw_ops_spec: Dict[str, List[Dict[str, object]]], *, request_id: str) -> Path:
    repo_root = Path(__file__).resolve().parents[2]
    out_dir = repo_root / "public" / "generated" / "draw_plans"
    out_dir.mkdir(parents=True, exist_ok=True)

    payload = _prune_nulls(draw_ops_spec)
    request_path = out_dir / f"{request_id}.json"
    latest_path = out_dir / "latest.json"

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    request_path.write_text(text + "\n", encoding="utf-8")
    latest_path.write_text(text + "\n", encoding="utf-8")
    return latest_path

