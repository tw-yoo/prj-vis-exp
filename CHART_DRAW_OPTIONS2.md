# `op: "draw"` Guide (Simple Bar & Simple Line – NEW TS Port)

> 이 문서는 NEW(TypeScript/React+D3) 환경에서 **Simple Bar** 및 **Simple Line** 차트에 적용 가능한 `draw` 옵션을 설명합니다.
> Simple Bar: highlight/dim/clear/text/rect/line/bar-segment/sort/filter/split/unsplit  
> Simple Line: highlight/dim/clear/line-trace (점·라인 하이라이트 전용)

---

## 0) 결론
- `op: "draw"`는 동작합니다. (Simple Bar + Simple Line)
- 지원 액션 (Bar): `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `bar-segment`, `split`, `unsplit`, `sort`, `filter`
- 지원 액션 (Line): `highlight`, `dim`, `clear`, `line-trace`
- 선택 대상: 기본적으로 `mark: "rect"` 를 대상으로 하고, `data-id`, `data-target`, `data-value`, `data-series`, `id`가 `keys`와 매칭되면 선택됩니다.
  - Simple Bar에서 기본으로 세팅되는 데이터 속성: `data-id`, `data-target`(x 필드), `data-value`(y 값), `data-m-*`, `data-plot-*`, `data-x-field`, `data-y-field`.

---

## 1) JSON 스펙 (공통)
필드 설명:
- `action`: `"highlight" | "dim" | "clear" | "text" | "rect" | "line" | "line-trace" | "bar-segment" | "split" | "unsplit" | "sort" | "filter"`
- `chartId` (옵션): 차트가 `split`된 경우 특정 서브차트에만 적용하기 위한 그룹 ID.
- `select` (옵션): 대상 선택. `mark:"rect"` 기본. `keys`는 `data-id`/`data-target`/`data-value`와 매칭.
- `style`: 액션별 스타일.

```json
{
  "op": "draw",
  "action": "highlight",
  "select": { "by": "key", "keys": ["USA", "KOR"], "mark": "rect" },
  "style": { "color": "#ef4444", "opacity": 0.25 }
}
```

### 액션별 옵션 매트릭스
| action | 필수 필드 | 선택 필드/기본값 | 설명 & 좌표계 |
| --- | --- | --- | --- |
| highlight | `select.keys` | `style.color`(`#ef4444`) | Bar: 막대 채우기 / Line: 점 채우기 |
| dim | (생략 가능) | `style.opacity`(0.25) | 선택된 것 외 나머지 희미하게 |
| clear | 없음 | - | 색상/불투명도 복원 + annotation 제거 |
| text | `text.value` | `mode`(`anchor` if keys else `normalized`), `offset`, `style` | Bar 전용: `anchor`는 선택 막대 bbox, `normalized`는 뷰박스 비율 |
| rect | `rect.size`(`axis`에서는 불필요) | `mode`(`normalized`/`axis`/`data-point`), `position`(normalized), `axis`, `point`, `style` | Bar 전용 |
| line | `line.mode` | `angle/length/axis`, `pair`, `hline`, `style` | Bar 전용: angle / connect / hline-x / hline-y |
| line-trace | `select.keys`(2개 이상 권장) | `style.stroke`(`#ef4444`), `style.strokeWidth`(2) | Line 전용: 두 x라벨 사이의 궤적을 따라 path + 점 하이라이트 |
| bar-segment | `segment.threshold` | `segment.when`(`gte`), `segment.style` | Bar 전용: 막대 일부 오버레이 |
| split | `split.groups` | `split.restTo`, `split.orientation`(`vertical`) | Bar 전용: x 레이블 2개 그룹 서브차트 |
| unsplit | - | - | Bar 전용: split 해제 |
| sort | - | `by`(`y`), `order`(`asc`) | Bar 전용 |
| filter | - | `x.include/exclude`, `y.op`, `y.value` | Bar 전용: include → exclude → y 비교 |

---

## 2) 액션별 단일 예시 (Simple Bar 기준)

각 예시는 **한 번의 draw 액션**으로 모든 옵션을 보여줍니다. 필요 시 ops 배열에 원하는 순서로 배치하세요.

