import {
    retrieveValue as dataRetrieveValue,
    filterData as dataFilter,
    sortData as dataSort,
    findExtremum as dataFindExtremum,
    determineRange as dataDetermineRange,
    sumData as dataSum,
    averageData as dataAverage,
    diffData as dataDiff,
    diffData as dataDiffDual,
    nthData as dataNth,
    compareOp as dataCompare,
    compareBoolOp as dataCompareBool,
    // compareDual as dataCompareDual,
    // compareBoolDual as dataCompareBoolDual,
    countData as dataCount
} from "../../lineChartOperationFunctions.js";
import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import { getPrimarySvgElement } from "../../operationUtil.js";
import {
    simpleLineRetrieveValue,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineDetermineRange,
    simpleLineNth,
    simpleLineCompareBool,
    simpleLineCompare,
    simpleLineAverage,
    simpleLineSum,
    simpleLineDiff,
    simpleLineCount,
    simpleLineSort
} from "../simple/simpleLineFunctions.js";
import { OP_COLORS } from "../../../../object/colorPalette.js";

/**
 * 작업 완료 신호를 DOM 이벤트로 방출합니다.
 * window.addEventListener('viz:op:done', e => { ... })
 */
function emitOpDone(svg, chartId, opName, detail = {}) {
    try {
        const ev = new CustomEvent('viz:op:done', {
            detail: { chartId, op: opName, ...detail },
            bubbles: true,
            composed: true,
            cancelable: false
        });
        const node = svg && typeof svg.node === 'function' ? svg.node() : null;
        (node || document).dispatchEvent(ev);
    } catch (e) { /* noop */ }
}

// -------------------- Helpers --------------------
const fmtISO = d3.timeFormat("%Y-%m-%d");

// --- Util: Normalize a target value to id string
function toTargetId(v){
    const d = parseDate(v);
    return d ? fmtISO(d) : String(v);
}

function parseDate(v) {
    if (v instanceof Date) return v;
    const d = new Date(v);
    if (!isNaN(+d)) return d;
    if (typeof v === "string" && /^\d{4}$/.test(v)) return new Date(+v, 0, 1);
    return null;
}

function isSameDateOrValue(val1, val2) {
    const d1 = parseDate(val1);
    const d2 = parseDate(val2);
    if (d1 && d2) {
        return fmtISO(d1) === fmtISO(d2);
    }
    return String(val1) === String(val2);
}

/** 외부 필드명을 내부 필드명으로 매핑 (시각화 주석에만 사용) */
function mapFieldName(field) {
    const f = String(field || '').toLowerCase();
    if (['target','date','x','year','time','category','label'].includes(f)) return 'target';
    if (['value','y','measure','val','metric'].includes(f)) return 'value';
    if (['group','series','color','line','stack','segment'].includes(f)) return 'group';
    return field;
}

function getSvgAndSetup(chartId) {
    const svgNode = getPrimarySvgElement(chartId);
    const svg = svgNode ? d3.select(svgNode) : d3.select(null);
    const g = svg.select(".plot-area");
    const margins = { left: +(svgNode?.getAttribute("data-m-left") || 0), top: +(svgNode?.getAttribute("data-m-top") || 0) };
    const plot = { w: +(svgNode?.getAttribute("data-plot-w") || 0), h: +(svgNode?.getAttribute("data-plot-h") || 0) };
    const xField = svgNode?.getAttribute("data-x-field");
    const yField = svgNode?.getAttribute("data-y-field");
    const colorField = svgNode?.getAttribute("data-color-field");
    return { svg, g, margins, plot, xField, yField, colorField };
}

