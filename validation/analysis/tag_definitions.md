# Tag Definitions — validation/data visual-strategy catalog

Vocabulary used in `strategy_catalog.csv` (column `visual_effects`). Effects were read
statically from the D3 reconstruction files under `validation/data/<expert>/<expert>_q<N>.js`.
One catalog row = one non-empty `functionN` (= one operation step). `operation_type` is derived
from the matching `chart_map.json` explanation (`explanation.functionN`) + code; `visual_effects`
are the D3 techniques the code actually draws.

Legend: **[ref]** = from the task's reference naming convention; **[new]** = introduced during
analysis (not in the reference list). Frequencies are occurrences across all 234 rows; `Nex` = number
of distinct experts (out of 10) in which the tag appears.

---

## RESHAPING family

- **remove_rescale** [ref] — data points removed/filtered out AND an axis domain recomputed to fit
  the surviving subset (marks re-laid-out). — 17 occ / 5ex. First: e1_q5 function1 (drop Television, rescale y).
- **fade_context** [ref] — non-selected marks dimmed (opacity ~0.2–0.4) but kept visible as context. — 73 occ / 10ex. First: e1_q1 function2.
- **window_shading** [ref] — background rectangle drawn behind a contiguous span (range of categories / a
  time window) to shade that region. — 26 occ / 8ex. First: e1_q2 function4 (bg band over "above-in-both" seasons).
- **reencode_stack_to_group** [ref] — stacked bars re-encoded as grouped bars. — 4 occ / 3ex. First: e1_q7.
- **reencode_group_to_stack** [ref] — grouped bars re-encoded as stacked bars. — 4 occ / 2ex. First: e6_q3 / e10.
- **reencode_line_to_bar** [ref] — a line (or a subset of it) re-encoded/materialized as bars. — 13 occ / 7ex. First: e1_q4 function3.
- **reencode_group_to_bar** [new] — grouped (multi-series) bars reduced/re-encoded to single-series simple
  bars (e.g. filter to one year, then show one bar per category). Parallel to `reencode_line_to_bar`;
  kept distinct from `reencode_group_to_stack`. — 2 occ / 1ex. First: e5_q3 function1.
- **transpose_encoding** [new] — an encoding transpose that swaps which field maps to the category/x axis
  vs. the series/color (e.g. category↔series). — 1 occ / 1ex. First: e8_q3 function1.
- **collapse_to_single** [ref] — multiple marks aggregated into ONE summary mark (a single Sum / Average
  bar; domain like ['Sum']). — 18 occ / 5ex. First: e1_q4 function4 (sum bar).
- **axis_rescale** [ref] — an axis domain rescaled/changed as the salient effect, NOT driven by row removal
  (e.g. a fresh panel gets its own y-scale). — 42 occ / 7ex. First: e1_q2 function1.
- **reorder_slide** [new] — existing marks animate their position to a re-sorted / re-centered order (the
  visual realization of a sort). The slide itself is a transition; the tag records the *reordering* strategy. — 2 occ / 1ex. First: e1_q6 function1 (bars slide into ascending-sorted order).

## DRAWING family

- **reference_line** [ref] — a full-plot-width horizontal (or full-height vertical) reference line,
  typically avg / threshold / median. — 51 occ / 10ex. First: e1_q1 function1.
- **local_reference_line** [ref] — a reference line spanning only a LOCAL subset/segment, not the full plot. — 17 occ / 8ex. First: e1_q3 (per-panel avg on narrow panel) / e2.
- **partition_divider** [new] — a full-height vertical (or full-width horizontal) line that DIVIDES the
  plot into labeled regions (e.g. a year-split boundary), rather than marking a value. — 1 occ / 1ex. First: e10_q4 function2.
- **axis_gridlines** [new] — a set of evenly-spaced gridlines spanning the plot to aid value reading
  (scaffolding; no data operation). — 1 occ / 1ex. First: e3_q6 function1. (See also e4_q9 function1, tagged reference_line by the reading agent — a boundary case; both are value-reading aids.)
- **double_arrow_diff** [ref] — a two-headed arrow / bracket / vertical span annotating the MAGNITUDE of a
  difference between two values. — 36 occ / 9ex. First: e1_q? / e2.
- **single_arrow_change** [ref] — a single-headed arrow indicating a change / direction between two points. — 12 occ / 5ex. First: e2 / e3.
- **connector_arrow_cumulative** [ref] — arrow(s) connecting marks to show a cumulative build-up. — 1 occ / 1ex. First: e7.
- **materialized_chart** [ref] — a brand-new auxiliary chart built to show COMPUTED / DERIVED values
  (e.g. a small bar chart of two computed averages). Distinct from `reencode_*` (which re-encodes the
  same raw data) and from `isolated_subset_chart` (raw subset). — 31 occ / 8ex. First: e1_q3 function4.
- **isolated_subset_chart** [new] — a brand-new auxiliary chart built by isolating a RAW subset of the
  source data (same encoding), rather than derived/aggregated values. Distinguished from
  `materialized_chart` (computed values) and from `reencode_*` (encoding change). — 2 occ / 1ex. First: e6_q7 function1.
- **segment_highlight_overlay** [new] — a highlight-colored stroke drawn ON TOP OF a contiguous subset of
  an existing data line (line-chart specific), to mark spans (e.g. rising runs). — 1 occ / 1ex. First: e1_q4 function1.
