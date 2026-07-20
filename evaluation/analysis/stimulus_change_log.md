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

## Change 4 — deception repairs on three items (this commit, 2026-07-20)

Three items were reviewed after 6 participants (SO1CO1–SO1CO4, SO2CO1, SO2CO2)
had completed. All three had a manipulation that either did not work or
contradicted its own chart. **Every one of the 6 is a pre-change participant for
these three items.**

Detection rates BEFORE this change (participants answering "No" = spotted the
planted answer): `10t8o5vhethzeod1` **6/6**, `11e148qcs7x70t8v` 5/6,
`0xc7sx6ll8fl5rgh` 5/6 — the 6/6 confirms the first item's deception was inert.

### 4a. `10t8o5vhethzeod1` — shown answer 2017 → **2012**

"In which year was the agriculture sector the highest". Agriculture peaks at
2011 (0.3498); the planted answer was 2017 (**0.2708**), the 8th of 11 bars, so
the claim "tallest = 2017" was refuted by a glance at the chart. Moved the
planted answer to 2012 (**0.3315**) — third tallest, just under 2011 — so the
mistake is plausible and the item actually tests verification.
True answer stays 2011; `answerIsCorrect` stays false.
Changed: Ours `ops2.retrieveValue.target`, Ours step 2 text ("Its tallest year is
2012 (33.2%)."), `chart_group.answer`, B1/B2/B3 texts, B3 module bar selector,
and B2 scene 1 — both its `d3_code` (now derives the leader-line anchor from the
bar instead of baked pixels) and its baked `svg_code` snapshot, whose
`agri-max-guide` had been sitting at 2011's top (123.538), i.e. leaking the true
answer; it now sits at 2012's top (127.015).

### 4b. `11e148qcs7x70t8v` — step 2 now marks BOTH France-ahead periods

"in which years does south korea have a bigger value than france?" France leads
in 2014 (Δ −0.262) **and** 2015 (Δ −0.040), but step 2 was `findExtremum(min)`,
which marked only 2014. Replaced with `filter(< 0)` (the shape already used by
`11e148qccorrect.ops.json`), so 2014 and 2015 stay at full opacity and the other
four periods dim to 0.2.
The deception is preserved and becomes a boundary case: the shown answer still
counts 2015, and step 2 now reads "France is ahead in 2014 (Δ −0.26) and only
barely in 2015 (Δ −0.04, essentially even), so from 2015 on South Korea is level
or ahead — 2015 through Jan-Oct 2019 all count." The participant must notice
that "essentially even" is actually France ahead.
Changed: Ours `ops2`, Ours step 2 text, B1/B2/B3 texts, B3 module (highlight band
now spans 2014+2015). `chart_group.answer` unchanged.

### 4c. `0xc7sx6ll8fl5rgh` — shown answer 0.37 → **0.368**

The Ours chart drew `Average: 0.368` while the step text and `chart_group.answer`
said `0.37`. Unified on the value the chart computes, 0.368 (= mean of all four
Clinton bars, the flawed all-ages average). True answer stays 0.31 (mean over the
three ages where Clinton trails); `answerIsCorrect` stays false.
Changed: Ours step 2 text, `chart_group.answer`, B1/B2/B3 texts, and the B3
module labels (`toFixed(0)` → `toFixed(1)`, so "37%" → "36.8%").
Note: the "0.7" reported during review was a **y-axis tick label** on the B1/B2
base chart, not an answer — no system ever displayed 0.7 as the result.

**Verification**: `scripts/eval_audit_explanations.py` 80/80 PASS (both the
conclusion-value and the text-uniformity checks); `npm run build` clean; all
three items re-rendered in a real browser for every system and inspected
(highlighted marks, dimmed marks, and drawn labels) plus screenshots.

**Analysis impact**: for these three items the 6 completed participants saw the
OLD stimuli. 4a additionally changes the *shown answer*, so their `answer_shown`
(2017) differs from every later participant's (2012) — treat 4a trials as a
different stimulus, not a rewording. 4b/4c keep the same shown answer set
(4c only re-rounds it), so those trials stay comparable at the judgment level
but not at the explanation level.

## Change 5 — B3 rendering fixes (this commit, 2026-07-20)

B3-only visual repairs found in review. **No step text changed anywhere**, so the
cross-system text uniformity from Change 3 is untouched (audit still 80/80).

### 5a. `8chfa8n079zpfigi` step 1 — out-of-range points were invisible

`function1` dimmed the non-matching year points to `opacity 0.18` at `r=3` with a
pale `#94a3b8` fill, which read as **the points being deleted** rather than
de-emphasised. Now `opacity 0.45`, `r=4`, `#64748b` — clearly subordinate but
still present (10 selected points at full opacity, 8 dimmed).

### 5b. `2eiyyw562tcvjypp` step 3 — dropped the duplicated near-tie hint

The module's summary label read "Russia higher: 3 years (incl. near-tie 2009)".
The near-tie admission is already in the shared step-2 text every system shows
("…including near-ties (within 1 point): 2007, 2009, 2015"), so B3 was flagging
the planted flaw **twice** while B1/B2/Ours flagged it once. Label is now just
"Russia higher: 3 years"; the step text is unchanged, so the item's hint budget
now matches the other systems instead of exceeding them.

### 5c. All B3 arrowheads — restyled to read as arrows

13 expert modules define an arrowhead marker and 10 of them apply it to **both**
ends of a span line. Two defects:
- `refX` sat at the marker's midpoint (5, or 9 in one module), so the head
  straddled the target instead of terminating on it — the arrow overshot the
  value it pointed at.
- 5 modules used `orient: 'auto'` together with `marker-start`, which points the
  start head *along* the line (into the shaft) instead of back out of it.

All 13 now use `refX: 10` (the tip, so it lands exactly on the target),
`orient: 'auto-start-reverse'` (start head points outward), and a barbed head
(`M 0 0 L 10 5 L 0 10 L 3 5 z` / `M0,-5L10,0L0,5L3,0Z`) instead of a plain
wedge. Sizes, colours and stroke widths are unchanged.

**Verification**: all 10 arrow-bearing B3 charts re-run step-by-step in a real
browser — 0 console errors, every marker now `refX=10, auto-start-reverse` — plus
screenshots at 1× and 4×; `eval_audit_explanations.py` 80/80 PASS;
`npm run build` clean.

**Analysis impact**: cosmetic/legibility only for 5c. Affected trials already
collected (per `trials.csv`):
- 5a `8chfa8n079zpfigi` × B3 — **SO1CO2** (answered Yes, judged incorrectly). Saw
  the version where out-of-range points looked deleted.
- 5b `2eiyyw562tcvjypp` × B3 — **SO1CO1** (No, correct) and **SO2CO2** (Yes,
  incorrect). Both saw the extra on-chart near-tie hint that B1/B2/Ours did not
  show, so B3 detection on this item is not poolable with later B3 trials.

## Scoring guidance for pre-change trials

- Group 1a trials (item × B1, plus 0jbrb/0xc7 × B2): the deception manipulation
  was broken — exclude from deception-detection analyses or flag separately.
- Group 1b trials: the participant saw a correct `Answer:` contradicted by its
  explanation; "No (answer is wrong)" responses on these trials are not evidence
  of poor verification — flag before computing judgment accuracy per system.
- Change 2: no correctness flip; treat as cosmetic unless analyzing exact-value
  recall.
