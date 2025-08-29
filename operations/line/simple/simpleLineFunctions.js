import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";
// simpleLineFunctions.js 파일 상단에 추가해주세요.
const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
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
    if (v instanceof Date) return { date: v };
    if (typeof v === "number" && String(v).length === 4) return { date: new Date(v, 0, 1) };
    if (typeof v === "string") {
        if (/^\d{4}$/.test(v)) return { date: new Date(+v, 0, 1) };
        const d = new Date(v);
        if (!isNaN(+d)) return { date: d };
    }
    return { date: null };
}

function toPointIdCandidates(key) {
    const { date } = parseDateWithGranularity(key);
    if (date) {
        return [fmtISO(date), String(key)];
    }
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

    const candidates = toPointIdCandidates(op.target);
    if (retrieveField === yField) {
        const targetValue = String(op.target);
        targetPoint = points.filter(function() {
            return d3.select(this).attr("data-value") === targetValue;
        });
    } else {
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
        .attr("x2", margins.left + cx).attr("y2", margins.top + plot.h)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
    const hLine = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", margins.top + cy)
        .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
    await Promise.all([
        vLine.transition().duration(500).end(),
        hLine.transition().duration(500).end()
    ]);

    const labelText = Number(targetPoint.attr("data-value")).toLocaleString();
    
    g.append("text").attr("class", "annotation")
        .attr("x", cx + 5).attr("y", cy - 5)
        .attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(labelText);

    const itemFromList = Array.isArray(data)
        ? data.find(d => {
            if (!d || d.target == null) return false;
            const itemCandidates = toPointIdCandidates(d.target);
            return itemCandidates.some(cand => candidates.includes(cand));
          })
        : undefined;

    return itemFromList || null;
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
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!data || !data.length) return null;

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    const hlColor  = "#a65dfb";

    const targetVal = op.which === "min"
        ? d3.min(data, d => d.value)
        : d3.max(data, d => d.value);

    // data-value는 문자열일 수 있으므로 비교 시 타입을 맞춰줍니다.
    const targetPoint = points.filter(function() {
        return +d3.select(this).attr("data-value") === targetVal;
    });

    if (targetPoint.empty()) {
        console.warn("FindExtremum: Point not found for value:", targetVal);
        return null;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 2).end();

    const cx = +targetPoint.attr("cx");
    const cy = +targetPoint.attr("cy");

    // 주석을 svg가 아닌 g(플롯 영역)에 추가하여 위치 문제를 해결합니다.
    const v = g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
    const h = g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    await Promise.all([
        v.transition().duration(500).attr("y2", plot.h).end(),
        h.transition().duration(500).attr("x2", 0).end()
    ]).catch(err => console.log("Animation interrupted"));

    const label = `${op.which === "min" ? "Min" : "Max"}: ${targetVal.toLocaleString()}`;
    g.append("text").attr("class", "annotation")
        .attr("x", cx).attr("y", cy - 15)
        .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
        .attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(label);

    // [핵심 수정] 찾은 값에 해당하는 단일 DatumValue 객체를 반환합니다.
    const targetDatum = data.find(d => d.value === targetVal);
    return targetDatum || null;
}

