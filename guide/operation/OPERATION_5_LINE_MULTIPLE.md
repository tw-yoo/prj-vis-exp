<!--
  NOTE:
  - draw 관련 내용은 guide/draw/DRAW_5_LINE_MULTIPLE.md 로 분리되어 있음
  - 이 문서는 "data operation(op: retrieveValue/filter/...)" 스펙과 동작을 설명
  - 공통 op 동작/JSON 예시는 `docs/operation-spec-by-chart.md` §6를 참조
-->

# `op: "<data operation>"` Guide — Multi Line

이 문서는 **Multi Line** 차트에서 사용할 수 있는 data operation의 chart-specific 동작과 예시를 정리합니다. op-별 공통 spec/JSON 예시는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6를 참고하세요.

- 예시 데이터는 `data/test/spec/line_multiple.json` (date/price/symbol) 기준
- 모든 5개 chart 타입의 op 적용 가능성 매트릭스: [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §"지원 범위 요약"

---

## 0) 실행 흐름

- 진입점: `src/operation-next/runChartOps.ts` → `src/operation-new/runMultipleLine.ts`
- 계산 함수: `src/domain/operation/dataOps.ts`

---

## 1) Chart-specific notes

`multipleLine`의 op 동작 차이:

1. **`pairDiff`가 핵심 op**: multi line은 두 series의 시점별 값 비교가 자연스럽습니다. `pairDiff`는 각 x 위치에서 두 series 사이 vertical Δ 화살표 + Δ 라벨을 그립니다. `groupA`/`groupB`로 비교할 series 지정.
2. **`lagDiff`는 series별로 작동**: `group` 지정 시 해당 series의 인접 변화량만 계산. 미지정 시 시점이 같으면 series 구분 없이 잘못 계산될 수 있으므로 `group` 권장.
3. **`average` / `findExtremum`도 series별로 작동**: `group="AAPL"`처럼 series 명시 권장. 미지정 시 전체 series 통합 평균.
4. **`retrieveValue`의 series 명시**: `target`을 `{ "target": "2001-01-01", "series": "AAPL" }` 형태로 전달하거나 `target` + `group` 분리. `targetAxis: 'y'`도 series별 lookup 가능.
5. **`sort`의 시각화 variant**: multi line의 x축은 시간축이므로 reorder 불가 — **rank-strip** mini-band를 plot 위/아래에 fade-in합니다. 어떤 series의 ranking인지 명확히 하기 위해 해당 series 색의 strip만 활성화.
6. **`compareBool`로 series 평균 비교**: `groupA="AAPL"` + `groupB="MSFT"` + `aggregate="avg"` + `operator=">"` 형태로 "Is the average of AAPL greater than that of MSFT?" 질문에 답합니다.

신규 op (`add`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`)의 시각화는 cross-chart 공통 — §6의 정의 그대로 적용됩니다. `monotonicRun`/`rollingWindow`는 `group`을 명시해 특정 series에 적용합니다.

---

## 2) 대표 예시

### 두 series 시점별 차이 (pairDiff)
```json
{
  "ops": [
    {
      "op": "pairDiff",
      "by": "date",
      "field": "price",
      "groupA": "AAPL",
      "groupB": "MSFT",
      "signed": true
    }
  ]
}
```

### pairDiff → findExtremum (가장 큰 차이가 나는 시점)
```json
{
  "ops": [
    { "op": "pairDiff", "by": "date", "field": "price", "groupA": "AAPL", "groupB": "MSFT", "absolute": true },
    { "op": "findExtremum", "which": "max", "field": "price" }
  ]
}
```

### 두 series 평균 비교 (terminal compareBool)
```json
{
  "ops": [
    { "op": "average", "field": "price", "group": "AAPL" },
    { "op": "average", "field": "price", "group": "MSFT" },
    { "op": "compareBool", "targetA": "ref:n1", "targetB": "ref:n2", "operator": ">" }
  ]
}
```

### 한 series의 가장 긴 감소 구간
```json
{
  "ops": [
    {
      "op": "monotonicRun",
      "direction": "decreasing",
      "mode": "longest",
      "field": "price",
      "group": "AAPL",
      "orderField": "date"
    }
  ]
}
```

### 한 series의 3-step moving average + best window
```json
{
  "ops": [
    {
      "op": "rollingWindow",
      "window": 3,
      "aggregate": "avg",
      "field": "price",
      "group": "AAPL",
      "orderField": "date"
    },
    { "op": "findExtremum", "which": "max", "field": "price" }
  ]
}
```

### 한 series의 spread (max − min)
```json
{
  "ops": [
    { "op": "range", "field": "price", "group": "AAPL" }
  ]
}
```

### 두 series 각각의 spread를 비교 (range × 2 + compareBool)
```json
{
  "ops": [
    { "op": "range", "field": "price", "group": "AAPL" },
    { "op": "range", "field": "price", "group": "MSFT" },
    { "op": "compareBool", "targetA": "ref:n1", "targetB": "ref:n2", "operator": ">" }
  ]
}
```

### Reverse lookup: AAPL에서 price=120인 시점
```json
{
  "ops": [
    {
      "op": "retrieveValue",
      "field": "price",
      "target": 120,
      "targetAxis": "y",
      "group": "AAPL"
    }
  ]
}
```

---

## 3) Cross-chart 동작 참조

`retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `lagDiff`, `pairDiff`, `sort`, `sum`, `count`, `nth`, `add`, `compareBool`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`의 공통 JSON 스펙과 시각화 의도는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6에서 확인합니다.
