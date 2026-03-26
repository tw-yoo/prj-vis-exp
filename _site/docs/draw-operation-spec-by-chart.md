# Draw Operation JSON Spec by Chart Type (D3 Execution Functions)

이 문서는 차트 타입별로 실행 가능한 `draw` action을 정리하고, 각 action이 실제로 D3 레벨에서 실행되는 함수(상대경로 + 함수명)를 함께 명시한다.

기준 소스:
- 지원 매트릭스: `src/rendering/draw/supportMatrix.ts` (`RUNTIME_DRAW_SUPPORT_MATRIX`)
- Draw payload 타입: `src/rendering/draw/types.ts`
- 공통 D3 draw 구현: `src/rendering/draw/BaseDrawHandler.ts`
- 차트별 D3 draw 구현: `src/rendering/draw/**/*.ts`

제외:
- `sleep`은 런타임 미지원(`unsupported`)이므로 본 문서에서 제외한다.

## 0. DrawOp 공통 JSON 골격

```json
{
  "op": "draw",
  "action": "highlight",
  "chartId": null,
  "select": {
    "mark": "rect",
    "field": "country",
    "keys": ["USA", "JPN"]
  },
  "style": {
    "color": "#ef4444",
    "opacity": 1
  }
}
```

```json
{
  "op": "draw",
  "action": "text",
  "chartId": "left-pane",
  "text": {
    "mode": "anchor",
    "value": "Top point",
    "offset": { "x": 0, "y": -8 },
    "style": { "color": "#111827", "fontSize": 12, "fontWeight": 700 }
  }
}
```

```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "connect",
    "connectBy": {
      "start": { "target": "2011" },
      "end": { "target": "2018" }
    },
    "arrow": { "end": true },
    "style": { "stroke": "#0ea5e9", "strokeWidth": 2 }
  }
}
```

공통 annotation 계열의 기본 실행 함수:
- `src/rendering/draw/BaseDrawHandler.ts`: `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `band`, `scalarPanel`, `run`

`select.field` 규칙:
- `select.keys`가 어떤 데이터 차원에 매칭되는지 명시한다.
- group(=color series) 차트인 `STACKED_BAR`, `GROUPED_BAR`, `MULTI_LINE`에서는 `select.field` 지정 사용을 권장한다.
- alias: `x|target`, `y|value`, `color|group|series`, `id`
- bar 계열에서 Vega 렌더 결과가 `path`인 경우가 있어도 `mark: "rect"` 선택은 bar mark(`rect/path`) 모두를 대상으로 동작한다.

---

## 1. SIMPLE_BAR

기준 Vega-Lite spec:
- `data/test/spec/bar_simple_ver.json`

지원 draw action:
- `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `filter`, `sort`, `split`, `unsplit`, `sum`, `bar-segment`, `band`, `scalar-panel`

D3 실행 함수(핵심):
- 공통: `src/rendering/draw/BaseDrawHandler.ts`의 공통 메서드
- bar 전용: `src/rendering/draw/BarDrawHandler.ts`의 `sort`, `filter`, `sum`, `barSegment`, `run`
- split/unsplit 렌더: `src/rendering/bar/simpleBarRenderer.ts`의 `renderSplitSimpleBarChart`, `renderSimpleBarChart`

### SIMPLE_BAR JSON examples

`highlight` (확인)
```json
{ "op": "draw", "action": "highlight", "select": { "mark": "rect", "keys": ["USA"] }, "style": { "color": "#ef4444" } }
```

```json
{ "op": "draw", "action": "highlight", "chartId": "after-covid", "select": { "keys": ["2021", "2022"] }, "style": { "color": "#dc2626", "opacity": 1 } }
```

`dim` (확인)
```json
{ "op": "draw", "action": "dim", "select": { "keys": ["USA", "JPN"] }, "style": { "opacity": 0.2 } }
```

`clear`
```json
{ "op": "draw", "action": "clear" }
```

`text` (확인)
```json
{ "op": "draw", "action": "text", "select": { "keys": ["USA"] }, "text": { "mode": "anchor", "value": "53", "offset": { "y": -8 } } }
```

```json
{ "op": "draw", "action": "text", "text": { "mode": "normalized", "position": { "x": 0.5, "y": 0.92 }, "value": "Overall trend" } }
```

`rect` (확인)
```json
{ "op": "draw", "action": "rect", "rect": { "mode": "normalized", "position": { "x": 0.35, "y": 0.6 }, "size": { "width": 0.25, "height": 0.25 }, "style": { "fill": "#fef3c7", "opacity": 0.4, "stroke": "#f59e0b" } } }
```

```json
{ "op": "draw", "action": "rect", "rect": { "mode": "data-point", "point": { "x": "USA" }, "size": { "width": 0.12, "height": 0.14 }, "style": { "stroke": "#ef4444", "strokeWidth": 2, "fill": "none" } } }
```

