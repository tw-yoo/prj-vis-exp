# Claude Code Notes

이 문서는 repo 루트에서 Claude Code가 작업할 때 참고하는 메모입니다. `nlp_server/`는 별도 Python backend이므로, 그 디렉터리를 수정할 때는 `nlp_server/CLAUDE.md`를 따릅니다.

이 루트 앱은 Vega-Lite spec과 operation spec을 바탕으로 차트 annotation, transformation, explanation, interaction workflow를 실험하는 연구용 VIS/HCI prototype입니다. 상용 제품 기능 확장보다, `src/` 엔진과 `web/` 실험 UI 사이의 경계를 유지하면서 현재 operation/rendering 흐름을 안정적으로 다루는 것이 우선입니다.

---

## Active Work: `operation-new` branch

현재 작업은 **simple-line chart의 rendering + operation/annotation 레이어를 처음부터 다시 구현**하는 것입니다. 기존 `src/rendering/`과 `src/operation-next/`는 그대로 유지하고, 새 폴더 `src/rendering-new/`와 `src/operation-new/`에 **simple-line 전용 새 구현**을 만들어 병행 운영합니다. 다른 chart type (multipleLine, simpleBar, groupedBar, stackedBar)은 기존 경로 그대로 유지됩니다.

### 핵심 원칙 (반드시 지킬 것)