function clearAllAnnotations(svg) {
    svg.selectAll(".annotation").remove();
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function buildScales(data, plot) {
    const xVals = data.map(d => d.target);
    const isTemporal = xVals.every(v => v instanceof Date);
    const xScale = isTemporal
        ? d3.scaleTime().domain(d3.extent(xVals)).range([0, plot.w])
        : d3.scalePoint().domain(xVals.map(v => String(v))).range([0, plot.w]);

    const yValues = data.map(d => d.value).filter(v => Number.isFinite(v));
    const yMax = d3.max(yValues);
    const yMin = d3.min(yValues);
    const yScale = d3.scaleLinear().domain([yMin > 0 ? 0 : yMin, yMax]).nice().range([plot.h, 0]);

    return { xScale, yScale };
}

function selectAllLines(g) {
    return g.selectAll("path.series-line");
}
function selectAllPoints(g) {
    return g.selectAll("circle.datapoint");
}



// Helper: delegate to simple-line if op.group is present, with optional onlyTargets whitelist for points
async function delegateToSimpleIfGrouped(chartId, op, data, simpleFn, requirePoints = false) {
    if (op && op.group != null) {
        let onlyTargets = null;
        const name = op.op || op.type || '';
        // Whitelist for point-based ops so we don't draw all points
        if (requirePoints) {
            if (name === 'compare' || name === 'compareBool' || name === 'diff') {
                // single-group shape
                const tA = op?.targetA?.category ?? op?.targetA;
                const tB = op?.targetB?.category ?? op?.targetB;
                if (tA != null && tB != null) {
                    onlyTargets = [toTargetId(tA), toTargetId(tB)];
                }
            } else if (name === 'retrieveValue') {
                const t = op?.target?.category ?? op?.target;
                if (t != null) onlyTargets = [toTargetId(t)];
            }
            // findExtremum/min/max는 대상 값이 데이터 계산 후에 정해지므로 여기서는 전체 미생성 유지(onlyTargets=null)로 두되,
            // simple 함수 내부 폴백/주석 렌더링을 사용.
        }
        const opts = { drawPoints: !!requirePoints, preserveStroke: true, onlyTargets };
        const filtered = await multipleLineChangeToSimple(chartId, { group: op.group }, data, opts);
        const op2 = { ...op };
        delete op2.group;
        return await simpleFn(chartId, op2, filtered);
    }
    return null; // no delegation
}

// -------------------- Operations (Data+Visual separation) --------------------

export async function multipleLineRetrieveValue(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineRetrieveValue, true);
    if (delegated !== null) return delegated;

    const targetDatums = dataRetrieveValue(data, op);
    if (!Array.isArray(targetDatums) || targetDatums.length === 0) return [];

    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const cx = xScale(targetDatums[0].target);

selectAllLines(g).attr("opacity", 1).attr("stroke-width", 2);
await selectAllLines(g).transition().duration(500)
    .attr("opacity", 0.3)
    .attr("stroke-width", 1.5)
    .end().catch(() => {});

    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", plot.h)
        .attr("x2", cx).attr("y2", 0)
        .attr("stroke", OP_COLORS.RETRIEVE_VALUE).attr("stroke-dasharray", "4 4");

    const pending = [];
    targetDatums.forEach(datum => {
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);

        const hLineT = g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "2 2").attr("opacity", 0.7)
            .transition().duration(0);
        pending.push(hLineT.end().catch(()=>{}));

        const cT = g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
            .transition().duration(400).delay(200).attr("r", 6);
        pending.push(cT.end().catch(()=>{}));

        const txtT = g.append("text").attr("class", "annotation")
            .attr("x", cx + 8).attr("y", cy)
            .attr("dominant-baseline", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(datum.value.toLocaleString())
            .attr("opacity", 0).transition().duration(400).delay(300).attr("opacity", 1);
        pending.push(txtT.end().catch(()=>{}));
    });

    await Promise.all(pending).catch(()=>{});
    emitOpDone(svg, chartId, 'multipleLineRetrieveValue', { count: targetDatums.length });
    return targetDatums;
}

