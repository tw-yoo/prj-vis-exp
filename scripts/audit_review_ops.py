#!/usr/bin/env python3
"""
Audit the operation_spec for every row in data/review/review_cases.csv.

Catches realistic LLM mistakes that the loose schema-only validator misses:
  - empty ops ({"ops":[]} fallback the model emits when stuck)
  - missing required fields per op type (from operationRegistry)
  - `field` parameter referencing a column not in the data csv
  - `target` / `targetA` / `targetB` referencing a value not present in the
    primary categorical column (skipping the "ref:n*" form)
  - `include` / `exclude` arrays whose elements aren't in the data
  - `group` referencing a series value that doesn't exist
  - unknown op names (would already have been caught at write time, but recheck)

Reports per-row issues to stdout and writes a flagged-rows file
data/review/.audit_flagged.json that scripts/fill_review_ops.py can consume
(or a human can inspect).

Usage:
  python scripts/audit_review_ops.py              # human-readable report
  python scripts/audit_review_ops.py --json-out   # only write the flagged list
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "review" / "review_cases.csv"
CHARTQA = ROOT / "ChartQA"
SCHEMA_CACHE = ROOT / "data" / "review" / ".ops_schema.json"
FLAGGED_OUT = ROOT / "data" / "review" / ".audit_flagged.json"


# ── Schema lookup ───────────────────────────────────────────────────────────


def load_schema_index() -> dict[str, dict]:
    if not SCHEMA_CACHE.exists():
        sys.exit("schema cache missing — run scripts/dump_ops_schema.mts first")
    schema = json.loads(SCHEMA_CACHE.read_text())
    return {op["op"]: op for op in schema["operations"]}


# ── Data csv lookup (mirror of fill_review_ops.find_chartqa) ────────────────


def find_data_csv(chart_id: str) -> Path | None:
    return next(iter((CHARTQA / "data" / "csv").rglob(f"{chart_id}.csv")), None)


def load_data_columns_and_values(chart_id: str) -> tuple[list[str], dict[str, set[str]]]:
    """Return (column_names, {col -> set of distinct stringified values})."""
    path = find_data_csv(chart_id)
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


# ── Per-op issue collection ─────────────────────────────────────────────────


REF_RE = re.compile(r"^ref:n\d+$")


def issues_for_op(
    op: dict,
    op_schema: dict | None,
    columns: list[str],
    values: dict[str, set[str]],
) -> list[str]:
    issues: list[str] = []
    name = op.get("op", "?")
    if op_schema is None:
        issues.append(f"unknown op '{name}'")
        return issues

    # Required fields
    for field_def in op_schema.get("fields", []):
        if not field_def["optional"]:
            key = field_def["key"]
            if key not in op:
                issues.append(f"{name}: missing required field '{key}'")

    # field references must exist as columns
    if "field" in op and isinstance(op["field"], str) and not REF_RE.match(op["field"]):
        if op["field"] not in columns:
            issues.append(f"{name}: field '{op['field']}' not in data columns {columns}")

    # orderField (lagDiff) and seriesField (pairDiff) likewise
    for key in ("orderField", "seriesField", "keyField"):
        if key in op and isinstance(op[key], str) and op[key] not in columns:
            issues.append(f"{name}: {key} '{op[key]}' not in data columns")

    # target / targetA / targetB referencing categorical values
    for key in ("target", "targetA", "targetB"):
        val = op.get(key)
        if val is None:
            continue
        if isinstance(val, str) and REF_RE.match(val):
            continue
        # Need to know which column to match against. Look at the op's `field`.
        field = op.get("field")
        if not isinstance(field, str) or field not in values:
            # Try primary dimension heuristic: first non-numeric-looking column
            field = _guess_primary_dim(columns, values)
        if field and field in values:
            present = values[field]
            sval = str(val).strip()
            if sval not in present and sval.lower() not in {v.lower() for v in present}:
                issues.append(
                    f"{name}: {key}={val!r} not in {field} values "
                    f"(have {sorted(present)[:6]}{'…' if len(present) > 6 else ''})"
                )

    # include / exclude arrays
    for key in ("include", "exclude"):
        items = op.get(key)
        if not isinstance(items, list):
            continue
        field = op.get("field")
        if not isinstance(field, str) or field not in values:
            field = _guess_primary_dim(columns, values)
        if field and field in values:
            present = values[field]
            lower = {v.lower() for v in present}
            missing = [
                str(x)
                for x in items
                if isinstance(x, (str, int, float))
                and str(x).strip() not in present
                and str(x).strip().lower() not in lower
            ]
            if missing:
                issues.append(
                    f"{name}: {key} contains values not in {field}: {missing[:5]}"
                    f"{'…' if len(missing) > 5 else ''}"
                )

    return issues


def _guess_primary_dim(columns: list[str], values: dict[str, set[str]]) -> str | None:
    """Heuristic: the first column whose values look categorical (non-numeric)."""
    for col in columns:
        vals = values.get(col, set())
        if not vals:
            continue
        numeric_count = sum(1 for v in vals if _looks_numeric(v))
        if numeric_count / max(len(vals), 1) < 0.7:
            return col
    return columns[0] if columns else None


def _looks_numeric(v: str) -> bool:
    if not v:
        return False
    try:
        float(v)
        return True
    except ValueError:
        return False


# ── Row-level audit ─────────────────────────────────────────────────────────


def audit_row(row: dict, schema_index: dict[str, dict]) -> list[str]:
    issues: list[str] = []
    chart_id = row["chart_id"].strip()
    raw = row.get("operation_spec", "").strip()
    if not raw:
        return ["operation_spec is empty"]
    try:
        spec = json.loads(raw)
    except Exception as e:
        return [f"operation_spec parse failed: {e}"]
    if not isinstance(spec, dict):
        return ["operation_spec is not a JSON object"]

    if not chart_id:
        issues.append("chart_id is empty — cannot look up data csv")
        return issues

    columns, values = load_data_columns_and_values(chart_id)
    if not columns:
        issues.append(f"could not load data csv for chart_id '{chart_id}'")
        return issues

    has_any_op = False
    for group_key, group in spec.items():
        if not re.fullmatch(r"ops\d*", group_key):
            issues.append(f"unexpected top-level key '{group_key}'")
            continue
        if not isinstance(group, list):
            issues.append(f"{group_key} is not a list")
            continue
        for op in group:
            if not isinstance(op, dict):
                issues.append(f"{group_key} contains non-object item")
                continue
            has_any_op = True
            op_name = op.get("op")
            op_schema = schema_index.get(op_name) if isinstance(op_name, str) else None
            for issue in issues_for_op(op, op_schema, columns, values):
                issues.append(f"{group_key}: {issue}")

    if not has_any_op:
        issues.append('all ops groups are empty ({"ops":[]} fallback)')

    return issues


# ── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json-out", action="store_true", help="only write flagged list, no human report")
    parser.add_argument("--chart-id", help="audit only this chart_id")
    args = parser.parse_args()

    schema_index = load_schema_index()

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    flagged: list[dict] = []
    severity_counts: Counter[str] = Counter()
    op_problem_counts: Counter[str] = Counter()

    for idx, row in enumerate(rows):
        if args.chart_id and row.get("chart_id") != args.chart_id:
            continue
        issues = audit_row(row, schema_index)
        if not issues:
            continue
        flagged.append(
            {
                "row_index": idx,
                "chart_id": row.get("chart_id", ""),
                "question": row.get("question", "")[:120],
                "issues": issues,
            }
        )
        for issue in issues:
            kind = _classify(issue)
            severity_counts[kind] += 1
            # Track which op type is most commonly broken
            m = re.match(r"\w+: (\w+):", issue)
            if m:
                op_problem_counts[m.group(1)] += 1

    FLAGGED_OUT.parent.mkdir(parents=True, exist_ok=True)
    FLAGGED_OUT.write_text(json.dumps(flagged, indent=2, ensure_ascii=False))

    if args.json_out:
        return 0

    total = sum(1 for r in rows if (not args.chart_id) or r.get("chart_id") == args.chart_id)
    print(f"{len(flagged)} / {total} rows flagged · wrote {FLAGGED_OUT.relative_to(ROOT)}")
    print()
    print("Issue kinds:")
    for kind, count in severity_counts.most_common():
        print(f"  {count:>3}  {kind}")
    if op_problem_counts:
        print()
        print("Most-frequently-broken op types:")
        for op_name, count in op_problem_counts.most_common(10):
            print(f"  {count:>3}  {op_name}")

    if len(flagged) <= 20:
        print()
        for entry in flagged:
            print(f"\nrow #{entry['row_index'] + 1} {entry['chart_id']}")
            print(f"  Q: {entry['question']}")
            for issue in entry["issues"]:
                print(f"    · {issue}")
    else:
        print(f"\n(full per-row details in {FLAGGED_OUT.relative_to(ROOT)})")

    return 0


def _classify(issue: str) -> str:
    s = issue.lower()
    if "empty" in s and "ops" in s:
        return "empty ops (no-op fallback)"
    if "missing required field" in s:
        return "missing required field"
    if "not in data columns" in s:
        return "bad field reference"
    if "not in" in s and ("values" in s or "include" in s):
        return "bad target/include value"
    if "unknown op" in s:
        return "unknown op name"
    if "parse failed" in s:
        return "json parse failure"
    return "other"


if __name__ == "__main__":
    sys.exit(main())
