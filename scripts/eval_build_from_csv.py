#!/usr/bin/env python3
"""Regenerate the evaluation/ study assets from data/review/evaluation.csv.

Produces (all under evaluation/):
  - chart_group.json            G1-G5 x {5 type keys} -> {id, question, answer}
  - chart_map.json              charts:{id:{question, ours:{steps}}} + defaults
  - data/ours/specs/<id>.vl.json   copied from ChartQA/data/vlSpec/...
  - data/ours/ops/<id>.ops.json    operation_spec verbatim (pretty-printed)
  - data/ours/steps/<id>.step.json {chart_id,question,description,specPath,opsPath,steps[]}
  - baselines/baseline_input.json  {id:{question, explanation:"", svg:""}}
  - baselines/B{1,2,3}/baseline{N}_result.json  {model:{id:[]}}

Stale data/ours/{specs,ops,steps} files (ids not in the new 25) are removed.
Group assignment = CSV appearance order within each chart type (G1..G5).
"""
import csv, json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'data/review/evaluation.csv')
EVAL = os.path.join(ROOT, 'evaluation')
OURS = os.path.join(EVAL, 'data/ours')
CHARTQA = os.path.join(ROOT, 'ChartQA/data/vlSpec')

# chart_type -> (chart_group key, ChartQA vlSpec subpath)
TYPE_MAP = {
    'simpleBar':    ('bar_simple',   'bar/simple'),
    'stackedBar':   ('bar_stacked',  'bar/stacked'),
    'groupedBar':   ('bar_grouped',  'bar/grouped'),
    'simpleLine':   ('line_simple',  'line/simple'),
    'multipleLine': ('line_multiple','line/multiple'),
}
GROUPS = ['G1', 'G2', 'G3', 'G4', 'G5']

# Per-group step narration (one entry per ops-group, in order ops, ops2, ...).
# Authored from each chart's explanation + op semantics. Deliberately omits
# hard-coded *result* numbers (the engine renders the real executor values as
# annotations); only categorical selections that match the executor are kept.
STEP_TEXTS = {
    '0jbrb1dcbliiampz': [
        "Restrict attention to the bars for the years 2011 through 2014.",
        "Keep the bars whose investments value is greater than 22 on the y-axis.",
        "Count the qualifying years.",
    ],
    '11e148qcs7x70t8v': [
        "Compare the South Korea and France segments within each Period.",
        "List the Periods where South Korea's segment is taller than France's.",
    ],
    '66va2s35es5t86l3': [
        "Calculate the year-over-year increase in “In millions” between adjacent years.",
        "Select the later year of the pair with the largest increase (2010).",
    ],
    '0gvrmm8qbn6o1vya': [
        "Filter the bars to the seasons priced at or below $60.",
        "Average those filtered ticket prices.",
    ],
    '10gtgmmgh599jnr7': [
        "Filter the chart to the years 2000–2008 and find the smallest value.",
        "Within the same range, find the second-largest value.",
        "Subtract the smallest from the second-largest.",
    ],
    '1k8qhmg9rui7gtzh': [
        "Filter the chart to the years 2010 through 2015 inclusive.",
        "Find Germany's maximum favorable-view percentage in that range.",
        "Find the U.S. minimum favorable-view percentage in that range.",
        "Subtract the U.S. minimum from the Germany maximum.",
    ],
    '0wflwm4jebx7n12y': [
        "Find the maximum bar height in the chart.",
        "Calculate the average of the “Number of fires” values across all years.",
        "Subtract the average from the maximum.",
    ],
    '0xc7sx6ll8fl5rgh': [
        "For each age group, compute the difference between Clinton's and Sanders's vote share.",
        "Filter to the age groups where Clinton's share was lower than Sanders's.",
        "Average Clinton's vote share at those age groups.",
    ],
    '0egzejn5mejtnfdm': [
        "Find Scotland's highest SharePercentage across the response-category panels.",
        "Find England & Wales's lowest SharePercentage across the same panels.",
        "Subtract the smaller value from the larger.",
    ],
    '1a09xqtrj8zms716': [
        "Read off the top three malls' values by US dollars per square foot.",
        "Add the three values and divide by three to get the average.",
    ],
    '25gpdzxh8nu0c0vf': [
        "Calculate the average of the Number_of_Fatalities values across all years.",
        "Sort the values and take the middle one as the median.",
        "Compare the average and the median to see which is bigger.",
    ],
    '2eiyyw562tcvjypp': [
        "Compare the Russia and US favorable-view percentages for each year.",
        "Keep the years where Russia's value is greater than the US value.",
        "Count those years.",
    ],
    '2s65jcap9pn289qx': [
        "Restrict the chart to the last five years (2016 through 2020).",
        "Subtract the men's value from the women's value for each of those years.",
        "Sum those five yearly differences.",
    ],
    '0prhtod4tli879nh': [
        "Compute each city's population change from its 2010 bar to its 2025 bar.",
        "Select the city with the largest increase (Delhi).",
    ],
    '0vmvmj77j3p6vcy7': [
        "Select the bars for the years 2010 through 2015 inclusive.",
        "Add their “Net income in USD” values together.",
    ],
    '2bhsybiilde28j87': [
        "Take the “Very interested” segment values for the non-black races (White, Hispanic, Other).",
        "Average those three values.",
    ],
    '8chfa8n079zpfigi': [
        "Filter to the years whose FIFA World Ranking position is between 20 and 30 inclusive.",
        "Count the remaining year points.",
    ],
    '77xb5ug5lhfmkb74': [
        "Filter to the Europe-region segments (Germany, Great Britain, Spain, Rest of Europe) for the years before 2015.",
        "Sum the Number_of_Employees across those regions and years.",
    ],
    'avwb8xstxx1lmfpk': [
        "Calculate the overall average Consumer Price Index across all plotted months.",
        "Measure each point's deviation from the overall average.",
        "Select the year with the largest deviation.",
    ],
    '16aphfabldrpgcmd': [
        "Filter to the Boys group and count the years where the weight exceeds 3670.",
        "Filter to the Girls group and count the years where the weight exceeds 3550.",
        "Add the two counts together.",
    ],
    '20qa83ih1gn6toqt': [
        "For each year, take the absolute difference between the Convenience and Price values.",
        "Find the year with the smallest gap (2013).",
    ],
    '16fif5hdi8yzml00': [
        "Average the Maximum payment values across all state panels.",
        "Average the Minimum payment values across all state panels.",
        "Subtract the minimum average from the maximum average.",
    ],
    '01mksjs373fhcl4q': [
        "Within each sector's panel, subtract the mid-2013 bar from the 2003 bar to get the decline.",
        "Select the sector with the largest drop (Large companies).",
    ],
    '10t8o5vhethzeod1': [
        "Isolate the Agriculture-colored segment in each year's stacked bar.",
        "Select the year whose Agriculture segment is tallest.",
    ],
    '21fa7gb8l1ix6yfm': [
        "For each method, take the absolute difference between the “EVERY DAY” and “LESS OFTEN” segments.",
        "Select the method with the largest gap.",
    ],
}

