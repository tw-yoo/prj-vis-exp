# Tagging Rubric (fixed vocabulary — prefer these exact names)

You are statically reading D3 reconstruction files under `validation/data/<expert>/<expert>_q<N>.js`.
Each file has: `data_rows`, a `renderValidation<ChartType>Chart` base renderer, and `function1..functionK`
exports. Each **non-empty** `functionN` is ONE operation step of a multi-step visual explanation.
The semantic meaning of each step is given in the matching `chart_map` entry
(`explanation.function1..N`). **operation_type comes from the explanation semantics + code;
visual_effects come from what the code actually draws.**

## Chart type (fixed by q-number — do NOT re-derive, use this)
q1,q6 = SimpleBar ; q2,q7 = StackedBar ; q3,q8 = GroupedBar ; q4,q9 = SimpleLine ; q5,q10 = MultipleLine

## operation_type vocabulary (pick the single closest term per step, from the explanation text)
filter, average, diff, extremum (max/min/argmax/argmin), sum, count, lookup (retrieve a single value),
boolean (threshold / comparison test / does-X-exceed-Y), rank (nth / ordinal position),
reshape (pure structural restructure: split into panels, re-encode, isolate subset, collapse — no scalar computed).
If a step both restructures AND computes, name it by the COMPUTATION (e.g. "filter", "average"); record the
restructure in visual_effects and note it. If genuinely unclear, use the closest term and mark confidence low.

## visual_effects vocabulary — RESHAPING family
- remove_rescale        : data points removed/filtered out AND an axis domain recomputed to fit the surviving subset (marks re-laid-out on the new scale).
- fade_context          : NON-selected marks dimmed (opacity lowered, ~0.2–0.4) but kept visible as context.
- window_shading        : a background rectangle drawn BEHIND a contiguous span (a range of categories / a time window) to shade that region.
- reencode_stack_to_group : stacked bars re-encoded as grouped bars.
- reencode_group_to_stack : grouped bars re-encoded as stacked bars.
- reencode_line_to_bar  : a line (or subset of it) re-encoded/materialized as bars.
- collapse_to_single    : multiple marks aggregated into ONE summary mark (e.g. a single Sum/Average bar; domain like ['Sum']).
- axis_rescale          : an axis domain is rescaled/changed as the salient effect, NOT driven by row removal (e.g. a fresh panel gets its own y-scale). Use when remove_rescale does not apply.

## visual_effects vocabulary — DRAWING family
- reference_line        : a full-plot-width horizontal (or full-height vertical) reference line, typically avg/threshold/median (x1=0,x2=plotW dashed).
- local_reference_line  : a reference line spanning only a LOCAL subset/segment, not the full plot width.
- double_arrow_diff     : a two-headed arrow / bracket / vertical span annotating the MAGNITUDE of a difference between two values.
- single_arrow_change   : a single-headed arrow indicating a change / direction between two points.
- materialized_chart    : a brand-new auxiliary chart built to show COMPUTED/DERIVED values (e.g. a small bar chart of two computed averages). Distinct from reencode_* which re-encodes the same raw data.
- text_value_label      : a text annotation stating a numeric value, count, or result (e.g. "average = 2.8", "Sum = 12.4", "3 years above average", "European − Asian = 41").
- opacity_emphasis      : SELECTED marks recolored / kept-highlighted to stand out (color change to a highlight color, enlarged radius, etc.). Often co-occurs with fade_context (tag both).
- side_by_side_views    : two or more panels placed side-by-side (split view), each its own axes.
- connector_arrow_cumulative : arrow(s) connecting marks to show a cumulative build-up.

## visual_effects vocabulary — TRANSITION family (record SEPARATELY; never merge with static effects)
- transition_fade    : opacity interpolation for entrance/exit (fade-in of a label/line; crossfade between an old layer removed and a new layer added).
- transition_grow    : geometric growth entrance — bars grow from baseline (height 0→h), or a line/reference line draws in (x2 0→plotW).
- transition_recolor : color / opacity TWEEN applied to already-present marks that changes their appearance in place (e.g. existing bars recolor over 600ms).
- transition_stagger : per-element staggered delay (delay(i*120) etc.).

## Rules
1. Prefer the exact names above. Only invent a NEW tag if an observed effect fits none; give it a clear name + one-line definition + put it in `new_tags`. When unsure between an existing tag and a new one, PREFER a new tag (over-splitting is recoverable by later merge; wrong absorption is not).
2. Emit one row per NON-EMPTY functionN. If a functionN body is empty (`{}`) or only guards/returns with no drawing, SKIP it (mention in notes if it looks like a dropped step).
3. operation_index = the function number N (integer).
4. A visual element that a step CREATES belongs to that step even if a later step consumes it (e.g. an average reference_line made in step3 and diffed in step4 → reference_line on step3; note the cross-step use).
5. evidence = concrete code location: `<file>:<approx line range>` and/or the mechanism (e.g. "insert('rect') HIGHLIGHT_BG span x0..x1, l255-265").
6. confidence: high = code unambiguous; medium = plausible but some inference; low = needs rendering to confirm or genuinely ambiguous (say why in notes).
7. Multiple effects on one step → list all, separated by `|`. Include every transition you see (fade/grow/recolor/stagger).
8. Do NOT force-classify. Low confidence + a clear note beats a confident wrong tag.
