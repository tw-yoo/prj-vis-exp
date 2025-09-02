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
    const { svg, g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const xAccessor = d => d ? d.target : undefined;
    const yAccessor = d => d ? d.value : undefined;
    
    // ★ 원본 스케일은 애니메이션 전반에 걸쳐 기준점으로 사용됩니다.
    const originalXScale = d3.scaleTime().domain(d3.extent(data, xAccessor)).range([0, plot.w]);
    const originalYMax = d3.max(data, yAccessor);
    const originalYScale = d3.scaleLinear().domain([0, originalYMax]).nice().range([plot.h, 0]);

    const originalLine = selectMainLine(g);
    const originalPoints = selectMainPoints(g);

    let filteredData;
    const transitionDuration = 1000;

    // --- 1. 데이터 필터링 및 기준선/영역 표시 (이전과 동일) ---
    if (op.field === yField) {
        const threshold = op.value;
        const satisfy = { '>': (a,b)=>a>b, '>=': (a,b)=>a>=b, '<': (a,b)=>a<b, '<=': (a,b)=>a<=b }[op.operator];
        if (!satisfy) return data;
        
        filteredData = data.filter(d => {
            const value = yAccessor(d);
            return typeof value === 'number' && satisfy(value, threshold);
        });
        
        const yPos = originalYScale(threshold);
        if (isNaN(yPos)) return data;

        g.append("line").attr("class", "annotation filter-line")
            .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "6 4")
            .attr("opacity", 0).transition().duration(500).attr("opacity", 1);
            
    } else if (op.field === xField && op.operator === 'between') {
        const [startYear, endYear] = op.value.map(v => parseInt(String(v).substring(0, 4)));
        filteredData = data.filter(d => {
            const dateVal = xAccessor(d);
            if (!dateVal || !(dateVal instanceof Date)) return false;
            const year = dateVal.getFullYear();
            return year >= startYear && year <= endYear;
        });
        
        const xStart = originalXScale(new Date(startYear, 0, 1));
        const xEnd = originalXScale(new Date(endYear, 11, 31));
        if(isNaN(xStart) || isNaN(xEnd)) return data;

        g.append("rect").attr("class", "annotation filter-range")
            .attr("x", xStart).attr("y", 0).attr("width", xEnd - xStart).attr("height", plot.h)
            .attr("fill", "steelblue").attr("opacity", 0)
            .transition().duration(500).attr("opacity", 0.2);
    } else {
        return data;
    }

    await delay(800);

    // 필터링된 데이터가 없는 경우 처리
    if (!filteredData || filteredData.length === 0) {
        originalLine.transition().duration(500).attr("opacity", 0.1);
        originalPoints.transition().duration(500).attr("opacity", 0.1);
        g.append("text").attr("class", "annotation empty-label")
            .attr("x", plot.w / 2).attr("y", plot.h / 2)
            .attr("text-anchor", "middle").attr("font-size", "16px").attr("font-weight", "bold")
            .text("No data matches the filter.");
        return [];
    }
    
    // --- 2. [핵심 수정] 집중 애니메이션 ---
    const filteredDataIds = new Set(filteredData.map(d => d.id));

    // 1. 원본 라인은 '배경'처럼 흐려짐
    originalLine.transition().duration(transitionDuration)
        .attr("stroke", "#eee")
        .attr("stroke-width", 1.5);
    
    // 2. 선택되지 않은 포인트들도 흐려짐
    originalPoints.filter(d => !filteredDataIds.has(d.id))
        .transition().duration(transitionDuration)
        .attr("opacity", 0.2);
    
    // 3. ⭐ 필터링된 부분만 '강조 라인'으로 위에 덧그림
    const highlightLineGenerator = d3.line()
        .x(d => originalXScale(xAccessor(d)))
        .y(d => originalYScale(yAccessor(d)));

    const highlightLine = g.append("path")
        .attr("class", "annotation highlight-line")
        .datum(filteredData)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2.5)
        .attr("d", highlightLineGenerator);

    // --- 3. 확대 및 이동 (Transform) 애니메이션 ---
    await delay(1000); // 1초 대기

    // 새 스케일 계산
    const newXScale = d3.scaleTime().domain(d3.extent(filteredData, xAccessor)).range([0, plot.w]);
    const newYScale = d3.scaleLinear().domain([0, d3.max(filteredData, yAccessor)]).nice().range([plot.h, 0]);
    const newLineGen = d3.line().x(d => newXScale(xAccessor(d))).y(d => newYScale(yAccessor(d)));

    // 축(Axis) 전환
    g.select(".x-axis").transition().duration(transitionDuration)
        .call(d3.axisBottom(newXScale));
    g.select(".y-axis").transition().duration(transitionDuration)
        .call(d3.axisLeft(newYScale));

    // '강조 라인'이 새로운 스케일에 맞춰 변신
    highlightLine.transition().duration(transitionDuration)
        .attr("d", newLineGen);

    // 선택된 포인트들도 새 위치로 이동
    originalPoints.filter(d => filteredDataIds.has(d.id))
        .transition().duration(transitionDuration)
        .attr("cx", d => newXScale(xAccessor(d)))
        .attr("cy", d => newYScale(yAccessor(d)));

    // 변신이 시작되면 배경 요소들(원본 라인, 흐려진 점)은 완전히 사라짐
    originalLine.transition().duration(transitionDuration).attr("opacity", 0).remove();
    originalPoints.filter(d => !filteredDataIds.has(d.id))
        .transition().duration(transitionDuration).attr("opacity", 0).remove();

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

    const points = selectMainPoints(g);
    const hlColor = "#0d6efd";

    const getY = (d) => (d && typeof d.value === 'number') ? d.value : NaN;
    const values = data.map(getY).filter(v => !isNaN(v));
    
    if (values.length === 0) return null;

    const minV = d3.min(values);
    const maxV = d3.max(values);

    const findPointsByValue = (v) => points.filter(function() {
        return +d3.select(this).attr("data-value") === +v;
    });

    const minPts = findPointsByValue(minV);
    const maxPts = findPointsByValue(maxV);

    // 1. 최솟값/최댓값 포인트를 부드럽게 강조합니다.
    const highlightTransition = (selection) => {
        if (!selection.empty()) {
            selection.transition().duration(800)
                .attr("opacity", 1)
                .attr("r", 8)
                .attr("fill", hlColor)
                .attr("stroke", "white")
                .attr("stroke-width", 2);
        }
    };
    highlightTransition(minPts);
    highlightTransition(maxPts);
    
    // ⭐ [핵심 수정] 라벨을 포인트 위에 다는 새로운 함수
    const annotateValuePoints = (value, label, pointsSelection) => {
        if (value === undefined || pointsSelection.empty()) return;
        
        const yScale = d3.scaleLinear().domain([0, d3.max(values)]).nice().range([plot.h, 0]);
        const yPos = yScale(value);

        // 수평선이 왼쪽에서 오른쪽으로 그려지는 애니메이션은 그대로 유지
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos)
            .attr("x2", 0).attr("y2", yPos)
            .attr("stroke", hlColor)
            .attr("stroke-dasharray", "4 4")
            .transition().duration(1000)
            .attr("x2", plot.w);

        // 선택된 각 포인트 '바로 위'에 라벨을 추가
        pointsSelection.each(function() {
            const point = d3.select(this);
            const cx = +point.attr("cx");
            const cy = +point.attr("cy");

            g.append("text").attr("class", "annotation")
                .attr("x", cx)
                .attr("y", cy - 15) // 포인트의 y좌표보다 15px 위에 위치
                .attr("text-anchor", "middle") // 텍스트를 포인트 중앙에 정렬
                .attr("fill", hlColor)
                .attr("font-weight", "bold")
                .attr("stroke", "white")
                .attr("stroke-width", 3.5)
                .attr("paint-order", "stroke")
                .text(`${label}: ${value.toLocaleString()}`);
        });
    };
    
    await delay(200); // 포인트 강조와 라인/라벨 애니메이션 사이의 미세한 딜레이
    
    // 2. 수정된 함수 호출
    annotateValuePoints(minV, "Min", minPts);
    annotateValuePoints(maxV, "Max", maxPts);

    // 3. 차트 상단 최종 범위 라벨은 그대로 유지
    const summaryText = `Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`;
    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 12)
        .attr("font-size", 16)
        .attr("font-weight", "bold")
        .attr("fill", hlColor)
        .attr("stroke", "white")
        .attr("stroke-width", 4)
        .attr("paint-order", "stroke")
        .attr("opacity", 0)
        .text(summaryText)
        .transition().duration(500).delay(500)
        .attr("opacity", 1);

    return new IntervalValue(yField, minV, maxV);
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