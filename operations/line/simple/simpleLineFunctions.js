import {DatumValue} from "../../../object/valueType.js";

export function getSvgAndSetup(chartId) {
  const svg = d3.select(`#${chartId}`).select("svg");
  const g   = svg.select(".plot-area");
  const xField = svg.attr("data-x-field");
  const yField = svg.attr("data-y-field");
  const margins = { left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top") };
  const plot    = { w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h") };
  return { svg, g, xField, yField, margins, plot };
}
export function clearAllAnnotations(svg) {
  svg.selectAll(".annotation").remove();
}
export const delay = (ms) => new Promise(res => setTimeout(res, ms));

function selectMainLine(g) {
  const preferred = g.select("path.series-line.main-line, path.series-line[data-main='true']");
  return preferred.empty() ? g.select("path.series-line") : preferred;
}

function selectMainPoints(g) {
  const p = g.selectAll("circle.main-dp");
  return p.empty() ? g.selectAll("circle.datapoint") : p;
}

export async function prepareForNextOperation(chartId) {
  const { svg, g } = getSvgAndSetup(chartId);

  clearAllAnnotations(svg);

  selectMainPoints(g)
    .filter(function () { return +d3.select(this).attr("r") > 5; })
    .transition().duration(400)
    .attr("r", 6).attr("fill", "#a9a9a9").attr("stroke", "none");

  const baseLine = selectMainLine(g);
  baseLine.transition().duration(400).attr("stroke", "#d3d3d3").attr("opacity", 1);

  await delay(400);
}

const fmtISO = d3.timeFormat("%Y-%m-%d");

function isTemporal(fullData, xField) {
  return Array.isArray(fullData) && fullData.length > 0 && (fullData[0][xField] instanceof Date);
}

function parseDateWithGranularity(v) {
  if (v instanceof Date) return { date: v, granularity: "date" };
  if (typeof v === "number" && String(v).length === 4) return { date: new Date(v, 0, 1), granularity: "year" };
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})$/);
    if (m) return { date: new Date(+m[1], 0, 1), granularity: "year" };
    const d = new Date(v);
    if (!isNaN(+d)) return { date: d, granularity: "date" };
  }
  const d = new Date(v);
  if (!isNaN(+d)) return { date: d, granularity: "date" };
  return { date: null, granularity: null };
}

function toPointIdCandidates(key) {
  const { date } = parseDateWithGranularity(key);
  // if (date) return [fmtISO(date), String(date.getFullYear())];
  return [String(key)];
}

export async function simpleLineRetrieveValue(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "#ff6961";

    let targetPoint = d3.select(null);
    const retrieveField = op.field || xField;

    if (retrieveField === yField) {

        const targetValue = String(op.target);
        targetPoint = points.filter(function() {
            return d3.select(this).attr("data-value") === targetValue;
        });
    } else {

        const candidates = toPointIdCandidates(op.target);
        for (const id of candidates) {
            const sel = points.filter(function() { return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) {
                targetPoint = sel;
                break;
            }
        }
    }

    if (targetPoint.empty()) {
        console.warn("RetrieveValue: target not found for key:", op.target);
        return data;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 2).end();

    const cx = +targetPoint.attr("cx"), cy = +targetPoint.attr("cy");
    const vLine = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
        .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
    const hLine = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
        .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
    await Promise.all([
        vLine.transition().duration(500).attr("y2", margins.top + plot.h).end(),
        hLine.transition().duration(500).attr("x2", margins.left).end()
    ]);


    const labelText = (retrieveField === yField) 
        ? targetPoint.attr("data-id") 
        : Number(targetPoint.attr("data-value")).toLocaleString(); 

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + cx + 5).attr("y", margins.top + cy - 5)
        .attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(labelText);

    const targets = Array.isArray(op.target) ? op.target : [op.target];
    const itemFromList = Array.isArray(data)
        ? data.find(d => ((d && targets.includes(String(d.target)))))
        : undefined;
    if (itemFromList instanceof DatumValue) {
        return itemFromList;
    }
    return null;
}

