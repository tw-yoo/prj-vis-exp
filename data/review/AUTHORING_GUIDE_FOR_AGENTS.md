# Authoring guide — ground-truth operation specs (for subagents)

You author `operation_spec` (the project's 18-op grammar) for one chart type, faithful to each
human explanation, grounded in the chart's REAL field names + category values. Output a JSON file
that the central pipeline merges + validates + executes.

## Output contract
Write `data/review/authored/<TYPE>.json` (TYPE = your chart type, e.g. `bar_simple`):
```json
{ "<chart_id>": {"spec": {"ops":[...], "ops2":[...]}, "note": ""},
  "<chart_id>": {"spec": null, "note": "GAP: <reason>"} }
```
- `spec`=null for genuinely unmappable cases (see GAPS). Include EVERY todo chart of your type.
- One ops-group per explanation step (`ops`=step1, `ops2`=step2, ...). No explicit steps → all in `ops`.

## Workflow
1. `cd` to repo root. Run: `python3 scripts/he_chunks.py --type <TYPE> --n 60 --chunk 6 --tag <TYPE>`
2. Read `data/review/show_manifest_<TYPE>.json` → list of `show_<TYPE>_<k>.json` files + ids.
3. Read each `show_<TYPE>_<k>.json` (SMALL files Read reliably; do NOT rely on bash stdout — it
   intermittently drops; if a Read returns empty, just retry). Each chart gives: x (primary
   dimension), y (measure), series, x_vals, series_vals, other_dims, y stats, q (question),
   e (explanation), cand (a ChatGPT candidate spec — REFERENCE ONLY, often right but sometimes
   wrong; verify against the rules below).
4. Author each spec. 5. Write your JSON. 6. Self-check (below). Report counts.

## Op object shape
Every op: `{"op":<name>, "id":"nN", "meta":{"nodeId":"nN","inputs":[...],"sentenceIndex":<step>}, <fields>}`
- `id` == `meta.nodeId`; ids unique across the WHOLE spec (n1,n2,...).
- `meta.inputs` = list of prior nodeIds this op consumes.
- Scalar cross-references are the STRING `"ref:nN"` (e.g. `"targetA":"ref:n1"`), and you must ALSO
  list `nN` in that op's `meta.inputs`.

## Allowed ops + fields  (STRICT — an extra field → execution error)
Authoritative list is `data/review/.ops_fields.json`. Summary (required → optional):
- retrieveValue: () → target, field, group, targetAxis   (look up y for an x label)
- filter: () → field, operator, value, include, exclude, group, xKindHint
- findExtremum: () → which('max'|'min'), rank(1-based; 2=2nd), field, group
- diffByValue: () → value, targetValue, field, group, signed   (each row minus a scalar V)
- compareBool: (operator) → targetA, targetB, field, groupA, groupB, aggregate, group
- sort: () → field, order('asc'|'desc'), group, orderField
- sum: () → field, group        average: () → field, group        count: () → field, group
- diff: () → targetA, targetB, field, groupA, groupB, signed, mode, percent, scale, aggregate, precision   (NO `group`)
- lagDiff: () → field, order, group, absolute     (NO orderField; it orders by x automatically)
- pairDiff: (by, groupA, groupB) → seriesField, field, absolute, precision, group
- nth: (n) → field, group, from('left'|'right'), orderField, order   (n may be int)
- add: (targetA, targetB) → field, group       scale: (target, factor) → field, group
- range: () → field, group
- rollingWindow: (window) → aggregate, field, orderField, group
- monotonicRun: () → direction('increasing'|'decreasing'), mode('longest'|'firstBreak'|'all'), minLength, field, orderField, group

## Grounding rules (use EXACT strings from the chunk)
- `field` = the measure column (the chunk's `y`) for aggregates/filters-on-value; for filter/retrieve
  on the x-axis use `field`=x. Every `field` MUST be one of the chart's columns.
- `group`/`groupA`/`groupB` = a SERIES value (from `series_vals`). Only on multi-series charts.
- retrieveValue/diff/compareBool `target` = an x-axis label (from `x_vals`). For a single cell of a
  grouped/stacked chart: `target`=<x label> + `group`=<series value>.
- pairDiff: `by`=the key dimension (usually x), `seriesField`=the series field name, groupA/groupB=series values.

## Mapping rules & gotchas (these are validated — follow them)
1. "average/mean" → average. "add all / total / sum" → sum (sum on a line chart is allowed; just a warning).
   Do NOT fake sum as average×count, or average as sum×(1/n).
2. count: "how many / number of" → filter(...) → count.
3. "highest/largest/max" → findExtremum max; "lowest/smallest/min" → findExtremum min.
   "2nd/3rd largest" → findExtremum(which=max, rank=2/3) (or sort(desc)+nth(n=2/3)). Nth smallest → which=min, rank=N.
4. range/spread/variation → range (or findExtremum max + findExtremum min + diff).
5. year-over-year / change vs previous / adjacent diff → lagDiff (field only). Use absolute=true for magnitude;
   "biggest jump/increase" → lagDiff then findExtremum max; "biggest drop" → lagDiff then findExtremum min.
6. "for each <key>, gap/diff between series A and B" → pairDiff (multi-series only) then findExtremum.
7. filter `between` is a POSITIONAL row-order slice along x: `operator:"between", value:[<startXlabel>,<endXlabel>]`,
   field=x. It is NOT a numeric value range. For a MEASURE value range ("values between 20 and 30") use TWO
   comparison filters chained: filter(>=,20) → filter(<=,30).
8. "from year A to year B" range → filter(between,[A,B]) on x. "before YYYY"/"after YYYY" → filter(<,"YYYY")/(>,"YYYY") on x.
9. above/below average: average(n1) → filter(field, operator '>'/'<', value:"ref:n1") → count.  (value is the string "ref:n1".)
10. median: ODD n → sort(asc)+nth(n=(N+1)/2). EVEN n → sort(asc)+nth(k)+nth(k+1)+add+scale(0.5), k=N/2.
    If the explanation literally says "the Nth value", follow it (nth N).
11. midpoint "(a+b)/2" → add(a,b) then scale(target=ref, factor=0.5). "×N / doubled" → scale factor=N.
12. yes/no question → end with compareBool. "deviation from average / distance from V" → diffByValue.
13. "3-year moving average / N-year window" → rollingWindow(window=N, aggregate avg). "longest period of decrease /
    when it starts to decrease / consecutive increases" → monotonicRun.
14. nth from right: `"from":"right"` (default left).

## GAPS → spec=null with a specific note  (do NOT fake these)
- per-key/per-x AGGREGATE then select (e.g. "which year/country has the highest/lowest TOTAL across the
  stacked/grouped series", or "sum of two specific series per key then max"). EXCEPTION: if the data has an
  explicit total/aggregate series (check series_vals for e.g. "Total"), use filter(group="Total")+findExtremum.
- adding/—ing x-axis LABELS (e.g. "sum of two YEARS"); add operates on measure values, not labels.
- qualitative/trend/correlation/inflection/"is the slope steady" reasoning.
- standard deviation; arbitrary external constants; ratio-of-differences with no matching op.

## Self-check before writing
- `json.loads` valid. Every `op` in the allowed list; only allowed fields used.
- ids unique; every `meta.inputs` / `ref:nN` points to an earlier op in the same spec.
- Every `field` ∈ the chart's columns; every group/groupA/groupB ∈ series_vals; every non-ref string
  target/include/exclude ∈ x_vals (or series_vals). Numbers for measure thresholds are fine.
- sentenceIndex starts at 1, increments per step, matches the ops-group.

## Reference
- ~70 worked, executed examples: `scripts/he_specs.py` (the GOLD dict) — match that style exactly.
- Op contract: `data/review/.ops_fields.json`. Decisions/policy: `data/review/OPS_AUTHORING_NOTES.md`.
