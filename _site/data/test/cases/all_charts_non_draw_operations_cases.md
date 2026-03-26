# Chart Type × Non-Draw Operation Example Cases

draw 예시가 아니라, 현재 코드베이스에서 실제로 사용할 수 있는 non-draw operation 예시만 정리한다.

- 기준 spec/data는 각 차트의 테스트용 Vega-Lite spec과 CSV를 그대로 사용했다.
- 아래 JSON은 현재 validator/executor 기준으로 도메인 값과 파라미터를 맞춘 실행 가능한 예시다.
- `lagDiff`는 현재 validator-safe shape 기준으로 `field`, `group`, `order`, `absolute`만 사용했다.
  - 참고: [src/operation/build/authoring/data.ts](/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/src/operation/build/authoring/data.ts)
  - 참고: [nlp_server/opsspec/specs/compare.py](/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server/opsspec/specs/compare.py)
- `setOp`, `add`, `scale`, `nth`처럼 이전 node 결과를 쓰는 operation은 `meta.inputs`와 `"ref:nX"`를 함께 사용했다.
- Grouped Bar는 현재 chart context에서 `primary_dimension`과 `series_field`가 모두 `Region`으로 잡히므로, `Year`를 기준으로 하나의 연도만 다루는 예시는 먼저 `filter(field="Year", include=[...])`를 둔다.

## Support Overview

- Simple Bar
  - `retrieveValue`, `filter`, `findExtremum`, `determineRange`, `compare`, `compareBool`, `sort`, `sum`, `average`, `diff`, `lagDiff`, `nth`, `count`, `add`, `scale`, `setOp`
- Grouped Bar
  - `retrieveValue`, `filter`, `findExtremum`, `determineRange`, `compare`, `compareBool`, `sort`, `sum`, `average`, `diff`, `lagDiff`, `pairDiff`, `nth`, `count`, `add`, `scale`, `setOp`
- Stacked Bar
  - `retrieveValue`, `filter`, `findExtremum`, `determineRange`, `compare`, `compareBool`, `sort`, `sum`, `average`, `diff`, `lagDiff`, `pairDiff`, `nth`, `count`, `add`, `scale`, `setOp`
- Simple Line
  - `retrieveValue`, `filter`, `findExtremum`, `determineRange`, `compare`, `compareBool`, `sort`, `average`, `diff`, `lagDiff`, `nth`, `count`, `add`, `scale`, `setOp`
- Multiple Line
  - `retrieveValue`, `filter`, `findExtremum`, `determineRange`, `compare`, `compareBool`, `sort`, `average`, `diff`, `lagDiff`, `pairDiff`, `nth`, `count`, `add`, `scale`, `setOp`

---

## 1. Simple Bar Chart

Spec: `data/test/spec/bar_simple_ver.json`  
Data: `data/test/data/bar_simple_ver.csv`  
Encoding: `x=country`, `y=rating`

### retrieveValue

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "NLD"
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "country",
      "include": ["USA", "GBR", "NLD"]
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "op": "findExtremum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "which": "max"
    }
  ]
}
```

### determineRange

```json
{
  "ops": [
    {
      "op": "determineRange",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating"
    }
  ]
}
```

### compare

```json
{
  "ops": [
    {
      "op": "compare",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "USA",
      "targetB": "NLD",
      "which": "max"
    }
  ]
}
```

### compareBool

```json
{
  "ops": [
    {
      "op": "compareBool",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "USA",
      "targetB": "JPN",
      "operator": ">"
    }
  ]
}
```

### sort

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "order": "desc"
    }
  ]
}
```

### sum

```json
{
  "ops": [
    {
      "op": "sum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating"
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating"
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "op": "diff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "targetA": "NLD",
      "targetB": "USA",
      "signed": true,
      "precision": 2
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "op": "lagDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "order": "asc"
    }
  ]
}
```

### nth

```json
{
  "ops": [
    {
      "op": "nth",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "n": 3,
      "from": "left"
    }
  ]
}
```

### count

```json
{
  "ops": [
    {
      "op": "count",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "country"
    }
  ]
}
```

