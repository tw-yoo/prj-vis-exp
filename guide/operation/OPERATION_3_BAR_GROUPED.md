<!--
  NOTE:
  - draw 관련 내용은 guide/draw/DRAW_3_BAR_GROUPED.md 로 분리되어 있음
  - 이 문서는 "data operation(op: retrieveValue/filter/...)" 스펙과 동작을 설명
  - 공통 op 동작/JSON 예시는 `docs/operation-spec-by-chart.md` §6를 참조
-->

# `op: "<data operation>"` Guide — Grouped Bar

이 문서는 **Grouped Bar** 차트에서 사용할 수 있는 data operation의 chart-specific 동작과 예시를 정리합니다. op-별 공통 spec/JSON 예시는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6를 참고하세요.

- 예시 데이터는 `month/count/weather` 기준 grouped bar
- 모든 5개 chart 타입의 op 적용 가능성 매트릭스: [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §"지원 범위 요약"

---

## 0) 실행 흐름

- 진입점: `src/operation-next/runChartOps.ts` → `src/operation-new/runGroupedBar.ts`
- 계산 함수: `src/domain/operation/dataOps.ts`

---

## 1) Chart-specific notes

`groupedBar`의 op 동작 차이:

1. **`pairDiff`가 핵심 op**: grouped bar는 각 그룹 안에 여러 series가 나란히 놓여 있어, 두 series의 값을 직접 비교할 수 있는 자연스러운 시각화 surface입니다. `pairDiff`는 각 x 그룹 내에서 두 bar top 사이에 vertical Δ 화살표 + Δ 라벨을 그립니다.
2. **`sum`의 group 의미**: `group="series"`면 그 series의 모든 x에 걸친 row 합. `group=None`이면 전체 row 합. multi-group 리스트면 해당 series들만 합산.
3. **`sort`의 시각화 variant**: grouped bar의 x축은 카테고리 dimension(예: month)이고 series 간 순서가 의미를 가지므로 reorder 불가 — 대신 **rank-strip** mini-band를 plot 위/아래에 fade-in합니다 (series별 색상 chip).
4. **`draw:grouped-to-stacked` transform**: `op:"draw"`를 사용해 stacked로 동적 전환할 수 있습니다.

신규 op (`add`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`)의 시각화는 cross-chart 공통 — §6의 정의 그대로 적용됩니다.

---

## 2) 대표 예시

### 두 series의 월별 차이 (pairDiff)
```json
{
  "ops": [
    {
      "op": "pairDiff",
      "by": "month",
      "field": "count",
      "groupA": "rain",
      "groupB": "sun",
      "signed": true
    }
  ]
}
```

### pairDiff → findExtremum (가장 큰 차이가 나는 달)
```json
{
  "ops": [
    { "op": "pairDiff", "by": "month", "field": "count", "groupA": "rain", "groupB": "sun", "absolute": true },
    { "op": "findExtremum", "which": "max", "field": "count" }
  ]
}
```

### 한 series의 평균 + 그 series 내에서 평균보다 높은 row 수
```json
{
  "ops": [
    { "op": "average", "field": "count", "group": "rain" },
    { "op": "filter", "field": "count", "operator": ">", "value": "ref:n1", "group": "rain" },
    { "op": "count" }
  ]
}
```

### 두 그룹 합산 비교 (compareBool terminal)
```json
{
  "ops": [
    { "op": "sum", "field": "count", "group": "rain" },
    { "op": "sum", "field": "count", "group": "sun" },
    { "op": "compareBool", "targetA": "ref:n1", "targetB": "ref:n2", "operator": ">" }
  ]
}
```

### Grouped → Stacked transform
```json
{
  "ops": [
    { "op": "draw", "action": "grouped-to-stacked" }
  ]
}
```

---

## 3) Cross-chart 동작 참조

`retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `sort`, `pairDiff`, `sum`, `count`, `nth`, `add`, `compareBool`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`의 공통 JSON 스펙과 시각화 의도는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6에서 확인합니다.
