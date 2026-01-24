# `op: "draw"` Guide (Simple Bar – NEW TS Port)

> 이 문서는 NEW(TypeScript/React+D3) 환경에서 **Simple Bar** 차트에 적용 가능한 `draw` 옵션을 설명합니다.  
> 현재 포트 상태: highlight / dim / clear 액션이 동작하며, 다른 액션은 아직 미포트입니다.

---

## 0) 결론
- `op: "draw"`는 동작합니다. (Simple Bar 한정)
- 지원 액션: `highlight`, `dim`, `clear`
- 선택 대상: 기본적으로 `mark: "rect"` 를 대상으로 하고, `data-target` 또는 `data-id`가 `keys`와 매칭되는 막대를 선택합니다.

---

## 1) JSON 스펙
필드 설명:  
- `action`: `"highlight" | "dim" | "clear"`  
- `select` (옵션): 대상 선택. 기본 `by:"key"`, `mark:"rect"`. `keys`는 `data-target`/`data-id` 값 배열.  
- `style`: 액션별 스타일. `highlight` 시 `color`, `dim` 시 `opacity` 등을 사용.  

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

---

## 3) 한계 및 향후 작업
- 현재 Simple Bar에 대해서만 highlight/dim/clear를 지원합니다.
- OLD 문서에 있던 라벨, 가이드라인, 브릿지, reorder 등의 draw 액션은 아직 미포트 상태입니다.
- 다른 차트 타입(스택/그룹/라인 등)도 draw 액션이 미구현입니다.

---

## 4) Best Practice
- Draw는 데이터 변형 op 이후에 배치하세요. (예: filter → sort → draw)
- `keys`는 Vega-Lite 데이터의 카테고리 값(바 x축 레이블)에 맞춰 작성하세요.
- 여러 효과가 필요할 때는 draw를 여러 개로 나누어 순차 적용하세요.

---

Happy drawing! 🎨
