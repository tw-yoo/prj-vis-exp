# `op: "draw"` Guide — 공통( BaseDrawHandler )

`BaseDrawHandler`에서 모든 차트 타입이 공통으로 활용하는 `draw` 액션과 필드를 정리했습니다. (Bar/Line 전용 옵션은 각 전용 문서 참고)

---

## 1. 지원 액션 (공통)
| action | 필수 | 선택/기본값 | 설명 |
| --- | --- | --- | --- |
| `highlight` | `select.keys` | `style.color`(`#ef4444`) | 선택된 마크 채우기 색상 변경 |
| `dim` | (없음) | `style.opacity`(0.25) | 선택 외 마크 투명도 감소 |
| `clear` | - | - | 색상/불투명도 복원 + annotation 제거 |
| `text` | `text.value` | `mode`(`anchor` if keys else `normalized`), `offset`, `style` | 텍스트 어노테이션 |
| `rect` | `rect.size`(`axis`/`data-point`는 불필요) | `mode`(`normalized`/`axis`/`data-point`), `position`, `axis`, `point`, `style` | 영역/밴드 표시 |
| `line` | `line.mode` | `angle/length/axis`, `pair`, `hline`, `style`, `arrow` | 기준선/연결선 + 화살표 |

> 선택 대상 기본값: `select.mark`는 각 차트 핸들러의 기본 마크(바의 rect, 라인의 point/mark)를 사용. 키 매칭 대상은 `data-id`, `data-target`(x), `data-value`(y), `data-series`, `id`.

---

## 2. 파라미터 규칙
- `select.keys`: 문자열/숫자 배열. `highlight`, `dim`, `text(mode=anchor)`, `line(mode=connect)`에서 사실상 필요.
- `style`  
  - `highlight`: `color`만 주면 됨.  
  - `dim`: `opacity`로 비선택 마크 투명도 설정.  
  - `text`: `color`, `fontSize`, `fontWeight`, `fontFamily`, `opacity`.  
  - `rect`: `fill`, `opacity`, `stroke`, `strokeWidth`.  
  - `line`: `stroke`, `strokeWidth`, `opacity`.
- `text`  
  - `mode="anchor"`: `select.keys`로 선택한 마크의 bbox 중심 기준. `offset`(x,y)로 미세 조정.  
  - `mode="normalized"`: `text.position`(x,y: 0~1 필수), 뷰박스 비율 좌표 사용.
- `rect`  
  - `mode="normalized"`: `rect.position`(x,y: 0~1) + `rect.size`(width,height) 필수.  
  - `mode="axis"`: `rect.axis.x`(1개 또는 2개 라벨) **또는** `rect.axis.y`(1개 또는 2개 값) 필수, `rect.size`는 무시.  
  - `mode="data-point"`: `rect.point.x` + `rect.size` 필수.  
  - 하나의 axis만 지정(x 또는 y), 둘 동시에 사용 금지.
- `line`  
  - `mode="angle"`: `line.axis.x`, `line.axis.y`, `line.angle`, `line.length` 모두 필요.  
  - `mode="connect"`: `line.pair.x` 두 값 필요.  
  - `mode="hline-x"`: `line.hline.x` 필요.  
  - `mode="hline-y"`: `line.hline.y` 필요.
  - `position`: `line.position.start`/`line.position.end`(0~1 정규화)을 직접 지정하면 `line.arrow`의 위치를 결정할 수 있습니다.  
  - `arrow`: `line.arrow.start`/`line.arrow.end`을 `true`로 켜서 시작/끝에 화살표를 추가하며, `length`/`width`/`style`로 삼각형 크기와 색을 조절합니다. `style.fill`/`style.stroke`가 없으면 `line.style.stroke`를 따릅니다.  
- `chartId`: 차트가 split/멀티 패널일 때 특정 서브차트만 대상 지정.

---

## 3. 예시 (최소 예)

### clear
```json
{ "op": "draw", "action": "clear" }
```

### highlight
```json
{
  "op": "draw",
  "action": "highlight",
  "select": { "keys": ["USA", "KOR"] },
  "style": { "color": "#ef4444" }
}
```

### text (normalized)
```json
{
  "op": "draw",
  "action": "text",
  "text": {
    "value": "Chart Title",
    "mode": "normalized",
    "position": { "x": 0.5, "y": 0.95 },
    "style": { "fontSize": 14, "fontWeight": 700 }
  }
}
```

### rect (axis, y 두 값)
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": { "y": [2000, 3000] },
    "style": { "fill": "#c084fc33", "stroke": "#7c3aed" }
  }
}
```

### line (connect)
```json
{
  "op": "draw",
  "action": "line",
  "line": { "mode": "connect", "pair": { "x": ["1995-01-01", "2005-01-01"] }, "style": { "stroke": "#2563eb" } }
}
```

### line (arrowheads on ends)
`data/test/spec/line_simple.json`(year × research_and_development_expenditure)를 기준으로 normalized viewbox 좌표를 쓰면 시작/끝 좌표를 직접 정할 수 있습니다.
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "position": { "start": { "x": 0.1, "y": 0.2 }, "end": { "x": 0.85, "y": 0.7 } },
    "style": { "stroke": "#2563eb", "strokeWidth": 3 },
    "arrow": { "start": true, "end": true, "length": 12, "width": 8 }
  }
}
```
`line.position`를 쓰면 axis 대신 normalized 좌표로도 선을 그릴 수 있으며, `line.arrow.start`/`line.arrow.end`으로 각 끝에 화살표를 추가합니다. `arrow.length`/`width`로 크기를 키우고 `arrow.style.fill`/`style.stroke`로 별도 색상을 줄 수 있습니다.

---

## 4. 사용 팁
- `select.keys`는 차트 마크에 달린 `data-target/id`와 동일한 값으로 넣기. (Bar: x 라벨, Line: x 라벨)
- 여러 효과가 필요하면 draw 액션을 분리해 순차 적용.
- `axis` 모드의 rect/line은 `rect.size`를 넣지 않아도 자동 계산됨.
- `chartId`를 쓰면 split된 서브차트에만 안전하게 적용 가능.
