#!/usr/bin/env python3
"""Reassign the 25 charts to groups G1-G5 in evaluation/chart_group.json.

This is the authoritative group-membership map (it overrides the CSV-order
assignment that eval_build_from_csv.py bootstraps with). G1 is pinned to a
specific chart per type (user request); the remaining 20 are distributed across
G2-G5, one per type per group, with the tutorial chart (0vmvmj77j3p6vcy7) kept
in the G5 backup so it stays out of the main-study CO1-CO4 orderings.

Surgical + re-runnable: only rewrites chart_group.json, preserving each chart's
{question, answer}. Does NOT touch baseline_input (base SVGs / B1 explanations),
data/ours, or the B3 expert assets — all of which are keyed by chart_id.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CG = os.path.join(ROOT, 'evaluation/chart_group.json')

TYPES = ['bar_simple', 'bar_stacked', 'bar_grouped', 'line_simple', 'line_multiple']

# group -> { type_key: chart_id }. G1 is the user-pinned set.
GROUP_ASSIGNMENT = {
    'G1': {
        'bar_simple':   '0wflwm4jebx7n12y',
        'bar_stacked':  '11e148qcs7x70t8v',
        'bar_grouped':  '0rfuaawgi58ajpsv',
        'line_simple':  '8chfa8n079zpfigi',
        'line_multiple': '1k8qhmg9rui7gtzh',
    },
    'G2': {
        'bar_simple':   '0jbrb1dcbliiampz',
        'bar_stacked':  '2bhsybiilde28j87',
        'bar_grouped':  '0lua5jsw92d3enb4',
        'line_simple':  '66va2s35es5t86l3',
        'line_multiple': '2eiyyw562tcvjypp',
    },
    'G3': {
        'bar_simple':   '0gvrmm8qbn6o1vya',
        'bar_stacked':  '77xb5ug5lhfmkb74',
        'bar_grouped':  '0egzejn5mejtnfdm',
        'line_simple':  '10gtgmmgh599jnr7',
        'line_multiple': '2s65jcap9pn289qx',
    },
    'G4': {
        'bar_simple':   '1a09xqtrj8zms716',
        'bar_stacked':  '10t8o5vhethzeod1',
        'bar_grouped':  '0prhtod4tli879nh',
        'line_simple':  '25gpdzxh8nu0c0vf',
        'line_multiple': '16aphfabldrpgcmd',
    },
    'G5': {
        'bar_simple':   '0vmvmj77j3p6vcy7',
        'bar_stacked':  '21fa7gb8l1ix6yfm',
        'bar_grouped':  '01mksjs373fhcl4q',
        'line_simple':  'avwb8xstxx1lmfpk',
        'line_multiple': '20qa83ih1gn6toqt',
    },
}


def main():
    cg = json.load(open(CG))
    # flatten existing entries: chart_id -> (type_key, {id, question, answer})
    by_id = {}
    for group in cg.values():
        for type_key, entry in group.items():
            by_id[entry['id']] = (type_key, entry)

    # validate the assignment: 25 distinct ids, all present, types match
    assigned = [cid for g in GROUP_ASSIGNMENT.values() for cid in g.values()]
    assert len(assigned) == 25, f"expected 25 assignments, got {len(assigned)}"
    assert len(set(assigned)) == 25, "duplicate chart_id in GROUP_ASSIGNMENT"
    errors = []
    for g, types in GROUP_ASSIGNMENT.items():
        for type_key, cid in types.items():
            if cid not in by_id:
                errors.append(f"{g}.{type_key}: chart_id {cid} not in chart_group.json")
            elif by_id[cid][0] != type_key:
                errors.append(f"{g}.{type_key}: {cid} is actually type {by_id[cid][0]}")
    if errors:
        for e in errors:
            print("ERROR:", e)
        raise SystemExit(1)

    new_cg = {}
    for g in ['G1', 'G2', 'G3', 'G4', 'G5']:
        new_cg[g] = {}
        for type_key in TYPES:
            cid = GROUP_ASSIGNMENT[g][type_key]
            new_cg[g][type_key] = by_id[cid][1]

    with open(CG, 'w') as f:
        json.dump(new_cg, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print("OK: regrouped chart_group.json")
    for g in ['G1', 'G2', 'G3', 'G4', 'G5']:
        ids = '  '.join(f"{t.split('_')[0][:4]}={GROUP_ASSIGNMENT[g][t]}" for t in TYPES)
        print(f"  {g}: {ids}")


if __name__ == '__main__':
    main()
