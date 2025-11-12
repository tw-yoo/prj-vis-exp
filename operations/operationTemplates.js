/**
 * Operation Animation Templates
 * 심플바 기존 코드 패턴 기반으로 수정
 */

import * as Helpers from './animationHelpers.js';
import { DURATIONS, OPACITIES } from './animationConfig.js';

// ============= 3-STAGE SEQUENCE =============

/**
 * 표준 3단계 시퀀스 템플릿 (원본 유지)
 */
export async function threeStageSequence({
  preparation,
  execution,
  result,
  delays = { afterPrep: 0, afterExec: 0 }
}) {
  // Stage 1: Preparation
  if (preparation) {
    await preparation();
  }
  if (delays.afterPrep > 0) {
    await Helpers.delay(delays.afterPrep);
  }
  
  // Stage 2: Execution
  if (execution) {
    await execution();
  }
  if (delays.afterExec > 0) {
    await Helpers.delay(delays.afterExec);
  }
  
  // Stage 3: Result
  if (result) {
    await result();
  }
}

// ============= COMMON OPERATION PATTERNS =============

/**
 * retrieveValue, findExtremum 공통 패턴
 * ❌ 수정: dim 제거, changeBarColor 사용
 */
export async function highlightAndAnnotatePattern({
  allElements,
  targetElements,
  color,
  svg,
  margins,
  plot,
  orientation,
  getValueFn,
  getYPositionFn,
  getCenterFn,
  useDim = false  // 🔥 기본값 false (심플바는 dim 안함)
}) {
  return threeStageSequence({
    preparation: async () => {
      if (useDim) {
        await Helpers.dimOthers(allElements, targetElements);
      }
    },
    
    execution: async () => {
      // 🔥 수정: changeBarColor 사용 (fill만 변경)
      await Helpers.changeBarColor(targetElements, color, DURATIONS.HIGHLIGHT);
    },
    
    result: async () => {
      const tasks = [];
      
      targetElements.each(function() {
        const value = getValueFn(this);
        const yPos = getYPositionFn(this);
        
        // 가이드라인 그리기
        if (orientation === 'vertical') {
          tasks.push(
            Helpers.drawHorizontalGuideline(svg, yPos, color, margins, plot.w)
          );
        } else {
          tasks.push(
            Helpers.drawVerticalGuideline(svg, yPos, 0, plot.h, color, margins)
          );
        }
        
        // 값 레이블 추가 (getCenter 기준)
        const { x, y } = getCenterFn(this);
        tasks.push(
          Helpers.addValueLabel(svg, x, y, value, color)
        );
      });
      
      await Promise.all(tasks);
    }
  });
}

/**
 * compare 공통 패턴
 * ❌ 수정: dim 제거, changeBarColor 사용
 */
