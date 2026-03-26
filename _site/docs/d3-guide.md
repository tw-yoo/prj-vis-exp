# D3 사용 가이드

> 이 프로젝트에서 D3를 어떻게 사용하는지 처음 배우는 사람을 위한 문서입니다.
> 실제 코드(`src/rendering/`) 기반으로 작성되었습니다.

---

## 목차

1. [D3란 무엇인가](#1-d3란-무엇인가)
2. [핵심 개념: Selection](#2-핵심-개념-selection)
3. [차트 컨텍스트 가져오기](#3-차트-컨텍스트-가져오기)
4. [엘리먼트 선택하기](#4-엘리먼트-선택하기)
5. [속성 변경하기](#5-속성-변경하기)
6. [색상 변경](#6-색상-변경)
7. [불투명도 조절](#7-불투명도-조절)
8. [엘리먼트 추가하기](#8-엘리먼트-추가하기)
9. [라인 그리기](#9-라인-그리기)
10. [텍스트 그리기](#10-텍스트-그리기)
11. [사각형 그리기](#11-사각형-그리기)
12. [애니메이션](#12-애니메이션)
13. [병렬 / 순차 실행](#13-병렬--순차-실행)
14. [Annotation 정리](#14-annotation-정리)
15. [실전 패턴 모음](#15-실전-패턴-모음)
16. [차트 Split (분리)](#16-차트-split-분리)

---

## 1. D3란 무엇인가

D3(Data-Driven Documents)는 SVG 엘리먼트를 JavaScript로 직접 조작하는 라이브러리입니다.

이 프로젝트에서 차트는 **Vega-Lite가 SVG로 렌더링**한 결과물이고,
D3는 그 SVG 위에 **추가적인 조작(하이라이트, 선 그리기, 텍스트 추가 등)** 을 담당합니다.

```
Vega-Lite → SVG 생성
D3        → 그 SVG를 선택하고 조작
```

---

## 2. 핵심 개념: Selection

D3의 모든 작업은 **Selection(선택)** 에서 시작합니다.

```typescript
import * as d3 from 'd3'

// DOM 엘리먼트 하나 선택
const svg = d3.select(container).select('svg')

// 조건에 맞는 여러 엘리먼트 선택
const bars = svg.selectAll('rect')
```

### select vs selectAll

| 메서드 | 설명 | 반환 |
|--------|------|------|
| `d3.select(el)` | 엘리먼트 하나 선택 | Selection (1개) |
| `d3.selectAll(selector)` | 조건에 맞는 모두 선택 | Selection (N개) |
| `.select(selector)` | Selection 안에서 하나 | Selection (1개) |
| `.selectAll(selector)` | Selection 안에서 모두 | Selection (N개) |

### 이 프로젝트에서 쓰는 타입

```typescript
// d3Helpers.ts
export type D3Selection = d3.Selection<d3.BaseType, unknown, d3.BaseType, unknown>
```

---

## 3. 차트 컨텍스트 가져오기

차트가 렌더링된 컨테이너(`chart-host` div)에서 SVG와 여러 메타데이터를 한번에 가져옵니다.

```typescript
import { getChartContext } from 'src/rendering/common/d3Helpers'

const { svg, g, margins, plot } = getChartContext(container)
// svg     → SVG 엘리먼트 Selection
// g       → 실제 차트 내용이 있는 <g> 그룹 Selection
// margins → { left, top } - 차트 여백 (픽셀)
// plot    → { w, h }     - 실제 플롯 영역 크기 (픽셀)
```

내부 구현을 보면, SVG에 저장된 `data-*` 속성을 읽어서 마진/크기 정보를 가져옵니다:

```typescript
// 실제 코드 (d3Helpers.ts)
const margins = {
  left: +(svgNode?.getAttribute('data-margin-left') || 0),
  top:  +(svgNode?.getAttribute('data-margin-top')  || 0),
}
const plot = {
  w: +(svgNode?.getAttribute('data-plot-width')  || 0),
  h: +(svgNode?.getAttribute('data-plot-height') || 0),
}
```

---

## 4. 엘리먼트 선택하기

### 4-1. 모든 마크(bar, circle, path) 선택

```typescript
// genericDraw.ts 기반
const allMarks = d3
  .select(container)
  .select('svg')
  .selectAll<SVGElement, unknown>('rect, circle, path')
```

### 4-2. data-* 속성으로 특정 엘리먼트 필터링

Vega-Lite로 그려진 바 차트의 각 bar에는 `data-target`, `data-id`, `data-value` 등의 속성이 붙어있습니다.
이 속성을 기준으로 원하는 bar만 골라낼 수 있습니다.

```typescript
// genericDraw.ts의 selectByKeys 함수 기반
const keys = new Set(['2020', '2021'])  // 선택할 x축 레이블

const selected = svg
  .selectAll<SVGElement, unknown>('rect')
  .filter(function (this: SVGElement) {
    const target = this.getAttribute('data-target')
    const id     = this.getAttribute('data-id')
    return !!(target && keys.has(target)) || !!(id && keys.has(id))
  })
```

### 4-3. 클래스로 선택

```typescript
// annotation 레이어 전체 선택
svg.selectAll('.annotation')

// guideline만 선택
svg.selectAll('.annotation-guideline')
```

### 4-4. Selection이 비어있는지 확인

```typescript
if (selection.empty()) {
  console.warn('엘리먼트를 찾지 못했습니다')
  return
}
```

---

## 5. 속성 변경하기

Selection을 얻었으면 `.attr()`로 SVG 속성을 변경합니다.

```typescript
selection
  .attr('fill', 'red')           // 채우기 색
  .attr('stroke', 'black')       // 테두리 색
  .attr('stroke-width', 2)       // 테두리 두께
  .attr('opacity', 0.5)          // 불투명도
  .attr('x', 100)                // x 좌표
  .attr('y', 200)                // y 좌표
  .attr('width', 50)             // 너비
  .attr('height', 80)            // 높이
```

CSS 스타일은 `.style()`을 사용합니다:

```typescript
selection
  .style('font-size', '12px')
  .style('font-weight', 'bold')
```

---

## 6. 색상 변경

### 6-1. 즉시 변경 (애니메이션 없음)

```typescript
// 특정 bar를 빨간색으로 하이라이트
selection.attr('fill', '#ef4444')
```

### 6-2. 애니메이션과 함께 변경

```typescript
import { changeBarColor } from 'src/rendering/common/d3Helpers'

// 600ms 동안 부드럽게 색상 전환
await changeBarColor(selection, '#ef4444')

// 커스텀 duration
await changeBarColor(selection, '#ef4444', 1000)
```

내부 구현:
```typescript
// d3Helpers.ts
export async function changeBarColor(selection, color, duration = 600) {
  return selection
    .transition()
    .duration(duration)
    .ease(d3.easeCubicOut)
    .attr('fill', color)
    .end()  // ← Promise로 변환 (await 가능)
}
```

### 6-3. 이 프로젝트의 색상 상수

```typescript
import { OPACITIES } from 'src/rendering/common/d3Helpers'

OPACITIES.FULL      // 1    (완전 불투명)
OPACITIES.DIM       // 0.2  (흐리게)
OPACITIES.SEMI_DIM  // 0.3  (약간 흐리게)
OPACITIES.HIDDEN    // 0    (완전 투명)
```

---

## 7. 불투명도 조절

### 7-1. 단일 Selection 페이드

```typescript
import { fadeElements, OPACITIES, DURATIONS } from 'src/rendering/common/d3Helpers'

// 선택된 것들을 흐리게
await fadeElements(selection, OPACITIES.DIM)

// 다시 원래대로
await fadeElements(selection, OPACITIES.FULL)

// 커스텀 duration
await fadeElements(selection, 0.5, 800)
```

### 7-2. 선택된 것만 남기고 나머지 흐리게 (dimOthers)

가장 많이 쓰이는 패턴입니다. "이것만 강조하고 나머지는 흐리게".

```typescript
import { dimOthers } from 'src/rendering/common/d3Helpers'

const allBars    = svg.selectAll('rect')        // 전체 bar
const targetBars = svg.selectAll('[data-target="2021"]')  // 강조할 bar

await dimOthers(allBars, targetBars)
// → targetBars는 opacity 1 유지
// → 나머지 bar들은 opacity 0.2로 감소
```

### 7-3. 필터 하이라이트

특정 x축 레이블만 보이고 나머지를 흐리게:

```typescript
// genericDraw.ts의 addFilterHighlight 기반
svg.selectAll('rect, circle, path').attr('opacity', function (this: SVGElement) {
  const key = this.getAttribute('data-target') ?? this.getAttribute('data-id')
  const keysToShow = new Set(['2020', '2021', '2022'])
  return key && keysToShow.has(key) ? 1 : 0.25
})
```

---

## 8. 엘리먼트 추가하기

SVG에 새로운 엘리먼트를 추가할 때 `.append()`를 사용합니다.

```typescript
// svg에 line 추가
svg.append('line')
   .attr('x1', 0)
   .attr('y1', 100)
   .attr('x2', 500)
   .attr('y2', 100)
   .attr('stroke', 'red')
   .attr('stroke-width', 2)

// svg에 text 추가
svg.append('text')
   .attr('x', 250)
   .attr('y', 80)
   .attr('text-anchor', 'middle')
   .attr('fill', 'black')
   .text('평균값: 42')

// svg에 rect 추가
svg.append('rect')
   .attr('x', 50)
   .attr('y', 50)
   .attr('width', 100)
   .attr('height', 40)
   .attr('fill', 'rgba(239,68,68,0.1)')
   .attr('stroke', '#ef4444')
```

> **중요**: 추가한 엘리먼트는 나중에 정리할 수 있도록 `.annotation` 클래스를 붙이는 것이 관례입니다.

```typescript
svg.append('line')
   .attr('class', 'annotation annotation-guideline')  // 클래스 붙이기
   // ...
```

---

## 9. 라인 그리기

### 9-1. 수평선 (기준선)

```typescript
import { drawHorizontalGuideline } from 'src/rendering/common/d3Helpers'

const { svg, margins, plot } = getChartContext(container)

await drawHorizontalGuideline(
  svg,
  yPosition,    // plot 내 y 좌표 (margin 제외)
  '#ef4444',    // 선 색상
  margins,      // { left, top }
  plot.w,       // 선 길이 (플롯 너비)
  'dashed',     // 'dashed' | 'solid'
)
```

내부 동작 원리:
```typescript
// 선을 x1=x2(길이 0)로 만든 후, transition으로 x2를 늘려서 "그려지는" 효과를 냄
const line = svg.append('line')
  .attr('x1', margins.left).attr('x2', margins.left)  // 길이 0에서 시작
  .attr('y1', y).attr('y2', y)

line.transition()
  .duration(400)
  .attr('x2', margins.left + plotWidth)               // 오른쪽으로 늘어남
  .end()
```

### 9-2. 수직선

```typescript
import { drawVerticalGuideline } from 'src/rendering/common/d3Helpers'

await drawVerticalGuideline(
  svg,
  xPosition,    // plot 내 x 좌표
  yStart,       // 선 시작 y
  yEnd,         // 선 끝 y
  '#3b82f6',
  margins,
  'dashed',
)
```

### 9-3. 두 점을 잇는 대각선 (RetrieveLine)

```typescript
import { drawRetrieveLine } from 'src/rendering/common/d3Helpers'

await drawRetrieveLine(
  svg,
  startX, startY,   // 시작점 (절대 좌표)
  endX, endY,       // 끝점 (절대 좌표)
  '#f59e0b',
)
```

### 9-4. 합계/평균 라인 + 레이블 (AggregateResult)

```typescript
import { drawAggregateResult } from 'src/rendering/common/d3Helpers'

await drawAggregateResult(
  svg,
  margins,
  plot,
  yPosition,      // 평균값에 해당하는 y 픽셀 좌표
  '#10b981',      // 선 색상
  'Average: 42',  // 레이블 텍스트
)
// → 가로 점선 + 중앙에 레이블이 함께 그려짐
```

### 9-5. 두 값의 차이 브리지 (DiffBridge)

두 bar의 높이 차이를 세로 선으로 표시합니다.

```typescript
import { drawDiffBridge } from 'src/rendering/common/d3Helpers'

await drawDiffBridge(
  svg,
  margins,
  plot,
  posA,           // 첫 번째 bar의 y 좌표
  posB,           // 두 번째 bar의 y 좌표
  '#8b5cf6',
  '+12.5',        // 레이블 텍스트
)
```

---

## 10. 텍스트 그리기

### 10-1. 값 레이블 (bar 위에 숫자 표시)

```typescript
import { addValueLabel } from 'src/rendering/common/d3Helpers'

await addValueLabel(
  svg,
  x,          // 텍스트 중앙 x 좌표
  y,          // 텍스트 y 좌표
  '42.5',     // 표시할 텍스트
  '#111827',  // 텍스트 색상
  {           // 옵션 (선택사항)
    fontSize: 12,
    fontWeight: 'bold',
    textAnchor: 'middle',   // 'start' | 'middle' | 'end'
    className: 'annotation',
  }
)
// → opacity 0에서 시작해 fade-in 애니메이션으로 등장
```

### 10-2. 정규화된 좌표로 텍스트 추가

SVG 픽셀 좌표 대신, 0~1 사이의 비율로 위치를 지정합니다.

```typescript
// genericDraw.ts의 addNormalizedText 기반
// position: { x: 0.5, y: 0.8 } → 차트 중앙 상단

svg.append('text')
   .attr('x', 0.5 * svgWidth)           // x=0.5 → 가로 중앙
   .attr('y', (1 - 0.8) * svgHeight)    // y=0.8 → 위에서 20% 위치
   .attr('text-anchor', 'middle')
   .attr('fill', '#111827')
   .attr('font-size', 12)
   .text('차트 제목')
```

### 10-3. 레이블 배경 (흰 박스)

텍스트 가독성을 위해 배경 사각형을 먼저 추가합니다.

```typescript
import { addLabelBackground, addValueLabel } from 'src/rendering/common/d3Helpers'

// 순서 중요: 배경 먼저, 텍스트 나중에
await addLabelBackground(svg, x, y, width, height)
await addValueLabel(svg, x, y, text, color)
```

---

## 11. 사각형 그리기

### 11-1. 기본 사각형 추가

```typescript
svg.append('rect')
   .attr('class', 'annotation')
   .attr('x', 100)
   .attr('y', 50)
   .attr('width', 200)
   .attr('height', 100)
   .attr('fill', 'rgba(59,130,246,0.1)')   // 반투명 파란색
   .attr('stroke', '#3b82f6')
   .attr('stroke-width', 1)
   .attr('rx', 4)                           // 모서리 둥글게
   .attr('opacity', 0.9)
```

### 11-2. 정규화된 좌표로 사각형 (범위 강조)

```typescript
// genericDraw.ts의 addNormalizedRect 기반
// position: 0~1 비율, size: 0~1 비율

const x = 0.3 * svgWidth   // 좌측에서 30% 위치
const y = 0.5 * svgHeight   // 위에서 50% 위치
const w = 0.2 * svgWidth    // 너비 20%
const h = 0.3 * svgHeight   // 높이 30%

svg.append('rect')
   .attr('x', x - w / 2)   // 중앙 정렬
   .attr('y', y - h / 2)
   .attr('width', w)
   .attr('height', h)
```

---

## 12. 애니메이션

D3 애니메이션은 `.transition()` 체이닝으로 만듭니다.

### 기본 구조

```typescript
selection
  .transition()               // 애니메이션 시작
  .duration(400)              // 지속 시간 (ms)
  .ease(d3.easeCubicOut)      // 이징 함수
  .attr('opacity', 1)         // 변경할 속성
  .end()                      // Promise 반환 (await 가능)
```

### 이징 함수 종류

```typescript
import { EASINGS } from 'src/rendering/common/d3Helpers'

EASINGS.DEFAULT  // d3.easeCubicInOut  - 시작·끝 느리고 중간 빠름 (기본값)
EASINGS.SMOOTH   // d3.easeCubicOut   - 끝만 느림 (가장 자연스러움)
EASINGS.LINEAR   // d3.easeLinear     - 일정한 속도

// D3 내장 이징 함수들
d3.easeCubicInOut  // 부드러운 S곡선
d3.easeCubicOut    // 처음 빠르고 끝에서 느리게
d3.easeLinear      // 일정 속도
d3.easeBounceOut   // 통통 튀는 효과
d3.easeElasticOut  // 탄성 효과
d3.easeBackOut     // 살짝 오버슈팅 후 정착
```

### Duration 상수

```typescript
import { DURATIONS } from 'src/rendering/common/d3Helpers'

DURATIONS.HIGHLIGHT      // 600ms - 하이라이트
DURATIONS.FADE           // 400ms - 페이드
DURATIONS.DIM            // 400ms - 디밍
DURATIONS.GUIDELINE_DRAW // 400ms - 가이드라인 그리기
DURATIONS.LABEL_FADE_IN  // 400ms - 레이블 등장
DURATIONS.REPOSITION     // 1000ms - 위치 이동
DURATIONS.STACK          // 1200ms - 스택 변환
DURATIONS.REMOVE         // 300ms - 제거
```

### await로 완료 대기

```typescript
// .end()를 붙이면 transition이 끝날 때 resolve되는 Promise 반환
await selection
  .transition()
  .duration(600)
  .attr('fill', 'red')
  .end()

// 이제 다음 작업 시작
console.log('애니메이션 완료!')
```

### 여러 속성 동시에 애니메이션

```typescript
selection
  .transition()
  .duration(600)
  .attr('fill', '#ef4444')    // 색상 변경
  .attr('opacity', 0.8)       // 불투명도 변경
  .attr('y', newY)            // 위치 변경
  .attr('height', newHeight)  // 크기 변경
  .end()
```

### Delay (딜레이)

```typescript
selection
  .transition()
  .delay(200)       // 200ms 후에 시작
  .duration(400)
  .attr('opacity', 1)
  .end()
```

---

## 13. 병렬 / 순차 실행

여러 애니메이션을 동시에 또는 순서대로 실행할 수 있습니다.

### 병렬 실행 (동시에)

```typescript
import { parallel } from 'src/rendering/common/d3Helpers'

await parallel(
  changeBarColor(bar1, '#ef4444'),
  fadeElements(otherBars, 0.2),
  drawHorizontalGuideline(svg, yPos, '#ef4444', margins, plot.w),
)
// → 세 애니메이션이 동시에 시작되고, 모두 끝날 때까지 기다림
```

`Promise.all`과 동일하지만, 함수를 넘겨도 됩니다:

```typescript
await parallel(
  () => changeBarColor(bar1, 'red'),   // 함수로 넘겨도 동작
  () => fadeElements(others, 0.2),
)
```

### 순차 실행 (하나씩 차례로)

```typescript
import { sequence } from 'src/rendering/common/d3Helpers'

await sequence(
  () => changeBarColor(bars, '#ef4444'),    // 1. 색상 변경 후
  () => drawHorizontalGuideline(...),        // 2. 가이드라인 그리고
  () => addValueLabel(svg, x, y, '42'),     // 3. 레이블 추가
)
// → 각 애니메이션이 끝난 후 다음 시작
```

### delay와 함께 사용

```typescript
import { delay } from 'src/rendering/common/d3Helpers'

await sequence(
  () => changeBarColor(bars, 'red'),
  () => delay(200),                    // 200ms 대기
  () => addValueLabel(svg, x, y, text),
)
```

---

## 14. Annotation 정리

추가한 가이드라인, 텍스트, 사각형 등을 한번에 제거합니다.

```typescript
import { clearAnnotations } from 'src/rendering/common/d3Helpers'

// 기본 annotation 모두 제거 (.annotation 클래스 기준)
clearAnnotations(svg)

// 추가 selector도 함께 제거
clearAnnotations(svg, ['.my-custom-label', '.highlight-rect'])
```

기본적으로 제거되는 클래스들:
- `.annotation` (모든 annotation의 공통 클래스)
- `.filter-label`, `.sort-label`, `.value-tag`
- `.range-line`, `.value-line`, `.threshold-line`
- `.compare-label`, `.extremum-highlight`, `.extremum-label`

---

## 15. 실전 패턴 모음

### 패턴 1: 특정 bar 하이라이트 + 나머지 흐리게

```typescript
const { svg } = getChartContext(container)
const allBars = svg.selectAll('rect').filter(function () {
  return !!this.getAttribute('data-target')  // data-target 있는 것만
})
const targetBar = allBars.filter('[data-target="2021"]')

await parallel(
  changeBarColor(targetBar, '#ef4444'),   // 강조 색상
  dimOthers(allBars, targetBar),          // 나머지 흐리게
)
```

### 패턴 2: 평균선 그리고 값 표시

```typescript
const { svg, margins, plot } = getChartContext(container)
const avgY = 150  // y축에서 평균값의 픽셀 위치

await drawAggregateResult(svg, margins, plot, avgY, '#10b981', 'Average: 42.5')
```

### 패턴 3: 두 bar 비교 브리지

```typescript
const bar2020 = container.querySelector('[data-target="2020"]') as SVGRectElement
const bar2021 = container.querySelector('[data-target="2021"]') as SVGRectElement

const y2020 = parseFloat(bar2020.getAttribute('y') || '0')
const y2021 = parseFloat(bar2021.getAttribute('y') || '0')

await drawDiffBridge(svg, margins, plot, y2020, y2021, '#8b5cf6', '+12.5%')
```

### 패턴 4: 순차 스토리텔링 (여러 단계)

```typescript
const { svg, margins, plot } = getChartContext(container)

// 1단계: 모두 흐리게
await fadeElements(allBars, OPACITIES.DIM)
await delay(300)

// 2단계: 2020 bar 강조
const bar2020 = svg.selectAll('[data-target="2020"]')
await changeBarColor(bar2020, '#3b82f6')
await fadeElements(bar2020, OPACITIES.FULL)
await delay(500)

// 3단계: 가이드라인 그리기
await drawHorizontalGuideline(svg, yPos, '#3b82f6', margins, plot.w)
await delay(300)

// 4단계: 값 레이블 표시
await addValueLabel(svg, labelX, labelY, '38.5', '#3b82f6')
```

### 패턴 5: 실행 후 초기화

```typescript
// 실행
await drawHorizontalGuideline(svg, yPos, 'red', margins, plot.w)
await addValueLabel(svg, x, y, 'Max', 'red')

// 초기화 (다음 실행 전에)
clearAnnotations(svg)
allBars.attr('fill', '#69b3a2').attr('opacity', 1)  // 기본 색상 복원
```

---

## 16. 차트 Split (분리)

하나의 차트를 x축 기준으로 **두 개의 서브 차트**로 분리해서 나란히 또는 위아래로 배치하는 기능입니다.

### 16-1. DrawSplitSpec 타입

```typescript
// src/rendering/draw/types.ts
type DrawSplitSpec = {
  by?: 'x'                                        // 분리 기준 (현재 'x'만 지원)
  groups: Record<string, Array<string | number>>  // 그룹 ID → x축 레이블 배열
  restTo?: string                                 // groups에 없는 나머지 레이블의 그룹 ID
  orientation?: 'vertical' | 'horizontal'         // 배치 방향 (기본값: 'vertical')
}
```

**orientation 값별 배치:**
- `'vertical'` (기본): 위아래로 배치 (두 차트가 같은 x 좌표에 위아래로)
- `'horizontal'`: 좌우로 나란히 배치

### 16-2. groups 작성 방법

```typescript
// 방법 1: 두 그룹 모두 명시
const split: DrawSplitSpec = {
  groups: {
    'first-half':  ['2015', '2016', '2017', '2018', '2019'],
    'second-half': ['2020', '2021', '2022', '2023', '2024'],
  },
  orientation: 'horizontal',
}

// 방법 2: 첫 번째 그룹만 지정하고 나머지는 restTo로
const split: DrawSplitSpec = {
  groups: {
    'group-A': ['Apple', 'Banana', 'Cherry'],
  },
  restTo: 'group-B',  // 나머지 레이블은 모두 group-B로
}
```

> `groups`에 레이블을 1개만 지정하면 나머지는 모두 두 번째 그룹으로 들어갑니다.
> `restTo`를 지정하지 않으면 두 번째 그룹 ID는 자동으로 `'B'`가 됩니다.

### 16-3. 내부 동작 원리 (normalizeSplitGroups)

```
x축 전체 도메인: ['2015', '2016', '2017', '2018', '2019', '2020', '2021']

groups = {
  'A': ['2015', '2016', '2017'],
  'B': ['2018', '2019', '2020', '2021'],
}

결과:
  domainA = ['2015', '2016', '2017']  → 그룹 'A'
  domainB = ['2018', '2019', '2020', '2021']  → 그룹 'B'
  groups에 없는 레이블은 두 번째 그룹(B)에 자동 배정
```

### 16-4. SVG 구조 (분리 후)

분리된 차트는 **하나의 SVG 안에 두 개의 `<g>` 그룹**으로 구성됩니다:

```html
<svg viewBox="0 0 600 300">
  <!-- 첫 번째 서브 차트 -->
  <g data-chart-id="first-half" transform="translate(60, 60)">
    <!-- bars, axes... -->
  </g>
  <!-- 두 번째 서브 차트 (gap=18px 이동) -->
  <g data-chart-id="second-half" transform="translate(60, 169)">
    <!-- bars, axes... -->
  </g>
</svg>
```

- 두 그룹은 y축 스케일을 공유합니다 (같은 domainMin ~ domainMax)
- 두 그룹 사이에 18px gap이 존재합니다
- 각 `<g>`에 `data-chart-id` 속성으로 그룹 ID가 저장됩니다

### 16-5. renderSplit* 함수 사용법

각 차트 타입별로 별도의 split 렌더 함수가 있습니다:

```typescript
import { renderSplitSimpleBarChart } from 'src/rendering/bar/simpleBarRenderer'
import { renderSplitStackedBarChart } from 'src/rendering/bar/stackedBarRenderer'
import { renderSplitGroupedBarChart } from 'src/rendering/bar/groupedBarRenderer'
import { renderSplitSimpleLineChart } from 'src/rendering/line/simpleLineRenderer'
import { renderSplitMultipleLineChart } from 'src/rendering/line/multipleLineRenderer'

// 사용 예시 (Simple Bar)
await renderSplitSimpleBarChart(container, spec, {
  groups: {
    'before-covid': ['2017', '2018', '2019'],
    'after-covid':  ['2020', '2021', '2022'],
  },
  orientation: 'horizontal',
})
```

### 16-6. 분리 후 특정 서브 차트 조작

분리 후에는 `chartId`를 통해 특정 서브 차트의 엘리먼트만 선택할 수 있습니다.

```typescript
// data-chart-id로 특정 그룹의 <g> 선택
const subChart = d3
  .select(container)
  .select('svg')
  .select('[data-chart-id="first-half"]')

// 해당 그룹 안의 bar만 하이라이트
subChart.selectAll('rect').attr('fill', '#ef4444')
```

draw operation에서도 `chartId`를 통해 서브 차트를 지정합니다:

```typescript
// DrawOp에서 chartId로 서브 차트 지정
const op: DrawOp = {
  action: DrawAction.Highlight,
  chartId: 'first-half',    // 이 서브 차트에만 적용
  select: { keys: ['2017', '2018'] },
  style: { color: '#ef4444' },
}
```

### 16-7. Split 상태 관리

분리 후 각 서브 차트의 도메인 정보는 WeakMap에 저장됩니다.

```typescript
// Simple Bar Chart
import {
  setSimpleBarSplitDomains,    // 분리 도메인 저장
  getSimpleBarSplitDomain,     // 특정 chartId의 도메인 조회
  clearSimpleBarSplitDomains,  // 분리 상태 초기화
} from 'src/rendering/bar/simpleBarRenderer'

// 저장된 도메인 확인
const domain = getSimpleBarSplitDomain(container, 'first-half')
// → Set<string> { '2017', '2018', '2019' }

// 분리 상태 초기화 (원래 차트로 복원 시)
clearSimpleBarSplitDomains(container)
```

각 차트 타입별 split 상태 관리 함수:

| 차트 타입 | 설정 | 조회 | 초기화 |
|-----------|------|------|--------|
| Simple Bar | `setSimpleBarSplitDomains` | `getSimpleBarSplitDomain` | `clearSimpleBarSplitDomains` |
| Stacked Bar | (내부 처리) | `getStackedBarSplitDomain` | (내부 처리) |
| Grouped Bar | (내부 처리) | `getGroupedBarSplitDomain` | (내부 처리) |
| Simple Line | `setSimpleLineSplitDomains` | `getSimpleLineSplitDomain` | `clearSimpleLineSplitDomains` |
| Multiple Line | `setMultipleLineSplitDomains` | `getMultipleLineSplitDomain` | `clearMultipleLineSplitDomains` |

### 16-8. 원래 차트로 복원 (Unsplit)

분리된 차트를 원래대로 복원하려면 원본 렌더 함수를 다시 호출합니다:

```typescript
import { renderSimpleBarChart } from 'src/rendering/bar/simpleBarRenderer'
import { clearSimpleBarSplitDomains } from 'src/rendering/bar/simpleBarRenderer'

// 1. 분리 상태 초기화
clearSimpleBarSplitDomains(container)

// 2. 원본 차트 다시 렌더링
await renderSimpleBarChart(container, spec)
```

### 16-9. 실전 예시

```typescript
// 연도별 bar 차트를 코로나 이전/이후로 분리
const spec: SimpleBarSpec = { /* ... */ }

// 분리
await renderSplitSimpleBarChart(container, spec, {
  groups: {
    'pre-covid':  ['2016', '2017', '2018', '2019'],
    'post-covid': ['2020', '2021', '2022', '2023'],
  },
  orientation: 'horizontal',
})

// 분리 후: post-covid 그룹의 2020년 bar만 강조
const postCovidGroup = d3
  .select(container)
  .select('[data-chart-id="post-covid"]')

const bar2020 = postCovidGroup.select('[data-target="2020"]')
await changeBarColor(bar2020, '#ef4444')

// 복원
clearSimpleBarSplitDomains(container)
await renderSimpleBarChart(container, spec)
```

---

## 정리

| 작업 | 함수 | 파일 |
|------|------|------|
| 차트 컨텍스트 | `getChartContext(container)` | `d3Helpers.ts` |
| 전체 마크 선택 | `svg.selectAll('rect, circle, path')` | D3 기본 |
| data-* 키로 필터 | `.filter('[data-target="2021"]')` | D3 기본 |
| 색상 변경 | `changeBarColor(selection, color)` | `d3Helpers.ts` |
| 페이드 | `fadeElements(selection, opacity)` | `d3Helpers.ts` |
| 나머지 흐리게 | `dimOthers(all, selected)` | `d3Helpers.ts` |
| 수평선 | `drawHorizontalGuideline(...)` | `d3Helpers.ts` |
| 수직선 | `drawVerticalGuideline(...)` | `d3Helpers.ts` |
| 대각선 | `drawRetrieveLine(...)` | `d3Helpers.ts` |
| 평균선 | `drawAggregateResult(...)` | `d3Helpers.ts` |
| 비교 브리지 | `drawDiffBridge(...)` | `d3Helpers.ts` |
| 텍스트 | `addValueLabel(svg, x, y, text, color)` | `d3Helpers.ts` |
| 텍스트 배경 | `addLabelBackground(svg, x, y, w, h)` | `d3Helpers.ts` |
| 병렬 실행 | `parallel(...animations)` | `d3Helpers.ts` |
| 순차 실행 | `sequence(...animations)` | `d3Helpers.ts` |
| 대기 | `delay(ms)` | `d3Helpers.ts` |
| Annotation 제거 | `clearAnnotations(svg)` | `d3Helpers.ts` |
| 차트 분리 (Bar) | `renderSplitSimpleBarChart(container, spec, split)` | `simpleBarRenderer.ts` |
| 차트 분리 (Line) | `renderSplitSimpleLineChart(container, spec, split)` | `simpleLineRenderer.ts` |
| 분리 도메인 조회 | `getSimpleBarSplitDomain(container, chartId)` | `simpleBarRenderer.ts` |
| 분리 상태 초기화 | `clearSimpleBarSplitDomains(container)` | `simpleBarRenderer.ts` |