### add

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "USA"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "JPN"
    }
  ],
  "ops2": [
    {
      "op": "add",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "field": "rating"
    }
  ]
}
```

### scale

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "rating",
      "target": "GBR"
    }
  ],
  "ops2": [
    {
      "op": "scale",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "target": "ref:n1",
      "factor": 2,
      "field": "rating"
    }
  ]
}
```

### setOp

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "country",
      "include": ["USA", "GBR", "NLD"]
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "country",
      "include": ["GBR", "NLD", "IRL"]
    }
  ],
  "ops2": [
    {
      "op": "setOp",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "fn": "intersection"
    }
  ]
}
```

---

## 2. Grouped Bar Chart

Spec: `data/test/spec/bar_grouped_ver.json`  
Data: `ChartQA/data/csv/bar/grouped/0rfuaawgi58ajpsv.csv`  
Encoding: `column=Year`, `x=Region`, `y=Media rights revenue in billion US dollars`, `color=Region`

### retrieveValue

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    }
  ],
  "ops2": [
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Media rights revenue in billion US dollars",
      "target": "Asia Pacific",
      "group": "Asia Pacific"
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2011", "2012"]
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "op": "findExtremum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "which": "max",
      "group": "Asia Pacific"
    }
  ]
}
```

### determineRange

```json
{
  "ops": [
    {
      "op": "determineRange",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "Latin America"
    }
  ]
}
```

### compare

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    }
  ],
  "ops2": [
    {
      "op": "compare",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Media rights revenue in billion US dollars",
      "targetA": "North America",
      "groupA": "North America",
      "targetB": "Asia Pacific",
      "groupB": "Asia Pacific",
      "which": "max"
    }
  ]
}
```

### compareBool

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2013"]
    }
  ],
  "ops2": [
    {
      "op": "compareBool",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Media rights revenue in billion US dollars",
      "targetA": "Europe, Middle East and Africa",
      "groupA": "Europe, Middle East and Africa",
      "targetB": "North America",
      "groupB": "North America",
      "operator": ">"
    }
  ]
}
```

### sort

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    }
  ],
  "ops2": [
    {
      "op": "sort",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Media rights revenue in billion US dollars",
      "order": "desc"
    }
  ]
}
```

### sum

```json
{
  "ops": [
    {
      "op": "sum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "Asia Pacific"
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "Latin America"
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    }
  ],
  "ops2": [
    {
      "op": "diff",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Media rights revenue in billion US dollars",
      "targetA": "North America",
      "groupA": "North America",
      "targetB": "Asia Pacific",
      "groupB": "Asia Pacific",
      "signed": true,
      "precision": 2
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "op": "lagDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "North America",
      "order": "asc"
    }
  ]
}
```

### pairDiff

```json
{
  "ops": [
    {
      "op": "pairDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "by": "Region",
      "seriesField": "Year",
      "field": "Media rights revenue in billion US dollars",
      "groupA": "2013",
      "groupB": "2009",
      "precision": 2
    }
  ]
}
```

### nth

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    }
  ],
  "ops2": [
    {
      "op": "sort",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Media rights revenue in billion US dollars",
      "order": "desc"
    }
  ],
  "ops3": [
    {
      "op": "nth",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n2"], "sentenceIndex": 3 },
      "n": 2,
      "from": "left"
    }
  ]
}
```

### count

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    }
  ],
  "ops2": [
    {
      "op": "count",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "Region"
    }
  ]
}
```

### add

```json
{
  "ops": [
    {
      "op": "sum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "Asia Pacific"
    },
    {
      "op": "sum",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "Latin America"
    }
  ],
  "ops2": [
    {
      "op": "add",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "field": "Media rights revenue in billion US dollars"
    }
  ]
}
```

### scale

```json
{
  "ops": [
    {
      "op": "sum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "group": "Asia Pacific"
    }
  ],
  "ops2": [
    {
      "op": "scale",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "target": "ref:n1",
      "factor": 2,
      "field": "Media rights revenue in billion US dollars"
    }
  ]
}
```

### setOp

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "Year",
      "include": ["2012"]
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "Media rights revenue in billion US dollars",
      "operator": ">",
      "value": 10
    }
  ],
  "ops2": [
    {
      "op": "setOp",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "fn": "intersection"
    }
  ]
}
```