export async function simpleLineDetermineRange(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return null;

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    const hlColor  = "#0d6efd";

    const getX = (d) => (d && d.target instanceof Date) ? d.target : (d ? new Date(d[xField]) : null);
    const getY = (d) => (d && typeof d.value === 'number') ? d.value : (d ? +d[yField] : NaN);
    
    const rangeField = op.field || yField;

    if (rangeField === xField) {
        const [minX, maxX] = d3.extent(data, getX);
        
        const findPointByDate = (date) => {
            const dateStr = fmtISO(date);
            return points.filter(function() { return d3.select(this).attr("data-id") === dateStr; });
        };
        
        const minP = findPointByDate(minX);
        const maxP = findPointByDate(maxX);

        await baseLine.transition().duration(600).attr("opacity", 0.3).end();
        await Promise.all([
            minP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
            maxP.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
        ]);

        const drawVLine = (point, label, value) => {
            if (point.empty()) return;
            const cx = +point.attr("cx");
            g.append("line").attr("class", "annotation")
                .attr("x1", cx).attr("y1", 0)
                .attr("x2", cx).attr("y2", plot.h)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            g.append("text").attr("class", "annotation")
                .attr("x", cx).attr("y", -12)
                .attr("text-anchor", "middle").attr("fill", hlColor).attr("font-weight", "bold")
                .text(`${label}: ${fmtISO(value)}`);
        };
        
        drawVLine(minP, "Start", minX);
        drawVLine(maxP, "End", maxX);
        
        return new IntervalValue(xField, minX, maxX);
    } else {
        const values = data.map(getY);
        const minV = d3.min(values);
        const maxV = d3.max(values);

        const selByVal = (v) => points.filter(function(){ return +d3.select(this).attr("data-value") === +v; });
        const minPts = selByVal(minV);
        const maxPts = selByVal(maxV);

        await baseLine.transition().duration(600).attr("opacity", 0.3).end();
        
        const highlightPromises = [];
        minPts.each(function() { highlightPromises.push(d3.select(this).transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()); });
        maxPts.each(function() { highlightPromises.push(d3.select(this).transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()); });
        await Promise.all(highlightPromises);
        
        const drawHLine = (value, label) => {
            if (value === undefined) return;
            const yPos = d3.scaleLinear().domain([0, d3.max(values)]).nice().range([plot.h, 0])(value);
            g.append("line").attr("class", "annotation")
                .attr("x1", 0).attr("y1", yPos)
                .attr("x2", plot.w).attr("y2", yPos)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            g.append("text").attr("class", "annotation")
                .attr("x", -8).attr("y", yPos)
                .attr("text-anchor", "end").attr("dominant-baseline", "middle")
                .attr("fill", hlColor).attr("font-weight", "bold")
                .text(`${label}: ${value.toLocaleString()}`);
        };
        
        drawHLine(minV, "Min");
        drawHLine(maxV, "Max");

        return new IntervalValue(yField, minV, maxV);
    }
}

export async function simpleLineCompare(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    const colorA   = "#ffb74d";
    const colorB   = "#64b5f6";

    const candidatesA = toPointIdCandidates(op.targetA);
    const candidatesB = toPointIdCandidates(op.targetB);

    const pick = (cands) => {
        for (const id of cands) {
            const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    const pointA = pick(candidatesA);
    const pointB = pick(candidatesB);

    if (pointA.empty() || pointB.empty()) {
        console.warn("Compare: One or both points not found.", op.targetA, op.targetB);
        return new BoolValue("Points not found", false);
    }

    const valueA = +pointA.attr("data-value");
    const valueB = +pointB.attr("data-value");

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await Promise.all([
        pointA.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorA).end(),
        pointB.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorB).end()
    ]);

    const annotate = (pt, color) => {
        const cx = +pt.attr("cx"), cy = +pt.attr("cy");
        
        g.append("line").attr("class","annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray","4 4");
            
        g.append("line").attr("class","annotation")
            .attr("x1", cx).attr("y1", cy)
            .attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", color).attr("stroke-dasharray","4 4");
            
        g.append("text").attr("class","annotation")
            .attr("x", cx).attr("y", cy - 10)
            .attr("text-anchor","middle").attr("fill",color)
            .attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
            .text((+pt.attr("data-value")).toLocaleString());
    };

    annotate(pointA, colorA);
    annotate(pointB, colorB);

    const comparisonFunc = cmpMap[op.operator] || (() => false);
    const result = comparisonFunc(valueA, valueB);
    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const summary = `${valueA.toLocaleString()}${symbol}${valueB.toLocaleString()} → ${result}`;
    
    svg.append("text").attr("class","annotation")
        .attr("x", margins.left + plot.w/2).attr("y", margins.top - 10)
        .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
        .attr("fill", result ? "green" : "red").text(summary);

    return new BoolValue('', result);
}


