# Deception (Incorrect-Item) Analysis — G1–G4

Study design: 8 of the 20 active charts (2 per group G1–G4) show a **wrong answer**
paired with an explanation containing the matching reasoning flaw. Each deception
is a **single-point perturbation** of the correct operation chain — one threshold,
one constraint, or one operand is twisted — so the wrong explanation looks almost
identical to the correct one except for a single misplaced highlight / arrow /
reference line.

`shown` = value presented to the participant (wrong). `true` = actual correct value.

## Correct / Incorrect matrix (by chart type × group)

| Chart type | G1 | G2 | G3 | G4 |
|---|:--:|:--:|:--:|:--:|
| Simple Bar    | correct   | **INCORRECT** | correct   | correct   |
| Stacked Bar   | **INCORRECT** | correct   | correct   | **INCORRECT** |
| Grouped Bar   | correct   | **INCORRECT** | **INCORRECT** | correct   |
| Simple Line   | **INCORRECT** | correct   | correct   | correct   |
| Multiple Line | correct   | correct   | **INCORRECT** | **INCORRECT** |

Each group has exactly 2 incorrect. (G5 = all-correct backup; G0 empty.)

## Deception mechanism taxonomy

- **T1 — Boundary / threshold shift**: the cutoff is moved one notch so a single
  boundary item flips in or out of the set.
- **T2 — Scope / constraint violation**: a stated restriction (year window,
  conditional clause, "last N") is ignored, widening the selected set.
- **T3 — Wrong extremum / operand**: a non-extreme or 2nd-place element is chosen
  instead of the true max/min.

## Per-item analysis

### T1 — Boundary / threshold shift

**G1 · Simple Line · `8chfa8n079zpfigi`** — "How many years have a value between 19 and 30?" · shown **10** / true **11**
- Flaw: `filter >20` instead of ≥19 → excludes the boundary year (~20).
- Visual signature: on the line only **10** points turn red; the one point near value 20 stays dim (uncolored). Correct = 11 red points.

**G4 · Multiple Line · `2eiyyw562tcvjypp`** — "How many years has Russia had higher favorability than the US?" · shown **3** / true **2**
- Flaw: `filter ≥ −1` (within-1-point tolerance) instead of ≥0 → counts a near-tie (2009, where Russia is actually 1 below).
- Visual signature: highlight bands/red points appear on **3** years (2007, 2009, 2015); 2009's Δ arrow points **downward (US ahead)** yet is still counted. Correct = 2.

**G1 · Stacked Bar · `11e148qcs7x70t8v`** — "In which years does South Korea have a bigger value than France?" · shown **2015–Jan-Oct 2019** / true **2016–Jan-Oct 2019**
- Flaw: 2015 (pairDiff Δ ≈ 0, France slightly ahead) is judged as "South Korea leads".
- Visual signature: 2015's Δ arrow is essentially **zero (a tie)** but is colored as a Korea-win period. Correct excludes 2015.

### T2 — Scope / constraint violation

**G2 · Simple Bar · `0jbrb1dcbliiampz`** — "How many years had investments over 22 Billion Euros in 2011 to 2014?" · shown **7** / true **3**
- Flaw: `filter >22` only — the **2011–2014 year window is ignored entirely**.
- Visual signature: instead of 3 red bars inside 2011–2014, **7 bars across the whole chart** turn red — the highlighting spills far outside the year window.

**G3 · Grouped Bar · `0xc7sx6ll8fl5rgh`** — "What is the average of the vote share at an age when Clinton received a lower vote share?" · shown **0.37** / true **0.31**
- Flaw: the "where Clinton is lower" condition is dropped → averages **all** of Clinton's age-group bars.
- Visual signature: **every** Clinton bar is highlighted and the average reference line sits **higher (0.37)**. Correct highlights only the qualifying subset with a lower line (0.31).

**G3 · Multiple Line · `2s65jcap9pn289qx`** — "What is the sum of the differences between women and men in the last five years?" · shown **196.94** / true **163.28**
- Flaw: `filter Year>2014` yields 2015–2020 = **6 years** ("last five" but one too many).
- Visual signature: **6** per-year Δ arrows (extra one at 2015) and a larger sum badge. Correct = 5 arrows.
- (Note: this item was also re-authored so the difference reads as a positive magnitude, arrows Female→Male, per a later fix.)

### T3 — Wrong extremum / operand

**G2 · Grouped Bar · `0egzejn5mejtnfdm`** — "What is the difference between Scotland's largest value and England & Wales's smallest value?" · shown **12** / true **26**
- Flaw: E&W's true minimum (2%) is dismissed as an "outlier"; the **2nd-smallest (16)** is used → 28 − 16 = 12.
- Visual signature: the min reference line lands on the **16 bar, not the actual lowest (2%) bar**, so the vertical diff arrow is **short** (28→16). Correct arrow spans 28→2.

**G4 · Stacked Bar · `10t8o5vhethzeod1`** — "In which year was the agriculture sector the highest?" · shown **2017** / true **2011**
- Flaw: `retrieveValue(2017)` points to 2017 instead of the actual tallest year 2011.
- Visual signature: the emphasis + "Highest Agriculture: 2017" annotation lands on a **visibly shorter bar** (2017) while the taller 2011 bar sits right there — the label points at a non-maximum.

## Type-level signature summary

| Chart type | Mechanism | One-line visual signal |
|---|---|---|
| Simple Bar (G2)    | T2 constraint ignored | mass highlight spills outside the year window (3→7) |
| Stacked Bar (G1)   | T1 near-tie           | a Δ≈0 (tie) bar is colored as a win |
| Stacked Bar (G4)   | T3 wrong extremum     | "highest" label on a shorter-than-neighbor bar |
| Grouped Bar (G2)   | T3 2nd-place operand  | min reference line not on the actual lowest bar → short arrow |
| Grouped Bar (G3)   | T2 condition dropped  | average line higher, too many bars highlighted |
| Simple Line (G1)   | T1 boundary excluded  | exactly one boundary point left uncolored |
| Multiple Line (G3) | T2 range over-count   | one extra Δ arrow + larger sum |
| Multiple Line (G4) | T1 near-tie included  | band covers a year whose Δ points the wrong way |

**Key takeaway**: all 8 are single-point perturbations (one threshold / one
constraint / one element). The wrong explanation is therefore near-identical to
the correct one, differing only in a single misplaced highlight, arrow, or
reference line — which is what makes the plausible-but-wrong judgment task hard.