`line` (확인)
```json
{ "op": "draw", "action": "line", "line": { "mode": "horizontal-from-y", "hline": { "y": 60 }, "style": { "stroke": "#2563eb", "strokeWidth": 2 } } }
```

```json
{ "op": "draw", "action": "line", "line": { "mode": "connect", "connectBy": { "start": { "target": "USA" }, "end": { "target": "JPN" } }, "arrow": { "end": true }, "style": { "stroke": "#0ea5e9", "strokeWidth": 2 } } }
```

`filter` (확인)
```json
{ "op": "draw", "action": "filter", "filter": { "y": { "op": "gte", "value": 60 } } }
```

```json
{ "op": "draw", "action": "filter", "filter": { "x": { "include": ["USA", "JPN", "KOR"] } } }
```

`sort` (확인)
```json
{ "op": "draw", "action": "sort", "sort": { "by": "y", "order": "desc" } }
```

```json
{ "op": "draw", "action": "sort", "sort": { "by": "x", "order": "asc" } }
```

`split` (확인)
```json
{ "op": "draw", "action": "split", "split": { "by": "x", "groups": { "first-half": ["USA", "JPN", "FRA"], "second-half": ["AUS", "ESP", "NOR"] }, "orientation": "horizontal" } }
```

```json
{ "op": "draw", "action": "split", "split": { "by": "x", "groups": { "focus": ["USA", "JPN"] }, "restTo": "others", "orientation": "vertical" } }
```

`unsplit`
```json
{ "op": "draw", "action": "unsplit" }
```

`sum` (value 값 안들거오도록 하기)
```json
{ "op": "draw", "action": "sum", "sum": { "value": 1129, "label": "sum" } }
```

```json
{ "op": "draw", "action": "sum", "chartId": "first-half", "sum": { "value": 320, "label": "partial sum" } }
```

`bar-segment` (확인)
```json
{ "op": "draw", "action": "bar-segment", "segment": { "threshold": 60, "when": "gte", "style": { "fill": "#ef4444", "opacity": 0.9 } } }
```

```json
{ "op": "draw", "action": "bar-segment", "select": { "keys": ["USA"] }, "segment": { "threshold": 50, "when": "lt", "style": { "fill": "#3b82f6", "opacity": 0.6, "stroke": "#1d4ed8" } } }
```

`band` (확인)
```json
{ "op": "draw", "action": "band", "band": { "axis": "x", "range": ["USA", "JPN"], "label": "focus range", "style": { "fill": "#fde68a", "opacity": 0.25 } } }
```

```json
{ "op": "draw", "action": "band", "band": { "axis": "y", "range": [50, 70], "style": { "fill": "#93c5fd", "opacity": 0.2, "stroke": "#2563eb" } } }
```

`scalar-panel` (확인. 이걸 실제로 사용할지는 모르겠음.)
```json
{ "op": "draw", "action": "scalar-panel", "scalarPanel": { "mode": "diff", "layout": "inset", "left": { "label": "USA", "value": 53 }, "right": { "label": "JPN", "value": 42 }, "delta": { "label": "Δ", "value": 11 } } }
```

```json
{ "op": "draw", "action": "scalar-panel", "scalarPanel": { "mode": "base", "layout": "full-replace", "absolute": true, "left": { "label": "Group A", "value": 66.7 }, "right": { "label": "Threshold", "value": 65 } } }
```

---

## 2. STACKED_BAR

기준 Vega-Lite spec:
- `data/test/spec/bar_stacked_ver.json`

