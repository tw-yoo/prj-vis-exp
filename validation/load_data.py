import csv
import re
import glob
import os
import argparse

# ── Configuration ─────────────────────────────────────────────────────────────

DEFAULT_CHART_ID  = "bkemtvekxtnuk8bf"      # chart ID (filename without .csv)
DEFAULT_DIRECTORY = "e10/e10_q10.js"        # path relative to validation/data/

parser = argparse.ArgumentParser(
    description="Update a validation JS file's data_rows block from a ChartQA CSV."
)
parser.add_argument(
    "chart_id",
    nargs="?",
    default=DEFAULT_CHART_ID,
    help="Chart ID / CSV filename without .csv. Defaults to the hard-coded value.",
)
parser.add_argument(
    "directory",
    nargs="?",
    default=DEFAULT_DIRECTORY,
    help="Path to the JS file relative to validation/data/. Defaults to the hard-coded value.",
)
args = parser.parse_args()

chart_id = args.chart_id
directory = args.directory

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
CHARTQA_DIR  = os.path.join(SCRIPT_DIR, '..', 'ChartQA', 'data', 'csv')
JS_PATH      = os.path.join(SCRIPT_DIR, 'data', directory)

# ── Find CSV ──────────────────────────────────────────────────────────────────

matches = glob.glob(os.path.join(CHARTQA_DIR, '**', f'{chart_id}.csv'), recursive=True)
if not matches:
    raise FileNotFoundError(f"CSV not found for chart_id='{chart_id}' under {CHARTQA_DIR}")
csv_path = matches[0]
print(f"Found: {csv_path}")

# ── Read CSV ──────────────────────────────────────────────────────────────────

with open(csv_path, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    headers = next(reader)
    rows = list(reader)

n_cols = len(headers)
if n_cols not in (2, 3):
    raise ValueError(f"Expected 2 or 3 columns, got {n_cols}: {headers}")

# ── JS helpers ────────────────────────────────────────────────────────────────

_IDENT_RE = re.compile(r'^[a-zA-Z_$][a-zA-Z0-9_$]*$')

def js_key(name):
    """Bare identifier if valid JS, otherwise single-quoted."""
    return name if _IDENT_RE.match(name) else f"'{name}'"

def js_value(v):
    """Number literal if parseable, otherwise single-quoted string."""
    v = v.strip()
    try:
        num = float(v)
        # emit integer when there is no fractional part
        return str(int(num)) if num == int(num) else repr(num)
    except ValueError:
        escaped = v.replace('\\', '\\\\').replace("'", "\\'")
        return f"'{escaped}'"

# ── Build new data_rows block ─────────────────────────────────────────────────

keys = [js_key(h) for h in headers]

lines = ['export const data_rows = [']
for i, row in enumerate(rows):
    if len(row) < n_cols:
        continue  # skip malformed rows
    parts = ', '.join(f'{keys[j]}: {js_value(row[j])}' for j in range(n_cols))
    comma = '' if i == len(rows) - 1 else ','
    lines.append(f'    {{ {parts} }}{comma}')
lines.append('];')

new_data_rows = '\n'.join(lines)

# ── Update JS file ────────────────────────────────────────────────────────────

with open(JS_PATH, encoding='utf-8') as f:
    source = f.read()

# 1. Replace data_rows block
source, n = re.subn(
    r'export const data_rows = \[[\s\S]*?\];',
    new_data_rows,
    source,
    count=1,
)
if n == 0:
    raise RuntimeError("Could not find 'export const data_rows = [...]' in the JS file.")

# 2. Update field variables inside renderValidation*Chart
#    Matches:  const xField = '...' (single or double quotes)
def replace_field(src, var_name, new_val):
    pattern = rf"(const {var_name}\s*=\s*)['\"][^'\"]*['\"]"
    result, n = re.subn(pattern, rf"\g<1>'{new_val}'", src, count=1)
    if n == 0:
        print(f"  ⚠  '{var_name}' not found — skipped")
    return result

if n_cols == 2:
    x_col, y_col = headers
    source = replace_field(source, 'xField', x_col)
    source = replace_field(source, 'yField', y_col)
else:
    x_col, series_col, y_col = headers
    source = replace_field(source, 'xField',     x_col)
    source = replace_field(source, 'seriesField', series_col)
    source = replace_field(source, 'yField',      y_col)

with open(JS_PATH, 'w', encoding='utf-8') as f:
    f.write(source)

# ── Summary ───────────────────────────────────────────────────────────────────

print(f"✓ Updated: {JS_PATH}")
print(f"  columns : {headers}")
print(f"  rows    : {len(rows)}")
if n_cols == 2:
    print(f"  xField='{x_col}'  yField='{y_col}'")
else:
    print(f"  xField='{x_col}'  seriesField='{series_col}'  yField='{y_col}'")
