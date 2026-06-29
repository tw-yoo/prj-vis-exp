#!/usr/bin/env python3
"""Inject the balanced correct/incorrect-answer design into the evaluation study.

For the 8 designated INCORRECT charts (2 per active group G1-G4):
  - chart_group.json: `answer` = the (executor-verified) WRONG value;
    `answerIsCorrect` = false; `correctAnswer` = the true value.
  - baselines/baseline_input.json[id].explanation = flawed B1 prose.
  - data/ours/ops/<id>.ops.json = flawed (verified) ops (from data/review/eval_flawed_ops.json).
  - data/ours/steps/<id>.step.json = flawed step narration (matching the ops groups).
For all 25 charts: chart_group gets `answerIsCorrect` + `correctAnswer` (ground truth).

Re-runnable. The flawed ops come from data/review/eval_flawed_ops.json.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, 'evaluation')
CG = os.path.join(EVAL, 'chart_group.json')
BI = os.path.join(EVAL, 'baselines/baseline_input.json')
OPS_DIR = os.path.join(EVAL, 'data/ours/ops')
STEPS_DIR = os.path.join(EVAL, 'data/ours/steps')
FLAWED_OPS = json.load(open(os.path.join(ROOT, 'data/review/eval_flawed_ops.json')))

# chart_id -> { wrong, prose (B1), steps (list, one per ops group, in order) }
# 8 incorrect items = 2 per active group G1-G4:
#   G1: 11e148 (bar_stacked), 8chfa8n (line_simple)
#   G2: 0jbrb1d (bar_simple), 0egzejn (bar_grouped)
#   G3: 0xc7sx6ll (bar_grouped), 2s65jcap (line_multiple)
#   G4: 10t8o5v (bar_stacked), 2eiyyw (line_multiple)
INCORRECT = {
    '8chfa8n079zpfigi': {
        'wrong': '10',
        'prose': (
            'Filter the chart to the years whose FIFA World Ranking position is above 20 '
            'and no more than 30. Count the remaining year points to get 10.'
        ),
        'steps': [
            'Keep the years whose FIFA World Ranking position is above 20 and at most 30.',
            'Count the remaining year points to get 10.',
        ],
    },
    '11e148qcs7x70t8v': {
        'wrong': '2015, 2016, 2017, 2018, Jan-Oct 2019',
        'prose': 'Compare the South Korea and France segments within each Period. Marking the Periods where South Korea is about even with or taller than France gives 2015, 2016, 2017, 2018, and Jan-Oct 2019.',
        'steps': [
            'Compare the South Korea and France segments within each Period.',
            'List the Periods where South Korea is about even with or above France: 2015, 2016, 2017, 2018, Jan-Oct 2019.',
        ],
    },
    '0jbrb1dcbliiampz': {
        'wrong': '7',
        'prose': 'Count all years where the investments value is greater than 22 billion euros. Seven years in total exceed this level.',
        'steps': [
            'Keep all years whose investments value is greater than 22 billion euros (ignoring the 2011–2014 restriction).',
            'Count the qualifying years — 7.',
        ],
    },
    '0egzejn5mejtnfdm': {
        'wrong': '12',
        'prose': ("Find Scotland's highest SharePercentage (28). Then find England & Wales's"
                  ' second-lowest SharePercentage (16, the "Somewhat against" bar) as the'
                  ' smallest-looking bar other than the outlier. Subtract to get 12.'),
        'steps': [
            "Find Scotland's highest SharePercentage across the response-category panels (28).",
            "Find England & Wales's second-lowest SharePercentage (16), treating the 2% outlier as anomalous.",
            '28 − 16 = 12.',
        ],
    },
    '0xc7sx6ll8fl5rgh': {
        'wrong': '0.37',
        'prose': ("Focus only on Hillary Clinton's vote-share bars across all age groups."
                  ' Average those values — ignoring the comparison to Sanders — to get 0.37.'),
        'steps': [
            "Keep only Hillary Clinton's vote-share bars across all age groups.",
            'Average those values to get 0.37.',
        ],
    },
    '2s65jcap9pn289qx': {
        'wrong': '-196.94',
        'prose': ("Treat the recent years as 2015 through 2020. Subtract the men's value"
                  " from the women's value for each of those years, then add the yearly"
                  ' differences together to get −196.94.'),
        'steps': [
            'Take the recent years as 2015 through 2020.',
            "Subtract the men's value from the women's value for each year.",
            'Sum those yearly differences to get −196.94.',
        ],
    },
    '10t8o5vhethzeod1': {
        'wrong': '2017',
        'prose': 'Track the agriculture-coloured band across the years and find where it is tallest. It peaks in 2017.',
        'steps': [
            'Track the agriculture-coloured band across the years.',
            'Its tallest year is 2017.',
        ],
    },
    '2eiyyw562tcvjypp': {
        'wrong': '3',
        'prose': ('Compare the Russia and US favorable-view percentages for each year.'
                  ' Count the years where Russia is clearly ahead or roughly at par with the'
                  ' US (within 1 point). That gives 3 years: 2007, 2009, and 2015.'),
        'steps': [
            "Compare Russia's and the US's favorable-view percentages for each year shown.",
            'Keep the years where Russia is at or above the US, including near-ties (within 1 point): 2007, 2009, 2015.',
            'Count those years — 3.',
        ],
    },
}


def dump(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def main():
    # ---- chart_group: ground truth for all 25, wrong answers for the 8 -------
    cg = json.load(open(CG))
    seen = set()
    for group in cg.values():
        for entry in group.values():
            cid = entry['id']
            # Idempotent: on a re-run the 8 incorrect entries already hold the
            # WRONG value in `answer`, so prefer the stored true `correctAnswer`.
            true_answer = entry.get('correctAnswer') or entry['answer']
            if cid in INCORRECT:
                entry['correctAnswer'] = true_answer
                entry['answer'] = INCORRECT[cid]['wrong']
                entry['answerIsCorrect'] = False
            else:
                entry['correctAnswer'] = true_answer
                entry['answer'] = true_answer
                entry['answerIsCorrect'] = True
            seen.add(cid)
    dump(CG, cg)
    missing = set(INCORRECT) - seen
    assert not missing, f"incorrect ids not found in chart_group: {missing}"

    # ---- baseline_input (B1 prose) for the 8 ---------------------------------
    bi = json.load(open(BI))
    for cid, spec in INCORRECT.items():
        if cid in bi:
            bi[cid]['explanation'] = spec['prose']
    dump(BI, bi)

    # ---- Ours ops + step narration for the 8 ---------------------------------
    for cid, spec in INCORRECT.items():
        flawed = FLAWED_OPS[cid]
        dump(os.path.join(OPS_DIR, f'{cid}.ops.json'), flawed)
        group_keys = list(flawed.keys())  # ops, ops2, ...
        texts = spec['steps']
        assert len(group_keys) == len(texts), f"{cid}: {len(group_keys)} ops groups vs {len(texts)} step texts"
        step_path = os.path.join(STEPS_DIR, f'{cid}.step.json')
        step = json.load(open(step_path))  # preserve chart_id/question/specPath/opsPath
        step['steps'] = [{'id': gk, 'text': t} for gk, t in zip(group_keys, texts)]
        dump(step_path, step)

    print(f"OK: {len(INCORRECT)} incorrect charts applied; ground truth set on all 25.")
    print("Incorrect set:")
    for group_name in ['G1', 'G2', 'G3', 'G4', 'G5']:
        for tk, e in cg[group_name].items():
            if not e.get('answerIsCorrect', True):
                print(f"  {group_name} {tk}: {e['id']}  answer={e['answer']!r}  (correct={e['correctAnswer']!r})")


if __name__ == '__main__':
    main()
