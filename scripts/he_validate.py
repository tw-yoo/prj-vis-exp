#!/usr/bin/env python3
"""Validate operation_spec JSON against the canonical grammar + each chart's data.

Output is STRUCTURED (json.dumps) + short error CODES only, because this
environment corrupts free-form text that quotes file content. Full per-row
detail (with the offending field/literal strings) is written to a JSON report
file; stdout shows only summary counts + code histograms.

Layers:
  1. STRUCTURAL (hard errors): JSON parses; group keys ops/ops2/...; each op has a
     known `op`, `id`, `meta{nodeId,inputs,sentenceIndex}`; required fields; unique
     ids; meta.inputs + every "ref:nN" resolve to an earlier node; chart-type
     compatibility (sum=bar-only, pairDiff=multi-series-only).
  2. GROUNDING (warnings): field/orderField/by/seriesField are real columns;
     group/groupA/groupB are real series values; non-ref string literals in
     target*/include/exclude appear among the chart's categorical values.

Contracts mirror nlp_server/opsspec/runtime/op_registry.py (15 ops). range /
rollingWindow / monotonicRun / findExtremum.rank are NOT in the grammar.

Usage:
  python scripts/he_validate.py <csv> [--id-col chart_id] [--spec-col operation_spec]
                                      [--report PATH]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "data" / "review" / ".grounding_bundle.json"

# required + allowed fields, EXACTLY mirroring the nlp_server pydantic models
# (dumped via scripts/_probe_fields.py -> .ops_fields.json). Authoring a field
# outside this allowed set makes the executor raise a pydantic ValidationError,
# so UNEXPECTED_FIELD is a hard error here (predicts execution failure).
CONTRACTS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "retrieveValue": ((), ("target", "field", "group", "targetAxis", "precision")),
    "filter": ((), ("field", "operator", "value", "include", "exclude", "group", "xKindHint")),
    "findExtremum": ((), ("which", "rank", "field", "group")),
    "diffByValue": ((), ("value", "targetValue", "field", "group", "signed")),
    "compareBool": (("operator",), ("targetA", "targetB", "field", "groupA", "groupB", "aggregate", "group")),
    "sort": ((), ("field", "order", "group", "orderField")),
    "sum": ((), ("field", "group")),
    "average": ((), ("field", "group")),
    "diff": ((), ("targetA", "targetB", "field", "groupA", "groupB",
                  "precision", "mode", "percent", "scale", "signed", "aggregate", "targetName")),
    "lagDiff": ((), ("absolute", "field", "group", "order", "signed")),
    "pairDiff": (("by", "groupA", "groupB"), ("seriesField", "field",
                                              "absolute", "precision", "group", "signed")),
    "nth": (("n",), ("field", "group", "from", "orderField", "order")),
    "count": ((), ("field", "group")),
    "add": (("targetA", "targetB"), ("field", "group")),
    "scale": (("target", "factor"), ("field", "group")),
    "range": ((), ("field", "group")),
    "rollingWindow": (("window",), ("aggregate", "field", "orderField", "group")),
    "monotonicRun": ((), ("direction", "strict", "mode", "minLength", "field", "orderField", "group")),
}
OP_NAMES = set(CONTRACTS)
REF_RE = re.compile(r"^ref:n\d+$")
GROUP_KEY_RE = re.compile(r"^ops\d*$")


def is_ref(v) -> bool:
    return isinstance(v, str) and REF_RE.match(v) is not None


def collect_refs(op: dict) -> list[str]:
    out = []
    for k, v in op.items():
        if k in ("op", "id", "meta"):
            continue
        for x in (v if isinstance(v, list) else [v]):
            if is_ref(x):
                out.append(x.split(":", 1)[1])
    return out


def validate_spec(spec_text: str, ground: dict):
    """Return (errors, warns, ops_used). errors/warns are dicts {code, op, info}."""
    errors: list[dict] = []
    warns: list[dict] = []
    used: Counter = Counter()

    spec_text = (spec_text or "").strip()
    if spec_text == "":
        return errors, warns, used, True  # empty (skipped)

    try:
        obj = json.loads(spec_text)
    except Exception as e:  # noqa: BLE001
        return [{"code": "JSON_PARSE", "info": str(e)}], warns, used, False
    if not isinstance(obj, dict):
        return [{"code": "NOT_OBJECT"}], warns, used, False

    for k in obj:
        if not GROUP_KEY_RE.match(k):
            errors.append({"code": "BAD_GROUP_KEY", "info": k})

    ct = ground.get("chart_type", "") if ground else ""
    is_bar, is_line = ct.startswith("bar"), ct.startswith("line")
    is_multi = ct in ("bar_grouped", "bar_stacked", "line_multiple")
    cols = set(ground.get("columns", [])) if ground else set()
    series_field = ground.get("series_field") if ground else None
    series_vals = set(ground.get("categorical_values", {}).get(series_field, [])) if (ground and series_field) else set()
    all_cats = set()
    for vs in (ground.get("categorical_values", {}) if ground else {}).values():
        all_cats.update(vs)
    have_ground = bool(ground) and not ground.get("errors")

    flat: list[tuple[str, dict]] = []
    for gk in sorted(obj, key=lambda k: (k != "ops", k)):
        grp = obj[gk]
        if not isinstance(grp, list):
            errors.append({"code": "GROUP_NOT_LIST", "op": gk})
            continue
        for op in grp:
            if not isinstance(op, dict):
                errors.append({"code": "OP_NOT_OBJECT", "op": gk})
            else:
                flat.append((gk, op))

    seen: set[str] = set()
    for i, (gk, op) in enumerate(flat):
        name = op.get("op")
        oid = op.get("id")
        loc = f"{i+1}:{name}"
        if name not in OP_NAMES:
            errors.append({"code": "UNKNOWN_OP", "op": loc, "info": str(name)})
            continue
        used[name] += 1
        if not isinstance(oid, str) or not oid:
            errors.append({"code": "MISSING_ID", "op": loc})
        else:
            if oid in seen:
                errors.append({"code": "DUP_ID", "op": loc, "info": oid})
            seen.add(oid)

        meta = op.get("meta")
        if not isinstance(meta, dict):
            errors.append({"code": "META_MISSING", "op": loc})
            meta = {}
        else:
            if meta.get("nodeId") != oid:
                errors.append({"code": "NODEID_MISMATCH", "op": loc})
            if not isinstance(meta.get("inputs"), list):
                errors.append({"code": "INPUTS_NOT_LIST", "op": loc})
            if not isinstance(meta.get("sentenceIndex"), int):
                warns.append({"code": "SENTIDX_NOT_INT", "op": loc})

        req, opt = CONTRACTS[name]
        for r in req:
            if r not in op:
                errors.append({"code": "MISSING_REQUIRED", "op": loc, "info": r})
        allowed = set(req) | set(opt) | {"op", "id", "meta"}
        for k in op:
            if k not in allowed:
                errors.append({"code": "UNEXPECTED_FIELD", "op": loc, "info": k})

        earlier = set(seen)
        earlier.discard(oid)
        for dep in (meta.get("inputs") or []):
            if dep not in earlier and dep != oid:
                errors.append({"code": "INPUT_NOT_EARLIER", "op": loc, "info": dep})
        for rid in collect_refs(op):
            if rid not in earlier:
                errors.append({"code": "REF_NOT_EARLIER", "op": loc, "info": rid})
            if rid not in (meta.get("inputs") or []):
                warns.append({"code": "REF_NOT_IN_INPUTS", "op": loc, "info": rid})

        if name == "sum" and not is_bar:
            warns.append({"code": "SUM_ON_NONBAR", "op": loc})
        if name == "pairDiff" and not is_multi:
            errors.append({"code": "PAIRDIFF_SINGLE", "op": loc})
        if name == "lagDiff" and not is_line:
            warns.append({"code": "LAGDIFF_NONLINE", "op": loc})

        if have_ground:
            for fk in ("field", "orderField", "by", "keyField", "seriesField"):
                fv = op.get(fk)
                if isinstance(fv, str) and fv and fv not in cols:
                    warns.append({"code": "FIELD_NOT_COLUMN", "op": loc, "info": f"{fk}={fv}"})
            for gk2 in ("group", "groupA", "groupB"):
                gv = op.get(gk2)
                for g in (gv if isinstance(gv, list) else [gv]):
                    if isinstance(g, str) and g:
                        if not series_field:
                            warns.append({"code": "GROUP_NO_SERIES", "op": loc, "info": f"{gk2}={g}"})
                        elif series_vals and g not in series_vals:
                            warns.append({"code": "GROUP_NOT_SERIES_VAL", "op": loc, "info": f"{gk2}={g}"})
            for tk in ("target", "targetA", "targetB", "include", "exclude"):
                tv = op.get(tk)
                for t in (tv if isinstance(tv, list) else [tv]):
                    if isinstance(t, str) and t and not is_ref(t) and all_cats and t not in all_cats:
                        warns.append({"code": "LITERAL_NOT_IN_CATS", "op": loc, "info": f"{tk}={t}"})

    return errors, warns, used, False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--id-col", default="chart_id")
    ap.add_argument("--spec-col", default="operation_spec")
    ap.add_argument("--report", default=str(ROOT / "data" / "review" / ".validation_report.json"))
    args = ap.parse_args()

    bundle = json.loads(BUNDLE.read_text())
    rows = list(csv.DictReader(open(args.csv, newline="")))

    total = filled = empty = clean = err_rows = 0
    ecodes: Counter = Counter()
    wcodes: Counter = Counter()
    ops_total: Counter = Counter()
    report: list[dict] = []
    for r in rows:
        cid = r.get(args.id_col, "")
        spec = r.get(args.spec_col, "")
        total += 1
        errs, warns, used, is_empty = validate_spec(spec, bundle.get(cid, {}))
        if is_empty:
            empty += 1
            continue
        filled += 1
        ops_total.update(used)
        ecodes.update(e["code"] for e in errs)
        wcodes.update(w["code"] for w in warns)
        if errs:
            err_rows += 1
        else:
            clean += 1
        if errs or warns:
            report.append({"id": cid, "errors": errs, "warns": warns})

    summary = {
        "file": args.csv,
        "rows": total, "filled": filled, "empty": empty,
        "clean": clean, "with_errors": err_rows,
        "error_codes": dict(ecodes.most_common()),
        "warn_codes": dict(wcodes.most_common()),
        "op_usage": dict(ops_total.most_common()),
        "report": args.report,
    }
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1))
    Path(args.report + ".summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