---

## 3. Stacked Bar Chart

Spec: `data/test/spec/bar_stacked_ver.json`  
Data: `data/test/data/bar_stacked_ver.csv`  
Encoding: `x=month`, `y=count`, `color=weather`

### retrieveValue

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "target": "8",
      "group": "sun"
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "month",
      "include": ["6", "7", "8"],
      "group": "sun"
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "op": "findExtremum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "which": "max",
      "group": "sun"
    }
  ]
}
```

### determineRange

```json
{
  "ops": [
    {
      "op": "determineRange",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "group": "fog"
    }
  ]
}
```

### compare

```json
{
  "ops": [
    {
      "op": "compare",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "targetA": "8",
      "groupA": "sun",
      "targetB": "8",
      "groupB": "rain",
      "which": "max"
    }
  ]
}
```

### compareBool

```json
{
  "ops": [
    {
      "op": "compareBool",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "targetA": "8",
      "groupA": "sun",
      "targetB": "8",
      "groupB": "fog",
      "operator": ">"
    }
  ]
}
```

### sort

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "order": "desc",
      "group": "sun"
    }
  ]
}
```

### sum

```json
{
  "ops": [
    {
      "op": "sum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "group": "sun"
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "group": "rain"
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "op": "diff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "targetA": "8",
      "groupA": "sun",
      "targetB": "8",
      "groupB": "rain",
      "signed": true
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "op": "lagDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "group": "sun",
      "order": "asc"
    }
  ]
}
```

### pairDiff

```json
{
  "ops": [
    {
      "op": "pairDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "by": "month",
      "field": "count",
      "groupA": "sun",
      "groupB": "rain",
      "precision": 2
    }
  ]
}
```

### nth

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "order": "desc",
      "group": "sun"
    }
  ],
  "ops2": [
    {
      "op": "nth",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "n": 2,
      "from": "left"
    }
  ]
}
```

### count

```json
{
  "ops": [
    {
      "op": "count",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "group": "snow"
    }
  ]
}
```

### add

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "target": "8",
      "group": "sun"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "target": "8",
      "group": "rain"
    }
  ],
  "ops2": [
    {
      "op": "add",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "field": "count"
    }
  ]
}
```

### scale

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "target": "8",
      "group": "sun"
    }
  ],
  "ops2": [
    {
      "op": "scale",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "target": "ref:n1",
      "factor": 0.5,
      "field": "count"
    }
  ]
}
```

### setOp

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "count",
      "operator": ">",
      "value": 80,
      "group": "sun"
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "month",
      "include": ["6", "7", "8"],
      "group": "sun"
    }
  ],
  "ops2": [
    {
      "op": "setOp",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "fn": "intersection",
      "group": "sun"
    }
  ]
}
```

---

## 4. Simple Line Chart

Spec: `data/test/spec/line_simple.json`  
Data: `data/test/data/line_simple.csv`  
Encoding: `x=year`, `y=research_and_development_expenditure`

### retrieveValue

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "target": "2009-01-01"
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "year",
      "operator": "between",
      "value": ["2007-01-01", "2010-01-01"]
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "op": "findExtremum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "which": "max"
    }
  ]
}
```

### determineRange

```json
{
  "ops": [
    {
      "op": "determineRange",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure"
    }
  ]
}
```

### compare

```json
{
  "ops": [
    {
      "op": "compare",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "targetA": "2008-01-01",
      "targetB": "2009-01-01",
      "which": "max"
    }
  ]
}
```

### compareBool

```json
{
  "ops": [
    {
      "op": "compareBool",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "targetA": "2014-01-01",
      "targetB": "2013-01-01",
      "operator": ">"
    }
  ]
}
```

### sort

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "order": "desc"
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure"
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "op": "diff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "targetA": "2014-01-01",
      "targetB": "1990-01-01",
      "signed": false,
      "precision": 2
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "op": "lagDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "order": "asc"
    }
  ]
}
```

### nth

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "order": "desc"
    }
  ],
  "ops2": [
    {
      "op": "nth",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "n": 2,
      "from": "left"
    }
  ]
}
```

### count

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "operator": ">=",
      "value": 5000
    }
  ],
  "ops2": [
    {
      "op": "count",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "year"
    }
  ]
}
```