export async function multipleLineFilter(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineFilter);
    if (delegated !== null) return delegated;

    const filteredData = dataFilter(data, op);

    const { xScale: originalXScale, yScale: originalYScale } = buildScales(data, plot);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(new Set(data.map(d => d.group))));
    const internalField = mapFieldName(op.field);

    if (internalField === 'value' && typeof op.value !== 'undefined' && op.operator && op.operator !== 'between') {
        const yPos = originalYScale(+op.value);
        if (!isNaN(yPos)) {
            g.append("line").attr("class", "annotation")
                .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
                .attr("stroke", OP_COLORS.FILTER_THRESHOLD).attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
            g.append("text").attr("class", "annotation")
                .attr("x", plot.w - 5).attr("y", yPos - 5)
                .attr("text-anchor", "end").attr("fill", OP_COLORS.FILTER_THRESHOLD).attr("font-weight", "bold").attr("font-size", "12px")
                .text(`${op.operator} ${(+op.value).toLocaleString()}`);
        }
    } else if (internalField === 'target' && op.operator === 'between' && Array.isArray(op.value)) {
        const [start, end] = op.value.map(parseDate);
        if (start && end) {
            const xStart = originalXScale(start);
            const xEnd = originalXScale(end);
            g.append("rect").attr("class", "annotation")
                .attr("x", xStart).attr("y", 0).attr("width", xEnd - xStart).attr("height", plot.h)
                .attr("fill", OP_COLORS.FILTER_THRESHOLD).attr("opacity", 0.15);
        }
    }

    await delay(600);

    if (!filteredData || filteredData.length === 0) {
        await g.selectAll("path.series-line, circle.datapoint").transition().duration(400).attr("opacity", 0.1).end().catch(() => {});
        g.append("text").attr("class", "annotation")
            .attr("x", plot.w / 2).attr("y", plot.h / 2)
            .attr("text-anchor", "middle").attr("font-size", "16px")
            .attr("font-weight", "bold").text("No data matches the filter.");
        return [];
    }

    selectAllLines(g).transition().duration(800).attr("opacity", 0.1);
    selectAllPoints(g).transition().duration(800).attr("opacity", 0).remove();

    const lineGen = d3.line().x(d => originalXScale(d.target)).y(d => originalYScale(d.value));
    const grouped = d3.groups(filteredData, d => d.group);

    g.selectAll(".highlight-line")
        .data(grouped)
        .join("path")
        .attr("class", "annotation highlight-line")
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d[0]))
        .attr("stroke-width", 2.5)
        .attr("opacity", 0)
        .attr("d", d => lineGen(d[1]))
        .transition().duration(700).attr("opacity", 1);

    const xAxis = g.select(".x-axis");
    const yAxis = g.select(".y-axis");
    if (!xAxis.empty() && !yAxis.empty()) {
        const { xScale: newXScale, yScale: newYScale } = buildScales(filteredData, plot);
        const newLineGen = d3.line().x(d => newXScale(d.target)).y(d => newYScale(d.value));
        await Promise.all([
            xAxis.transition().duration(900).call(d3.axisBottom(newXScale)).end().catch(() => {}),
            yAxis.transition().duration(900).call(d3.axisLeft(newYScale)).end().catch(() => {}),
            g.selectAll(".highlight-line").transition().duration(900).attr("d", d => newLineGen(d[1])).end().catch(() => {})
        ]);
        g.selectAll(".highlight-line").attr("class", "series-line").classed("annotation", false);
    }

    emitOpDone(svg, chartId, 'multipleLineFilter', { count: filteredData.length });
    return filteredData;
}

export async function multipleLineFindExtremum(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineFindExtremum, true);
    if (delegated !== null) return delegated;

    const extremumDatums = dataFindExtremum(data, op);
    if (!Array.isArray(extremumDatums) || extremumDatums.length === 0) return null;

    const formatTarget = (t) => (t instanceof Date ? fmtISO(t) : String(t));
    const formatValue = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString() : String(v);
    };

    await selectAllPoints(g).transition().duration(600).attr("opacity", 0).end().catch(() => {});
    const { xScale, yScale } = buildScales(data, plot);
    const which = op.which || 'max';
    const pending = [];

    extremumDatums.forEach(datum => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = OP_COLORS.EXTREMUM;

        const vT = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(700).delay(200).attr("y2", plot.h);
        pending.push(vT.end().catch(()=>{}));

        const hT = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(700).delay(200).attr("x2", 0);
        pending.push(hT.end().catch(()=>{}));

        const cT = g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
            .transition().duration(500).delay(200).attr("r", 7);
        pending.push(cT.end().catch(()=>{}));

        const text = g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 20).attr("text-anchor", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke");
        text.append("tspan").attr("x", cx).attr("dy", "0em").text(`${which[0].toUpperCase() + which.slice(1)}: ${formatValue(datum.value)}`);
        text.append("tspan").attr("x", cx).attr("dy", "1.2em").text(`(${formatTarget(datum.target)})`);
    });

    await Promise.all(pending).catch(()=>{});
    emitOpDone(svg, chartId, 'multipleLineFindExtremum', { which });
    return extremumDatums[0] || null;
}

