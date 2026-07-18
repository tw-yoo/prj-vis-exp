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

## Change 3 — text unification: every system now uses the Ours wording verbatim (this commit)

**Problem** (2026-07-18): Change 1 only fixed explanations whose *conclusion value*
contradicted the shown answer. It did not touch cases where every system reached
the same value but described it in **different words**, or where a system split
the explanation into a different number of segments than Ours. A user-study
explanation must read identically across systems for a given chart — otherwise a
participant comparing "System A" vs "System B" on the same chart is really
comparing prose style, not the explanation mechanism under test.

**Policy adopted**: Ours is the canonical text for all 20 active items. Every
other system is now rewritten, segment-for-segment, to Ours' exact wording:
- **B1** — the Ours steps joined into one paragraph (B1 has always been a single
  block of prose; no per-step interaction).
- **B2** — one scene per Ours step, `text_chunk` set verbatim to that step's
  text. Where B2 had *more* scenes than Ours steps, the redundant intermediate
  scene(s) were dropped (B2 scenes are cumulative SVG snapshots, so dropping an
  intermediate scene loses no visual state — the kept scenes already contain it).
  No chart needed B2 scenes *added*.
- **B3** — one manifest step per Ours step, `text` set verbatim, `fn` pointing at
  the expert module function whose animation matches that step. Where the
  module had *fewer* real step functions than Ours steps, the animation code
  was split into additional functions (reusing empty stub exports where
  present) so each Ours step gets its own visual increment. Where the module
  had *more* functions than Ours steps, a merge wrapper was added that calls
  the grouped functions in sequence, and the manifest points at the wrapper —
  no functions were deleted, no visual design (colors/positions/durations)
  changed, only regrouped.

**Also removed everywhere**: the phrase "(ignoring the 2011–2014 restriction)"
/ "(ignoring the 2011–2014 window)" from `0jbrb1dcbliiampz` (Ours step text and
the B3 manifest/module wording) — the deception mechanism (the year window
being silently dropped) still stands, it is simply no longer narrated aloud.

**Segment-count changes** (systems whose scene/step count changed; all other
systems for that chart already matched Ours' count and only got a wording
pass): `11e148qcs7x70t8v` B2 3→2, B3 3→2 (merge); `16fif5hdi8yzml00` B3 2→3
(split); `8chfa8n079zpfigi` B2 3→2, B3 1→2 (split); `0jbrb1dcbliiampz`,
`2bhsybiilde28j87`, `66va2s35es5t86l3`, `0gvrmm8qbn6o1vya`, `77xb5ug5lhfmkb74`,
`1a09xqtrj8zms716`, `10t8o5vhethzeod1`, `01mksjs373fhcl4q` B2 3→2 (drop one
redundant scene, no B3 change); `0egzejn5mejtnfdm` B3 2→3 (split);
`16aphfabldrpgcmd` B3 1→3 (split); `0xc7sx6ll8fl5rgh` B3 5→2 (merge);
`10gtgmmgh599jnr7` B3 4→3 (merge); `2s65jcap9pn289qx` B3 2→3 (split);
`95yhyqjyeu4fohbj` B3 1→3 (split); `2eiyyw562tcvjypp` B3 1→3 (split).
`0wflwm4jebx7n12y` and `1k8qhmg9rui7gtzh` already matched Ours' count on both
B2 and B3 — wording pass only (B3 for `0wflwm4jebx7n12y` was additionally
mis-wired: the manifest ran function1/function2 in the wrong order relative to
what each function actually draws — corrected to function2→function1→function3).

**Verification**: `scripts/eval_audit_explanations.py` now also asserts, for
every item × system, that the segment count and every segment's text are
byte-identical to the corresponding Ours step (`check_uniformity`), in addition
to the pre-existing conclusion-value consistency check — 80/80 PASS both checks.
All 10 edited B3 expert modules re-verified by running their base render + full
step sequence in a real browser (no exceptions) and spot-checked visually
(screenshots) for the handful of steps that mutate existing DOM node
attributes only (opacity/highlight changes, which don't move the node-count
proxy but ARE visually correct).

Any participant whose session ran before this change (**SO1CO1, SO1CO2,
SO1CO4, SO2CO3** per the list above, plus anyone else who started before this
deploy) saw system-inconsistent wording/segment counts — exclude explanation-
wording comparisons for their trials, or flag separately; value-level scoring
(Change 1/2) is unaffected.

## Scoring guidance for pre-change trials

- Group 1a trials (item × B1, plus 0jbrb/0xc7 × B2): the deception manipulation
  was broken — exclude from deception-detection analyses or flag separately.
- Group 1b trials: the participant saw a correct `Answer:` contradicted by its
  explanation; "No (answer is wrong)" responses on these trials are not evidence
  of poor verification — flag before computing judgment accuracy per system.
- Change 2: no correctness flip; treat as cosmetic unless analyzing exact-value
  recall.