지원 draw action:
- `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `filter`, `sort`, `split`, `unsplit`, `sum`, `bar-segment`, `band`, `scalar-panel`, `stacked-to-grouped`, `stacked-to-simple`, `stacked-to-diverging`, `stacked-filter-groups`

D3 실행 함수(핵심):
- 공통: `src/rendering/draw/BaseDrawHandler.ts`
- stacked 전용: `src/rendering/draw/bar/StackedBarDrawHandler.ts`의
  - `sortByAggregate`, `filterByTarget`, `filterBySeries`, `sumStacked`, `barSegmentByAggregate`, `relayoutTargets`, `run`
- 변환: 
  - `src/rendering/bar/stackGroupTransforms.ts`의 `convertStackedToGrouped`, `convertStackedToDiverging`
  - `src/rendering/bar/toSimpleTransforms.ts`의 `convertStackedToSimple`
- split/unsplit 렌더:
  - `src/rendering/bar/stackedBarRenderer.ts`의 `renderSplitStackedBarChart`, `renderStackedBarChart`

### STACKED_BAR JSON examples

`highlight` (rect 크기 조절 필요)
```json
{ "op": "draw", "action": "highlight", "select": { "mark": "rect", "field": "month", "keys": [1] }, "style": { "color": "#ef4444" } }
```

```json
{ "op": "draw", "action": "highlight", "select": { "mark": "rect", "field": "weather", "keys": ["rain"] }, "style": { "color": "#dc2626" } }
```

`dim` (확인)
```json
{ "op": "draw", "action": "dim", "select": { "mark": "rect", "field": "weather", "keys": ["snow"] }, "style": { "opacity": 0.2 } }
```

`filter` (필요없음)
```json
{ "op": "draw", "action": "filter", "filter": { "x": { "include": ["1", "2", "3"] } } }
```

```json
{ "op": "draw", "action": "filter", "filter": { "y": { "op": "gte", "value": 30 } } }
```

`sort` (필요 없음)
```json
{ "op": "draw", "action": "sort", "sort": { "by": "y", "order": "desc" } }
```

```json
{ "op": "draw", "action": "sort", "sort": { "by": "x", "order": "asc" } }
```

`sum` (필요 없음)
```json
{ "op": "draw", "action": "sum", "sum": { "value": 320, "label": "total" } }
```

`bar-segment` (필요 없음)
```json
{ "op": "draw", "action": "bar-segment", "segment": { "threshold": 20, "when": "gte", "style": { "fill": "#ef4444", "opacity": 0.8 } } }
```

`stacked-filter-groups` (확인)
```json
{ "op": "draw", "action": "stacked-filter-groups", "groupFilter": { "groups": ["rain", "sun"] } }
```

```json
{ "op": "draw", "action": "stacked-filter-groups", "groupFilter": { "exclude": ["snow"] } }
```

```json
{ "op": "draw", "action": "stacked-filter-groups", "groupFilter": { "reset": true } }
```

`stacked-to-grouped` (확인)
```json
{ "op": "draw", "action": "stacked-to-grouped", "stackGroup": { "xField": "month", "colorField": "weather" } }
```

```json
{ "op": "draw", "action": "stacked-to-grouped", "stackGroup": { "swapAxes": true } }
```

`stacked-to-simple`
```json
{ "op": "draw", "action": "stacked-to-simple", "toSimple": { "series": "rain" } }
```

`stacked-to-diverging` (필요할지?)
```json
{ "op": "draw", "action": "stacked-to-diverging" }
```

`split` (필요 없음.)
```json
{ "op": "draw", "action": "split", "split": { "by": "x", "groups": { "A": ["Jan", "Feb"], "B": ["Mar", "Apr"] }, "orientation": "horizontal" } }
```

`unsplit`
```json
{ "op": "draw", "action": "unsplit" }
```

`band` (필요 없음)
```json
{ "op": "draw", "action": "band", "band": { "axis": "x", "range": ["Jan", "Mar"], "style": { "fill": "#fef3c7", "opacity": 0.25 } } }
```

`scalar-panel` (필요 없음)
```json
{ "op": "draw", "action": "scalar-panel", "scalarPanel": { "mode": "diff", "left": { "label": "rain", "value": 120 }, "right": { "label": "sun", "value": 95 }, "delta": { "value": 25 } } }
```

공통 계열(`dim`, `clear`, `text`, `rect`, `line`)은 SIMPLE_BAR 예시와 동일한 payload 구조를 사용한다.

---

## 3. GROUPED_BAR

기준 Vega-Lite spec:
- `data/test/spec/bar_grouped_ver.json`

지원 draw action:
- `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `filter`, `sort`, `split`, `unsplit`, `sum`, `bar-segment`, `band`, `scalar-panel`, `grouped-to-stacked`, `grouped-to-simple`, `grouped-filter-groups`

D3 실행 함수(핵심):
- 공통: `src/rendering/draw/BaseDrawHandler.ts`
- grouped 전용: `src/rendering/draw/bar/GroupedBarDrawHandler.ts`의
  - `sortGroupedBars`, `filterGroupedBars`, `filterGroupedSeries`, `sumGrouped`, `relayoutGroupedBars`, `run`
- 변환:
  - `src/rendering/bar/stackGroupTransforms.ts`의 `convertGroupedToStacked`
  - `src/rendering/bar/toSimpleTransforms.ts`의 `convertGroupedToSimple`
- split/unsplit 렌더:
  - `src/rendering/bar/groupedBarRenderer.ts`의 `renderSplitGroupedBarChart`, `renderGroupedBarChart`

### GROUPED_BAR JSON examples

`highlight`
```json
{ "op": "draw", "action": "highlight", "select": { "mark": "rect", "field": "Region", "keys": ["Europe"] }, "style": { "color": "#ef4444" } }
```

```json
{ "op": "draw", "action": "highlight", "select": { "mark": "rect", "field": "Year", "keys": ["2020"] }, "style": { "color": "#dc2626" } }
```

`dim`
```json
{ "op": "draw", "action": "dim", "select": { "mark": "rect", "field": "Region", "keys": ["Africa"] }, "style": { "opacity": 0.2 } }
```

`filter`
```json
{ "op": "draw", "action": "filter", "filter": { "x": { "include": ["Europe", "Asia"] } } }
```