- **text_value_label** [ref] — a text annotation stating a numeric value, count, or result
  (e.g. "average = 2.8", "Sum = 12.4", "3 years above average", "European − Asian = 41"). — 157 occ / 10ex. First: e1_q1 function1.
- **opacity_emphasis** [ref] — SELECTED marks recolored / enlarged / kept-highlighted to stand out. Often
  co-occurs with `fade_context` (the two together form the highlight/dim pair). — 72 occ / 10ex. First: e1_q1 function2.
- **side_by_side_views** [ref] — two or more panels shown simultaneously (split view / small multiples),
  each with its own axes. Includes vertically-stacked panels (top/bottom), noted where orientation differs. — 7 occ / 3ex. First: e1_q2 function1.
- **boolean_marker_glyph** [new] — a per-category glyph/symbol (e.g. ▲ vs ·) placed at each category to
  mark which pass a boolean test. — 1 occ / 1ex. First: e3_q2 function2.
- **threshold_region_shade** [new] — a background rectangle filling the plot area on one side of a
  horizontal reference line (a value-range region, e.g. "above threshold"). Distinct from `window_shading`
  (which shades a contiguous span of *categories/time*, not a *value* region). — 1 occ / 1ex. First: e4_q9 function3.

## TRANSITION family (recorded separately from static effects)

Transition tags were **not** taken from the reading agents (their coverage was uneven). They were
recomputed uniformly by a deterministic per-function static scan (`analysis/raw/assemble.py`,
`detect_transitions()`), so the numbers are reproducible. Detection rules:

- **transition_fade** — the function contains an opacity entrance/exit: `attr('opacity', 0)` animated up,
  or `attr('opacity', 0).remove()` (layer/element crossfade-out). — 91 occ / 7ex.
- **transition_grow** — an element created at zero extent then animated open: `attr('height', 0)` (bar/segment
  grow from baseline) or `attr('x2', 0)` (reference/segment line draw-in). — 25 occ / 5ex.
- **transition_recolor** — an existing `selectAll(...).transition().duration(...)` chain that restyles
  `fill` / `r` / a conditional `opacity` in place (no zero-entrance; marks not freshly created). — 25 occ / 5ex.
- **transition_stagger** — per-element indexed delay: `.delay(i*…)` / `.delay(idx*…)`. — 4 occ / 1ex.
- **transition_morph** — `attrTween(...)`, or a d3 `.join()` `(update)=>` branch that transitions geometry,
  or an existing selection retweening `d`/`cx`/`cy` to a new scale (conservatively detected; may undercount). — 1 occ / 1ex.

> The authoritative, fully reproducible transition signal is the **raw per-file count** of `.transition(` +
> `attrTween(` calls (see summary_report.md). Subtype attribution above is advisory for the rich-animation
> experts (e1–e4); it is exact for presence.

---

## Normalization / merge log (Phase 2)

The normalization pass reviewed every tag for same-concept variants. Actions taken:

1. **Transition family fully re-derived, not merged.** The 10 reading agents tagged transitions with very
   uneven thoroughness (e.g. `transition_fade` appeared for 7 experts, `transition_grow` for 6, `transition_morph`
   for only 1). Rather than merge inconsistent agent tags, **all agent `transition_*` tags were discarded and
   replaced** by the deterministic `detect_transitions()` scan applied identically to all 100 files. This
   removed agent variance entirely. Verified against the raw `.transition(`/`attrTween(` grep counts: the
   scan yields **zero** transitions for e5/e6/e7 (which have zero transition calls) and matches the animated
   experts — see summary. No information was lost: the raw call counts are reported as ground truth.

2. **No static-effect tags merged.** All 11 newly-introduced tags were reviewed against the reference
   vocabulary and against each other. Each was kept as a genuinely distinct concept; none was an alias of a
   reference tag. Closest-pair reviews and the decision to keep separate:
   - `isolated_subset_chart` vs `materialized_chart`: kept separate — the former shows a RAW data subset,
     the latter shows COMPUTED/DERIVED values. (Different explanatory intent.)
   - `reencode_group_to_bar` vs `reencode_group_to_stack` / `reencode_line_to_bar`: kept separate — a distinct
     target encoding (single-series simple bars).
   - `threshold_region_shade` vs `window_shading`: kept separate — value-range region (one side of a
     reference line) vs contiguous category/time span.
   - `partition_divider` vs `reference_line`: kept separate — a region-dividing boundary vs a value marker.
   - `axis_gridlines` vs `reference_line`: kept separate — value-reading scaffolding (many evenly-spaced
     lines) vs a single semantic reference. One boundary case (e4_q9 function1) was left as `reference_line`
     per the reading agent; flagged in that row's notes.
   - `reorder_slide`, `segment_highlight_overlay`, `boolean_marker_glyph`, `transpose_encoding`: no reference
     equivalent; kept as-is.

   Per the task's guidance (over-splitting is recoverable by a later merge; wrong absorption is not), all
   low-frequency new tags were retained rather than force-merged. A future consolidation could, if desired,
   collapse `isolated_subset_chart`→`materialized_chart` and `reencode_group_to_bar`→a general `reencode_to_bar`,
   but this was deliberately NOT done here to preserve semantic distinctions in the source data.

3. **Reference-name conformance.** Where an observed effect matched a reference concept, the reference name
   was used verbatim by the reading agents; no divergent synonyms required renaming.