export async function simpleLineSum(chartId, op, data) {} // 필요하지 않을수도 있음.

export async function simpleLineAverage(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    const baseLine = selectMainLine(g);
    const hlColor  = 'red';

    const values = data.map(d => +d.value).filter(Number.isFinite);
    if (values.length === 0) {
        console.warn('[simpleLineAverage] no finite values in data');
        return null;
    }
    const avg = d3.mean(values);

    const yMax = d3.max(values);
    const yScale = d3.scaleLinear().domain([0, yMax || 0]).nice().range([plot.h, 0]);
    const yPos = yScale(avg);

    await baseLine.transition().duration(600).attr('opacity', 0.3).end();

    const line = g.append('line')
        .attr('class', 'annotation avg-line')
        .attr('x1', 0).attr('x2', 0)
        .attr('y1', yPos).attr('y2', yPos)
        .attr('stroke', hlColor).attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 5');

    await line.transition().duration(800).attr('x2', plot.w).end();

    const label = g.append('text').attr('class', 'annotation avg-label')
        .attr('x', plot.w + 6).attr('y', yPos)
        .attr('dominant-baseline', 'middle')
        .attr('fill', hlColor).attr('font-weight', 'bold')
        .text(`Avg: ${Number.isInteger(avg) ? avg : avg.toLocaleString(undefined,{ maximumFractionDigits: 2 })}`)
        .attr('opacity', 0);
        
    label.transition().delay(400).duration(400).attr('opacity', 1);

    return new DatumValue(xField, yField, 'Average', null, avg, null);
}

export async function simpleLineDiff(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    const colorA   = "#ffb74d"; // 첫 번째 대상 색상
    const colorB   = "#64b5f6"; // 두 번째 대상 색상
    const hlColor  = "#fca103"; // 결과 강조 색상

    const candidatesA = toPointIdCandidates(op.targetA);
    const candidatesB = toPointIdCandidates(op.targetB);

    const pick = (cands) => {
        for (const id of cands) {
            const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    const pointA = pick(candidatesA);
    const pointB = pick(candidatesB);

    if (pointA.empty() || pointB.empty()) {
        console.warn("Diff: One or both points not found.", op.targetA, op.targetB);
        return null; // 비교 대상이 없으면 null 반환
    }

    const valueA = +pointA.attr("data-value");
    const valueB = +pointB.attr("data-value");

    // 1. 차트의 다른 요소들을 흐리게 처리
    baseLine.transition().duration(600).attr("opacity", 0.3);
    
    // 2. 두 비교 대상을 각자의 색상으로 강조
    await Promise.all([
        pointA.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorA).end(),
        pointB.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorB).end()
    ]);

    // 3. 각 포인트에 대한 주석(가이드라인, 값) 추가
    const annotate = (pt, color) => {
        const cx = +pt.attr("cx"), cy = +pt.attr("cy");
        
        g.append("line").attr("class","annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray","4 4");
            
        g.append("line").attr("class","annotation")
            .attr("x1", cx).attr("y1", cy)
            .attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", color).attr("stroke-dasharray","4 4");
            
        g.append("text").attr("class","annotation")
            .attr("x", cx).attr("y", cy - 10)
            .attr("text-anchor","middle").attr("fill",color)
            .attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
            .text((+pt.attr("data-value")).toLocaleString());
    };

    annotate(pointA, colorA);
    annotate(pointB, colorB);

    // 4. 두 값의 차이를 계산
    const largerValue = Math.max(valueA, valueB);
    const smallerValue = Math.min(valueA, valueB);
    const diff = largerValue - smallerValue;

    // [수정됨] 계산 결과를 자연스러운 수식으로 표시
    const summary = `Difference: ${largerValue.toLocaleString()} - ${smallerValue.toLocaleString()} = ${diff.toLocaleString()}`;

    svg.append("text").attr("class","annotation")
        .attr("x", margins.left + plot.w/2).attr("y", margins.top - 10)
        .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
        .attr("fill", hlColor).text(summary);

    // 6. 차이 값을 DatumValue 객체로 반환
    return new DatumValue(xField, yField, 'Difference', op.targetA, diff, op.targetB);
}

