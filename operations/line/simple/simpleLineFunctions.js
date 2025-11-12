import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import {
    retrieveValue as dataRetrieveValue,
    filterData as dataFilter,
    sortData as dataSort,
    findExtremum as dataFindExtremum,
    determineRange as dataDetermineRange,
    sumData as dataSum,
    averageData as dataAverage,
    diffData as dataDiff,
    nthData as dataNth,
    compareOp as dataCompare,
    compareBoolOp as dataCompareBool,
    countData as dataCount,
    lagDiffData as dataLagDiff
} from "../../lineChartOperationFunctions.js";
import { OP_COLORS } from "../../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";
import { normalizeLagDiffResults } from "../../common/lagDiffHelpers.js";
import {
    parseDateWithGranularity,
    toPointIdCandidates,
    findDatumByKey,
    selectPointByTarget,
    getNodeHighlightInfo,
    computeFallbackPointForDatum,
    createVirtualBadge,
    fmtISO
} from "../sharedLineUtils.js";
import { DURATIONS, OPACITIES } from "../../animationConfig.js";
import { storeAxisDomain } from "../../common/scaleHelpers.js";

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };

export function getSvgAndSetup(chartId) {
    const svgNode = getPrimarySvgElement(chartId);
    const svg = svgNode ? d3.select(svgNode) : d3.select(null);
    const g = svg.select(".plot-area");

    // fields set by renderer
    const xField = svgNode?.getAttribute("data-x-field");
    const yField = svgNode?.getAttribute("data-y-field");

    // margins & plot box
    const margins = { left: +(svgNode?.getAttribute("data-m-left") || 0), top: +(svgNode?.getAttribute("data-m-top") || 0) };
    const plot = { w: +(svgNode?.getAttribute("data-plot-w") || 0), h: +(svgNode?.getAttribute("data-plot-h") || 0) };

    // orientation: read from common attribute names; fallback to 'vertical'
    const rawOrient = (svgNode?.getAttribute("data-orientation")
        || svgNode?.getAttribute("data-orient")
        || svgNode?.getAttribute("data-layout")
        || "").toLowerCase();
    const orientation = (rawOrient === "horizontal" || rawOrient === "h") ? "horizontal" : "vertical";

    return { svg, g, orientation, xField, yField, margins, plot };
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
    const bars = g.selectAll("rect.temp-line-bar");
    if (!bars.empty()) return bars;
    const p = g.selectAll("circle.main-dp");
    return p.empty() ? g.selectAll("circle.datapoint") : p;
}


async function highlightNthDatum({
    points,
    datum,
    rankLabel,
    color,
    g,
    sourceData,
    plot
}) {
    if (!datum) return null;
    const candidates = toPointIdCandidates(datum.target);
    if (datum.id != null) candidates.push(String(datum.id));

    const nodeSel = points.filter(function () {
        const sel = d3.select(this);
        const nodeId = sel.attr("data-id");
        const nodeTarget = sel.attr("data-target");
        return (nodeId && candidates.includes(nodeId)) || (nodeTarget && candidates.includes(nodeTarget));
    });

    let info = null;
    if (!nodeSel.empty()) {
        info = getNodeHighlightInfo(nodeSel.node());
        const tag = String(nodeSel.node().tagName || "").toLowerCase();
        let transition = nodeSel.transition().duration(250).attr("opacity", 1).attr("fill", color);
        if (tag === "circle") {
            transition = transition.attr("r", 8).attr("stroke", "white").attr("stroke-width", 2);
        } else if (tag === "rect") {
            transition = transition.attr("stroke", "white").attr("stroke-width", 2);
        }
        await transition.end().catch(() => {});
    } else {
        info = computeFallbackPointForDatum(datum, sourceData, plot);
        if (info) {
            await g.append("circle")
                .attr("class", "annotation nth-ghost")
                .attr("cx", info.cx)
                .attr("cy", info.cy)
                .attr("r", 0)
                .attr("fill", color)
                .attr("opacity", 0.2)
                .transition().duration(250)
                .attr("r", 6)
                .attr("opacity", 0.85)
                .end().catch(() => {});
        }
    }

    if (info) {
        const displayValue = Number.isFinite(Number(datum.value))
            ? Number(datum.value).toLocaleString()
            : String(datum.value ?? "");
        g.append("text")
            .attr("class", "annotation nth-value-tag")
            .attr("x", info.cx + 6)
            .attr("y", info.cy - 10)
            .attr("fill", color)
            .attr("font-weight", "bold")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(displayValue ? `#${rankLabel}: ${displayValue}` : `#${rankLabel}`);
    }

    return info;
}

function drawNthGuides(g, info, color, plot) {
    if (!info) return;
    g.append("line").attr("class", "annotation nth-line")
        .attr("x1", info.cx).attr("y1", info.cy)
        .attr("x2", info.cx).attr("y2", plot.h)
        .attr("stroke", color)
        .attr("stroke-dasharray", "4 4");
    g.append("line").attr("class", "annotation nth-line")
        .attr("x1", 0).attr("y1", info.cy)
        .attr("x2", info.cx).attr("y2", info.cy)
        .attr("stroke", color)
        .attr("stroke-dasharray", "4 4");
}