# chart_group answers (executor-authoritative; not displayed/scored by the viewer).
ANSWERS = {
    '0jbrb1dcbliiampz': "3",
    '11e148qcs7x70t8v': "2016, 2017, 2018, Jan-Oct 2019",
    '66va2s35es5t86l3': "2010",
    '0gvrmm8qbn6o1vya': "53.41",
    '10gtgmmgh599jnr7': "0.023",
    '1k8qhmg9rui7gtzh': "31",
    '0wflwm4jebx7n12y': "141.25",
    '0xc7sx6ll8fl5rgh': "0.31",
    '0egzejn5mejtnfdm': "26",
    '1a09xqtrj8zms716': "600",
    '25gpdzxh8nu0c0vf': "median",
    '2eiyyw562tcvjypp': "2",
    '2s65jcap9pn289qx': "-163.28",
    '0prhtod4tli879nh': "Delhi",
    '0vmvmj77j3p6vcy7': "41581",
    '2bhsybiilde28j87': "19%",
    '8chfa8n079zpfigi': "11",
    '77xb5ug5lhfmkb74': "230769",
    'avwb8xstxx1lmfpk': "2021",
    '16aphfabldrpgcmd': "8",
    '20qa83ih1gn6toqt': "2013",
    '16fif5hdi8yzml00': "7.5",
    '01mksjs373fhcl4q': "Large companies",
    '10t8o5vhethzeod1': "2011",
    '21fa7gb8l1ix6yfm': "Text messaging",
}

