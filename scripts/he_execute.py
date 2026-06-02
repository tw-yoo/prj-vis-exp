#!/usr/bin/env python3
"""Execute operation_spec against real chart data via the REAL nlp_server executor.

Authoritative verification: imports nlp_server's context_builder + grounding +
parser + OpsSpecExecutor (the same engine that generates/runs ops), so semantics
match exactly (18 ops + findExtremum.rank, filter-between row-slice, refs, etc.).

Per row: load vlSpec + csv, build context, ground+parse each op, execute the
whole grouped DAG, then read the final node's result. Output is structured JSON
(counts + numeric answers) which survives this env's text corruption. Full
per-row results (incl. final value) go to the report file.

Usage:
  python scripts/he_execute.py <csv> [--id-col chart_id] [--spec-col operation_spec]
                                     [--report PATH] [--show <id,...>]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "nlp_server"))
CHARTQA = ROOT / "ChartQA" / "data"
TYPE_DIRS = {
    "bar_simple": ("bar", "simple"), "bar_grouped": ("bar", "grouped"),
    "bar_stacked": ("bar", "stacked"), "line_simple": ("line", "simple"),
    "line_multiple": ("line", "multiple"),
}

from opsspec.runtime.context_builder import build_chart_context  # noqa: E402
from opsspec.runtime.executor import OpsSpecExecutor  # noqa: E402
from opsspec.runtime.grounding import ground_op_spec  # noqa: E402
from opsspec.specs.union import parse_operation_spec  # noqa: E402


def load_chart(chart_type: str, chart_id: str):
    top, sub = TYPE_DIRS[chart_type]
    spec = json.loads((CHARTQA / "vlSpec" / top / sub / f"{chart_id}.json").read_text())
    rows = list(csv.DictReader(open(CHARTQA / "csv" / top / sub / f"{chart_id}.csv", newline="")))
    return spec, rows


def node_num(nid: str) -> int:
    try:
        return int(str(nid).lstrip("n"))
    except Exception:
        return -1


def run_one(spec_obj: dict, vlspec: dict, rows: list) -> dict:
    ctx, _w, _p = build_chart_context(vlspec, rows)
    parsed: dict = {}
    ids: list[str] = []
    for gk, lst in spec_obj.items():
        if not gk.startswith("ops") or not isinstance(lst, list):
            continue
        parsed[gk] = []
        for op in lst:
            grounded, _gw = ground_op_spec(op, chart_context=ctx)
            parsed[gk].append(parse_operation_spec(grounded))
            nid = op.get("id") or (op.get("meta") or {}).get("nodeId")
            if nid:
                ids.append(nid)
    ex = OpsSpecExecutor(ctx)
    ex.execute(rows=rows, ops_spec=parsed)
    if not ids:
        return {"final": "no-ops"}
    last = max(ids, key=node_num)
    vals = ex.runtime.get(last, [])
    if not vals:
        return {"final": "empty", "node": last}
    if len(vals) == 1:
        v = vals[0]
        return {"final": "scalar", "node": last, "value": round(v.value, 4), "target": v.target}
    return {"final": "rows", "node": last, "n": len(vals),
            "sample": [{"t": d.target, "v": round(d.value, 4)} for d in vals[:5]]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--id-col", default="chart_id")
    ap.add_argument("--spec-col", default="operation_spec")
    ap.add_argument("--report", default=str(ROOT / "data" / "review" / ".exec_report.json"))
    ap.add_argument("--show", default="")
    args = ap.parse_args()

    show = {s.strip() for s in args.show.split(",") if s.strip()}
    rows = list(csv.DictReader(open(args.csv, newline="")))
    ran = failed = empty = 0
    causes: Counter = Counter()
    report = []
    shown = []
    for r in rows:
        cid = r.get(args.id_col, "")
        ct = r.get("chart_type", "")
        spec = (r.get(args.spec_col, "") or "").strip()
        if not spec:
            empty += 1
            continue
        try:
            obj = json.loads(spec)
            vlspec, data = load_chart(ct, cid)
            res = run_one(obj, vlspec, data)
            ran += 1
            report.append({"id": cid, "ok": True, **res})
            if cid in show:
                shown.append({"id": cid, **res})
        except Exception as e:  # noqa: BLE001
            failed += 1
            causes[f"{type(e).__name__}: {str(e)[:50]}"] += 1
            report.append({"id": cid, "ok": False, "err": str(e)[:160]})
            if cid in show:
                shown.append({"id": cid, "err": str(e)[:160]})

    out = {
        "file": args.csv, "ran_ok": ran, "failed": failed, "empty": empty,
        "top_failure_causes": dict(causes.most_common(15)), "report": args.report,
    }
    if shown:
        out["shown"] = shown
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1))
    Path(args.report + ".summary.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
