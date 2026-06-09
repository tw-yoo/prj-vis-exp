#!/usr/bin/env python3
"""Make B2 (scenes) and B3 (expert module + manifest) consistent with the G1
incorrect-chart swap: 0wflwm -> CORRECT (141.25), 8chfa8 -> INCORRECT (10/11).
Run after eval_swap_g1_incorrect.py.
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, 'evaluation')
B2 = os.path.join(EVAL, 'baselines/B2/baseline2_result.json')
B3DIR = os.path.join(EVAL, 'baselines/B3/expert')
MAN = os.path.join(EVAL, 'baselines/B3/baseline3_manifest.json')
WFLWM, FIFA = '0wflwm4jebx7n12y', '8chfa8n079zpfigi'


def dump(p, o):
    with open(p, 'w') as f:
        json.dump(o, f, indent=2, ensure_ascii=False); f.write('\n')


def repl(s, old, new, n=1, ctx=''):
    c = s.count(old)
    if c == 0 and new in s:
        return s  # idempotent
    assert c == n, f'[{ctx}] expected {n}x {old!r}, found {c}'
    return s.replace(old, new)


# ============================ B2 ============================
b2 = json.load(open(B2)); model = list(b2.keys())[0]

# ---- 0wflwm B2 -> correct (relabel avg 230->238.75, diff 150->141.25) ----
w = b2[model][WFLWM]
w[1]['text_chunk'] = 'Calculate the average of the “Number of fires” values across all years, which is 238.75.'
w[1]['svg_code'] = repl(w[1]['svg_code'], '>Typical (avg) ≈ 230<', '>Average = 238.75<', ctx='wflwm s1 avg-label')
w[2]['text_chunk'] = 'Subtract the average from the maximum, leaving a difference of 141.25.'
w[2]['svg_code'] = repl(w[2]['svg_code'], '>Typical (avg) ≈ 230<', '>Average = 238.75<', ctx='wflwm s2 avg-label')
w[2]['svg_code'] = repl(w[2]['svg_code'], '>380 − 230 = 150<', '>380 − 238.75 = 141.25<', ctx='wflwm s2 diff-label')

# ---- 8chfa8 B2 -> incorrect (de-highlight the 2019/value-20 point; strict wording) ----
f = b2[model][FIFA]
HL_2019 = '<circle cx="476.66666666666663" cy="240" r="6" fill="#f59e0b" stroke="#92400e" stroke-width="1.5" opacity="1" data-target="2019" data-id="2019" data-value="20" data-x-value="2019" data-y-value="20">'
DIM_2019 = '<circle cx="476.66666666666663" cy="240" r="4" fill="#4f46e5" opacity="0.12" data-target="2019" data-id="2019" data-value="20" data-x-value="2019" data-y-value="20">'
f[0]['text_chunk'] = 'Filter the chart to the years whose FIFA World Ranking position is above 20 and at most 30.'
f[0]['svg_code'] = repl(f[0]['svg_code'], HL_2019, DIM_2019, ctx='fifa s0 2019-dim')
f[1]['svg_code'] = repl(f[1]['svg_code'], HL_2019, DIM_2019, ctx='fifa s1 2019-dim')
# scene1 text already concludes 10 — leave it.
dump(B2, b2)

# ============================ B3 .js ============================
# 0wflwm.js: csvAverage 230->238.75, csvDifference 150->141.25 (geometry auto-recomputes)
p = os.path.join(B3DIR, f'{WFLWM}.js'); js = open(p).read()
js = repl(js, 'const csvAverage = 230;', 'const csvAverage = 238.75;', n=2, ctx='wflwm.js avg')
js = repl(js, 'const csvDifference = 150;', 'const csvDifference = 141.25;', n=1, ctx='wflwm.js diff')
open(p, 'w').write(js)

# 8chfa8.js: drop 2019 from highlighted set; count 10
p = os.path.join(B3DIR, f'{FIFA}.js'); js = open(p).read()
js = repl(js,
          "const csvYears = new Set(['2003', '2004', '2009', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019']);",
          "const csvYears = new Set(['2003', '2004', '2009', '2012', '2013', '2014', '2015', '2016', '2017', '2018']);",
          ctx='fifa.js csvYears')
js = repl(js, ".text('Count: 11 years');", ".text('Count: 10 years');", ctx='fifa.js count')
open(p, 'w').write(js)

# ============================ B3 manifest ============================
man = json.load(open(MAN))
ws = man[WFLWM]['steps']
assert ws[1]['fn'] == 'function2' and ws[2]['fn'] == 'function3'
ws[1]['text'] = 'Then take the average level of fires across the years, which is 238.75.'
ws[2]['text'] = 'Finally, subtract the average from the maximum: 380 − 238.75 = 141.25.'
fs = man[FIFA]['steps']
assert fs[0]['fn'] == 'function1'
fs[0]['text'] = (
    'Review each year’s FIFA World Ranking position and count those whose value is above 20 '
    'and at most 30. The qualifying years are 2003 (27), 2004 (27), 2009 (29), 2012 (27), '
    '2013 (27), 2014 (26), 2015 (28), 2016 (25), 2017 (22), and 2018 (23). '
    'That makes 10 years in total.'
)
dump(MAN, man)

print('OK: B2 + B3(.js + manifest) made consistent. 0wflwm=141.25 (correct), 8chfa8=10 (incorrect, correct 11).')
