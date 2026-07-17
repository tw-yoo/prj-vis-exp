# Stimulus Change Log — evaluation study

Analysis-critical record of every change to the 20 active study items
(chart_group.json G1–G4) made AFTER data collection began. Participants who ran
the study before a change saw the OLD stimuli; score/interpret their trials
against the state described here, not the current files.

Participants collected BEFORE both changes below (from `evaluation/analysis/raw/`):
**SO1CO1, SO1CO2, SO1CO4, SO2CO3** (raw JSONs downloaded 2026-07-16).
Any participant whose session started before the deploy times below is affected.

Consistency checker: `scripts/eval_audit_explanations.py` (run after any stimulus
edit; 80/80 item×system PASS as of change 2).

---

## Change 1 — explanation-text repairs (commit `381646d1`)

Pushed 2026-07-17 06:36 UTC = **15:36 KST**; GH Pages deploy run 29560501644
(success, live ≈15:38 KST).

Unintended mismatches between explanation conclusions and the shown answer were
repaired. What PRE-change participants saw, per item × system (systems not
listed were already consistent — Ours was consistent on all 20):

### 1a. Deception items where a baseline explanation derived the TRUE answer
(The manipulation was broken for these trials: `Answer:` line showed the planted
wrong value but the explanation concluded the correct one.)

| Item (shown wrong / true) | System | Pre-change conclusion seen | Post-change |
|---|---|---|---|
| 0jbrb1dcbliiampz (7 / 3) | B1 | "…Count the qualifying years to get **3**" (correct 2011–2014 window logic) | flawed: window ignored → 7 |
| 0jbrb1dcbliiampz | B2 | 4 scenes incl. window-check "Count (2011–2014): 3" then "Seven years in total" (self-contradictory) | 3 flawed scenes → 7, ✓ on all 7 bars |
| 0egzejn5mejtnfdm (12 / 26) | B1 | "…lowest…to get **2**. Subtract…to get **26**" (correct) | flawed: 2% treated as outlier, 28−16=12 |
| 0xc7sx6ll8fl5rgh (0.37 / 0.31) | B1 | correct filter-then-average chain ending **0.31** | flawed: all-Clinton average 0.37 |
| 0xc7sx6ll8fl5rgh | B2 | correct 3-scene chain, "Avg = **0.31**" line | 2 flawed scenes, all Clinton bars, "Avg = 0.37" |
| 2s65jcap9pn289qx (196.94 / 163.28) | B1 | "last five as **2016–2020**… sum to get **172.26**" (neither shown nor true; stale data revision) | flawed: 2015–2020 six years → 196.94 |

### 1b. Correct items where a baseline explanation stated a wrong value
(`Answer:` line was correct; the explanation contradicted it.)

| Item (correct answer) | System | Pre-change conclusion seen | Post-change |
|---|---|---|---|
| 0wflwm4jebx7n12y (141.25) | B1, B2 | avg **230**, diff **150** (B2 avg line drawn at 230) | 238.75 / 141.25 |
| 0wflwm4jebx7n12y | B3 | avg **225**, diff **155** | 238.75 / 141.25 |
| 16aphfabldrpgcmd (8) | B1, B2 | Girls count **2**, total **5** (B2 labels; note B2's chart already highlighted 5 Girls points) | 3+5 = 8 |
| 77xb5ug5lhfmkb74 (230769) | B1, B2 | sum **166,816** | 230,769 |
| 77xb5ug5lhfmkb74 | B3 | sum **169,212** (text only; module computed correctly) | 230,769 |
| 16fif5hdi8yzml00 (7.5) | B1 | intermediates **18.75 / 11.25** (final 7.5 ok) | 20 / 12.5 |
| 16fif5hdi8yzml00 | B3 | "**11 states**", avgs 20.0/**6.25**, diff **13.75**; module chart showed states **Minnesota & Washington (10/5)** instead of Kansas & Illinois (15/10) | 4 states, 20/12.5 → 7.5; module data corrected |
| 66va2s35es5t86l3 (2010) | B3 | text claimed steepest rise **1990→2000** (implying 2000) while the module highlighted 2000→2010 | text matches 2000→2010, +15.0 |
| 1a09xqtrj8zms716 (600) | B3 | average stated as **674** (self-inconsistent with its own 732/646/422) | 600 |
| 0gvrmm8qbn6o1vya (53.41) | B1, B2 | "average of **53.99**" (arith slip; B2 also had an "Avg $53.99" tag) | 53.41 |
| 10t8o5vhethzeod1 (shown 2017 / true 2011) | B1 | truncated final sentence, no year named | completed, names 2017 |
| 10t8o5vhethzeod1 | B3 | narrative/highlight about the **Services** sector (question asks Agriculture) | Agriculture band, red 2017 @ 0.2708 |
| 11e148qcs7x70t8v (deception, shown incl. 2015) | B3 | list never mentioned Jan-Oct 2019 | range wording covers it |

## Change 2 — D1: 10gtgmmgh599jnr7 answer 0.02 → 0.023 (this commit)

Decision (2026-07-17): "second largest between 2000–2008" uses the POSITIONAL
reading — 2003 and 2004 tie at 0.109, so the second-largest value is 0.109 and
the answer is 0.109 − 0.086 = **0.023** (matches evaluation.csv `exec: 0.023`).

Pre-change participants saw, for this correct item:
- `Answer:` line **0.02** (chart_group answer/correctAnswer were 0.02)
- Ours: rank-3 extremum (0.106 distinct-value reading) → "0.02"
- B1/B2: text concluding **0.019** (B2's svg label already said "2nd max: 0.109
  (2003/2004)" but computed "0.109 − 0.086 = 0.019")
- B3: rambling conclusion "≈0.019 … about 0.02 … about 0.023"; module highlighted
  the distinct-value second largest (0.106) with diff label 0.020

Post-change: chart_group answer/correctAnswer = 0.023; Ours ops rank 3→2
(highlights 0.109, diff 0.023); B1/B2/B3 texts + B2 svg label + B3 module all
conclude 0.023. Scoring note: a pre-change participant judging this item against
0.02 was still judging a *correct* item (answerIsCorrect=true throughout); only
the displayed value changed.

## Scoring guidance for pre-change trials

- Group 1a trials (item × B1, plus 0jbrb/0xc7 × B2): the deception manipulation
  was broken — exclude from deception-detection analyses or flag separately.
- Group 1b trials: the participant saw a correct `Answer:` contradicted by its
  explanation; "No (answer is wrong)" responses on these trials are not evidence
  of poor verification — flag before computing judgment accuracy per system.
- Change 2: no correctness flip; treat as cosmetic unless analyzing exact-value
  recall.