export async function simpleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    const hlColor  = "steelblue";

    // 1) 공통 접근자 (DatumValue[] / raw 모두 대응)
    const getX = (d) => (d && Object.prototype.hasOwnProperty.call(d, 'target')) ? d.target : d?.[xField];
    const getY = (d) => (d && Object.prototype.hasOwnProperty.call(d, 'value'))  ? d.value  : d?.[yField];
    const dataArray = Array.isArray(data) ? data : [];
    if (dataArray.length === 0) return [];

    const map = { ">": (a,b) => a > b, ">=": (a,b) => a >= b, "<": (a,b) => a < b, "<=": (a,b) => a <= b, "==": (a,b) => a === b };
    const satisfy = map[op.operator] || (() => true);
    const key = Number.isFinite(+op.value) ? +op.value : op.value;

    const filteredData = data.filter(d => {
        const v = Number.isFinite(+d.value) ? +d.value : d.value;
        return satisfy(v, key);
    });

    if (filteredData.length === 0) {
        await Promise.all([
            baseLine.transition().duration(500).attr('opacity', 0.15).end(),
            points.transition().duration(500).attr('opacity', 0.1).attr('r', 3).end()
        ]);
        svg.append('text').attr('class','annotation filter-label')
            .attr('x', margins.left + plot.w / 2).attr('y', margins.top - 10)
            .attr('text-anchor','middle').attr('font-size', 12).attr('font-weight','bold')
            .attr('fill', '#888').text('No results');
        return [];
    }

    // 4) DOM 상의 포인트 매핑 (data-id ↔ target)
    const nodeById = new Map();
    points.each(function() {
        const id = d3.select(this).attr('data-id');
        if (id != null) nodeById.set(String(id), this);
    });

    // target → circle 노드 매칭 (왼→오 정렬)
    const filteredNodes = [];
    filteredData.forEach(d => {
        const candidates = (function toPointIdCandidates(key) {
            // 이미 파일 상단에 같은 함수가 있으면 그걸 사용. 없으면 간단 버전:
            if (key instanceof Date) return [d3.timeFormat("%Y-%m-%d")(key), String(key.getFullYear())];
            return [String(key)];
        })(getX(d));
        for (const id of candidates) {
            if (nodeById.has(String(id))) { filteredNodes.push(nodeById.get(String(id))); break; }
        }
    });
    if (filteredNodes.length === 0) {
        console.warn('simpleLineFilter: filtered nodes not found in DOM');
        return filteredData;
    }
    filteredNodes.sort((a,b) => (+d3.select(a).attr('cx')) - (+d3.select(b).attr('cx')));

    // 5) 필터 라인 path(d) 생성 (plot-area 좌표계: cx,cy 그대로 사용)
    const pathD = (() => {
        let s = '';
        filteredNodes.forEach((n,i) => {
            const cx = +d3.select(n).attr('cx');
            const cy = +d3.select(n).attr('cy');
            s += (i === 0 ? 'M' : 'L') + cx + ',' + cy;
        });
        return s;
    })();

    // 6) 포인트 애니메이션 (남김/제거 자연스럽게)
    const kept = new Set(filteredNodes);
    await Promise.all([
        baseLine.transition().duration(600).attr('stroke', '#d3d3d3').end(),
        points.filter(function(){ return kept.has(this); })
            .transition().duration(600).attr('opacity', 1).attr('r', 7).attr('fill', hlColor).end(),
        points.filter(function(){ return !kept.has(this); })
            .transition().duration(600).attr('opacity', 0.2).attr('r', 4).attr('fill', '#ccc').end()
    ]);

    // 7) 오버레이 라인 그린 뒤, dash로 “그려지듯” 애니메이션 → baseLine에 커밋
    const overlay = g.append('path')
        .attr('class', 'annotation filtered-line')
        .attr('fill', 'none').attr('stroke', hlColor).attr('stroke-width', 2.5)
        .attr('d', pathD);

    const len = overlay.node().getTotalLength();
    overlay
        .attr('stroke-dasharray', `${len} ${len}`)
        .attr('stroke-dashoffset', len)
        .transition().duration(800).ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0);

    await delay(850);

    // 커밋: 기존 라인을 필터 라인으로 교체하고 오버레이 제거
    baseLine.attr('d', pathD).attr('stroke', hlColor).attr('opacity', 1);
    overlay.remove();

    // 라벨
    svg.append('text').attr('class', 'annotation filter-label')
        .attr('x', margins.left + plot.w / 2).attr('y', margins.top - 10)
        .attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 'bold')
        .attr('fill', hlColor).text(`Filtered (${filteredData.length})`);

    // ✅ 다음 연산을 위해 필터된 DatumValue[] 반환
    return filteredData;
}

