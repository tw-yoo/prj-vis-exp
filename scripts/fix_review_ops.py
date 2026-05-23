#!/usr/bin/env python3
"""
Mechanically fix the most common audit failures in data/review/review_cases.csv.

Findings from scripts/audit_review_ops.py show the model frequently puts the
MEASURE column on `field` (e.g. "Percentage") instead of the DIMENSION column
(e.g. "Year") for target-style ops (retrieveValue / diff / compareBool /
filter-with-include). The target value (like "2011") then doesn't appear in
the measure column's values — but it does appear in some other column.

This script:
  1. For every op that has target / targetA / targetB / include / exclude
     referencing a value that isn't in the current `field` column, search
     across all data columns for one whose values contain the target.
  2. If exactly one column matches, rewrite the op's `field` to that column.
  3. If zero or multiple columns match, leave the op alone (flag for retry).

Atomic CSV rewrite. Re-audits at the end and prints a delta.

Usage:
  python scripts/fix_review_ops.py             # apply fixes, print report
  python scripts/fix_review_ops.py --dry-run   # show what would change
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "review" / "review_cases.csv"
CHARTQA = ROOT / "ChartQA"

REVIEW_COLUMNS = (
    "chart_id",
    "chart_type",
    "status",
    "question",
    "explanation",
    "operation_spec",
    "feedback",
    "updated_at",
)

REF_RE = re.compile(r"^ref:n\d+$")


# ── Data csv loader (shared with audit) ─────────────────────────────────────


def load_data_columns_and_values(chart_id: str) -> tuple[list[str], dict[str, set[str]]]:
    path = next(iter((CHARTQA / "data" / "csv").rglob(f"{chart_id}.csv")), None)
    if not path:
        return [], {}
    text = path.read_text(encoding="utf-8")
    reader = csv.reader(text.splitlines())
    rows = list(reader)
    if not rows:
        return [], {}
    headers = [h.strip() for h in rows[0]]
    values: dict[str, set[str]] = {h: set() for h in headers}
    for row in rows[1:]:
        for i, cell in enumerate(row):
            if i < len(headers):
                values[headers[i]].add(str(cell).strip())
    return headers, values


def values_match(target: str, present: set[str]) -> bool:
    """Tolerant match: exact, case-insensitive, or numeric-equal."""
    t = target.strip()
    if t in present:
        return True
    lower = {v.lower() for v in present}
    if t.lower() in lower:
        return True
    try:
        ft = float(t)
        for v in present:
            try:
                if float(v) == ft:
                    return True
            except ValueError:
                continue
    except ValueError:
        pass
    return False


def find_column_for_value(value: str, values: dict[str, set[str]]) -> list[str]:
    """Return columns whose distinct values contain `value` (tolerant)."""
    matches = []
    for col, vals in values.items():
        if values_match(value, vals):
            matches.append(col)
    return matches


def find_column_for_values(items: list, values: dict[str, set[str]]) -> list[str]:
    """Return columns that contain EVERY item in the list."""
    if not items:
        return []
    matches = []
    for col, vals in values.items():
        if all(
            isinstance(x, (str, int, float)) and values_match(str(x), vals)
            for x in items
        ):
            matches.append(col)
    return matches


# ── Per-op fixer ────────────────────────────────────────────────────────────


def fix_op_in_place(op: dict, columns: list[str], values: dict[str, set[str]]) -> list[str]:
    """Apply mechanical fixes. Return human-readable list of changes."""
    changes: list[str] = []

    # 1) target-style scalars
    for key in ("target", "targetA", "targetB"):
        val = op.get(key)
        if val is None:
            continue
        if isinstance(val, str) and REF_RE.match(val):
            continue
        current_field = op.get("field")
        if isinstance(current_field, str) and current_field in values:
            if values_match(str(val), values[current_field]):
                continue  # already correct
        sval = str(val)
        candidate_cols = find_column_for_value(sval, values)
        # Prefer a candidate that ISN'T the current (wrong) field
        candidate_cols = [c for c in candidate_cols if c != current_field]
        if len(candidate_cols) == 1:
            op["field"] = candidate_cols[0]
            changes.append(
                f"{op.get('op')}: {key}={sval!r} → set field='{candidate_cols[0]}' (was {current_field!r})"
            )
        # If exactly the dimension column is obvious from heuristic, fix it too
        elif len(candidate_cols) > 1:
            # Tie-break: pick the categorical column with the FEWEST distinct vals
            ranked = sorted(candidate_cols, key=lambda c: len(values[c]))
            op["field"] = ranked[0]
            changes.append(
                f"{op.get('op')}: {key}={sval!r} → set field='{ranked[0]}' "
                f"(was {current_field!r}, tie-broken among {candidate_cols})"
            )

    # 2) include / exclude lists
    for key in ("include", "exclude"):
        items = op.get(key)
        if not isinstance(items, list) or not items:
            continue
        current_field = op.get("field")
        if isinstance(current_field, str) and current_field in values:
            if all(
                isinstance(x, (str, int, float)) and values_match(str(x), values[current_field])
                for x in items
            ):
                continue
        candidate_cols = find_column_for_values(items, values)
        candidate_cols = [c for c in candidate_cols if c != current_field]
        if len(candidate_cols) == 1:
            op["field"] = candidate_cols[0]
            changes.append(
                f"{op.get('op')}: {key} → set field='{candidate_cols[0]}' (was {current_field!r})"
            )
        elif len(candidate_cols) > 1:
            ranked = sorted(candidate_cols, key=lambda c: len(values[c]))
            op["field"] = ranked[0]
            changes.append(
                f"{op.get('op')}: {key} → set field='{ranked[0]}' "
                f"(was {current_field!r}, tie-broken among {candidate_cols})"
            )

    return changes


def fix_spec(spec: dict, columns: list[str], values: dict[str, set[str]]) -> tuple[dict, list[str]]:
    spec = deepcopy(spec)
    all_changes: list[str] = []
    for key, group in spec.items():
        if not re.fullmatch(r"ops\d*", key) or not isinstance(group, list):
            continue
        for op in group:
            if not isinstance(op, dict):
                continue
            for change in fix_op_in_place(op, columns, values):
                all_changes.append(f"{key}: {change}")
    return spec, all_changes


# ── CSV I/O ─────────────────────────────────────────────────────────────────


def atomic_write_rows(rows: list[dict]) -> None:
    tmp = CSV_PATH.with_suffix(CSV_PATH.suffix + ".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=list(REVIEW_COLUMNS), lineterminator="\n", quoting=csv.QUOTE_MINIMAL
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") for col in REVIEW_COLUMNS})
    os.replace(tmp, CSV_PATH)


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# ── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = [
            {col: r.get(col, "") or "" for col in REVIEW_COLUMNS}
            for r in csv.DictReader(f)
        ]

    fixed_rows = 0
    total_changes = 0
    fix_log: list[tuple[int, str, list[str]]] = []
    now = iso_now()

    for idx, row in enumerate(rows):
        raw = row["operation_spec"].strip()
        if not raw:
            continue
        try:
            spec = json.loads(raw)
        except Exception:
            continue
        if not isinstance(spec, dict):
            continue
        chart_id = row["chart_id"].strip()
        if not chart_id:
            continue
        columns, values = load_data_columns_and_values(chart_id)
        if not columns:
            continue
        new_spec, changes = fix_spec(spec, columns, values)
        if not changes:
            continue
        fixed_rows += 1
        total_changes += len(changes)
        fix_log.append((idx, chart_id, changes))
        if not args.dry_run:
            row["operation_spec"] = json.dumps(new_spec, separators=(",", ":"), ensure_ascii=False)
            row["updated_at"] = now

    if not args.dry_run and fixed_rows:
        atomic_write_rows(rows)

    print(
        f"{'DRY-RUN: would fix' if args.dry_run else 'fixed'} "
        f"{fixed_rows} rows · {total_changes} ops modified"
    )
    print()
    for idx, chart_id, changes in fix_log[:25]:
        print(f"row #{idx + 1} {chart_id}:")
        for c in changes[:5]:
            print(f"  · {c}")
        if len(changes) > 5:
            print(f"  · (+ {len(changes) - 5} more)")
    if len(fix_log) > 25:
        print(f"\n… and {len(fix_log) - 25} more rows")

    # Re-audit so the user sees the delta in one shot.
    if not args.dry_run:
        print("\n── Re-running audit ──")
        subprocess.run([sys.executable, "scripts/audit_review_ops.py"], cwd=ROOT, check=False)

    return 0


if __name__ == "__main__":
    sys.exit(main())
