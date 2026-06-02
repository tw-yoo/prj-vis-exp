#!/usr/bin/env python3
"""Write per-chart grounding+Q/E in SMALL chunked files (Read is flaky on big files).

Writes data/review/show_1.json, show_2.json, ... each with <chunk> charts, plus
data/review/show_manifest.json. Skips charts already authored in he_specs.GOLD.

Usage: python scripts/he_chunks.py --type line_simple --n 24 --chunk 6
       python scripts/he_chunks.py --ids a,b,c --chunk 6
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
REV = ROOT / "data" / "review"
bundle = json.loads((REV / ".grounding_bundle.json").read_text())
he_rows = list(csv.DictReader(open(ROOT / "data/review/human_explanation.csv", newline="")))
he = {r["chart_id"]: r for r in he_rows}
done = set()
_filled = ROOT / "data/review/human_explanation_filled.csv"
if _filled.exists():
    for _r in csv.DictReader(open(_filled, newline="")):
        if (_r.get("status") or "todo") != "todo":
            done.add(_r["chart_id"])


def load_cand(path):
    try:
        return {r["chart_id"]: r.get("operation_spec", "") for r in csv.DictReader(open(path, newline=""))}
    except Exception:
        return {}


CAND = load_cand(ROOT / "data/review/review_cases_chatgpt_filled.csv")


def compact_cand(s):
    if not s or not s.strip():
        return None
    try:
        return json.dumps(json.loads(s), ensure_ascii=False, separators=(",", ":"))
    except Exception:
        return "PARSE_FAIL"

ap = argparse.ArgumentParser()
ap.add_argument("--ids", default="")
ap.add_argument("--type", default="")
ap.add_argument("--n", type=int, default=24)
ap.add_argument("--chunk", type=int, default=6)
ap.add_argument("--xcap", type=int, default=30)
ap.add_argument("--tag", default="", help="prefix for output files (avoids collisions across parallel runs)")
args = ap.parse_args()
TAG = (args.tag + "_") if args.tag else ""

if args.ids:
    ids = [s.strip() for s in args.ids.split(",") if s.strip()]
else:
    ids = []
    for r in he_rows:
        cid = r["chart_id"]
        if cid in done:
            continue
        if args.type and r["chart_type"] != args.type:
            continue
        ids.append(cid)
        if len(ids) >= args.n:
            break


def rec(cid):
    g = bundle.get(cid, {})
    row = he.get(cid, {})
    cats = g.get("categorical_values", {})
    xf, sf = g.get("x_field"), g.get("series_field")
    ns = g.get("numeric_stats", {}).get(g.get("measure_field"), {})
    return {
        "row": row.get("#", ""), "type": g.get("chart_type"),
        "x": xf, "y": g.get("measure_field"), "series": sf,
        "x_vals": cats.get(xf, [])[:args.xcap],
        "series_vals": cats.get(sf, []) if sf else [],
        "other_dims": {k: v[:args.xcap] for k, v in cats.items() if k not in (xf, sf)},
        "y_min": ns.get("min"), "y_max": ns.get("max"), "y_mean": ns.get("mean"),
        "n_rows": g.get("n_rows"),
        "q": row.get("question", ""), "e": row.get("explanation", ""),
        "cand": compact_cand(CAND.get(cid)),
    }


files = []
k = 0
for i in range(0, len(ids), args.chunk):
    k += 1
    part = ids[i:i + args.chunk]
    obj = {cid: rec(cid) for cid in part}
    name = f"show_{TAG}{k}.json"
    (REV / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1))
    files.append({"file": name, "ids": part})
(REV / f"show_manifest_{args.tag or 'default'}.json").write_text(
    json.dumps({"files": files, "total": len(ids)}, ensure_ascii=False, indent=1))
print(json.dumps({"chunks": k, "total": len(ids)}))
