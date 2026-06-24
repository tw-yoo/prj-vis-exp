#!/usr/bin/env python3
"""Export Firestore evaluation responses to tidy CSVs for analysis.

Each participant's full study state is saved as one Firestore document at
`evaluation_responses/{CODE}` (project `prj-vis-exp`). Because every participant
sees a different (system x chart) subset in a different randomized order, this
script normalizes everyone onto the same schema and writes three tidy tables:

  trials.csv               one row per (participant x chart)   ~20/participant
  post_session.csv         one row per (participant x system)   4/participant
  participants_summary.csv one row per participant              (QA/completion)

Access mirrors the web app: the public Firestore REST API + the API key from
evaluation/config.json (no firebase-admin, no service account, stdlib only).

Usage:
  python scripts/eval_export_responses.py                 # hardcoded ID list
  python scripts/eval_export_responses.py --all           # every document
  python scripts/eval_export_responses.py --ids ABC123,DEF456
  python scripts/eval_export_responses.py --out-dir evaluation/analysis
"""
from __future__ import annotations

import argparse
import csv
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "evaluation" / "config.json"
CHART_GROUP = ROOT / "evaluation" / "chart_group.json"
DEFAULT_OUT_DIR = ROOT / "evaluation" / "analysis"

HOST = "https://firestore.googleapis.com/v1"
COLLECTION = "evaluation_responses"

# Hardcoded participant codes -- a default run fetches ONLY these. Edit freely.
# (Seeded from evaluation/participants.json; --all ignores this list.)
PARTICIPANT_IDS = [
    "PILOT1", "PILOT2", "PILOT3", "PILOT4",
]

# Preferred column order for the dynamic rating / post-session blocks. Any keys
# seen in the data but missing here are appended afterwards (sorted), so a survey
# change never silently drops a column.
RATING_KEYS = ["reasoning-easy", "derivation-clear", "usefulness"]
POST_KEYS = [
    "trust", "usefulness", "transparency",
    "tlx-mental", "tlx-temporal", "tlx-performance", "tlx-effort",
    "open-feedback",
]


# ---- Firestore REST (mirrors src/evaluation/firestore.ts) -------------------