export async function simpleLineFindExtremum(chartId, op, data) {
  const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  if (!data || !data.length) return data;

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  const hlColor  = "#a65dfb";

  const targetVal = op.which === "min"
    ? d3.min(data, d => d.value)
    : d3.max(data, d => d.value);

  const targetPoint = points.filter(d => d && d[yField] === targetVal);
  if (targetPoint.empty()) return data;

  baseLine.transition().duration(600).attr("opacity", 0.3);
  await targetPoint.transition().duration(600)
    .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
    .attr("stroke", "white").attr("stroke-width", 2).end();

  const cx = +targetPoint.attr("cx");
  const cy = +targetPoint.attr("cy");

  const v = svg.append("line").attr("class", "annotation")
    .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
    .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
    .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
  const h = svg.append("line").attr("class", "annotation")
    .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
    .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
    .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

  await Promise.all([
    v.transition().duration(500).attr("y2", margins.top + plot.h).end(),
    h.transition().duration(500).attr("x2", margins.left).end()
  ]);

  const label = `${op.which === "min" ? "Min" : "Max"}: ${targetVal.toLocaleString()}`;
  svg.append("text").attr("class", "annotation")
    .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
    .attr("fill", hlColor)
    .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
    .text(label);

  return data;
}

export async function simpleLineDetermineRange(chartId, op, data) {
  const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  if (!Array.isArray(data) || data.length === 0) return data;

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  const hlColor  = "#0d6efd";

  // Accessors to support DatumValue[] or raw rows
  const getX = (d) => (d && Object.prototype.hasOwnProperty.call(d, 'target')) ? d.target : d?.[xField];
  const getY = (d) => (d && Object.prototype.hasOwnProperty.call(d, 'value'))  ? +d.value  : +(d?.[yField]);

  // Choose which axis to determine range for (default = value axis like simpleBarDetermineRange)
  const rangeField = op.field || yField;

  const animations = [];

  if (rangeField === xField) {
    // ---- Category (x) range: earliest ~ latest ----
    const [minX, maxX] = d3.extent(data, d => getX(d));

    const pickPointByX = (xVal) => {
      const cands = toPointIdCandidates(xVal);
      for (const id of cands) {
        const sel = points.filter(function(){ return d3.select(this).attr("data-id") === String(id); });
        if (!sel.empty()) return sel;
      }
      return d3.select(null);
    };

    const minP = pickPointByX(minX);
    const maxP = pickPointByX(maxX);

    await baseLine.transition().duration(600).attr("opacity", 0.3).end();
    animations.push(
      minP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
      maxP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
    );
    await Promise.all(animations);

    const formatX = (v) => (v instanceof Date) ? fmtISO(v) : String(v);

    const drawV = (pt, label, val) => {
      if (pt.empty()) return;
      const cx = +pt.attr("cx"), cy = +pt.attr("cy");

      // marker: create point with grow animation + pulse
      const marker = g.append('circle')
        .attr('class','annotation range-point')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 0).attr('fill', hlColor)
        .attr('stroke','white').attr('stroke-width', 2);
      marker.transition().duration(400).attr('r', 7);
      const pulse = g.append('circle')
        .attr('class','annotation range-pulse')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 7).attr('fill','none')
        .attr('stroke', hlColor).attr('opacity', 0.5);
      pulse.transition().duration(800).attr('r', 14).attr('opacity', 0).remove();

      // vertical guide with stroke-dash drawing
      const v = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left + cx).attr("y1", margins.top)
        .attr("x2", margins.left + cx).attr("y2", margins.top + plot.h)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
      const vlen = v.node().getTotalLength?.() ?? (plot.h);
      v.attr('stroke-dasharray', `${vlen} ${vlen}`).attr('stroke-dashoffset', vlen)
       .transition().duration(800).ease(d3.easeCubicInOut)
       .attr('stroke-dashoffset', 0);

      svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + cx).attr("y", margins.top - 12)
        .attr("text-anchor", "middle").attr("fill", hlColor)
        .attr("font-weight", "bold").attr("font-size", 12)
        .text(`${label}: ${formatX(val)}`)
        .attr('opacity', 0).transition().duration(300).attr('opacity', 1);
    };

    drawV(minP, "Start", minX);
    drawV(maxP, "End",   maxX);

    // Optional: top horizontal reference from the first point's y (with draw animation)
    const minCy = !minP.empty() ? +minP.attr("cy") : NaN;
    if (Number.isFinite(minCy)) {
      const h = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", margins.top + minCy)
        .attr("x2", margins.left + plot.w).attr("y2", margins.top + minCy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
      const hlen = h.node().getTotalLength?.() ?? (plot.w);
      h.attr('stroke-dasharray', `${hlen} ${hlen}`).attr('stroke-dashoffset', hlen)
       .transition().duration(800).ease(d3.easeCubicInOut)
       .attr('stroke-dashoffset', 0);
    }

    svg.append("text").attr("class", "annotation")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight", "bold")
      .attr("fill", hlColor)
      .text(`Range: ${formatX(minX)} ~ ${formatX(maxX)}`)
      .attr('opacity', 0).transition().duration(400).attr('opacity', 1);
  } else {
    // ---- Value (y) range: reuse simpleBarDetermineRange idea ----
    const values = data.map(getY);
    const minV = d3.min(values);
    const maxV = d3.max(values);

    const selByVal = (v) => points.filter(function(){ return +d3.select(this).attr("data-value") === +v; });
    const minPts = selByVal(minV);
    const maxPts = selByVal(maxV);

    await baseLine.transition().duration(600).attr("opacity", 0.3).end();

    // Create markers (grow + pulse) for all min/max points
    const createMarkers = (ptSel) => {
      const promises = [];
      ptSel.each(function(){
        const cx = +d3.select(this).attr('cx');
        const cy = +d3.select(this).attr('cy');
        const marker = g.append('circle')
          .attr('class','annotation range-point')
          .attr('cx', cx).attr('cy', cy)
          .attr('r', 0).attr('fill', hlColor)
          .attr('stroke','white').attr('stroke-width', 2);
        promises.push(marker.transition().duration(400).attr('r', 7).end());
        const pulse = g.append('circle')
          .attr('class','annotation range-pulse')
          .attr('cx', cx).attr('cy', cy)
          .attr('r', 7).attr('fill','none')
          .attr('stroke', hlColor).attr('opacity', 0.5);
        pulse.transition().duration(800).attr('r', 14).attr('opacity', 0).remove();
      });
      return promises;
    };

    await Promise.all([
      ...createMarkers(minPts),
      ...createMarkers(maxPts)
    ]);

    const drawH = (pt, label, value) => {
      if (pt.empty()) return;
      const cy = +pt.attr("cy");
      const line = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", margins.top + cy)
        .attr("x2", margins.left + plot.w).attr("y2", margins.top + cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
      const len = line.node().getTotalLength?.() ?? (plot.w);
      line.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
          .transition().duration(800).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0);

      const text = svg.append("text").attr("class", "annotation")
        .attr("x", margins.left - 20).attr("y", margins.top + cy)
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .attr("fill", hlColor).attr("font-weight", "bold")
        .text(`${label}: ${value.toLocaleString()}`)
        .attr("opacity", 0);
      text.transition().delay(400).duration(400).attr("opacity", 1);
    };

    drawH(minPts, "Min", minV);
    drawH(maxPts, "Max", maxV);

    svg.append("text").attr("class", "annotation")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight", "bold")
      .attr("fill", hlColor)
      .text(`Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`)
      .attr('opacity', 0).transition().duration(400).attr('opacity', 1);
  }

  return data;
}

