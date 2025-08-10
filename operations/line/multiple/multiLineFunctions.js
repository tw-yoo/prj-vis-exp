// multipleLineFunctions.js

import { getSvgAndSetup as getSvgAndSetup, delay } from '../simple/simpleLineFunctions.js';

/**
 * Clears all temporary annotations from the chart.
 */
export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .transform-label").remove();
}

// multipleLineFunctions.js

export async function multipleLineChangeToSimple(chartId, op, currentData, chartData) {
  const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const targetSeriesKey = op.seriesKey;
  if (!targetSeriesKey) {
    console.warn("ChangeToSimple requires a 'seriesKey' in the operation.");
    return currentData;
  }

  const { series, fullXScale, fullYScale, colorScale } = chartData;
  const targetSeries = series.find(s => s.key === targetSeriesKey);

  if (!targetSeries) {
    console.warn(`Series with key '${targetSeriesKey}' not found.`);
    return currentData;
  }

  const filteredData  = targetSeries.values;
  const highlightColor = colorScale(targetSeriesKey);

  // --- 1) 다른 라인은 흐리게, 타깃 라인은 강조 ---
  // 모든 라인에서 메인 플래그 제거
  g.selectAll("path.series-line")
    .classed("main-line", false)
    .attr("data-main", "false");

  const animationPromises = [];

  // 비타깃 라인 페이드
  animationPromises.push(
    g.selectAll("path.series-line")
      .filter(d => d.key !== targetSeriesKey)
      .transition().duration(800)
      .attr("opacity", 0.1)
      .end()
  );

  // 타깃 라인 강조
  const targetLine = g.selectAll("path.series-line")
    .filter(d => d.key === targetSeriesKey);

  animationPromises.push(
    targetLine.transition().duration(800)
      .attr("stroke", highlightColor)
      .attr("stroke-width", 2.5)
      .attr("opacity", 1)
      .end()
  );

  // 범례 숨김(있다면)
  const legend = g.select(".legend");
  if (!legend.empty()) {
    animationPromises.push(
      legend.transition().duration(800).attr("opacity", 0).end()
    );
  }

  await Promise.all(animationPromises);

  // 메인 라인 마킹 (simple-* 함수들이 이것만 사용하도록)
  targetLine
    .classed("main-line", true)
    .attr("data-main", "true")
    .raise();

  // --- 2) simple 라인 유틸용 datapoint 생성 (ISO data-id) ---
  const fmtISO = d3.timeFormat("%Y-%m-%d");

  // 기존 점 정리(안전)
  g.selectAll("circle.datapoint").remove();

  g.selectAll("circle.datapoint")
    .data(filteredData, d => {
      const xv = d[xField];
      return xv instanceof Date ? +xv : String(xv);
    })
    .join("circle")
      .attr("class", "datapoint main-dp")
      .attr("cx", d => fullXScale(d[xField]))
      .attr("cy", d => fullYScale(d[yField]))
      .attr("r", 5)
      .attr("fill", highlightColor)
      .attr("opacity", 0) // 초기에는 투명 (simple-*에서 필요 시 보여줌)
      .attr("data-id", d => {
        const xv = d[xField];
        return xv instanceof Date ? fmtISO(xv) : String(xv);
      })
      .attr("data-value", d => d[yField]);

  // --- 3) 전환 라벨 (지워지기 쉬운 annotation 클래스로) ---
  svg.append("text")
    .attr("class", "transform-label annotation")
    .attr("x", margins.left)
    .attr("y", margins.top - 10)
    .attr("font-size", 14)
    .attr("font-weight", "bold")
    .attr("fill", highlightColor)
    .text(`Displaying Series: ${targetSeriesKey}`);

  // simple-* 함수들이 그대로 사용할 단일 라인의 데이터 반환
  return filteredData;
}

