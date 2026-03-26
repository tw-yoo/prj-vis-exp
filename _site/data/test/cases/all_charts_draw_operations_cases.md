# Chart Type × DrawAction Example Cases

차트 타입 별로 지원되는 Draw Operation의 실행 예시를 정리한다.

- `op: "draw"`에 `action` 필드로 DrawAction을 지정한다.
- `select.keys`로 대상 mark를 필드 값 기준으로 선택한다.
- **NA** 항목은 구현하지 않으므로 예시 없음.

---

## 1. Simple Bar Chart

Spec: `data/test/spec/bar_simple_ver.json`
Data: `data/test/data/bar_simple_ver.csv`
`x: country (nominal)` | `y: rating (quantitative)`

### Dataset Checkpoints

| country | rating |
|---------|--------|
| USA | 53 |
| JPN | 42 |
| FRA | 56 |
| DEU | 61 |
| GBR | 75 |
| CAN | 54 |
| AUS | 66 |
| ESP | 57 |
| NLD | 76 |
| NOR | 64 |
| BEL | 59 |
| SWE | 66 |
| DNK | 62 |
| KOR | 52 |
| CHE | 59 |
| ITA | 49 |
| IRL | 70 |
| FIN | 60 |
| AUT | 48 |
| PRT | 0 |

- `max = NLD = 76` | `min = PRT = 0` | `avg(all) ≈ 56.45`

---

### 기본 어노테이션

#### highlight — 특정 bar 강조

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["NLD"] }
    }
  ]
}
```

#### dim — 비교 대상 외 흐리기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["USA", "JPN"] }
    },
    {
      "op": "draw",
      "action": "dim",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["FRA", "DEU", "GBR", "CAN", "AUS", "ESP", "NLD", "NOR", "BEL", "SWE", "DNK", "KOR", "CHE", "ITA", "IRL", "FIN", "AUT", "PRT"] }
    }
  ]
}
```

#### clear — 모든 어노테이션 제거

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["NLD"] }
    },
    {
      "op": "draw",
      "action": "clear",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### text — 값 레이블 표시

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["NLD"] }
    },
    {
      "op": "draw",
      "action": "text",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["NLD"] },
      "text": { "value": "76" }
    }
  ]
}
```

#### rect — 범위 강조 사각형

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "rect": {
        "mode": "axis",
        "axis": { "y": [70, 76] },
        "style": { "fill": "#ffcc00", "opacity": 0.2 }
      }
    }
  ]
}
```

#### line — 기준선 (수평선)

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "line": {
        "mode": "horizontal-from-y",
        "hline": { "y": 56.45 },
        "style": { "stroke": "#e44", "strokeWidth": 1.5 }
      }
    }
  ]
}
```

#### band — Y축 범위 밴드

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "band",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "band": {
        "axis": "y",
        "range": [50, 70],
        "label": "50–70 구간",
        "style": { "fill": "#4a90d9", "opacity": 0.15 }
      }
    }
  ]
}
```

#### scalar-panel — 두 값 비교 패널

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "scalar-panel",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "scalarPanel": {
        "mode": "diff",
        "left": { "label": "USA", "value": 53 },
        "right": { "label": "NLD", "value": 76 },
        "delta": { "label": "차이", "value": 23 }
      }
    }
  ]
}
```

---

### 데이터 변환 시각화

#### filter — 조건에 맞는 bar만 남기기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": {
        "y": { "op": "gte", "value": 60 }
      }
    }
  ]
}
```

X축 특정 국가만 필터:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": {
        "x": { "include": ["USA", "GBR", "NLD", "IRL"] }
      }
    }
  ]
}
```

#### sort — 오름차순/내림차순 정렬

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "sort": { "by": "y", "order": "desc" }
    }
  ]
}
```

#### sum — 합산 시각화

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": { "x": { "include": ["USA", "JPN", "GBR"] } }
    },
    {
      "op": "draw",
      "action": "sum",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 },
      "sum": { "value": 170, "label": "USA + JPN + GBR" }
    }
  ]
}
```

#### bar-segment — 임계값 기준 bar 분할 표시

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "bar-segment",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "segment": {
        "threshold": 60,
        "when": "gte",
        "style": { "fill": "#e07b39", "opacity": 0.85 }
      }
    }
  ]
}
```

