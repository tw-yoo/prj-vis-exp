# Operation Spec by Chart Type (`operation-next`)

이 문서는 현재 `src/operation-next`에서 실제로 시각 렌더링을 지원하는 operation spec만 정리한다.

기존 auto draw plan registry 기준 문서가 아니라, Workbench에서 `operation-next` 실행 경로로 사용할 JSON 예시를 기준으로 한다. 아직 `operation-next` runner에서 구현되지 않은 operation은 차트별 목록에서 제외한다.

## 공통 기준

- 실행 진입점: `src/operation-next/runChartOps.ts`
- 차트별 runner:
  - `src/operation-next/runners/simpleBar.ts`
  - `src/operation-next/runners/simpleLine.ts`
  - `src/operation-next/runners/multipleLine.ts`
  - `src/operation-next/runners/groupedBar.ts`
  - `src/operation-next/runners/stackedBar.ts`
- 공통 sequential state:
  - `src/operation-next/chainState.ts`
  - `filter`는 `workingData`와 `salienceMap`을 갱신한다.
  - `average`, `findExtremum` 등 후속 operation은 이전 filter context를 사용한다.
  - `lagDiff`, `pairDiff`는 `derivedData`를 만들고 후속 `average`, `findExtremum`이 이를 사용할 수 있다.

## 지원 범위 요약

| Chart type | 현재 지원 operation |
| --- | --- |
| Simple bar chart | `retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `sort` |
| Simple line chart | `retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `lagDiff` |
| Multi line chart | `retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `lagDiff`, `pairDiff` |
| Grouped bar chart | `filter`, `draw:grouped-to-stacked` |
| Stacked bar chart | `filter`, `draw:stacked-to-grouped` |

## 1) Simple Bar Chart

- Vega-Lite sample: `data/test/spec/bar_simple_ver.json`
- Runner: `src/operation-next/runners/simpleBar.ts`
- 예시 field: `country`, `rating`

### retrieveValue

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "rating",
      "target": "USA",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "rating",
      "target": ["USA", "JPN"],
      "precision": 2,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "rating",
      "operator": ">=",
      "value": 60,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "rating",
      "operator": "between",
      "value": [60, 70],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "country",
      "include": ["USA", "JPN", "KOR"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "country",
      "exclude": ["DNK"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "diff",
      "field": "rating",
      "targetA": "USA",
      "targetB": "JPN",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "diff",
      "field": "rating",
      "targetA": "USA",
      "targetB": "JPN",
      "signed": false,
      "absolute": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "average",
      "field": "rating",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "findExtremum",
      "field": "rating",
      "which": "max",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "findExtremum",
      "field": "rating",
      "which": "min",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### sort

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "sort",
      "field": "rating",
      "order": "desc",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "sort",
      "field": "rating",
      "order": "asc",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### chain examples

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "rating",
      "operator": ">=",
      "value": 60,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "average",
      "field": "rating",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "rating",
      "operator": ">=",
      "value": 60,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "field": "rating",
      "which": "max",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "rating",
      "operator": ">=",
      "value": 50,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "sort",
      "field": "rating",
      "order": "desc",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

## 2) Simple Line Chart

- Vega-Lite sample: `data/test/spec/line_simple.json`
- Runner: `src/operation-next/runners/simpleLine.ts`
- 예시 field: `year`, `value`

### retrieveValue

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "value",
      "target": "2001",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "value",
      "operator": ">=",
      "value": 3000,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "year",
      "operator": "between",
      "value": ["1998", "2008"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "year",
      "include": ["2001", "2002", "2003"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "diff",
      "field": "value",
      "targetA": "2001",
      "targetB": "2008",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "average",
      "field": "value",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "findExtremum",
      "field": "value",
      "which": "max",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "findExtremum",
      "field": "value",
      "which": "min",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "lagDiff",
      "field": "value",
      "orderField": "year",
      "order": "asc",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### chain examples

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "year",
      "operator": "between",
      "value": ["1998", "2008"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "average",
      "field": "value",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "year",
      "operator": "between",
      "value": ["1998", "2008"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "field": "value",
      "which": "max",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "lagDiff",
      "field": "value",
      "orderField": "year",
      "order": "asc",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "field": "value",
      "which": "max",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "lagDiff",
      "field": "value",
      "orderField": "year",
      "order": "asc",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "average",
      "field": "value",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

## 3) Multi Line Chart

- Vega-Lite sample: `data/test/spec/line_multiple.json`
- Runner: `src/operation-next/runners/multipleLine.ts`
- 예시 field: `date`, `price`, `symbol`

### retrieveValue

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "price",
      "target": { "target": "2001-01-01", "series": "AAPL" },
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### filter

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "price",
      "operator": ">=",
      "value": 100,
      "group": "AAPL",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "date",
      "operator": "between",
      "value": ["2001-01-01", "2008-01-01"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "date",
      "include": ["2001-01-01", "2002-01-01", "2003-01-01"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### diff

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "diff",
      "field": "price",
      "targetA": { "target": "2001-01-01", "series": "AAPL" },
      "targetB": { "target": "2001-01-01", "series": "MSFT" },
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### average

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "average",
      "field": "price",
      "group": "AAPL",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### findExtremum

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "findExtremum",
      "field": "price",
      "which": "max",
      "group": "AAPL",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### lagDiff

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "lagDiff",
      "field": "price",
      "orderField": "date",
      "order": "asc",
      "group": "AAPL",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### pairDiff

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "pairDiff",
      "by": "date",
      "field": "price",
      "groupA": "AAPL",
      "groupB": "MSFT",
      "signed": true,
      "absolute": false,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "pairDiff",
      "by": "date",
      "field": "price",
      "groupA": "AAPL",
      "groupB": "MSFT",
      "signed": false,
      "absolute": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### chain examples

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "date",
      "operator": "between",
      "value": ["2001-01-01", "2008-01-01"],
      "group": "AAPL",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "average",
      "field": "price",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "date",
      "operator": "between",
      "value": ["2001-01-01", "2008-01-01"],
      "group": "AAPL",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "field": "price",
      "which": "max",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "pairDiff",
      "by": "date",
      "field": "price",
      "groupA": "AAPL",
      "groupB": "MSFT",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "field": "price",
      "which": "max",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "lagDiff",
      "field": "price",
      "orderField": "date",
      "order": "asc",
      "group": "AAPL",
      "signed": true,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "field": "price",
      "which": "max",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

## 4) Grouped Bar Chart

- Vega-Lite sample: grouped bar spec with x/category, y/value, color or `xOffset` series.
- Runner: `src/operation-next/runners/groupedBar.ts`
- 예시 field: `month`, `count`, `weather`

### filter

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "count",
      "operator": ">=",
      "value": 10,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "count",
      "operator": "between",
      "value": [5, 15],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "month",
      "include": [1, 2, 3],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "weather",
      "value": ["rain"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### draw:grouped-to-stacked

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "draw",
      "action": "grouped-to-stacked",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### chain examples

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "month",
      "include": [1, 2, 3, 4],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "draw",
      "action": "grouped-to-stacked",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "draw",
      "action": "grouped-to-stacked",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "draw",
      "action": "stacked-to-grouped",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    },
    {
      "id": "n3",
      "op": "filter",
      "field": "count",
      "operator": ">=",
      "value": 10,
      "meta": { "nodeId": "n3", "inputs": ["n2"], "sentenceIndex": 1 }
    }
  ]
}
```