B_MODELS = {1: 'gpt-5.2', 2: 'gemini-3.1-pro-preview', 3: 'placeholder'}


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def main():
    with open(CSV, newline='') as f:
        rows = list(csv.DictReader(f))

    charts = []  # ordered list of dicts
    errors = []
    for row in rows:
        cid = row['chart_id'].strip()
        ctype = row['chart_type'].strip()
        question = row['question'].strip()
        explanation = row['explanation'].strip()
        spec_raw = row['operation_spec'].strip()
        if ctype not in TYPE_MAP:
            errors.append(f"{cid}: unknown chart_type {ctype}")
            continue
        gkey, qa_sub = TYPE_MAP[ctype]
        try:
            ops = json.loads(spec_raw)
        except Exception as e:
            errors.append(f"{cid}: bad operation_spec JSON: {e}")
            continue
        group_keys = list(ops.keys())  # ['ops','ops2',...]
        texts = STEP_TEXTS.get(cid)
        if texts is None:
            errors.append(f"{cid}: no STEP_TEXTS entry")
            continue
        if len(texts) != len(group_keys):
            errors.append(f"{cid}: STEP_TEXTS has {len(texts)} entries but ops has {len(group_keys)} groups {group_keys}")
            continue
        src_spec = os.path.join(CHARTQA, qa_sub, f"{cid}.json")
        if not os.path.isfile(src_spec):
            errors.append(f"{cid}: missing ChartQA spec {src_spec}")
            continue
        charts.append({
            'cid': cid, 'ctype': ctype, 'gkey': gkey, 'qa_sub': qa_sub,
            'question': question, 'explanation': explanation,
            'ops': ops, 'group_keys': group_keys, 'texts': texts,
            'src_spec': src_spec,
        })

    if errors:
        print("ERRORS:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    # Group assignment: CSV appearance order within each type -> G1..G5
    per_type_seen = {}
    for c in charts:
        idx = per_type_seen.get(c['gkey'], 0)
        c['group'] = GROUPS[idx]
        per_type_seen[c['gkey']] = idx + 1
    # sanity: each type must fill exactly G1..G5
    for gkey in {v[0] for v in TYPE_MAP.values()}:
        n = per_type_seen.get(gkey, 0)
        if n != 5:
            print(f"ERROR: type {gkey} has {n} charts (expected 5)")
            sys.exit(1)

    new_ids = {c['cid'] for c in charts}

    # ---- D. data/ours/{specs,ops,steps} -----------------------------------
    # remove stale files
    for sub, suffix in (('specs', '.vl.json'), ('ops', '.ops.json'), ('steps', '.step.json')):
        d = os.path.join(OURS, sub)
        for fn in os.listdir(d):
            if not fn.endswith(suffix):
                continue
            fid = fn[: -len(suffix)]
            if fid not in new_ids:
                os.remove(os.path.join(d, fn))
                print(f"  removed stale {sub}/{fn}")
    # write new
    for c in charts:
        cid = c['cid']
        # spec: copy verbatim from ChartQA
        shutil.copyfile(c['src_spec'], os.path.join(OURS, 'specs', f"{cid}.vl.json"))
        # ops: operation_spec verbatim
        dump(os.path.join(OURS, 'ops', f"{cid}.ops.json"), c['ops'])
        # steps: one step per ops-group
        steps = [{'id': gk, 'text': t} for gk, t in zip(c['group_keys'], c['texts'])]
        dump(os.path.join(OURS, 'steps', f"{cid}.step.json"), {
            'chart_id': cid,
            'question': c['question'],
            'description': "",
            'specPath': f"specs/{cid}.vl.json",
            'opsPath': f"ops/{cid}.ops.json",
            'steps': steps,
        })

    # ---- C. chart_group.json ----------------------------------------------
    chart_group = {g: {} for g in GROUPS}
    for c in charts:
        chart_group[c['group']][c['gkey']] = {
            'id': c['cid'],
            'question': c['question'],
            'answer': ANSWERS.get(c['cid'], ""),
        }
    dump(os.path.join(EVAL, 'chart_group.json'), chart_group)

    # ---- E. chart_map.json (charts override is unused by viewer, kept for ref) --
    chart_map = {'charts': {}, 'defaults': {'d3': {'model': 'gpt-5.2'}, 'svg': {'model': 'gpt-5.2'}}}
    for c in charts:
        chart_map['charts'][c['cid']] = {
            'question': c['question'],
            'ours': {'steps': [{'id': gk, 'text': t} for gk, t in zip(c['group_keys'], c['texts'])]},
        }
    dump(os.path.join(EVAL, 'chart_map.json'), chart_map)

    # ---- F. baselines/ (chart_id only; content blank) ----------------------
    baseline_input = {}
    for c in charts:
        baseline_input[c['cid']] = {'question': c['question'], 'explanation': "", 'svg': ""}
    dump(os.path.join(EVAL, 'baselines/baseline_input.json'), baseline_input)
    for n in (1, 2, 3):
        result = {B_MODELS[n]: {c['cid']: [] for c in charts}}
        dump(os.path.join(EVAL, f'baselines/B{n}/baseline{n}_result.json'), result)

    # ---- summary ----------------------------------------------------------
    print(f"\nOK: {len(charts)} charts written.")
    print("Group assignment:")
    for g in GROUPS:
        line = []
        for gkey in ['bar_simple', 'bar_stacked', 'bar_grouped', 'line_simple', 'line_multiple']:
            entry = chart_group[g].get(gkey, {})
            line.append(f"{gkey}={entry.get('id','--')}")
        print(f"  {g}: " + "  ".join(line))


if __name__ == '__main__':
    main()