1. **단일 차트(no-split) simple-line 시나리오에서 차트 축이 절대 깜빡이거나 튀지 않을 것.**
2. **모든 annotation 추가/제거는 자연스러운 transition으로 진행** (fade-in/out 등; 갑작스러운 pop/churn 금지).
3. **Spec이 같으면 SVG는 재빌드되지 않을 것** (idempotent rendering — 같은 spec에 대한 호출은 no-op).
4. **Annotation은 별도 layer 안에서만 mutation, chart skeleton(axes, marks, paths)은 안 건드림.**
5. **Substep 사이에 ChainState가 자연스럽게 이어질 것** — 한 op의 결과가 다음 op의 input 데이터/state로 명시적으로 전달돼야 함.
6. **차트 디자인/annotation rule (색, 라벨 위치, transition duration, salience opacity 등)은 변경 없음** — 시각적 출력은 기존 `src/rendering/line/simpleLineRenderer.ts` + `src/operation-next/runners/simpleLine.ts`와 동일.
7. **`web/workbench/pages/ChartWorkbenchPage.tsx`는 변경 없이 그대로 작동해야 함** — 외부 entry-point 시그니처를 절대 깨면 안 됨.
8. **모든 op과 조합에 대해 일반화돼야 함** — 검증 시나리오는 한 가지 *케이스*일 뿐이고, 6개 op (`retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `lagDiff`)의 **임의 순서, 임의 조합, 임의 반복**에서 모두 자연스럽게 작동해야 한다. 특정 시나리오(filter→average, ops1-4 등)에만 맞춘 특수 코드를 만들면 안 됨. 새 코드의 어떤 분기도 "이 op 다음에 저 op이 올 때"를 가정하지 않고, op의 종류와 chain state 만으로 결정되어야 한다.

### Workbench → Engine entry-point trace (Render Chart / Run Ops 흐름)

새 구현 설계 시 새 세션이 따라가야 할 호출 사슬:

**"Render Chart" 버튼 클릭 흐름:**
1. `web/workbench/pages/ChartWorkbenchPage.tsx` → `handleRenderChart()` (사용자 액션 핸들러)
2. 같은 파일의 로컬 `renderChart(specString)` 함수 호출
3. → `renderSpecIfNeeded(host, spec, options)` 같은 wrapper 호출
4. → **engine entry**: `src/rendering/renderChart.ts`의 `renderChart(host, spec)` (chart type dispatcher)
5. → `src/rendering/line/simpleLineRenderer.ts`의 `renderSimpleLineChart(host, lineSpec)` (simple-line 전용 빌드)

**"Run Ops" / visual playback 흐름:**
1. `web/workbench/pages/ChartWorkbenchPage.tsx` → `runVisualSentenceGroup(groupIndex)` 또는 `runOpsGroup(groupIndex)`
2. → `executeOpsArray(opsArray, options)` (workbench-local; runtimeScope, initialChainState 등 설정)
3. → **engine entry**: `src/operation-next/runChartOps.ts`의 `runChartOps(container, spec, opsSpec, options)` (chart type dispatcher → runner 선택)
4. → `src/operation-next/runners/simpleLine.ts`의 `runSimpleLineOperations(run)` (simple-line 전용 runner)
5. runner 내부에서 각 op마다 applier 호출 → `src/operation-next/appliers/simpleLine/`의 6개 applier (현재 패턴은 wrapper로 `run*Operation` 함수 호출)
6. 각 op의 annotation 그리기는 `src/operation-next/primitives/{drawReferenceLine,drawDifferenceArrow,markSalience}.ts` 같은 primitive 호출

**Visual playback substep loop (filter→avg 같은 다단계 시나리오):**
1. `runVisualSentenceGroup` → `src/api/visual-execution-player.ts`의 `runVisualSentenceStep(args)` 호출
2. substep loop (filter substep, average substep, diff substep 등 각각) → 각 substep handler가 `args.runOps(ops, options)` 호출
3. workbench의 `runOps` callback (line ~3540) → `executeOpsArray(ops, runOptions)` → `runChartOps` → simple-line runner. 각 substep이 한 번씩 runner를 호출하므로 substep 사이 chain은 명시적 propagation 필요.

**새 구현의 dispatcher 분기 위치:**
- `src/rendering/renderChart.ts` 안에서 chart type이 simple-line이면 `src/rendering-new/`로, 아니면 기존 코드.
- `src/operation-next/runChartOps.ts` 안에서 chart type이 simple-line이면 `src/operation-new/`로, 아니면 기존 runner.

**필수로 읽고 가야 할 도메인/state 정의:**
- `src/domain/chart.ts` — `ChartSpec`, `ChartType`, `ChartTypeValue`
- `src/domain/operation/types.ts` — `OperationSpec`, `OperationOp`, `DatumValue`
- `src/operation-next/chainState.ts` — `ChainState` (workingData, salienceMap, scaleState, filterContext, annotationRecords)
- `src/operation-next/executionState.ts` — `SerializableChainState`, `OperationNextRunOutcome`, `serializeChainState` / `restoreChainState`
- `src/operation-next/applier.ts` — `OperationApplier` interface + registry (현재 패턴)

### 코딩 스타일 (반드시 지킬 것)

D3 시각화 코드는 method chaining이 본래의 idiom이므로, 그 흐름을 깨는 과도한 추상화는 금지.

1. **D3 코드는 chained 형태 그대로 사용** — `selection.append().attr().attr().transition().duration().attr().end()` 식의 연쇄 표현을 그대로 쓰고, 각 attr마다 wrapper 함수를 만들지 않는다.
2. **함수 호출 chain depth는 얕게 유지** — A→B→C→D 식으로 같은 일을 여러 layer에 분산하지 않는다. 같은 책임(skeleton 빌드, annotation 그리기 등)은 가능한 한 같은 함수 안에서 끝낸다.
3. **불필요한 helper 함수 생성 금지** — `setMarginLeft()`/`setMarginTop()`/`setPlotWidth()` 같은 micro setter 대신 `setLayout({ marginLeft, marginTop, plotWidth })`처럼 응집된 인터페이스 한 번. 한 곳에서만 쓰이는 1줄짜리 wrapper는 쓰는 곳에 inline.
4. **파일 분할은 책임 단위로만** — 한 chart instance, 한 op applier가 한 파일. 더 잘게 쪼개지 않는다. annotation primitive(drawReferenceLine 등)는 여러 op에서 공유될 때만 별도 파일.
5. **간접 호출 trace를 디버그 시 빠르게 따라갈 수 있게** — 한 op의 흐름(read state → compute → mutate DOM → return next state)이 한 화면에 보이는 것이 이상적. 추상화는 *반복되는 코드*를 줄이는 용도일 때만 정당.

이 원칙은 기존 4.X 시리즈에서 lifecycle 함수가 너무 많이 갈라져서 (annotateFilter → applyFilterFocusTransform → inferYForValue → readYScaleFromSvg → ...) 디버깅이 어려웠던 점에 대한 반작용. 새 구현은 함수 호출 두세 단계 안에 모든 mutation이 보이는 구조를 목표로 한다.

### 외부 contract (반드시 유지)

- `renderChart(host: HTMLElement, spec: ChartSpec)` 시그니처 — `src/rendering/renderChart.ts` 그대로.
- `runChartOps(container, spec, opsSpec, options)` 시그니처 — `src/operation-next/runChartOps.ts` 그대로.
- `OperationNextRunOutcome` 반환 형식 (`{ result, continuation, runtimeSnapshot }`) — 그대로.
- workbench가 의존하는 SVG `data-*` 속성 (`data-render-epoch`, `data-m-left`, `data-plot-w`, `data-plot-h`, `data-y-field` 등) — 그대로.

### 폴더 배치

- **`src/rendering-new/`** — simple-line의 새 rendering layer.
  - `ChartInstance` abstraction을 중심으로 구성.
  - simple-line만 처음부터 stateful instance 모델로 빌드.
- **`src/operation-new/`** — simple-line의 새 operation + annotation layer.
  - 각 op (retrieveValue, filter, diff, average, findExtremum, lagDiff) 6종을 `OperationApplier` 패턴으로 구현.
  - annotation primitive (drawReferenceLine, drawDifferenceArrow 등)은 ChartInstance API와 함께 사용.
- **Dispatcher 변경**:
  - `src/rendering/renderChart.ts`: simple-line이면 `src/rendering-new/`로 라우팅, 그 외 chart type은 기존 코드 그대로 호출.
  - `src/operation-next/runChartOps.ts`: simple-line이면 `src/operation-new/`로 라우팅, 그 외는 기존 runner 호출.

### 비범위

- multipleLine, simpleBar, groupedBar, stackedBar — 기존 경로 그대로 유지. 회귀 없을 것.
- split layout (`surfaceManager`의 다중 surface 모드) — 기존 경로 그대로.
- Vega-Lite spec 형식 / `OperationSpec` 형식 — 변경 없음.
- workbench / specTest / demo / survey / data 페이지 — 변경 없음.
- 새 e2e 테스트 추가 — 기존 e2e 통과만 보장.

### 검증

아래 시나리오는 **하나의 검증 케이스**일 뿐이고, 구현은 이 시나리오 외에도 6개 op의 임의 조합/순서에서 모두 작동해야 함을 다시 강조한다 (원칙 #8).

- **1차 시각 검증 (한 가지 표본 시나리오)**: workbench에서 `avwb8xstxx1lmfpk` 같은 simple-line case 수동 실행:
  - 첫 단계 = average → 원본 데이터 평균이 ref line으로 표시.
  - 두 번째 단계 = filter + average → filter 후 axis가 매끄럽게 rescale; average는 filtered subset의 평균.
  - 세 번째 단계 = 다른 filter + average → 또 다른 axis rescale; 또 다른 average 값.
  - 네 번째 단계 = diff (앞선 average 결과 둘을 참조) → 실제 차이가 vertical arrow로 표시.
  - 전 과정에서 **차트 깜빡임 zero**, annotation transition 자연스러움.
- **2차 일반화 검증** (다른 simple-line e2e 케이스들): `tests/e2e/workbench-test-cases-validation.spec.ts`의 simple-line 케이스 전수 — `retrieveValue`만 있는 케이스, `findExtremum`만 있는 케이스, `lagDiff` → `findExtremum` chain, `filter` → `diff` 등 다른 op 조합도 모두 자연스럽게 작동해야 함.
- **e2e 회귀 검증**: `tests/e2e/workbench-test-cases-validation.spec.ts`의 10개 케이스 통과 — 특히 multipleLine/bar 케이스에서 동작 변화 없음을 확인.

### 참고: 이전 시도와 한계

이전 4.X 시리즈 패치들 (`src/operation-next/` 위에 ChartInstance 얹기, ChainState ref via regex, fade-out entry-point 등)은 두 모순된 가정을 끝까지 해소하지 못했음:
- Renderer 레이어 가정: "매 spec마다 SVG를 통째 다시 그린다"
- Operation 레이어 가정: "annotation은 자기 CSS class만 알고, 그 안에서만 정리한다"

이 둘 사이를 강제로 메우려는 패치 (`raise()` churn, scope regex chain, persistent anchor revert 등)는 결국 깜빡임과 chain 단절을 완전히 잡지 못했음. **새 구현은 처음부터 stateful ChartInstance + 명시적 annotation lifecycle + 명시적 substep ChainState 전파로 설계.**

---

## Scope (변경 없음)

- 루트 프로젝트는 Vite + React + TypeScript 기반입니다.
- `src/`는 엔진/application/domain/rendering 코드를 담습니다.
- `web/`는 `workbench`, `specTest`, `demo`, `survey`, `data` 페이지 진입점을 담습니다.
- `data/expert/`는 authored expert plans / examples를 담습니다.
- `tests/e2e/`는 Playwright 테스트 모음입니다.
- `scripts/`는 build/test 전에 실행되는 guard script 모음입니다.
- `web/`는 engine 코드를 직접 참조하지 말고 가능한 `src/api/*`를 통해 접근합니다.

## Verified Commands

- `npm run dev`
- `npm run dev:5174`
- `npm run dev:5713`
- `npm run build`
- `npm run lint`
- `npm run test:e2e`
- `npm run test:e2e:headed`
- `npm run docs:draw`

## Workflow Notes

- 변경 검증은 가능하면 관련 범위만 좁혀서 수행합니다. rendering/ops 변경이면 우선 관련 `tests/e2e/*.spec.ts`를 확인합니다.
- `npm run build`는 먼저 `check:draw-support-sync`, `check:authoring-style`, `check:ide-hints`, `check:src-boundary`, `check:arch-boundary`를 통과해야 합니다.
- `npm run test:e2e`와 `npm run test:e2e:headed`도 동일한 사전 check를 먼저 실행합니다.
- `playwright.config.ts` 기준 e2e는 `tests/e2e`를 사용하고, `npm run dev -- --host 127.0.0.1 --port 4173`를 web server로 사용합니다.
- 새 폴더 `src/rendering-new/`와 `src/operation-new/`도 lint/build/arch-boundary check 대상. `web/`에서 직접 import 금지 (필요 시 `src/api/*` 경유).
- TODO: 루트 기준 unit test 진입점이 정리되면 여기에 추가합니다.