## 5) Stacked Bar Chart

- Vega-Lite sample: `data/test/spec/bar_stacked_ver.json`
- Runner: `src/operation-next/runners/stackedBar.ts`
- 예시 field: `month`, `count`, `weather`

`stackedBar`의 `filter`는 transform-first 전략을 사용한다. 즉, stacked chart에서 filter를 실행하면 먼저 grouped chart로 변환한 뒤 grouped filter annotation을 적용한다.

### filter

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "count",
      "operator": ">=",
      "value": 10,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "count",
      "operator": "between",
      "value": [5, 15],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "month",
      "include": [1, 2, 3],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "weather",
      "value": ["rain"],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### draw:stacked-to-grouped

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "draw",
      "action": "stacked-to-grouped",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### chain examples

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "draw",
      "action": "stacked-to-grouped",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "filter",
      "field": "count",
      "operator": ">=",
      "value": 10,
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "month",
      "include": [1, 2, 3, 4],
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "draw",
      "action": "grouped-to-stacked",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "draw",
      "action": "stacked-to-grouped",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "filter",
      "field": "weather",
      "value": ["rain"],
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    },
    {
      "id": "n3",
      "op": "draw",
      "action": "grouped-to-stacked",
      "meta": { "nodeId": "n3", "inputs": ["n2"], "sentenceIndex": 1 }
    }
  ]
}
```

