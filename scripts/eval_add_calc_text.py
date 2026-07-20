#!/usr/bin/env python3
"""Add B2-style calculation text to the shared step texts, and fix avwb's 2020 bug.

Motivation: B2's on-chart SVG scenes spell out the actual arithmetic (values,
sums, final answers) while the step texts shared by Ours/B1/B3 often describe
the operation without the numbers. That asymmetry favors B2 in the evaluation.
This script adds the computation content to the texts, keeping the wording
minimal. Every number was verified against the ChartQA source CSVs.

Text lives in four places (kept in sync since commit 3d7fa282):
  - evaluation/data/ours/steps/<id>.step.json   steps[].text   (Ours)
  - evaluation/baselines/B3/baseline3_manifest.json steps[].text (B3)
  - evaluation/baselines/B2/baseline2_result.json  text_chunk    (B2 side text)
  - evaluation/baselines/baseline_input.json    explanation      (B1 prose)
Step arrays are edited by EXACT match on the full step text; the B1 prose (a
concatenation of the sentences) is edited by substring, longest-first.

Also fixes a factual bug found during review: avwb8xstxx1lmfpk's B2 scene 5 and
B3 step 4 declare 2020 the year with the largest deviation, but the data says
2021 (year-average deviation 3.58 vs 2.24; chart_group.json's correct answer is
2021). The B2 scene-5 SVG also emphasized the 2020 bracket in red while dimming
2021 — the emphasis is swapped too.

Deception items 0xc7sx6ll8fl5rgh and 2s65jcap9pn289qx get their (flawed)
arithmetic spelled out on purpose: B2 already shows it on-chart, and the
error-localization task wants the flaw visible in every condition.

Idempotent: replacements whose old text is no longer present are skipped.
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, "evaluation")

# (old, new, scope) — scope: 'all' or 'ours' (0vmv/21fa keep B2's own extra
# scenes that already state the answer; only Ours' shorter text needs the sum).
REPLACEMENTS: list[tuple[str, str, str]] = [
    # 1k8qhmg9rui7gtzh — Germany max / US min / difference
    ("Find Germany's maximum favorable-view percentage in that range.",
     "Find Germany's maximum favorable-view percentage in that range: 50, in 2010.", "all"),
    ("Find the U.S. minimum favorable-view percentage in that range.",
     "Find the U.S. minimum favorable-view percentage in that range: 19, in 2014.", "all"),
    ("Subtract the U.S. minimum from the Germany maximum.",
     "Subtract the U.S. minimum from the Germany maximum: 50 − 19 = 31.", "all"),
    # 2bhsybiilde28j87 — average of three segments
    ("Average those three values.",
     "Average those three values: (0.20 + 0.16 + 0.21) ÷ 3 ≈ 0.19, i.e. 19%.", "all"),
    # 16aphfabldrpgcmd — the two counts and their sum
    ("Filter to the Boys group and count the years where the weight exceeds 3670.",
     "Filter to the Boys group and count the years where the weight exceeds 3670 — 3 years.", "all"),
    ("Filter to the Girls group and count the years where the weight exceeds 3550.",
     "Filter to the Girls group and count the years where the weight exceeds 3550 — 5 years.", "all"),
    ("Add the two counts together.",
     "Add the two counts together: 3 + 5 = 8.", "all"),
    # 0gvrmm8qbn6o1vya — sum ÷ count
    ("Average those six prices, giving 53.41.",
     "Average those six prices: 320.43 ÷ 6 = 53.41.", "all"),
    # 77xb5ug5lhfmkb74 — the total
    ("Sum the Number_of_Employees across those regions and years.",
     "Sum the Number_of_Employees across those regions and years — 230,769 in total.", "all"),
    # 1a09xqtrj8zms716 — the three values and the average
    ("Read off the top three malls' values by US dollars per square foot.",
     "Read off the top three malls' values by US dollars per square foot: 732, 646, and 422.", "all"),
    ("Add the three values and divide by three to get the average.",
     "Add the three values and divide by three: (732 + 646 + 422) ÷ 3 = 600.", "all"),
    # 01mksjs373fhcl4q — the winning drop
    ("Select the sector with the largest drop (Large companies).",
     "Select the sector with the largest drop: Large companies (9.5 → 5.2, a drop of 4.3).", "all"),
    # 16fif5hdi8yzml00 — both averages and the difference
    ("Average the Maximum payment values across all state panels.",
     "Average the Maximum payment values across all state panels: (25 + 25 + 15 + 15) ÷ 4 = 20.", "all"),
    ("Average the Minimum payment values across all state panels.",
     "Average the Minimum payment values across all state panels: (15 + 15 + 10 + 10) ÷ 4 = 12.5.", "all"),
    ("Subtract the minimum average from the maximum average.",
     "Subtract the minimum average from the maximum average: 20 − 12.5 = 7.5.", "all"),
    # 0xc7sx6ll8fl5rgh (deception) — spell out the flawed all-four average
    ("Average those values to get 0.368.",
     "Average those values: (0.16 + 0.32 + 0.45 + 0.54) ÷ 4 = 0.368.", "all"),
    # 2s65jcap9pn289qx (deception) — spell out the six-term sum
    ("Sum those yearly differences to get 196.94.",
     "Sum those yearly differences: 33.66 + 33.59 + 32.66 + 31.64 + 30.49 + 34.90 = 196.94.", "all"),
    # 0vmvmj77j3p6vcy7 — itemized sum (Ours only; B2 scene 3 / B1 already state 41,581)
    ("Add their “Net income in USD” values together.",
     "Add their “Net income in USD” values together: 2,901 + 2,804 + 2,592 + 3,075 + 12,101 + 18,108 = 41,581.",
     "ours"),
    # 21fa7gb8l1ix6yfm — name the winner (Ours lacks it; B2/B1 name it, B3 has values)
    ("Select the method with the largest gap.",
     "Select the method with the largest gap: Text messaging (0.55 − 0.13 = 0.42).", "ours"),
    ("Select the method with the largest gap, which is Text messaging.",
     "Select the method with the largest gap, which is Text messaging (0.55 − 0.13 = 0.42).", "all"),
    # avwb8xstxx1lmfpk — overall average value + THE 2020→2021 BUG FIX
    ("Calculate the overall average Consumer Price Index across all plotted months.",
     "Calculate the overall average Consumer Price Index across all plotted months (261.56).", "all"),
    ("Select the year with the largest deviation, which is 2020.",
     "Select the year with the largest deviation, which is 2021 (3.58 above the overall average, vs 2.24 for 2020).",
     "all"),
    ("Select the year with the largest deviation.",
     "Select the year with the largest deviation: 2021 (3.58 above the overall average, vs 2.24 for 2020).", "ours"),
    ("The 2020 average is farther below the overall average than the 2021 average is above it, "
     "so 2020 has the biggest deviation from the total average.",
     "The 2021 average is farther above the overall average (3.58) than the 2020 average is below it (2.24), "
     "so 2021 has the biggest deviation from the total average.", "all"),
]


def fix_avwb_scene5_svg(svg: str) -> str:
    """Swap the red emphasis from the 2020 deviation bracket to 2021 and update
    the callout label. Scene 5 highlighted 2020 (red, opaque) and dimmed 2021,
    but 2021 has the larger deviation."""
    if "Largest deviation: 2020" not in svg:
        return svg
    # Bracket lines/caps: swap emphasized <-> dimmed styling between years.
    svg = re.sub(r'(class="dev-(?:line|cap) dev-2020"[^>]*?)stroke="#ef4444" stroke-width="3" opacity="1"',
                 r'\1stroke="#6b7280" stroke-width="2" opacity="0.25"', svg)
    svg = re.sub(r'(class="dev-(?:line|cap) dev-2021"[^>]*?)stroke="#6b7280" stroke-width="2" opacity="0.25"',
                 r'\1stroke="#ef4444" stroke-width="3" opacity="1"', svg)
    # Label backgrounds and label text.
    svg = re.sub(r'(class="dev-label-bg dev-2020"[^>]*?)opacity="0.95" stroke="#ef4444" stroke-width="1.5"',
                 r'\1opacity="0.6" stroke="#6b7280" stroke-width="1"', svg)
    svg = re.sub(r'(class="dev-label-bg dev-2021"[^>]*?)opacity="0.6" stroke="#6b7280" stroke-width="1"',
                 r'\1opacity="0.95" stroke="#ef4444" stroke-width="1.5"', svg)
    svg = re.sub(r'(class="dev-label dev-2020"[^>]*?)font-weight="800" fill="#ef4444"',
                 r'\1font-weight="700" fill="#6b7280" opacity="0.35"', svg)
    svg = re.sub(r'(class="dev-label dev-2021"[^>]*?)font-weight="700" fill="#6b7280" opacity="0.35"',
                 r'\1font-weight="800" fill="#ef4444"', svg)
    return svg.replace("Largest deviation: 2020", "Largest deviation: 2021")


def apply_to_steps(texts: list[str], scope_ok) -> tuple[list[str], int]:
    """Exact-match replacement over a list of step texts."""
    n = 0
    out = []
    for t in texts:
        for old, new, scope in REPLACEMENTS:
            if scope_ok(scope) and t == old:
                t = new
                n += 1
                break
        out.append(t)
    return out, n


def main() -> None:
    total = 0

    # Ours step files ('all' + 'ours' scopes).
    steps_dir = os.path.join(EVAL, "data/ours/steps")
    for name in sorted(os.listdir(steps_dir)):
        path = os.path.join(steps_dir, name)
        data = json.load(open(path, encoding="utf-8"))
        texts, n = apply_to_steps([s["text"] for s in data["steps"]], lambda s: True)
        if n:
            for step, text in zip(data["steps"], texts):
                step["text"] = text
            json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            print(f"ours  {name}: {n} step(s)")
            total += n

    # B3 manifest ('all' scope only).
    b3_path = os.path.join(EVAL, "baselines/B3/baseline3_manifest.json")
    b3 = json.load(open(b3_path, encoding="utf-8"))
    n_b3 = 0
    for cid, entry in b3.items():
        texts, n = apply_to_steps([s["text"] for s in entry.get("steps", [])], lambda s: s == "all")
        if n:
            for step, text in zip(entry["steps"], texts):
                step["text"] = text
            print(f"b3    {cid}: {n} step(s)")
            n_b3 += n
    if n_b3:
        json.dump(b3, open(b3_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    total += n_b3

    # B2 scene chunks ('all' scope) + the avwb scene-5 SVG emphasis fix.
    b2_path = os.path.join(EVAL, "baselines/B2/baseline2_result.json")
    b2 = json.load(open(b2_path, encoding="utf-8"))
    n_b2 = 0
    for charts in b2.values():
        for cid, scenes in charts.items():
            texts, n = apply_to_steps([s["text_chunk"] for s in scenes], lambda s: s == "all")
            if n:
                for scene, text in zip(scenes, texts):
                    scene["text_chunk"] = text
                print(f"b2    {cid}: {n} scene text(s)")
                n_b2 += n
            if cid == "avwb8xstxx1lmfpk":
                fixed = fix_avwb_scene5_svg(scenes[4]["svg_code"])
                if fixed != scenes[4]["svg_code"]:
                    scenes[4]["svg_code"] = fixed
                    print("b2    avwb8xstxx1lmfpk: scene-5 SVG emphasis 2020 → 2021")
                    n_b2 += 1
    if n_b2:
        json.dump(b2, open(b2_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    total += n_b2

    # B1 prose: substring replacement, longest-old-first so the avwb "which is
    # 2020." sentence is rewritten before the bare-prefix pair could match.
    b1_path = os.path.join(EVAL, "baselines/baseline_input.json")
    b1 = json.load(open(b1_path, encoding="utf-8"))
    n_b1 = 0
    for cid, entry in b1.items():
        prose = entry.get("explanation", "")
        updated = prose
        for old, new, scope in sorted(REPLACEMENTS, key=lambda r: -len(r[0])):
            if scope == "all" and old in updated:
                updated = updated.replace(old, new)
        if updated != prose:
            entry["explanation"] = updated
            print(f"b1    {cid}: prose updated")
            n_b1 += 1
    if n_b1:
        json.dump(b1, open(b1_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    total += n_b1

    print(f"OK: {total} replacement(s) applied")


if __name__ == "__main__":
    main()
