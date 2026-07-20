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

A default run (no args) exports the 16 real-participant combos SO1CO1..SO4CO4.
To keep Firestore I/O minimal it fetches them with a SINGLE `:batchGet` request,
which returns every requested document's found/missing status together with its
data — so we learn exactly what exists and pull only what we asked for, in one
round trip (no per-id probing, no listing the whole collection).

Interviews (--interviews): pulls the participant interview transcript + margin
NOTES (Google Docs comments) from the study's Google Doc and writes
`interview_notes.csv` (one row per note, with the script text it is anchored to)
plus `interview_transcript.txt`. This path needs Google API access — see the
one-time setup at the bottom of this docstring; it lazily imports the Google
client libraries, so the Firestore export above stays dependency-free.

Usage:
  python evaluation/analysis/eval_export_responses.py                 # 16 SOxCOy combos (1 batchGet)
  python evaluation/analysis/eval_export_responses.py --all           # every document (list)
  python evaluation/analysis/eval_export_responses.py --ids ABC123    # those ids (1 batchGet)
  python evaluation/analysis/eval_export_responses.py --interviews    # Google-Doc interview notes
  python evaluation/analysis/eval_export_responses.py --out-dir some/dir

The interview Doc is organised into tabs "P1".."P6" (one Google-Docs tab per
participant). Each note is tagged with the tab it is anchored in, so the CSV's
`participant` column tells you whose interview a note belongs to.

Google API setup for --interviews (one-time). Do EITHER option, then
  pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib

Common step (both options): Cloud Console (project `prj-vis-exp`, the same one
Firebase uses) → APIs & Services → Library → enable "Google Docs API" AND
"Google Drive API".

Option A — Service account (simplest; NO consent screen, NO browser):
  1. APIs & Services → Credentials → Create credentials → "Service account" →
     give it any name → Done.
  2. Click the new service account → "Keys" tab → Add key → Create new key →
     JSON → download.
  3. Save it as evaluation/analysis/google_service_account.json (gitignored).
  4. Open the interview Doc → Share → add the service account's email
     (…@prj-vis-exp.iam.gserviceaccount.com, shown on the Credentials page) as
     Viewer. That is what grants it read access.
  5. Run with --interviews. No browser, no token to refresh.

Option B — OAuth (your own Google account; opens a browser once):
  1. The "OAuth consent screen" now lives under APIs & Services → "OAuth consent
     screen", which redirects to the newer "Google Auth Platform" pages (direct:
     console.cloud.google.com/auth/overview?project=prj-vis-exp). If it is not
     set up yet, click "Get started": App name + your email → Audience "External"
     → contact email → Create. Then under "Audience", add your own Google account
     under "Test users". (Tip: the fastest way to reach it is the Console top
     search bar — type "OAuth consent screen".)
  2. APIs & Services → Credentials → Create credentials → OAuth client ID →
     Application type "Desktop app" → download the JSON.
  3. Save it as evaluation/analysis/google_oauth_client.json (gitignored).
  4. Run with --interviews: a browser opens once for consent; the token is cached
     at evaluation/analysis/.google_token.json (gitignored) and reused. (In
     "Testing" publishing status the refresh token expires ~weekly, so you may
     re-consent occasionally — Option A avoids this.) You must have at least view
     access to the Doc with the account you consent as.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ANALYSIS_DIR = Path(__file__).resolve().parent  # evaluation/analysis (this dir)
ROOT = ANALYSIS_DIR.parents[1]  # analysis -> evaluation -> repo root
CONFIG = ROOT / "evaluation" / "config.json"
CHART_GROUP = ROOT / "evaluation" / "chart_group.json"
DEFAULT_OUT_DIR = ANALYSIS_DIR

HOST = "https://firestore.googleapis.com/v1"
COLLECTION = "evaluation_responses"

# Default run (no args): the 16 real-participant combos SO1CO1 .. SO4CO4 — the
# full system-order x chart-order counterbalancing grid (see participants.json).
# --all ignores this list; --ids overrides it.
SOXCOY_IDS = [f"SO{s}CO{c}" for s in range(1, 5) for c in range(1, 5)]

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


