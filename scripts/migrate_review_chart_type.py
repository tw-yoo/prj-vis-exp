#!/usr/bin/env python3
"""One-shot migration: insert a chart_type column into data/review/review_cases.csv.

Chart type is derived from the location of the spec under ChartQA/data/vlSpec:
  bar/simple/<id>.json     -> simpleBar
  bar/stacked/<id>.json    -> stackedBar
  bar/grouped/<id>.json    -> groupedBar
  line/simple/<id>.json    -> simpleLine
  line/multiple/<id>.json  -> multipleLine

If a row's chart_id has no matching spec, chart_type is left empty.
The new column is inserted right after chart_id.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "review" / "review_cases.csv"
VLSPEC_ROOT = ROOT / "ChartQA" / "data" / "vlSpec"

NEW_COLUMNS = (
    "chart_id",
    "chart_type",
    "status",
    "question",
    "explanation",
    "operation_spec",
    "feedback",
    "updated_at",
)

TYPE_BY_DIR = {
    ("bar", "simple"): "simpleBar",
    ("bar", "stacked"): "stackedBar",
    ("bar", "grouped"): "groupedBar",
    ("line", "simple"): "simpleLine",
    ("line", "multiple"): "multipleLine",
}


def build_chart_type_map() -> dict[str, str]:
    out: dict[str, str] = {}
    for (top, sub), chart_type in TYPE_BY_DIR.items():
        d = VLSPEC_ROOT / top / sub
        if not d.exists():
            continue
        for p in d.glob("*.json"):
            out[p.stem] = chart_type
    return out


def main() -> int:
    if not CSV_PATH.exists():
        print(f"CSV not found: {CSV_PATH}", file=sys.stderr)
        return 1

    chart_type_map = build_chart_type_map()
    print(f"Found {len(chart_type_map)} chart_id -> chart_type mappings.")

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        existing_fields = reader.fieldnames or []
        rows = list(reader)

    if "chart_type" in existing_fields:
        print("chart_type column already present; nothing to do.")
        return 0

    unresolved: list[str] = []
    for row in rows:
        cid = (row.get("chart_id") or "").strip()
        ctype = chart_type_map.get(cid, "")
        if cid and not ctype:
            unresolved.append(cid)
        row["chart_type"] = ctype

    tmp = CSV_PATH.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=list(NEW_COLUMNS),
            lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") or "" for col in NEW_COLUMNS})
    tmp.replace(CSV_PATH)

    print(f"Wrote {len(rows)} rows to {CSV_PATH}")
    if unresolved:
        print(f"WARN: {len(unresolved)} chart_id(s) had no matching spec:")
        for cid in unresolved[:20]:
            print(f"  - {cid}")
        if len(unresolved) > 20:
            print(f"  … and {len(unresolved) - 20} more")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