#### split — X축 기준 차트 분할

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "high": ["GBR", "NLD", "IRL", "AUS", "NOR", "SWE", "DNK"],
          "low": ["USA", "JPN", "FRA", "DEU", "CAN", "ESP", "BEL", "KOR", "CHE", "ITA", "FIN", "AUT", "PRT"]
        },
        "orientation": "horizontal"
      }
    }
  ]
}
```

#### unsplit — 분할된 차트 원복

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "europe": ["GBR", "NLD", "FRA", "DEU", "ESP", "BEL", "NOR", "SWE", "DNK", "CHE", "ITA", "IRL", "FIN", "AUT", "PRT"],
          "others": ["USA", "JPN", "CAN", "AUS", "KOR"]
        }
      }
    },
    {
      "op": "draw",
      "action": "unsplit",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

---

## 2. Stacked Bar Chart

Spec: `data/test/spec/bar_stacked_ver.json`
Data: `data/test/data/bar_stacked_ver.csv`
`x: month (nominal)` | `color: weather (nominal)` | `y: count (quantitative)`

### Dataset Checkpoints

weather 종류: `drizzle`, `fog`, `rain`, `snow`, `sun`
(snow는 1, 2, 3, 4, 12월에만 존재)

| month | drizzle | fog | rain | snow | sun | total |
|-------|---------|-----|------|------|-----|-------|
| 1 | 10 | 38 | 35 | 8 | 33 | 124 |
| 2 | 4 | 36 | 40 | 3 | 30 | 113 |
| 3 | 3 | 36 | 37 | 6 | 42 | 124 |
| 4 | 4 | 34 | 20 | 1 | 61 | 120 |
| 5 | 1 | 25 | 16 | — | 82 | 124 |
| 6 | 2 | 14 | 19 | — | 85 | 120 |
| 7 | 8 | 13 | 14 | — | 89 | 124 |
| 8 | 8 | 16 | 6 | — | 94 | 124 |
| 9 | 5 | 40 | 4 | — | 71 | 120 |
| 10 | 4 | 55 | 20 | — | 45 | 124 |
| 11 | 3 | 50 | 25 | — | 42 | 120 |
| 12 | 2 | 54 | 23 | 5 | 40 | 124 |

- `sun` 최대: month 8 = 94 | `fog` 최대: month 10 = 55
- `rain` 최대: month 2 = 40 | `rain` 최소: month 9 = 4

---

### 기본 어노테이션

#### highlight — 특정 weather series 강조

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["sun"] }
    }
  ]
}
```

특정 month의 특정 segment 강조:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "x", "keys": ["8"] }
    }
  ]
}
```

#### dim — 특정 series 흐리기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["drizzle", "snow"] }
    }
  ]
}
```

#### clear

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["sun"] }
    },
    {
      "op": "draw",
      "action": "clear",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### text — segment 값 레이블

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "x", "keys": ["8"] },
      "text": { "value": "94" }
    }
  ]
}
```

#### rect — 특정 month 구간 박스

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "rect": {
        "mode": "axis",
        "axis": { "x": ["6", "7", "8"] },
        "style": { "fill": "#f5a623", "opacity": 0.18 }
      }
    }
  ]
}
```

#### line — 기준선

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "line": {
        "mode": "horizontal-from-y",
        "hline": { "y": 80 },
        "style": { "stroke": "#d0021b", "strokeWidth": 1.5 }
      }
    }
  ]
}
```

#### band — X축 월 범위 밴드

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "band",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "band": {
        "axis": "x",
        "range": ["6", "8"],
        "label": "여름 (6–8월)",
        "style": { "fill": "#f5a623", "opacity": 0.15 }
      }
    }
  ]
}
```

#### scalar-panel — sun 최대/최소 비교

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "scalar-panel",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "scalarPanel": {
        "mode": "diff",
        "left": { "label": "sun(1월)", "value": 33 },
        "right": { "label": "sun(8월)", "value": 94 },
        "delta": { "label": "차이", "value": 61 }
      }
    }
  ]
}
```

---

### 데이터 변환 시각화

#### filter — Y값 조건 필터

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": {
        "x": { "include": ["6", "7", "8", "9"] }
      }
    }
  ]
}
```

#### sort — month별 sun count 기준 정렬

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "sort": { "by": "y", "order": "desc" }
    }
  ]
}
```

#### sum — 전체 합산

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": { "x": { "include": ["6", "7", "8"] } }
    },
    {
      "op": "draw",
      "action": "sum",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 },
      "sum": { "label": "여름 합계" }
    }
  ]
}
```