export function multipleLineRetrieveValue(chartId, op) {
  console.log("[multipleLine] retrieveValue called:", op);

  const {
    seriesField,
    seriesKey,
    field: yField,
    keyField,
    key: keyValue
  } = op;

  // 1) SVG 요소 선택 및 노드
  const svgSel  = d3.select(`#${chartId} svg`);
  const svgNode = svgSel.node();
  if (!svgNode) {
    console.warn("[multipleLine] SVG not found");
    return chartId;
  }

  // 2) renderMultipleLineChart에서 붙여둔 스케일 재사용
  const xScale = svgNode.__xScale;
  const yScale = svgNode.__yScale;
  if (!xScale || !yScale) {
    console.warn("[multipleLine] no scales attached to svg");
    return chartId;
  }

  // 3) 이전 강조 요소 제거
  svgSel.selectAll(".retrieval-line, .retrieval-point, .retrieval-label").remove();

  // 4) 해당 시리즈(path)를 찾는다
  let pathSel = svgSel.selectAll("path.series-line");
  if (seriesField && seriesKey) {
    pathSel = pathSel.filter(datum => {
      const firstPt = Array.isArray(datum) ? datum[0] : null;
      return firstPt && firstPt[seriesField] == seriesKey;
    });
  }
  if (pathSel.empty()) {
    console.warn("[multipleLine] no matching series for", seriesField, seriesKey);
    return chartId;
  }

  // 5) 시리즈 데이터 가져오기
  const seriesData = pathSel.datum();
  if (!Array.isArray(seriesData) || !seriesData.length) {
    console.warn("[multipleLine] series has no data");
    return chartId;
  }

  // 6) 찾을 포인트 검색
  const isTemporal = seriesData[0][keyField] instanceof Date;
  const parsedKey = isTemporal
    ? new Date(keyValue).getTime()
    : keyValue;
  const target = seriesData.find(pt => {
    const v = pt[keyField];
    return isTemporal
      ? v.getTime() === parsedKey
      : v == parsedKey;
  });
  if (!target) {
    console.warn("[multipleLine] no point matches", keyValue);
    return chartId;
  }

  // 7) 강조 위치 계산
  const cx       = xScale(target[keyField]);
  const cy       = yScale(target[yField]);
  const baseline = yScale.range()[0]; // y축 하단(차트 바닥)

  // 8) 강조 애니메이션
  const duration = 600;

  // ─ 수직선
  svgSel.append("line")
    .attr("class", "retrieval-line")
    .attr("x1", cx).attr("x2", cx)
    .attr("y1", baseline).attr("y2", baseline)
    .attr("stroke", "#ffa500")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4 2")
    .transition().duration(duration)
    .attr("y2", cy);

  // ─ 원
  svgSel.append("circle")
    .attr("class", "retrieval-point")
    .attr("cx", cx).attr("cy", cy)
    .attr("r", 0)
    .attr("fill", "#ffa500")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .transition().duration(duration)
    .attr("r", 6);

  // ─ 레이블
  svgSel.append("text")
    .attr("class", "retrieval-label")
    .attr("x", cx + 8)
    .attr("y", cy - 8)
    .attr("fill", "#ffa500")
    .attr("font-size", "12px")
    .attr("font-weight", "bold")
    .style("opacity", 0)
    .text(target[yField].toLocaleString())
    .transition().duration(duration)
    .style("opacity", 1);

  return chartId;
}


