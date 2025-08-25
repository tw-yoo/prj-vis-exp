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
  if (date) return [fmtISO(date), String(date.getFullYear())];
  return [String(key)];
}

function normalizeRange(from, to) {
  const F = parseDateWithGranularity(from);
  const T = parseDateWithGranularity(to);
  let fromD = F.date, toD = T.date;
  if (F.granularity === "year" && fromD) fromD = new Date(fromD.getFullYear(), 0, 1);
  if (T.granularity === "year" && toD)   toD   = new Date(toD.getFullYear(), 11, 31);
  return { fromD, toD, fromLabel: fromD ? fmtISO(fromD) : String(from), toLabel: toD ? fmtISO(toD) : String(to) };
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

    // 2) filteredData 확보 (이미 만들었다면 그걸 사용; 없으면 카테고리 기준으로 생성)
    let filteredData = Array.isArray(op?.filteredData) ? op.filteredData : null;
    if (!filteredData) {
        const optr = op?.operator || 'in';
        const val  = op?.value;
        const cmp  = { '==':(a,b)=>a==b, '!=':(a,b)=>a!=b, '>':(a,b)=>a>b, '>=':(a,b)=>a>=b, '<':(a,b)=>a<b, '<=':(a,b)=>a<=b };
        if (optr === 'in' && Array.isArray(val)) {
            const set = new Set(val.map(String));
            filteredData = dataArray.filter(d => set.has(String(getX(d))));
        } else if (cmp[optr]) {
            filteredData = dataArray.filter(d => cmp[optr](getX(d), val));
        } else {
            filteredData = dataArray.slice();
        }
    }
    // DatumValue 강제화
    filteredData = filteredData.map(d =>
        (d instanceof DatumValue) ? d : new DatumValue(xField, yField, getX(d), null, getY(d), undefined)
    );

    // 3) 비어있으면 부드럽게 페이드아웃하고 종료
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

    if (!data || !data.length) return data;

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "#0d6efd";
    
    const rangeField = op.field || yField;

    if (rangeField === xField) {

        const xExtent = d3.extent(fullData, d => d[xField]);
        const xScale = d3.scaleTime().domain(xExtent).range([0, plot.w]);

        const [minDate, maxDate] = d3.extent(data, d => d[xField]);
        
        const minP = points.filter(d => d && +d[xField] === +minDate);
        const maxP = points.filter(d => d && +d[xField] === +maxDate);

        baseLine.transition().duration(600).attr("opacity", 0.3);
        await Promise.all([
            minP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
            maxP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
        ]);

        const fmt = d3.timeFormat("%Y-%m-%d");

        const createSet = (pt, label) => {
            const d = pt.datum();
            const cx = +pt.attr("cx");
            const cy = +pt.attr("cy");

            svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
                .attr("x2", margins.left + cx).attr("y2", margins.top + plot.h)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

            svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + cx).attr("y", margins.top - 15)
                .attr("text-anchor", "middle").attr("fill", hlColor)
                .attr("font-weight", "bold").attr("font-size", 12)
                .text(`${label}: ${fmt(d[xField])}`);
        };
        
        createSet(minP, "Start");
        createSet(maxP, "End");

        const minCy = +minP.attr("cy");

        if (!isNaN(minCy)) {
            svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left)
                .attr("y1", margins.top + minCy)
                .attr("x2", margins.left)
                .attr("y2", margins.top + minCy)
                .attr("stroke", hlColor)
                .attr("stroke-width", 1.5)
                .attr("stroke-dasharray", "4 4")
                .transition().duration(800)
                .attr("x2", margins.left + plot.w); 
        }

        
    } else {

        const minV = d3.min(data, d => d[yField]);
        const maxV = d3.max(data, d => d[yField]);
        const minP = points.filter(d => d && d[yField] === minV);
        const maxP = points.filter(d => d && d[yField] === maxV);

        baseLine.transition().duration(600).attr("opacity", 0.3);
        await Promise.all([
            minP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
            maxP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
        ]);

        const createSet = (pt, label, value) => {
            const cx = +pt.attr("cx");
            const cy = +pt.attr("cy");
            const v = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
                .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            const h = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", margins.top + cy)
                .attr("x2", margins.left).attr("y2", margins.top + cy)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
                .attr("text-anchor", "middle").attr("fill", hlColor)
                .attr("font-weight", "bold").attr("font-size", 12)
                .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
                .text(`${label}: ${value.toLocaleString()}`);
            return [
                v.transition().duration(800).attr("y2", margins.top + plot.h).end(),
                h.transition().duration(800).attr("x2", margins.left + plot.w).end()
            ];
        };

        await Promise.all([ ...createSet(minP, "MIN", minV), ...createSet(maxP, "MAX", maxV) ]);

        const rangeText = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + plot.w - 15).attr("y", margins.top + plot.h / 2)
            .attr("text-anchor", "end").attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor).attr("stroke", "white").attr("stroke-width", 4)
            .attr("paint-order", "stroke");
        rangeText.append("tspan").attr("x", margins.left + plot.w - 15).attr("dy", "-0.6em").text("값 범위:");
        rangeText.append("tspan").attr("x", margins.left + plot.w - 15).attr("dy", "1.2em")
            .text(`${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`);
        await rangeText.transition().duration(400).attr("opacity", 1).end();
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

export async function simpleLineSum(chartId, op, data) {}

export async function simpleLineAverage(chartId, op, data) {}

export async function simpleLineDiff(chartId, op, data) {}

export async function simpleLineCount(chartId, op, data) {}
