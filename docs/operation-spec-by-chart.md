# Operation Spec by Chart Type (Auto Draw Plan)

이 문서는 차트 타입별 `operation`이 어떤 `draw action` 조합으로 auto draw plan을 만드는지 정리한다.

## 공통 기준

- 최종 auto draw plan export:
  - `src/rendering/ops/visual/bar/simple/autoDrawPlanRegistry.ts`의 `SIMPLE_BAR_AUTO_DRAW_PLANS`
  - `src/rendering/ops/visual/bar/stacked/autoDrawPlanRegistry.ts`의 `STACKED_BAR_AUTO_DRAW_PLANS`
  - `src/rendering/ops/visual/bar/grouped/autoDrawPlanRegistry.ts`의 `GROUPED_BAR_AUTO_DRAW_PLANS`
  - `src/rendering/ops/visual/line/simple/autoDrawPlanRegistry.ts`의 `SIMPLE_LINE_AUTO_DRAW_PLANS`
  - `src/rendering/ops/visual/line/multiple/autoDrawPlanRegistry.ts`의 `MULTI_LINE_AUTO_DRAW_PLANS`
- 위 export는 공통 wrapper `src/rendering/ops/visual/helpers.ts`의 `withStagedAutoDrawPlanRegistry(...)`를 거친다.
- stage(동시/순차) 메타 부여 규칙은 `src/rendering/ops/visual/helpers.ts`의 `resolveStagesByOperation(...)`에서 결정된다.

---

## 1) SIMPLE_BAR

- Vega-Lite sample: `data/test/spec/bar_simple_ver.json`
- Registry file: `src/rendering/ops/visual/bar/simple/autoDrawPlanRegistry.ts`
- Registry map: `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS`

| Operation | Draw 조합 (요약) | Draw plan 작성 함수 | 보조 함수 |
| --- | --- | --- | --- |
| `retrieveValue` | `highlight + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.RetrieveValue]` | `highlightTargets`, `textTargets` |
| `filter` | `x include/exclude: highlight + filter`, `y threshold: line + bar-segment + filter` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Filter]` | `buildThresholdFilterPlan`, `highlightTargets` |
| `sort` | `clear + sort` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sort]` | - |
| `findExtremum` | `highlight + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.FindExtremum]` | `highlightTargets`, `textTargets` |
| `determineRange` | `band(x or y)` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.DetermineRange]` | `buildRangePlan` |
| `compare` | `highlight(pair) + connector line + scalar hline + scalar text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Compare]` | `firstPair`, `lineAt`, `textScore`, `highlightTargets` |
| `compareBool` | `text(bool)` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.CompareBool]` | `textScore` |
| `sum` | `sum` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sum]` | - |
| `average` | `hline + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Average]` | `lineAt`, `textScore` |
| `diff` | `case1(값 비교): scalar-panel(base -> diff)`, `case2(마크 비교): highlight + connector line(+arrow) + baseline hline + delta text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Diff]` | `resolveDiffScalarPair`, `firstPair`, `targetAggregate`, `lineAt`, `textScore` |
| `lagDiff` | `multi connector lines + highlight + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.LagDiff]` | `highlightTargets`, `textTargets` |
| `pairDiff` | `highlight + text + summary text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.PairDiff]` | `highlightTargets`, `textTargets`, `textScore` |
| `nth` | `highlight + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Nth]` | `highlightTargets`, `textTargets` |
| `count` | `text(count)` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Count]` | `textScore` |
| `add` | `hline + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Add]` | `lineAt`, `textScore` |
| `scale` | `hline + text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Scale]` | `lineAt`, `textScore` |
| `setOp` | `highlight + band + summary text` | `SIMPLE_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.SetOp]` | `buildSetOpPlan` |

### SIMPLE_BAR operation JSON examples

```json
[
  { "op": "retrieveValue", "field": "rating", "target": "USA" },
  { "op": "filter", "field": "rating", "operator": ">=", "value": 60 },
  { "op": "sort", "field": "rating", "order": "desc" },
  { "op": "findExtremum", "field": "rating", "which": "max" },
  { "op": "determineRange", "field": "rating" },
  { "op": "compare", "field": "rating", "targetA": "USA", "targetB": "JPN" },
  { "op": "compareBool", "field": "rating", "targetA": "USA", "targetB": "JPN", "operator": ">" },
  { "op": "sum", "field": "rating" },
  { "op": "average", "field": "rating" },
  { "op": "diff", "field": "rating", "targetA": "USA", "targetB": "JPN", "signed": true },
  { "op": "lagDiff", "field": "rating", "orderField": "country", "order": "asc" },
  { "op": "pairDiff", "by": "country", "field": "rating", "groupA": "USA", "groupB": "JPN", "signed": true },
  { "op": "nth", "n": 3, "from": "left", "orderField": "country" },
  { "op": "count", "field": "country" },
  { "op": "add", "field": "rating", "targetA": "USA", "targetB": "JPN" },
  { "op": "scale", "field": "rating", "target": "USA", "factor": 1.1 },
  { "op": "setOp", "fn": "intersection", "meta": { "inputs": ["node-a", "node-b"] } }
]
```

