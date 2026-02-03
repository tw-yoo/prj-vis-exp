# `op: "draw"` Guide — Simple Line (TS/React+D3)

이 문서는 **Simple Line** 차트에서 사용할 수 있는 `draw` 액션을 초보자도 이해하기 쉽게 정리한 API 문서입니다. 예시는 `data/test/spec/line_simple.json`(x=year, y=research_and_development_expenditure) 기준입니다.

---

## 1. 액션 목록
| action | 필수 | 선택/기본값 | 설명 |
| --- | --- | --- | --- |
| `highlight` | `select.keys` | `style.color`(`#ef4444`) | 선택한 데이터포인트 위에 작은 원을 오버레이 |
| `dim` | (없음) | `style.opacity`(0.25) | 선택 외 포인트 투명도 감소 |
| `clear` | - | - | 모든 강조/annotation 제거 |
| `line-trace` | `select.keys` 2개 이상 | `trace.pair.x`, `trace.style`(`stroke`, `strokeWidth`, `opacity`, `radius`) | 두 x라벨 구간의 라인 궤적을 따라 굵은 선과 포인트 오버레이 |
| `filter` | - | `filter.x.include/exclude`, `filter.y.op`, `filter.y.value` | x 라벨/값 조건으로 subset을 렌더(차트 재생성) |
| `line-to-bar` | - | - | 현재 spec 그대로 막대 렌더러로 전환 |

선택 기본값: `select.mark`는 지정하지 않아도 되며, `keys`는 x축 라벨(`YYYY-MM-DD` 형태)과 매칭됩니다.

---

## 2. 파라미터 규칙
- `select.keys`는 문자열 배열로 x축 값(예: `"1990-01-01"`)을 넣습니다. 최소 1개(하이라이트/딤), `line-trace`는 2개 이상 권장.
- `style`  
  - `highlight`: `style.color`만 있으면 됩니다.  
  - `dim`: `style.opacity`로 비선택 포인트 투명도 지정.  
- `line-trace`: `trace.pair.x`로 시작/끝 라벨을 정확히 지정하거나 `select.keys`의 첫·끝 값을 사용합니다. `trace.style`에서 `stroke`, `strokeWidth`, `opacity`, `radius`를 조정해 path와 점 오버레이의 색/두께/크기를 제어합니다.
- `filter`: `filter.x.include/exclude`로 라벨을 포함/제외하고, `filter.y.op`(`gt`/`gte`/`lt`/`lte`)+`value`로 수치 조건을 설정하면 `runSimpleLineOps`가 필터링된 데이터로 `renderLineChartWithData`를 다시 호출합니다.
- `line-to-bar`: 현재 Simple Line spec을 그대로 `mark: bar`로 바꿔 재렌더링합니다 (`convertLineChartToBars` 호출). 렌더링이 바뀌므로 기존 annotations는 제거됩니다.
- `chartId`는 차트가 split된 경우 특정 서브라인에만 적용할 때 사용합니다. (Simple Line 기본 렌더는 split을 사용하지 않지만 옵션은 지원)

---

## 3. 액션별 예시

### clear
```json
{ "op": "draw", "action": "clear" }
```

### highlight (두 포인트)
```json
{
  "op": "draw",
  "action": "highlight",
  "select": { "keys": ["1990-01-01", "2000-01-01"] },
  "style": { "color": "#ef4444" }
}
```

### dim (한 포인트만 남기고 흐리게)
```json
{
  "op": "draw",
  "action": "dim",
  "select": { "keys": ["1995-01-01"] },
  "style": { "opacity": 0.25 }
}
```

### line-trace (두 연도 구간 강조)
```json
{
  "op": "draw",
  "action": "line-trace",
  "trace": {
    "pair": { "x": ["1990-01-01", "1998-01-01"] },
    "style": { "stroke": "#2563eb", "strokeWidth": 2, "radius": 3.5 }
  }
}
```
`trace.pair`를 지정하지 않으면 `select.keys`의 첫/끝 값으로 범위를 유추합니다. `trace.style.opacity`를 추가해 path 투명도를 조절할 수도 있습니다.

### filter (subset 렌더)
```json
{
  "op": "draw",
  "action": "filter",
  "filter": { "x": { "include": ["1990-01-01", "2000-01-01"] }, "y": { "op": "gte", "value": 500 } }
}
```
`filter`는 지정된 x 라벨/값 조건을 만족하는 행만 사용해 차트를 다시 렌더하므로 기존 annotation은 제거됩니다.

### line-to-bar (막대 차트 전환)
```json
{
  "op": "draw",
  "action": "line-to-bar"
}
```
원본 line spec을 그대로 사용해 막대 렌더러로 전환하고, `SimpleLineDrawHandler`의 highlight/dim 등은 새 renderer에서 다시 동작합니다.

---

## 4. 사용 팁
- 키 문자열은 x축 라벨과 동일한 포맷(예: `"YYYY-MM-DD"`)으로 넣으세요. (내부에서 ISO 전체와 매칭 처리)
- 여러 효과가 필요하면 draw 액션을 나눠 순서대로 실행하세요.  
- 차트가 재렌더링 없이 draw만 실행되므로, 선택 대상이 안 보이면 `clear` 후 다시 시도하거나 키 문자열을 확인하세요.
- `filter`나 `line-to-bar` 액션은 데이터를 다시 렌더링하므로 기존 annotation layer가 제거됩니다. 후속 draw를 적용하려면 같은 액션을 다시 실행하거나 하이라이트/딤을 재적용하세요.

## 5. 내부 구현 읽기
- `src/renderer/draw/line/SimpleLineDrawHandler.ts`: highlight 시 작은 Circle을 그려주고, `lineTrace`는 `trace`+`select.keys`로 구간을 정한 뒤 기존 path를 따라 점과 선을 그립니다. `lineTrace`가 그리는 path는 `ensureAnnotationLayer`를 통해 SVG 최상위에 별도 그룹으로 관리합니다.
- `src/renderer/draw/genericDraw.ts`: `highlight`, `dim`, `clear` 등의 기본 DOM 처리는 이 파일에서, selection/annotation 제거 로직이 일관되게 정의되어 있습니다.
- `src/renderer/ops/executor/runDrawPlan.ts`: draw-plan을 실행하면서 handler → `runGenericDraw` 흐름을 돌아, 어떤 action이 annotation layer로 이어지는지 확인할 수 있습니다.
- `src/opsRunner/simpleLineOps.ts`: `line-to-bar`은 `convertLineChartToBars`, `filter`는 `filterLineChart`를 호출해 데이터를 다시 렌더하며, 나머지 draw 액션은 `SimpleLineDrawHandler`로 전달됩니다.