#### bar-segment — sun 80 이상 구간 강조

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "bar-segment",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "segment": {
        "threshold": 80,
        "when": "gte",
        "style": { "fill": "#f5a623", "opacity": 0.9 }
      }
    }
  ]
}
```

#### split — 계절별 분할

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "상반기": ["1", "2", "3", "4", "5", "6"],
          "하반기": ["7", "8", "9", "10", "11", "12"]
        },
        "orientation": "horizontal"
      }
    }
  ]
}
```

#### unsplit

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "상반기": ["1", "2", "3", "4", "5", "6"],
          "하반기": ["7", "8", "9", "10", "11", "12"]
        }
      }
    },
    {
      "op": "draw",
      "action": "unsplit",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

---

### 차트 타입 전환

#### stacked-to-grouped — stacked → grouped 변환 애니메이션

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "stacked-to-grouped",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### stacked-to-simple — 특정 series만 남기고 simple bar 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "stacked-to-simple",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "toSimple": { "series": "sun" }
    }
  ]
}
```

#### stacked-to-diverging — diverging stacked bar 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "stacked-to-diverging",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### stacked-filter-groups — 특정 weather series만 표시

sun과 rain만 남기기:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "stacked-filter-groups",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "groupFilter": {
        "groups": ["sun", "rain"]
      }
    }
  ]
}
```

group=1 → stacked-to-simple 자동 전환 (sun만 선택):

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "stacked-filter-groups",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "groupFilter": {
        "groups": ["sun"]
      }
    }
  ]
}
```

---

## 3. Grouped Bar Chart

Spec: `data/test/spec/bar_grouped_ver.json`
Data: `ChartQA/data/csv/bar/grouped/0rfuaawgi58ajpsv.csv`
`column: Year (ordinal)` | `x: Region (nominal)` | `color: Region (nominal)` | `y: Media rights revenue in billion US dollars (quantitative)`

### Dataset Checkpoints

Region 목록: `North America`, `Europe, Middle East and Africa`, `Asia Pacific`, `Latin America`

| Year | North America | EMEA | Asia Pacific | Latin America |
|------|--------------|------|--------------|---------------|
| 2009 | 8.61 | 9.95 | 3.53 | 0.99 |
| 2010 | 9.74 | 12.37 | 3.93 | 1.17 |
| 2011 | 9.30 | 10.68 | 3.73 | 1.14 |
| 2012 | 10.66 | 13.46 | 4.06 | 1.21 |
| 2013 | 9.58 | 11.85 | 4.01 | 1.27 |

- EMEA 최대: 2012 = 13.46 | NA 최대: 2012 = 10.66
- Latin America 최소: 2009 = 0.99

---

### 기본 어노테이션

#### highlight — EMEA 시리즈 전체 강조

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["Europe, Middle East and Africa"] }
    }
  ]
}
```

#### dim — Latin America 흐리기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["Latin America"] }
    }
  ]
}
```

#### clear

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["North America"] }
    },
    {
      "op": "draw",
      "action": "clear",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### text — 2012 EMEA 값 표시

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["Europe, Middle East and Africa"] },
      "text": { "value": "13.46" }
    }
  ]
}
```

#### rect

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "rect": {
        "mode": "axis",
        "axis": { "y": [10, 14] },
        "style": { "fill": "#4a90d9", "opacity": 0.15 }
      }
    }
  ]
}
```

#### line

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "line": {
        "mode": "horizontal-from-y",
        "hline": { "y": 10 },
        "style": { "stroke": "#d0021b", "strokeWidth": 1.5 }
      }
    }
  ]
}
```

#### band

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "band",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "band": {
        "axis": "y",
        "range": [8, 11],
        "label": "North America 범위",
        "style": { "fill": "#7ed321", "opacity": 0.12 }
      }
    }
  ]
}
```

#### scalar-panel

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "scalar-panel",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "scalarPanel": {
        "mode": "diff",
        "left": { "label": "NA (2009)", "value": 8.61 },
        "right": { "label": "NA (2012)", "value": 10.66 },
        "delta": { "label": "증가", "value": 2.05 }
      }
    }
  ]
}
```

---

### 데이터 변환 시각화

#### filter — 특정 Year만 남기기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": {
        "x": { "include": ["2011", "2012", "2013"] }
      }
    }
  ]
}
```

#### sort

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "sort",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "sort": { "by": "y", "order": "desc" }
    }
  ]
}
```

