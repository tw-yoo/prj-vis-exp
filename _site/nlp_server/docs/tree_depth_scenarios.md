# Tree Depth Scenarios (Depth 2 / 3 / 4) Using One Chart

This document uses one chart from the repo and provides 3 scenarios where the final OpsSpec (grammar) forms a dependency tree/DAG with max depth 2, 3, and 4.

Chosen chart:
- Vega-Lite spec: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/data/test/spec/bar_stacked_ver.json`
- Data (CSV): `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/data/test/data/bar_stacked_ver.csv`

Inferred chart roles (from `nlp_server/opsspec/runtime/context_builder.py`):
- `primary_dimension`: `month`
- `primary_measure`: `count`
- `series_field`: `weather`
- Example `series_field` domain: `drizzle, fog, rain, snow, sun`

Depth definition used here:
- Depth = max number of nodes on a dependency path following `meta.inputs`.

All grammars below are written in the **final API response shape**:

```json
{ "ops": [...], "ops2": [...], "last": [...] }
```

## Depth 2 Scenario

Question:
- Which months have above-average `count` for `rain`?

Explanation:
- Compute the average of `count` for `rain` across all months. Filter months where `rain` is above its average.

Final grammar (groups map):

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [] },
      "field": "count",
      "group": "rain"
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"] },
      "field": "count",
      "operator": ">",
      "value": "ref:n1",
      "group": "rain"
    }
  ]
}
```

## Depth 3 Scenario

Question:
- Which months have above-average `count` in both `rain` and `sun`?

Explanation:
- Compute the average of `count` for `rain` and for `sun` across all months. Filter months where each is above its own average. Take the intersection of the two month sets.

Final grammar (groups map):

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [] },
      "field": "count",
      "group": "rain"
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"] },
      "field": "count",
      "operator": ">",
      "value": "ref:n1",
      "group": "rain"
    }
  ],
  "ops2": [
    {
      "op": "average",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": [] },
      "field": "count",
      "group": "sun"
    },
    {
      "op": "filter",
      "id": "n4",
      "meta": { "nodeId": "n4", "inputs": ["n3"] },
      "field": "count",
      "operator": ">",
      "value": "ref:n3",
      "group": "sun"
    }
  ],
  "last": [
    {
      "op": "setOp",
      "id": "n5",
      "meta": { "nodeId": "n5", "inputs": ["n2", "n4"] },
      "fn": "intersection"
    }
  ]
}
```

## Depth 4 Scenario

Question:
- Is the number of months above average larger for `sun` than for `rain`?

Explanation:
- Compute the average of `count` for `rain`, filter months above the average, and count them. Do the same for `sun`. Compare the two counts.

Final grammar (groups map):

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [] },
      "field": "count",
      "group": "rain"
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"] },
      "field": "count",
      "operator": ">",
      "value": "ref:n1",
      "group": "rain"
    },
    {
      "op": "count",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n2"] },
      "field": "count",
      "group": "rain"
    }
  ],
  "ops2": [
    {
      "op": "average",
      "id": "n4",
      "meta": { "nodeId": "n4", "inputs": [] },
      "field": "count",
      "group": "sun"
    },
    {
      "op": "filter",
      "id": "n5",
      "meta": { "nodeId": "n5", "inputs": ["n4"] },
      "field": "count",
      "operator": ">",
      "value": "ref:n4",
      "group": "sun"
    },
    {
      "op": "count",
      "id": "n6",
      "meta": { "nodeId": "n6", "inputs": ["n5"] },
      "field": "count",
      "group": "sun"
    }
  ],
  "last": [
    {
      "op": "compareBool",
      "id": "n7",
      "meta": { "nodeId": "n7", "inputs": ["n3", "n6"] },
      "field": "count",
      "targetA": "ref:n6",
      "targetB": "ref:n3",
      "operator": ">"
    }
  ]
}
```