```json
{ "op": "draw", "action": "filter", "filter": { "y": { "op": "gt", "value": 10 } } }
```

`sort`
```json
{ "op": "draw", "action": "sort", "sort": { "by": "y", "order": "desc" } }
```

`grouped-filter-groups`
```json
{ "op": "draw", "action": "grouped-filter-groups", "groupFilter": { "groups": ["Europe", "Asia"] } }
```

```json
{ "op": "draw", "action": "grouped-filter-groups", "groupFilter": { "exclude": ["Africa"] } }
```

```json
{ "op": "draw", "action": "grouped-filter-groups", "groupFilter": { "reset": true } }
```

`grouped-to-stacked`
```json
{ "op": "draw", "action": "grouped-to-stacked", "stackGroup": { "xField": "Year", "colorField": "Region" } }
```

`grouped-to-simple`
```json
{ "op": "draw", "action": "grouped-to-simple", "toSimple": { "series": "Europe" } }
```

`sum`
```json
{ "op": "draw", "action": "sum", "sum": { "value": 250, "label": "sum" } }
```

`bar-segment`
```json
{ "op": "draw", "action": "bar-segment", "segment": { "threshold": 15, "when": "gte", "style": { "fill": "#ef4444", "opacity": 0.8 } } }
```

`split`
```json
{ "op": "draw", "action": "split", "split": { "by": "x", "groups": { "old": ["2018", "2019"], "new": ["2020", "2021"] }, "orientation": "horizontal" } }
```

`unsplit`
```json
{ "op": "draw", "action": "unsplit" }
```

`band`
```json
{ "op": "draw", "action": "band", "band": { "axis": "y", "range": [10, 20], "label": "mid zone", "style": { "fill": "#bfdbfe", "opacity": 0.25 } } }
```

`scalar-panel`
```json
{ "op": "draw", "action": "scalar-panel", "scalarPanel": { "mode": "diff", "left": { "label": "Europe", "value": 42 }, "right": { "label": "Asia", "value": 37 }, "delta": { "value": 5 } } }
```

공통 계열(`dim`, `clear`, `text`, `rect`, `line`)은 SIMPLE_BAR 예시와 동일한 payload 구조를 사용한다.

---

## 4. SIMPLE_LINE

기준 Vega-Lite spec:
- `data/test/spec/line_simple.json`

지원 draw action:
- `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `line-trace`, `filter`, `split`, `unsplit`, `line-to-bar`, `band`, `scalar-panel`

D3 실행 함수(핵심):
- 공통: `src/rendering/draw/BaseDrawHandler.ts`
- line 전용:
  - `src/rendering/draw/line/SimpleLineDrawHandler.ts`의 `highlight`, `dim`, `lineTrace`, `filter`, `rectAxisY`, `run`
- line-to-bar 변환:
  - `src/operation/run/simpleLineOps.ts`의 `convertLineChartToBars`
  - `src/rendering/line/simpleLineRenderer.ts`의 `renderSimpleLineChart`
- split/unsplit 렌더:
  - `src/rendering/line/simpleLineRenderer.ts`의 `renderSplitSimpleLineChart`, `renderSimpleLineChart`

### SIMPLE_LINE JSON examples

`highlight` (확인)
```json
{ "op": "draw", "action": "highlight", "select": { "mark": "circle", "keys": ["2010"] }, "style": { "color": "#ef4444" } }
```

`dim`
```json
{ "op": "draw", "action": "dim", "select": { "keys": ["2018", "2019"] }, "style": { "opacity": 0.2 } }
```

`line-trace`
```json
{ "op": "draw", "action": "line-trace", "select": { "keys": ["2015", "2019"] }, "line": { "style": { "stroke": "#0ea5e9", "strokeWidth": 2 } } }
```

```json
{ "op": "draw", "action": "line-trace", "trace": { "keys": ["2017", "2020"] } }
```

`filter`
```json
{ "op": "draw", "action": "filter", "filter": { "x": { "include": ["2016", "2017", "2018"] } } }
```

```json
{ "op": "draw", "action": "filter", "filter": { "y": { "op": "gte", "value": 10 } } }
```

`rect`
```json
{ "op": "draw", "action": "rect", "rect": { "mode": "axis", "axis": { "y": [8, 12] }, "style": { "fill": "#dbeafe", "opacity": 0.3, "stroke": "#2563eb" } } }
```

```json
{ "op": "draw", "action": "rect", "rect": { "mode": "axis", "axis": { "y": 10 }, "style": { "fill": "none", "stroke": "#1d4ed8", "strokeWidth": 2 } } }
```

`line`
```json
{ "op": "draw", "action": "line", "line": { "mode": "horizontal-from-y", "hline": { "y": 10 }, "style": { "stroke": "#2563eb", "strokeWidth": 2 } } }
```

`line-to-bar`
```json
{ "op": "draw", "action": "line-to-bar" }
```

`split`
```json
{ "op": "draw", "action": "split", "split": { "by": "x", "groups": { "before": ["2014", "2015", "2016"], "after": ["2019", "2020", "2021"] }, "orientation": "horizontal" } }
```

`unsplit`
```json
{ "op": "draw", "action": "unsplit" }
```

`band`
```json
{ "op": "draw", "action": "band", "band": { "axis": "x", "range": ["2016", "2019"], "label": "period", "style": { "fill": "#fde68a", "opacity": 0.2 } } }
```

`scalar-panel`
```json
{ "op": "draw", "action": "scalar-panel", "scalarPanel": { "mode": "diff", "left": { "label": "2018", "value": 11 }, "right": { "label": "2020", "value": 15 }, "delta": { "value": -4 } } }
```

공통 계열(`clear`, `text`)은 SIMPLE_BAR 예시와 동일한 payload 구조를 사용한다.

---

## 5. MULTI_LINE

기준 Vega-Lite spec:
- `data/test/spec/line_multiple.json`

지원 draw action:
- `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `split`, `unsplit`, `multi-line-to-stacked`, `multi-line-to-grouped`, `band`, `scalar-panel`