def decode_value(value):
    """Decode one Firestore typed value into a plain Python value."""
    if not value:
        return None
    if "stringValue" in value:
        return value["stringValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return value["doubleValue"]
    if "booleanValue" in value:
        return value["booleanValue"]
    if "timestampValue" in value:
        return str(value["timestampValue"])
    if "mapValue" in value:
        return decode_fields(value["mapValue"].get("fields", {}))
    if "arrayValue" in value:
        return [decode_value(v) for v in value["arrayValue"].get("values", [])]
    return None


def decode_fields(fields):
    return {k: decode_value(v) for k, v in (fields or {}).items()}


def _ssl_context():
    """Use certifi's CA bundle if present (python.org builds ship no system CAs)."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


_SSL = _ssl_context()


def http_get(url):
    """GET JSON; return parsed body, or None on HTTP 404."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, context=_SSL) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        body = err.read().decode("utf-8", "replace")
        raise SystemExit(f"Firestore GET failed ({err.code}): {body}")


def doc_base(project_id, database_id):
    return f"{HOST}/projects/{project_id}/databases/{database_id}/documents"


def fetch_doc(base, code, api_key):
    """Fetch one participant document's decoded fields, or None if absent."""
    path = f"{base}/{COLLECTION}/{urllib.parse.quote(code)}"
    url = f"{path}?key={urllib.parse.quote(api_key)}"
    doc = http_get(url)
    if not doc:
        return None
    return decode_fields(doc.get("fields", {}))


def fetch_all_docs(base, api_key):
    """List+fetch every document in the collection (paginated). -> {code: fields}."""
    out = {}
    page_token = None
    while True:
        params = {"key": api_key, "pageSize": "300"}
        if page_token:
            params["pageToken"] = page_token
        url = f"{base}/{COLLECTION}?{urllib.parse.urlencode(params)}"
        body = http_get(url) or {}
        for doc in body.get("documents", []):
            if "fields" not in doc:
                continue  # empty document
            code = doc.get("name", "").rsplit("/", 1)[-1]
            out[code] = decode_fields(doc["fields"])
        page_token = body.get("nextPageToken")
        if not page_token:
            return out


# ---- Helpers ----------------------------------------------------------------

def to_num(value):
    """Coerce numeric-looking values to int/float; '' -> None; else unchanged."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return value
    s = str(value)
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return s


def ordered_keys(seen, preferred):
    """preferred keys first (only those seen), then any extras sorted."""
    cols = [k for k in preferred if k in seen]
    cols += sorted(k for k in seen if k not in preferred)
    return cols


def load_chart_index(path):
    """chart_id -> {group, chart_type, question, answer, correctAnswer, answerIsCorrect}."""
    data = json.loads(path.read_text(encoding="utf-8"))
    index = {}
    for group, charts in data.items():
        for chart_type, entry in charts.items():
            index[entry["id"]] = {
                "group": group,
                "chart_type": chart_type,
                "question": entry.get("question", ""),
                "answer": entry.get("answer", ""),
                "correct_answer": entry.get("correctAnswer", entry.get("answer", "")),
                "answer_is_correct": entry.get("answerIsCorrect", True),
            }
    return index


# ---- Row building -----------------------------------------------------------

def build_rows(code, fields, chart_index, warns):
    """Return (trial_rows, post_rows, summary_row) for one participant document."""
    order = fields.get("order") or {}
    order_system = order.get("system", "")
    order_chart = order.get("chart", "")
    systems_map = fields.get("systems") or {}          # label (A/B/C/D) -> system
    system_to_label = {v: k for k, v in systems_map.items()}
    sequence = fields.get("sequence") or []
    charts = fields.get("charts") or {}
    post_session = fields.get("postSession") or {}
    final = fields.get("final") or {}
    updated_at = fields.get("updatedAt", "")

    trial_rows = []
    answered = 0
    for order_index, item in enumerate(sequence):
        chart_id = item.get("chart_id", "")
        system = item.get("system", "")
        group = item.get("group", "")
        resp = charts.get(chart_id) or {}
        meta = chart_index.get(chart_id)
        if meta is None:
            warns.append(f"{code}: chart_id {chart_id!r} not in chart_group.json")
            meta = {}

        answer_correct = resp.get("answerCorrect", "")
        answer_is_correct = resp.get("answerIsCorrect", meta.get("answer_is_correct"))
        judged_correctly = ""
        if answer_correct in ("Yes", "No") and isinstance(answer_is_correct, bool):
            judged_correctly = (answer_correct == "Yes") == answer_is_correct
        if answer_correct:
            answered += 1

        ratings = resp.get("ratings") or {}
        row = {
            "participant_code": code,
            "order_system": order_system,
            "order_chart": order_chart,
            "order_index": order_index,
            "system": system,
            "system_label": system_to_label.get(system, ""),
            "method": _method(system),
            "group": group,
            "chart_id": chart_id,
            "chart_type": meta.get("chart_type", ""),
            "question": meta.get("question", ""),
            "answer_shown": resp.get("answerShown", meta.get("answer", "")),
            "answer_is_correct": answer_is_correct,
            "correct_answer": resp.get("correctAnswer", meta.get("correct_answer", "")),
            "participant_answer_correct": answer_correct,
            "judged_correctly": judged_correctly,
            "first_error_chunk_index": resp.get("firstErrorChunkIndex"),
            "error_description": resp.get("errorDescription", ""),
            "response_time_ms": resp.get("responseTimeMs"),
            "updated_at": updated_at,
            "_ratings": {k: to_num(v) for k, v in ratings.items()},
        }
        trial_rows.append(row)

    post_rows = []
    for system, answers in post_session.items():
        post_rows.append({
            "participant_code": code,
            "order_system": order_system,
            "order_chart": order_chart,
            "system": system,
            "system_label": system_to_label.get(system, ""),
            "_post": {k: to_num(v) for k, v in (answers or {}).items()},
        })

    summary_row = {
        "participant_code": code,
        "has_document": True,
        "order_system": order_system,
        "order_chart": order_chart,
        "systems_A": systems_map.get("A", ""),
        "systems_B": systems_map.get("B", ""),
        "systems_C": systems_map.get("C", ""),
        "systems_D": systems_map.get("D", ""),
        "n_trials_total": len(sequence),
        "n_trials_answered": answered,
        "n_postsession_systems_done": len(post_session),
        "final_comment": final.get("comment", ""),
        "updated_at": updated_at,
    }
    return trial_rows, post_rows, summary_row


def _method(system):
    return {"Ours": "ours", "B1": "b1", "B2": "b2", "B3": "b3"}.get(system, "")


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ---- Main -------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="fetch every document in the collection")
    ap.add_argument("--ids", default="", help="comma-separated codes (overrides the hardcoded list)")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="output directory")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    api_key = cfg.get("API_KEY") or cfg.get("apiKey", "")
    project_id = cfg.get("PROJECT_ID") or cfg.get("projectId", "")
    database_id = cfg.get("DATABASE_ID") or cfg.get("databaseId", "(default)")
    if not api_key or not project_id:
        raise SystemExit(f"Missing API_KEY / PROJECT_ID in {CONFIG}")
    base = doc_base(project_id, database_id)

    chart_index = load_chart_index(CHART_GROUP)

    # Resolve which participants to fetch -> docs: {code: fields|None}.
    docs = {}
    if args.all:
        docs = fetch_all_docs(base, api_key)
        print(f"--all: {len(docs)} documents in {COLLECTION}")
    else:
        codes = [c.strip().upper() for c in args.ids.split(",") if c.strip()] or list(PARTICIPANT_IDS)
        for code in codes:
            docs[code] = fetch_doc(base, code, api_key)

    trial_rows, post_rows, summary_rows, warns = [], [], [], []
    rating_keys_seen, post_keys_seen = set(), set()

    for code in sorted(docs):
        fields = docs[code]
        if not fields:
            print(f"warning: no document for {code}", file=sys.stderr)
            summary_rows.append({"participant_code": code, "has_document": False})
            continue
        t_rows, p_rows, s_row = build_rows(code, fields, chart_index, warns)
        for r in t_rows:
            rating_keys_seen.update(r["_ratings"])
        for r in p_rows:
            post_keys_seen.update(r["_post"])
        trial_rows.extend(t_rows)
        post_rows.extend(p_rows)
        summary_rows.append(s_row)

    for w in warns:
        print(f"warning: {w}", file=sys.stderr)

    # Flatten the dynamic rating / post blocks into prefixed columns.
    rating_cols = ordered_keys(rating_keys_seen, RATING_KEYS)
    post_cols = ordered_keys(post_keys_seen, POST_KEYS)
    for r in trial_rows:
        ratings = r.pop("_ratings")
        for k in rating_cols:
            r[f"rating_{k.replace('-', '_')}"] = ratings.get(k)
    for r in post_rows:
        answers = r.pop("_post")
        for k in post_cols:
            r[f"ps_{k.replace('-', '_')}"] = answers.get(k)

    trial_fields = [
        "participant_code", "order_system", "order_chart", "order_index",
        "system", "system_label", "method", "group", "chart_id", "chart_type",
        "question", "answer_shown", "answer_is_correct", "correct_answer",
        "participant_answer_correct", "judged_correctly", "first_error_chunk_index",
        "error_description", "response_time_ms", "updated_at",
    ]
    trial_fields += [f"rating_{k.replace('-', '_')}" for k in rating_cols]

    post_fields = [
        "participant_code", "order_system", "order_chart", "system", "system_label",
    ] + [f"ps_{k.replace('-', '_')}" for k in post_cols]

    summary_fields = [
        "participant_code", "has_document", "order_system", "order_chart",
        "systems_A", "systems_B", "systems_C", "systems_D",
        "n_trials_total", "n_trials_answered", "n_postsession_systems_done",
        "final_comment", "updated_at",
    ]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(out_dir / "trials.csv", trial_fields, trial_rows)
    write_csv(out_dir / "post_session.csv", post_fields, post_rows)
    write_csv(out_dir / "participants_summary.csv", summary_fields, summary_rows)

    n_with_doc = sum(1 for s in summary_rows if s.get("has_document"))
    print(
        f"OK: {n_with_doc} participants with data, "
        f"{len(trial_rows)} trial rows, {len(post_rows)} post-session rows -> {out_dir}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
