#!/usr/bin/env python3
"""Inject the balanced correct/incorrect-answer design into the evaluation study.

For the 8 designated INCORRECT charts (2 per active group G1-G4):
  - chart_group.json: `answer` = the (executor-verified) WRONG value;
    `answerIsCorrect` = false; `correctAnswer` = the true value.
  - baselines/baseline_input.json[id].explanation = flawed B1 prose.
  - data/ours/ops/<id>.ops.json = flawed (verified) ops (from /tmp/flawed_ops.json).
  - data/ours/steps/<id>.step.json = flawed step narration (matching the ops groups).
For all 25 charts: chart_group gets `answerIsCorrect` + `correctAnswer` (ground truth).

Re-runnable. The flawed ops come from the executor-verified /tmp/flawed_ops.json.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, 'evaluation')
CG = os.path.join(EVAL, 'chart_group.json')
BI = os.path.join(EVAL, 'baselines/baseline_input.json')
OPS_DIR = os.path.join(EVAL, 'data/ours/ops')
STEPS_DIR = os.path.join(EVAL, 'data/ours/steps')
FLAWED_OPS = json.load(open('/tmp/flawed_ops.json'))

# chart_id -> { wrong, prose (B1), steps (list, one per ops group, in order) }
INCORRECT = {
    '0wflwm4jebx7n12y': {
        'wrong': '150',
        'prose': 'Find the maximum bar height in the chart to get 380. Take a middle “Number of fires” value as the typical (average) level, about 230. Subtract that from the maximum, leaving a difference of 150.',
        'steps': [
            'Find the maximum bar height in the chart (380).',
            'Take a middle “Number of fires” value as the average (about 230).',
            'Subtract that from the maximum, leaving 150.',
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
    '0lua5jsw92d3enb4': {
        'wrong': '12',
        'prose': 'Focus on the bars for 2019 across the diet-type panels. Counting the diet types whose 2019 share is 0.03 or higher gives 12.',
        'steps': [
            'Focus on the 2019 bars across all diet-type panels.',
            'Keep the 2019 bars at or above 0.03.',
            'Count them — 12.',
        ],
    },
    '66va2s35es5t86l3': {
        'wrong': '2019',
        'prose': 'The line reaches its highest value in 2019, so the year with the largest year-over-year increase is 2019.',
        'steps': [
            'The line reaches its highest value in 2019, so that is the year with the largest increase.',
        ],
    },
    '0gvrmm8qbn6o1vya': {
        'wrong': '54.79',
        'prose': 'Filter the bars to the lower-priced seasons, counting 2012/13 (about $63) as well. Average those ticket prices to get about 54.79.',
        'steps': [
            'Filter to the lower-priced seasons (including 2012/13 at about $63).',
            'Average those ticket prices, giving about 54.79.',
        ],
    },
    '2s65jcap9pn289qx': {
        'wrong': '-196.94',
        'prose': 'Treat the recent years as 2015 through 2020. Subtract the men’s value from the women’s value for each of those years, then add the yearly differences together to get -196.94.',
        'steps': [
            'Take the recent years as 2015 through 2020.',
            'Subtract the men’s value from the women’s value for each year.',
            'Sum those yearly differences to get -196.94.',
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
    '0prhtod4tli879nh': {
        'wrong': 'Tokyo',
        'prose': 'Compare each city’s 2010 and 2025 population bars. Tokyo stands out among the cities, so the city with the biggest jump is Tokyo.',
        'steps': [
            'Compare each city’s 2010 and 2025 population bars.',
            'Tokyo stands out among the cities, so the biggest jump is Tokyo.',
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
