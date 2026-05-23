<!--
  NOTE:
  - draw 관련 내용은 guide/draw/DRAW_2_BAR_STACKED.md 로 분리되어 있음
  - 이 문서는 "data operation(op: retrieveValue/filter/...)" 스펙과 동작을 설명
  - 공통 op 동작/JSON 예시는 `docs/operation-spec-by-chart.md` §6를 참조
-->

# `op: "<data operation>"` Guide — Stacked Bar

이 문서는 **Stacked Bar** 차트에서 사용할 수 있는 data operation의 chart-specific 동작과 예시를 정리합니다. op-별 공통 spec/JSON 예시는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6를 참고하세요.

- 예시 데이터는 `data/test/spec/bar_stacked_ver.json` (month/count/weather) 기준
- 모든 5개 chart 타입의 op 적용 가능성 매트릭스: [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §"지원 범위 요약"

---

## 0) 실행 흐름

- 진입점: `src/operation-next/runChartOps.ts` → `src/operation-new/runStackedBar.ts`
- 계산 함수: `src/domain/operation/dataOps.ts`

---

## 1) Chart-specific notes

`stackedBar`의 op 동작은 다음 항목이 다른 chart와 다릅니다:

1. **`filter`의 transform-first 전략**: stacked chart에서 filter를 실행하면 먼저 grouped chart로 transform한 뒤 grouped filter annotation을 적용합니다. 자세한 내용은 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §5 참조.
2. **`pairDiff`의 segment 비교 의미**: stacked bar에서 두 series를 `pairDiff`로 비교할 때, **cumulative top이 아니라 segment 자체의 height**(=measure value)를 기준으로 비교합니다. stacked 구조는 그대로 유지하고, 두 segment 위로 floating Δ 화살표를 그립니다.
3. **`sum`의 group 규칙**: `group=None` 또는 multi-group 리스트면 모든 row 합산. `group="single"`이면 해당 series만 합산.
4. **`sort`의 시각화 variant**: stacked bar의 x축은 dimension(예: month)이므로 reorder 불가 — 대신 plot 상단/하단에 **rank-strip** mini-band를 fade-in합니다. simpleBar의 reorder variant와 다릅니다.

신규 op (`add`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`)의 시각화는 cross-chart 공통 — §6의 정의 그대로 적용됩니다.

---

## 2) 대표 예시

### 단일 series filter + count
```json
{
  "ops": [
    { "op": "filter", "field": "weather", "value": ["rain"] },
    { "op": "count" }
  ]
}
```

### 두 series 간 segment 단위 차이 (pairDiff)
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

### Stacked → Grouped transform + 후속 filter
```json
{
  "ops": [
    { "op": "draw", "action": "stacked-to-grouped" },
    { "op": "filter", "field": "count", "operator": ">=", "value": 10 }
  ]
}
```

### 단일 series 전체 합산
```json
{
  "ops": [
    { "op": "sum", "field": "count", "group": "rain" }
  ]
}
```

### 단일 series의 spread (max − min)
```json
{
  "ops": [
    { "op": "range", "field": "count", "group": "rain" }
  ]
}
```

---

## 3) Cross-chart 동작 참조

`retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `sort`, `sum`, `count`, `nth`, `add`, `compareBool`, `scale`, `diffByValue`, `range`, `rollingWindow`, `monotonicRun`의 공통 JSON 스펙과 시각화 의도는 [`docs/operation-spec-by-chart.md`](../../docs/operation-spec-by-chart.md) §6에서 확인합니다.