#### sum

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": { "x": { "include": ["2012"] } }
    },
    {
      "op": "draw",
      "action": "sum",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 1 },
      "sum": { "label": "2012 전체 합계" }
    }
  ]
}
```

#### bar-segment

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "bar-segment",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "segment": {
        "threshold": 10,
        "when": "gte",
        "style": { "fill": "#e07b39", "opacity": 0.85 }
      }
    }
  ]
}
```

#### split

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "전반기": ["2009", "2010", "2011"],
          "후반기": ["2012", "2013"]
        },
        "orientation": "horizontal"
      }
    }
  ]
}
```

#### unsplit

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "전반기": ["2009", "2010", "2011"],
          "후반기": ["2012", "2013"]
        }
      }
    },
    {
      "op": "draw",
      "action": "unsplit",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

---

### 차트 타입 전환

#### grouped-to-stacked — grouped → stacked 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "grouped-to-stacked",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### grouped-to-simple — 특정 Region만 남기고 simple bar 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "grouped-to-simple",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "toSimple": { "series": "North America" }
    }
  ]
}
```

#### grouped-filter-groups — 특정 Region만 표시

North America와 EMEA만 표시:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "grouped-filter-groups",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "groupFilter": {
        "groups": ["North America", "Europe, Middle East and Africa"]
      }
    }
  ]
}
```

group=1 → grouped-to-simple 자동 전환 (North America만 선택):

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "grouped-filter-groups",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "groupFilter": {
        "groups": ["North America"]
      }
    }
  ]
}
```

---

## 4. Simple Line Chart

Spec: `data/test/spec/line_simple.json`
Data: `data/test/data/line_simple.csv`
`x: year (temporal)` | `y: research_and_development_expenditure (quantitative)`

### Dataset Checkpoints

| year | R&D expenditure |
|------|----------------|
| 1990-01-01 | 571.7 |
| 1995-01-01 | 1366.56 |
| 2000-01-01 | 3009.52 |
| 2005-01-01 | 4582.21 |
| 2008-01-01 | 7128.11 |
| 2009-01-01 | 6042.83 |
| 2010-01-01 | 6489.0 |
| 2014-01-01 | 8526.5 |

- `max = 2014 = 8526.5` | `min = 1990 = 571.7`
- 2009 dip: 7128.11 → 6042.83 (글로벌 금융위기)
- 전체 기간: 1990–2014 (25개 데이터 포인트)

---

### 기본 어노테이션

#### highlight — 특정 연도 포인트 강조

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2009-01-01"] }
    }
  ]
}
```

#### dim — 특정 구간 외 흐리기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2007-01-01", "2008-01-01", "2009-01-01", "2010-01-01"] }
    },
    {
      "op": "draw",
      "action": "dim",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["1990-01-01", "1991-01-01", "1992-01-01", "1993-01-01", "1994-01-01", "1995-01-01", "1996-01-01", "1997-01-01", "1998-01-01", "1999-01-01", "2000-01-01", "2001-01-01", "2002-01-01", "2003-01-01", "2004-01-01", "2005-01-01", "2006-01-01", "2011-01-01", "2012-01-01", "2013-01-01", "2014-01-01"] }
    }
  ]
}
```

#### clear

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2014-01-01"] }
    },
    {
      "op": "draw",
      "action": "clear",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### text — 최댓값 레이블

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2014-01-01"] }
    },
    {
      "op": "draw",
      "action": "text",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2014-01-01"] },
      "text": { "value": "8526.5" }
    }
  ]
}
```

#### rect

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "rect": {
        "mode": "axis",
        "axis": { "y": [6000, 7200] },
        "style": { "fill": "#d0021b", "opacity": 0.1 }
      }
    }
  ]
}
```

#### line — 연결선 (두 포인트 연결)

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "line": {
        "mode": "connect",
        "connectBy": {
          "start": { "target": "2008-01-01" },
          "end": { "target": "2009-01-01" }
        },
        "style": { "stroke": "#d0021b", "strokeWidth": 2 },
        "arrow": { "end": true }
      }
    }
  ]
}
```

#### band — 연도 범위 밴드

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "band",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "band": {
        "axis": "x",
        "range": ["2007-01-01", "2010-01-01"],
        "label": "금융위기 구간",
        "style": { "fill": "#d0021b", "opacity": 0.1 }
      }
    }
  ]
}
```