def http_post(url, body):
    """POST JSON, return the parsed response."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, context=_SSL) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")
        raise SystemExit(f"Firestore POST failed ({err.code}): {detail}")


def fetch_docs_batch(base, name_prefix, codes, api_key):
    """Fetch exactly the requested codes with a single `:batchGet` per chunk.

    Returns {code: fields|None} for EVERY requested code — the batchGet response
    reports each document as `found` (with data) or `missing`, so we learn what
    exists AND pull only those, in one round trip. No per-id GETs, no listing the
    whole collection.
    """
    out = {c: None for c in codes}
    url = f"{base}:batchGet?key={urllib.parse.quote(api_key)}"
    chunk_size = 100  # batchGet handles far more, but stay well under any cap
    for start in range(0, len(codes), chunk_size):
        chunk = codes[start:start + chunk_size]
        names = [f"{name_prefix}/{COLLECTION}/{urllib.parse.quote(c)}" for c in chunk]
        for entry in http_post(url, {"documents": names}) or []:
            doc = entry.get("found")
            if not doc:
                continue  # `missing` entries stay None
            code = doc.get("name", "").rsplit("/", 1)[-1]
            if code in out:
                out[code] = decode_fields(doc.get("fields", {}))
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


# ---- Interview transcript + notes (Google Docs / Drive) ---------------------
#
# The study's interview Google Doc: participant transcripts, with the notes the
# participants gave surfaced as Google Docs *comments* (margin notes anchored to
# a span of the script). We read the transcript via the Docs API and the
# comments via the Drive API, then write one CSV row per comment (with the
# anchored script snippet + the nearest heading, so each note keeps its context).
INTERVIEW_DOC_ID = "1f7yiGMFqLLgGewnp5rDoXh0KI5Qx3fOA3TlsMYPnaWg"
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]
OAUTH_CLIENT = ANALYSIS_DIR / "google_oauth_client.json"
OAUTH_TOKEN = ANALYSIS_DIR / ".google_token.json"
# Simplest auth: a service-account key. Drop it here and SHARE the interview Doc
# with the service account's email (…@prj-vis-exp.iam.gserviceaccount.com) as
# Viewer — no OAuth consent screen, no browser step. Used in preference to OAuth
# when present.
SERVICE_ACCOUNT_KEY = ANALYSIS_DIR / "google_service_account.json"

_GOOGLE_LIBS_HINT = (
    "The --interviews export needs the Google client libraries. Install them:\n"
    "  pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib"
)


def google_credentials():
    """A service-account key (SERVICE_ACCOUNT_KEY) if present — no browser, no
    consent screen; just share the Doc with the SA email. Otherwise the OAuth
    installed-app flow, caching/refreshing the token at OAUTH_TOKEN."""
    if SERVICE_ACCOUNT_KEY.exists():
        try:
            from google.oauth2 import service_account
        except ImportError:
            raise SystemExit(_GOOGLE_LIBS_HINT)
        return service_account.Credentials.from_service_account_file(
            str(SERVICE_ACCOUNT_KEY), scopes=GOOGLE_SCOPES
        )

    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        raise SystemExit(_GOOGLE_LIBS_HINT)

    creds = None
    if OAUTH_TOKEN.exists():
        creds = Credentials.from_authorized_user_file(str(OAUTH_TOKEN), GOOGLE_SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not OAUTH_CLIENT.exists():
                raise SystemExit(
                    f"Missing OAuth client file: {OAUTH_CLIENT}\n"
                    "Download a 'Desktop app' OAuth client JSON from Google Cloud Console\n"
                    "(project prj-vis-exp) and save it there. See the setup notes in this file's docstring."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(OAUTH_CLIENT), GOOGLE_SCOPES)
            creds = flow.run_local_server(port=0)
        OAUTH_TOKEN.write_text(creds.to_json(), encoding="utf-8")
    return creds


def _paragraphs_plaintext_and_headings(content):
    """(plain_text, [(char_index, heading_text)]) for a list of structural
    elements (a doc body or a tab's documentTab body). char_index is the offset
    of each heading paragraph in plain_text, so a note's snippet can be mapped
    to its nearest sub-heading."""
    text_parts, headings, length = [], [], 0
    for element in content or []:
        para = element.get("paragraph")
        if not para:
            continue
        style = (para.get("paragraphStyle") or {}).get("namedStyleType", "")
        para_text = "".join(
            (pe.get("textRun") or {}).get("content", "") for pe in para.get("elements", [])
        )
        if (style.startswith("HEADING") or style == "TITLE") and para_text.strip():
            headings.append((length, para_text.strip()))
        text_parts.append(para_text)
        length += len(para_text)
    return "".join(text_parts), headings


def _iter_tabs(tabs):
    """Depth-first over tabs, including nested child tabs."""
    for tab in tabs or []:
        yield tab
        yield from _iter_tabs(tab.get("childTabs", []))


def parse_tabs(doc):
    """Return [(tab_title, plain_text, headings)] — one entry per tab (P1..P6).
    Falls back to a single unnamed section for a doc that has no tabs."""
    sections = []
    for tab in _iter_tabs(doc.get("tabs", [])):
        title = (tab.get("tabProperties") or {}).get("title", "")
        body = (tab.get("documentTab") or {}).get("body", {}) or {}
        plain, headings = _paragraphs_plaintext_and_headings(body.get("content", []))
        sections.append((title, plain, headings))
    if not sections:  # doc predates tabs (or includeTabsContent unsupported)
        plain, headings = _paragraphs_plaintext_and_headings(doc.get("body", {}).get("content", []))
        sections.append(("", plain, headings))
    return sections


def _heading_before(headings, idx):
    section = ""
    for char_index, heading in headings:
        if char_index <= idx:
            section = heading
        else:
            break
    return section


def locate_note(sections, quoted):
    """Which tab (participant) + sub-heading a note's anchored snippet lives in.
    Returns (participant, section, sort_key). Matched by finding the snippet's
    text inside each tab, so it works regardless of the opaque comment anchor."""
    quoted = (quoted or "").strip()
    for tab_index, (title, plain, headings) in enumerate(sections):
        idx = plain.find(quoted) if quoted else -1
        if idx < 0 and quoted:  # snippet may cross paragraph breaks — try line 1
            first = quoted.splitlines()[0].strip()
            idx = plain.find(first) if first else -1
        if idx >= 0:
            return title, _heading_before(headings, idx), (tab_index, idx)
    return "", "", (len(sections), 1 << 30)


def export_interviews(out_dir):
    """Write interview_notes.csv (one row per Google-Docs comment, tagged with the
    participant tab P1..P6 it is anchored in) + interview_transcript.txt."""
    try:
        from googleapiclient.discovery import build
    except ImportError:
        raise SystemExit(_GOOGLE_LIBS_HINT)

    creds = google_credentials()
    docs_api = build("docs", "v1", credentials=creds, cache_discovery=False)
    drive_api = build("drive", "v3", credentials=creds, cache_discovery=False)

    # includeTabsContent=True returns EVERY tab (P1..P6); without it the Docs API
    # only returns the first tab's content.
    doc = docs_api.documents().get(documentId=INTERVIEW_DOC_ID, includeTabsContent=True).execute()
    title = doc.get("title", "")
    sections = parse_tabs(doc)

    comments, page_token = [], None
    fields = (
        "nextPageToken,comments(id,author/displayName,content,createdTime,"
        "modifiedTime,resolved,quotedFileContent/value,"
        "replies(author/displayName,content,createdTime))"
    )
    while True:
        resp = (
            drive_api.comments()
            .list(fileId=INTERVIEW_DOC_ID, pageSize=100, fields=fields, pageToken=page_token)
            .execute()
        )
        comments.extend(resp.get("comments", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    rows = []
    for c in comments:
        # Drive returns the anchored snippet HTML-escaped (&quot; &#39; …); the Docs
        # body has the raw characters, so unescape before matching or the note
        # won't locate to its tab.
        quoted = html.unescape((c.get("quotedFileContent") or {}).get("value", ""))
        participant, section, sort_key = locate_note(sections, quoted)
        replies = " || ".join(
            f"{(r.get('author') or {}).get('displayName', '')}: {r.get('content', '')}"
            for r in c.get("replies", [])
        )
        rows.append({
            "_sort": sort_key,
            "participant": participant,
            "section": section,
            "quoted_text": (quoted or "").strip(),
            "note": (c.get("content") or "").strip(),
            "author": (c.get("author") or {}).get("displayName", ""),
            "created_time": c.get("createdTime", ""),
            "modified_time": c.get("modifiedTime", ""),
            "resolved": c.get("resolved", False),
            "replies": replies,
        })
    rows.sort(key=lambda r: r["_sort"])
    for r in rows:
        r.pop("_sort", None)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fieldnames = ["participant", "section", "quoted_text", "note", "author",
                  "created_time", "modified_time", "resolved", "replies"]
    write_csv(out_dir / "interview_notes.csv", fieldnames, rows)
    transcript = "\n\n".join(
        f"===== {t or '(untitled tab)'} =====\n{plain}" for t, plain, _ in sections
    )
    (out_dir / "interview_transcript.txt").write_text(transcript, encoding="utf-8")
    named = [t for t, _, _ in sections if t]
    print(
        f"OK: interviews from “{title}” — {len(rows)} notes across "
        f"{len(sections)} tab(s){' (' + ', '.join(named) + ')' if named else ''} "
        f"-> {out_dir / 'interview_notes.csv'} (+ interview_transcript.txt)"
    )
    return 0


# ---- Main -------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="fetch every document in the collection")
    ap.add_argument("--ids", default="", help="comma-separated codes (overrides the hardcoded list)")
    ap.add_argument("--interviews", action="store_true",
                    help="export the Google-Doc interview transcript + notes (needs Google API setup)")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="output directory")
    args = ap.parse_args()

    if args.interviews:
        return export_interviews(args.out_dir)

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    api_key = cfg.get("API_KEY") or cfg.get("apiKey", "")
    project_id = cfg.get("PROJECT_ID") or cfg.get("projectId", "")
    database_id = cfg.get("DATABASE_ID") or cfg.get("databaseId", "(default)")
    if not api_key or not project_id:
        raise SystemExit(f"Missing API_KEY / PROJECT_ID in {CONFIG}")
    base = doc_base(project_id, database_id)
    name_prefix = f"projects/{project_id}/databases/{database_id}/documents"

    chart_index = load_chart_index(CHART_GROUP)

    # Resolve which participants to fetch -> docs: {code: fields|None}.
    docs = {}
    if args.all:
        docs = fetch_all_docs(base, api_key)
        print(f"--all: fetched {len(docs)} documents in {COLLECTION} (list request)")
    else:
        codes = [c.strip().upper() for c in args.ids.split(",") if c.strip()] or list(SOXCOY_IDS)
        # ONE batchGet: existence check + data fetch for exactly these codes.
        docs = fetch_docs_batch(base, name_prefix, codes, api_key)
        present = sorted(c for c in codes if docs.get(c))
        missing = sorted(c for c in codes if not docs.get(c))
        print(f"batchGet: {len(present)}/{len(codes)} present, {len(missing)} missing (1 request)")
        if present:
            print(f"  present: {', '.join(present)}")
        if missing:
            print(f"  missing: {', '.join(missing)}")

    trial_rows, post_rows, summary_rows, warns = [], [], [], []
    rating_keys_seen, post_keys_seen = set(), set()

    for code in sorted(docs):
        fields = docs[code]
        if not fields:
            # Absent participant (existence already reported above): still emit a
            # has_document=False summary row so the roster shows who's outstanding.
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
