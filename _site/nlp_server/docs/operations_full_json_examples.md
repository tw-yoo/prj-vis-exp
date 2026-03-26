# OpsSpec Operation JSON Examples (All Params Per Operation)

This document lists JSON examples for each supported non-draw operation in `nlp_server/opsspec/specs/`.

Notes:
- Every operation MUST include `meta.inputs` (empty list `[]` is allowed).
- Cross-node scalar references MUST use `"ref:n<digits>"` strings (example: `"ref:n1"`).
- `filter` supports three modes: membership (`include`/`exclude`), comparison (`operator`+`value`), and group-only (`group` only).

## Common Fields (All Ops)

```json
{
  "op": "OP_NAME",
  "id": "n1",
  "chartId": "optional-chart-id",
  "meta": {
    "nodeId": "n1",
    "inputs": ["n0"],
    "sentenceIndex": 1,
    "view": {
      "split": "vertical",
      "align": "x",
      "highlight": true,
      "reference_line": true,
      "note": "optional note"
    },
    "source": "optional freeform source string"
  }
}
```

## retrieveValue

```json
{
  "op": "retrieveValue",
  "id": "n1",
  "chartId": "chart-1",
  "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
  "field": "Revenue_Million_Euros",
  "target": ["2016/17", "2017/18"],
  "group": "Broadcasting"
}
```

## filter (membership mode)

```json
{
  "op": "filter",
  "id": "n1",
  "chartId": "chart-1",
  "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
  "field": "Season",
  "include": ["2016/17", "2017/18"],
  "exclude": ["2015/16"],
  "group": "Broadcasting"
}
```

## filter (membership on non-primary categorical field)

```json
{
  "op": "filter",
  "id": "n1b",
  "chartId": "chart-1",
  "meta": { "nodeId": "n1b", "inputs": [], "sentenceIndex": 1 },
  "field": "Frequency",
  "include": ["Occasionally (less than once a month)"]
}
```

## filter (comparison mode)

```json
{
  "op": "filter",
  "id": "n2",
  "chartId": "chart-1",
  "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "operator": ">",
  "value": "ref:n1",
  "group": "Broadcasting"
}
```

## filter (between row-order interval)

```json
{
  "op": "filter",
  "id": "n2b",
  "chartId": "chart-1",
  "meta": { "nodeId": "n2b", "inputs": [], "sentenceIndex": 1 },
  "field": "Year",
  "operator": "between",
  "value": ["2009", "2014"]
}
```

## filter (multi-group OR)

```json
{
  "op": "filter",
  "id": "n3",
  "chartId": "chart-1",
  "meta": { "nodeId": "n3", "inputs": [], "sentenceIndex": 2 },
  "field": "Season",
  "include": ["2016/17", "2017/18"],
  "group": ["Broadcasting", "Commercial"]
}
```

## filter (comparison mode + multi-group OR)

```json
{
  "op": "filter",
  "id": "n4",
  "chartId": "chart-1",
  "meta": { "nodeId": "n4", "inputs": ["n1"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "operator": ">",
  "value": "ref:n1",
  "group": ["Broadcasting", "Commercial"]
}
```

## filter (group-only series restriction)

```json
{
  "op": "filter",
  "id": "n5",
  "chartId": "chart-1",
  "meta": { "nodeId": "n5", "inputs": [], "sentenceIndex": 1 },
  "group": ["Philippines", "Thailand"]
}
```

## findExtremum

```json
{
  "op": "findExtremum",
  "id": "n3",
  "chartId": "chart-1",
  "meta": { "nodeId": "n3", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting",
  "which": "max"
}
```

## findExtremum (second highest)

```json
{
  "op": "findExtremum",
  "id": "n3b",
  "chartId": "chart-1",
  "meta": { "nodeId": "n3b", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "which": "max",
  "rank": 2
}
```

## findExtremum (second lowest)

```json
{
  "op": "findExtremum",
  "id": "n3c",
  "chartId": "chart-1",
  "meta": { "nodeId": "n3c", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "which": "min",
  "rank": 2
}
```

## determineRange

```json
{
  "op": "determineRange",
  "id": "n4",
  "chartId": "chart-1",
  "meta": { "nodeId": "n4", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting"
}
```

## compare

```json
{
  "op": "compare",
  "id": "n5",
  "chartId": "chart-1",
  "meta": { "nodeId": "n5", "inputs": ["n1", "n3"], "sentenceIndex": 3 },
  "field": "Revenue_Million_Euros",
  "targetA": "2016/17",
  "targetB": "2017/18",
  "group": "Broadcasting",
  "groupA": "Broadcasting",
  "groupB": "Commercial",
  "aggregate": "avg",
  "which": "max"
}
```