D3 실행 함수(핵심):
- 공통: `src/rendering/draw/BaseDrawHandler.ts`
- multi-line 전용:
  - `src/rendering/draw/line/MultiLineDrawHandler.ts`의 `run` (공통 action dispatch)
- 변환:
  - `src/rendering/line/multiLineToBarTransforms.ts`의 `convertMultiLineToStackedBar`, `convertMultiLineToGroupedBar`
- split/unsplit 렌더:
  - `src/rendering/line/multipleLineRenderer.ts`의 `renderSplitMultipleLineChart`, `renderMultipleLineChart`

### MULTI_LINE JSON examples

`highlight`
```json
{ "op": "draw", "action": "highlight", "select": { "mark": "path", "field": "series", "keys": ["AAPL"] }, "style": { "color": "#ef4444" } }
```

```json
{ "op": "draw", "action": "highlight", "select": { "mark": "circle", "field": "series", "keys": ["AAPL", "MSFT"] }, "style": { "color": "#dc2626" } }
```

`dim`
```json
{ "op": "draw", "action": "dim", "select": { "field": "series", "keys": ["AAPL"] }, "style": { "opacity": 0.15 } }
```

`clear`
```json
{ "op": "draw", "action": "clear" }
```

`text`
```json
{ "op": "draw", "action": "text", "text": { "mode": "normalized", "position": { "x": 0.12, "y": 0.9 }, "value": "Tech leaders" } }
```

`rect`
```json
{ "op": "draw", "action": "rect", "rect": { "mode": "normalized", "position": { "x": 0.45, "y": 0.55 }, "size": { "width": 0.3, "height": 0.22 }, "style": { "fill": "#fef3c7", "opacity": 0.25 } } }
```

`line`
```json
{ "op": "draw", "action": "line", "line": { "mode": "connect", "connectBy": { "start": { "target": "2020-01-01", "series": "AAPL" }, "end": { "target": "2021-01-01", "series": "AAPL" } }, "arrow": { "end": true }, "style": { "stroke": "#0ea5e9", "strokeWidth": 2 } } }
```

`split`
```json
{ "op": "draw", "action": "split", "split": { "by": "x", "groups": { "early": ["2020-01-01", "2020-06-01"], "late": ["2021-01-01", "2021-06-01"] }, "orientation": "horizontal" } }
```

`unsplit`
```json
{ "op": "draw", "action": "unsplit" }
```

`multi-line-to-stacked`
```json
{ "op": "draw", "action": "multi-line-to-stacked" }
```

`multi-line-to-grouped`
```json
{ "op": "draw", "action": "multi-line-to-grouped" }
```

`band`
```json
{ "op": "draw", "action": "band", "band": { "axis": "y", "range": [120, 180], "label": "target band", "style": { "fill": "#bfdbfe", "opacity": 0.2, "stroke": "#3b82f6" } } }
```

`scalar-panel`
```json
{ "op": "draw", "action": "scalar-panel", "scalarPanel": { "mode": "diff", "left": { "label": "AAPL avg", "value": 154.2 }, "right": { "label": "MSFT avg", "value": 148.9 }, "delta": { "value": 5.3 } } }
```

---

## 6. 빠른 매핑 체크리스트

아래 조건을 모두 만족하면 문서와 런타임 동기화가 맞다.
- 각 차트 섹션 action 목록이 `src/rendering/draw/supportMatrix.ts`의 `supported` 항목과 일치
- JSON 키가 `src/rendering/draw/types.ts` 타입 키와 일치
- D3 실행 함수명/경로가 실제 선언과 일치

## Appendix. Operation JSON Specs (Operation-by-Operation)

아래는 차트별 data operation spec을 항목별로 분리해 정리한 JSON 예시다.

### SIMPLE BAR