#### scalar-panel

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "scalar-panel",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "scalarPanel": {
        "mode": "diff",
        "left": { "label": "2008", "value": 7128.11 },
        "right": { "label": "2009", "value": 6042.83 },
        "delta": { "label": "감소", "value": -1085.28 }
      }
    }
  ]
}
```

---

### 데이터 변환 시각화

#### filter — 특정 연도 구간 필터

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "filter": {
        "y": { "op": "gte", "value": 5000 }
      }
    }
  ]
}
```

#### split — 전/후반 분할

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "1990s": ["1990-01-01", "1991-01-01", "1992-01-01", "1993-01-01", "1994-01-01", "1995-01-01", "1996-01-01", "1997-01-01", "1998-01-01", "1999-01-01"],
          "2000s": ["2000-01-01", "2001-01-01", "2002-01-01", "2003-01-01", "2004-01-01", "2005-01-01", "2006-01-01", "2007-01-01", "2008-01-01", "2009-01-01", "2010-01-01", "2011-01-01", "2012-01-01", "2013-01-01", "2014-01-01"]
        },
        "orientation": "horizontal"
      }
    }
  ]
}
```

#### unsplit

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "domain",
        "by": "x",
        "groups": {
          "1990s": ["1990-01-01", "1991-01-01", "1992-01-01", "1993-01-01", "1994-01-01", "1995-01-01", "1996-01-01", "1997-01-01", "1998-01-01", "1999-01-01"],
          "2000s": ["2000-01-01", "2001-01-01", "2002-01-01", "2003-01-01", "2004-01-01", "2005-01-01", "2006-01-01", "2007-01-01", "2008-01-01", "2009-01-01", "2010-01-01", "2011-01-01", "2012-01-01", "2013-01-01", "2014-01-01"]
        }
      }
    },
    {
      "op": "draw",
      "action": "unsplit",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

---

### 라인 전용

#### line-trace — 특정 구간 경로 트레이싱

2008년 dip 구간 트레이싱:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line-trace",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": {
        "keys": ["2007-01-01", "2010-01-01"]
      }
    }
  ]
}
```

전체 구간 트레이싱:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line-trace",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": {
        "keys": ["1990-01-01", "2014-01-01"]
      }
    }
  ]
}
```

#### line-to-bar — line chart를 bar chart로 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line-to-bar",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

line-to-bar 변환 후 sort 수행 (multi-group):

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line-to-bar",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ],
  "ops2": [
    {
      "op": "draw",
      "action": "sort",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 2 },
      "sort": { "by": "y", "order": "desc" }
    }
  ]
}
```

---

## 5. Multiple Line Chart

Spec: `data/test/spec/line_multiple.json`
Data: `data/test/data/line_multiple.csv`
`x: date (temporal)` | `y: price (quantitative)` | `color: symbol (nominal)`

### Dataset Checkpoints

symbol 목록: `MSFT`, `AMZN`, `IBM`, `GOOG` (2004-08부터), `AAPL`

공통 기간: 2004-08-01 ~ 2010-03-01 (GOOG 포함 시)

2010-03 기준 마지막 가격:
- MSFT = 28.8
- AMZN = 128.82
- IBM = 125.55
- GOOG = 560.19
- AAPL = 223.02

주요 이벤트:
- GOOG 최고가: 2007-10-01 = 707.0
- AAPL 최고가: 2007-12-01 = 198.08 → 2010-03 = 223.02
- 금융위기 저점: 2009-02-01 (전반적 하락)

---

### 기본 어노테이션

#### highlight — 특정 symbol 강조

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["GOOG"] }
    }
  ]
}
```

#### dim — GOOG 외 모두 흐리기

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["GOOG"] }
    },
    {
      "op": "draw",
      "action": "dim",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["MSFT", "AMZN", "IBM", "AAPL"] }
    }
  ]
}
```

#### clear

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "field": "color", "keys": ["AAPL"] }
    },
    {
      "op": "draw",
      "action": "clear",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

#### text — GOOG 피크 값 레이블

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2007-10-01"] }
    },
    {
      "op": "draw",
      "action": "text",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 },
      "select": { "keys": ["2007-10-01"] },
      "text": { "value": "707.0" }
    }
  ]
}
```

#### rect

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "rect": {
        "mode": "axis",
        "axis": { "y": [500, 720] },
        "style": { "fill": "#4a90d9", "opacity": 0.1 }
      }
    }
  ]
}
```

