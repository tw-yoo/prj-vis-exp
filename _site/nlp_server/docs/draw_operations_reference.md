# Draw Operation Reference (for `nlp_server` backend LLM agent)

이 문서는 Workbench 런타임 기준으로 **현재 지원되는 draw operation**을 정리한 참고 문서입니다.

- 소스 기준: `src/rendering/draw/types.ts`, `src/rendering/draw/supportMatrix.ts`, `src/operation/run/*Ops.ts`
- 목적: backend LLM이 `opsSpec` 생성 시, chart type에 맞는 draw action만 안정적으로 생성하도록 가이드

---

## 1) Draw Op 기본 형식

`draw` operation의 기본 형태:

```json
{
  "op": "draw",
  "action": "<draw-action-name>",
  "chartId": null
}
```

필요 시 action별 payload를 함께 넣습니다.

- `filter`: `filter` 필드
- `sort`: `sort` 필드
- `split`: `split` 필드
- `sum`: `sum` 필드
- `bar-segment`: `segment` 필드
- 차트 변환 계열: `stackGroup`, `toSimple`, `groupFilter` 등

---

## 2) 전체 Draw Action 목록

현재 정의된 draw action:

1. `highlight`
2. `dim`
3. `clear`
4. `text`
5. `rect`
6. `line`
7. `line-trace`
8. `bar-segment`
9. `split`
10. `unsplit`
11. `sort`
12. `filter`
13. `sum`
14. `line-to-bar`
15. `multi-line-to-stacked`
16. `multi-line-to-grouped`
17. `stacked-to-grouped`
18. `grouped-to-stacked`
19. `stacked-to-simple`
20. `grouped-to-simple`
21. `stacked-to-diverging`
22. `stacked-filter-groups`
23. `grouped-filter-groups`
24. `band`
25. `scalar-panel`

---

## 3) 공통 Draw (차트 다수에서 동작)

### 3.1 대부분 차트에서 공통 지원

- `highlight`: 선택 mark/키를 강조(색/불투명도 중심)
- `dim`: 선택 외 mark를 흐리게 처리
- `clear`: annotation/강조 상태 제거
- `text`: 텍스트 annotation 추가
- `rect`: 사각형 annotation 추가
- `line`: 선 annotation 추가
- `split`: 한 차트를 두 패널(chart A/B)로 분할
- `unsplit`: 분할 상태 복원
- `band`: 축 구간을 얇은 직사각형으로 강조 (x/y)
- `scalar-panel`: 스칼라 ref 비교 결과를 패널(2-bar + diff)로 표시
  - `layout="inset"`: 인셋 패널
  - `layout="full-replace"`: 기존 차트를 가리는 전체 크기 비교 차트
  - `absolute=true`면 막대/Δ를 절대값 기준으로 렌더

### 3.2 부분 공통

- `filter`: `simple_bar`, `stacked_bar`, `grouped_bar`, `simple_line`, `multi_line` 지원
  - line 계열은 non-split에서 in-place relayout(축 유지) 방식으로 처리
- `sort`: `simple_bar`, `stacked_bar`, `grouped_bar` 지원
- `bar-segment`: 바 차트(`simple/stacked/grouped`)에서 threshold 기반 세그먼트 강조

### 3.3 애니메이션 정책 (중요)

- 기본 최소 draw 시간: `0.5s` (`d3 transition` 기반)
- `sleep` draw op는 새로 생성하지 않음
- **non-split action은 remount 금지**(축/컴포넌트 유지)
  - 허용 예외: `split`, `unsplit`
  - 나머지는 `exit -> relayout -> enter` staged transition으로 처리

---

## 4) Chart-Specific Draw Ops

아래는 backend LLM이 특히 구분해서 써야 하는 **차트 전용(draw conversion/filter)** 입니다.

### 4.1 Simple Bar 전용

- `sum`
  - 차트 상단/근처에 합계값 annotation 렌더링
  - `sum.value`가 없으면 현재 데이터에서 자동 합산

### 4.2 Simple Line 전용

- `line-trace`
  - 두 점을 잇는 트레이스 선(인터랙션 기반 추적)
- `line-to-bar`
  - line chart를 bar mark 기반으로 재렌더링

### 4.3 Multi Line 전용

- `multi-line-to-stacked`
  - multi-line(시리즈별 선)을 stacked bar로 변환
  - 시리즈 색 매핑을 가능한 한 보존
- `multi-line-to-grouped`
  - multi-line을 grouped bar로 변환
  - `xOffset` + `y.stack=null` 구조로 grouped 렌더링 보장

### 4.4 Stacked Bar 전용

- `stacked-to-grouped`
  - stacked bar를 grouped bar로 변환
  - 핵심 처리:
    - `encoding.y.stack = null`
    - `encoding.xOffset = { field: <seriesField> }`
- `stacked-to-simple`
  - 시리즈 하나만 선택해 simple bar로 변환
  - 선택 시리즈의 기존 색(`__fill`)을 가능한 유지
- `stacked-to-diverging`
  - vertical stacked bar를 **diverging stacked bar**로 변환
  - 핵심 처리:
    - `encoding.y.stack = "center"`
    - 명시적 y domain이 없으면 `[-half, half]` 도메인 자동 설정
- `stacked-filter-groups`
  - color/group series 기준 include/exclude/reset 필터
  - 원본 데이터 기준으로 재렌더링 가능(reset)

### 4.5 Grouped Bar 전용

- `grouped-to-stacked`
  - grouped를 stacked로 변환
  - 핵심 처리:
    - grouped 힌트(`xOffset`, facet 힌트) 제거
    - `encoding.y.stack = "zero"`
