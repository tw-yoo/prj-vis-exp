# Summary Report — validation/data visual-strategy catalog

Static analysis of the 100 D3 reconstruction files under `validation/data/` (10 experts E1–E10 ×
10 items each). Source code was **read only, never modified**. Main output: `strategy_catalog.csv`.
Tag vocabulary + detection rules + merge log: `tag_definitions.md`.

## Structure recovery (unambiguous — no blocking report needed)

- File naming `e<E>/e<E>_q<N>.js` cleanly encodes **expert_id = e1..e10** and **item = q1..q10**.
- **item_id = `e<E>_q<N>`** is unique per (expert, item). Each expert authored their OWN 10
  (chart, compositional question, explanation) tuples — the question at `qN` differs across experts
  (100 distinct items total), so `qN` is *not* a shared chart.
- **chart_type is fixed by q-number** (confirmed via `renderValidation<Type>Chart` names, uniform
  across all experts): q1,q6 = SimpleBar · q2,q7 = StackedBar · q3,q8 = GroupedBar · q4,q9 = SimpleLine ·
  q5,q10 = MultipleLine. So each expert covers all 5 chart types twice.
- Each file = `data_rows` + a base renderer + `function1..K` exports. Each **non-empty** `functionN`
  is one operation step; its semantics come from `chart_map.json` → `explanation.functionN`.

## Coverage

- **234 catalog rows** across **100/100 items** (no expert or tuple missing).
- Rows per expert: E1 32 · E2 27 · E3 26 · E4 32 · E5 18 · E6 19 · E7 21 · E8 17 · E9 18 · E10 24.
- Rows per chart type: GroupedBar 50 · StackedBar 49 · SimpleLine 47 · SimpleBar 44 · MultipleLine 44.
- **11 items are single-operation rows** (E5_q4, E5_q9, E5_q10, E6_q5, E8_q6, E8_q9, E8_q10, E9_q4,
  E9_q6, E9_q8, E9_q10): verified that their `function2`/`function3` bodies are genuinely empty —
  these experts render the whole multi-step explanation inside one `function1`, so the effects are
  attributed to a single combined operation row (a real limitation of those reconstructions, not
  missing analysis).

## operation_type distribution
diff 49 · average 39 · extremum 37 · boolean 26 · filter 23 · count 20 · sum 18 · reshape 12 · rank 6 · lookup 4.
(`reshape` = a purely structural step — split/re-encode/isolate — with no scalar computed.)

## Final tag frequencies (occurrences / distinct experts)

**Top 10 (highlighted):**

| rank | tag | occ | experts |
|-----:|-----|----:|--------:|
| 1 | text_value_label | 157 | 10 |
| 2 | transition_fade | 91 | 7 |
| 3 | fade_context | 73 | 10 |
| 4 | opacity_emphasis | 72 | 10 |
| 5 | reference_line | 51 | 10 |
| 6 | axis_rescale | 42 | 7 |
| 7 | double_arrow_diff | 36 | 9 |
| 8 | materialized_chart | 31 | 8 |
| 9 | window_shading | 26 | 8 |
| 10 | transition_grow / transition_recolor (tie) | 25 | 5 |

**Remaining tags:** collapse_to_single 18(5) · local_reference_line 17(8) · remove_rescale 17(5) ·
reencode_line_to_bar 13(7) · single_arrow_change 12(5) · side_by_side_views 7(3) · transition_stagger 4(1) ·
reencode_stack_to_group 4(3) · reencode_group_to_stack 4(2) · reorder_slide 2(1) · reencode_group_to_bar 2(1) ·
isolated_subset_chart 2(1) · segment_highlight_overlay 1(1) · transition_morph 1(1) · boolean_marker_glyph 1(1) ·
axis_gridlines 1(1) · threshold_region_shade 1(1) · connector_arrow_cumulative 1(1) · transpose_encoding 1(1) ·
partition_divider 1(1).

**Interpretation.** The core, cross-expert-universal strategies are: annotate a computed value with a
**text label** (all 10 experts), draw a **reference line** for averages/thresholds (all 10), and
**highlight-and-dim** the relevant marks (`opacity_emphasis` + `fade_context`, all 10). Differences /
comparisons are shown with a **double-headed arrow** (9 experts). Multi-step answers frequently
**materialize a new derived chart** (8 experts). The long tail of single-expert tags represents
idiosyncratic techniques (glyphs, gridlines, transposition, cumulative connectors, partition dividers).

## Key finding — animation is an expert-level stylistic split (reproducible)