export async function multipleLineDetermineRange(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineDetermineRange);
    if (delegated !== null) return delegated;

    const rangeResult = dataDetermineRange(data, op);
    if (!rangeResult) return null;
    const minV = rangeResult.min;
    const maxV = rangeResult.max;

    const hasNumeric = Number.isFinite(minV) && Number.isFinite(maxV);

    await selectAllPoints(g).transition().duration(600).attr("opacity", 0).remove().end().catch(() => {});
    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(new Set(data.map(d => d.group))));
    const hlColor = OP_COLORS.RANGE;
    const pending = [];

    const formatValue = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString() : String(v);
    };
    const almostEqual = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

    const minDatumsComputed = hasNumeric ? data.filter(d => Number.isFinite(d.value) && almostEqual(d.value, minV)) : [];
    const maxDatumsComputed = hasNumeric ? data.filter(d => Number.isFinite(d.value) && almostEqual(d.value, maxV)) : [];

    const annotateValue = (value, label, datumsArr) => {
        if (!Number.isFinite(value)) return;
        const yPos = yScale(value);
        
        // 가로선 애니메이션
        const lineT = g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
            .transition().duration(1000).attr("x2", plot.w);
        pending.push(lineT.end().catch(()=>{}));

        const arr = Array.isArray(datumsArr) ? datumsArr : [];
        
        // 데이터 포인트가 있으면 각 포인트에 점과 레이블 표시
        if (arr.length > 0) {
            arr.forEach(datum => {
                const cx = xScale(datum.target);
                const color = seriesColors(datum.group);
                
                const cT = g.append("circle").attr("class", "annotation")
                    .attr("cx", cx).attr("cy", yPos).attr("r", 0)
                    .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
                    .transition().duration(500).delay(200).attr("r", 7);
                pending.push(cT.end().catch(()=>{}));
                
                const tT = g.append("text").attr("class", "annotation")
                    .attr("x", cx).attr("y", yPos - 12).attr("text-anchor", "middle")
                    .attr("font-weight", "bold").attr("fill", color)
                    .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
                    .text(`${label}: ${formatValue(value)}`)
                    .attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
                pending.push(tT.end().catch(()=>{}));
            });
        } else {
            // 데이터 포인트가 없으면 오른쪽 끝에 레이블만 표시
            const fbT = g.append("text").attr("class", "annotation")
                .attr("x", plot.w - 6).attr("y", yPos - 6)
                .attr("text-anchor", "end")
                .attr("font-weight", "bold").attr("fill", hlColor)
                .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
                .text(`${label}: ${formatValue(value)}`)
                .attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
            pending.push(fbT.end().catch(()=>{}));
        }
    };

    if (hasNumeric) {
        annotateValue(minV, "Min", minDatumsComputed);
        annotateValue(maxV, "Max", maxDatumsComputed);

        await delay(400);
        const sumT = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor).text(`Range: ${formatValue(minV)} ~ ${formatValue(maxV)}`)
            .attr("opacity", 0).transition().duration(400).delay(600).attr("opacity", 1);
        pending.push(sumT.end().catch(()=>{}));
    } else {
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(`Range available on category '${rangeResult.category}', but no numeric min/max to display.`)
            .attr("opacity", 0).transition().duration(400).delay(600).attr("opacity", 1);
    }

    await Promise.all(pending).catch(()=>{});
    emitOpDone(svg, chartId, 'multipleLineDetermineRange', { min: minV, max: maxV });
    return rangeResult;
}


export async function multipleLineNth(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineNth, true);
    if (delegated !== null) return delegated;

    // Data
    const nthData = dataNth(data, op);
    if (!Array.isArray(nthData) || nthData.length === 0) return [];

    // Visual
    const allLines = selectAllLines(g);
    const allPoints = selectAllPoints(g);
    await Promise.all([
        allLines.transition().duration(300).attr("opacity", 0.2).end().catch(()=>{}),
        allPoints.transition().duration(300).attr("opacity", 0.2).end().catch(()=>{})
    ]);

    const { xScale, yScale } = buildScales(data, plot);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(new Set(data.map(d => d.group))));

    const pickedCategory = nthData[0].target instanceof Date ? fmtISO(nthData[0].target) : String(nthData[0].target);

    nthData.forEach(datum => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("text").attr("class", "annotation").attr("x", cx + 8).attr("y", cy).attr("dominant-baseline", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString());
    });

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.NTH)
        .text(`Nth (from ${op.from || 'left'}): ${op.n} (${pickedCategory})`);

    emitOpDone(svg, chartId, 'multipleLineNth', { n: op.n, from: op.from || 'left', target: pickedCategory });
    return nthData;
}

