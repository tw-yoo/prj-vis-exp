# `op: "draw"` Guide — Simple Bar (TS/React+D3)

이 문서는 **Simple Bar** 차트에서 사용할 수 있는 `draw` 액션과 파라미터를 API 문서 형태로 정리합니다. 예시는 `simpleBar` 렌더러를 기준으로 합니다.

---

## 1. 액션 목록
| action | 필수 | 선택/기본값 | 설명 |
| --- | --- | --- | --- |
| `highlight` | `select.keys` | `style.color`(`#ef4444`) | 선택한 막대 채우기 색상 변경 |
| `dim` | (없음) | `style.opacity`(0.25) | 선택 외 막대 투명도 감소 |
| `clear` | - | - | 색상/투명도 복원 + annotation 제거 |
| `text` | `text.value` | `mode`(`anchor`\*), `offset`, `style` | \*`select` 없으면 `normalized` 사용 |
| `rect` | `rect.size`(`axis`/`data-point`는 불필요) | `mode`(`normalized`/`axis`/`data-point`), `position`, `axis`, `point`, `style` | 영역 표시 |
| `line` | `line.mode` | `angle/length/axis`, `pair`, `hline`, `style` | 기준선/연결선 |
| `bar-segment` | `segment.threshold` | `segment.when`(`gte`), `segment.style` | 막대 일부만 오버레이 |
| `split` | `split.groups` | `split.restTo`, `split.orientation`(`vertical`) | x 라벨을 두 그룹으로 나눠 2개 서브차트 렌더 |
| `unsplit` | - | - | split 해제 |
| `sort` | - | `by`(`y`), `order`(`asc`) | 정렬 |
| `filter` | - | `x.include/exclude`, `y.op`, `y.value` | include → exclude → y 비교 |

선택 대상 기본값: `select.mark = "rect"`, 키 매칭 대상은 `data-id`, `data-target`(x), `data-value`(y), `data-series`, `id`.

---

## 2. 파라미터 규칙 (필수/조합)
- `select.keys`는 `highlight`, `dim`, `text(mode=anchor)`, `bar-segment`에 사실상 필요.
- `rect`  
  - `mode="normalized"`: `rect.position`(x,y: 0~1), `rect.size`(width,height) 필요.  
  - `mode="axis"`: `rect.axis.x`(1개 또는 2개 라벨) **또는** `rect.axis.y`(1개 또는 2개 값) 필요. `rect.size`는 무시.  
  - `mode="data-point"`: `rect.point.x` 필요, `rect.size` 필요.
- `line`  
  - `mode="angle"`: `line.axis.x`, `line.axis.y`, `line.angle`, `line.length` 필요.  
  - `mode="connect"`: `line.pair.x` 두 개 필요.  
  - `mode="hline-x"`: `line.hline.x` 필요.  
  - `mode="hline-y"`: `line.hline.y` 필요.
- `split`: `split.groups`에 2그룹 모두 기입하거나 1그룹 + `restTo`.

---

## 3. 주요 예시
각 예시는 한 번의 draw 액션만 포함합니다.

### clear
```json
{ "op": "draw", "action": "clear" }
```

### highlight
```json
{
  "op": "draw",
  "action": "highlight",
  "select": { "keys": ["USA", "KOR"], "mark": "rect" },
  "style": { "color": "#f97316" }
}
```

### dim
```json
{
  "op": "draw",
  "action": "dim",
  "select": { "keys": ["USA", "KOR"] },
  "style": { "opacity": 0.25 }
}
```

### text (anchor)
```json
{
  "op": "draw",
  "action": "text",
  "select": { "keys": ["KOR", "USA"] },
  "text": {
    "value": { "KOR": "Korea", "USA": "US" },
    "mode": "anchor",
    "offset": { "y": -8 },
    "style": { "color": "#111", "fontSize": 12, "fontWeight": "bold" }
  }
}
```

### rect (axis, x 하나)
```json
{
  "op": "draw",
  "action": "rect",
  "rect": { "mode": "axis", "axis": { "x": "KOR" }, "style": { "fill": "#22c55e33" } }
}
```

### rect (axis, y 두 값)
```json
{
  "op": "draw",
  "action": "rect",
  "rect": { "mode": "axis", "axis": { "y": [40, 70] }, "style": { "fill": "#c084fc33", "stroke": "#7c3aed" } }
}
```

### rect (data-point)
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "data-point",
    "point": { "x": "KOR" },
    "size": { "width": 0.08, "height": 0.12 },
    "style": { "stroke": "#ef4444", "strokeWidth": 2, "fill": "none" }
  }
}
```

### bar-segment
```json
{
  "op": "draw",
  "action": "bar-segment",
  "select": { "keys": ["KOR"] },
  "segment": { "threshold": 45, "when": "gte", "style": { "fill": "#ef4444" } }
}
```

### split / unsplit
```json
{
  "op": "draw",
  "action": "split",
  "split": { "by": "x", "groups": { "A": ["KOR", "USA"] }, "restTo": "B", "orientation": "horizontal" }
}
```
이후 draw 액션에 `chartId: "A"` 혹은 `"B"`를 지정해 각 서브차트에 개별 적용.

### line (hline-y)
```json
{
  "op": "draw",
  "action": "line",
  "line": { "mode": "hline-y", "hline": { "y": 65 }, "style": { "stroke": "#f59e0b", "strokeWidth": 2 } }
}
```

### filter
```json
{
  "op": "draw",
  "action": "filter",
  "filter": { "x": { "include": ["USA", "KOR"], "exclude": ["FRA"] }, "y": { "op": "gte", "value": 50 } }
}
```

---

## 4. 사용 팁
- draw는 데이터 변형(filter/sort) 이후에 배치.
- `select.keys`는 x라벨(=data-target)과 맞춰 작성.
- 여러 효과가 필요하면 draw 액션을 나눠 순차 적용.
- split 이후에는 반드시 `chartId`로 대상 서브차트를 지정.

## 5. 내부 구현 읽기
- `src/renderer/draw/BarDrawHandler.ts`(루트): `highlight`, `dim`, `rect` 등 기본 draw action이 `BaseDrawHandler`의 `filterByKeys`/`selectScope`를 사용해 호출됩니다.
- `src/renderer/draw/genericDraw.ts`: `highlight`/`dim`/`text`/`rect`/`line`의 공통 DOM 조작 함수가 여기에 있고, draw-plan을 사용하는 operation은 `runDrawPlan` → `runGenericDraw` 흐름으로 실행됩니다.
- `src/renderer/ops/executor/runDrawPlan.ts`: draw action 리스트를 받아 `handler.run` + `runGenericDraw`를 반복하며 annotation layer를 정리합니다. draw action을 확장할 땐 이 파일을 먼저 참고하세요.
