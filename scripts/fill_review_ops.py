#!/usr/bin/env python3
"""
Fill in the `operation_spec` column of data/review/review_cases.csv by asking
Claude to produce an OperationSpec JSON for each row, given the row's
question / explanation plus the ChartQA Vega-Lite spec and data CSV that the
chart_id resolves to.

Why a script instead of a manual workflow:
  - 200+ rows, each needing focused attention; we want every row processed in
    a fresh Claude invocation so context never bleeds between cases.
  - Resumable: only fills rows whose operation_spec is empty, so re-runs pick
    up after Ctrl+C or transient failures.
  - Atomic per-row writes mean partial progress is always on disk.

Pipeline per row:
  1. Look up vlSpec at ChartQA/data/vlSpec/**/{chart_id}.json
  2. Look up data csv at ChartQA/data/csv/**/{chart_id}.csv
  3. Compose a self-contained prompt (schema + few-shot + this row's specifics)
  4. Invoke `claude --print --bare --json-schema ...` — structured output
  5. Validate the returned JSON against the op registry
  6. Write back into review_cases.csv under a lock

Usage:
  python scripts/fill_review_ops.py                       # fill all empty rows
  python scripts/fill_review_ops.py --concurrent 6        # 6-way parallel
  python scripts/fill_review_ops.py --limit 5             # only first 5
  python scripts/fill_review_ops.py --chart-id <id>       # one row by id
  python scripts/fill_review_ops.py --dry-run             # print prompt only
  python scripts/fill_review_ops.py --retry-invalid       # also re-process rows whose ops_spec is unparseable
  python scripts/fill_review_ops.py --refresh-schema      # re-dump the ops schema cache before running
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

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "review" / "review_cases.csv"
CHARTQA = ROOT / "ChartQA"
SCHEMA_CACHE = ROOT / "data" / "review" / ".ops_schema.json"
FEWSHOT_CSV = ROOT / "nlp_server" / "example.csv"
LOG_PATH = ROOT / "data" / "review" / ".fill_ops.log"

# Canonical schema for the review_cases.csv we write back. Order matters; any
# extra columns in the source file are dropped on write.
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

# When a row's operation_spec is non-empty, treat it as done. We only refill
# rows whose value is empty/whitespace OR (with --retry-invalid) unparseable.


# ── Schema cache ─────────────────────────────────────────────────────────────


def refresh_schema_cache() -> None:
    """Re-run scripts/dump_ops_schema.mts to refresh .ops_schema.json."""
    dump = ROOT / "scripts" / "dump_ops_schema.mts"
    if not dump.exists():
        sys.exit(f"missing {dump}")
    SCHEMA_CACHE.parent.mkdir(parents=True, exist_ok=True)
    out = subprocess.check_output(["npx", "tsx", str(dump)], cwd=ROOT, text=True)
    SCHEMA_CACHE.write_text(out)


def load_schema() -> dict:
    if not SCHEMA_CACHE.exists():
        refresh_schema_cache()
    return json.loads(SCHEMA_CACHE.read_text())


def schema_op_names(schema: dict) -> set[str]:
    return {op["op"] for op in schema.get("operations", [])}


def render_schema_doc(schema: dict) -> str:
    """Compact textual description of the op registry for the prompt."""
    lines: list[str] = []
    for op in schema["operations"]:
        params = []
        for field in op.get("fields", []):
            kind = field["kind"]
            mark = "" if field["optional"] else "*"
            opts = ""
            if field.get("options"):
                opts = f" ∈ {{{', '.join(field['options'])}}}"
            elif field.get("optionsSource"):
                opts = f" (from {field['optionsSource']})"
            params.append(f"{field['key']}{mark}: {kind}{opts}")
        lines.append(f"- {op['op']}: {', '.join(params) if params else '(no fields)'}")
    return "\n".join(lines)


# ── Few-shot examples ───────────────────────────────────────────────────────


def load_few_shots(n: int = 3) -> list[dict]:
    """Use nlp_server/example.csv as the source of well-formed few-shot pairs.

    Each row has: id, question, explanation, chart_context_json, spec_json.
    We keep n rows and reformat into the structure our prompt expects.
    """
    if not FEWSHOT_CSV.exists():
        return []
    with FEWSHOT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    picks = rows[:n]
    formatted: list[dict] = []
    for row in picks:
        try:
            spec = json.loads(row["spec_json"])
        except Exception:
            continue
        formatted.append(
            {
                "chart_id": row["id"],
                "question": row["question"],
                "explanation": row["explanation"],
                "ops_spec": spec,
            }
        )
    return formatted


# ── ChartQA lookup ──────────────────────────────────────────────────────────


def find_chartqa(chart_id: str) -> tuple[Path | None, Path | None, str | None]:
    """Return (vl_spec_path, data_csv_path, chart_type_label) for a chart_id."""
    if not chart_id:
        return None, None, None
    spec = next(iter((CHARTQA / "data" / "vlSpec").rglob(f"{chart_id}.json")), None)
    data = next(iter((CHARTQA / "data" / "csv").rglob(f"{chart_id}.csv")), None)
    chart_type = None
    if spec:
        rel = spec.relative_to(CHARTQA / "data" / "vlSpec")
        # rel.parts is like ('line', 'simple', 'avwb8xstxx1lmfpk.json')
        if len(rel.parts) >= 2:
            chart_type = "/".join(rel.parts[:-1])
    return spec, data, chart_type


def truncate_data_csv(text: str, max_data_rows: int = 60) -> str:
    """Keep header + up to N data rows so prompts stay bounded."""
    lines = text.splitlines()
    if len(lines) <= max_data_rows + 1:
        return text
    head = lines[:max_data_rows + 1]
    return "\n".join(head) + f"\n# … ({len(lines) - max_data_rows - 1} more data rows omitted)\n"


# ── Prompt construction ─────────────────────────────────────────────────────


SYSTEM_PROMPT_TEMPLATE = """You are a JSON generator. You output ONLY JSON.