---

## 2) STACKED_BAR

- Vega-Lite sample: `data/test/spec/bar_stacked_ver.json`
- Registry file: `src/rendering/ops/visual/bar/stacked/autoDrawPlanRegistry.ts`
- Registry map: `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS`

| Operation | Draw 조합 (요약) | Draw plan 작성 함수 | 보조 함수 |
| --- | --- | --- | --- |
| `retrieveValue` | `highlight + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.RetrieveValue]` | `buildHighlightPlan`, `buildTextPlan`, `uniqueTargets`, `toTargetValueEntries` |
| `filter` | `group 지정: stacked-to-simple`, `x include/exclude: highlight + filter`, `y threshold: line + bar-segment + filter` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Filter]` | `buildFilterPlan` |
| `findExtremum` | `highlight + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.FindExtremum]` | `buildHighlightPlan`, `buildTextPlan` |
| `sort` | `clear + sort` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sort]` | - |
| `nth` | `highlight + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Nth]` | `buildHighlightPlan`, `buildTextPlan` |
| `sum` | `sum` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sum]` | - |
| `average` | `hline` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Average]` | `lineAt` |
| `determineRange` | `band` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.DetermineRange]` | `buildRangePlan` |
| `compare` | `highlight + connector line + scalar hline(optional)` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Compare]` | `firstPair`, `seriesPairLine`, `firstTarget`, `lineAt` |
| `compareBool` | `text(bool)` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.CompareBool]` | `textScore` |
| `diff` | `connector line + baseline hline(optional) + highlight + delta text(optional)` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Diff]` | `firstPair`, `seriesPairLine`, `aggregateByTarget`, `firstTarget`, `lineAt`, `textScore` |
| `lagDiff` | `multi connector lines + highlight + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.LagDiff]` | `buildHighlightPlan`, `buildTextPlan` |
| `pairDiff` | `multi connector lines + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.PairDiff]` | `buildTextPlan` |
| `count` | `text(count)` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Count]` | `textScore` |
| `add` | `hline + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Add]` | `lineAt`, `textScore` |
| `scale` | `hline + text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Scale]` | `lineAt`, `textScore` |
| `setOp` | `highlight + band + summary text` | `STACKED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.SetOp]` | `buildSetOpPlan` |

### STACKED_BAR operation JSON examples

```json
[
  { "op": "retrieveValue", "field": "count", "target": { "target": "1", "series": "rain" } },
  { "op": "filter", "field": "month", "include": [1, 2, 3] },
  { "op": "findExtremum", "field": "count", "which": "max", "group": "rain" },
  { "op": "sort", "field": "count", "order": "desc" },
  { "op": "nth", "n": 1, "from": "left", "orderField": "month", "group": "rain" },
  { "op": "sum", "field": "count", "group": "rain" },
  { "op": "average", "field": "count", "group": "rain" },
  { "op": "determineRange", "field": "count", "group": "rain" },
  { "op": "compare", "field": "count", "targetA": { "target": "1", "series": "rain" }, "targetB": { "target": "2", "series": "rain" } },
  { "op": "compareBool", "field": "count", "targetA": { "target": "1", "series": "sun" }, "targetB": { "target": "1", "series": "rain" }, "operator": ">" },
  { "op": "diff", "field": "count", "targetA": { "target": "1", "series": "rain" }, "targetB": { "target": "1", "series": "sun" }, "signed": true },
  { "op": "lagDiff", "field": "count", "orderField": "month", "order": "asc", "group": "rain" },
  { "op": "pairDiff", "by": "month", "field": "count", "groupA": "rain", "groupB": "sun", "signed": true },
  { "op": "count", "field": "month", "group": "rain" },
  { "op": "add", "field": "count", "targetA": { "target": "1", "series": "rain" }, "targetB": { "target": "1", "series": "sun" } },
  { "op": "scale", "field": "count", "target": { "target": "1", "series": "rain" }, "factor": 1.2 },
  { "op": "setOp", "fn": "union", "group": "rain", "meta": { "inputs": ["node-a", "node-b"] } }
]
```

---

## 3) GROUPED_BAR

- Vega-Lite sample: `data/test/spec/bar_grouped_ver.json`
- Registry file: `src/rendering/ops/visual/bar/grouped/autoDrawPlanRegistry.ts`
- Registry map: `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS`

| Operation | Draw 조합 (요약) | Draw plan 작성 함수 | 보조 함수 |
| --- | --- | --- | --- |
| `retrieveValue` | `highlight + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.RetrieveValue]` | `buildHighlightPlan`, `buildTextPlan`, `uniqueTargets`, `toTargetValueEntries` |
| `filter` | `group 지정: grouped-filter-groups`, `x include/exclude: highlight + filter`, `y threshold: line + bar-segment + filter` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Filter]` | `buildFilterPlan` |
| `findExtremum` | `highlight + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.FindExtremum]` | `buildHighlightPlan`, `buildTextPlan` |
| `sort` | `clear + sort` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sort]` | - |
| `nth` | `highlight + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Nth]` | `buildHighlightPlan`, `buildTextPlan` |
| `sum` | `sum` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sum]` | - |
| `average` | `hline` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Average]` | `lineAt` |
| `determineRange` | `band` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.DetermineRange]` | `buildRangePlan` |
| `compare` | `highlight + connector line + scalar hline(optional)` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Compare]` | `firstPair`, `seriesPairLine`, `firstTarget`, `lineAt` |
| `compareBool` | `text(bool)` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.CompareBool]` | `textScore` |
| `diff` | `connector line + baseline hline(optional) + highlight + delta text(optional)` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Diff]` | `firstPair`, `seriesPairLine`, `aggregateByTarget`, `firstTarget`, `lineAt`, `textScore` |
| `lagDiff` | `multi connector lines + highlight + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.LagDiff]` | `buildHighlightPlan`, `buildTextPlan` |
| `pairDiff` | `multi connector lines + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.PairDiff]` | `buildTextPlan` |
| `count` | `text(count)` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Count]` | `textScore` |
| `add` | `hline + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Add]` | `lineAt`, `textScore` |
| `scale` | `hline + text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Scale]` | `lineAt`, `textScore` |
| `setOp` | `highlight + band + summary text` | `GROUPED_BAR_AUTO_DRAW_PLAN_BUILDERS[OperationOp.SetOp]` | `buildSetOpPlan` |