#### line — 두 symbol 포인트 연결

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "line": {
        "mode": "horizontal-from-y",
        "hline": { "y": 100 },
        "style": { "stroke": "#9b9b9b", "strokeWidth": 1, "opacity": 0.6 }
      }
    }
  ]
}
```

#### band — 금융위기 구간 밴드

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "band",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "band": {
        "axis": "x",
        "range": ["2008-01-01", "2009-06-01"],
        "label": "금융위기",
        "style": { "fill": "#d0021b", "opacity": 0.08 }
      }
    }
  ]
}
```

#### scalar-panel

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "scalar-panel",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "scalarPanel": {
        "mode": "diff",
        "left": { "label": "GOOG (2007-10)", "value": 707.0 },
        "right": { "label": "GOOG (2008-10)", "value": 359.36 },
        "delta": { "label": "하락", "value": -347.64 }
      }
    }
  ]
}
```

---

### 데이터 변환 시각화

#### split — symbol별 분할 (selector 모드)

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "selector",
        "selectors": {
          "highPrice": { "include": ["GOOG", "AMZN"] },
          "lowPrice": { "include": ["MSFT", "IBM", "AAPL"] }
        },
        "orientation": "vertical"
      }
    }
  ]
}
```

#### unsplit

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "split",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "split": {
        "mode": "selector",
        "selectors": {
          "highPrice": { "include": ["GOOG", "AMZN"] },
          "lowPrice": { "include": ["MSFT", "IBM", "AAPL"] }
        }
      }
    },
    {
      "op": "draw",
      "action": "unsplit",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 }
    }
  ]
}
```

---

### 라인 전용

#### line-trace — 모든 symbol 구간 동시 트레이싱

금융위기 구간(2008–2009) 각 symbol 동시 트레이싱:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line-trace",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": {
        "keys": ["2008-01-01", "2009-12-01"]
      }
    }
  ]
}
```

group=1 → simple line으로 자동 전환 후 AAPL 구간 트레이싱:

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line-trace",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 },
      "select": {
        "field": "color",
        "keys": ["AAPL"]
      },
      "select": {
        "keys": ["2007-01-01", "2010-03-01"]
      }
    }
  ]
}
```

---

### 차트 타입 전환

#### multi-line-to-stacked — multi-line → stacked bar 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "multi-line-to-stacked",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

변환 후 stacked bar로서 filter 수행 (multi-group):

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "multi-line-to-stacked",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ],
  "ops2": [
    {
      "op": "draw",
      "action": "stacked-filter-groups",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 2 },
      "groupFilter": { "groups": ["GOOG", "AAPL"] }
    }
  ]
}
```

#### multi-line-to-grouped — multi-line → grouped bar 변환

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "multi-line-to-grouped",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ]
}
```

변환 후 grouped bar로서 sort 수행 (multi-group):

```json
{
  "ops": [
    {
      "op": "draw",
      "action": "multi-line-to-grouped",
      "id": "n1",
      "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 }
    }
  ],
  "ops2": [
    {
      "op": "draw",
      "action": "sort",
      "id": "n2",
      "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 2 },
      "sort": { "by": "y", "order": "desc" }
    }
  ]
}
```

---

## NA 항목 요약

| DrawAction | 차트 | 이유 |
|-----------|------|------|
| `bar-segment` | Simple Line, Multi Line | 라인 차트에는 bar segment 개념 없음 |
| `line-trace` | Simple Bar, Stacked Bar, Grouped Bar | bar 차트에는 선 트레이싱 개념 없음 |
| `line-to-bar` | Stacked Bar, Grouped Bar, Multi Line (group≠1) | Simple Line 전용 / Multi Line은 group=1만 |
| `sort` | Multi Line | group=1이면 Simple Line으로 전환 후 처리 |
| `sum` | Multi Line | group=1이면 Simple Line으로 전환 후 처리 |
| `filter` | Multi Line (group≠1) | group=1만 지원 (partial) |
| `stacked-*` | Simple Bar, Grouped Bar, Simple Line, Multi Line | Stacked Bar 전용 |
| `grouped-*` | Simple Bar, Stacked Bar, Simple Line, Multi Line | Grouped Bar 전용 |
| `multi-line-*` | Simple Bar, Stacked Bar, Grouped Bar, Simple Line | Multi Line 전용 |
| `sleep` | 모든 차트 | 시스템 내부 딜레이용, 시각화 없음 |
