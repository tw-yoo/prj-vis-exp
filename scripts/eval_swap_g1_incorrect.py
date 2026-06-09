#!/usr/bin/env python3
"""Swap the G1 incorrect chart: restore 0wflwm (simpleBar) to CORRECT and make
8chfa8 (simpleLine) the new incorrect chart.

Reason: 0wflwm's question forces a `findExtremum(max) vs value → diff` structure,
which the evaluation viewer cannot render for simpleBar (split-right selection +
cross-surface diff don't render; single-chart path doesn't commit). 8chfa8 is a
filter→filter→count chart that renders cleanly, with a subtle off-by-one flaw
(strict lower bound drops the value-20 year): 11 → 10.

Covers OURS (ops + steps) + chart_group ground truth + B1 prose for BOTH charts.
B2 (scenes) and B3 (expert module/manifest) are bespoke and handled separately.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, 'evaluation')
OPS = os.path.join(EVAL, 'data/ours/ops')
STEPS = os.path.join(EVAL, 'data/ours/steps')
CG = os.path.join(EVAL, 'chart_group.json')
BI = os.path.join(EVAL, 'baselines/baseline_input.json')

WFLWM = '0wflwm4jebx7n12y'
FIFA = '8chfa8n079zpfigi'


def dump(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def set_steps(cid, texts):
    p = os.path.join(STEPS, f'{cid}.step.json')
    step = json.load(open(p))
    groups = list(json.load(open(os.path.join(OPS, f'{cid}.ops.json'))).keys())
    assert len(groups) == len(texts), f'{cid}: {len(groups)} groups vs {len(texts)} texts'
    step['steps'] = [{'id': g, 'text': t} for g, t in zip(groups, texts)]
    dump(p, step)


# ---------------------------------------------------------------- 0wflwm: RESTORE CORRECT ----
# Original ops: findExtremum(max) -> average -> diff = 380 - 238.75 = 141.25
dump(os.path.join(OPS, f'{WFLWM}.ops.json'), {
    'ops': [{'op': 'findExtremum', 'id': 'n1', 'meta': {'nodeId': 'n1', 'inputs': [], 'sentenceIndex': 1}, 'which': 'max', 'field': 'Number of fires'}],
    'ops2': [{'op': 'average', 'id': 'n2', 'meta': {'nodeId': 'n2', 'inputs': [], 'sentenceIndex': 2}, 'field': 'Number of fires'}],
    'ops3': [{'op': 'diff', 'id': 'n3', 'meta': {'nodeId': 'n3', 'inputs': ['n1', 'n2'], 'sentenceIndex': 3}, 'targetA': 'ref:n1', 'targetB': 'ref:n2', 'signed': False}],
})
set_steps(WFLWM, [
    'Find the maximum bar height in the chart (380).',
    'Calculate the average of the “Number of fires” values across all years (238.75).',
    'Subtract the average from the maximum, leaving a difference of 141.25.',
])

# ---------------------------------------------------------------- 8chfa8: INJECT FLAW ----
# Flaw: strict lower bound (> 20 instead of >= 20) drops the 2019 year (value 20):
# correct 11 -> flawed 10.
dump(os.path.join(OPS, f'{FIFA}.ops.json'), {
    'ops': [
        {'op': 'filter', 'id': 'n1', 'meta': {'nodeId': 'n1', 'inputs': [], 'sentenceIndex': 1}, 'field': 'FIFA World Ranking position', 'operator': '>', 'value': 20},
        {'op': 'filter', 'id': 'n2', 'meta': {'nodeId': 'n2', 'inputs': ['n1'], 'sentenceIndex': 1}, 'field': 'FIFA World Ranking position', 'operator': '<=', 'value': 30},
    ],
    'ops2': [{'op': 'count', 'id': 'n3', 'meta': {'nodeId': 'n3', 'inputs': ['n2'], 'sentenceIndex': 2}}],
})
set_steps(FIFA, [
    'Keep the years whose FIFA World Ranking position is above 20 and at most 30.',
    'Count the remaining year points to get 10.',
])

# ---------------------------------------------------------------- chart_group ground truth ----
cg = json.load(open(CG))
for tk, e in cg['G1'].items():
    if e['id'] == WFLWM:
        e['answer'] = '141.25'; e['answerIsCorrect'] = True; e['correctAnswer'] = '141.25'
    elif e['id'] == FIFA:
        e['answer'] = '10'; e['answerIsCorrect'] = False; e['correctAnswer'] = '11'
dump(CG, cg)

# ---------------------------------------------------------------- B1 prose ----
bi = json.load(open(BI))
bi[WFLWM]['explanation'] = (
    'Find the maximum bar height in the chart to get 380. Calculate the average of '
    'the “Number of fires” values across all years to get 238.75. Subtract the '
    'average from the maximum, leaving a difference of 141.25.'
)
bi[FIFA]['explanation'] = (
    'Filter the chart to the years whose FIFA World Ranking position is above 20 '
    'and no more than 30. Count the remaining year points to get 10.'
)
dump(BI, bi)

print('OK: 0wflwm restored to CORRECT (141.25); 8chfa8 now INCORRECT (10, correct 11).')
print('Remaining (bespoke): B2 scenes + B3 expert module/manifest for both charts.')
