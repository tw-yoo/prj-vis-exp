# `op: "draw"` Guide (Simple Bar – NEW TS Port)

> 이 문서는 NEW(TypeScript/React+D3) 환경에서 **Simple Bar** 차트에 적용 가능한 `draw` 옵션을 설명합니다.
> 현재 Simple Bar는 draw 액션(하이라이트/디밍/텍스트/사각형/라인/정렬/필터)을 지원합니다.

---

## 0) 결론
- `op: "draw"`는 동작합니다. (Simple Bar 한정)
- 지원 액션: `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `sort`, `filter`
- 선택 대상: 기본적으로 `mark: "rect"` 를 대상으로 하고, `data-id`, `data-target`, `data-value`, `data-series`, `id`가 `keys`와 매칭되면 선택됩니다.

---

## 1) JSON 스펙
필드 설명:
- `action`: `"highlight" | "dim" | "clear" | "text" | "rect" | "line" | "sort" | "filter"`
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

### 지원 액션별 동작
- **highlight**: 선택된 막대의 `fill`을 `style.color`(기본 `#ef4444`)로 변경하고 opacity 1로 설정.
- **dim**: `select`로 지정한 막대를 제외하고 나머지 막대의 opacity를 `style.opacity`(기본 0.25)로 낮춤.
- **clear**: 모든 막대 색상을 기본색 `#69b3a2`로 복원하고 opacity 1로 리셋. 차트의 annotation도 제거.
- **text**: 텍스트 주석 추가 (anchor/normalized).
- **rect**: SVG 기준 사각형 주석 추가 (normalized/axis).
- **line**: 라인 주석 추가 (angle/connect/hline-x/hline-y).
- **sort**: 막대 정렬 (x label 또는 y value 기준, asc/desc).
- **filter**: 막대 필터링 (x 레이블 포함 리스트 or y값 비교).

---

## 2) 실행 예시 (Simple Bar)

### A. 특정 막대 강조
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "select": { "by": "key", "keys": ["USA"], "mark": "rect" },
      "style": { "color": "#ef4444" }
    }
  ]
}
```

### B. 일부 막대만 강조하고 나머지 흐리게
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "select": { "by": "key", "keys": ["USA", "KOR"], "mark": "rect" },
      "style": { "opacity": 0.2 }
    },
    {
      "op": "draw",
      "action": "highlight",
      "select": { "by": "key", "keys": ["USA", "KOR"], "mark": "rect" },
      "style": { "color": "#f97316" }
    }
  ]
}
```

### C. 상태 초기화
```json
{
  "ops": [
    { "op": "draw", "action": "clear" }
  ]
}
```

### D. 텍스트 (anchor)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "select": { "keys": ["KOR", "USA"] },
      "text": {
        "value": { "KOR": "Korea", "USA": "US" },
        "mode": "anchor",
        "offset": { "y": -8 }
      }
    }
  ]
}
```

### E. 텍스트 (normalized)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "text": {
        "value": "Title",
        "mode": "normalized",
        "position": { "x": 0.5, "y": 0.95 }
      }
    }
  ]
}
```

### F. 사각형 (normalized)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "rect": {
        "mode": "normalized",
        "position": { "x": 0.5, "y": 0.5 },
        "size": { "width": 0.4, "height": 0.2 },
        "style": { "fill": "#60a5fa", "opacity": 0.2 }
      }
    }
  ]
}
```

### G. 사각형 (axis)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "rect",
      "rect": {
        "mode": "axis",
        "axis": { "x": "KOR" },
        "size": { "width": 0.2, "height": 0.15 }
      }
    }
  ]
}
```

### H. 라인 (angle)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "angle",
        "axis": { "x": "KOR", "y": 40 },
        "angle": 45,
        "length": 10
      }
    }
  ]
}
```

### I. 라인 (connect)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "connect",
        "pair": { "x": ["KOR", "USA"] }
      }
    }
  ]
}
```

### J. 라인 (hline-x / hline-y)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "hline-x",
        "hline": { "x": "KOR" }
      }
    },
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "hline-y",
        "hline": { "y": 65 }
      }
    }
  ]
}
```

### K. 정렬 (x 또는 y 기준)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "sort",
      "sort": {
        "by": "y",
        "order": "desc"
      }
    }
  ]
}
```

### L. 필터 (x 포함/제외 리스트 또는 y 조건)
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "filter",
      "filter": {
        "x": { "include": ["USA", "KOR"], "exclude": ["FRA"] },
        "y": { "op": "ge", "value": 50 }
      }
    }
  ]
}
```
- `filter.x.include`와 `filter.x.exclude`를 함께 쓸 때는 JSON에 적힌 순서대로 적용됩니다. (예: `{ "include": [...], "exclude": [...] }`이면 include → exclude)

---

## 3) 한계 및 향후 작업
- 현재 Simple Bar에 대해서만 draw 액션을 지원합니다.
- 다른 차트 타입(스택/그룹/라인 등)은 draw 액션이 미완성입니다.

---

## 4) Best Practice
- Draw는 데이터 변형 op 이후에 배치하세요. (예: filter → sort → draw)
- `keys`는 Vega-Lite 데이터의 카테고리 값(바 x축 레이블)에 맞춰 작성하세요.
- 여러 효과가 필요할 때는 draw를 여러 개로 나누어 순차 적용하세요.

---

Happy drawing! 🎨
