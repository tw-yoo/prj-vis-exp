# Incorrect-answer items — regeneration spec for B2 and B3

The study uses a balanced **correct / incorrect answer** design so participants
actually have to judge correctness (and so the "error-detection" measure has
variance). **8 of the 20 active charts** (2 per active group G1–G4) show a
**wrong answer**, paired with an **explanation that contains the matching
reasoning flaw**. The other 12 active charts (and all of G5 backup) are correct.

For a fair comparison, the *same chart* must carry the *same wrong answer and the
same conceptual flaw* in **every** system (only the explanation **format** may
differ). Ours (operation-new) and B1 (text) are already done. **You must
regenerate B2 (SVG scenes) and B3 (expert) for these 8 charts** so their
explanations derive the wrong answer with the same flaw.

## Already applied (do not change)
- `chart_group.json`: `answer` = the wrong value (shown), `answerIsCorrect: false`,
  `correctAnswer` = true value. (Correct items: `answerIsCorrect: true`.)
- `baselines/baseline_input.json[id].explanation`: flawed B1 prose.
- `data/ours/ops/<id>.ops.json` + `steps/<id>.step.json`: flawed, executor-verified
  ops + narration (Ours animates the flaw and ends on the wrong value).
- Submission records ground truth (`answerIsCorrect`, `correctAnswer`, `answerShown`).

## What B2 / B3 must do for each of the 8 charts
1. The explanation must **derive and end on the WRONG answer** below (not the true value).
2. It must embody the **same flaw** (so the error is the same across formats).
3. **Do not show the correct value anywhere** in the scenes/steps.
4. Keep the flaw as subtle as the description (most are near-ties / boundary / off-by-one) — the point is that a good explanation lets you catch it.

## The 8 incorrect charts

| # | group · type | chart_id | question | correct (do NOT show) | **WRONG answer to show** | planted flaw (apply in every format) |
|---|---|---|---|---|---|---|
| 1 | G1 · bar_simple | `0wflwm4jebx7n12y` | difference between the average and the maximum | 141.25 | **150** | use a middle bar (~230) as the "average" instead of the true mean 238.75 → 380 − 230 |
| 2 | G1 · bar_stacked | `11e148qcs7x70t8v` | years South Korea > France | 2016, 2017, 2018, Jan-Oct 2019 | **2015, 2016, 2017, 2018, Jan-Oct 2019** | include 2015, where Korea (0.245) is *just below* France (0.285) but looks about even |
| 3 | G2 · bar_grouped | `0lua5jsw92d3enb4` | # diet types over 0.03 in 2019 | 8 | **12** | count types **at** 0.03 as over it (≥ instead of >) → +4 |
| 4 | G2 · line_simple | `66va2s35es5t86l3` | year with largest increase vs previous | 2010 (+15.0) | **2019** | pick the year with the highest VALUE (2019, 60.6) instead of the largest year-over-year increase (value-vs-change confusion) |
| 5 | G3 · bar_simple | `0gvrmm8qbn6o1vya` | average of seasons priced ≤ $60 | 53.41 | **54.79** | include 2012/13 ($63.10, just over $60) in the average |
| 6 | G3 · line_multiple | `2s65jcap9pn289qx` | sum of women−men differences, last 5 years | −163.28 | **−196.94** | use a 6-year window (2015–2020) instead of the last 5 (2016–2020) |
| 7 | G4 · bar_stacked | `10t8o5vhethzeod1` | year agriculture sector highest | 2011 (0.350) | **2017** | track the wrong stacked band — report where the **Services** band peaks (2017, 0.510), not Agriculture |
| 8 | G4 · bar_grouped | `0prhtod4tli879nh` | city with biggest 2010→2025 population jump | Delhi (+6.4) | **Tokyo** | pick Tokyo (the largest, most prominent city) as the "biggest jump", though Tokyo's change (+0.4) is actually the smallest |

> Note: items 4, 7, 8 use a "confusion"-type flaw (value-vs-change, wrong band, magnitude-vs-change) rather than "near-second", because the operation-new engine renders `findExtremum rank:2` inconsistently — these flaws render cleanly as a normal max/min selection in Ours. Match the wrong values exactly.

## Notes
- These wrong values are **executor-verified** (the flaw is a real wrong operation on the actual data), so Ours derives exactly these. Match them exactly in B2/B3.
- After you regenerate, the `answer` shown is already the wrong value (from `chart_group.json`) — B2/B3 only need their **explanation content** to match.
- Correct items (the other 17) need no changes.
