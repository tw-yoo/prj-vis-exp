<!--
  NOTE:
  - draw 관련 내용은 guide/draw/DRAW_4_LINE_SIMPLE.md 로 분리되어 있음
  - 이 문서는 "data operation(op: retrieveValue/filter/...)" 스펙과 동작을 설명
  - 공통 op 동작/JSON 예시는 `docs/operation-spec-by-chart.md` §6를 참조
-->

# `op: "<data operation>"` Guide — Simple Line

이 문서는 **Simple Line** 차트에서 사용할 수 있는 data operation의 chart-specific 동작과 예시를 정리합니다. op-별 공통 spec/JSON 예시는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6를 참고하세요.

- 예시 데이터는 `data/test/spec/line_simple.json` (year/value) 기준
- 모든 5개 chart 타입의 op 적용 가능성 매트릭스: [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §"지원 범위 요약"

---

## 0) 실행 흐름

- 진입점: `src/operation-next/runChartOps.ts` → `src/operation-new/runSimpleLine.ts`
- 계산 함수: `src/domain/operation/dataOps.ts`

---

## 1) Chart-specific notes

`simpleLine`의 op 동작 차이:

1. **`lagDiff`가 핵심 op**: simple line은 시간축(또는 ordinal x축)에 따라 값이 변하므로 인접 step 변화량을 보는 `lagDiff`가 자주 등장합니다. `orderField`로 시간축을 명시.
2. **`retrieveValue`의 `targetAxis: 'y'` reverse lookup**: simple line에서는 "value가 X인 year를 찾아라" 같은 질문에 대응. vertical reference line + x-axis 라벨로 시각화.
3. **`sort`의 시각화 variant**: simple line의 x축은 보통 시간축이므로 reorder 불가 — **rank-strip** mini-band를 plot 위/아래에 fade-in합니다 (각 chip의 x는 원본 mark x에 align, label은 순위). viewport 위쪽 여유 부족 시 자동 below로 fallback.
4. **`pairDiff` 불가**: simple line은 single series이므로 `pairDiff`는 의미가 없습니다.
5. **`rollingWindow`가 시간축에 자연스러움**: "3-year moving average" 같은 표현에 직접 매칭. `orderField: "year"` 권장.
6. **`monotonicRun`이 시간축에 자연스러움**: "longest period of decrease" / "year when X starts to decrease" 같은 표현에 매칭.

신규 op (`add`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`)의 시각화는 cross-chart 공통 — §6의 정의 그대로 적용됩니다.

---

## 2) 대표 예시

### 인접 step 변화량 + 최대 변화량 시점 찾기 (lagDiff → findExtremum)
```json
{
  "ops": [
    { "op": "lagDiff", "field": "value", "orderField": "year", "order": "asc" },
    { "op": "findExtremum", "which": "max", "field": "value" }
  ]
}
```

### Reverse lookup: value=3000인 year 찾기
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "value", "target": 3000, "targetAxis": "y" }
  ]
}
```

### 3-year moving average + 최고 window
```json
{
  "ops": [
    { "op": "rollingWindow", "window": 3, "aggregate": "avg", "field": "value", "orderField": "year" },
    { "op": "findExtremum", "which": "max", "field": "value" }
  ]
}
```

### 가장 긴 연속 감소 구간
```json
{
  "ops": [
    {
      "op": "monotonicRun",
      "direction": "decreasing",
      "mode": "longest",
      "field": "value",
      "orderField": "year"
    }
  ]
}
```

### 첫 감소 시작 시점 ("year when X starts to decrease")
```json
{
  "ops": [
    {
      "op": "monotonicRun",
      "direction": "decreasing",
      "mode": "firstBreak",
      "field": "value",
      "orderField": "year"
    }
  ]
}
```

### 평균 + 각 year의 평균 대비 deviation
```json
{
  "ops": [
    { "op": "average", "field": "value" },
    { "op": "diffByValue", "targetValue": "ref:n1", "field": "value", "signed": true }
  ]
}
```

### 두 year 값 합산 후 ÷2 (= midpoint)
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "value", "target": "2001" },
    { "op": "retrieveValue", "field": "value", "target": "2010" },
    { "op": "add", "targetA": "ref:n1", "targetB": "ref:n2" },
    { "op": "scale", "target": "ref:n3", "factor": 0.5 }
  ]
}
```

### 평균 위 year 개수
```json
{
  "ops": [
    { "op": "average", "field": "value" },
    { "op": "filter", "field": "value", "operator": ">", "value": "ref:n1" },
    { "op": "count" }
  ]
}
```

---

## 3) Cross-chart 동작 참조

`retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `lagDiff`, `sort`, `sum`, `count`, `nth`, `add`, `compareBool`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`의 공통 JSON 스펙과 시각화 의도는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6에서 확인합니다.