export async function simpleLineCompare(chartId, op, data) {
  const { svg, g, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  const leftColor  = "#ffb74d";
  const rightColor = "#64b5f6";

  const leftCandidates  = toPointIdCandidates(op.left);
  const rightCandidates = toPointIdCandidates(op.right);

  const pick = (cands) => {
    for (const id of cands) {
      const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
      if (!sel.empty()) return sel;
    }
    return d3.select(null);
  };

  const leftPoint  = pick(leftCandidates);
  const rightPoint = pick(rightCandidates);
  if (leftPoint.empty() || rightPoint.empty()) {
    console.warn("Compare: One or both points not found.", op.left, op.right);
    return data;
  }

  const lv = +leftPoint.attr("data-value");
  const rv = +rightPoint.attr("data-value");

  baseLine.transition().duration(600).attr("opacity", 0.3);
  await Promise.all([
    leftPoint.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",leftColor).end(),
    rightPoint.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",rightColor).end()
  ]);

  const annotate = (pt, color, below=false) => {
    const cx=+pt.attr("cx"), cy=+pt.attr("cy");
    const h=svg.append("line").attr("class","annotation")
      .attr("x1",margins.left).attr("y1",margins.top+cy)
      .attr("x2",margins.left).attr("y2",margins.top+cy)
      .attr("stroke",color).attr("stroke-dasharray","4 4");
    const v=svg.append("line").attr("class","annotation")
      .attr("x1",margins.left+cx).attr("y1",margins.top+cy)
      .attr("x2",margins.left+cx).attr("y2",margins.top+cy)
      .attr("stroke",color).attr("stroke-dasharray","4 4");
    svg.append("text").attr("class","annotation")
      .attr("x",margins.left+cx).attr("y",margins.top+cy+(below?16:-8))
      .attr("text-anchor","middle").attr("fill",color)
      .attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
      .text((+pt.attr("data-value")).toLocaleString())
      .attr("opacity",0).transition().delay(200).duration(400).attr("opacity",1);
    return [
      h.transition().duration(500).attr("x2",margins.left+cx).end(),
      v.transition().duration(500).attr("y2",margins.top+plot.h).end()
    ];
  };

  await Promise.all([
    ...annotate(leftPoint, leftColor, false),
    ...annotate(rightPoint, rightColor, true)
  ]);

  const diff = Math.abs(lv - rv);
  const leftLabel  = op.left;
  const rightLabel = op.right;
  let result = "";
  if (lv > rv)      result = `${leftLabel}이(가) ${rightLabel}보다 ${diff.toLocaleString()} 더 큽니다.`;
  else if (rv > lv) result = `${rightLabel}이(가) ${leftLabel}보다 ${diff.toLocaleString()} 더 큽니다.`;
  else              result = `${leftLabel}와(과) ${rightLabel}의 값이 ${lv.toLocaleString()}으로 동일합니다.`;

  svg.append("text").attr("class","annotation")
    .attr("x",margins.left+plot.w/2).attr("y",margins.top-10)
    .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
    .attr("fill","#333").text(result);

  return data;
}

export async function simpleLineSum(chartId, op, data) {} // 필요하지 않을수도 있음.

export async function simpleLineAverage(chartId, op, data) {
  const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  if (!Array.isArray(data) || data.length === 0) {
    console.warn('[simpleLineAverage] empty data');
    return data;
  }

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  const hlColor  = 'red'; // match simpleBarAverage visual

  // 1) 평균 계산 (DatumValue[] 가정)
  const values = data.map(d => +d.value).filter(Number.isFinite);
  if (values.length === 0) {
    console.warn('[simpleLineAverage] no finite values in data');
    return data;
  }
  const avg = d3.mean(values);
  const minV = d3.min(values);
  const maxV = d3.max(values);

  // 2) 평균의 y 픽셀(cyAvg) 계산
  let cyAvg;
  if (!points.empty()) {
    const firstByVal = (v) => points.filter(function(){ return +d3.select(this).attr('data-value') === +v; }).node();
    const minPt = firstByVal(minV);
    const maxPt = firstByVal(maxV);

    if (minPt && maxPt && maxV !== minV) {
      const cyMin = +d3.select(minPt).attr('cy');
      const cyMax = +d3.select(maxPt).attr('cy');
      const t = (avg - minV) / (maxV - minV);
      cyAvg = cyMin + (cyMax - cyMin) * t; // 값 보간 → 픽셀
    } else {
      const allCy = [];
      points.each(function(){ const v = +d3.select(this).attr('data-value'); if (Number.isFinite(v)) allCy.push(+d3.select(this).attr('cy')); });
      cyAvg = allCy.length ? d3.mean(allCy) : (plot.h / 2);
    }
  } else {
    // 포인트가 없으면 간단 스케일 재구축 (0~max)
    const yScale = d3.scaleLinear().domain([0, maxV || 0]).nice().range([plot.h, 0]);
    cyAvg = yScale(avg);
  }

  if (!Number.isFinite(cyAvg)) {
    console.warn('[simpleLineAverage] cyAvg is not finite; falling back to mid-height');
    cyAvg = plot.h / 2;
  }

  // 3) 기본 라인 디임
  await baseLine.transition().duration(600).attr('opacity', 0.3).end();

  // 4) 바 차트 방식으로: SVG 좌표계에서 좌→우로 선을 그리며 x2만 애니메이션
  const yPix = margins.top + cyAvg;

  const line = svg.append('line')
    .attr('class', 'annotation avg-line')
    .attr('x1', margins.left).attr('x2', margins.left)
    .attr('y1', yPix).attr('y2', yPix)
    .attr('stroke', hlColor).attr('stroke-width', 2)
    .attr('stroke-dasharray', '5 5');

  await line.transition().duration(800).attr('x2', margins.left + plot.w).end();

  // 5) 라벨
  const label = svg.append('text').attr('class', 'annotation avg-label')
    .attr('x', margins.left + plot.w + 6).attr('y', yPix)
    .attr('dominant-baseline', 'middle')
    .attr('fill', hlColor).attr('font-weight', 'bold')
    .text(`Avg: ${Number.isInteger(avg) ? avg : avg.toLocaleString(undefined,{ maximumFractionDigits: 2 })}`)
    .attr('opacity', 0);
  label.transition().delay(400).duration(400).attr('opacity', 1);

  return data;
}

export async function simpleLineDiff(chartId, op, data) {}

export async function simpleLineNth(chartId, op, data) {
  const { svg, g, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  if (!Array.isArray(data) || data.length === 0) {
    console.warn('simpleLineNth: empty data');
    return [];
  }

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  if (points.empty()) {
    console.warn('simpleLineNth: no points on chart');
    return [];
  }

  let n = Number(op?.n ?? 0);
  const from = String(op?.from || 'left').toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return [];

  const nodes = points.nodes();
  const total = nodes.length;
  if (n > total) n = total; // clamp

  // Build item list with DOM coordinates (plot-area coords)
  const items = nodes.map((node) => ({
    node,
    cx: +node.getAttribute('cx') || 0,
    cy: +node.getAttribute('cy') || 0,
    id: d3.select(node).attr('data-id'),
    value: +(d3.select(node).attr('data-value') ?? NaN)
  }));

  // Order left → right by cx
  const ordered = items.slice().sort((a, b) => a.cx - b.cx);

  // Pick exactly the nth item from the chosen side
  const idx = (from === 'right') ? (total - n) : (n - 1);
  if (idx < 0 || idx >= total) {
    console.warn('simpleLineNth: computed index out of range', { n, from, total, idx });
    return [];
  }
  const picked = ordered[idx];

  const hlColor  = '#20c997';
  const baseColor = '#a9a9a9';

  // Dim all, then highlight only the picked point
  await Promise.all([
    baseLine.transition().duration(250).attr('opacity', 0.3).end(),
    points.transition().duration(250).attr('fill', baseColor).attr('opacity', 0.25).end()
  ]);

  const dp = d3.select(picked.node);
  await dp.transition().duration(220)
    .attr('fill', hlColor)
    .attr('opacity', 1)
    .attr('r', Math.max(7, +dp.attr('r') || 7))
    .end();

  // Guide lines (draw in SVG coords: add margins)
  const cx = picked.cx, cy = picked.cy;
  const vx = margins.left + cx, vy = margins.top + cy;

  const vLine = svg.append('line').attr('class','annotation')
    .attr('x1', vx).attr('y1', vy)
    .attr('x2', vx).attr('y2', vy)
    .attr('stroke', hlColor).attr('stroke-dasharray', '4 4');

  const hLine = svg.append('line').attr('class','annotation')
    .attr('x1', vx).attr('y1', vy)
    .attr('x2', vx).attr('y2', vy)
    .attr('stroke', hlColor).attr('stroke-dasharray', '4 4');

  await Promise.all([
    vLine.transition().duration(500).attr('y2', margins.top + plot.h).end(),
    hLine.transition().duration(500).attr('x2', margins.left).end()
  ]);

  // Ordinal label above the picked point
  g.append('text')
    .attr('class', 'annotation nth-label')
    .attr('x', cx)
    .attr('y', cy - 10)
    .attr('text-anchor', 'middle')
    .attr('font-size', 12)
    .attr('font-weight', 'bold')
    .attr('fill', hlColor)
    .attr('stroke', 'white')
    .attr('stroke-width', 3)
    .attr('paint-order', 'stroke')
    .text(String(n))
    .attr('opacity', 0)
    .transition().duration(180).attr('opacity', 1);

  // Header annotation
  svg.append('text')
    .attr('class', 'annotation')
    .attr('x', margins.left)
    .attr('y', margins.top - 10)
    .attr('font-size', 14)
    .attr('font-weight', 'bold')
    .attr('fill', hlColor)
    .text(`Nth (from ${from}): ${n}`)
    .attr('opacity', 0)
    .transition().duration(200).attr('opacity', 1);

  // Map back to DatumValue by matching target ↔ data-id
  const pickedId = String(picked.id);
  const selected = data.filter(d => {
    const cands = toPointIdCandidates(d.target);
    return cands.some(c => String(c) === pickedId);
  });

  return selected;
}

export async function simpleLineCount(chartId, op, data) {
  const { svg, g, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  if (!Array.isArray(data) || data.length === 0) {
    console.warn('simpleLineCount: empty data');
    return data;
  }

  const baseLine = selectMainLine(g);
  const points   = selectMainPoints(g);
  if (points.empty()) {
    console.warn('simpleLineCount: no points on chart');
    return data;
  }

  const baseColor = '#a9a9a9';
  const hlColor   = '#20c997';

  // Soften everything first
  await Promise.all([
    baseLine.transition().duration(150).attr('opacity', 0.3).end(),
    points.transition().duration(150).attr('fill', baseColor).attr('opacity', 0.3).end()
  ]);

  // Collect DOM coords and order left → right
  const nodes = points.nodes();
  const items = nodes.map((node) => ({
    node,
    cx: +node.getAttribute('cx') || 0,
    cy: +node.getAttribute('cy') || 0,
  }));
  const ordered = items.slice().sort((a, b) => a.cx - b.cx);

  // Sequentially highlight and number
  for (let i = 0; i < ordered.length; i++) {
    const { node, cx, cy } = ordered[i];
    const dp = d3.select(node);

    await dp.transition().duration(150)
      .attr('fill', hlColor)
      .attr('opacity', 1)
      .attr('r', Math.max(6, +dp.attr('r') || 6))
      .end();

    g.append('text')
      .attr('class', 'annotation count-label')
      .attr('x', cx)
      .attr('y', cy - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .attr('fill', hlColor)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .text(String(i + 1))
      .attr('opacity', 0)
      .transition().duration(125).attr('opacity', 1);

    await delay(60);
  }

  svg.append('text')
    .attr('class', 'annotation')
    .attr('x', margins.left)
    .attr('y', margins.top - 10)
    .attr('font-size', 14)
    .attr('font-weight', 'bold')
    .attr('fill', hlColor)
    .text(`Count: ${ordered.length}`)
    .attr('opacity', 0)
    .transition().duration(200).attr('opacity', 1);

  return data;
}