### A. clear — 색상/투명도 및 모든 annotation 제거
```json
{
  "op": "draw",
  "action": "clear"
}
```

### B. split — x 레이블 기준 2개 서브차트로 분리
```json
{
  "op": "draw",
  "action": "split",
  "split": {
    "by": "x",
    "groups": { "A": ["KOR", "USA"] },
    "restTo": "B",
    "orientation": "horizontal"
  }
}
```
- `groups`에 2개 그룹을 모두 적어도 되고, 하나만 적으면 나머지를 `restTo`로 보냅니다.
- split 이후에는 `chartId: "A"` / `chartId: "B"`로 draw 대상을 분리할 수 있습니다.

### C. highlight — 특정 막대 채우기 색 변경
```json
{
  "op": "draw",
  "action": "highlight",
  "select": { "keys": ["USA"], "mark": "rect" },
  "style": { "color": "#f97316" }
}
```

### D. dim — 선택 외 나머지 투명도 낮추기
```json
{
  "op": "draw",
  "action": "dim",
  "select": { "keys": ["USA", "KOR"], "mark": "rect" },
  "style": { "opacity": 0.2 }
}
```

### E. bar-segment — threshold 기준으로 막대 일부만 색 변경
```json
{
  "op": "draw",
  "action": "bar-segment",
  "select": { "keys": ["KOR"], "mark": "rect" },
  "segment": {
    "threshold": 45,
    "when": "gte",
    "style": { "fill": "#ef4444", "opacity": 1 }
  }
}
```
- `threshold`는 y 값(데이터 값) 기준입니다. 내부적으로 y축 tick을 이용해 SVG 좌표로 변환한 뒤, 오버레이 rect를 그립니다.
- `when`은 **하이라이트할 구간 조건**입니다. 예: `gte`는 **value ≥ threshold**에 해당하는 구간만 덮습니다. (`lte`는 value ≤ threshold 구간)

### F. text (anchor 모드) — 선택 막대 bbox 기준
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

### G. text (normalized 모드) — 뷰박스 비율 좌표
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

### H. rect (normalized 모드) — 0~1 비율 좌표 & 크기
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "normalized",
    "position": { "x": 0.5, "y": 0.5 },
    "size": { "width": 0.4, "height": 0.2 },
    "style": { "fill": "#60a5fa", "opacity": 0.2, "stroke": "#111827", "strokeWidth": 1 }
  }
}
```

### I. rect (data-point 모드) — 특정 x 데이터 포인트를 중심으로
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
- `point.x`에 해당하는 막대(기본적으로 `rect.main-bar`)를 찾고, 그 막대의 **데이터 포인트(x=막대 중앙, y=막대 끝점)** 를 rect 중심으로 사용합니다.
- `size`는 SVG 뷰박스 기준 비율입니다.

### J. rect (axis 모드, x 라벨 기준) — 자동 크기 계산
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": { "x": "KOR" },
    "style": { "fill": "#22c55e33" }
  }
}
```

### K. rect (axis 모드, x 라벨 2개 범위) — 사이 라벨 모두 포함
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": { "x": ["KOR", "IRL"] },
    "style": { "fill": "#60a5fa33", "stroke": "#2563eb" }
  }
}
```

### L. rect (axis 모드, y 값 1개) — y축 라벨 영역에 밴드
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": { "y": 70 },
    "style": { "stroke": "#ef4444", "fill": "none" }
  }
}
```
- y 하나를 지정하면 해당 y 라벨 영역을 감싸는 밴드가 생성됩니다(라벨 영역 폭 + 패딩 기준, 플롯 전체가 아님).
  - 만약 해당 y 값이 축 눈금에 없으면, 밴드 중앙에 그 값이 텍스트로 표시됩니다.