export function multipleLineFilter(chartId, op) {
  const { seriesField, seriesKey, keyField, min, max } = op;
  const svgSel = d3.select(`#${chartId} svg`);
  const svgNode = svgSel.node();
  if (!svgNode) return chartId;

  const xScale = svgNode.__xScale;
  const yScale = svgNode.__yScale;
  if (!xScale || !yScale) return chartId;

  svgSel.selectAll('.filter-label, .filter-segment').remove();

  const paths = svgSel.selectAll('path.series-line');
  paths.interrupt().transition().duration(600).attr('opacity', 0.1);

  if (seriesField) {
    paths.filter(d => d[0][seriesField] === seriesKey)
         .transition().duration(600).attr('opacity', 1);

    svgSel.append('text')
      .attr('class', 'filter-label')
      .attr('x', 70).attr('y', 30).attr('fill', '#ffa500')
      .attr('opacity', 0)
      .text(`${seriesKey} 시리즈만 표시`)
      .transition().duration(600).attr('opacity', 1);

  } else {
    const tMin = +new Date(min),
          tMax = +new Date(max);

    const sample = paths.data()[0][0];
    const yField = Object.keys(sample).find(
      k => k !== keyField && typeof sample[k] === 'number'
    );

    const lineGen = d3.line()
      .x(d => xScale(d[keyField]))
      .y(d => yScale(d[yField]));

    paths.each(function(d) {
      const seg = d.filter(pt => {
        const t = pt[keyField] instanceof Date
          ? +pt[keyField]
          : +new Date(pt[keyField]);
        return t >= tMin && t <= tMax;
      });
      if (seg.length > 1) {
        const base = d3.select(this);
        svgSel.append('path')
          .datum(seg)
          .attr('class', 'filter-segment')
          .attr('fill', 'none')
          .attr('stroke', base.attr('stroke'))
          .attr('stroke-width', base.attr('stroke-width'))
          .attr('opacity', 0)
          .attr('d', lineGen)
          .transition().duration(600).attr('opacity', 1);
      }
    });

    svgSel.append('text')
      .attr('class', 'filter-label')
      .attr('x', 70).attr('y', 30).attr('fill', '#ffa500')
      .attr('opacity', 0)
      .text(`${new Date(min).getFullYear()}만 표시`)
      .transition().duration(600).attr('opacity', 1);
  }

  return chartId;
}


export function multipleLineFindExtremum(chartId, op) {
  const { seriesField, seriesKey, field: yField, keyField, extremum } = op;
  const svgSel = d3.select(`#${chartId} svg`);
  const svgNode = svgSel.node();
  if (!svgNode) return chartId;
  const xScale = svgNode.__xScale;
  const yScale = svgNode.__yScale;
  if (!xScale || !yScale) return chartId;

  svgSel.selectAll('.extremum-line, .extremum-point, .extremum-label').remove();

  const paths = svgSel.selectAll('path.series-line');
  paths.interrupt().transition().duration(600)
    .attr('opacity', d => seriesField
      ? d[0][seriesField] == seriesKey ? 1 : 0.1
      : 0.1
    );

  const target = seriesField
    ? paths.filter(d => d[0][seriesField] == seriesKey)
    : paths;

  const data = target.datum();
  const cmp = extremum === 'min'
    ? (a, b) => a[yField] < b[yField]
    : (a, b) => a[yField] > b[yField];
  const extPt = data.reduce((acc, pt) =>
    acc == null ? pt : cmp(pt, acc) ? pt : acc
  , null);

  const cx = xScale(extPt[keyField]);
  const cy = yScale(extPt[yField]);
  const [x0, x1] = xScale.range();

  svgSel.append('line')
    .attr('class', 'extremum-line')
    .attr('x1', x0).attr('x2', x1)
    .attr('y1', cy).attr('y2', cy)
    .attr('stroke', '#ff4500')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4 2')
    .attr('opacity', 0)
    .transition().duration(600)
    .attr('opacity', 1);

  svgSel.append('circle')
    .attr('class', 'extremum-point')
    .attr('cx', cx).attr('cy', cy)
    .attr('r', 6)
    .attr('fill', '#ff4500')
    .attr('opacity', 0)
    .transition().duration(300)
    .attr('opacity', 1)
    .transition().duration(300)
    .attr('opacity', 0)
    .transition().duration(300)
    .attr('opacity', 1);

  svgSel.append('text')
    .attr('class', 'extremum-label')
    .attr('x', x1 + 8)
    .attr('y', cy - 8)
    .attr('fill', '#ff4500')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('opacity', 0)
    .text(extPt[yField].toLocaleString())
    .transition().delay(600).duration(600)
    .attr('opacity', 1);

  return chartId;
}