export async function simpleLineNth(chartId, op, data) {
    const { svg, g, margins, plot, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return null;

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    if (points.empty()) return null;

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = '#20c997';
    
    const nodes = points.nodes();
    const total = nodes.length;
    if (!Number.isFinite(n) || n <= 0 || n > total) return null;

    const items = nodes.map((node) => ({
        node,
        cx: +node.getAttribute('cx') || 0,
        cy: +node.getAttribute('cy') || 0,
        id: d3.select(node).attr('data-id'),
    }));
    
    const ordered = items.slice().sort((a, b) => a.cx - b.cx);
    const sequence = from === 'right' ? ordered.slice().reverse() : ordered;
    
    const picked = sequence[n - 1];
    if (!picked) return null;

    await Promise.all([
        baseLine.transition().duration(200).attr('opacity', 0.3).end(),
        points.transition().duration(200).attr('opacity', 0.25).end()
    ]);

    const countedNodes = [];
    for (let i = 0; i < n; i++) {
        const currentItem = sequence[i];
        countedNodes.push(currentItem.node);
        const dp = d3.select(currentItem.node);
        
        await dp.transition().duration(100).attr('opacity', 1).attr('r', 7).end();

        g.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', currentItem.cx)
            .attr('y', currentItem.cy - 12)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .text(String(i + 1));
        
        await delay(200);
    }
    
    const finalTargetNode = countedNodes[n - 1];
    const otherCountedNodes = countedNodes.slice(0, n - 1);

    await Promise.all([
        d3.selectAll(otherCountedNodes).transition().duration(300).attr('opacity', 0.25).attr('r', 5).end(),
        g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end()
    ]);
    
    d3.select(finalTargetNode).attr('fill', hlColor);

    const cx = picked.cx;
    const cy = +d3.select(picked.node).attr('cy');
    
    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
    g.append("line").attr("class", "annotation")
        .attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth (from ${from}): ${n}`);

    const pickedId = String(picked.id);
    const targetDatum = data.find(d => {
        const cands = toPointIdCandidates(d.target);
        return cands.some(c => String(c) === pickedId);
    });

    return targetDatum || null;
}

export async function simpleLineCount(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return new DatumValue(xField, yField, 'Count', null, 0, null);
    }

    const baseLine = selectMainLine(g);
    const points   = selectMainPoints(g);
    if (points.empty()) {
        return new DatumValue(xField, yField, 'Count', null, 0, null);
    }

    const baseColor = '#a9a9a9';
    const hlColor   = '#20c997';

    await Promise.all([
        baseLine.transition().duration(150).attr('opacity', 0.3).end(),
        points.transition().duration(150).attr('fill', baseColor).attr('opacity', 0.3).end()
    ]);

    const nodes = points.nodes();
    const items = nodes.map((node) => ({
        node,
        cx: +node.getAttribute('cx') || 0,
        cy: +node.getAttribute('cy') || 0,
    }));
    const ordered = items.slice().sort((a, b) => a.cx - b.cx);
    const totalCount = ordered.length;

    for (let i = 0; i < totalCount; i++) {
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

    g.append('text')
        .attr('class', 'annotation')
        .attr('x', 0)
        .attr('y', -10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount}`)
        .attr('opacity', 0)
        .transition().duration(200).attr('opacity', 1);

    return new DatumValue(xField, yField, 'Count', null, totalCount, null);
}