/**
 * Command API surface for IntelliSense in the experiment collection editor.
 * These declarations are loaded into Monaco via addExtraLib at runtime.
 *
 * Tip: add new actions here to expose autocomplete/hover/signature help.
 * 각 함수의 파라미터 설명/JSDoc을 여기서 관리하세요.
 */

// Animation helpers (bars and general)
/**
 * 선택된 요소를 주어진 opacity로 페이드 처리합니다.
 * @param selection D3 selection (rect 등)
 * @param targetOpacity 0~1 사이 불투명도
 * @param duration 애니메이션 시간(ms)
 */
declare function fadeElements(selection: any, targetOpacity: number, duration?: number): Promise<void>;
/**
 * 막대 색상을 변경합니다. stroke는 변경하지 않습니다.
 * @param selection D3 selection
 * @param color CSS color
 * @param duration 애니메이션 시간(ms)
 */
declare function changeBarColor(selection: any, color: string, duration?: number): Promise<void>;
/**
 * 선택되지 않은 요소를 dim 처리합니다.
 */
declare function dimOthers(allElements: any, selectedElements: any, opacity?: number): Promise<void>;

/**
 * Draw a horizontal guideline at the given y-position.
 * @example drawHorizontalGuideline(svg, 120, '#ff5722', {left:20, top:10}, 480);
 */
declare function drawHorizontalGuideline(svg: any, yPosition: number, color: string, margins: { left: number; top: number; }, plotWidth: number, style?: 'dashed' | 'solid'): Promise<void>;

/**
 * Draw a vertical guideline at the given x-position.
 * @example drawVerticalGuideline(svg, 240, 0, 360, '#4caf50', {left:20, top:10});
 */
declare function drawVerticalGuideline(svg: any, xPosition: number, yStart: number, yEnd: number, color: string, margins: { left: number; top: number; }, style?: 'dashed' | 'solid'): Promise<void>;

/**
 * Add a value label with fade-in effect.
 * @example addValueLabel(svg, 220, 80, '42', '#111');
 */
/**
 * 값 레이블을 추가하고 페이드 인합니다.
 * @param svg SVG selection
 * @param x 좌표
 * @param y 좌표
 * @param text 표시할 값
 * @param color 텍스트 색상
 */
declare function addValueLabel(svg: any, x: number, y: number, text: string | number, color: string, options?: any): Promise<void>;

declare function addLabelBackground(svg: any, x: number, y: number, width: number, height: number): Promise<void>;
declare function drawAggregateResult(svg: any, margins: any, plot: any, yPos: number, color: string, labelText: string): Promise<void>;

// Operation templates (bar patterns)
declare function highlightAndAnnotatePattern(options: {
  allElements: any;
  targetElements: any;
  color: string;
  svg: any;
  margins: { left: number; top: number; };
  plot: { w: number; h: number; };
  orientation?: 'vertical' | 'horizontal';
  getValueFn?: (node: any) => number | null;
  getYPositionFn?: (node: any) => number | null;
  getCenterFn?: (node: any) => { x: number; y: number; };
  useDim?: boolean;
}): Promise<void>;

declare function comparePattern(options: {
  allElements: any;
  elementA: any;
  elementB: any;
  colorA: string;
  colorB: string;
  svg: any;
  margins: { left: number; top: number; };
  plot: { w: number; h: number; };
  orientation?: 'vertical' | 'horizontal';
  getValueFn?: (node: any) => number | null;
  getYPositionFn?: (node: any) => number | null;
  getCenterFn?: (node: any) => { x: number; y: number; };
  useDim?: boolean;
}): Promise<void>;

declare function filterPattern(options: {
  allBars: any[];
  keptTargets: Set<string>;
  categoryKey: string;
  filteredData: any[];
  svg: any;
  g: any;
  margins: any;
  plot: any;
  showThreshold?: { yPos: number; color: string } | null;
  onRepositioned?: ((positions: any[]) => void) | null;
}): Promise<void>;

// Line render helpers
/**
 * Draw a crosshair at (cx, cy) spanning the plot box.
 * @example drawCrosshair(g, 120, 80, {w:480,h:320}, '#3b82f6');
 */
declare function drawCrosshair(g: any, cx: number, cy: number, plot: { w: number; h: number; }, color: string, duration?: number): Promise<void>;

/**
 * Highlight an existing point by enlarging it.
 * @example highlightPoint(points.filter(p=>...), '#ef4444', {radius:10});
 */
declare function highlightPoint(selection: any, color: string, options?: { radius?: number; stroke?: string; strokeWidth?: number; duration?: number; delay?: number }): Promise<void>;

/**
 * Create a transient point marker at (cx, cy).
 * @example createGhostPoint(g, 200, 120, '#10b981');
 */
declare function createGhostPoint(g: any, cx: number, cy: number, color: string, options?: { radius?: number; stroke?: string; strokeWidth?: number; duration?: number; delay?: number }): Promise<void>;

/**
 * Add a value label near (cx, cy) for line charts.
 * @example lineAddValueLabel(g, 210, 90, 'Max: 42', '#111');
 */
/**
 * 라인 차트용 값 레이블 추가(페이드 인).
 */
declare function lineAddValueLabel(g: any, cx: number, cy: number, text: string | number, color: string, options?: any): Promise<void>;

// Common utilities (exposed for completeness)
declare function getChartContext(chartId: string, opts?: any): any;
declare function makeGetSvgAndSetup(opts?: any): (chartId: string) => any;
declare function getMarkValue(node: any): number | null;
declare function getDatumKey(datum: any, fallback?: string): string;
declare function getMarkKey(node: any, fallback?: string): string;
declare function selectMarks(g: any, selector?: string): any;
declare function selectByKey(g: any, key: string, selector?: string): any;
declare function selectExcept(g: any, keys: string[], selector?: string): any;
declare function clearAnnotations(svg: any, extraSelectors?: string[]): void;
declare function delay(ms: number): Promise<void>;
declare function signalOpDone(chartId: string, opName: string): void;
declare function emitOpDone(svg: any, chartId: string, opName: string, detail?: any): void;