export async function multipleLineCompareBool(chartId, op, data) {
    const { svg, g, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineCompareBool, true);
    if (delegated !== null) return delegated;

    let boolResult = null;
    let datumA = null, datumB = null;
    const opIsDual = op?.targetA?.category !== undefined || op?.groupA !== undefined;

    if (opIsDual) {
        const dual = {
            targetA: op.targetA?.category ?? op.targetA,
            groupA: op.targetA?.series ?? op.groupA,
            targetB: op.targetB?.category ?? op.targetB,
            groupB: op.targetB?.series ?? op.groupB,
            operator: op.operator || '>'
        };
        boolResult = dataCompareBoolDual(data, dual);
        datumA = data.find(d => isSameDateOrValue(d.target, dual.targetA) && String(d.group) === String(dual.groupA));
        datumB = data.find(d => isSameDateOrValue(d.target, dual.targetB) && String(d.group) === String(dual.groupB));
    } else {
        const same = { targetA: op.targetA, targetB: op.targetB, operator: op.operator || '>', group: op.group ?? null };
        boolResult = dataCompareBool(data, same);
        datumA = data.find(d => isSameDateOrValue(d.target, same.targetA) && (same.group == null || String(d.group) === String(same.group)));
        datumB = data.find(d => isSameDateOrValue(d.target, same.targetB) && (same.group == null || String(d.group) === String(same.group)));
    }

    if (!boolResult || !datumA || !datumB) return boolResult ?? new BoolValue("Compare failed", false);

    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);

    const pending = [];
    pending.push(selectAllLines(g).transition().duration(600).attr("opacity", 0.1).end().catch(()=>{}));
    pending.push(selectAllPoints(g).transition().duration(600).attr("opacity", 0.1).end().catch(()=>{}));

    const annotate = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const vT = g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        pending.push(vT.end().catch(()=>{}));
        const hT = g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        pending.push(hT.end().catch(()=>{}));
        const cT = g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).attr("r", 7);
        pending.push(cT.end().catch(()=>{}));
        const tT = g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString()).attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
        pending.push(tT.end().catch(()=>{}));
    };

    annotate(datumA, colorScale(datumA.group));
    annotate(datumB, colorScale(datumB.group));

    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
const summary = `${datumA.value.toLocaleString()} (${datumA.group})${symbol}${datumB.value.toLocaleString()} (${datumB.group}) → ${boolResult.bool}`;  // 변경
const color = boolResult.bool ? OP_COLORS.TRUE : OP_COLORS.FALSE; 
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", color).text(summary);

    await Promise.all(pending).catch(()=>{});
    emitOpDone(svg, chartId, 'multipleLineCompareBool', { result: !!boolResult?.value });
    return boolResult;
}

export async function multipleLineCompare(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineCompare, true);
    if (delegated !== null) return delegated;

    let winners = [];
    let datumA = null, datumB = null;
    const opIsDual = op?.targetA?.category !== undefined || op?.groupA !== undefined;

    if (opIsDual) {
        const dual = {
            targetA: op.targetA?.category ?? op.targetA,
            groupA: op.targetA?.series ?? op.groupA,
            targetB: op.targetB?.category ?? op.targetB,
            groupB: op.targetB?.series ?? op.groupB,
            which: (op.which || 'max')
        };
        winners = dataCompareDual(data, dual) || [];
        datumA = data.find(d => isSameDateOrValue(d.target, dual.targetA) && String(d.group) === String(dual.groupA));
        datumB = data.find(d => isSameDateOrValue(d.target, dual.targetB) && String(d.group) === String(dual.groupB));
    } else {
        const same = { targetA: op.targetA, targetB: op.targetB, which: (op.which || 'max'), group: op.group ?? null };
        winners = dataCompare(data, same) || [];
        datumA = data.find(d => isSameDateOrValue(d.target, same.targetA) && (same.group == null || String(d.group) === String(same.group)));
        datumB = data.find(d => isSameDateOrValue(d.target, same.targetB) && (same.group == null || String(d.group) === String(same.group)));
    }

    if (!datumA || !datumB) {
        console.warn("Compare: points not found");
        return winners;
    }

    const { xScale, yScale } = buildScales(data, plot);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(new Set(data.map(d => d.group))));
    const winColor = OP_COLORS.COMPARE_WINNER;

    const annotate = (datum, star) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);
        g.append("line").attr("class","annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("line").attr("class","annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("text").attr("class","annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor","middle").attr("fill",color).attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text(datum.value.toLocaleString());
        if (star) g.append("text").attr("class","annotation").attr("x", cx).attr("y", cy - 30).attr("text-anchor","middle").attr("fill", winColor).attr("font-weight","bold").text("★");
    };

    const isWinner = (d) => winners.some(w => isSameDateOrValue(w.target, d.target) && String(w.group) === String(d.group));

    await selectAllLines(g).transition().duration(600).attr("opacity", 0.3).end().catch(()=>{});
    annotate(datumA, isWinner(datumA));
    annotate(datumB, isWinner(datumB));

    svg.append("text").attr("class","annotation")
        .attr("x", margins.left + plot.w/2).attr("y", margins.top - 10)
        .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
        .attr("fill", winColor).text(`${(op.which || 'max').toUpperCase()} chosen`);

    emitOpDone(svg, chartId, 'multipleLineCompare', { which: op.which || 'max', winners: winners?.length || 0 });
    return winners;
}

