# Operation Spec by Chart Type

이 문서는 차트 타입별로 사용 가능한 operation spec과 chart-specific 동작/시각화를 정리한다.

문서의 §1~§5는 차트별 기존 op (filter / retrieveValue / diff / average / findExtremum / sort / lagDiff / pairDiff)에 대한 JSON 예시를 보여주고, §6은 신규로 도입된 op (sum / count / nth / add / compareBool / scale / diffByValue / range / rollingWindow / monotonicRun)의 cross-chart 정의를 담는다. 각 op이 어느 chart 타입에서 적용 가능한지는 §6의 매트릭스에서 확인한다.

## 공통 기준

- 실행 진입점: `src/operation-next/runChartOps.ts` (5개 chart 타입 모두 `src/operation-new/`의 새 runner로 라우팅됨)
- 차트별 runner:
  - `src/operation-new/runSimpleBar.ts`
  - `src/operation-new/runSimpleLine.ts`
  - `src/operation-new/runMultipleLine.ts`
  - `src/operation-new/runGroupedBar.ts`
  - `src/operation-new/runStackedBar.ts`
- 공통 sequential state:
  - `src/operation-next/chainState.ts` (ChainState 인터페이스는 두 runner 계층이 공유)
  - `filter`는 `workingData`와 `salienceMap`을 갱신한다.
  - `average`, `findExtremum` 등 후속 operation은 이전 filter context를 사용한다.
  - `lagDiff`, `pairDiff`는 `derivedData`를 만들고 후속 `average`, `findExtremum`이 이를 사용할 수 있다.
  - `rollingWindow`도 `workingData`를 (N − window + 1)개의 window aggregate로 교체하여 후속 `findExtremum` / `nth`가 best window를 고를 수 있게 한다.
  - `range` / `monotonicRun`도 동일하게 `workingData`/`derivedData` propagation을 따른다.

## 지원 범위 요약

| Op | Simple bar | Simple line | Multi line | Grouped bar | Stacked bar |
| --- | :---: | :---: | :---: | :---: | :---: |
| `retrieveValue` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `filter` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `diff` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `average` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `findExtremum` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `sort` | ✅ (reorder) | ✅ (rank-strip) | ✅ (rank-strip) | ✅ (rank-strip) | ✅ (rank-strip) |
| `lagDiff` | — | ✅ | ✅ | — | — |
| `pairDiff` | — | — | ✅ | ✅ | ✅ |
| `sum` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `count` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `nth` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `add` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `compareBool` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `scale` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `diffByValue` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `range` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `rollingWindow` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `monotonicRun` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `draw:grouped-to-stacked` | — | — | — | ✅ | — |
| `draw:stacked-to-grouped` | — | — | — | — | ✅ |

Notes:
- `—`는 chart 타입에서 의미가 없어 적용 불가 (예: `pairDiff`는 series가 없는 simple chart에서 무효).
- `sort`의 chart-별 시각화 차이는 §6에서 상세 설명 (reorder vs rank-strip).
- 신규 op 11종 (`sum` 이하)의 chart-별 동작/시각화 정의는 §6 참조.

## 1) Simple Bar Chart

- Vega-Lite sample: `data/test/spec/bar_simple_ver.json`
- Runner: `src/operation-next/runners/simpleBar.ts`
- 예시 field: `country`, `rating`

### retrieveValue

`targetAxis` (`'x' | 'y'`, default `'x'`) controls lookup direction:
- `'x'` (forward): `target` is the x-axis category label → returns matching y values.
- `'y'` (reverse): `target` is a numeric y value → returns x category(ies) whose measured value equals `target` (multi-measure charts require `field`).

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

Reverse-lookup example (find which country has `rating === 65`):

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "rating",
      "target": 65,
      "targetAxis": "y",
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
- Runner: `src/operation-next/runners/simpleLine.ts` (forward) / `src/operation-new/appliers/simpleLine/retrieveValue.ts` (forward + reverse via `targetAxis`)
- 예시 field: `year`, `value`

### retrieveValue

`targetAxis: 'y'`이면 x 축 카테고리 대신 y 값을 기준으로 매칭합니다 (vertical reference line + x-axis 라벨).

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

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "value",
      "target": 3000,
      "targetAxis": "y",
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
- Runner: `src/operation-next/runners/multipleLine.ts` (forward) / `src/operation-new/appliers/multipleLine/retrieveValue.ts` (forward + reverse via `targetAxis`)
- 예시 field: `date`, `price`, `symbol`

### retrieveValue

`targetAxis: 'y'`이면 series별로 y 값에 매칭되는 x 시점을 찾아 vertical guideline + x label을 그립니다. `group`을 함께 지정하면 특정 시리즈로 한정.

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

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "price",
      "target": 120,
      "targetAxis": "y",
      "group": "AAPL",
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

## 6) Newly added ops (cross-chart definitions)