export function multipleLineDetermineRange(chartId, op) {
  const { seriesField, seriesKey, field: yField, keyField } = op;
  const svgSel = d3.select(`#${chartId} svg`);
  const svgNode = svgSel.node();
  if (!svgNode) return chartId;

  const xScale = svgNode.__xScale;
  const yScale = svgNode.__yScale;
  if (!xScale || !yScale) return chartId;

  svgSel.selectAll('.range-line, .range-point, .range-label').remove();

  const lines = svgSel.selectAll('path.series-line');
  lines.interrupt().attr('opacity', 1);
  if (seriesField) {
    lines.transition().duration(600)
      .attr('opacity', d => d[0][seriesField] === seriesKey ? 1 : 0.1);
  }

  let allData = [];
  if (seriesField) {
    allData = lines.filter(d => d[0][seriesField] === seriesKey).datum();
  } else {
    lines.each(d => allData = allData.concat(d));
  }
  if (!allData.length) return chartId;

  const minVal = d3.min(allData, d => d[yField]);
  const maxVal = d3.max(allData, d => d[yField]);
  if (minVal === maxVal) return chartId;

  const [x0, x1] = xScale.range();
  const yMin = yScale(minVal);
  const yMax = yScale(maxVal);
  const xPos = x1 + 10;

  // draw horizontal range lines
  svgSel.append('line')
    .attr('class','range-line')
    .attr('x1',x0).attr('x2',x1)
    .attr('y1',yMax).attr('y2',yMax)
    .attr('stroke','#ffa500').attr('stroke-width',1.5)
    .attr('opacity',0).transition().duration(600).attr('opacity',1);

  svgSel.append('line')
    .attr('class','range-line')
    .attr('x1',x0).attr('x2',x1)
    .attr('y1',yMin).attr('y2',yMin)
    .attr('stroke','#ffa500').attr('stroke-width',1.5)
    .attr('opacity',0).transition().delay(200).duration(600).attr('opacity',1);

  // draw delta line & label
  svgSel.append('line')
    .attr('class','range-line')
    .attr('x1',xPos).attr('x2',xPos)
    .attr('y1',yMax).attr('y2',yMin)
    .attr('stroke','#ffa500').attr('stroke-width',1.5)
    .attr('opacity',0).transition().delay(400).duration(600).attr('opacity',1);

  svgSel.append('text')
    .attr('class','range-label')
    .attr('x',xPos+6).attr('y',(yMax+yMin)/2)
    .attr('fill','#ffa500').attr('font-size','12px').attr('font-weight','bold')
    .attr('opacity',0)
    .text(`Δ ${(maxVal-minVal).toLocaleString()}`)
    .transition().delay(1000).duration(600).attr('opacity',1);

  // draw and label max point
  const maxPt = allData.find(d => d[yField] === maxVal);
  svgSel.append('circle')
    .attr('class','range-point')
    .attr('cx', xScale(maxPt[keyField])).attr('cy', yMax)
    .attr('r',0).attr('fill','#ffa500').attr('stroke','#fff').attr('stroke-width',1.5)
    .transition().delay(600).duration(600).attr('r',6);

  svgSel.append('text')
    .attr('class','range-label')
    .attr('x', xScale(maxPt[keyField]) + 8).attr('y', yMax - 8)
    .attr('fill','#ffa500').attr('font-size','12px').attr('font-weight','bold')
    .attr('opacity',0)
    .text(`MAX ${maxVal.toLocaleString()}`)
    .transition().delay(800).duration(600).attr('opacity',1);

  // draw and label min point
  const minPt = allData.find(d => d[yField] === minVal);
  svgSel.append('circle')
    .attr('class','range-point')
    .attr('cx', xScale(minPt[keyField])).attr('cy', yMin)
    .attr('r',0).attr('fill','#ffa500').attr('stroke','#fff').attr('stroke-width',1.5)
    .transition().delay(800).duration(600).attr('r',6);

  svgSel.append('text')
    .attr('class','range-label')
    .attr('x', xScale(minPt[keyField]) + 8).attr('y', yMin + 16)
    .attr('fill','#ffa500').attr('font-size','12px').attr('font-weight','bold')
    .attr('opacity',0)
    .text(`MIN ${minVal.toLocaleString()}`)
    .transition().delay(1000).duration(600).attr('opacity',1);

  return chartId;
}

