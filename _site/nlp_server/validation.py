from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List

import pyperclip

from opsspec.runtime.context_builder import build_chart_context

# Update these two paths directly before running this script.
VEGA_LITE_SPEC_PATH = "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/vlSpec/line/multiple/3z678inbp0t89ahu.json"
CSV_PATH = "/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/ChartQA/data/csv/line/multiple/3z678inbp0t89ahu.csv"


def _load_vega_lite_spec(path: str) -> Dict[str, Any]:
    spec_path = Path(path).expanduser().resolve()
    if spec_path.suffix.lower() != ".json":
        raise ValueError("vega_lite_spec_path must point to a .json file.")
    payload = json.loads(spec_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("vega-lite spec JSON must be an object.")
    return payload


def _load_csv_rows(path: str) -> List[Dict[str, Any]]:
    csv_path = Path(path).expanduser().resolve()
    if csv_path.suffix.lower() != ".csv":
        raise ValueError("csv_path must point to a .csv file.")
    text = csv_path.read_text(encoding="utf-8")
    reader = csv.DictReader(text.splitlines())
    rows: List[Dict[str, Any]] = []
    for row in reader:
        if isinstance(row, dict):
            rows.append(dict(row))
    if not rows:
        raise ValueError("csv_path has no readable row data.")
    return rows


def copy_chart_context_json_to_clipboard(vega_lite_spec_path: str, csv_path: str) -> Dict[str, Any]:
    """Build chart_context from Vega-Lite JSON + CSV and copy JSON to clipboard."""
    vega_lite_spec = _load_vega_lite_spec(vega_lite_spec_path)
    data_rows = _load_csv_rows(csv_path)
    chart_context, warnings, _rows_preview = build_chart_context(vega_lite_spec, data_rows)

    context_payload = chart_context.model_dump()
    if warnings:
        context_payload["warnings"] = warnings

    context_json = json.dumps(context_payload, ensure_ascii=False, indent=2)
    pyperclip.copy(context_json)
    return context_payload


if __name__ == "__main__":
    # payload = copy_chart_context_json_to_clipboard(VEGA_LITE_SPEC_PATH, CSV_PATH)
    # print("chart_context copied to clipboard.")
    # print(json.dumps(payload, ensure_ascii=False, indent=2))

    from opsspec.tests.test_grammar import *
    from opsspec.specs.union import parse_operation_spec
    from opsspec.runtime.normalize import normalize_meta_inputs
    from opsspec.runtime.scheduler import schedule_ops_spec
    import pyperclip

    raw = spec_0pzdf7hfbxgjghsa

    typed = {
        g: [parse_operation_spec(op) for op in ops]
        for g, ops in raw.items()
    }

    normalized_groups, normalize_warnings = normalize_meta_inputs(typed)
    scheduled = schedule_ops_spec(normalized_groups)

    scheduled_json = {
        g: [op.model_dump(mode="json", exclude_none=True) for op in ops]
        for g, ops in scheduled.items()
    }

    if normalize_warnings:
        print("normalize warnings:")
        for warning in normalize_warnings:
            print(f"- {warning}")