export async function multipleLineAverage(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineAverage);
    if (delegated !== null) return delegated;
    if (!data || data.length === 0) return null;

    const result = dataAverage(data, op);
    if (!result) return null;
    const avg = result[0].value;

    const { yScale } = buildScales(data, plot);
    const yPos = yScale(avg);
    const color = OP_COLORS.AVERAGE;
    const line = g.append("line").attr("class", "annotation avg-line")
        .attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    await line.transition().duration(800).attr("x2", plot.w).end().catch(()=>{});
    const avgTextT = g.append("text").attr("class", "annotation avg-label")
        .attr("x", plot.w - 10).attr("y", yPos - 5).attr("text-anchor", "end")
        .attr("fill", color).attr("font-weight", "bold")
        .attr("stroke","white").attr("stroke-width",3.5).attr("paint-order","stroke")
        .text(`Avg: ${avg.toLocaleString(undefined, {maximumFractionDigits: 2})}`)
        .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);
    await avgTextT.end().catch(()=>{});
    emitOpDone(svg, chartId, 'multipleLineAverage', { value: avg });
    return result;
}

export async function multipleLineSum(chartId, op, data) {
    const { svg, g } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineSum);
    if (delegated !== null) return delegated;

    const result = dataSum(data, op);
    if (!result) return null;
    const total = result.value;
    const hlColor = OP_COLORS.SUM;

    await selectAllLines(g).transition().duration(300).attr("opacity", 0.4).end().catch(()=>{});
    const boxT = g.append("rect").attr("class", "annotation")
        .attr("x", 6).attr("y", 6).attr("rx", 6).attr("ry", 6)
        .attr("width", 0).attr("height", 26)
        .attr("fill", hlColor).attr("opacity", 0.12)
        .transition().duration(500).attr("width", 220);
    const txtT = g.append("text").attr("class", "annotation")
        .attr("x", 14).attr("y", 24).attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(`Sum${op.group ? ` (${op.group})` : ''}: ${total.toLocaleString()}`)
        .attr("opacity", 0).transition().duration(500).attr("opacity", 1);
    await Promise.all([boxT.end().catch(()=>{}), txtT.end().catch(()=>{})]);
    emitOpDone(svg, chartId, 'multipleLineSum', { value: total });

    return result;
}