### add

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "target": "2008-01-01"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "target": "2009-01-01"
    }
  ],
  "ops2": [
    {
      "op": "add",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "field": "research_and_development_expenditure"
    }
  ]
}
```

### scale

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "target": "2014-01-01"
    }
  ],
  "ops2": [
    {
      "op": "scale",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "target": "ref:n1",
      "factor": 1.1,
      "field": "research_and_development_expenditure"
    }
  ]
}
```

### setOp

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "year",
      "operator": "between",
      "value": ["2007-01-01", "2010-01-01"]
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "research_and_development_expenditure",
      "operator": ">",
      "value": 7000
    }
  ],
  "ops2": [
    {
      "op": "setOp",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "fn": "intersection"
    }
  ]
}
```

---

## 5. Multiple Line Chart

Spec: `data/test/spec/line_multiple.json`  
Data: `data/test/data/line_multiple.csv`  
Encoding: `x=date`, `y=price`, `color=symbol`

### retrieveValue

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "target": "2008-09-01",
      "group": "MSFT"
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "date",
      "operator": "between",
      "value": ["2008-09-01", "2008-12-01"],
      "group": "MSFT"
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "op": "findExtremum",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "which": "max",
      "group": "AAPL"
    }
  ]
}
```

### determineRange

```json
{
  "ops": [
    {
      "op": "determineRange",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "group": "GOOG"
    }
  ]
}
```

### compare

```json
{
  "ops": [
    {
      "op": "compare",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "targetA": "2008-09-01",
      "groupA": "MSFT",
      "targetB": "2008-09-01",
      "groupB": "AAPL",
      "which": "max"
    }
  ]
}
```

### compareBool

```json
{
  "ops": [
    {
      "op": "compareBool",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "targetA": "2009-01-01",
      "groupA": "AAPL",
      "targetB": "2009-01-01",
      "groupB": "MSFT",
      "operator": ">"
    }
  ]
}
```

### sort

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "order": "desc",
      "group": "IBM"
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "op": "average",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "group": "AMZN"
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "op": "diff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "targetA": "2008-09-01",
      "groupA": "MSFT",
      "targetB": "2008-09-01",
      "groupB": "AAPL",
      "signed": true,
      "precision": 2
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "op": "lagDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "group": "GOOG",
      "order": "asc"
    }
  ]
}
```

### pairDiff

```json
{
  "ops": [
    {
      "op": "pairDiff",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "by": "date",
      "field": "price",
      "groupA": "AAPL",
      "groupB": "MSFT",
      "precision": 2
    }
  ]
}
```

### nth

```json
{
  "ops": [
    {
      "op": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "order": "desc",
      "group": "AAPL"
    }
  ],
  "ops2": [
    {
      "op": "nth",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "n": 3,
      "from": "left"
    }
  ]
}
```

### count

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "date",
      "operator": "between",
      "value": ["2008-09-01", "2008-12-01"],
      "group": "GOOG"
    }
  ],
  "ops2": [
    {
      "op": "count",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "field": "date"
    }
  ]
}
```

### add

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "target": "2008-09-01",
      "group": "MSFT"
    },
    {
      "op": "retrieveValue",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "target": "2008-09-01",
      "group": "AAPL"
    }
  ],
  "ops2": [
    {
      "op": "add",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "field": "price"
    }
  ]
}
```

### scale

```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "price",
      "target": "2009-01-01",
      "group": "AMZN"
    }
  ],
  "ops2": [
    {
      "op": "scale",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 },
      "target": "ref:n1",
      "factor": 2,
      "field": "price"
    }
  ]
}
```

### setOp

```json
{
  "ops": [
    {
      "op": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "field": "date",
      "operator": "between",
      "value": ["2008-09-01", "2008-12-01"],
      "group": "MSFT"
    },
    {
      "op": "filter",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "field": "date",
      "operator": "between",
      "value": ["2008-10-01", "2009-01-01"],
      "group": "AAPL"
    }
  ],
  "ops2": [
    {
      "op": "setOp",
      "id": "n3",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 2 },
      "fn": "intersection"
    }
  ]
}
```
