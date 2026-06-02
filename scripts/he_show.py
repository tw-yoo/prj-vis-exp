#!/usr/bin/env python3
"""Dump compact grounding + Q/E (+ candidate specs) for authoring → .show.json.

Readback helper (this env's stdout is unreliable; structured JSON files Read OK).

Modes:
  python scripts/he_show.py <id1,id2,...>          # specific charts
  python scripts/he_show.py --type line_simple --n 20   # next N not-yet-authored of a type
  python scripts/he_show.py --todo --n 20          # next N not-yet-authored, any type
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
bundle = json.loads((ROOT / "data/review/.grounding_bundle.json").read_text())
he_rows = list(csv.DictReader(open(ROOT / "data/review/human_explanation.csv", newline="")))
he = {r["chart_id"]: r for r in he_rows}

try:
    from he_specs import GOLD  # done set
    done = set(GOLD)
except Exception:
    done = set()

# candidate specs (reference only)
def load_cand(path):
    try:
        return {r["chart_id"]: r.get("operation_spec", "") for r in csv.DictReader(open(path, newline=""))}
    except Exception:
        return {}

cand_gpt = load_cand(ROOT / "data/review/review_cases_chatgpt_filled.csv")

ap = argparse.ArgumentParser()
ap.add_argument("ids", nargs="?", default="")
ap.add_argument("--type", default="")
ap.add_argument("--todo", action="store_true")
ap.add_argument("--n", type=int, default=20)
ap.add_argument("--xcap", type=int, default=40)
ap.add_argument("--cand", action="store_true", help="include chatgpt candidate spec")
args = ap.parse_args()

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


def compact_cand(s):
    if not s or not s.strip():
        return None
    try:
        o = json.loads(s)
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        return "PARSE_FAIL"


out = {}
for cid in ids:
    g = bundle.get(cid, {})
    row = he.get(cid, {})
    cats = g.get("categorical_values", {})
    xf, sf = g.get("x_field"), g.get("series_field")
    ns = g.get("numeric_stats", {}).get(g.get("measure_field"), {})
    out[cid] = {
        "row": row.get("#", ""), "type": g.get("chart_type"),
        "x": xf, "y": g.get("measure_field"), "series": sf,
        "x_vals": cats.get(xf, [])[:args.xcap],
        "series_vals": cats.get(sf, []) if sf else [],
        "other_dims": {k: v[:args.xcap] for k, v in cats.items() if k not in (xf, sf)},
        "y_min": ns.get("min"), "y_max": ns.get("max"), "y_mean": ns.get("mean"),
        "n_rows": g.get("n_rows"),
        "q": row.get("question", ""), "e": row.get("explanation", ""),
    }
    if args.cand:
        out[cid]["cand"] = compact_cand(cand_gpt.get(cid))
(ROOT / "data/review/.show.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(json.dumps({"shown": len(out), "ids": ids}))
