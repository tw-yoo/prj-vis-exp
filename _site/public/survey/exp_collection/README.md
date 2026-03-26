# Experiment Collection 명령 에디터 안내

간단히 읽고 바로 쓸 수 있도록 요약했습니다. 에디터는 모나코(Monaco) 기반이며, 자동완성/호버/시그니처 헬프가 동작합니다.

## 입력/동기화
- 화면 하단 입력창이 모나코 에디터로 대체됩니다. 에디터 내용이 곧 textarea(`combined-input`) 값이며, 기존 제출 로직과 호환됩니다.
- 오른쪽 상단 `README 보기` 버튼으로 이 안내를 열고 닫을 수 있습니다.

## 명령 문법 (DSL)
- 병렬: `A(...) + B(...)` (둘을 동시에 실행)
- 순차: `A(...) -> B(...)` (왼쪽 완료 후 오른쪽 실행)
- 혼합: `A(...) + B(...) -> C(...) + D(...)`
- 괄호/문자열/객체 내부의 `+`, `->`는 분리되지 않습니다.
- 잘못된 구문(빈 stage/action 등)은 위치와 함께 오류를 보여줍니다.

실행: `runCommandScript("changeBarColor(bars, '#f00') -> drawHorizontalGuideline(svg, 120, '#f00', margins, plot.w)")`

## 주요 액션(자동완성 대상)
- **animationHelpers**: `fadeElements`, `changeBarColor`, `dimOthers`, `drawHorizontalGuideline`, `drawVerticalGuideline`, `addValueLabel`, `addLabelBackground`, `drawAggregateResult`
- **operationTemplates**: `highlightAndAnnotatePattern`, `comparePattern`, `filterPattern`
- **lineRenderHelpers**: `drawCrosshair`, `highlightPoint`, `createGhostPoint`, `lineAddValueLabel`(alias)
- **common**: `getChartContext`, `makeGetSvgAndSetup`, `getMarkValue`, `selectMarks`, `clearAnnotations`, `delay`, `signalOpDone` 등

## 파라미터 도움말
- `survey/exp_collection/command-api.d.ts`에 JSDoc을 추가하면 호버/시그니처 헬프에 바로 반영됩니다. 새 액션을 노출하려면 이 파일에 선언을 추가하고 `commandEditor.js`의 `actionLibraryPromise`에 실제 함수를 포함하세요.

## 주의
- Monaco 에셋은 CDN(jsdelivr)에서 로드됩니다.
- 실행은 화이트리스트된 함수만 허용합니다. eval 없음.
- 인자 파서는 숫자/불리언/문자열/JSON/전역 식별자(window 범위)만 지원하며, 복잡한 JS 표현식은 허용하지 않습니다.***