export async function multipleLineDiff(chartId, op, data) {
    const { svg, g, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineDiff, true);
    if (delegated !== null) return delegated;

    let diffResult = null;
    let datumA = null, datumB = null;
    const opIsDual = op?.targetA?.category !== undefined || op?.groupA !== undefined;

    if (opIsDual) {
        const dual = {
            targetA: op.targetA?.category ?? op.targetA,
            groupA: op.targetA?.series ?? op.groupA,
            targetB: op.targetB?.category ?? op.targetB,
            groupB: op.targetB?.series ?? op.groupB,
            signed: !!op.signed,
            field: op.field
        };
        diffResult = dataDiffDual(data, dual);
        datumA = data.find(d => isSameDateOrValue(d.target, dual.targetA) && String(d.group) === String(dual.groupA));
        datumB = data.find(d => isSameDateOrValue(d.target, dual.targetB) && String(d.group) === String(dual.groupB));
    } else {
        const same = { targetA: op.targetA, targetB: op.targetB, signed: !!op.signed, field: op.field, group: op.group ?? null };
        diffResult = dataDiff(data, same);
        datumA = data.find(d => isSameDateOrValue(d.target, same.targetA) && (same.group == null || String(d.group) === String(same.group)));
        datumB = data.find(d => isSameDateOrValue(d.target, same.targetB) && (same.group == null || String(d.group) === String(same.group)));
    }

    if (!diffResult || !datumA || !datumB) return diffResult;

    const { xScale, yScale } = buildScales(data, plot);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(new Set(data.map(d => d.group))));
    await selectAllLines(g).transition().duration(600).attr("opacity", 0.1).end().catch(()=>{});

    const annotate = (datum) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString());
    };

    annotate(datumA);
    annotate(datumB);

    const summary = `Difference (Δ): ${diffResult.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", "#333").text(summary);

    emitOpDone(svg, chartId, 'multipleLineDiff', { value: diffResult.value });
    return diffResult;
}

export async function multipleLineCount(chartId, op, data) {
    const { svg, g, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineCount, true);
    if (delegated !== null) return delegated;

    const countResult = dataCount(data, op);

    const allLines = selectAllLines(g);
    const allPoints = selectAllPoints(g);
    await Promise.all([
        allLines.transition().duration(200).attr('opacity', 0.2).end().catch(() => {}),
        allPoints.transition().duration(200).attr('opacity', 0.2).end().catch(() => {})
    ]);

    const nodes = allPoints.nodes().sort((a, b) => (+a.getAttribute('cx')) - (+b.getAttribute('cx')));
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const sel = d3.select(node);
        const cx = +sel.attr('cx'),
            cy = +sel.attr('cy');
        await sel.transition().duration(40).attr('opacity', 1).attr('r', 6).end().catch(() => {});
        g.append('text').attr('class', 'annotation count-label')
            .attr('x', cx).attr('y', cy - 10)
            .attr('text-anchor', 'middle').attr('font-weight', 'bold')
            .attr('font-size', '10px').attr('fill', OP_COLORS.COUNT)
            .attr('stroke', 'white').attr('stroke-width', 2).attr('paint-order', 'stroke')
            .text(String(i + 1));
        await delay(40);
    }
    await g.selectAll('.count-label').transition().duration(500).delay(200).attr('opacity', 0).remove().end().catch(() => {});

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.COUNT)
        .text(`Count${op.group ? ` (${op.group})` : ''}: ${countResult?.value ?? 0}`);

    emitOpDone(svg, chartId, 'multipleLineCount', { value: countResult?.value ?? 0 });
    return countResult;
}

export async function multipleLineSort(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const delegated = await delegateToSimpleIfGrouped(chartId, op, data, simpleLineSort);
    if (delegated !== null) return delegated;

    const sorted = dataSort(data, op);
    if (!sorted || sorted.length === 0) return sorted || [];

    const points = selectAllPoints(g);
    await Promise.all([
        selectAllLines(g).transition().duration(300).attr("opacity", 0.2).end().catch(() => {}),
        points.transition().duration(300).attr("opacity", 0.25).end().catch(() => {})
    ]);

    const idToRank = new Map(sorted.map((d, i) => [String(d.id), i + 1]));
    const hlColor = OP_COLORS.COUNT; // Using COUNT for TEAL color

    points.each(function(d) {
        const node = d3.select(this);
        const rank = idToRank.get(String(node.attr("data-id")));
        if (!rank) return;
        const cx = +node.attr("cx");
        const cy = +node.attr("cy");
        g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 12)
            .attr("text-anchor", "middle").attr("fill", hlColor)
            .attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(String(rank));
    });

    const sortedCoords = sorted.map(d => {
        const circle = points.filter(function() { return d3.select(this).attr("data-id") === String(d.id); });
        return { x: +circle.attr("cx"), y: +circle.attr("cy") };
    }).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    const overlay = d3.line().x(d => d.x).y(d => d.y);
    const overlayT = g.append("path").attr("class", "annotation")
        .datum(sortedCoords)
        .attr("fill", "none").attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "3 5").attr("opacity", 0)
        .attr("d", overlay)
        .transition().duration(600).attr("opacity", 0.7);
    await overlayT.end().catch(()=>{});

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", hlColor).text(`Sorted by ${op.field} (${op.order || 'asc'})${op.group ? ` in ${op.group}` : ''}`);

    emitOpDone(svg, chartId, 'multipleLineSort', { field: op.field, order: op.order || 'asc' });
    return sorted;
}

export async function multipleLineChangeToSimple(chartId, op, data, opts = { drawPoints: false, preserveStroke: true }) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetSeriesKey = op.group;
    if (!targetSeriesKey) {
        console.warn("ChangeToSimple requires a 'group' property.");
        return data;
    }

    const filteredData = data.filter(d => String(d.group) === String(targetSeriesKey));
    if (filteredData.length === 0) {
        console.warn(`Series with key '${targetSeriesKey}' not found in data.`);
        return [];
    }

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(new Set(data.map(d => d.group))));
    const highlightColor = colorScale(targetSeriesKey);

    const allLines = selectAllLines(g);
    const getKey = (d, node) => {
        if (d == null && node) return node.getAttribute("data-series");
        if (Array.isArray(d)) return d[0];
        if (typeof d === 'object') {
            if ('key' in d) return d.key;
            if ('group' in d) return d.group;
            if ('series' in d) return d.series;
            if ('name' in d) return d.name;
        }
        return null;
    };

    let targetLine = allLines.filter(function(d) {
        const k = getKey(d, this);
        return String(k) === String(targetSeriesKey);
    });
    const otherLines = allLines.filter(function(d) {
        const k = getKey(d, this);
        return String(k) !== String(targetSeriesKey);
    });

    await Promise.all([
        otherLines.transition().duration(800).attr("opacity", 0).remove().end().catch(() => {}),
        (!targetLine.empty() && !opts.preserveStroke) ?
            targetLine.transition().duration(800).attr("stroke-width", 3.5).end().catch(() => {}) :
            Promise.resolve(),
        svg.select(".legend").transition().duration(800).attr("opacity", 0).remove().end().catch(() => {})
    ]).catch(() => {});

    const { xScale: xScaleNew, yScale: yScaleNew } = buildScales(filteredData, plot);
    const lineGen = d3.line().x(d => xScaleNew(d.target)).y(d => yScaleNew(d.value));

    if (targetLine.empty()) {
        targetLine = g.append("path")
            .datum(filteredData)
            .attr("class", "series-line")
            .attr("fill", "none")
            .attr("stroke", highlightColor)
            .attr("stroke-width", 3.0)
            .attr("opacity", 0);
        targetLine.transition().duration(300).attr("opacity", 1).catch(() => {});
    } else {
        targetLine.datum(filteredData);
    }

    await targetLine.transition().duration(1000).attr("d", lineGen(filteredData)).end().catch(() => {});

    const xAxisSel = g.select(".x-axis");
    const yAxisSel = g.select(".y-axis");
    await Promise.all([
        !xAxisSel.empty() ? xAxisSel.transition().duration(1000).call(d3.axisBottom(xScaleNew)).end().catch(() => {}) : Promise.resolve(),
        !yAxisSel.empty() ? yAxisSel.transition().duration(1000).call(d3.axisLeft(yScaleNew)).end().catch(() => {}) : Promise.resolve()
    ]).catch(() => {});

    g.selectAll("circle.datapoint, circle.datapoint-highlight, circle.main-dp").remove();
    if (opts.drawPoints === true) {
        const toId = (t) => (t instanceof Date ? fmtISO(t) : String(t));
        const allow = Array.isArray(opts.onlyTargets) && opts.onlyTargets.length > 0 ?
            new Set(opts.onlyTargets.map(String)) :
            null;
        const pointData = allow ? filteredData.filter(d => allow.has(toId(d.target))) : filteredData;
        g.selectAll("circle.main-dp")
            .data(pointData, d => `${toId(d.target)}__${d.group}`)
            .join("circle")
            .attr("class", "datapoint main-dp")
            .attr("data-id", d => toId(d.target))
            .attr("data-target", d => toId(d.target))
            .attr("data-value", d => d.value)
            .attr("cx", d => xScaleNew(d.target))
            .attr("cy", d => yScaleNew(d.value))
            .attr("r", 0)
            .attr("fill", highlightColor)
            .attr("stroke", "white")
            .attr("stroke-width", 1.5)
            .transition().duration(400).delay((d, i) => i * 12).attr("r", 5);
    }

    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 10)
        .attr("font-size", 14)
        .attr("font-weight", "bold")
        .attr("fill", highlightColor)
        .attr("opacity", 0)
        .text(`Displaying Series: ${targetSeriesKey}`)
        .transition().duration(500).delay(200).attr("opacity", 1);

    emitOpDone(svg, chartId, 'multipleLineChangeToSimple', { group: targetSeriesKey, count: filteredData.length });
    return filteredData;
}