- `grouped-to-simple`
  - 시리즈 하나를 뽑아 simple bar로 변환
  - grouped 구조에 따라 facet 축을 x로 승격할 수 있음
- `grouped-filter-groups`
  - series 단위 include/exclude/reset 필터
  - group 고유 색 유지가 중요한 시나리오

---

## 5) 차트 타입별 지원 요약

### `SIMPLE_BAR`

- 지원: `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `filter`, `sort`, `split`, `unsplit`, `sum`, `bar-segment`, `band`

### `STACKED_BAR`

- 지원: 공통 + `stacked-to-grouped`, `stacked-to-simple`, `stacked-to-diverging`, `stacked-filter-groups`

### `GROUPED_BAR`

- 지원: 공통 + `grouped-to-stacked`, `grouped-to-simple`, `grouped-filter-groups`

### `SIMPLE_LINE`

- 지원: `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `line-trace`, `filter`, `split`, `unsplit`, `line-to-bar`, `band`

### `MULTI_LINE`

- 지원: `highlight`, `dim`, `clear`, `text`, `rect`, `line`, `split`, `unsplit`, `multi-line-to-stacked`, `multi-line-to-grouped`, `band`

---

## 6) Backend LLM 생성 가이드 (실무 규칙)

1. chart type에 없는 action은 생성하지 말 것
2. 변환 action 사용 시 필수 payload를 함께 넣을 것
   - 예: `stacked-to-simple`/`grouped-to-simple`는 `toSimple.series` 필수
3. grouped/stacked 상호 변환에서는 `xField`, `colorField`를 명시하면 안정적
   - `stackGroup: { "xField": "...", "colorField": "..." }`
4. series 필터 계열은 `groupFilter`를 사용
   - 예: `{"groups":["A","B"]}` 또는 `{"exclude":["C"]}` 또는 `{"reset":true}`
5. chartId 분할 맥락(split)에서 동작 범위가 달라질 수 있으므로, 필요 시 `chartId`를 명시

---

## 8) Python Draw Plan 생성 기준 (`nlp_server/draw_plan/build_draw_plan.py`)

### 8.1 op → draw action 매핑표

| Data op | 기본 draw action | 추가 규칙 |
| --- | --- | --- |
| `retrieveValue`, `filter`, `findExtremum`, `nth`, `lagDiff`, `setOp`, `compare`, `pairDiff` | `highlight` | result의 target key 기준 |
| `determineRange` | `band` | categorical은 x-band, numeric은 y-band |
| `sum` | `sum` | scalar sum annotation |
| `average`, `count`, `compareBool`, `add`, `scale` | `line` + `text` | 수평선 + scalar label |
| `compare`, `diff` | `line(mode=connect)` | target selector가 있으면 pair/connectBy 사용 |
| `pairDiff` | `line(mode=connect)` | groupA/groupB를 connectBy(start/end series)로 연결 |
| `setOp` | `highlight` + `band` | 선택 target run(연속 구간)에 band 추가 |

### 8.2 `diff`의 scalar-panel 분기

- `diff`가 scalar ref 기반(`ref:nX`) 비교이고, 두 값 모두 차트 도메인 target으로 매핑되지 않으면:
  - line/text 대신 `scalar-panel` 2단계 생성
  - `mode="base"` → `mode="diff"`
  - `layout="full-replace"`, `absolute=true`

### 8.3 scoped group filter 자동 삽입 정책

- stacked/grouped bar에서 op에 `group`이 있으면:
  - 실행 전: `stacked-filter-groups` 또는 `grouped-filter-groups` 삽입
  - 실행 후: 동일 action의 `reset=true` 삽입
- 즉, 각 scoped op는 로컬 group scope를 열고 닫는 형태로 변환됨

### 8.4 scheduler view hint 처리 정책

- `schedule_ops_spec`가 주입하는 `meta.view.phase`/`parallelGroup`/`split`은 **draw 생성 로직에서 의사결정에 직접 사용하지 않음**
- draw plan은 runtime result와 op contract 기반으로 생성되며, `meta`는 주로 trace/debug 전달 목적
- 따라서 draw 동작 차이는 view hint보다 op 의미와 실행 결과 shape에 의해 결정됨

### 8.5 기타

- 각 group 시작 시 `clear`를 자동 삽입
- `sleep` draw op는 생성하지 않음
- normalized 좌표 규약(backend/frontend 공통):
  - `x, y`는 `[0,1]` 범위
  - `x=0`은 좌측, `x=1`은 우측
  - `y=0`은 하단, `y=1`은 상단
  - 따라서 “상단 라벨” 기본값은 `y=0.92`를 사용

참고:
- TS 런타임은 `setOp/pairDiff/add/scale` data op를 정식 지원합니다.

---

## 7) Chart-Specific 예시 Payload

### 7.1 `stacked-to-grouped`

```json
{
  "op": "draw",
  "action": "stacked-to-grouped",
  "chartId": null,
  "stackGroup": {
    "swapAxes": false,
    "xField": "Year",
    "colorField": "Country_Region"
  }
}
```

### 7.2 `stacked-to-diverging`

```json
{
  "op": "draw",
  "action": "stacked-to-diverging",
  "chartId": null
}
```

### 7.3 `grouped-to-simple`

```json
{
  "op": "draw",
  "action": "grouped-to-simple",
  "chartId": null,
  "toSimple": {
    "series": "North America"
  }
}
```

### 7.4 `multi-line-to-stacked`

```json
{
  "op": "draw",
  "action": "multi-line-to-stacked",
  "chartId": null
}
```

### 7.5 `stacked-filter-groups`

```json
{
  "op": "draw",
  "action": "stacked-filter-groups",
  "chartId": null,
  "groupFilter": {
    "groups": ["Male", "Female"]
  }
}
```
