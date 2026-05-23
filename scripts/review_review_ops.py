#!/usr/bin/env python3
"""
Semantic review pass for data/review/review_cases.csv.

Goal: detect rows whose operation_spec was generated without proper attention
to the Vega-Lite spec or the actual data csv — e.g. wrong field assignments,
ops type mismatched to the question, missing required preconditions, literal
thresholds put in the wrong slot — and rewrite them.

Pipeline per row (mirrors fill_review_ops.py but with the CURRENT ops_spec
shown to Claude as something to critique):

  1. Look up vlSpec + data csv from ChartQA folder by chart_id.
  2. Send a JUDGE prompt to claude: question, explanation, vl spec, data csv,
     and the CURRENT ops_spec.
  3. Claude responds with either:
       {"verdict":"ok"}                                          → no change
       {"verdict":"fix","corrected_ops":{"ops":[...],...}}       → replace
  4. If "fix", run normalize_ops + validate_ops on the corrected spec; on
     success write it back to the CSV with updated_at stamped.

Resumable: skips rows whose status is already 'verified' (so a second pass
can be cheap). Use --rerun to force a fresh judgement on every row.

Usage:
  python scripts/review_review_ops.py                 # full review
  python scripts/review_review_ops.py --concurrent 6
  python scripts/review_review_ops.py --limit 5       # first 5
  python scripts/review_review_ops.py --chart-id <id>
  python scripts/review_review_ops.py --rerun         # ignore prior verifications
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# Reuse helpers from the fill script (same project layout).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fill_review_ops import (  # noqa: E402
    CSV_PATH,
    REVIEW_COLUMNS,
    atomic_write_rows,
    build_user_prompt,
    extract_ops_object,
    find_chartqa,
    iso_now,
    load_few_shots,
    load_schema,
    normalize_ops,
    render_schema_doc,
    render_fewshot_block,
    schema_op_names,
    truncate_data_csv,
    validate_ops,
)

ROOT = Path(__file__).resolve().parents[1]
DEBUG_DIR = ROOT / "data" / "review" / ".review_pass_debug"
LOG_PATH = ROOT / "data" / "review" / ".review_pass.log"
PROGRESS_PATH = ROOT / "data" / "review" / ".review_pass_progress.json"


# ── Judge prompt ────────────────────────────────────────────────────────────


JUDGE_SYSTEM_TEMPLATE = """You audit OperationSpec JSON for chart QA cases.

You receive a question, its explanation, the chart's Vega-Lite spec, the
actual data csv, and a CURRENT operation_spec that someone else generated.
Your job: decide if the current spec correctly answers the question given
the data, or whether it needs to be rewritten.

============================
CRITICAL OUTPUT CONSTRAINTS
============================
1. Your ENTIRE response is a single JSON object — no prose, no markdown.
2. First character `{`, last character `}`.
3. NO reasoning visible to the caller.

============================
OUTPUT SHAPES
============================

If the current spec is correct:
  {"verdict":"ok"}

If the spec needs to be rewritten:
  {"verdict":"fix","corrected_ops":{"ops":[...],"ops2":[...],...}}

If you genuinely cannot produce a valid spec (e.g. the question references
data not present in the chart):
  {"verdict":"fix","corrected_ops":{"ops":[]}}

============================
THINGS TO CHECK
============================
1. `field` parameter MUST be a column that exists in the data csv. For
   target-style ops (retrieveValue / diff / compareBool / filter-with-include),
   `field` is the DIMENSION column (the x-axis / categorical column holding
   the target value), NOT the measure column.
2. `target`, `targetA`, `targetB` values MUST appear in the chosen `field`
   column's actual values (unless the value is "ref:n*").
3. `include` / `exclude` array entries MUST exist in the field's values.
4. For literal threshold comparisons ("exceeds X", "above N"), use `filter`
   with `operator: ">"` and `value: <number>`. Do NOT use `compareBool` —
   compareBool is for comparing two data points to each other.
5. Op type must match the question intent:
   - "average" → average
   - "find/which has max/min" → findExtremum
   - "year-over-year change" → lagDiff
   - "difference between A and B" → diff with two targets
   - "compare X vs Y, which is bigger" → compareBool with operator
   - "filter by category / subset" → filter
   - "total / sum across" → sum
   - "count how many" → count
   - "the value at X" → retrieveValue
6. Multi-sentence explanations should split into "ops","ops2","ops3"... — one
   group per sentence. Single logical step = just "ops".