§1~§5는 차트별 기존 op를 정리한다. 이 섹션은 신규 도입된 11개 op (`sum`, `count`, `nth`, `add`, `compareBool`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun` + `sort`의 신규 시각화 variant)을 op-중심으로 정리한다. chart별 적용 가능성은 §"지원 범위 요약" 매트릭스를 참조하고, 여기서는 의미·시각화·대표 JSON 예시 하나만 다룬다.

공통 원칙:
- 신규 op의 **spec semantics는 모든 chart 타입에서 동일**하다. chart-별로 다른 것은 (1) annotation 시각화 방식과 (2) 차트 구조상 불가능한 케이스 (예: `pairDiff`는 series가 없는 simple chart에서 무효)뿐이다.
- `group`/`field` 같은 공통 field는 §1~§5의 동명 op과 같은 규칙을 따른다.
- 각 op의 BE 계약 (필수/선택 field, semantic_rules)은 `nlp_server/opsspec/runtime/op_registry.py` 및 `nlp_server/docs/operations_full_json_examples.md` 참조.

### 6.1 `sum` — row aggregate 합

- 의미: working data의 measure field 합산. 단일 scalar 반환.
- 시각화 차이:
  - **simple/multipleLine**: 합산 대상 점들 `markSalience` 강조 + horizontal brace로 묶고 우측에 "Σ = X" 라벨.
  - **simpleBar / groupedBar**: 합산 대상 bar 색조 강조 + plot 우측 슬롯에 "Total" derived bar grow-in (marginRight 부족하면 inset variant).
  - **stackedBar**: A+B segment 합산은 두 segment 위로 spanning brace + 합 라벨 (stack은 그대로 유지).
- `field` required (dataOps에서 `'value'` fallback). `group`은 series 제한.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "sum",
      "field": "revenue",
      "group": "Broadcasting",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.2 `count` — row 개수

- 의미: working data의 row count. 단일 scalar.
- 시각화: filter-스타일 salience(매칭 mark만 강조, 나머지 fade-down) + plot 상단에 "n = N" pill badge.
- 보통 `filter → count` 체인으로 "조건을 만족하는 X 개수" 질문에 답한다.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "filter",
      "field": "value",
      "operator": ">",
      "value": 100,
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "count",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.3 `nth` — n번째 ranked row

- 의미: 정렬된 array의 n번째 row를 선택. `from='left'|'right'`로 방향 지정.
- 시각화:
  - sort가 선행된 경우, rank-strip의 n번째 chip을 `ANNOTATION_RED`로 강조 + 원본 mark도 tint + "#n: value" label.
  - sort가 없으면 mini rank-strip을 자체적으로 그리고 n번째만 강조.
- `from='left'`는 정렬 array의 왼쪽 끝부터 (asc면 최소값). `from='right'`는 오른쪽 끝부터 (asc면 최대값).

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "sort",
      "field": "rating",
      "order": "asc",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "nth",
      "n": 2,
      "from": "left",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.4 `add` — pointwise 두 값 합

- 의미: 두 scalar (또는 datum) 값의 합. `sum`(범위 합)과 다름.
- 시각화: 두 endpoint(mark 또는 prior ref-line) 사이 `drawValueBrace` + "A + B = C" badge.
- `targetA`/`targetB`는 `'ref:nN'` (prior 결과) 또는 numeric literal.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "retrieveValue",
      "field": "value",
      "target": "Germany",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "retrieveValue",
      "field": "value",
      "target": "Italy",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n3",
      "op": "add",
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.5 `compareBool` — 두 값 비교 (terminal)

- 의미: `>`/`<`/`=`/`!=` 등의 boolean 비교. 단일 0/1 scalar 반환.
- 시각화: 두 endpoint 사이에 비교 badge (`>`/`<`/`=`) + 우상단 Yes/No pill (1 → 초록, 0 → 빨강). prior anchor에 piggyback.
- 보통 chain의 terminal op. yes/no 질문 답으로 사용.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "average",
      "field": "value",
      "group": "A",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "average",
      "field": "value",
      "group": "B",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n3",
      "op": "compareBool",
      "targetA": "ref:n1",
      "targetB": "ref:n2",
      "operator": ">",
      "meta": { "nodeId": "n3", "inputs": ["n1", "n2"], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.6 `scale` — 상수 곱

- 의미: 단일 scalar × 상수. (min+max)/2의 "/2", percentage 변환의 ×100 등.
- 시각화: base anchor의 y → scaled y로 `drawDirectionalArrow` + 화살표 머리에 "× factor = X" label.
- factor 부호:
  - `> 1`: 화살표 위 (green tone), `0 < factor < 1`: 화살표 아래 (orange), `< 0`: 부호 반전 label, `= 1`: no-op.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "sum",
      "field": "value",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "scale",
      "target": "ref:n1",
      "factor": 0.5,
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.7 `diffByValue` — 각 row의 reference 대비 deviation

- 의미: working data의 각 row와 단일 scalar reference V의 차이. 결과는 row list (한 row당 하나의 delta).
- 시각화:
  - **bar 계열**: 각 bar 위에 inset segment(또는 +Δ / -Δ label)로 deviation 표시.
  - **line 계열**: reference value에 horizontal ref line + 각 datum mark에서 ref line까지 vertical residual segment(양수=빨강, 음수=파랑). |Δ|가 작은 segment는 label 생략.
- V는 `value` (numeric literal) 또는 `targetValue: 'ref:nN'` (prior scalar). 정확히 하나로 지정.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "average",
      "field": "value",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "diffByValue",
      "targetValue": "ref:n1",
      "field": "value",
      "signed": true,
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.8 `range` — max − min spread

- 의미: working slice의 max - min을 단일 scalar로. `findExtremum(max) + findExtremum(min) + diff` 체인을 대체.
- 시각화: max anchor + min anchor 양쪽 tint + 두 y 사이 세로 `drawBracket` + "Range = X" badge. `group` 지정 시 series별 bracket을 series 색으로 여러 개.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "range",
      "field": "value",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.9 `rollingWindow` — 슬라이딩 윈도우 집계

- 의미: 정렬된 series 위로 길이 `window`만큼 sliding하며 `aggregate` (sum/avg/min/max) 적용. (N − window + 1)개 row 반환. 후속 `findExtremum`/`nth`로 best window 선택.
- 시각화:
  - **line 계열**: 슬라이딩 bracket이 좌→우로 step-by-step 이동 애니메이션 + plot 위/아래 shadow strip에 mini-point로 aggregate 값 push. 끝나면 strip persistent.
  - **bar 계열**: 같은 패턴, mini-bar로 strip 그림.
- 전체 애니메이션은 ~3초로 cap (`stepDuration = max(80, min(250, 3000/steps))`).

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "rollingWindow",
      "window": 3,
      "aggregate": "avg",
      "field": "units_sold",
      "orderField": "year",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    },
    {
      "id": "n2",
      "op": "findExtremum",
      "which": "max",
      "field": "units_sold",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

### 6.10 `monotonicRun` — 단조 구간 탐지

- 의미: ordered series에서 strictly increasing/decreasing 구간 탐색. `mode`에 따라:
  - `longest` (default): 가장 긴 run의 row list.
  - `firstBreak`: 첫 단조 시작 시점의 single row.
  - `all`: 모든 적격 run을 flatten.
- 시각화:
  - `longest`/`all`: skeleton path은 그대로, annotation layer 위에 같은 모양의 **colored polyline overlay**로 해당 구간만 강조 (stroke-width/stroke을 instance에서 읽어 일치). x축 아래 `drawBracket` + "↑ run: N pts" label. `all`은 run별 색 cycling.
  - `firstBreak`: break 시점에 vertical guideline + "First {direction} starts" label. bracket 없음.
- `minLength` 기본 2. ">2 years" 같은 표현은 `minLength: 3`.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "monotonicRun",
      "direction": "decreasing",
      "mode": "longest",
      "field": "unemployment_rate",
      "orderField": "year",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.11 `sort` — chart-별 시각화 variant

- 의미: data를 `field`/`orderField` 기준 정렬.
- 시각화 차이:
  - **simpleBar (categorical x)**: 물리적 reorder — bar들이 정렬 순서에 맞춰 부드럽게 swap.
  - **simpleLine / multipleLine / groupedBar / stackedBar**: skeleton은 그대로 유지. plot 위/아래에 **rank-strip** (numbered chip 띠)을 fade-in. chip의 x는 원본 mark x에 align, label은 순위. viewport 위쪽 여유가 부족하면 자동 below로 fallback.
- 보통 `sort + nth` 체인으로 ranking 질문에 답한다.

```json
{
  "ops": [
    {
      "id": "n1",
      "op": "sort",
      "field": "value",
      "order": "desc",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

### 6.12 chart-별 cross-reference

신규 op 11종은 모든 chart 타입에서 spec semantics가 동일하다. chart 타입별로 §6 정의를 그대로 적용:

- **Simple bar** (§1): 기존 `retrieveValue`/`filter`/`diff`/`average`/`findExtremum`/`sort` + §6의 모든 신규 op.
- **Simple line** (§2): 기존 6종 + §6 신규 op + `sort`는 §6.11의 rank-strip variant.
- **Multi line** (§3): 기존 8종 (+ pairDiff) + §6 신규 op + `sort`는 rank-strip variant.
- **Grouped bar** (§4): 기존 `filter`/`draw:grouped-to-stacked` + §6 신규 op + `pairDiff` (series 비교) + 다른 기존 op (`retrieveValue`/`diff`/`average`/`findExtremum`은 §"지원 범위 요약" 매트릭스의 ✅ 따라 사용).
- **Stacked bar** (§5): grouped bar와 동일 + `draw:stacked-to-grouped`. `pairDiff`의 stackedBar 시각화는 **segment 자체 height**를 비교한다 (cumulative top이 아님).