Raw count of `.transition(` + `attrTween(` calls per expert (deterministic grep, ground truth):

| E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|----:|
| 85 | 97 | 59 | 69 | 0 | 0 | 0 | 4 | 2 | 2 |

Experts **E1–E4 richly animate** every step (fade/grow/recolor/stagger); **E5, E6, E7 are fully
static** (zero transitions); **E8, E9, E10 are near-static**. Because the reading agents tagged
transitions unevenly, all `transition_*` tags in the CSV were **discarded and re-derived** by a single
deterministic per-function scan (rules in `tag_definitions.md`), so transition counts are reproducible
and the E5–E7 zeros are correct rather than an artifact of under-reading.

## Merge history (Phase 2 normalization)

- **Transition family:** agent tags dropped wholesale; replaced by the uniform `detect_transitions()`
  scan. No merges within static families.
- **11 new tags reviewed, all kept distinct** (no wrong-absorption): `isolated_subset_chart` vs
  `materialized_chart` (raw vs derived), `reencode_group_to_bar` vs other reencodes, `threshold_region_shade`
  vs `window_shading` (value-region vs category-span), `partition_divider` vs `reference_line`,
  `axis_gridlines` vs `reference_line`. Full rationale in `tag_definitions.md`. Optional future consolidations
  are listed there but were deliberately not applied.

## Reference-vocabulary tags never observed

**None.** All 17 reference tags (remove_rescale, fade_context, window_shading, reencode_stack_to_group,
reencode_group_to_stack, reencode_line_to_bar, collapse_to_single, axis_rescale, reference_line,
local_reference_line, double_arrow_diff, single_arrow_change, materialized_chart, text_value_label,
opacity_emphasis, side_by_side_views, connector_arrow_cumulative) appear at least once. `connector_arrow_cumulative`
is the rarest (1 occurrence, E7).

## Low-confidence rows (6) — full list with reasons

1. **E2_q2 op3 [boolean]** `window_shading|opacity_emphasis|transition_fade` — explanation-vs-code mismatch:
   explanation.function3 describes a Jan–Oct 2019 SK>France comparison, but the code hardcodes and shades
   the **2018** period band. Effects are clear; the operand year is inconsistent with the text.
2. **E3_q6 op1 [reshape]** `axis_gridlines|transition_grow` — value-reading gridlines only (no data op);
   `operation_type=reshape` is a forced closest term for pure scaffolding.
3. **E4_q9 op1 [lookup]** `reference_line|transition_grow` — per-tick gridline value-reading aid (no scalar
   computed); boundary case between `axis_gridlines` and `reference_line` (left as reference_line).
4. **E9_q9 op1 [extremum]** `materialized_chart|axis_rescale` — explanation's decisive step is argmax (2016),
   but the code only MATERIALIZES the per-year diff line and never marks/highlights the maximum; could
   equally be `diff` for what is actually drawn.
5. **E9_q9 op2 [boolean]** `fade_context|opacity_emphasis|single_arrow_change|text_value_label` —
   **BROKEN COPY-PASTE LEFTOVER**: references month tokens 'Jun'/'Jul' absent from this quarter/year
   dataset, has no matching `explanation.function2`; the selections are empty so the connector line is
   degenerate. Net visible effect is "everything dimmed + a stray placeholder". Flagged as a source-file bug.
6. **E10_q4 op4 [diff]** `double_arrow_diff|text_value_label` — idempotent redraw (removes then re-appends
   identical arrows/labels, no new marks). A code comment flags that the gold answer (2020 biggest) is
   wrong — recompute gives 2021 larger; retained as an authoring/stimulus decision, not a render bug.

## Notes for the researcher

- Two data-quality issues in the reconstructions surfaced during analysis and are worth a look before
  using these as paper stimuli: **E9_q9** (broken Jun/Jul copy-paste leftover; function2 renders nothing
  meaningful) and **E2_q2** (highlighted period 2018 vs. explanation's 2019). Also **E10_q4** carries an
  in-code note that its gold conclusion is arithmetically wrong.
- Confidence: 186 high / 42 medium / 6 low. Medium rows are mostly cases where `operation_type` required
  light inference from the explanation, or where a computation (e.g. lagDiff-style consecutive-change
  detection) was mapped to the closest operation term (`diff`).
- Provenance/reproducibility: per-agent structured outputs in
  `analysis/raw/combined_raw.json`; transition re-derivation + CSV build in `analysis/raw/assemble.py`;
  normalized rows in `analysis/raw/normalized.json`; per-expert explanation slices in `analysis/raw/e*_map.json`.