### M. rect (axis 모드, y 값 2개) — 두 라벨 사이 밴드
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": { "y": [40, 70] },
    "style": { "fill": "#c084fc33", "stroke": "#7c3aed" }
  }
}
```
- y 두 값을 주면 두 값 사이의 y축 라벨 구간을 감싸는 밴드가 생성됩니다.
  - 지정한 두 값 중 하나라도 축 눈금에 없으면, 밴드 중앙에 `값1–값2` 형태로 표시됩니다.

- axis 모드에서는 `rect.size`가 필요 없습니다. x 모드일 때는 선택한 라벨(1개 또는 2개) 범위를 자동으로 감싸며, y 모드일 때는 지정 y 값(1개 또는 2개) 범위를 자동 계산합니다.

### N. line (angle 모드) — 시작 y, 길이, 각도
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "angle",
    "axis": { "x": "KOR", "y": 40 },
    "angle": 45,
    "length": 10,
    "style": { "stroke": "#111827", "strokeWidth": 2 }
  }
}
```

### O. line (connect 모드) — 두 x 라벨 연결
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "connect",
    "pair": { "x": ["KOR", "USA"] },
    "style": { "stroke": "#2563eb" }
  }
}
```

### P. line (hline-x) — 특정 x 막대 위치에서 수평선
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-x",
    "hline": { "x": "KOR" },
    "style": { "stroke": "#10b981", "strokeWidth": 2 }
  }
}
```

### Q. line (hline-y) — 특정 y 값에서 수평선
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-y",
    "hline": { "y": 65 },
    "style": { "stroke": "#f59e0b", "strokeWidth": 2, "opacity": 0.9 }
  }
}
```
- `filter.x.include`와 `filter.x.exclude`를 함께 쓸 때는 JSON에 적힌 순서대로 적용됩니다. (예: `{ "include": [...], "exclude": [...] }`이면 include → exclude)

### R. sort — y 값 기준 내림차순
```json
{
  "op": "draw",
  "action": "sort",
  "sort": { "by": "y", "order": "desc" }
}
```

### S. filter — x 포함/제외 + y 조건
```json
{
  "op": "draw",
  "action": "filter",
  "filter": {
    "x": { "include": ["USA", "KOR"], "exclude": ["FRA"] },
    "y": { "op": "gte", "value": 50 }
  }
}
```

---

## 2-L) 액션별 단일 예시 (Simple Line 기준)
- 대상 선택: 기본 `mark: "circle"`을 사용하며 `keys`는 x 라벨(`data-target`)과 매칭됩니다.
- 지원 액션: `highlight`, `dim`, `clear`, `line-trace`

### a. clear — 모든 강조/annotation 제거
```json
{
  "op": "draw",
  "action": "clear"
}
```

### b. highlight — 특정 데이터 포인트 강조 (작은 원 오버레이)
```json
{
  "op": "draw",
  "action": "highlight",
  "select": { "keys": ["KOR", "USA"], "mark": "circle" },
  "style": { "color": "#ef4444" }
}
```

### c. dim — 선택 외 전체 흐리게
```json
{
  "op": "draw",
  "action": "dim",
  "select": { "keys": ["KOR"], "mark": "circle" },
  "style": { "opacity": 0.25 }
}
```

### d. line-trace — 두 x라벨 구간의 라인 궤적 하이라이트
```json
{
  "op": "draw",
  "action": "line-trace",
  "select": { "keys": ["KOR", "ITA"], "mark": "circle" },
  "style": { "stroke": "#2563eb", "strokeWidth": 2 }
}
```
- `select.keys`에 시작/끝 x 라벨을 주면, 그 구간의 라인 path를 따라 굵은 선을 그리고, 경로상의 포인트를 작은 원으로 덧그립니다.
- 차트가 split 되어 있으면 `chartId`로 대상 라인 차트를 지정할 수 있습니다.

---

## 3) 한계 및 향후 작업
- 현재 draw는 Simple Bar, Simple Line에서 동작합니다. (Stacked/Grouped Bar, Multiple Line은 미완성)

---

## 4) Best Practice
- Draw는 데이터 변형 op 이후에 배치하세요. (예: filter → sort → draw)
- `keys`는 Vega-Lite 데이터의 카테고리 값(바 x축 레이블)에 맞춰 작성하세요.
- 여러 효과가 필요할 때는 draw를 여러 개로 나누어 순차 적용하세요.

---

Happy drawing! 🎨
