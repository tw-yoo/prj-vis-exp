#!/usr/bin/env python3
"""Prepare the evaluation/ baseline data for B1 (text) and B3 (expert).

B3 (Expert): reuse the validation/ expert explanation modules. For each of the
25 charts in data/review/evaluation.csv, the (E, Q) columns identify the
validation module validation/data/e{E}/e{E}_q{Q}.js. We copy that module
(verbatim, so its `import '../chartUtils.js'` still resolves) to
evaluation/baselines/B3/expert/<chart_id>.js, copy chartUtils.js alongside, and
emit baseline3_manifest.json mapping each chart_id to its module + ordered steps
(function name + label) taken from validation/chart_map.json's `explanation`.

B1 (Text): the simple-text baseline shows the chart + question + explanation
prose only. We populate baseline_input.json[<id>].explanation with the
evaluation.csv explanation so TextRenderer can display it.

Re-runnable: overwrites the copied modules / manifest / explanation each run.
"""
import csv, json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'data/review/evaluation.csv')
VAL = os.path.join(ROOT, 'validation')
EVAL = os.path.join(ROOT, 'evaluation')
B3 = os.path.join(EVAL, 'baselines/B3')
EXPERT_DIR = os.path.join(B3, 'expert')


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def main():
    rows = list(csv.DictReader(open(CSV, newline='')))
    chart_map = json.load(open(os.path.join(VAL, 'chart_map.json')))

    os.makedirs(EXPERT_DIR, exist_ok=True)
    # chartUtils.js sits one level above the expert modules so their
    # `import '../chartUtils.js'` resolves to baselines/B3/chartUtils.js.
    shutil.copyfile(os.path.join(VAL, 'data/chartUtils.js'), os.path.join(B3, 'chartUtils.js'))

    manifest = {}
    errors = []
    new_ids = set()
    for row in rows:
        cid = row['chart_id'].strip()
        E = row['E'].strip()
        Q = row['Q'].strip()
        explanation = row['explanation'].strip()
        eq = f"e{E}_q{Q}"
        src = os.path.join(VAL, f"data/e{E}/{eq}.js")
        if not os.path.isfile(src):
            errors.append(f"{cid}: missing validation module {src}")
            continue
        cm = chart_map.get(f"e{E}", {}).get(eq)
        if not cm or 'explanation' not in cm:
            errors.append(f"{cid}: no chart_map explanation for {eq}")
            continue
        # copy module verbatim, named by chart_id
        shutil.copyfile(src, os.path.join(EXPERT_DIR, f"{cid}.js"))
        steps = [{'fn': fn, 'text': (txt or '').strip()} for fn, txt in cm['explanation'].items()]
        manifest[cid] = {
            'expertId': eq,
            'module': f"expert/{cid}.js",
            'steps': steps,
        }
        new_ids.add(cid)

    if errors:
        print("ERRORS:")
        for e in errors:
            print("  -", e)
        raise SystemExit(1)

    # remove stale copied modules not in the new set
    for fn in os.listdir(EXPERT_DIR):
        if fn.endswith('.js') and fn[:-3] not in new_ids:
            os.remove(os.path.join(EXPERT_DIR, fn))
            print(f"  removed stale expert/{fn}")

    dump(os.path.join(B3, 'baseline3_manifest.json'), manifest)

    # ---- B1 text: populate baseline_input.json explanation -----------------
    bi_path = os.path.join(EVAL, 'baselines/baseline_input.json')
    baseline_input = json.load(open(bi_path))
    expl_by_id = {row['chart_id'].strip(): row['explanation'].strip() for row in rows}
    for cid, entry in baseline_input.items():
        if cid in expl_by_id:
            entry['explanation'] = expl_by_id[cid]
    dump(bi_path, baseline_input)

    # ---- cleanup: B1/ scene file + B3 scene file no longer used ------------
    for stale in ('B1/baseline1_result.json', 'B3/baseline3_result.json'):
        p = os.path.join(EVAL, 'baselines', stale)
        if os.path.isfile(p):
            os.remove(p)
            print(f"  removed stale baselines/{stale}")
    b1dir = os.path.join(EVAL, 'baselines/B1')
    if os.path.isdir(b1dir) and not os.listdir(b1dir):
        os.rmdir(b1dir)
        print("  removed empty baselines/B1/")

    print(f"\nOK: {len(manifest)} expert modules + manifest; baseline_input explanation populated.")
    print("Step counts per chart:")
    for cid, m in manifest.items():
        print(f"  {cid} ({m['expertId']}): {len(m['steps'])} steps")


if __name__ == '__main__':
    main()