`retrieveValue`
```json
[
  {
    "op": "retrieveValue",
    "field": "rating",
    "target": "USA"
  }
]
```

`filter`
```json
[
  {
    "op": "filter",
    "field": "rating",
    "operator": ">=",
    "value": 60
  }
]
```

`sort`
```json
[
  {
    "op": "sort",
    "field": "rating",
    "order": "desc"
  }
]
```

`findExtremum`
```json
[
  {
    "op": "findExtremum",
    "field": "rating",
    "which": "max"
  }
]
```

`determineRange`
```json
[
  {
    "op": "determineRange",
    "field": "rating"
  }
]
```

`compare`
```json
[
  {
    "op": "compare",
    "field": "rating",
    "targetA": "USA",
    "targetB": "JPN"
  }
]
```

`compareBool`
```json
[
  {
    "op": "compareBool",
    "field": "rating",
    "targetA": "USA",
    "targetB": "JPN",
    "operator": ">"
  }
]
```

`sum`
```json
[
  {
    "op": "sum",
    "field": "rating"
  }
]
```

`average`
```json
[
  {
    "op": "average",
    "field": "rating"
  }
]
```

`diff`
```json
[
  {
    "op": "diff",
    "field": "rating",
    "targetA": "USA",
    "targetB": "JPN",
    "signed": true
  }
]
```

`lagDiff`
```json
[
  {
    "op": "lagDiff",
    "field": "rating",
    "orderField": "country",
    "order": "asc"
  }
]
```

`pairDiff`
```json
[
  {
    "op": "pairDiff",
    "by": "country",
    "field": "rating",
    "groupA": "USA",
    "groupB": "JPN",
    "signed": true
  }
]
```

`nth`
```json
[
  {
    "op": "nth",
    "n": 3,
    "from": "left",
    "orderField": "country"
  }
]
```

`count`
```json
[
  {
    "op": "count",
    "field": "country"
  }
]
```

`add`
```json
[
  {
    "op": "add",
    "field": "rating",
    "targetA": "USA",
    "targetB": "JPN"
  }
]
```

`scale`
```json
[
  {
    "op": "scale",
    "field": "rating",
    "target": "USA",
    "factor": 1.1
  }
]
```

`setOp`
```json
[
  {
    "op": "setOp",
    "fn": "intersection",
    "meta": {
      "inputs": [
        "node-a",
        "node-b"
      ]
    }
  }
]
```

### STACKED BAR

`retrieveValue`
```json
[
  {
    "op": "retrieveValue",
    "field": "count",
    "target": {
      "target": "1",
      "series": "rain"
    }
  }
]
```

`filter`
```json
[
  {
    "op": "filter",
    "field": "month",
    "include": [
      1,
      2,
      3
    ]
  }
]
```

`sort`
```json
[
  {
    "op": "sort",
    "field": "count",
    "order": "desc"
  }
]
```

`findExtremum`
```json
[
  {
    "op": "findExtremum",
    "field": "count",
    "which": "max",
    "group": "rain"
  }
]
```

`determineRange`
```json
[
  {
    "op": "determineRange",
    "field": "count",
    "group": "rain"
  }
]
```

`compare`
```json
[
  {
    "op": "compare",
    "field": "count",
    "targetA": {
      "target": "1",
      "series": "rain"
    },
    "targetB": {
      "target": "2",
      "series": "rain"
    }
  }
]
```

`compareBool`
```json
[
  {
    "op": "compareBool",
    "field": "count",
    "targetA": {
      "target": "1",
      "series": "sun"
    },
    "targetB": {
      "target": "1",
      "series": "rain"
    },
    "operator": ">"
  }
]
```

`sum`
```json
[
  {
    "op": "sum",
    "field": "count",
    "group": "rain"
  }
]
```

`average`
```json
[
  {
    "op": "average",
    "field": "count",
    "group": "rain"
  }
]
```

`diff`
```json
[
  {
    "op": "diff",
    "field": "count",
    "targetA": {
      "target": "1",
      "series": "rain"
    },
    "targetB": {
      "target": "1",
      "series": "sun"
    },
    "signed": true
  }
]
```

`lagDiff`
```json
[
  {
    "op": "lagDiff",
    "field": "count",
    "orderField": "month",
    "order": "asc",
    "group": "rain"
  }
]
```

`pairDiff`
```json
[
  {
    "op": "pairDiff",
    "by": "month",
    "field": "count",
    "groupA": "rain",
    "groupB": "sun",
    "signed": true
  }
]
```

`nth`
```json
[
  {
    "op": "nth",
    "n": 1,
    "from": "left",
    "orderField": "month",
    "group": "rain"
  }
]
```

`count`
```json
[
  {
    "op": "count",
    "field": "month",
    "group": "rain"
  }
]
```

`add`
```json
[
  {
    "op": "add",
    "field": "count",
    "targetA": {
      "target": "1",
      "series": "rain"
    },
    "targetB": {
      "target": "1",
      "series": "sun"
    }
  }
]
```