export function multipleLineCompare(chartId, op) {
  const { seriesField, seriesKey1, seriesKey2, field: yField, keyField, key } = op;
  const svgSel = d3.select(`#${chartId} svg`);
  const svgNode = svgSel.node();
  if (!svgNode) return chartId;

  const xScale = svgNode.__xScale;
  const yScale = svgNode.__yScale;
  svgSel.selectAll('.compare-line, .compare-point, .compare-label').remove();

  const paths = svgSel.selectAll('path.series-line');
  paths.interrupt().attr('opacity', 1);
  paths.transition().duration(600)
    .attr('opacity', d => {
      const k = d[0][seriesField];
      return (k === seriesKey1 || k === seriesKey2) ? 1 : 0.1;
    });

  const toMs = v => v instanceof Date ? v.getTime() : new Date(v).getTime();
  const t = toMs(key);

  const data1 = paths.filter(d => d[0][seriesField] === seriesKey1).datum();
  const data2 = paths.filter(d => d[0][seriesField] === seriesKey2).datum();
  const pt1 = data1 && data1.find(pt => toMs(pt[keyField]) === t);
  const pt2 = data2 && data2.find(pt => toMs(pt[keyField]) === t);
  if (!pt1 || !pt2) return chartId;

  const cx  = xScale(pt1[keyField]);
  const cy1 = yScale(pt1[yField]);
  const cy2 = yScale(pt2[yField]);
  const diff = Math.abs(pt2[yField] - pt1[yField]);

  svgSel.append('line')
    .attr('class','compare-line')
    .attr('x1',cx).attr('x2',cx).attr('y1',cy1).attr('y2',cy1)
    .attr('stroke','#ffa500').attr('stroke-width',1.5).attr('stroke-dasharray','4 2').attr('opacity',0)
    .transition().delay(600).duration(600)
    .attr('opacity',1).attr('y2',cy2);

  [[cy1,1200],[cy2,1400]].forEach(([cy,delay]) => {
    svgSel.append('circle')
      .attr('class','compare-point')
      .attr('cx',cx).attr('cy',cy).attr('r',0).attr('fill','#ffa500')
      .transition().delay(delay).duration(300).attr('r',6)
      .transition().duration(300).attr('r',0)
      .transition().duration(300).attr('r',6);
  });

  svgSel.append('text')
    .attr('class','compare-label')
    .attr('x',cx+8).attr('y',cy1-8).attr('opacity',0)
    .text(pt1[yField].toLocaleString())
    .transition().delay(1800).duration(600).attr('opacity',1);

  svgSel.append('text')
    .attr('class','compare-label')
    .attr('x',cx+8).attr('y',cy2+16).attr('opacity',0)
    .text(pt2[yField].toLocaleString())
    .transition().delay(2000).duration(600).attr('opacity',1);

  svgSel.append('text')
    .attr('class','compare-label')
    .attr('x',cx+8).attr('y',(cy1+cy2)/2).attr('opacity',0)
    .text(`Δ ${diff.toLocaleString()}`)
    .transition().delay(2200).duration(600).attr('opacity',1);

  return chartId;
}

export function multipleLineSort(chartId, op) {
  const { seriesField, seriesKey, field: yField, order = 'descending' } = op;
  const svgSel = d3.select(`#${chartId} svg`);
  const svgNode = svgSel.node();
  if (!svgNode) return chartId;

  // 1) grab the original y‐scale
  const yScale = svgNode.__yScale;
  if (!yScale) return chartId;

  // 2) select all lines and fade out the non‐target series
  const allLines = svgSel.selectAll('path.series-line');
  allLines.interrupt().transition().duration(600)
    .attr('opacity', d => d[0][seriesField] === seriesKey ? 1 : 0.1);

  // 3) take the target series' data and sort it by y‐value
  const targetLine = allLines.filter(d => d[0][seriesField] === seriesKey);
  const original = targetLine.datum().slice();            // copy original data
  const sorted = original.sort((a, b) =>
    order === 'ascending' ? a[yField] - b[yField] : b[yField] - a[yField]
  );

  // 4) build a new x‐scale that spaces points evenly
  const width  = +svgSel.attr('width');
  const margin = { left: 60, right: 120 };
  const xNew = d3.scalePoint()
    .domain(d3.range(sorted.length))
    .range([margin.left, width - margin.right]);

  // 5) line generator using the old yScale and new xNew
  const lineGen = d3.line()
    .x((d, i) => xNew(i))
    .y(d => yScale(d[yField]));

  // 6) animate the path from its old shape to the sorted shape
  targetLine
    .transition().delay(600).duration(1000)
    .attr('d', lineGen(sorted));

  return chartId;
}