function parseAxisTickValue(text) {
    if (text == null) return NaN;
    const cleaned = String(text).replace(/,/g, "").trim();
    if (cleaned === "") return NaN;
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function getYAxisDomainFromAxis(svg) {
    if (!svg || svg.empty()) return null;
    const yAxis = svg.select(".y-axis");
    if (yAxis.empty()) return null;
    const tickNodes = yAxis.selectAll(".tick text").nodes();
    if (!tickNodes.length) return null;
    const tickValues = tickNodes
        .map(node => parseAxisTickValue(d3.select(node).text()))
        .filter(Number.isFinite);
    if (tickValues.length < 2) return null;
    return [d3.min(tickValues), d3.max(tickValues)];
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


export async function simpleLineRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const results = dataRetrieveValue(data, op, isLast);
    const targetDatum = results.length > 0 ? results[0] : null;

    if (!targetDatum) {
        console.warn("RetrieveValue: no datum returned for key:", op.target);
        return null;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = OP_COLORS.RETRIEVE_VALUE;

    const candidates = toPointIdCandidates(targetDatum.target);
    let targetPoint = d3.select(null);
    for (const id of candidates) {
        const sel = points.filter(function() { return d3.select(this).attr("data-id") === id; });
        if (!sel.empty()) {
            targetPoint = sel;
            break;
        }
    }

    if (targetPoint.empty()) {
        const fallbackPoint = selectPointByTarget(
            g.selectAll("circle.datapoint"),
            targetDatum.target
        ).filter(function () {
            if (targetDatum.group == null) return true;
            const seriesAttr = d3.select(this).attr("data-series");
            return String(seriesAttr) === String(targetDatum.group);
        });

        if (!fallbackPoint.empty()) {
            targetPoint = fallbackPoint;
        }
    }

    if (targetPoint.empty()) {
        const xValsRaw = Array.isArray(data) ? data.map(d => d?.target) : [];
        const xVals = Array.from(new Set(xValsRaw.map(v => (v instanceof Date ? v : String(v)))));
        const isTemporal = xVals.every(v => v instanceof Date);
        const xScale = isTemporal
            ? d3.scaleTime().domain(d3.extent(xVals)).range([0, plot.w])
            : d3.scalePoint().domain(xVals.map(v => String(v))).range([0, plot.w]);

        const yValuesRaw = Array.isArray(data) ? data.map(d => Number(d?.value)) : [];
        const yValues = yValuesRaw.filter(Number.isFinite);
        const yMax = yValues.length ? d3.max(yValues) : 0;
        const yMin = yValues.length ? d3.min(yValues) : 0;
        const yScale = d3.scaleLinear()
            .domain([
                yMin > 0 ? 0 : (Number.isFinite(yMin) ? yMin : 0),
                Number.isFinite(yMax) ? yMax : 0
            ])
            .nice()
            .range([plot.h, 0]);

        const cxRaw = xScale(targetDatum.target);
        const cyRaw = yScale(targetDatum.value);
        const cx = Number.isFinite(cxRaw) ? cxRaw : 0;
        const cy = Number.isFinite(cyRaw) ? cyRaw : (typeof yScale.range === "function" ? yScale.range()[0] : 0);

        // 1. 수평선 + 수직선 동시 애니메이션
        const hLine = g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", 0).attr("y2", cy)
            .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
        
        const vLine = g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", plot.h)
            .attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
        
        await Promise.all([
            hLine.transition().duration(400).attr("x2", cx).end().catch(()=>{}),
            vLine.transition().duration(400).attr("y2", cy).end().catch(()=>{})
        ]);

        // 2. 원 애니메이션
        const circle = g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", hlColor).attr("stroke", "white").attr("stroke-width", 3);
        await circle.transition().duration(400).attr("r", 8).end().catch(()=>{});

        // 3. 레이블 표시
        const labelText = Number(targetDatum.value).toLocaleString();
        g.append("text").attr("class", "annotation")
            .attr("x", cx + 10).attr("y", cy - 10)
            .attr("fill", hlColor).attr("font-weight", "bold").attr("font-size", "14px")
            .attr("stroke", "white").attr("stroke-width", 4).attr("paint-order", "stroke")
            .text(labelText)
            .attr("opacity", 0)
            .transition().duration(300).attr("opacity", 1);

        return targetDatum;
    }

    // 포인트가 존재하는 경우
    const cx = +targetPoint.attr("cx");
    const cy = +targetPoint.attr("cy");

    // 1. 수평선 + 수직선 동시 애니메이션
    const hLine = g.append("line").attr("class", "annotation")
        .attr("x1", 0).attr("y1", cy)
        .attr("x2", 0).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
    
    const vLine = g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", plot.h)
        .attr("x2", cx).attr("y2", plot.h)
        .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
    
    await Promise.all([
        hLine.transition().duration(400).attr("x2", cx).end().catch(()=>{}),
        vLine.transition().duration(400).attr("y2", cy).end().catch(()=>{})
    ]);

    // 2. 타겟 포인트 강조
    await targetPoint.transition().duration(400)
        .attr("opacity", 1)
        .attr("r", 10)
        .attr("fill", hlColor)
        .attr("stroke", "white")
        .attr("stroke-width", 3)
        .end().catch(()=>{});

    // 3. 레이블 표시
    const labelText = Number(targetPoint.attr("data-value")).toLocaleString();
    g.append("text").attr("class", "annotation")
        .attr("x", cx + 10).attr("y", cy - 10)
        .attr("fill", hlColor).attr("font-weight", "bold").attr("font-size", "14px")
        .attr("stroke", "white").attr("stroke-width", 4).attr("paint-order", "stroke")
        .text(labelText)
        .attr("opacity", 0)
        .transition().duration(300).attr("opacity", 1);

    return targetDatum;
}

export async function simpleLineFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const results = dataFindExtremum(data, op, isLast);
    const targetDatum = Array.isArray(results) && results.length > 0 ? results[0] : null;

    if (!targetDatum) {
        console.warn("FindExtremum: Could not find extremum data.", op);
        return null;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = OP_COLORS.EXTREMUM;
    const targetVal = targetDatum.value;

    const targetPoint = points.filter(function() {
        const v = +d3.select(this).attr("data-value");
        return Number.isFinite(v) && Math.abs(v - targetVal) < 1e-9;
    });

    if (targetPoint.empty()) {
        const xVals = (Array.isArray(data) ? data.map(d => d?.target) : []);
        const isTemporal = xVals.every(v => v instanceof Date);
        const xScale = isTemporal ?
            d3.scaleTime().domain(d3.extent(xVals)).range([0, plot.w]) :
            d3.scalePoint().domain(xVals.map(v => String(v))).range([0, plot.w]);

        const yValues = (Array.isArray(data) ? data.map(d => Number(d?.value)) : []).filter(Number.isFinite);
        const yMax = d3.max(yValues) || 0;
        const yMin = d3.min(yValues);
        const yScale = d3.scaleLinear()
            .domain([yMin > 0 ? 0 : (Number.isFinite(yMin) ? yMin : 0), yMax])
            .nice()
            .range([plot.h, 0]);

        const cx = xScale(targetDatum.target);
        const cy = yScale(targetVal);

        const baseTr = baseLine.transition().duration(600).attr("opacity", 0.3).end();

        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        const circle = g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", hlColor).attr("stroke", "white").attr("stroke-width", 2);
        const circleTr = circle.transition().duration(400).delay(150).attr("r", 7).end();

        const label = `${op.which === "min" ? "Min" : "Max"}: ${targetVal.toLocaleString()}`;
        g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 15)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(label);

        await Promise.all([baseTr, circleTr]).catch(()=>{});
        return targetDatum;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 2).end();

    const cx = +targetPoint.attr("cx");
    const cy = +targetPoint.attr("cy");

    const v = g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
    const h = g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy)
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

    return targetDatum;
}