7. Each op needs {op,id,meta:{nodeId,inputs,sentenceIndex},...params}.
8. Cross-step references use "ref:n<id>" — never copy a literal value if it
   was computed by an earlier op.

============================
AVAILABLE OPERATIONS
============================

{SCHEMA_DOC}

============================
EXAMPLES (good ops_spec shape)
============================

{FEWSHOT_BLOCK}

REMEMBER: output ONLY a JSON object. Either {"verdict":"ok"} or
{"verdict":"fix","corrected_ops":{...}}.
""".strip()


JUDGE_USER_TEMPLATE = """chart_id: {chart_id}
chart_type: {chart_type}

question:
{question}

explanation:
{explanation}

vega-lite spec (compact):
{vl_spec}

data csv (truncated):
{data_csv}

CURRENT operation_spec to audit:
{current_ops}

Output ONLY the verdict JSON object.""".strip()


def build_judge_system(schema: dict, few_shots: list[dict]) -> str:
    return (
        JUDGE_SYSTEM_TEMPLATE
        .replace("{SCHEMA_DOC}", render_schema_doc(schema))
        .replace("{FEWSHOT_BLOCK}", render_fewshot_block(few_shots))
    )


def build_judge_user(row: dict, vl_spec: dict, data_csv: str, chart_type: str | None) -> str:
    return JUDGE_USER_TEMPLATE.format(
        chart_id=row["chart_id"],
        chart_type=chart_type or "unknown",
        question=row.get("question", "").strip() or "(empty)",
        explanation=row.get("explanation", "").strip() or "(empty)",
        vl_spec=json.dumps(vl_spec, ensure_ascii=False),
        data_csv=truncate_data_csv(data_csv),
        current_ops=row.get("operation_spec", "").strip() or '{"ops":[]}',
    )


# ── Claude invocation ───────────────────────────────────────────────────────


def call_claude(system_prompt: str, user_prompt: str, model: str, timeout: int) -> str:
    cmd = [
        "claude",
        "--print",
        "--no-session-persistence",
        "--disable-slash-commands",
        "--tools", "",
        "--output-format", "text",
        "--model", model,
        "--system-prompt", system_prompt,
        user_prompt,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"claude exit {proc.returncode}: {proc.stderr.strip()}")
    return proc.stdout


VERDICT_RE = re.compile(r'"verdict"\s*:\s*"(ok|fix)"')


def extract_verdict_object(text: str) -> dict | None:
    """Try the parsers in order; both the simple ones first."""
    t = text.strip()
    if not t:
        return None
    try:
        v = json.loads(t)
        if isinstance(v, dict) and "verdict" in v:
            return v
    except Exception:
        pass
    # Anchor on "verdict": "..."
    m = VERDICT_RE.search(t)
    if not m:
        # Fall back to anchored {"ops": ... — caller may treat as a corrected spec directly
        from fill_review_ops import _scan_balanced_object, OPS_OBJECT_START_RE  # type: ignore
        for hit in OPS_OBJECT_START_RE.finditer(t):
            cand = _scan_balanced_object(t, hit.start())
            if isinstance(cand, dict):
                return {"verdict": "fix", "corrected_ops": cand}
        return None
    # Find the enclosing object containing this match
    open_brace = t.rfind("{", 0, m.start())
    if open_brace < 0:
        return None
    from fill_review_ops import _scan_balanced_object  # type: ignore
    cand = _scan_balanced_object(t, open_brace)
    if isinstance(cand, dict):
        return cand
    return None


# ── Per-row pipeline ────────────────────────────────────────────────────────


def review_row(
    row: dict,
    schema: dict,
    schema_names: set[str],
    judge_system: str,
    model: str,
    timeout: int,
) -> tuple[str, str | None, str | None]:
    """Return (verdict, new_ops_json_or_none, error_or_none).

    verdict in {"ok", "fix", "skip", "error"}.
    """
    chart_id = row["chart_id"].strip()
    if not chart_id:
        return "skip", None, "empty chart_id"
    spec_path, data_path, chart_type = find_chartqa(chart_id)
    if not spec_path or not data_path:
        return "skip", None, f"no ChartQA data for {chart_id}"
    try:
        vl = json.loads(spec_path.read_text(encoding="utf-8"))
    except Exception as e:
        return "error", None, f"vl spec parse: {e}"
    data_csv = data_path.read_text(encoding="utf-8")
    user_prompt = build_judge_user(row, vl, data_csv, chart_type)
    try:
        raw = call_claude(judge_system, user_prompt, model=model, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "error", None, f"claude timeout (>{timeout}s)"
    except Exception as e:
        return "error", None, f"claude call failed: {e}"
    parsed = extract_verdict_object(raw)
    if parsed is None:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        (DEBUG_DIR / f"{chart_id}.txt").write_text(raw, encoding="utf-8")
        return "error", None, f"no verdict in response (saved to .review_pass_debug/{chart_id}.txt)"
    verdict = parsed.get("verdict")
    if verdict == "ok":
        return "ok", None, None
    if verdict != "fix":
        return "error", None, f"unknown verdict: {verdict!r}"
    corrected = parsed.get("corrected_ops")
    if not isinstance(corrected, dict):
        return "error", None, "verdict=fix but no corrected_ops object"
    corrected = normalize_ops(corrected)
    ok, err = validate_ops(corrected, schema_names)
    if not ok:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        (DEBUG_DIR / f"{chart_id}.txt").write_text(raw, encoding="utf-8")
        return "error", None, f"corrected_ops invalid: {err}"
    return "fix", json.dumps(corrected, separators=(",", ":"), ensure_ascii=False), None


# ── CSV / logging ───────────────────────────────────────────────────────────


CSV_LOCK = threading.Lock()
LOG_LOCK = threading.Lock()


def log(msg: str) -> None:
    line = f"[{iso_now()}] {msg}"
    print(line, flush=True)
    with LOG_LOCK:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


def load_progress() -> dict[str, str]:
    if not PROGRESS_PATH.exists():
        return {}
    try:
        return json.loads(PROGRESS_PATH.read_text())
    except Exception:
        return {}


def save_progress(progress: dict[str, str]) -> None:
    PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2, ensure_ascii=False))


# ── Main ────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--concurrent", type=int, default=4)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--chart-id", default=None)
    ap.add_argument("--rerun", action="store_true", help="ignore prior verifications")
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--fewshot-count", type=int, default=3)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    schema = load_schema()
    schema_names = schema_op_names(schema)
    few_shots = load_few_shots(args.fewshot_count)
    judge_system = build_judge_system(schema, few_shots)

    if shutil.which("claude") is None:
        sys.exit("`claude` not on PATH")

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = [{c: r.get(c, "") or "" for c in REVIEW_COLUMNS} for r in csv.DictReader(f)]

    progress = load_progress()

    targets: list[tuple[int, dict]] = []
    for i, row in enumerate(rows):
        if args.chart_id and row["chart_id"] != args.chart_id:
            continue
        if not row.get("operation_spec", "").strip():
            continue  # nothing to review
        if not args.rerun and progress.get(row["chart_id"]) == "ok":
            continue  # previously verified
        targets.append((i, row))
    if args.limit is not None:
        targets = targets[: args.limit]

    if not targets:
        log("nothing to review.")
        return 0
    log(f"plan: {len(targets)} rows · concurrent={args.concurrent} model={args.model}")

    counts = {"ok": 0, "fix": 0, "skip": 0, "error": 0}
    start = time.time()

    def worker(idx: int, row: dict) -> tuple[int, str, str | None, str | None, str]:
        verdict, new_ops, err = review_row(
            row, schema, schema_names, judge_system, args.model, args.timeout
        )
        return idx, verdict, new_ops, err, row["chart_id"]

    with ThreadPoolExecutor(max_workers=args.concurrent) as pool:
        futures = [pool.submit(worker, idx, row) for idx, row in targets]
        for future in as_completed(futures):
            try:
                idx, verdict, new_ops, err, chart_id = future.result()
            except Exception as exc:
                counts["error"] += 1
                log(f"! worker crashed: {exc}")
                continue
            counts[verdict] = counts.get(verdict, 0) + 1
            row = rows[idx]
            tag = {"ok": "✓ ok", "fix": "↻ fix", "skip": "· skip", "error": "✗ err"}[verdict]
            note = f": {err}" if err else ""
            log(f"{tag} row #{idx + 1} {chart_id}{note}")
            with CSV_LOCK:
                if verdict == "fix" and new_ops:
                    row["operation_spec"] = new_ops
                    row["updated_at"] = iso_now()
                    atomic_write_rows(rows)
                # Persist progress so re-runs skip verified rows
                progress[chart_id] = verdict
                save_progress(progress)

    elapsed = time.time() - start
    log(
        f"done · ok {counts['ok']} · fixed {counts['fix']} · skip {counts['skip']} · "
        f"err {counts['error']} · {elapsed:.1f}s"
    )
    return 0 if counts["error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
