/**
 * Reusable Animation Helpers
 * 심플바 기존 코드 패턴 기반
 */

import { DURATIONS, OPACITIES, STYLES, EASINGS, OFFSETS } from './animationConfig.js';

// ============= CORE ANIMATIONS =============

/**
 * 요소를 특정 opacity로 페이드 (기존 fadeElements 유지)
 */
export async function fadeElements(selection, targetOpacity, duration = DURATIONS.FADE) {
  if (selection.empty()) return Promise.resolve();
  
  return selection
    .transition()
    .duration(duration)
    .ease(EASINGS.SMOOTH)
    .attr('opacity', targetOpacity)
    .end();
}

/**
 * 막대 색상만 변경 (stroke 없음!)
 * 기존: attr("fill", color)
 */
export async function changeBarColor(selection, color, duration = DURATIONS.HIGHLIGHT) {
  if (selection.empty()) return Promise.resolve();
  
  return selection
    .transition()
    .duration(duration)
    .ease(EASINGS.SMOOTH)
    .attr('fill', color)
    .end();
}

/**
 * 선택된 요소 외 나머지 dim 처리
 */
export async function dimOthers(allElements, selectedElements, opacity = OPACITIES.DIM) {
  const selectedNodes = new Set(selectedElements.nodes());
  const others = allElements.filter(function() {
    return !selectedNodes.has(this);
  });
  
  return fadeElements(others, opacity, DURATIONS.DIM);
}

// ============= GUIDELINE DRAWING =============

/**
 * 수평 가이드라인 그리기 (좌→우)
 * 기존 코드와 동일한 방식
 */
export async function drawHorizontalGuideline(svg, yPosition, color, margins, plotWidth, style = 'dashed') {
  const yAbsolute = margins.top + yPosition;
  
  const strokeDasharray = style === 'dashed' ? STYLES.GUIDELINE.strokeDasharray : 'none';
  
  const line = svg.append('line')
    .attr('class', 'annotation guideline')
    .attr('x1', margins.left)
    .attr('y1', yAbsolute)
    .attr('x2', margins.left)  // 시작점
    .attr('y2', yAbsolute)
    .attr('stroke', color)
    .attr('stroke-dasharray', strokeDasharray)
    .attr('stroke-width', STYLES.GUIDELINE.strokeWidth);
  
  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .ease(EASINGS.SMOOTH)
    .attr('x2', margins.left + plotWidth)
    .end();
}

/**
 * 수직 가이드라인 그리기 (하→상)
 */
export async function drawVerticalGuideline(svg, xPosition, yStart, yEnd, color, margins, style = 'dashed') {
  const xAbsolute = margins.left + xPosition;
  const yStartAbsolute = margins.top + yStart;
  const yEndAbsolute = margins.top + yEnd;
  
  const strokeDasharray = style === 'dashed' ? STYLES.GUIDELINE.strokeDasharray : 'none';
  
  const line = svg.append('line')
    .attr('class', 'annotation guideline')
    .attr('x1', xAbsolute)
    .attr('y1', yStartAbsolute)  // 시작점 (하단)
    .attr('x2', xAbsolute)
    .attr('y2', yStartAbsolute)
    .attr('stroke', color)
    .attr('stroke-dasharray', strokeDasharray)
    .attr('stroke-width', STYLES.GUIDELINE.strokeWidth);
  
  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .ease(EASINGS.SMOOTH)
    .attr('y2', yEndAbsolute)
    .end();
}

// ============= LABEL CREATION =============

/**
 * 기본 텍스트 레이블 추가 (페이드인 포함)
 * getCenter 좌표를 그대로 사용
 */
export async function addValueLabel(svg, x, y, text, color, options = {}) {
  const {
    fontSize = STYLES.VALUE_LABEL.fontSize,
    fontWeight = STYLES.VALUE_LABEL.fontWeight,
    textAnchor = STYLES.VALUE_LABEL.textAnchor,
    className = 'annotation'
  } = options;
  
  const label = svg.append('text')
    .attr('class', className)
    .attr('x', x)
    .attr('y', y)
    .attr('text-anchor', textAnchor)
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .attr('fill', color)
    .attr('stroke', STYLES.VALUE_LABEL.stroke)
    .attr('stroke-width', STYLES.VALUE_LABEL.strokeWidth)
    .attr('paint-order', STYLES.VALUE_LABEL.paintOrder)
    .text(text)
    .attr('opacity', 0);
  
  return label
    .transition()
    .duration(DURATIONS.LABEL_FADE_IN)
    .attr('opacity', 1)
    .end();
}

