#!/usr/bin/env python3
"""Download evaluation_responses/{SOxCOy} documents as raw JSON.

Fetches the 16 real-participant documents (SO1CO1 .. SO4CO4 — the full
system-order x chart-order counterbalancing grid; see evaluation/participants.json)
from Firestore collection `evaluation_responses` (project `prj-vis-exp`) and
writes each one's decoded fields as its own pretty-printed JSON file, plus one
combined JSON with everything.

Access mirrors the web app: the public Firestore REST API + the API key from
evaluation/config.json (no firebase-admin, no service account, stdlib only).

Usage:
  python scripts/eval_download_responses_json.py                  # all 16 SOxCOy
  python scripts/eval_download_responses_json.py --all            # every document in the collection
  python scripts/eval_download_responses_json.py --ids SO1CO1,SO2CO3
  python scripts/eval_download_responses_json.py --out-dir evaluation/analysis/raw
  python scripts/eval_download_responses_json.py --combined-only  # skip per-participant files
"""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "evaluation" / "config.json"
DEFAULT_OUT_DIR = ROOT / "evaluation" / "analysis" / "raw"

HOST = "https://firestore.googleapis.com/v1"
COLLECTION = "evaluation_responses"

# The 16-combination SOx CO y counterbalancing grid (see evaluation/participants.json).
SOXCOY_IDS = [f"SO{s}CO{c}" for s in range(1, 5) for c in range(1, 5)]


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


# ---- Main -------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="fetch every document in the collection (not just SOxCOy)")
    ap.add_argument("--ids", default="", help="comma-separated codes (overrides the default SO1CO1..SO4CO4 list)")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="output directory")
    ap.add_argument("--combined-only", action="store_true", help="skip writing one JSON file per participant")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    api_key = cfg.get("API_KEY") or cfg.get("apiKey", "")
    project_id = cfg.get("PROJECT_ID") or cfg.get("projectId", "")
    database_id = cfg.get("DATABASE_ID") or cfg.get("databaseId", "(default)")
    if not api_key or not project_id:
        raise SystemExit(f"Missing API_KEY / PROJECT_ID in {CONFIG}")
    base = doc_base(project_id, database_id)

    docs = {}
    if args.all:
        docs = fetch_all_docs(base, api_key)
        print(f"--all: {len(docs)} documents in {COLLECTION}")
    else:
        codes = [c.strip().upper() for c in args.ids.split(",") if c.strip()] or list(SOXCOY_IDS)
        for code in codes:
            fields = fetch_doc(base, code, api_key)
            docs[code] = fields
            status = "ok" if fields else "MISSING"
            print(f"  {code}: {status}")

    found = {code: fields for code, fields in docs.items() if fields is not None}
    missing = sorted(code for code, fields in docs.items() if fields is None)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not args.combined_only:
        for code, fields in found.items():
            (out_dir / f"{code}.json").write_text(
                json.dumps(fields, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8"
            )

    combined_path = out_dir / "all_responses.json"
    combined_path.write_text(
        json.dumps(dict(sorted(found.items())), indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8"
    )

    if missing:
        print(f"warning: {len(missing)} document(s) not found: {', '.join(missing)}", file=sys.stderr)

    print(
        f"OK: {len(found)} document(s) downloaded -> {out_dir}"
        + ("" if args.combined_only else f" ({len(found)} per-participant files +)")
        + f" combined file {combined_path.name}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
