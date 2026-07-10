#!/usr/bin/env python3
import re, json, glob, os, csv
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))  # validation/
DATA = os.path.join(ROOT, "data")
OUT  = os.path.join(ROOT, "analysis")

# ---------- uniform transition detector (authoritative, replaces agent transition tags) ----------
def func_blocks(src):
    idxs = [(m.group(1), m.start()) for m in re.finditer(r'export function (function\d+)\s*\(', src)]
    out = {}
    for i,(n,s) in enumerate(idxs):
        e = idxs[i+1][1] if i+1 < len(idxs) else len(src)
        out[n] = src[s:e]
    return out

def detect_transitions(blk):
    t = set()
    if '.transition(' not in blk and 'attrTween' not in blk:
        return t
    if re.search(r"attr\('height',\s*0\)", blk) or re.search(r"attr\('x2',\s*0\)", blk):
        t.add('transition_grow')
    if re.search(r"attr\('opacity',\s*0\)", blk) or re.search(r"opacity',\s*0\)\s*\.remove\(\)", blk):
        t.add('transition_fade')
    if re.search(r"\.delay\(\s*\(?[^)]*\b(?:idx|i)\b[^)]*\)?\s*\*", blk) or re.search(r"\.delay\(\s*\w+\s*\*\s*\d+\s*\)", blk):
        t.add('transition_stagger')
    # morph: attrTween, or join-update geometry retween, or existing selection d/cx/cy retween
    if 'attrTween(' in blk:
        t.add('transition_morph')
    if re.search(r"\(update\)\s*=>", blk) and re.search(r"\.transition\([^)]*\)[^;]{0,200}\.attr\('(?:x|y|width|height|cx|cy|d)'", blk, re.S):
        t.add('transition_morph')
    if re.search(r"\.(?:select|selectAll)\([^)]*\)\s*\.transition\([^)]*\)[^;]{0,160}\.attr\('(?:d|cx|cy)'", blk, re.S):
        t.add('transition_morph')
    # recolor: existing selectAll(...).transition().duration(...) restyling fill/r or conditional opacity in place
    for m in re.finditer(r"\.selectAll\([^)]*\)\s*\.transition\([^)]*\)\s*\.duration\([^)]*\)\s*((?:\s*\.attr\([^;]*?)+);", blk, re.S):
        chain = m.group(1)
        if re.search(r"\.attr\('(?:fill|r)'", chain) or re.search(r"\.attr\('opacity',\s*(?:function|\()", chain):
            t.add('transition_recolor')
    return t

# build lookup: (expert, qN) -> {funcN: transitions}
trans_map = {}
raw_trans_counts = {}
for f in glob.glob(os.path.join(DATA, "e*", "e*_q*.js")):
    base = os.path.basename(f)[:-3]                       # e1_q1
    src = open(f).read()
    raw_trans_counts[base] = src.count('.transition(') + src.count('attrTween(')
    per = {}
    for n, blk in func_blocks(src).items():
        idx = int(n.replace('function',''))
        per[idx] = sorted(detect_transitions(blk))
    trans_map[base] = per

# ---------- load agent rows ----------
d = json.load(open(os.path.join(OUT, "raw", "combined_raw.json")))
rows = d["rows"]

TRANSITION_TAGS = {'transition_fade','transition_grow','transition_recolor','transition_stagger','transition_morph','transition_draw'}

norm_rows = []
for r in rows:
    static = [e for e in r["visual_effects"] if e not in TRANSITION_TAGS and not e.startswith('transition_')]
    # authoritative transitions from detector
    trans = trans_map.get(r["item_id"], {}).get(r["operation_index"], [])
    effects = static + trans
    # de-dup preserving order
    seen=set(); eff=[]
    for e in effects:
        if e not in seen:
            seen.add(e); eff.append(e)
    nr = dict(r)
    nr["visual_effects"] = eff
    norm_rows.append(nr)

# sort by expert then q then op index
def keyf(r):
    exp = int(r["item_id"].split("_")[0][1:])
    q = int(r["item_id"].split("_q")[1])
    return (exp, q, r["operation_index"])
norm_rows.sort(key=keyf)

# ---------- write CSV ----------
cols = ["expert_id","item_id","chart_type","question_summary","operation_index","operation_type","visual_effects","evidence","confidence","notes"]
csv_path = os.path.join(OUT, "strategy_catalog.csv")
with open(csv_path, "w", newline="") as fh:
    w = csv.writer(fh, quoting=csv.QUOTE_MINIMAL)
    w.writerow(cols)
    for r in norm_rows:
        w.writerow([
            r["item_id"].split("_")[0],
            r["item_id"],
            r["chart_type"],
            r["question_summary"],
            r["operation_index"],
            r["operation_type"],
            "|".join(r["visual_effects"]),
            r["evidence"],
            r["confidence"],
            r["notes"],
        ])
print("wrote", csv_path, "rows:", len(norm_rows))

# save normalized json for reporting
json.dump({"rows":norm_rows,"raw_trans_counts":raw_trans_counts}, open(os.path.join(OUT,"raw","normalized.json"),"w"), ensure_ascii=False, indent=1)

# ---------- frequencies for report ----------
eff = Counter(); eff_exp = defaultdict(set)
for r in norm_rows:
    exp = r["item_id"].split("_")[0]
    for e in r["visual_effects"]:
        eff[e]+=1; eff_exp[e].add(exp)
print("\n=== FINAL visual_effect freq ===")
for e,c in eff.most_common():
    print(f"{c:4d}  {len(eff_exp[e]):2d}ex  {e}")
print("\noperation_type:", dict(Counter(r["operation_type"] for r in norm_rows).most_common()))
print("confidence:", dict(Counter(r["confidence"] for r in norm_rows)))
print("rows/expert:", {f"e{i}":sum(1 for r in norm_rows if r['item_id'].split('_')[0]==f'e{i}') for i in range(1,11)})