### GROUPED_BAR operation JSON examples

```json
[
  { "op": "retrieveValue", "field": "Media rights revenue in billion US dollars", "target": { "target": "2010", "series": "North America" } },
  { "op": "filter", "field": "Year", "include": [2009, 2010, 2011] },
  { "op": "findExtremum", "field": "Media rights revenue in billion US dollars", "which": "max", "group": "North America" },
  { "op": "sort", "field": "Media rights revenue in billion US dollars", "order": "desc", "group": "North America" },
  { "op": "nth", "n": 2, "from": "left", "orderField": "Year", "group": "North America" },
  { "op": "sum", "field": "Media rights revenue in billion US dollars", "group": "North America" },
  { "op": "average", "field": "Media rights revenue in billion US dollars", "group": "North America" },
  { "op": "determineRange", "field": "Media rights revenue in billion US dollars", "group": "North America" },
  { "op": "compare", "field": "Media rights revenue in billion US dollars", "targetA": { "target": "2010", "series": "North America" }, "targetB": { "target": "2010", "series": "Latin America" } },
  { "op": "compareBool", "field": "Media rights revenue in billion US dollars", "targetA": { "target": "2013", "series": "Europe, Middle East and Africa" }, "targetB": { "target": "2013", "series": "Asia Pacific" }, "operator": ">" },
  { "op": "diff", "field": "Media rights revenue in billion US dollars", "targetA": { "target": "2012", "series": "North America" }, "targetB": { "target": "2012", "series": "Latin America" }, "signed": true },
  { "op": "lagDiff", "field": "Media rights revenue in billion US dollars", "orderField": "Year", "order": "asc", "group": "North America" },
  { "op": "pairDiff", "by": "Year", "field": "Media rights revenue in billion US dollars", "groupA": "North America", "groupB": "Latin America", "signed": true },
  { "op": "count", "field": "Year", "group": "North America" },
  { "op": "add", "field": "Media rights revenue in billion US dollars", "targetA": { "target": "2010", "series": "North America" }, "targetB": { "target": "2010", "series": "Latin America" } },
  { "op": "scale", "field": "Media rights revenue in billion US dollars", "target": { "target": "2013", "series": "North America" }, "factor": 1.1 },
  { "op": "setOp", "fn": "union", "group": "North America", "meta": { "inputs": ["node-a", "node-b"] } }
]
```