export async function simpleLineCompare(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumA = findDatumByKey(data, op.targetA);
    const datumB = findDatumByKey(data, op.targetB);
    if (!datumA || !datumB) {
        console.warn("Compare: Could not find data for comparison.", op);
        return [];
    }

    const winners = dataCompare(data, { which: op.which || 'max', targetA: datumA.target, targetB: datumB.target }, isLast) || [];

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
    const winColor = OP_COLORS.COMPARE_WINNER;

    const pick = (datum) => {
        const candidates = toPointIdCandidates(datum.target);
        for (const id of candidates) {
            const sel = points.filter(function() { return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    baseLine.attr("opacity", 1).transition().duration(600).attr("opacity", 0.4);
    const highlightDatum = async (datum, color, slotIndex) => {
        const sel = pick(datum);
        if (!sel.empty()) {
            await sel.transition().duration(600)
                .attr("opacity", 1)
                .attr("r", 8)
                .attr("fill", color)
                .attr("stroke", "white")
                .attr("stroke-width", 2)
                .end().catch(()=>{});
            return { cx: +sel.attr("cx"), cy: +sel.attr("cy"), kind: "point", selection: sel };
        }
        return createVirtualBadge(svg, margins, plot, datum, color, slotIndex);
    };

    const infoA = await highlightDatum(datumA, colorA, 0);
    const infoB = await highlightDatum(datumB, colorB, 1);

    const sameTarget = (a, b) => {
        const da = parseDateWithGranularity(a).date;
        const db = parseDateWithGranularity(b).date;
        if (da && db) return fmtISO(da) === fmtISO(db);
        return String(a) === String(b);
    };
    const isWinner = (d) => winners.some(w => sameTarget(w.target, d.target));

    const annotateInfo = (info, datum, color, star = false) => {
        if (!info || info.kind === 'virtual') return;
        const { cx, cy } = info;
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4");
        const displayValue = Number.isFinite(Number(datum?.value))
            ? Number(datum.value).toLocaleString()
            : String(datum?.value ?? "");
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(displayValue);
        if (star) {
            g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 30).attr("text-anchor", "middle").attr("fill", winColor).attr("font-weight", "bold").text("★");
        }
    };

    annotateInfo(infoA, datumA, colorA, isWinner(datumA));
    annotateInfo(infoB, datumB, colorB, isWinner(datumB));

    const summary = `${(op.which || 'max').toUpperCase()} chosen`;
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", winColor).text(summary);

    return winners;
}

export async function simpleLineCompareBool(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumA = findDatumByKey(data, op.targetA);
    const datumB = findDatumByKey(data, op.targetB);

    if (!datumA || !datumB) {
        console.warn("Compare: Could not find data for comparison.", op);
        return new BoolValue("Data not found", false);
    }

    const newOp = { ...op, targetA: datumA.target, targetB: datumB.target };
    const boolResult = dataCompareBool(data, newOp);
        // console.log('Simple boolResult:', boolResult);  // 디버깅
    // console.log('Simple boolResult.value:', boolResult?.value);

    if (!boolResult) {
        return new BoolValue("Computation failed", false);
    }

    const valueA = datumA.value;
    const valueB = datumB.value;
    const result = boolResult.bool;
    // console.log('result:', result);
    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
    const resultColor = result ? OP_COLORS.TRUE : OP_COLORS.FALSE;

    const pick = (datum) => {
        const candidates = toPointIdCandidates(datum.target);
        for (const id of candidates) {
            const sel = points.filter(function() { return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    const pointA = pick(datumA);
    const pointB = pick(datumB);

    if (pointA.empty() || pointB.empty()) {
        return boolResult;
    }

    // 🔸 라인 1 → 0.4로 페이드
    baseLine.attr("opacity", 1).transition().duration(600).attr("opacity", 0.4);
    
    await Promise.all([
        pointA.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", colorA)
            .attr("stroke", "white").attr("stroke-width", 2).end(),
        pointB.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", colorB)
            .attr("stroke", "white").attr("stroke-width", 2).end()
    ]);

    const annotate = (pt, color) => {
        const cx = +pt.attr("cx"),
            cy = +pt.attr("cy");
        
        // 🔸 세로선: x축에서 포인트로 올라감
        const vLine = g.append("line")
            .attr("class", "annotation")
            .attr("x1", cx).attr("x2", cx)
            .attr("y1", plot.h).attr("y2", plot.h)
            .attr("stroke", color)
            .attr("stroke-dasharray", "4 4")
            .attr("stroke-width", 1.5);
        vLine.transition().duration(500).attr("y2", cy);
        
        // 🔸 가로선: y축에서 포인트로
        const hLine = g.append("line")
            .attr("class", "annotation")
            .attr("x1", 0).attr("x2", 0)
            .attr("y1", cy).attr("y2", cy)
            .attr("stroke", color)
            .attr("stroke-dasharray", "4 4")
            .attr("stroke-width", 1.5);
        hLine.transition().duration(500).attr("x2", cx);
        
        g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 10)
            .attr("text-anchor", "middle")
            .attr("fill", color)
            .attr("font-weight", "bold")
            .attr("font-size", 12)
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text((+pt.attr("data-value")).toLocaleString());
    };

    annotate(pointA, colorA);
    annotate(pointB, colorB);

    // 🔸 비교 결과 표시
    const symbol = { 
        '>': ' > ', 
        '>=': ' >= ', 
        '<': ' < ', 
        '<=': ' <= ', 
        '==': ' == ', 
        '!=': ' != ' 
    }[op.operator] || ` ${op.operator} `;
    
    const summary = `${valueA.toLocaleString()}${symbol}${valueB.toLocaleString()} → ${result}`;

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2)
        .attr("y", margins.top - 10)
        .attr("text-anchor", "middle")
        .attr("font-size", 16)
        .attr("font-weight", "bold")
        .attr("fill", resultColor)
        .text(summary);

    return boolResult;
}

export async function simpleLineSort(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const sourceData = Array.isArray(data) ? data : (data ? [data] : []);

    // 🔸 1단계: 포인트 먼저 보이게 (300ms)
    await points.transition().duration(300)
        .attr("opacity", 1)
        .attr("fill", "steelblue")
        .attr("r", 5)
        .end().catch(()=>{});

    await delay(400);

    // 🔸 2단계: 라인과 포인트 흐리게 (300ms)
    await Promise.all([
        baseLine.transition().duration(300).attr("opacity", 0.3).end().catch(()=>{}),
        points.transition().duration(300).attr("opacity", 0.5).end().catch(()=>{})
    ]).catch(()=>{});

    await delay(200);

    // 🔸 3단계: 라인 완전히 제거 (잔상 방지)
    baseLine.remove();

    const items = sourceData.map(d => ({
        id: String(d?.id ?? d?.target ?? ''),
        target: String(d?.target ?? ''),
        value: Number(d?.value),
        group: d?.group ?? null,
        category: xField || 'target',
        measure: yField || 'value'
    })).filter(d => Number.isFinite(d.value));

    if (items.length === 0) {
        console.warn('[simpleLineSort] no finite input values');
        return [];
    }

    const initDomain = items.map(d => d.target);
    const xBand = d3.scaleBand().domain(initDomain).range([0, plot.w]).padding(0.2);
    const yMax = d3.max(items, d => d.value) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    g.selectAll('rect.temp-line-bar').remove();

    // 🔸 4단계: 막대 그래프로 전환 (800ms)
    const bars = g.selectAll('rect.temp-line-bar')
        .data(items, d => d.id || d.target);

    bars.enter()
        .append('rect')
        .attr('class', 'temp-line-bar')
        .attr('data-id', d => d.id)
        .attr('data-target', d => d.target)
        .attr('data-value', d => d.value)
        .attr('x', d => xBand(d.target))
        .attr('y', plot.h)
        .attr('width', xBand.bandwidth())
        .attr('height', 0)
        .attr('fill', '#69b3a2')
        .attr('opacity', 0)
        .transition().duration(800)
        .attr('y', d => yScale(d.value))
        .attr('height', d => plot.h - yScale(d.value))
        .attr('opacity', 0.85);

    await delay(800);

    // 🔸 5단계: 포인트 완전히 숨기기 (잔상 방지)
    await points.transition().duration(200).attr('opacity', 0).end().catch(()=>{});

    await delay(300);

    const effectiveOp = { ...op };
    if (op?.field) {
        if (op.field === (items[0]?.measure || yField)) effectiveOp.field = 'value';
        else if (op.field === (items[0]?.category || xField)) effectiveOp.field = 'target';
    }

    const sorted = dataSort(items, effectiveOp, xField, yField, isLast) || [];
    if (sorted.length === 0) {
        console.warn('[simpleLineSort] dataSort returned empty; keeping original order');
        return isLast ? [] : items;
    }

    const getKeyFromDatum = (d) => String(d?.target ?? d?.id ?? '');
    const sortedIds = sorted.map(getKeyFromDatum);

    if (orientation === 'vertical') {
        const xSorted = d3.scaleBand().domain(sortedIds).range([0, plot.w]).padding(0.2);
        const allBars = g.selectAll('rect.temp-line-bar');

        // 🔸 6단계: 막대 정렬 애니메이션 (1000ms)
        const moveTr = allBars.transition().duration(1000)
            .attr('x', function () {
                const key = this.getAttribute('data-target') || '';
                const x = xSorted(key);
                return (x != null ? x : -9999);
            })
            .attr('width', xSorted.bandwidth())
            .end().catch(()=>{});

        const axisSel = svg.select('.x-axis');
        let axisTr = Promise.resolve();
        
        if (!axisSel.empty()) {
            // 🔸 연도만 표시
            const formatYear = (d) => {
                const str = String(d);
                if (/^\d{4}-/.test(str)) {
                    return str.substring(0, 4);
                }
                return str;
            };
            
            const axis = d3.axisBottom(xSorted).tickFormat(formatYear);
            
            // 🔸 축 애니메이션 (1000ms)
            axisTr = new Promise((resolve) => {
                axisSel.transition().duration(1000)
                    .call(axis)
                    .on('end', () => {
                        axisSel.selectAll("text")
                            .style("text-anchor", "end")
                            .attr("dx", "-0.8em")
                            .attr("dy", "0.15em")
                            .attr("transform", "rotate(-45)");
                        resolve();
                    });
            });
        }

        await Promise.all([moveTr, axisTr]).catch(()=>{});
    } else {
        const ySorted = d3.scaleBand().domain(sortedIds).range([0, plot.h]).padding(0.2);
        const allBars = g.selectAll('rect.temp-line-bar');

        const moveTr = allBars.transition().duration(1000)
            .attr('y', function () {
                const key = this.getAttribute('data-target') || '';
                const y = ySorted(key);
                return (y != null ? y : -9999);
            })
            .attr('height', ySorted.bandwidth())
            .end().catch(()=>{});

        const axisSel = svg.select('.y-axis');
        const axisTr = !axisSel.empty()
            ? axisSel.transition().duration(1000).call(d3.axisLeft(ySorted)).end().catch(()=>{})
            : Promise.resolve();

        await Promise.all([moveTr, axisTr]).catch(()=>{});
    }

    // Remove old circle points so subsequent ops don't hit stale DOM elements
    g.selectAll("circle.datapoint").remove();
    g.selectAll("circle.main-dp").remove();

    if (isLast) {
        const first = sorted && sorted[0];
        if (!first) return [];
        return [new DatumValue(first.category, first.measure, first.target, first.group, first.value, first.id)];
    }
    return sorted;
}

export async function simpleLineDiff(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const datumA = findDatumByKey(data, op.targetA);
    const datumB = findDatumByKey(data, op.targetB);
    
    if (!datumA || !datumB) {
        console.warn("Diff: One or both data points not found.", op);
        return null;
    }
    
    const newOp = { ...op, targetA: datumA.target, targetB: datumB.target };
    const diffResultArray = dataDiff(data, newOp);
    
    if (!diffResultArray || diffResultArray.length === 0) {
        console.warn("Diff: Could not be computed.", op);
        return null;
    }
    
    const diffResult = diffResultArray[0];
    const diff = diffResult.value;
    const valueA = datumA.value;
    const valueB = datumB.value;
    
    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const colorA = OP_COLORS.DIFF_A;
    const colorB = OP_COLORS.DIFF_B;
    const hlColor = OP_COLORS.DIFF_LINE;
    const aggregateMode = typeof op?.aggregate === 'string'
        ? op.aggregate.toLowerCase()
        : null;
    const isPercentOfTotal = aggregateMode === 'percentage_of_total' || aggregateMode === 'percent_of_total';
    const isRatioMode = String(op?.mode || '').toLowerCase() === 'ratio';
    const isPercentMode = isPercentOfTotal || op?.percent === true || isRatioMode;
    
    const pick = (datum) => {
        const candidates = toPointIdCandidates(datum.target);
        for (const id of candidates) {
            const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };
    
    const highlightDatum = async (datum, color, slotIndex) => {
        const sel = pick(datum);
        if (!sel.empty()) {
            await sel.transition().duration(600)
                .attr("opacity", 1)
                .attr("r", 8)
                .attr("fill", color)
                .attr("stroke", "white")
                .attr("stroke-width", 2)
                .end().catch(()=>{});
            return { cx: +sel.attr("cx"), cy: +sel.attr("cy"), kind: "point" };
        }
        return createVirtualBadge(svg, margins, plot, datum, color, slotIndex);
    };

    // 라인 페이드
    baseLine.attr("opacity", 1).transition().duration(600).attr("opacity", 0.4);

    const infoA = await highlightDatum(datumA, colorA, 0);
    const infoB = await highlightDatum(datumB, colorB, 1);
    
    const annotate = (info, datum, color) => {
        if (!info || info.kind === 'virtual') return;
        const { cx, cy } = info;
        g.append("line")
            .attr("class", "annotation")
            .attr("x1", cx).attr("x2", cx)
            .attr("y1", plot.h).attr("y2", plot.h)
            .attr("stroke", color)
            .attr("stroke-dasharray", "4 4")
            .attr("stroke-width", 1.5)
            .transition().duration(500).attr("y2", cy);
        g.append("line")
            .attr("class", "annotation")
            .attr("x1", 0).attr("x2", 0)
            .attr("y1", cy).attr("y2", cy)
            .attr("stroke", color)
            .attr("stroke-dasharray", "4 4")
            .attr("stroke-width", 1.5)
            .transition().duration(500).attr("x2", cx);
        const displayValue = Number.isFinite(Number(datum?.value))
            ? Number(datum.value).toLocaleString()
            : String(datum?.value ?? "");
        g.append("text").attr("class", "annotation")
            .attr("x", cx).attr("y", cy - 10)
            .attr("text-anchor", "middle")
            .attr("fill", color)
            .attr("font-weight", "bold")
            .attr("font-size", 12)
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(displayValue);
    };
    
    annotate(infoA, datumA, colorA);
    annotate(infoB, datumB, colorB);
    
    await delay(500);
    
    // 차이값 수직선 그리기
    const cyA = infoA?.cy;
    const cyB = infoB?.cy;
    const cxA = infoA?.cx;
    const cxB = infoB?.cx;
    
    if (!isPercentMode &&
        Number.isFinite(diff) &&
        cyA != null && cyB != null &&
        cxA != null && cxB != null &&
        infoA?.kind !== 'virtual' &&
        infoB?.kind !== 'virtual') {
        const diffX = Math.max(cxA, cxB) + 15;
        const minY = Math.min(cyA, cyB);
        const maxY = Math.max(cyA, cyB);
        if (minY !== maxY) {
            const diffLine = g.append("line")
                .attr("class", "annotation diff-bridge")
                .attr("x1", diffX).attr("x2", diffX)
                .attr("y1", minY).attr("y2", minY)
                .attr("stroke", hlColor)
                .attr("stroke-width", 2.5)
                .attr("stroke-dasharray", "5 5");
            await diffLine.transition().duration(600).attr("y2", maxY).end().catch(() => {});
            
            const labelY = (minY + maxY) / 2;
            g.append("text")
                .attr("class", "annotation diff-value")
                .attr("x", diffX + 8)
                .attr("y", labelY)
                .attr("text-anchor", "start")
                .attr("dominant-baseline", "middle")
                .attr("font-size", 13)
                .attr("font-weight", "bold")
                .attr("fill", hlColor)
                .attr("stroke", "white")
                .attr("stroke-width", 3.5)
                .attr("paint-order", "stroke")
                .text(`Diff: ${Math.abs(diff).toLocaleString(undefined, {maximumFractionDigits: 2})}`);
        }
    }
    
    // 요약 텍스트
    let summary;
    if (isPercentOfTotal) {
        const precision = Number.isFinite(Number(op?.precision)) ? Number(op.precision) : 1;
        const percentLabel = Number.isFinite(diffResult.value)
            ? `${diffResult.value.toFixed(precision)}%`
            : '—';
        summary = `Percent of total: ${valueA.toLocaleString()} / ${valueB.toLocaleString()} × 100 = ${percentLabel}`;
    } else {
        summary = `Difference: ${valueA.toLocaleString()} - ${valueB.toLocaleString()} = ${diff.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    }
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2)
        .attr("y", margins.top - 10)
        .attr("text-anchor", "middle")
        .attr("font-size", 16)
        .attr("font-weight", "bold")
        .attr("fill", hlColor)
        .text(summary);
    
    return diffResult;
}

export async function simpleLineLagDiff(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sourceData = Array.isArray(data) ? data : (data ? [data] : []);
    const rawDiffs = dataLagDiff(sourceData, op, isLast);
    const diffs = normalizeLagDiffResults(rawDiffs, 'target', 'value');
    if (!Array.isArray(diffs) || diffs.length === 0) {
        console.warn('[simpleLineLagDiff] no differences computed');
        return [];
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    await baseLine.transition().duration(300).attr('opacity', 0.35).end().catch(() => {});
    await points.transition().duration(300).attr('opacity', 0.4).end().catch(() => {});

    const maxPreview = Number.isFinite(op?.previewCount) ? op.previewCount : 6;
    const subset = diffs.slice(0, Math.max(1, maxPreview));

    for (const [idx, diffDatum] of subset.entries()) {
        const currTarget = diffDatum?.target;
        const prevTarget = diffDatum?.prevTarget;
        const currDatum = findDatumByKey(sourceData, currTarget);
        const prevDatum = findDatumByKey(sourceData, prevTarget);

        const currSel = selectPointByTarget(points, currTarget);
        const prevSel = selectPointByTarget(points, prevTarget);

        const currInfo = !currSel.empty()
            ? getNodeHighlightInfo(currSel.node())
            : computeFallbackPointForDatum(currDatum, sourceData, plot);
        const prevInfo = !prevSel.empty()
            ? getNodeHighlightInfo(prevSel.node())
            : computeFallbackPointForDatum(prevDatum, sourceData, plot);

        const color = diffDatum.value >= 0 ? OP_COLORS.SUM : OP_COLORS.DIFF_LINE;

        if (!currSel.empty()) {
            await currSel.transition().duration(250)
                .attr('opacity', 1)
                .attr('fill', color)
                .attr('stroke', 'white')
                .attr('stroke-width', 2)
                .attr('r', 8)
                .end().catch(() => {});
        }
        if (!prevSel.empty()) {
            await prevSel.transition().duration(250)
                .attr('opacity', 1)
                .attr('fill', color)
                .attr('stroke', 'white')
                .attr('stroke-width', 2)
                .attr('r', 8)
                .end().catch(() => {});
        }

        if (currInfo && prevInfo) {
            const line = g.append('line')
                .attr('class', 'annotation lagdiff-line')
                .attr('x1', prevInfo.cx).attr('y1', prevInfo.cy)
                .attr('x2', prevInfo.cx).attr('y2', prevInfo.cy)
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '4 4');
            line.transition().duration(400)
                .attr('x2', currInfo.cx)
                .attr('y2', currInfo.cy);

            const midX = (prevInfo.cx + currInfo.cx) / 2;
            const midY = (prevInfo.cy + currInfo.cy) / 2;
            g.append('text')
                .attr('class', 'annotation lagdiff-label')
                .attr('x', midX + 6)
                .attr('y', midY - 6)
                .attr('fill', color)
                .attr('font-weight', 'bold')
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text((diffDatum.value >= 0 ? '+' : '') + diffDatum.value.toLocaleString());
        }

        await delay(200);
    }

    const positiveTotal = diffs
        .map(d => Number(d.value))
        .filter((v) => Number.isFinite(v) && v > 0)
        .reduce((sum, v) => sum + v, 0);

    const summaryText = Number.isFinite(positiveTotal)
        ? `lagDiff computed ${diffs.length} differences · Sum of positives ≈ ${positiveTotal.toLocaleString()}`
        : `lagDiff computed ${diffs.length} differences`;

    svg.append('text').attr('class', 'annotation lagdiff-summary')
        .attr('x', margins.left)
        .attr('y', margins.top - 12)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.SUM)
        .text(summaryText);

    return diffs;
}

export async function simpleLineFilter(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);

    // 1단계: 포인트를 먼저 보이게 (300ms)
    await points.transition().duration(300)
        .attr("opacity", 1)
        .attr("fill", "steelblue")
        .attr("r", 5)
        .end().catch(()=>{});

    await delay(400); // 포인트가 보이는 상태로 잠시 대기

    // 2단계: 라인과 포인트를 약간 흐리게 (300ms)
    await Promise.all([
        baseLine.transition().duration(300).attr("opacity", 0.3).end().catch(()=>{}),
        points.transition().duration(300).attr("opacity", 0.5).end().catch(()=>{})
    ]).catch(()=>{});

    await delay(200);

    // 3단계: 라인 제거
    baseLine.remove();

    const items = (Array.isArray(data) ? data : []).map(d => ({
        id: String(d?.id ?? d?.target ?? ''),
        target: String(d?.target ?? ''),
        value: Number(d?.value),
        group: d?.group ?? null,
        category: xField || 'target',
        measure: yField || 'value'
    })).filter(d => Number.isFinite(d.value));

    if (items.length === 0) {
        console.warn('[simpleLineFilter] no finite input values');
        if (isLast) {
            return [new DatumValue('filter', 'count', 'result', null, 0, 'last_filter')];
        }
        return [];
    }

    const xScale = d3.scaleBand().domain(items.map(d => d.target)).range([0, plot.w]).padding(0.2);
    const yMin = d3.min(items, d => d.value) ?? 0;
    const yMax = d3.max(items, d => d.value) ?? 0;
    const domainMin = Math.min(0, yMin);
    const domainMax = Math.max(0, yMax);
    const yScale = d3.scaleLinear().domain([domainMin, domainMax === domainMin ? domainMin + 1 : domainMax]).nice().range([plot.h, 0]);
    const zeroY = yScale(0);

    // Update y-axis domain to reflect filtered subset
    const yAxisSel = svg.select('.y-axis');
    const updateYAxis = !yAxisSel.empty()
        ? yAxisSel.transition().duration(800).call(d3.axisLeft(yScale).ticks(6)).end().catch(()=>{})
        : Promise.resolve();

    const svgNode = (typeof svg.node === 'function') ? svg.node() : null;
    if (svgNode) {
        storeAxisDomain(svgNode, 'y', yScale.domain());
    }

    g.selectAll('rect.temp-line-bar').remove();

    // 4단계: 막대 그래프로 전환 (800ms, 천천히)
    const bars = g.selectAll('rect.temp-line-bar')
        .data(items, d => d.id || d.target)
        .enter()
        .append('rect')
        .attr('class', 'temp-line-bar')
        .attr('data-id', d => d.id)
        .attr('data-target', d => d.target)
        .attr('data-value', d => d.value)
        .attr('x', d => xScale(d.target))
        .attr('y', zeroY)
        .attr('width', xScale.bandwidth())
        .attr('height', 0)
        .attr('fill', '#69b3a2')
        .attr('opacity', 0);

    await bars.transition().duration(800)
        .attr('y', d => d.value >= 0 ? yScale(d.value) : zeroY)
        .attr('height', d => Math.max(0, Math.abs(yScale(d.value) - zeroY)))
        .attr('opacity', 0.85)
        .end().catch(()=>{});

    // 5단계: 포인트 숨기기
    await points.transition().duration(200).attr('opacity', 0).end().catch(()=>{});

    await delay(300);

    const matchColor = OP_COLORS.FILTER_MATCH;
    const toNumber = v => (v == null ? NaN : +v);

    const effectiveOp = { ...op };
    const sample = items[0];
    if (op.field === sample.measure) {
        effectiveOp.field = 'value';
    } else if (op.field === sample.category) {
        effectiveOp.field = 'target';
    }

    let filteredData = dataFilter(items, effectiveOp, xField, yField, isLast);

    // 6단계: threshold 선 그리기
    const drawThreshold = async (rawVal) => {
        const v = toNumber(rawVal);
        if (!Number.isFinite(v)) return;
        const yPos = yScale(v);
        const line = svg.append("line").attr("class", "threshold-line annotation")
            .attr("x1", margins.left).attr("y1", margins.top + yPos)
            .attr("x2", margins.left).attr("y2", margins.top + yPos)
            .attr("stroke", OP_COLORS.FILTER_THRESHOLD).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
        await line.transition().duration(800).attr("x2", margins.left + plot.w).end().catch(()=>{});
        svg.append("text").attr("class", "threshold-label annotation")
            .attr("x", margins.left + plot.w - 5).attr("y", margins.top + yPos - 5)
            .attr("text-anchor", "end")
            .attr("fill", OP_COLORS.FILTER_THRESHOLD).attr("font-size", 12).attr("font-weight", "bold")
            .text(v);
    };

    let labelText = "";
    if (effectiveOp.operator === 'in' || effectiveOp.operator === 'not-in') {
        const arr = Array.isArray(effectiveOp.value) ? effectiveOp.value : [effectiveOp.value];
        labelText = `Filter: ${effectiveOp.field} ${effectiveOp.operator} [${arr.join(', ')}]`;
    } else {
        labelText = `Filter: ${effectiveOp.field} ${effectiveOp.operator} ${effectiveOp.value}`;
    }

    const numericOps = new Set(['>','>=','<','<=','==','eq']);
    if (numericOps.has(effectiveOp.operator) && Number.isFinite(toNumber(effectiveOp.value))) {
        await drawThreshold(effectiveOp.value);
        await delay(200);
    } else if (effectiveOp.operator === 'between' && Array.isArray(effectiveOp.value)) {
        const start = parseDateWithGranularity(effectiveOp.value[0]).date;
        const end = parseDateWithGranularity(effectiveOp.value[1]).date;
        if (effectiveOp.field === 'target' && start && end) {
            const fmt = d3.timeFormat('%Y-%m-%d');
            const domain = items.map(d => d.target);
            const xStartIdx = domain.findIndex(t => t.startsWith(fmt(start)));
            const xEndIdx = domain.findIndex(t => t.startsWith(fmt(end)));
            if (xStartIdx !== -1 && xEndIdx !== -1) {
                const t0 = domain[Math.min(xStartIdx, xEndIdx)];
                const t1 = domain[Math.max(xStartIdx, xEndIdx)];
                const x0 = xScale(t0);
                const x1 = xScale(t1) + xScale.bandwidth();
                g.append("rect").attr("class", "annotation filter-range")
                    .attr("x", x0).attr("y", 0).attr("width", Math.max(0, x1 - x0)).attr("height", plot.h)
                    .attr("fill", OP_COLORS.RANGE).attr("opacity", 0)
                    .transition().duration(500).attr("opacity", 0.2);
            }
        }
    }

    // 7단계: 필터 결과 처리
    if (!filteredData || filteredData.length === 0) {
        g.selectAll('rect.temp-line-bar').transition().duration(500).attr('opacity', 0.1);
        g.append("text").attr("class", "annotation empty-label")
            .attr("x", plot.w / 2).attr("y", plot.h / 2)
            .attr("text-anchor", "middle").attr("font-size", "16px").attr("font-weight", "bold")
            .text("No data matches the filter.");
        return isLast
            ? [new DatumValue('filter', 'count', 'result', null, 0, 'last_filter')]
            : [];
    }

    const filteredIds = new Set(filteredData.map(d => String(d.id ?? d.target)));
    const allBars = g.selectAll('rect.temp-line-bar');

    // 8단계: 필터링된 막대만 강조 (매칭 안되는건 흐리게, 매칭되는건 하이라이트)
    await Promise.all([
        allBars.filter(function() {
            const id = this.getAttribute('data-id') || this.getAttribute('data-target');
            return !filteredIds.has(String(id));
        }).transition().duration(800).attr('opacity', 0.2).end().catch(()=>{}),
        allBars.filter(function() {
            const id = this.getAttribute('data-id') || this.getAttribute('data-target');
            return filteredIds.has(String(id));
        }).transition().duration(800).attr('fill', matchColor).attr('opacity', 0.9).end().catch(()=>{})
    ]).catch(()=>{});

    await delay(250);

    // 9단계: 필터링된 데이터만 남기고 재배치
    const filteredTargets = filteredData.map(d => String(d.target));
    const xScaleFiltered = d3.scaleBand().domain(filteredTargets).range([0, plot.w]).padding(0.2);

    const axisSel = svg.select('.x-axis');
    const axisTr = !axisSel.empty()
        ? axisSel.transition().duration(800).call(d3.axisBottom(xScaleFiltered)).end().catch(()=>{})
        : Promise.resolve();

    const moveTr = allBars.transition().duration(800)
        .attr('x', function() {
            const key = this.getAttribute('data-target') || '';
            const x = xScaleFiltered(key);
            return (x != null ? x : -9999);
        })
        .attr('width', xScaleFiltered.bandwidth())
        .end().catch(()=>{});

    await Promise.all([axisTr, moveTr, updateYAxis]).catch(()=>{});

    // 10단계: 값 레이블 표시
    allBars.each(function() {
        const key = this.getAttribute('data-target') || '';
        if (!filteredTargets.includes(key)) return;
        const sel = d3.select(this);
        const vx = +sel.attr('x') + (+sel.attr('width')) / 2;
        const vVal = Number(sel.attr('data-value'));
        const vy = yScale(vVal) - 5;

        g.append("text").attr("class", "annotation value-tag")
            .attr("x", vx).attr("y", vy)
            .attr("text-anchor", "middle")
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", "black")
            .text(Number.isFinite(vVal) ? vVal : '');
    });

    // 11단계: 필터 레이블 표시
    svg.append("text").attr("class", "filter-label annotation")
        .attr("x", margins.left).attr("y", margins.top - 8)
        .attr("font-size", 12).attr("fill", matchColor).attr("font-weight", "bold")
        .text(labelText);

    return isLast
        ? [new DatumValue('filter', 'count', 'result', null, Array.isArray(filteredData) ? filteredData.length : 0, 'last_filter')]
        : filteredData;
}

export async function simpleLineDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataDetermineRange(data, op, isLast);
    if (!result) return null;

    // 🔸 핵심 수정: result 구조 파싱
    let minV = result.minV ?? result.min;
    let maxV = result.maxV ?? result.max;
    let minDatums = result.minDatums;
    let maxDatums = result.maxDatums;

    // Fallback: min/max 값이 없으면 직접 계산
    const values = (Array.isArray(data) ? data.map(d => d ? d.value : NaN) : []).filter(Number.isFinite);
    if (minV === undefined || minV === null) minV = d3.min(values);
    if (maxV === undefined || maxV === null) maxV = d3.max(values);

    // 🔸 min/max에 해당하는 datum들 찾기
    if (!Array.isArray(minDatums)) {
        minDatums = Array.isArray(data) ? data.filter(d => Number.isFinite(d?.value) && d.value === minV) : [];
        // 정확히 일치하는 게 없으면 가장 가까운 것 찾기
        if (minDatums.length === 0 && Number.isFinite(minV)) {
            let best = null, bestDiff = Infinity;
            (data || []).forEach(d => {
                const diff = Math.abs((+d?.value) - minV);
                if (Number.isFinite(diff) && diff < bestDiff) {
                    best = d;
                    bestDiff = diff;
                }
            });
            if (best) minDatums = [best];
        }
    }
    if (!Array.isArray(maxDatums)) {
        maxDatums = Array.isArray(data) ? data.filter(d => Number.isFinite(d?.value) && d.value === maxV) : [];
        if (maxDatums.length === 0 && Number.isFinite(maxV)) {
            let best = null, bestDiff = Infinity;
            (data || []).forEach(d => {
                const diff = Math.abs((+d?.value) - maxV);
                if (Number.isFinite(diff) && diff < bestDiff) {
                    best = d;
                    bestDiff = diff;
                }
            });
            if (best) maxDatums = [best];
        }
    }

    const hlColor = OP_COLORS.RANGE;
    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);

    // 🔸 라인과 포인트 페이드 처리
    await Promise.all([
        baseLine.transition().duration(300).attr('opacity', 0.4).end(),
        points.transition().duration(300).attr('opacity', 0).end()
    ]);

    const yMax = d3.max(values) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    // 🔸 Min/Max 값에 대한 시각화 함수
    const annotateValue = (value, datums, label) => {
        const list = Array.isArray(datums) ? datums : (datums ? [datums] : []);
        const vNum = Number(value);
        if (!Number.isFinite(vNum)) return Promise.resolve();
        
        const yPos = yScale(vNum);
        
        // 가로선 그리기
        const line = g.append("line")
            .attr("class", "annotation")
            .attr("x1", 0)
            .attr("y1", yPos)
            .attr("x2", 0)
            .attr("y2", yPos)
            .attr("stroke", hlColor)
            .attr("stroke-dasharray", "4 4");
        
        const lineTr = line.transition()
            .duration(800)
            .attr("x2", plot.w)
            .end();

list.forEach(datum => {
            const candidates = toPointIdCandidates(datum?.target);
            const nearPoints = points.filter(function() {
                return candidates.includes(d3.select(this).attr("data-id"));
            });

            if (!nearPoints.empty()) {
                // 포인트 강조
                nearPoints.transition()
                    .duration(400)
                    .attr("fill", hlColor)
                    .attr("opacity", 1)
                    .attr("r", 8)
                    .attr("stroke", "white")
                    .attr("stroke-width", 2);

                const cx = +nearPoints.attr("cx");
                const cy = +nearPoints.attr("cy");

                // 🔸 값 라벨 (포인트 옆에 바로 붙여서)
                g.append("text")
                    .attr("class", "annotation")
                    .attr("x", cx - 8)
                    .attr("y", cy - 12)
                    .attr("text-anchor", "end")
                    .attr("fill", hlColor)
                    .attr("font-size", 13)
                    .attr("font-weight", "bold")
                    .attr("stroke", "white")
                    .attr("stroke-width", 3.5)
                    .attr("paint-order", "stroke")
                    .text(`${label}: ${vNum.toLocaleString()}`);
            }
        });

        return lineTr;
    };

    // 🔸 Min과 Max 시각화
    await delay(150);
    const pMin = annotateValue(minV, minDatums, "Min");
    const pMax = annotateValue(maxV, maxDatums, "Max");
    await Promise.all([pMin, pMax]).catch(() => {});

    // 🔸 범위 요약 텍스트
    const fmtVal = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString() : '—';
    };
    const summaryText = `Range: ${fmtVal(minV)} ~ ${fmtVal(maxV)}`;
    
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
        .transition()
        .duration(500)
        .delay(400)
        .attr("opacity", 1);

    // 🔸 IntervalValue 반환
    try {
        return new IntervalValue('value', minV, maxV);
    } catch (e) {
        return { field: 'value', minV, maxV };
    }
}

export async function simpleLineSum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const normalizedData = Array.isArray(data) ? data : (data != null ? [data] : []);
    const calc = dataSum(normalizedData, op, isLast);
    const calcDatum = Array.isArray(calc) ? calc[0] : null;
    const values = normalizedData.map(d => d ? +d.value : NaN).filter(Number.isFinite);
    const total = calcDatum && Number.isFinite(+calcDatum.value) ? +calcDatum.value : values.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total)) {
        console.warn('[simpleLineSum] total is not finite');
        return null;
    }

    const totalText = total.toLocaleString();
    const baseColor = '#69b3a2';
    const hlColor = OP_COLORS.SUM;

    const baseLine = selectMainLine(g);
    const pointsSel = selectMainPoints(g);

    // 🔸 1단계: 포인트 먼저 보이게 (300ms)
    await pointsSel.transition().duration(300)
        .attr("opacity", 1)
        .attr("fill", "steelblue")
        .attr("r", 5)
        .end().catch(() => {});

    await delay(400);

    // 🔸 2단계: 라인과 포인트 흐리게 (300ms)
    await Promise.all([
        baseLine.transition().duration(300).attr('opacity', 0.3).end().catch(() => {}),
        pointsSel.transition().duration(300).attr('opacity', 0.5).end().catch(() => {})
    ]).catch(() => {});

    await delay(200);

    // 🔸 3단계: 라인 완전히 제거 (잔상 방지)
    baseLine.remove();

    const items = (Array.isArray(data) ? data : []).map(d => ({
        id: String(d?.id ?? d?.target ?? ''),
        target: String(d?.target ?? ''),
        value: Number(d?.value)
    })).filter(d => Number.isFinite(d.value));

    if (items.length === 0) {
        console.warn('[simpleLineSum] no finite values to render as bars');
        return { category: 'value', target: 'sum', value: total };
    }

    const xScale = d3.scaleBand().domain(items.map(d => d.target)).range([0, plot.w]).padding(0.2);
    const yMax = d3.max(items, d => d.value) || 0;
    const yScaleInitial = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    g.selectAll('rect.temp-line-bar').remove();

    // 🔸 4단계: 막대 그래프로 전환 (800ms)
    const bars = g.selectAll('rect.temp-line-bar')
        .data(items, d => d.id || d.target)
        .enter()
        .append('rect')
        .attr('class', 'temp-line-bar annotation')
        .attr('data-id', d => d.id)
        .attr('data-target', d => d.target)
        .attr('data-value', d => d.value)
        .attr('x', d => xScale(d.target))
        .attr('y', plot.h)
        .attr('width', xScale.bandwidth())
        .attr('height', 0)
        .attr('fill', baseColor)
        .attr('opacity', 0);

    await bars.transition().duration(800)
        .attr('y', d => yScaleInitial(d.value))
        .attr('height', d => plot.h - yScaleInitial(d.value))
        .attr('opacity', 0.75)
        .end().catch(() => {});

    // 🔸 5단계: 포인트 완전히 숨기기 (잔상 방지)
    await pointsSel.transition().duration(200).attr('opacity', 0).end().catch(() => {});

    await delay(300);

    // 🔸 6단계: Y축 스케일 변경 + 스택 애니메이션 (1200ms)
    const newYScale = d3.scaleLinear().domain([0, total]).nice().range([plot.h, 0]);
    const yAxisTr = svg.select('.y-axis').transition().duration(1000).call(d3.axisLeft(newYScale)).end().catch(() => {});

    const barWidth = xScale.bandwidth();
    const targetX = plot.w / 2 - barWidth / 2;

    const nodes = bars.nodes().map(node => {
        const sel = d3.select(node);
        return {
            node,
            sel,
            x: +node.getAttribute('x') || 0,
            value: Number(sel.attr('data-value'))
        };
    }).sort((a, b) => a.x - b.x);

    let runningTotal = 0;
    const stackPromises = [];
    for (const it of nodes) {
        const v = Number.isFinite(it.value) ? it.value : 0;
        const yTop = newYScale(runningTotal + v);
        const h = plot.h - newYScale(v);
        const t = it.sel.transition().duration(1200)
            .attr('x', targetX)
            .attr('y', yTop)
            .attr('width', barWidth)
            .attr('height', h)
            .attr('fill', hlColor)
            .attr('opacity', 0.85)
            .end().catch(() => {});
        stackPromises.push(t);
        runningTotal += v;
    }

    await Promise.all([yAxisTr, ...stackPromises]).catch(() => {});
    await delay(200);

    // 🔸 7단계: 결과 라인과 라벨
    const finalY = newYScale(total);

    svg.append('line').attr('class', 'annotation value-line')
        .attr('x1', margins.left).attr('y1', margins.top + finalY)
        .attr('x2', margins.left + plot.w).attr('y2', margins.top + finalY)
        .attr('stroke', OP_COLORS.SUM).attr('stroke-width', 2);

    svg.append('text').attr('class', 'annotation value-tag')
        .attr('x', margins.left + plot.w - 10).attr('y', margins.top + finalY - 10)
        .attr('fill', OP_COLORS.SUM).attr('font-weight', 'bold')
        .attr('text-anchor', 'end')
        .text(`Sum: ${totalText}`);

    return {
        category: 'value',
        target: 'sum',
        value: total,
        name: calcDatum?.name || 'Sum'
    };
}

export async function simpleLineAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    svg.selectAll(".annotation.avg-line, .annotation.avg-label").remove();

    if (!Array.isArray(data) || data.length === 0) {
        console.warn('[simpleLineAverage] empty data');
        return null;
    }

    const result = dataAverage(data, op, isLast);
    const avgRaw = result ? result[0].value : undefined;
    const avg = Number(avgRaw);
    if (!Number.isFinite(avg)) {
        console.warn('[simpleLineAverage] average is not finite:', avgRaw);
        return result || null;
    }

    const values = data.map(d => d ? Number(d.value) : NaN).filter(Number.isFinite);
    const ymaxData = d3.max(values);
    const axisDomain = getYAxisDomainFromAxis(svg);
    let yScale;
    if (axisDomain) {
        const axisMin = axisDomain[0];
        const axisMax = Math.max(axisDomain[1], avg);
        yScale = d3.scaleLinear().domain([axisMin, axisMax]).range([plot.h, 0]);
    } else {
        const yMax = d3.max([ymaxData || 0, avg]);
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    }
    const yPos = yScale(avg);
    if (!Number.isFinite(yPos)) {
        console.warn('[simpleLineAverage] yPos is not finite');
        return result;
    }

    const hlColor = OP_COLORS.AVERAGE;

    const line = g.append('line')
        .attr('class', 'annotation avg-line')
        .attr('x1', 0).attr('x2', 0)
        .attr('y1', yPos).attr('y2', yPos)
        .attr('stroke', hlColor).attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 5');

    await line.transition().duration(800).attr('x2', plot.w).end().catch(() => {});

    const fmtAvg = Number.isInteger(avg) ? avg.toString() : avg.toLocaleString(undefined, { maximumFractionDigits: 2 });

    const avgLabel = g.append('text').attr('class', 'annotation avg-label')
        .attr('x', plot.w - 10)
        .attr('y', Math.max(12, yPos - 10))
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', hlColor)
        .attr('font-weight', 'bold')
        .attr('stroke', 'white')
        .attr('stroke-width', 3.5)
        .attr('paint-order', 'stroke')
        .text(`Avg: ${fmtAvg}`)
        .attr('opacity', 0);
    await avgLabel.transition().delay(200).duration(400).attr('opacity', 1).end().catch(()=>{});

    return result;
}

export async function simpleLineNth(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sourceData = Array.isArray(data) ? data : (data ? [data] : []);
    const resultData = dataNth(sourceData, op, isLast);
    if (!Array.isArray(resultData) || resultData.length === 0) {
        console.warn('[simpleLineNth] dataNth returned empty results');
        return [];
    }

    const rawRanks = Array.isArray(op.n) ? op.n : [op.n ?? 1];
    const normalizedRanks = rawRanks
        .map((value) => {
            const num = Number(value);
            if (!Number.isFinite(num) || num < 1) return null;
            return Math.floor(num);
        })
        .filter((value) => value !== null);

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const from = op.from || 'left';
    const hlColor = OP_COLORS.NTH;

    await Promise.all([
        baseLine.transition().duration(300).attr('opacity', 0.2).end().catch(() => {}),
        points.transition().duration(300).attr('opacity', 0.25).end().catch(() => {})
    ]);

    const highlightInfos = [];
    const summaryValues = [];

    for (let idx = 0; idx < resultData.length; idx++) {
        const datum = resultData[idx];
        const rankLabel = normalizedRanks[idx] ?? (idx + 1);
        summaryValues.push(datum?.value);
        const info = await highlightNthDatum({
            points,
            datum,
            rankLabel,
            color: hlColor,
            g,
            sourceData,
            plot
        });
        if (info) {
            highlightInfos.push(info);
        }
        await delay(220);
    }

    const finalInfo = highlightInfos[highlightInfos.length - 1];
    if (finalInfo) {
        drawNthGuides(g, finalInfo, hlColor, plot);
    }

    const summaryRanksText = normalizedRanks.length > 0
        ? normalizedRanks.join(', ')
        : resultData.map((_, idx) => idx + 1).join(', ');
    const summaryValuesText = summaryValues
        .map((v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString() : '')
        .filter(Boolean)
        .join(', ');

    svg.append('text').attr('class', 'annotation nth-summary')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(
            summaryValuesText
                ? `Nth (from ${from}): ${summaryRanksText} → ${summaryValuesText}`
                : `Nth (from ${from}): ${summaryRanksText}`
        );

    return resultData;
}

export async function simpleLineCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataCount(data, op, isLast);
    const totalCount = result ? result[0].value : 0;

    if (totalCount === 0) {
        return result;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = OP_COLORS.COUNT;
    const stepInterval = Math.max(10, DURATIONS.COUNT_INTERVAL);

    await Promise.all([
        baseLine.transition().duration(stepInterval).attr('opacity', OPACITIES.SEMI_DIM).end(),
        points.transition().duration(stepInterval).attr('fill', '#a9a9a9').attr('opacity', OPACITIES.SEMI_DIM).end()
    ]);

    for (let i = 0; i < totalCount; i++) {
        const datum = data[i];
        const candidates = toPointIdCandidates(datum.target);
        const pointSel = points.filter(function() {
            const id = d3.select(this).attr("data-id");
            return candidates.includes(id);
        });

        if (!pointSel.empty()) {
            await pointSel.transition().duration(stepInterval)
                .attr('fill', hlColor)
                .attr('opacity', 1)
                .attr('r', Math.max(6, +pointSel.attr('r') || 6))
                .end();

            const lbl = g.append('text')
                .attr('class', 'annotation count-label')
                .attr('x', pointSel.attr('cx'))
                .attr('y', +pointSel.attr('cy') - 10)
                .attr('text-anchor', 'middle')
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1))
                .attr('opacity', 0);
            await lbl.transition().duration(Math.max(50, stepInterval)).attr('opacity', 1).end().catch(()=>{});
            await delay(stepInterval);
        }
    }

    g.append('text')
        .attr('class', 'annotation')
        .attr('x', 0)
        .attr('y', -10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount}`);

    return result;
}
