# `op: "draw"` Guide — Simple Line (TS/React+D3)

이 문서는 **Simple Line** 차트에서 사용할 수 있는 `draw` 액션을 초보자도 이해하기 쉽게 정리한 API 문서입니다. 예시는 `data/test/spec/line_simple.json`(x=year, y=research_and_development_expenditure) 기준입니다.

---

## 1. 액션 목록
| action | 필수 | 선택/기본값 | 설명 |
| --- | --- | --- | --- |
| `highlight` | `select.keys` | `style.color`(`#ef4444`) | 선택한 데이터포인트 위에 작은 원을 오버레이 |
| `dim` | (없음) | `style.opacity`(0.25) | 선택 외 포인트 투명도 감소 |
| `clear` | - | - | 모든 강조/annotation 제거 |
| `line-trace` | `select.keys` 2개 이상 | `style.stroke`(`#ef4444`), `style.strokeWidth`(2) | 두 x라벨 구간의 라인 궤적을 따라 굵은 선과 포인트 오버레이 |

선택 기본값: `select.mark`는 지정하지 않아도 되며, `keys`는 x축 라벨(`YYYY-MM-DD` 형태)과 매칭됩니다.

---

## 2. 파라미터 규칙
- `select.keys`는 문자열 배열로 x축 값(예: `"1990-01-01"`)을 넣습니다. 최소 1개(하이라이트/딤), `line-trace`는 2개 이상 권장.
- `style`  
  - `highlight`: `style.color`만 있으면 됩니다.  
  - `dim`: `style.opacity`로 비선택 포인트 투명도 지정.  
  - `line-trace`: `stroke`, `strokeWidth`, `opacity`, `radius`(포인트 원 크기) 사용 가능.
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
  "select": { "keys": ["1990-01-01", "1998-01-01"] },
  "style": { "stroke": "#2563eb", "strokeWidth": 2, "radius": 3.5 }
}
```

---

## 4. 사용 팁
- 키 문자열은 x축 라벨과 동일한 포맷(예: `"YYYY-MM-DD"`)으로 넣으세요. (내부에서 ISO 전체와 매칭 처리)
- 여러 효과가 필요하면 draw 액션을 나눠 순서대로 실행하세요.  
- 차트가 재렌더링 없이 draw만 실행되므로, 선택 대상이 안 보이면 `clear` 후 다시 시도하거나 키 문자열을 확인하세요.

## 5. 내부 구현 읽기
- `src/renderer/draw/line/SimpleLineDrawHandler.ts`: highlight 시 작은 Circle을 그려주고, `lineTrace`는 `trace`+`select.keys`로 구간을 정한 뒤 기존 path를 따라 점과 선을 그립니다. `lineTrace`가 그리는 path는 `ensureAnnotationLayer`를 통해 SVG 최상위에 별도 그룹으로 관리합니다.
- `src/renderer/draw/genericDraw.ts`: `highlight`, `dim`, `clear` 등의 기본 DOM 처리는 이 파일에서, selection/annotation 제거 로직이 일관되게 정의되어 있습니다.
- `src/renderer/ops/executor/runDrawPlan.ts`: draw-plan을 실행하면서 handler → `runGenericDraw` 흐름을 돌아, 어떤 action이 annotation layer로 이어지는지 확인할 수 있습니다.
