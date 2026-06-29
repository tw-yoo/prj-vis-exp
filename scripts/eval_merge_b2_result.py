#!/usr/bin/env python3
"""Merge D3 correct + wrong results into evaluation/baselines/B2/baseline2_result.json.

Logic:
  - For the 8 WRONG charts: use wrong D3 from nlp_server/baseline/d3_evaluation_wrong_result_chatgpt.json
  - For all other charts: use correct D3 from nlp_server/baseline/d3_evaluation_result_chatgpt.json
  - Charts missing in either source are left as [] (placeholder until SVG/generation ready)
  - Old chart IDs no longer in chart_group.json are excluded
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, 'evaluation')
NLP = os.path.join(ROOT, 'nlp_server/baseline')

WRONG_IDS = {
    '11e148qcs7x70t8v', '8chfa8n079zpfigi',
    '0jbrb1dcbliiampz', '0egzejn5mejtnfdm',
    '0xc7sx6ll8fl5rgh', '2s65jcap9pn289qx',
    '10t8o5vhethzeod1', '2eiyyw562tcvjypp',
}


def main():
    # Load source D3 results
    correct_res = json.load(open(os.path.join(NLP, 'd3_evaluation_result_chatgpt.json')))
    wrong_res = json.load(open(os.path.join(NLP, 'd3_evaluation_wrong_result_chatgpt.json')))

    model = list(correct_res.keys())[0]
    correct_scenes = correct_res[model]
    wrong_scenes = wrong_res.get(model, {})

    # Get active 25 chart IDs from chart_group.json
    cg = json.load(open(os.path.join(EVAL, 'chart_group.json')))
    active_ids = []
    for group in cg.values():
        for entry in group.values():
            active_ids.append(entry['id'])

    merged = {}
    missing = []
    for cid in active_ids:
        if cid in WRONG_IDS:
            if cid in wrong_scenes:
                merged[cid] = wrong_scenes[cid]
            else:
                merged[cid] = []
                missing.append(f"WRONG  {cid}: no wrong D3 yet (placeholder)")
        else:
            if cid in correct_scenes:
                merged[cid] = correct_scenes[cid]
            else:
                merged[cid] = []
                missing.append(f"CORRECT {cid}: no correct D3 yet (placeholder)")

    result = {model: merged}
    out = os.path.join(EVAL, 'baselines/B2/baseline2_result.json')
    with open(out, 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f"OK: baseline2_result.json written — {len(merged)} charts")
    print(f"  wrong D3: {sum(1 for c in WRONG_IDS if merged.get(c))}/8 present")
    print(f"  correct D3: {sum(1 for c,v in merged.items() if c not in WRONG_IDS and v)}/17 present")
    if missing:
        print("Placeholders (empty []):")
        for m in missing:
            print(f"  {m}")


if __name__ == '__main__':
    main()