---

## 4) SIMPLE_LINE

- Vega-Lite sample: `data/test/spec/line_simple.json`
- Registry file: `src/rendering/ops/visual/line/simple/autoDrawPlanRegistry.ts`
- Registry map: `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS`

| Operation | Draw 조합 (요약) | Draw plan 작성 함수 | 보조 함수 |
| --- | --- | --- | --- |
| `retrieveValue` | `highlight(path/circle/rect)` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.RetrieveValue]` | `highlightSeriesPoints` |
| `findExtremum` | `highlight(path/circle/rect)` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.FindExtremum]` | `highlightSeriesPoints` |
| `filter` | `x include/exclude: highlight + filter`, `y threshold: hline + filter + highlight` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Filter]` | `buildFilterPlan` |
| `average` | `hline + text` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Average]` | `hLine`, `textAtTopRight` |
| `determineRange` | `band` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.DetermineRange]` | `rangeBandPlan` |
| `diff` | `connector line + baseline hline(optional) + delta text(optional)` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Diff]` | `getSelectorTarget`, `hLine`, `textAtTopRight` |
| `compare` | `highlight + connector line(optional) + scalar hline(optional) + scalar text(optional)` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Compare]` | `getSelectorTarget`, `highlightSeriesPoints`, `hLine`, `textAtTopRight` |
| `compareBool` | `text(bool)` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.CompareBool]` | `textAtTopRight` |
| `lagDiff` | `multi connector lines + highlight` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.LagDiff]` | `highlightSeriesPoints` |
| `pairDiff` | `multi connector lines + summary text` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.PairDiff]` | `textAtTopRight` |
| `nth` | `highlight` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Nth]` | `highlightSeriesPoints` |
| `count` | `text(count)` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Count]` | `textAtTopRight` |
| `add` | `hline + text` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Add]` | `hLine`, `textAtTopRight` |
| `scale` | `hline + text` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Scale]` | `hLine`, `textAtTopRight` |
| `sum` | `text + hline` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sum]` | `hLine`, `textAtTopRight` |
| `setOp` | `highlight + band + summary text` | `SIMPLE_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.SetOp]` | `contiguousRuns`, `highlightSeriesPoints`, `textAtTopRight` |

### SIMPLE_LINE operation JSON examples

```json
[
  { "op": "retrieveValue", "field": "research_and_development_expenditure", "target": "2010-01-01" },
  { "op": "findExtremum", "field": "research_and_development_expenditure", "which": "max" },
  { "op": "filter", "field": "research_and_development_expenditure", "operator": ">=", "value": 5000 },
  { "op": "average", "field": "research_and_development_expenditure" },
  { "op": "determineRange", "field": "research_and_development_expenditure" },
  { "op": "diff", "field": "research_and_development_expenditure", "targetA": "2008-01-01", "targetB": "2007-01-01", "signed": true },
  { "op": "compare", "field": "research_and_development_expenditure", "targetA": "2010-01-01", "targetB": "2009-01-01" },
  { "op": "compareBool", "field": "research_and_development_expenditure", "targetA": "2010-01-01", "targetB": "2009-01-01", "operator": ">" },
  { "op": "lagDiff", "field": "research_and_development_expenditure", "orderField": "year", "order": "asc" },
  { "op": "pairDiff", "by": "year", "field": "research_and_development_expenditure", "groupA": "A", "groupB": "B", "signed": true },
  { "op": "nth", "n": 5, "from": "left", "orderField": "year" },
  { "op": "count", "field": "year" },
  { "op": "add", "field": "research_and_development_expenditure", "targetA": "2011-01-01", "targetB": "2010-01-01" },
  { "op": "scale", "field": "research_and_development_expenditure", "target": "2014-01-01", "factor": 0.9 },
  { "op": "sum", "field": "research_and_development_expenditure" },
  { "op": "setOp", "fn": "intersection", "meta": { "inputs": ["node-a", "node-b"] } }
]
```

---

## 5) MULTI_LINE

- Vega-Lite sample: `data/test/spec/line_multiple.json`
- Registry file: `src/rendering/ops/visual/line/multiple/autoDrawPlanRegistry.ts`
- Registry map: `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS`

| Operation | Draw 조합 (요약) | Draw plan 작성 함수 | 보조 함수 |
| --- | --- | --- | --- |
| `retrieveValue` | `highlight(path/circle/rect)` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.RetrieveValue]` | `pointHighlights` |
| `findExtremum` | `highlight(path/circle/rect)` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.FindExtremum]` | `pointHighlights` |
| `filter` | `x include/exclude: highlight + filter`, `y threshold: hline + filter + highlight` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Filter]` | `buildFilterPlan` |
| `average` | `hline + text` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Average]` | `hLine`, `topText` |
| `determineRange` | `band` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.DetermineRange]` | `rangeBandPlan` |
| `compare` | `highlight + connector line + scalar hline(optional) + scalar text(optional)` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Compare]` | `getSelectorTarget`, `pointHighlights`, `hLine`, `topText` |
| `diff` | `connector line + delta text(optional) + baseline hline(optional)` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Diff]` | `getSelectorTarget`, `hLine`, `topText` |
| `pairDiff` | `multi connector lines + summary text` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.PairDiff]` | `topText` |
| `lagDiff` | `multi connector lines + highlight` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.LagDiff]` | `pointHighlights` |
| `nth` | `highlight` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Nth]` | `pointHighlights` |
| `count` | `text(count)` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Count]` | `topText` |
| `compareBool` | `text(bool)` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.CompareBool]` | `topText` |
| `add` | `hline + text` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Add]` | `hLine`, `topText` |
| `scale` | `hline + text` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Scale]` | `hLine`, `topText` |
| `sum` | `hline + text` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.Sum]` | `hLine`, `topText` |
| `setOp` | `highlight + band + summary text` | `MULTI_LINE_AUTO_DRAW_PLAN_BUILDERS[OperationOp.SetOp]` | `contiguousRuns`, `pointHighlights`, `topText` |

