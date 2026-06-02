# Ground-truth op authoring — decisions (Step 0)

Task: author `operation_spec` for all 240 rows of `human_explanation.csv`, faithful to
the human explanation, grounded in each chart's real fields/data. Output:
`data/review/human_explanation_filled.csv`.

## Authoritative op set = 18 ops (per nlp_server `op_registry.py` + the authoring guide)

`retrieveValue, filter, findExtremum, diffByValue, compareBool, sort, sum, average,
diff, lagDiff, pairDiff, nth, count, add, scale, range, rollingWindow, monotonicRun`
plus `findExtremum.rank` (rank=1 default; rank=2 = 2nd extreme).

Why 18, not the 16 in `data/review/.ops_schema.json`:
- `.ops_schema.json` is dumped from the TS builder registry (`src/api/operation-build.ts`),
  whose `operation-new` appliers are an **in-progress rewrite** and incomplete
  (no range/rolling/monotonic/rank; missing findExtremum/sort/nth appliers for several
  chart types). That incompleteness is not the grammar contract.
- `nlp_server/opsspec/runtime/op_registry.py` is the BE single source of truth ("keep in
  lockstep with the TS operation registry") and registers all 18 + rank; the executor
  (`executor.py`) implements all 18 + rank; the task's authoring guide
  (`data/review/prompts/fill_operation_spec_prompt.md`) explicitly mandates them; the gold
  few-shots (`nlp_server/example.csv`) include range/rollingWindow/monotonicRun examples.
- The gold set is ground-truth labels for grammar evaluation, verified by the nlp_server
  executor — so author to that contract.

Caveat (flagged to user): a handful of specs using `range`/`rollingWindow`/`monotonicRun`/
`findExtremum.rank` will NOT render in the current TS `operation-new` visualizer until those
appliers are finished. If render-today is required, expand them
(range → findExtremum max + findExtremum min + diff; rank=2 → sort+nth; etc.).

## Required fields per op (from op_registry.py `required_fields`)
- compareBool: operator
- pairDiff: by, groupA, groupB   (series charts only: bar_grouped/bar_stacked/line_multiple)
- nth: n
- add: targetA, targetB
- scale: target, factor
- rollingWindow: window
- everything else: no hard-required field (sensible defaults: which→max, field→primary_measure, etc.)

## Chart compatibility
- pairDiff: bar_grouped / bar_stacked / line_multiple only (hard rule).
- sum: bar only (guide); avoid on line (warn).
- lagDiff: line time-series pattern (soft; contract allows all).

## Fidelity policy (user choice: explanation-faithful)
- Mirror the human explanation's step structure (one ops-group per explicit step).
- Translate visual phrasings to the equivalent op ("tallest bar" → findExtremum max; color →
  series label) and note it in `author_note`.
- Out-of-grammar steps with no faithful chain (e.g. literal standard deviation, ratio-of-
  differences, multiply-by-external-constant, "inflection point") → leave `operation_spec=""`
  with a specific `author_note` reason. Never silently substitute a different computation.

## Verification
- Structural + grounding gate: `scripts/he_validate.py` (contracts mirror op_registry.py).
- Execution: `scripts/he_execute.py` runs each spec on the chart's real rows and reports the
  final answer (advisory). Preferred backend: the real nlp_server executor when importable.
- Grounding source for authoring: `data/review/.grounding_bundle.json` (built by
  `scripts/he_grounding.py`).