`scale`
```json
[
  {
    "op": "scale",
    "field": "count",
    "target": {
      "target": "1",
      "series": "rain"
    },
    "factor": 1.2
  }
]
```

`setOp`
```json
[
  {
    "op": "setOp",
    "fn": "union",
    "group": "rain",
    "meta": {
      "inputs": [
        "node-a",
        "node-b"
      ]
    }
  }
]
```

### GROUPED BAR

`retrieveValue`
```json
[
  {
    "op": "retrieveValue",
    "field": "Media rights revenue in billion US dollars",
    "target": {
      "target": "2010",
      "series": "North America"
    }
  }
]
```

`filter`
```json
[
  {
    "op": "filter",
    "field": "Year",
    "include": [
      2009,
      2010,
      2011
    ]
  }
]
```

`sort`
```json
[
  {
    "op": "sort",
    "field": "Media rights revenue in billion US dollars",
    "order": "desc",
    "group": "North America"
  }
]
```

`findExtremum`
```json
[
  {
    "op": "findExtremum",
    "field": "Media rights revenue in billion US dollars",
    "which": "max",
    "group": "North America"
  }
]
```

`determineRange`
```json
[
  {
    "op": "determineRange",
    "field": "Media rights revenue in billion US dollars",
    "group": "North America"
  }
]
```

`compare`
```json
[
  {
    "op": "compare",
    "field": "Media rights revenue in billion US dollars",
    "targetA": {
      "target": "2010",
      "series": "North America"
    },
    "targetB": {
      "target": "2010",
      "series": "Latin America"
    }
  }
]
```

`compareBool`
```json
[
  {
    "op": "compareBool",
    "field": "Media rights revenue in billion US dollars",
    "targetA": {
      "target": "2013",
      "series": "Europe, Middle East and Africa"
    },
    "targetB": {
      "target": "2013",
      "series": "Asia Pacific"
    },
    "operator": ">"
  }
]
```

`sum`
```json
[
  {
    "op": "sum",
    "field": "Media rights revenue in billion US dollars",
    "group": "North America"
  }
]
```

`average`
```json
[
  {
    "op": "average",
    "field": "Media rights revenue in billion US dollars",
    "group": "North America"
  }
]
```

`diff`
```json
[
  {
    "op": "diff",
    "field": "Media rights revenue in billion US dollars",
    "targetA": {
      "target": "2012",
      "series": "North America"
    },
    "targetB": {
      "target": "2012",
      "series": "Latin America"
    },
    "signed": true
  }
]
```

`lagDiff`
```json
[
  {
    "op": "lagDiff",
    "field": "Media rights revenue in billion US dollars",
    "orderField": "Year",
    "order": "asc",
    "group": "North America"
  }
]
```

`pairDiff`
```json
[
  {
    "op": "pairDiff",
    "by": "Year",
    "field": "Media rights revenue in billion US dollars",
    "groupA": "North America",
    "groupB": "Latin America",
    "signed": true
  }
]
```

`nth`
```json
[
  {
    "op": "nth",
    "n": 2,
    "from": "left",
    "orderField": "Year",
    "group": "North America"
  }
]
```

`count`
```json
[
  {
    "op": "count",
    "field": "Year",
    "group": "North America"
  }
]
```

`add`
```json
[
  {
    "op": "add",
    "field": "Media rights revenue in billion US dollars",
    "targetA": {
      "target": "2010",
      "series": "North America"
    },
    "targetB": {
      "target": "2010",
      "series": "Latin America"
    }
  }
]
```

`scale`
```json
[
  {
    "op": "scale",
    "field": "Media rights revenue in billion US dollars",
    "target": {
      "target": "2013",
      "series": "North America"
    },
    "factor": 1.1
  }
]
```

`setOp`
```json
[
  {
    "op": "setOp",
    "fn": "union",
    "group": "North America",
    "meta": {
      "inputs": [
        "node-a",
        "node-b"
      ]
    }
  }
]
```

### SIMPLE LINE

`retrieveValue`
```json
[
  {
    "op": "retrieveValue",
    "field": "research_and_development_expenditure",
    "target": "2010-01-01"
  }
]
```

`filter`
```json
[
  {
    "op": "filter",
    "field": "research_and_development_expenditure",
    "operator": ">=",
    "value": 5000
  }
]
```

`findExtremum`
```json
[
  {
    "op": "findExtremum",
    "field": "research_and_development_expenditure",
    "which": "max"
  }
]
```

`determineRange`
```json
[
  {
    "op": "determineRange",
    "field": "research_and_development_expenditure"
  }
]
```

`compare`
```json
[
  {
    "op": "compare",
    "field": "research_and_development_expenditure",
    "targetA": "2010-01-01",
    "targetB": "2009-01-01"
  }
]
```