### MULTI_LINE operation JSON examples

```json
[
  { "op": "retrieveValue", "field": "price", "target": { "target": "2005-01-01", "series": "AAPL" } },
  { "op": "findExtremum", "field": "price", "which": "max", "group": "AAPL" },
  { "op": "filter", "field": "price", "operator": ">=", "value": 100 },
  { "op": "average", "field": "price", "group": "AAPL" },
  { "op": "determineRange", "field": "price", "group": "AAPL" },
  { "op": "compare", "field": "price", "targetA": { "target": "2005-01-01", "series": "AAPL" }, "targetB": { "target": "2005-01-01", "series": "MSFT" } },
  { "op": "diff", "field": "price", "targetA": { "target": "2005-01-01", "series": "AAPL" }, "targetB": { "target": "2005-01-01", "series": "MSFT" }, "signed": true },
  { "op": "pairDiff", "by": "date", "field": "price", "groupA": "AAPL", "groupB": "MSFT", "signed": true },
  { "op": "lagDiff", "field": "price", "orderField": "date", "order": "asc", "group": "AAPL" },
  { "op": "nth", "n": 12, "from": "left", "orderField": "date", "group": "AAPL" },
  { "op": "count", "field": "date", "group": "AAPL" },
  { "op": "compareBool", "field": "price", "targetA": { "target": "2005-01-01", "series": "AAPL" }, "targetB": { "target": "2005-01-01", "series": "MSFT" }, "operator": ">" },
  { "op": "add", "field": "price", "targetA": { "target": "2005-01-01", "series": "AAPL" }, "targetB": { "target": "2005-01-01", "series": "MSFT" } },
  { "op": "scale", "field": "price", "target": { "target": "2005-01-01", "series": "AAPL" }, "factor": 1.05 },
  { "op": "sum", "field": "price", "group": "AAPL" },
  { "op": "setOp", "fn": "union", "group": "AAPL", "meta": { "inputs": ["node-a", "node-b"] } }
]
```

---

## 참고: Draw 실행 엔진 연결

- data operation -> auto draw plan 생성:
  - `src/application/services/executeDataOperation.ts`의 `executeDataOperation(...)`
- draw plan 실행(phase/병렬/순차):
  - `src/rendering/ops/executor/runDrawPlan.ts`의 `runDrawPlan(...)`
- phase 계산(DAG):
  - `src/rendering/ops/common/timeline.ts`의 `buildExecutionPhases(...)`