/**
 * 레이블 배경 추가 (nth에서 사용)
 */
export async function addLabelBackground(svg, x, y, width, height) {
  const bg = svg.append('rect')
    .attr('class', 'annotation label-bg')
    .attr('x', x - width / 2)
    .attr('y', y)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', STYLES.LABEL_BACKGROUND.fill)
    .attr('rx', STYLES.LABEL_BACKGROUND.rx)
    .attr('opacity', 0);
  
  return bg
    .transition()
    .duration(DURATIONS.LABEL_FADE_IN)
    .attr('opacity', STYLES.LABEL_BACKGROUND.opacity)
    .end();
}

// ============= AGGREGATE RESULT DISPLAY =============

/**
 * 집계 결과 표시 (sum, average)
 * 기존 코드의 라인 + 레이블 패턴
 */
export async function drawAggregateResult(svg, margins, plot, yPos, color, labelText) {
  const yAbsolute = margins.top + yPos;
  
  // 수평선 그리기
  const line = svg.append('line')
    .attr('class', 'annotation value-line')
    .attr('x1', margins.left)
    .attr('y1', yAbsolute)
    .attr('x2', margins.left + plot.w)
    .attr('y2', yAbsolute)
    .attr('stroke', color)
    .attr('stroke-width', STYLES.THRESHOLD.strokeWidth)
    .attr('stroke-dasharray', STYLES.THRESHOLD.strokeDasharray);
  
  // 레이블 추가
  const centerX = margins.left + plot.w / 2;
  const centerY = yAbsolute + OFFSETS.LABEL_ABOVE_LINE;
  
  return addValueLabel(
    svg, 
    centerX, 
    centerY, 
    labelText, 
    color,
    { 
      fontSize: STYLES.AGGREGATE_LABEL.fontSize,
      fontWeight: STYLES.AGGREGATE_LABEL.fontWeight 
    }
  );
}

// ============= DIFF BRIDGE LINE =============

/**
 * 범위 브리지 라인 (diff에서 사용)
 */
export async function drawDiffBridge(svg, margins, plot, posA, posB, color, labelText) {
  const minY = Math.min(posA, posB);
  const maxY = Math.max(posA, posB);
  const diffX = margins.left + plot.w + OFFSETS.BRIDGE_OFFSET;
  
  // 브리지 라인
  const bridge = svg.append('line')
    .attr('class', 'annotation diff-line')
    .attr('x1', diffX)
    .attr('x2', diffX)
    .attr('y1', minY)
    .attr('y2', minY)
    .attr('stroke', color)
    .attr('stroke-width', STYLES.THRESHOLD.strokeWidth)
    .attr('stroke-dasharray', STYLES.THRESHOLD.strokeDasharray);
  
  await bridge
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .attr('y2', maxY)
    .end();
  
  // 레이블
  const labelY = (minY + maxY) / 2;
  return addValueLabel(
    svg,
    diffX - 6,
    labelY,
    labelText,
    color,
    { textAnchor: 'end' }
  );
}

// ============= RETRIEVE VALUE LINE =============

/**
 * retrieveValue 전용 가이드라인
 * 막대 중앙 → Y축
 */
export async function drawRetrieveLine(svg, startX, startY, endX, endY, color) {
  const line = svg.append('line')
    .attr('class', 'retrieve-line annotation')
    .attr('x1', startX)
    .attr('x2', startX)
    .attr('y1', startY)
    .attr('y2', startY)
    .attr('stroke', color)
    .attr('stroke-width', STYLES.RETRIEVE_LINE.strokeWidth)
    .attr('stroke-dasharray', STYLES.RETRIEVE_LINE.strokeDasharray)
    .attr('opacity', 0);
  
  return line
    .transition()
    .duration(DURATIONS.GUIDELINE_DRAW)
    .attr('x2', endX)
    .attr('opacity', 1)
    .end();
}

// ============= UTILITIES =============

/**
 * 여러 애니메이션을 병렬 실행
 */
export async function parallel(...animations) {
  return Promise.all(animations);
}

/**
 * 여러 애니메이션을 순차 실행
 */
export async function sequence(...animations) {
  for (const anim of animations) {
    if (typeof anim === 'function') {
      await anim();
    } else {
      await anim;
    }
  }
}

/**
 * 지연 헬퍼
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));