## compareBool

```json
{
  "op": "compareBool",
  "id": "n6",
  "chartId": "chart-1",
  "meta": { "nodeId": "n6", "inputs": ["n1", "n3"], "sentenceIndex": 3 },
  "field": "Revenue_Million_Euros",
  "targetA": "ref:n1",
  "targetB": "ref:n3",
  "group": "Broadcasting",
  "groupA": "Broadcasting",
  "groupB": "Commercial",
  "aggregate": "avg",
  "operator": ">"
}
```

## sort

```json
{
  "op": "sort",
  "id": "n7",
  "chartId": "chart-1",
  "meta": { "nodeId": "n7", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting",
  "order": "desc",
  "orderField": "Revenue_Million_Euros"
}
```

## sum

```json
{
  "op": "sum",
  "id": "n8",
  "chartId": "chart-1",
  "meta": { "nodeId": "n8", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting"
}
```

Notes:
- `sum` is allowed only for bar charts.
- `group` can be `"A"` or `["A","B"]`.
- For stacked bar, `group` omitted or multi-group means sum all values.

## average

```json
{
  "op": "average",
  "id": "n9",
  "chartId": "chart-1",
  "meta": { "nodeId": "n9", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting"
}
```

## diff

```json
{
  "op": "diff",
  "id": "n10",
  "chartId": "chart-1",
  "meta": { "nodeId": "n10", "inputs": ["n1", "n3"], "sentenceIndex": 4 },
  "field": "Revenue_Million_Euros",
  "targetA": "ref:n1",
  "targetB": "ref:n3",
  "group": "Broadcasting",
  "groupA": "Broadcasting",
  "groupB": "Commercial",
  "aggregate": "avg",
  "signed": true,
  "mode": "ratio",
  "percent": true,
  "scale": 100,
  "precision": 2,
  "targetName": "gap"
}
```

## lagDiff

```json
{
  "op": "lagDiff",
  "id": "n11",
  "chartId": "chart-1",
  "meta": { "nodeId": "n11", "inputs": [], "sentenceIndex": 1 },
  "field": "Audience_Millions",
  "group": "All",
  "order": "asc",
  "absolute": true
}
```

## pairDiff

```json
{
  "op": "pairDiff",
  "id": "n12",
  "chartId": "chart-1",
  "meta": { "nodeId": "n12", "inputs": [], "sentenceIndex": 2 },
  "by": "Season",
  "seriesField": "category",
  "field": "Revenue_Million_Euros",
  "groupA": "Broadcasting",
  "groupB": "Commercial",
  "signed": true,
  "absolute": false,
  "precision": 2
}
```

Grouped-bar example (City-wise 2025-2010):

```json
{
  "op": "pairDiff",
  "id": "n13",
  "meta": { "nodeId": "n13", "inputs": [], "sentenceIndex": 2 },
  "by": "City",
  "seriesField": "Year",
  "field": "Population in millions",
  "groupA": "2025",
  "groupB": "2010",
  "signed": true
}
```

## nth

```json
{
  "op": "nth",
  "id": "n13",
  "chartId": "chart-1",
  "meta": { "nodeId": "n13", "inputs": ["n7"], "sentenceIndex": 5 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting",
  "order": "desc",
  "orderField": "Revenue_Million_Euros",
  "n": 1,
  "from": "left"
}
```

## count

```json
{
  "op": "count",
  "id": "n14",
  "chartId": "chart-1",
  "meta": { "nodeId": "n14", "inputs": ["n2"], "sentenceIndex": 2 },
  "field": "Revenue_Million_Euros",
  "group": "Broadcasting"
}
```

## scale

```json
{
  "op": "scale",
  "id": "n15",
  "chartId": "chart-1",
  "meta": { "nodeId": "n15", "inputs": ["n9"], "sentenceIndex": 6 },
  "target": "ref:n9",
  "factor": 2.0,
  "field": "Revenue_Million_Euros"
}
```

## add

```json
{
  "op": "add",
  "id": "n16",
  "chartId": "chart-1",
  "meta": { "nodeId": "n16", "inputs": ["n2", "n4"], "sentenceIndex": 3 },
  "targetA": "ref:n2",
  "targetB": "ref:n4",
  "field": "Average weight in metric grams"
}
```

## setOp

```json
{
  "op": "setOp",
  "id": "n17",
  "chartId": "chart-1",
  "meta": { "nodeId": "n17", "inputs": ["n2", "n4"], "sentenceIndex": 6 },
  "fn": "intersection",
  "group": "result"
}
```