`compareBool`
```json
[
  {
    "op": "compareBool",
    "field": "research_and_development_expenditure",
    "targetA": "2010-01-01",
    "targetB": "2009-01-01",
    "operator": ">"
  }
]
```

`sum`
```json
[
  {
    "op": "sum",
    "field": "research_and_development_expenditure"
  }
]
```

`average`
```json
[
  {
    "op": "average",
    "field": "research_and_development_expenditure"
  }
]
```

`diff`
```json
[
  {
    "op": "diff",
    "field": "research_and_development_expenditure",
    "targetA": "2008-01-01",
    "targetB": "2007-01-01",
    "signed": true
  }
]
```

`lagDiff`
```json
[
  {
    "op": "lagDiff",
    "field": "research_and_development_expenditure",
    "orderField": "year",
    "order": "asc"
  }
]
```

`pairDiff`
```json
[
  {
    "op": "pairDiff",
    "by": "year",
    "field": "research_and_development_expenditure",
    "groupA": "A",
    "groupB": "B",
    "signed": true
  }
]
```

`nth`
```json
[
  {
    "op": "nth",
    "n": 5,
    "from": "left",
    "orderField": "year"
  }
]
```

`count`
```json
[
  {
    "op": "count",
    "field": "year"
  }
]
```

`add`
```json
[
  {
    "op": "add",
    "field": "research_and_development_expenditure",
    "targetA": "2011-01-01",
    "targetB": "2010-01-01"
  }
]
```

`scale`
```json
[
  {
    "op": "scale",
    "field": "research_and_development_expenditure",
    "target": "2014-01-01",
    "factor": 0.9
  }
]
```

`setOp`
```json
[
  {
    "op": "setOp",
    "fn": "intersection",
    "meta": {
      "inputs": [
        "node-a",
        "node-b"
      ]
    }
  }
]
```

### MULTI LINE

`retrieveValue`
```json
[
  {
    "op": "retrieveValue",
    "field": "price",
    "target": {
      "target": "2005-01-01",
      "series": "AAPL"
    }
  }
]
```

`filter`
```json
[
  {
    "op": "filter",
    "field": "price",
    "operator": ">=",
    "value": 100
  }
]
```

`findExtremum`
```json
[
  {
    "op": "findExtremum",
    "field": "price",
    "which": "max",
    "group": "AAPL"
  }
]
```

`determineRange`
```json
[
  {
    "op": "determineRange",
    "field": "price",
    "group": "AAPL"
  }
]
```

`compare`
```json
[
  {
    "op": "compare",
    "field": "price",
    "targetA": {
      "target": "2005-01-01",
      "series": "AAPL"
    },
    "targetB": {
      "target": "2005-01-01",
      "series": "MSFT"
    }
  }
]
```

`compareBool`
```json
[
  {
    "op": "compareBool",
    "field": "price",
    "targetA": {
      "target": "2005-01-01",
      "series": "AAPL"
    },
    "targetB": {
      "target": "2005-01-01",
      "series": "MSFT"
    },
    "operator": ">"
  }
]
```

`sum`
```json
[
  {
    "op": "sum",
    "field": "price",
    "group": "AAPL"
  }
]
```

`average`
```json
[
  {
    "op": "average",
    "field": "price",
    "group": "AAPL"
  }
]
```

`diff`
```json
[
  {
    "op": "diff",
    "field": "price",
    "targetA": {
      "target": "2005-01-01",
      "series": "AAPL"
    },
    "targetB": {
      "target": "2005-01-01",
      "series": "MSFT"
    },
    "signed": true
  }
]
```

`lagDiff`
```json
[
  {
    "op": "lagDiff",
    "field": "price",
    "orderField": "date",
    "order": "asc",
    "group": "AAPL"
  }
]
```

`pairDiff`
```json
[
  {
    "op": "pairDiff",
    "by": "date",
    "field": "price",
    "groupA": "AAPL",
    "groupB": "MSFT",
    "signed": true
  }
]
```

`nth`
```json
[
  {
    "op": "nth",
    "n": 12,
    "from": "left",
    "orderField": "date",
    "group": "AAPL"
  }
]
```

`count`
```json
[
  {
    "op": "count",
    "field": "date",
    "group": "AAPL"
  }
]
```

`add`
```json
[
  {
    "op": "add",
    "field": "price",
    "targetA": {
      "target": "2005-01-01",
      "series": "AAPL"
    },
    "targetB": {
      "target": "2005-01-01",
      "series": "MSFT"
    }
  }
]
```

`scale`
```json
[
  {
    "op": "scale",
    "field": "price",
    "target": {
      "target": "2005-01-01",
      "series": "AAPL"
    },
    "factor": 1.05
  }
]
```

`setOp`
```json
[
  {
    "op": "setOp",
    "fn": "union",
    "group": "AAPL",
    "meta": {
      "inputs": [
        "node-a",
        "node-b"
      ]
    }
  }
]
```
