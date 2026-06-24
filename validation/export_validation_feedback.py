#!/usr/bin/env python3
"""
Export validation feedback from Firestore to CSV.

Firestore paths used:
  validation-comments/{expertId}/completion/status
      -> { checked: bool, updatedAt: str }
  validation-comments/{expertId}/questions/{chartId}/sentences/{sentenceKey}
      -> { comments: [{ id, text, checked, createdAt, updatedAt }] }

Output CSV:
  One row per expert (E).
  Columns: expert_id, confirmed, confirmed_at, q1_feedback, q2_feedback, ...
  Multiple comments in one cell are separated by " --- ".

Usage:
    cd validation/
    python3 export_validation_feedback.py
    python3 export_validation_feedback.py output.csv
"""

import json
import csv
import sys
import os
import ssl
import time
import urllib.request
import urllib.error
import urllib.parse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COLLECTION = 'validation-comments'


def load_json(filename):
    with open(os.path.join(SCRIPT_DIR, filename), encoding='utf-8') as f:
        return json.load(f)


def build_firestore_base(project_id, database_id):
    return (
        f"https://firestore.googleapis.com/v1"
        f"/projects/{project_id}/databases/{database_id}/documents"
    )


def encode_seg(s):
    return urllib.parse.quote(str(s), safe='')


def firestore_get(base_url, api_key, path_segments):
    """GET a Firestore document. Returns raw JSON dict or None on 404."""
    path = '/'.join(encode_seg(s) for s in path_segments)
    url = f"{base_url}/{path}?key={encode_seg(api_key)}"
    # macOS Python 3.10 often fails SSL cert verification without certifi installed.
    # We use unverified context since this is a read-only research export.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(
            f"Firestore GET /{'/'.join(path_segments)} -> HTTP {e.code}: {body}"
        ) from e


def decode_value(v):
    if not v:
        return None
    if 'stringValue'    in v: return v['stringValue']
    if 'integerValue'   in v: return int(v['integerValue'])
    if 'doubleValue'    in v: return v['doubleValue']
    if 'booleanValue'   in v: return v['booleanValue']
    if 'timestampValue' in v: return str(v['timestampValue'])
    if 'mapValue'       in v: return decode_fields(v['mapValue'].get('fields', {}))
    if 'arrayValue'     in v: return [decode_value(i) for i in v['arrayValue'].get('values', [])]
    return None


def decode_fields(fields):
    return {k: decode_value(v) for k, v in (fields or {}).items()}


def get_doc(base_url, api_key, path_segments):
    raw = firestore_get(base_url, api_key, path_segments)
    if raw is None:
        return None
    return decode_fields(raw.get('fields', {}))


def get_completion(base_url, api_key, expert_id):
    return get_doc(base_url, api_key, [COLLECTION, expert_id, 'completion', 'status'])


def get_sentence_comments(base_url, api_key, expert_id, chart_id, sentence_key):
    doc = get_doc(base_url, api_key,
                  [COLLECTION, expert_id, 'questions', chart_id, 'sentences', sentence_key])
    if not doc:
        return []
    comments = doc.get('comments', [])
    return comments if isinstance(comments, list) else []


def format_q_cell(chart_id, chart_info, comments_by_sentence):
    """
    Build the cell text for one Q column.

    Format: one line per sentence that has comments.
      [S1] comment_text --- another_comment
      [S2] yet another comment

    Lines are joined with newline inside the CSV cell.
    If only one sentence has comments, omit the [Sn] prefix.
    """
    sentence_keys = list(chart_info.get('explanation', {}).keys())
    parts = []

    for idx, sk in enumerate(sentence_keys):
        comments = comments_by_sentence.get(sk, [])
        comment_texts = []
        for c in comments:
            text = str(c.get('text', '')).strip()
            if not text:
                continue
            prefix = '[✓] ' if c.get('checked') else ''
            comment_texts.append(f"{prefix}{text}")

        if not comment_texts:
            continue

        sentence_label = f'[S{idx + 1}] ' if len(sentence_keys) > 1 else ''
        parts.append(sentence_label + ' --- '.join(comment_texts))

    return '\n'.join(parts)


def main():
    output_path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.path.join(SCRIPT_DIR, 'validation_feedback_export.csv')
    )

    config = load_json('config.json')
    api_key     = config.get('API_KEY')    or config.get('apiKey', '')
    project_id  = config.get('PROJECT_ID') or config.get('projectId', '')
    database_id = config.get('DATABASE_ID') or config.get('databaseId', '(default)')

    if not api_key or not project_id:
        sys.exit('ERROR: Missing API_KEY or PROJECT_ID in config.json')

    base_url = build_firestore_base(project_id, database_id)
    chart_map = load_json('chart_map.json')

    # Determine the maximum number of Qs any expert has
    max_q = max((len(charts) for charts in chart_map.values()), default=0)
    q_columns = [f'q{i + 1}_feedback' for i in range(max_q)]
    fieldnames = ['expert_id', 'confirmed', 'confirmed_at'] + q_columns

    rows = []

    for expert_id, charts in chart_map.items():
        print(f'  {expert_id}: fetching completion...', end='', flush=True)

        row = {'expert_id': expert_id}

        # -- Completion / confirm --
        completion = get_completion(base_url, api_key, expert_id)
        if completion and completion.get('checked'):
            row['confirmed']    = 'yes'
            row['confirmed_at'] = completion.get('updatedAt', '')
        else:
            row['confirmed']    = 'no'
            row['confirmed_at'] = ''

        print(f' confirmed={row["confirmed"]}', end='', flush=True)

        # -- Per-Q feedback --
        chart_items = list(charts.items())

        for col_idx in range(max_q):
            col_name = f'q{col_idx + 1}_feedback'

            if col_idx >= len(chart_items):
                row[col_name] = ''
                continue

            chart_id, chart_info = chart_items[col_idx]
            sentence_keys = list(chart_info.get('explanation', {}).keys())

            comments_by_sentence = {}
            for sk in sentence_keys:
                comments_by_sentence[sk] = get_sentence_comments(
                    base_url, api_key, expert_id, chart_id, sk
                )
                time.sleep(0.05)  # gentle rate limiting

            row[col_name] = format_q_cell(chart_id, chart_info, comments_by_sentence)

        rows.append(row)
        print(f'  done ({len(chart_items)} charts)')

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'\nSaved to: {output_path}')
    print(f'  {len(rows)} experts x up to {max_q} Q columns')


if __name__ == '__main__':
    main()
