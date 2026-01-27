# TODO
## 1. 각 차트 별 DRAW 함수 구현/업데이트
### 공통 로직: src/renderer/draw/BaseDrawHandler.ts
모든 차트에서 공통으로 쓸 수 있는 text/rect/line/clear/... 같은 기능

### bar 전용 draw: src/renderer/draw/BarDrawHandler.ts

### line 전용 draw: src/renderer/draw/line/SimpleLineDrawHandler.ts

## 2. 각 operation 별 draw 세트(= 자동 시각화) 만들기
#### 차트별 “operation→draw plan” 생성: src/renderer/ops/visual/...

### 그 draw plan을 어떤 op에서 자동 실행할지 연결:
- Simple bar: src/renderer/bar/simpleBarOps.ts의 AUTO_DRAW_PLANS 맵
- 예: OperationOp.FindExtremum에 대해 “최대값 bar highlight + 값 text”를 자동으로 하고 싶으면 여기 추가


## Draw + Operation Best Practices

- Start with shared draw handlers (src/renderer/draw/BaseDrawHandler.ts and its subclasses):
    - Extend or configure the right handler (BarDrawHandler, LineDrawHandler, or the new stacked/grouped/multi-line handlers) so your new drawing uses the centralized annotation math, selection filtering, and annotation-layer insertion.
    - Keep chart-specific logic in the subclass (e.g., override selectElements/allMarks or add helper methods) so the base behavior stays untouched.
- Hook into operations via the ops runner for your chart type (src/renderer/bar/simpleBarOps.ts, stackedBarOps.ts, groupedBarOps.ts, or the line equivalents):
    - Normalize specs with normalizeOpsList and reuse the common helpers (executeDataOperation, STANDARD_DATA_OP_HANDLERS, runGenericDraw) to handle draw/data ops uniformly.
    - For DrawAction work, instantiate the specific draw handler, call handler.run(op), then optionally run runGenericDraw for normalized overlays.
    - Hard-coded selectors/strings should defer to interfaces (SvgElements, SvgAttributes, DataAttributes, SvgSelectors) for maintainability.
- If you need new draw operations (e.g., custom line trace or rect modes):
    - Add the behavior to the handler that matches the marks involved (bar vs. line). Keep drawing helpers near the handler file and use ensureAnnotationLayer/SvgClassNames so everything gets drawn inside the shared annotation layer.
    - Document the new action in the ops guide (guide/operation/OPERATION_1_BAR_SIMPLE.md or the appropriate chart-specific guide) so future contributors know how to wire specs to the handler.
- When writing the operation spec flow:
    - Keep data transformations in src/renderer/ops/common (datum conversion, normalization, runtime result storage) and call those helpers from your chart’s ops file.
    - If you need to emit a draw plan (e.g., for retrieveValue), build it in the ops/visual helpers and execute it with the chart’s draw handler via run*DrawPlan.

By following the draw-handler → ops-runner → guide/documentation chain, every new draw action stays consistent with the rest of the renderer, and contributors can trace behavior by reading BaseDrawHandler → chart-specific handler → ops
file.