============================
CRITICAL OUTPUT CONSTRAINTS
============================
1. Your ENTIRE response is a single JSON object. Nothing before. Nothing after.
2. The FIRST character of your response is `{`. The LAST character is `}`.
3. NO reasoning. NO prose. NO markdown code fences (```). NO bullet lists.
4. NO leading explanation like "Here is..." or "The operation_spec is...".
5. If you cannot produce valid JSON, output `{"ops":[]}` — do NOT explain why.

Violating any rule above makes the response unusable.

============================
TASK
============================
Produce an OperationSpec JSON for a chart QA case. The OperationSpec
describes the analytic operations a viewer performs to answer a question
about a chart; the runtime then visually executes them on the rendered
chart.

Top-level shape:

  {"ops":[...],"ops2":[...],"ops3":[...]}

Each numbered key holds the ops for ONE SENTENCE of the explanation, in
order: "ops" for sentence 1, "ops2" for sentence 2, etc. One sentence may
produce multiple ops. If the explanation is one logical step, emit only
"ops".

Each op object:

  {"op":"<opName>","id":"<short id e.g. n1>",
   "meta":{"nodeId":"<same id>","inputs":[<previous ids consumed>],"sentenceIndex":<1-based>},
   ...op-specific fields...}

Reference an earlier op's result with the literal string "ref:<id>".

============================
AVAILABLE OPERATIONS
============================
Required fields are marked with *.

{SCHEMA_DOC}

============================
FIELD-CHOICE GUIDANCE
============================
- "field" (optionsSource=field): pick from the data csv's column names.
- "group" (optionsSource=series): pick from the categorical color/series field's distinct values.
- "target" (optionsSource=target): a specific x value (e.g. a year). Use the literal value from the data csv.
- For diff/compare ops with two referents: targetA / targetB with "ref:<id>".
- "include" on filter: array of x-axis values to keep.
- "which" on findExtremum: "min" or "max".

============================
FEW-SHOT EXAMPLES (same JSON shape as your output)
============================
{FEWSHOT_BLOCK}

REMEMBER: output ONLY a JSON object. First char `{`, last char `}`.
""".strip()


USER_PROMPT_TEMPLATE = """chart_id: {chart_id}
chart_type: {chart_type}

question:
{question}

explanation:
{explanation}

vega-lite spec (compact):
{vl_spec}

data csv (truncated):
{data_csv}

Output ONLY a JSON object starting with `{{` and ending with `}}`. No prose.""".strip()


def render_fewshot_block(few_shots: list[dict]) -> str:
    if not few_shots:
        return "(no few-shot examples available)"
    parts = []
    for i, ex in enumerate(few_shots, start=1):
        parts.append(
            f"### Example {i}\n"
            f"chart_id: {ex['chart_id']}\n"
            f"question: {ex['question']}\n"
            f"explanation: {ex['explanation']}\n"
            f"ops_spec:\n{json.dumps(ex['ops_spec'], ensure_ascii=False)}\n"
        )
    return "\n".join(parts)


def build_system_prompt(schema: dict, few_shots: list[dict]) -> str:
    return (
        SYSTEM_PROMPT_TEMPLATE
        .replace("{SCHEMA_DOC}", render_schema_doc(schema))
        .replace("{FEWSHOT_BLOCK}", render_fewshot_block(few_shots))
    )


def build_user_prompt(row: dict, vl_spec: dict, data_csv: str, chart_type: str | None) -> str:
    return USER_PROMPT_TEMPLATE.format(
        chart_id=row["chart_id"],
        chart_type=chart_type or "unknown",
        question=row.get("question", "").strip() or "(empty)",
        explanation=row.get("explanation", "").strip() or "(empty)",
        vl_spec=json.dumps(vl_spec, ensure_ascii=False),
        data_csv=truncate_data_csv(data_csv),
    )


# ── JSON Schema for --json-schema (forces structured output) ────────────────


OPS_JSON_SCHEMA: dict = {
    "type": "object",
    "patternProperties": {
        "^ops[0-9]*$": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["op", "id"],
                "properties": {
                    "op": {"type": "string"},
                    "id": {"type": "string"},
                    "meta": {"type": "object"},
                },
                "additionalProperties": True,
            },
        }
    },
    "additionalProperties": False,
}


# ── Claude invocation ───────────────────────────────────────────────────────


def call_claude(system_prompt: str, user_prompt: str, model: str, timeout: int) -> str:
    """Invoke `claude --print --bare` and return raw text response.

    Uses --json-schema to force structured JSON output, which removes the need
    to parse markdown fences out of the response.
    """
    # NOTE: We can't use --bare or --json-schema here because both require
    # ANTHROPIC_API_KEY mode (they silently produce empty output under the
    # OAuth/keychain auth that Claude Code Pro/Max users have). Falling back
    # to a defaults-only invocation that relies on prompt enforcement.
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


CODE_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
OPS_OBJECT_START_RE = re.compile(r'\{\s*"ops"\s*:', re.IGNORECASE)


def _scan_balanced_object(text: str, start: int) -> dict | None:
    """From `start` (must point at '{'), walk forward respecting string escapes
    until the matching '}' and return the parsed object — or None.
    """
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    val = json.loads(text[start : i + 1])
                    if isinstance(val, dict):
                        return val
                except Exception:
                    return None
                return None
    return None


def extract_ops_object(claude_text: str) -> dict | None:
    """Pull the ops_spec JSON object out of Claude's response.

    Tries (in order):
      1. The entire response as JSON.
      2. Markdown code fence content.
      3. Brace-balanced scan starting at the first `{"ops"` anchor we find.
         This is the most robust against models that wrap JSON in prose.
    """
    text = claude_text.strip()
    if not text:
        return None
    # 1. Whole response is JSON?
    try:
        candidate = json.loads(text)
        if isinstance(candidate, dict):
            return candidate
    except Exception:
        pass
    # 2. Markdown fence?
    for match in CODE_FENCE_RE.finditer(text):
        body = match.group(1).strip()
        try:
            candidate = json.loads(body)
            if isinstance(candidate, dict):
                return candidate
        except Exception:
            continue
    # 3. Scan for `{"ops":` anchor and walk balanced braces.
    for match in OPS_OBJECT_START_RE.finditer(text):
        candidate = _scan_balanced_object(text, match.start())
        if isinstance(candidate, dict):
            return candidate
    return None


def normalize_ops(obj: dict) -> dict:
    """Forgiving normalization for common model output mistakes.

    Handles:
      1. Double-wrap: {"ops": {"ops": [...], "ops2": [...]}} → unwrap once.
      2. Single op as object: {"ops": {op:..., id:...}} → wrap in list.

    Idempotent for already-correct inputs.
    """
    # (1) Unwrap when ops/ops2/etc. keys live one level too deep.
    if (
        len(obj) == 1
        and "ops" in obj
        and isinstance(obj["ops"], dict)
        and all(re.fullmatch(r"ops\d*", k) for k in obj["ops"].keys())
    ):
        obj = obj["ops"]
    # (2) Wrap a single dict-shaped op into a list.
    normalized: dict = {}
    for key, group in obj.items():
        if isinstance(group, dict):
            normalized[key] = [group]
        else:
            normalized[key] = group
    return normalized


def validate_ops(obj: dict, known_op_names: set[str]) -> tuple[bool, str]:
    if not isinstance(obj, dict):
        return False, "not an object"
    if not obj:
        return False, "empty object"
    has_any_op = False
    for key, group in obj.items():
        if not re.fullmatch(r"ops\d*", key):
            return False, f"unexpected top-level key '{key}'"
        if not isinstance(group, list):
            return False, f"'{key}' is not a list"
        # Empty groups are allowed — the model uses {"ops":[]} as an intentional
        # "no ops apply" fallback (e.g., when the question doesn't match the
        # chart's data). We persist that as-is so the human reviewer can spot it.
        for i, op in enumerate(group):
            if not isinstance(op, dict):
                return False, f"{key}[{i}] is not an object"
            op_name = op.get("op")
            if not isinstance(op_name, str):
                return False, f"{key}[{i}].op missing"
            if op_name not in known_op_names:
                return False, f"{key}[{i}].op '{op_name}' not in registry"
            if not isinstance(op.get("id"), str):
                return False, f"{key}[{i}].id missing"
            has_any_op = True
    # Allow all-empty as a valid (intentional) result — the human reviewer
    # can spot the empty cell and flag it as a bug if needed.
    return True, ("" if has_any_op else "all-empty (intentional)")


# ── CSV I/O ─────────────────────────────────────────────────────────────────


def load_rows() -> list[dict]:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for raw in reader:
            row = {col: raw.get(col, "") or "" for col in REVIEW_COLUMNS}
            rows.append(row)
        return rows


CSV_LOCK = threading.Lock()


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


# ── Logging ─────────────────────────────────────────────────────────────────


_LOG_LOCK = threading.Lock()


def log(line: str) -> None:
    line = f"[{iso_now()}] {line}"
    print(line, flush=True)
    with _LOG_LOCK:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


# ── Per-row pipeline ────────────────────────────────────────────────────────


def process_row(
    row: dict,
    schema: dict,
    schema_names: set[str],
    system_prompt: str,
    model: str,
    timeout: int,
    dry_run: bool,
) -> tuple[str | None, str | None, str | None]:
    """Return (ops_json_text, error, dry_prompt). One of ops_json_text/error is set."""
    chart_id = row["chart_id"].strip()
    if not chart_id:
        return None, "empty chart_id", None
    spec_path, data_path, chart_type = find_chartqa(chart_id)
    if not spec_path or not data_path:
        return None, f"ChartQA spec or data not found for '{chart_id}'", None
    try:
        vl = json.loads(spec_path.read_text(encoding="utf-8"))
    except Exception as e:
        return None, f"vl spec parse failed: {e}", None
    data_csv = data_path.read_text(encoding="utf-8")
    user_prompt = build_user_prompt(row, vl, data_csv, chart_type)
    if dry_run:
        return None, None, f"=== SYSTEM ===\n{system_prompt}\n\n=== USER ===\n{user_prompt}"
    try:
        raw = call_claude(system_prompt, user_prompt, model=model, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, f"claude timeout (>{timeout}s)", None
    except Exception as e:
        return None, f"claude call failed: {e}", None
    parsed = extract_ops_object(raw)
    if parsed is None:
        # Persist the raw response for debugging.
        debug_dir = ROOT / "data" / "review" / ".fill_ops_debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        (debug_dir / f"{chart_id}.txt").write_text(raw, encoding="utf-8")
        return None, f"no JSON in response (saved to .fill_ops_debug/{chart_id}.txt)", None
    parsed = normalize_ops(parsed)
    ok, err = validate_ops(parsed, schema_names)
    if not ok:
        debug_dir = ROOT / "data" / "review" / ".fill_ops_debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        (debug_dir / f"{chart_id}.txt").write_text(raw, encoding="utf-8")
        return None, f"invalid ops_spec: {err} (saved to .fill_ops_debug/{chart_id}.txt)", None
    return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False), None, None


# ── Main ────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--concurrent", type=int, default=4, help="parallel claude calls (default 4)")
    ap.add_argument("--limit", type=int, default=None, help="process at most N rows this run")
    ap.add_argument("--chart-id", default=None, help="only process the row with this chart_id")
    ap.add_argument("--dry-run", action="store_true", help="print prompt instead of calling claude")
    ap.add_argument("--retry-invalid", action="store_true", help="also reprocess rows with invalid ops")
    ap.add_argument("--refresh-schema", action="store_true", help="re-dump the ops schema cache")
    ap.add_argument("--model", default="sonnet", help="claude model alias (default: sonnet)")
    ap.add_argument("--timeout", type=int, default=300, help="per-row timeout seconds (default 300)")
    ap.add_argument("--fewshot-count", type=int, default=3, help="number of few-shot examples")
    return ap.parse_args()


def needs_processing(row: dict, schema_names: set[str], retry_invalid: bool) -> bool:
    raw = row.get("operation_spec", "").strip()
    if not raw:
        return True
    if retry_invalid:
        try:
            parsed = json.loads(raw)
        except Exception:
            return True
        ok, _ = validate_ops(parsed, schema_names) if isinstance(parsed, dict) else (False, "")
        return not ok
    return False


def main() -> int:
    args = parse_args()
    if args.refresh_schema:
        log("refreshing ops schema cache …")
        refresh_schema_cache()
    schema = load_schema()
    schema_names = schema_op_names(schema)
    few_shots = load_few_shots(args.fewshot_count)
    system_prompt = build_system_prompt(schema, few_shots)

    if shutil.which("claude") is None and not args.dry_run:
        sys.exit("`claude` CLI not on PATH — install Claude Code first.")

    rows = load_rows()
    targets: list[tuple[int, dict]] = []
    for i, row in enumerate(rows):
        if args.chart_id and row["chart_id"] != args.chart_id:
            continue
        if not args.chart_id and not needs_processing(row, schema_names, args.retry_invalid):
            continue
        targets.append((i, row))
    if args.limit is not None:
        targets = targets[: args.limit]

    if args.dry_run:
        if not targets:
            log("nothing to process — all rows already have valid ops_spec")
            return 0
        idx, row = targets[0]
        _, _, prompt = process_row(
            row, schema, schema_names, system_prompt, args.model, args.timeout, dry_run=True
        )
        print(prompt or "")
        return 0

    total = len(targets)
    log(
        f"plan: {total} rows · concurrent={args.concurrent} model={args.model} "
        f"timeout={args.timeout}s fewshots={len(few_shots)}"
    )
    if not total:
        log("nothing to do.")
        return 0

    completed = 0
    failed = 0
    start = time.time()

    def worker(idx: int, row: dict) -> tuple[int, str | None, str | None]:
        ops_json, err, _ = process_row(
            row, schema, schema_names, system_prompt, args.model, args.timeout, dry_run=False
        )
        return idx, ops_json, err

    with ThreadPoolExecutor(max_workers=args.concurrent) as pool:
        futures = [pool.submit(worker, idx, row) for idx, row in targets]
        for future in as_completed(futures):
            try:
                idx, ops_json, err = future.result()
            except Exception as exc:
                failed += 1
                log(f"! worker crashed: {exc}")
                continue
            with CSV_LOCK:
                row = rows[idx]
                if ops_json:
                    row["operation_spec"] = ops_json
                    row["updated_at"] = iso_now()
                    atomic_write_rows(rows)
                    completed += 1
                    log(f"✓ row #{idx + 1} {row['chart_id']} ({completed + failed}/{total})")
                else:
                    failed += 1
                    log(f"✗ row #{idx + 1} {row['chart_id']}: {err}")

    elapsed = time.time() - start
    log(
        f"done · filled {completed}/{total} · failed {failed}/{total} · "
        f"{elapsed:.1f}s ({elapsed / max(total, 1):.1f}s/row avg)"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