export async function comparePattern({
  allElements,
  elementA,
  elementB,
  colorA,
  colorB,
  svg,
  margins,
  plot,
  orientation,
  getValueFn,
  getYPositionFn,
  getCenterFn,
  useDim = false
}) {
  return threeStageSequence({
    preparation: async () => {
      if (useDim) {
        const selected = d3.selectAll([elementA.node(), elementB.node()]);
        await Helpers.dimOthers(allElements, selected);
      }
    },
    
    execution: async () => {
      // 🔥 수정: changeBarColor 사용
      await Helpers.parallel(
        Helpers.changeBarColor(elementA, colorA, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(elementB, colorB, DURATIONS.HIGHLIGHT)
      );
    },
    
    result: async () => {
      const tasks = [];
      
      // A 가이드라인 + 레이블
      const yPosA = getYPositionFn(elementA.node());
      if (orientation === 'vertical') {
        tasks.push(Helpers.drawHorizontalGuideline(svg, yPosA, colorA, margins, plot.w));
      }
      
      const centerA = getCenterFn(elementA.node());
      tasks.push(Helpers.addValueLabel(svg, centerA.x, centerA.y, getValueFn(elementA.node()), colorA));
      
      // B 가이드라인 + 레이블
      const yPosB = getYPositionFn(elementB.node());
      if (orientation === 'vertical') {
        tasks.push(Helpers.drawHorizontalGuideline(svg, yPosB, colorB, margins, plot.w));
      }
      
      const centerB = getCenterFn(elementB.node());
      tasks.push(Helpers.addValueLabel(svg, centerB.x, centerB.y, getValueFn(elementB.node()), colorB));
      
      await Promise.all(tasks);
    }
  });
}

/**
 * filter 패턴
 * ✅ 심플바 기존 로직 그대로
 */
export async function filterPattern({
  allBars,
  keptTargets,
  categoryKey,
  filteredData,
  svg,
  g,
  margins,
  plot,
  showThreshold = null,  // { yPos, color }
  onRepositioned = null
}) {
  // Stage 1: 임계값 표시 (선택적)
  if (showThreshold) {
    const { yPos, color } = showThreshold;
    await Helpers.drawHorizontalGuideline(svg, yPos, color, margins, plot.w);
  }
  
  // Stage 2: dim 처리
  const barsToDim = allBars.filter(d => {
    if (!d) return false;
    return !keptTargets.has(String(d[categoryKey]));
  });
  
  await Helpers.fadeElements(barsToDim, OPACITIES.DIM, DURATIONS.DIM);
  await Helpers.delay(DURATIONS.FILTER_DELAY);
  
  // Stage 3: 데이터 바인딩 & 재배치
  const plainRows = filteredData.map(d => ({ 
    [categoryKey]: d.target, 
    value: d.value, 
    group: d.group 
  }));
  
  const filteredBars = allBars.data(plainRows, d => String(d[categoryKey]));
  
  const xScaleFiltered = d3.scaleBand()
    .domain(filteredData.map(d => d.target))
    .range([0, plot.w])
    .padding(0.2);
  
  await Promise.all([
    filteredBars.transition().duration(DURATIONS.REPOSITION)
      .attr('x', d => xScaleFiltered(d[categoryKey]))
      .attr('width', xScaleFiltered.bandwidth())
      .end(),
    
    filteredBars.exit().transition().duration(DURATIONS.REMOVE)
      .attr('opacity', 0)
      .remove()
      .end(),
    
    g.select('.x-axis').transition().duration(DURATIONS.REPOSITION)
      .call(d3.axisBottom(xScaleFiltered))
      .end()
  ]);
  
  // Stage 4: 콜백 실행
  if (onRepositioned) {
    await onRepositioned(filteredBars);
  }
  
  return filteredBars;
}

// ============= 순차 카운팅 패턴 =============

/**
 * count, nth 공통 패턴
 * ✅ 심플바 기존 로직 그대로
 */
export async function sequentialCountPattern({
  allElements,
  maxCount,
  intervalMs = 60,
  highlightColor,
  svg,
  margins,
  orientation,
  getCenterFn,
  finalSelectionIndices = []
}) {
  // Stage 1: dim all
  await Helpers.fadeElements(allElements, OPACITIES.DIM, 250);
  
  const nodes = allElements.nodes();
  const countedItems = [];
  
  // Stage 2: 순차 카운팅
  for (let i = 0; i < Math.min(maxCount, nodes.length); i++) {
    const node = nodes[i];
    const sel = d3.select(node);
    
    // 🔥 하이라이트: fill + opacity 변경
    await Helpers.changeBarColor(sel, highlightColor, DURATIONS.NTH_HIGHLIGHT);
    await Helpers.fadeElements(sel, OPACITIES.FULL, DURATIONS.NTH_HIGHLIGHT);
    
    // 번호 레이블
    const { x, y } = getCenterFn(node);
    const label = await Helpers.addValueLabel(
      svg, x, y,
      String(i + 1),
      highlightColor,
      { className: 'annotation count-label', fontSize: 14 }
    );
    
    countedItems.push({ 
      index: i + 1, 
      label: d3.select(label.node ? label.node() : label),  // label promise 처리
      selection: sel, 
      node 
    });
    
    await Helpers.delay(intervalMs);
  }
  
  // Stage 3: 정리
  if (finalSelectionIndices.length === 0) {
    // count: 모든 레이블 제거
    const removeTasks = countedItems.map(item => 
      item.label.transition().duration(300).attr('opacity', 0).remove().end()
    );
    await Promise.all(removeTasks);
  } else {
    // nth: 선택되지 않은 것만 dim
    const selectedSet = new Set(finalSelectionIndices);
    const dimTasks = [];
    const removeTasks = [];
    
    countedItems.forEach(({ index, label, selection }) => {
      if (!selectedSet.has(index)) {
        dimTasks.push(Helpers.fadeElements(selection, OPACITIES.DIM, 300));
        removeTasks.push(label.transition().duration(300).attr('opacity', 0).remove().end());
      }
    });
    
    await Promise.all([...dimTasks, ...removeTasks]);
  }
  
  return countedItems;
}

// ============= 집계 결과 표시 패턴 =============

/**
 * sum, average 공통 패턴
 * ✅ 심플바 기존 로직 그대로
 */
export async function aggregateResultPattern({
  svg,
  margins,
  plot,
  orientation,
  value,
  yScale,
  color,
  labelText,
  lineStyle = 'dashed'
}) {
  const isVertical = orientation === 'vertical';
  
  if (isVertical) {
    const yPos = yScale(value);
    
    // 🔥 수평선: await 없이 직접 그리기 (기존 코드 방식)
    const line = svg.append('line')
      .attr('class', 'annotation value-line')
      .attr('x1', margins.left)
      .attr('y1', margins.top + yPos)
      .attr('x2', margins.left + plot.w)
      .attr('y2', margins.top + yPos)
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', lineStyle === 'dashed' ? '5 5' : 'none');
    
    // 레이블
    const centerX = margins.left + plot.w / 2;
    const centerY = margins.top + yPos - 10;
    
    svg.append('text')
      .attr('class', 'annotation value-tag')
      .attr('x', centerX)
      .attr('y', centerY)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .attr('fill', color)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .text(labelText)
      .attr('opacity', 0)
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .attr('opacity', 1);
      
  } else {
    // horizontal (필요시 구현)
    const xPos = margins.left + value;  // xScale 적용 필요
    
    const line = svg.append('line')
      .attr('class', 'annotation avg-line')
      .attr('x1', xPos)
      .attr('x2', xPos)
      .attr('y1', margins.top)
      .attr('y2', margins.top + plot.h)
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5 5');
    
    svg.append('text')
      .attr('class', 'annotation avg-label')
      .attr('x', xPos)
      .attr('y', margins.top + plot.h / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .attr('fill', color)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .text(labelText)
      .attr('opacity', 0)
      .transition()
      .duration(DURATIONS.LABEL_FADE_IN)
      .attr('opacity', 1);
  }
}

// ============= 재배치 패턴 =============

/**
 * sort, filter 후 재정렬
 * ✅ 심플바 기존 로직 그대로
 */
export async function repositionPattern({
  elements,
  newXScale,
  orientation,
  g,
  duration = DURATIONS.REPOSITION
}) {
  const isVertical = orientation === 'vertical';
  
  if (isVertical) {
    return Promise.all([
      elements.transition()
        .duration(duration)
        .attr('x', function() {
          const key = d3.select(this).attr('data-id') || d3.select(this).attr('data-key');
          return newXScale(key);
        })
        .attr('width', newXScale.bandwidth())
        .end(),
      
      g.select('.x-axis')
        .transition()
        .duration(duration)
        .call(d3.axisBottom(newXScale))
        .end()
    ]);
  } else {
    // horizontal (필요시 구현)
    const newYScale = newXScale;  // 파라미터명은 newXScale이지만 horizontal에서는 yScale
    return Promise.all([
      elements.transition()
        .duration(duration)
        .attr('y', function() {
          const key = d3.select(this).attr('data-id') || d3.select(this).attr('data-key');
          return newYScale(key);
        })
        .attr('height', newYScale.bandwidth())
        .end(),
      
      g.select('.y-axis')
        .transition()
        .duration(duration)
        .call(d3.axisLeft(newYScale))
        .end()
    ]);
  }
}

// ============= 범위 브리지 패턴 =============

/**
 * determineRange, diff 브리지
 * ✅ 심플바 기존 로직 그대로
 */
export async function rangeBridgePattern({
  svg,
  margins,
  plot,
  orientation,
  valueA,
  valueB,
  yScale,
  color,
  labelText = null
}) {
  const isVertical = orientation === 'vertical';
  
  if (isVertical) {
    const yPosA = margins.top + yScale(valueA);
    const yPosB = margins.top + yScale(valueB);
    const minY = Math.min(yPosA, yPosB);
    const maxY = Math.max(yPosA, yPosB);
    
    // 오른쪽 끝에 브리지 라인
    const bridgeX = margins.left + plot.w - 8;
    
    const bridge = svg.append('line')
      .attr('class', 'annotation bridge-line')
      .attr('x1', bridgeX)
      .attr('y1', minY)
      .attr('x2', bridgeX)
      .attr('y2', minY)
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5 5');
    
    await bridge.transition()
      .duration(DURATIONS.GUIDELINE_DRAW)
      .attr('y2', maxY)
      .end();
    
    if (labelText) {
      const labelY = (minY + maxY) / 2;
      svg.append('text')
        .attr('class', 'annotation bridge-label')
        .attr('x', bridgeX - 6)
        .attr('y', labelY)
        .attr('text-anchor', 'end')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(labelText)
        .attr('opacity', 0)
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .attr('opacity', 1);
    }
  } else {
    // horizontal (필요시 구현)
    const xPosA = margins.left + valueA;  // xScale 적용 필요
    const xPosB = margins.left + valueB;
    const minX = Math.min(xPosA, xPosB);
    const maxX = Math.max(xPosA, xPosB);
    
    const bridgeY = margins.top + plot.h - 8;
    
    const bridge = svg.append('line')
      .attr('class', 'annotation bridge-line')
      .attr('x1', minX)
      .attr('y1', bridgeY)
      .attr('x2', minX)
      .attr('y2', bridgeY)
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5 5');
    
    await bridge.transition()
      .duration(DURATIONS.GUIDELINE_DRAW)
      .attr('x2', maxX)
      .end();
    
    if (labelText) {
      const labelX = (minX + maxX) / 2;
      svg.append('text')
        .attr('class', 'annotation bridge-label')
        .attr('x', labelX)
        .attr('y', bridgeY + 16)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(labelText)
        .attr('opacity', 0)
        .transition()
        .duration(DURATIONS.LABEL_FADE_IN)
        .attr('opacity', 1);
    }
  }
}