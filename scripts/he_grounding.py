#!/usr/bin/env python3
"""Build the grounding bundle using the SAME context builder the executor uses.

By delegating to nlp_server's build_chart_context, my authoring view of each
chart (primary_dimension / primary_measure / series_field / categorical_values /
numeric_stats) is identical to what the executor sees — so targets/groups I
author always line up with execution (no x/series role drift, horizontal bars
handled, etc.).

Output: data/review/.grounding_bundle.json  (dict keyed by chart_id). Pure
readback via files (this env's stdout is unreliable).

Usage: python scripts/he_grounding.py
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "nlp_server"))
HE_CSV = ROOT / "data" / "review" / "human_explanation.csv"
CHARTQA = ROOT / "ChartQA" / "data"
OUT = ROOT / "data" / "review" / ".grounding_bundle.json"
TYPE_DIRS = {
    "bar_simple": ("bar", "simple"), "bar_grouped": ("bar", "grouped"),
    "bar_stacked": ("bar", "stacked"), "line_simple": ("line", "simple"),
    "line_multiple": ("line", "multiple"),
}

from opsspec.runtime.context_builder import build_chart_context  # noqa: E402

MAX_CATS = 100


def stat_to_dict(st):
    if hasattr(st, "min"):
        return {"min": st.min, "max": st.max, "mean": round(getattr(st, "mean", 0.0) or 0.0, 6)}
    if isinstance(st, dict):
        return {"min": st.get("min"), "max": st.get("max"),
                "mean": round(st.get("mean", 0.0) or 0.0, 6)}
    return {}


def build_one(chart_type: str, chart_id: str) -> dict:
    top, sub = TYPE_DIRS[chart_type]
    vl = CHARTQA / "vlSpec" / top / sub / f"{chart_id}.json"
    cs = CHARTQA / "csv" / top / sub / f"{chart_id}.csv"
    if not vl.exists() or not cs.exists():
        return {"chart_type": chart_type, "errors": [f"missing vlSpec/csv for {chart_id}"]}
    spec = json.loads(vl.read_text())
    rows = list(csv.DictReader(cs.open(newline="")))
    ctx, warnings, _prev = build_chart_context(spec, rows)
    cats = {}
    for k, vals in (ctx.categorical_values or {}).items():
        cats[k] = [str(v) for v in vals][:MAX_CATS]
    nstats = {k: stat_to_dict(st) for k, st in (ctx.numeric_stats or {}).items()}
    return {
        "chart_type": chart_type,
        "errors": [],
        "x_field": ctx.primary_dimension,
        "y_field": ctx.primary_measure,
        "measure_field": ctx.primary_measure,
        "series_field": ctx.series_field,
        "mark": ctx.mark,
        "is_stacked": bool(getattr(ctx, "is_stacked", False)),
        "columns": list(ctx.fields or []),
        "dimension_fields": list(ctx.dimension_fields or []),
        "measure_fields": list(ctx.measure_fields or []),
        "n_rows": len(rows),
        "categorical_values": cats,
        "numeric_stats": nstats,
        "context_warnings": list(warnings or [])[:5],
    }


def main() -> int:
    rows = list(csv.DictReader(HE_CSV.open(newline="")))
    bundle: dict = {}
    errors: list[str] = []
    for r in rows:
        cid, ct = r["chart_id"], r["chart_type"]
        try:
            rec = build_one(ct, cid)
        except Exception as e:  # noqa: BLE001
            rec = {"chart_type": ct, "errors": [f"{type(e).__name__}: {e}"]}
        if rec.get("errors"):
            errors.extend(f"{cid}: {e}" for e in rec["errors"])
        bundle[cid] = rec
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=1))
    no_x = [c for c, r in bundle.items() if not r.get("errors") and not r.get("x_field")]
    no_y = [c for c, r in bundle.items() if not r.get("errors") and not r.get("y_field")]
    print(json.dumps({"charts": len(bundle), "errors": len(errors),
                      "no_x_field": len(no_x), "no_y_field": len(no_y),
                      "err_sample": errors[:10],
                      "no_x_sample": no_x[:10], "no_y_sample": no_y[:10]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
