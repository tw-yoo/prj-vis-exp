import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import {
    retrieveValue as dataRetrieveValue,
    filter as dataFilter,
    findExtremum as dataFindExtremum,
    sort as dataSort,
    sum as dataSum,
    average as dataAverage,
    diff as dataDiff,
    nth as dataNth,
    compare as dataCompare,
    compareBool as dataCompareBool,
    count as dataCount
} from "../../operationFunctions.js";

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };

export function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const g = svg.select(".plot-area");
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const margins = { left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top") };
    const plot = { w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h") };
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

function findDatumByKey(data, key) {
    if (!Array.isArray(data)) return null;
    return data.find(d => {
        if (!d || d.target == null) return false;
        
        const itemDate = d.target;
        const targetDateInfo = parseDateWithGranularity(key);

        if (!targetDateInfo.date || !(itemDate instanceof Date)) {
            return String(d.target) === String(key);
        }
        
        if (String(key).length === 4) {
            return itemDate.getFullYear() === targetDateInfo.date.getFullYear();
        }
        
        return itemDate.getTime() === targetDateInfo.date.getTime();
    });
}

export async function simpleLineRetrieveValue(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumToFind = findDatumByKey(data, op.target);

    if (!datumToFind) {
        console.warn("RetrieveValue: target not found for key:", op.target);
        return null;
    }

    const results = dataRetrieveValue(data, { target: datumToFind.target });
    const targetDatum = results.length > 0 ? results[0] : null;

    if (!targetDatum) {
        return null;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "#ff6961";

    const candidates = toPointIdCandidates(targetDatum.target);
    let targetPoint = d3.select(null);
    for (const id of candidates) {
        const sel = points.filter(function() { return d3.select(this).attr("data-id") === id; });
        if (!sel.empty()) {
            targetPoint = sel;
            break;
        }
    }

    if (targetPoint.empty()) return targetDatum;

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 2).end();

    const cx = +targetPoint.attr("cx"), cy = +targetPoint.attr("cy");
    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx).attr("y2", plot.h)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
    g.append("line").attr("class", "annotation")
        .attr("x1", 0).attr("y1", cy)
        .attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
    const labelText = Number(targetPoint.attr("data-value")).toLocaleString();
    
    g.append("text").attr("class", "annotation")
        .attr("x", cx + 5).attr("y", cy - 5)
        .attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(labelText);

    return targetDatum;
}

export async function simpleLineFindExtremum(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetDatum = dataFindExtremum(data, op, xField, yField);

    if (!targetDatum) {
        console.warn("FindExtremum: Could not find extremum data.", op);
        return null;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = "#a65dfb";
    const targetVal = targetDatum.value;

    const targetPoint = points.filter(function() {
        return +d3.select(this).attr("data-value") === targetVal;
    });

    if (targetPoint.empty()) {
        console.warn("FindExtremum: Point not found for value:", targetVal);
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

export async function simpleLineCompare(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumA = findDatumByKey(data, op.targetA);
    const datumB = findDatumByKey(data, op.targetB);

    if (!datumA || !datumB) {
        console.warn("Compare: Could not find data for comparison.", op);
        return null;
    }
    
    const newOp = { ...op, targetA: { target: datumA.target }, targetB: { target: datumB.target } };
    const winnerDatum = dataCompare(data, newOp, xField, yField);

    if (!winnerDatum) {
        console.warn("Compare: Could not determine a winner.", op);
        return null;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const colorA = "#ffb74d";
    const colorB = "#64b5f6";
    const winnerColor = "#28a745";

    const pick = (datum) => {
        const candidates = toPointIdCandidates(datum.target);
        for (const id of candidates) {
            const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    const pointA = pick(datumA);
    const pointB = pick(datumB);

    if (pointA.empty() || pointB.empty()) {
        return winnerDatum;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await Promise.all([
        pointA.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorA).end(),
        pointB.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorB).end()
    ]);

    const annotate = (pt, color) => {
        const cx = +pt.attr("cx"), cy = +pt.attr("cy");
        g.append("line").attr("class","annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("line").attr("class","annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("text").attr("class","annotation").attr("x", cx).attr("y", cy - 10).attr("text-anchor","middle").attr("fill",color).attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text((+pt.attr("data-value")).toLocaleString());
    };

    annotate(pointA, colorA);
    annotate(pointB, colorB);

    const summary = `Winner: ${winnerDatum.value.toLocaleString()}`;
    
    svg.append("text").attr("class","annotation")
        .attr("x", margins.left + plot.w/2).attr("y", margins.top - 10)
        .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
        .attr("fill", winnerColor)
        .text(summary);

    return winnerDatum;
}

export async function simpleLineCompareBool(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const datumA = findDatumByKey(data, op.targetA);
    const datumB = findDatumByKey(data, op.targetB);
    
    if (!datumA || !datumB) {
        console.warn("Compare: Could not find data for comparison.", op);
        return new BoolValue("Data not found", false);
    }
    
    const newOp = { ...op, targetA: { target: datumA.target }, targetB: { target: datumB.target } };
    const boolResult = dataCompareBool(data, newOp, xField, yField);

    if (!boolResult) {
        return new BoolValue("Computation failed", false);
    }
    
    const valueA = datumA.value;
    const valueB = datumB.value;
    const result = boolResult.value;

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const colorA = "#ffb74d";
    const colorB = "#64b5f6";

    const pick = (datum) => {
        const candidates = toPointIdCandidates(datum.target);
        for (const id of candidates) {
            const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    const pointA = pick(datumA);
    const pointB = pick(datumB);

    if (pointA.empty() || pointB.empty()) {
        return boolResult;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    await Promise.all([
        pointA.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorA).end(),
        pointB.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorB).end()
    ]);

    const annotate = (pt, color) => {
        const cx = +pt.attr("cx"), cy = +pt.attr("cy");
        g.append("line").attr("class","annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("line").attr("class","annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("text").attr("class","annotation").attr("x", cx).attr("y", cy - 10).attr("text-anchor","middle").attr("fill",color).attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text((+pt.attr("data-value")).toLocaleString());
    };

    annotate(pointA, colorA);
    annotate(pointB, colorB);

    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const summary = `${valueA.toLocaleString()}${symbol}${valueB.toLocaleString()} → ${result}`;
    
    svg.append("text").attr("class","annotation")
        .attr("x", margins.left + plot.w/2).attr("y", margins.top - 10)
        .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
        .attr("fill", result ? "green" : "red").text(summary);

    return boolResult;
}

export async function simpleLineDiff(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumA = findDatumByKey(data, op.targetA);
    const datumB = findDatumByKey(data, op.targetB);

    if (!datumA || !datumB) {
        console.warn("Diff: One or both data points not found.", op);
        return null;
    }

    const newOp = { ...op, targetA: { target: datumA.target }, targetB: { target: datumB.target } };
    const diffResult = dataDiff(data, newOp, xField, yField);

    if (!diffResult) {
        console.warn("Diff: Could not be computed.", op);
        return null;
    }
    
    const valueA = datumA.value;
    const valueB = datumB.value;
    const diff = diffResult.value;
    
    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const colorA = "#ffb74d";
    const colorB = "#64b5f6";
    const hlColor = "#fca103";
    
    const pick = (datum) => {
        const candidates = toPointIdCandidates(datum.target);
        for (const id of candidates) {
            const sel = points.filter(function(){ return d3.select(this).attr("data-id") === id; });
            if (!sel.empty()) return sel;
        }
        return d3.select(null);
    };

    const pointA = pick(datumA);
    const pointB = pick(datumB);

    if (pointA.empty() || pointB.empty()) {
        return diffResult;
    }

    baseLine.transition().duration(600).attr("opacity", 0.3);
    
    await Promise.all([
        pointA.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorA).end(),
        pointB.transition().duration(600).attr("opacity",1).attr("r",8).attr("fill",colorB).end()
    ]);

    const annotate = (pt, color) => {
        const cx = +pt.attr("cx"), cy = +pt.attr("cy");
        g.append("line").attr("class","annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("line").attr("class","annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray","4 4");
        g.append("text").attr("class","annotation").attr("x", cx).attr("y", cy - 10).attr("text-anchor","middle").attr("fill",color).attr("font-weight","bold").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text((+pt.attr("data-value")).toLocaleString());
    };

    annotate(pointA, colorA);
    annotate(pointB, colorB);
    
    const summary = `Difference: ${Math.max(valueA, valueB).toLocaleString()} - ${Math.min(valueA, valueB).toLocaleString()} = ${Math.abs(diff).toLocaleString()}`;

    svg.append("text").attr("class","annotation")
        .attr("x", margins.left + plot.w/2).attr("y", margins.top - 10)
        .attr("text-anchor","middle").attr("font-size",16).attr("font-weight","bold")
        .attr("fill", hlColor).text(summary);

    return diffResult;
}

export async function simpleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const xAccessor = d => d ? d.target : undefined;
    const yAccessor = d => d ? d.value : undefined;

    let filteredData;
    const correctedOp = { ...op };

    if (op.field === yField) {
        correctedOp.field = 'value'; 
        filteredData = dataFilter(data, correctedOp);
    } else if (op.field === xField && op.operator === 'between') {
        const [startVal, endVal] = op.value;
        const startDate = parseDateWithGranularity(startVal).date;
        const endDate = parseDateWithGranularity(endVal).date;
        if (startDate && endDate) {
            filteredData = data.filter(d => {
                const itemDate = xAccessor(d);
                return itemDate instanceof Date && itemDate >= startDate && itemDate <= endDate;
            });
        } else {
            filteredData = [];
        }
    } else {
        return data;
    }
    
    const originalXScale = d3.scaleTime().domain(d3.extent(data, xAccessor)).range([0, plot.w]);
    const originalYMax = d3.max(data, yAccessor);
    const originalYScale = d3.scaleLinear().domain([0, originalYMax]).nice().range([plot.h, 0]);
    const originalLine = selectMainLine(g);
    const originalPoints = selectMainPoints(g);
    const transitionDuration = 1000;

    if (op.field === yField) {
        const yPos = originalYScale(op.value);
        if (!isNaN(yPos)) {
            g.append("line").attr("class", "annotation filter-line")
                .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
                .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "6 4")
                .attr("opacity", 0).transition().duration(500).attr("opacity", 1);
            
            svg.append("text").attr("class", "annotation threshold-label")
                .attr("x", margins.left + plot.w + 6)
                .attr("y", margins.top + yPos)
                .attr("dominant-baseline", "middle")
                .attr("fill", "red")
                .attr("font-weight", "bold")
                .text(`${op.operator} ${op.value.toLocaleString()}`);
        }
    } else if (op.field === xField && op.operator === 'between') {
        const xStart = originalXScale(parseDateWithGranularity(op.value[0]).date);
        const xEnd = originalXScale(parseDateWithGranularity(op.value[1]).date);
        if(!isNaN(xStart) && !isNaN(xEnd)) {
            g.append("rect").attr("class", "annotation filter-range")
                .attr("x", xStart).attr("y", 0).attr("width", xEnd - xStart).attr("height", plot.h)
                .attr("fill", "steelblue").attr("opacity", 0)
                .transition().duration(500).attr("opacity", 0.2);
        }
    }

    await delay(800);

    if (!filteredData || filteredData.length === 0) {
        originalLine.transition().duration(500).attr("opacity", 0.1);
        originalPoints.transition().duration(500).attr("opacity", 0.1);
        g.append("text").attr("class", "annotation empty-label")
            .attr("x", plot.w / 2).attr("y", plot.h / 2)
            .attr("text-anchor", "middle").attr("font-size", "16px").attr("font-weight", "bold")
            .text("No data matches the filter.");
        return [];
    }
    
    const filteredDataIds = new Set(filteredData.map(d => d.id));

    originalLine.transition().duration(transitionDuration)
        .attr("stroke", "#eee")
        .attr("stroke-width", 1.5);
    
    originalPoints.filter(d => !filteredDataIds.has(d.id))
        .transition().duration(transitionDuration)
        .attr("opacity", 0.2);
    
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

    await delay(1000);

    const newXScale = d3.scaleTime().domain(d3.extent(filteredData, xAccessor)).range([0, plot.w]);
    const newYScale = d3.scaleLinear().domain([0, d3.max(filteredData, yAccessor)]).nice().range([plot.h, 0]);
    const newLineGen = d3.line().x(d => newXScale(xAccessor(d))).y(d => newYScale(yAccessor(d)));

    g.select(".x-axis").transition().duration(transitionDuration)
        .call(d3.axisBottom(newXScale));
    g.select(".y-axis").transition().duration(transitionDuration)
        .call(d3.axisLeft(newYScale));

    highlightLine.transition().duration(transitionDuration)
        .attr("d", newLineGen);

    originalPoints.filter(d => filteredDataIds.has(d.id))
        .transition().duration(transitionDuration)
        .attr("cx", d => newXScale(xAccessor(d)))
        .attr("cy", d => newYScale(yAccessor(d)));

    originalLine.transition().duration(transitionDuration).attr("opacity", 0).remove();
    originalPoints.filter(d => !filteredDataIds.has(d.id))
        .transition().duration(transitionDuration).attr("opacity", 0).remove();

    return filteredData;
}

export async function simpleLineDetermineRange(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return null;

    const getY = (d) => (d && typeof d.value === 'number') ? d.value : NaN;
    const values = data.map(getY).filter(v => !isNaN(v));
    
    if (values.length === 0) return null;

    const minV = d3.min(values);
    const maxV = d3.max(values);
    const result = new IntervalValue(yField, minV, maxV);

    const points = selectMainPoints(g);
    const hlColor = "#0d6efd";

    const findPointsByValue = (v) => points.filter(function() {
        return +d3.select(this).attr("data-value") === +v;
    });

    const minPts = findPointsByValue(minV);
    const maxPts = findPointsByValue(maxV);

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
    
    const annotateValuePoints = (value, label, pointsSelection) => {
        if (value === undefined || pointsSelection.empty()) return;
        
        const yScale = d3.scaleLinear().domain([0, d3.max(values)]).nice().range([plot.h, 0]);
        const yPos = yScale(value);

        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos)
            .attr("x2", 0).attr("y2", yPos)
            .attr("stroke", hlColor)
            .attr("stroke-dasharray", "4 4")
            .transition().duration(1000)
            .attr("x2", plot.w);

        pointsSelection.each(function() {
            const point = d3.select(this);
            const cx = +point.attr("cx");
            const cy = +point.attr("cy");

            g.append("text").attr("class", "annotation")
                .attr("x", cx)
                .attr("y", cy - 15)
                .attr("text-anchor", "middle")
                .attr("fill", hlColor)
                .attr("font-weight", "bold")
                .attr("stroke", "white")
                .attr("stroke-width", 3.5)
                .attr("paint-order", "stroke")
                .text(`${label}: ${value.toLocaleString()}`);
        });
    };
    
    await delay(200);
    
    annotateValuePoints(minV, "Min", minPts);
    annotateValuePoints(maxV, "Max", maxPts);

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

    return result;
}

export async function simpleLineSum(chartId, op, data) {}

export async function simpleLineAverage(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    const result = dataAverage(data, op, xField, yField);

    if (!result) {
        console.warn('[simpleLineAverage] could not compute average');
        return null;
    }
    const avg = result.value;
    const hlColor = 'red';
    
    const values = data.map(d => d ? d.value : NaN).filter(Number.isFinite);
    const yMax = d3.max(values);
    const yScale = d3.scaleLinear().domain([0, yMax || 0]).nice().range([plot.h, 0]);
    const yPos = yScale(avg);

    const line = g.append('line')
        .attr('class', 'annotation avg-line')
        .attr('x1', 0).attr('x2', 0)
        .attr('y1', yPos).attr('y2', yPos)
        .attr('stroke', hlColor).attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 5');

    await line.transition().duration(800).attr('x2', plot.w).end();

    g.append('text').attr('class', 'annotation avg-label')
        .attr('x', plot.w - 10)
        .attr('y', yPos - 10)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', hlColor)
        .attr('font-weight', 'bold')
        .attr('stroke', 'white')
        .attr('stroke-width', 3.5)
        .attr('paint-order', 'stroke')
        .text(`Avg: ${Number.isInteger(avg) ? avg : avg.toLocaleString(undefined,{ maximumFractionDigits: 2 })}`)
        .attr('opacity', 0)
        .transition().delay(200).duration(400).attr('opacity', 1);
        
    return result;
}

export async function simpleLineNth(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const resultData = dataNth(data, op);
    const targetDatum = resultData.length > 0 ? resultData[0] : null;

    if (!targetDatum) {
        return null;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const n = op.n || 1;
    const from = op.from || 'left';
    const hlColor = '#20c997';

    await Promise.all([
        baseLine.transition().duration(300).attr('opacity', 0.2).end(),
        points.transition().duration(300).attr('opacity', 0.25).end()
    ]);
    
    const dataSequence = from === 'right' ? [...data].reverse() : data;
    const countedPoints = [];

    for (let i = 0; i < n; i++) {
        const datum = dataSequence[i];
        const candidates = toPointIdCandidates(datum.target);
        const pointSel = points.filter(function() {
            const id = d3.select(this).attr("data-id");
            return candidates.includes(id);
        });

        if (!pointSel.empty()) {
            countedPoints.push(pointSel.node());
            await pointSel.transition().duration(150).attr('opacity', 1).attr('r', 7).end();

            const countLabel = g.append('text')
                .attr('class', 'annotation count-label')
                .attr('x', pointSel.attr('cx'))
                .attr('y', +pointSel.attr('cy') - 15)
                .attr('text-anchor', 'middle')
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1));
            
            if (i === n - 1) {
                countLabel.classed('final-count', true);
            }
            
            await delay(250);
        }
    }

    const finalTargetNode = countedPoints[n - 1];
    const otherCountedNodes = countedPoints.slice(0, n - 1);

    await Promise.all([
        d3.selectAll(otherCountedNodes).transition().duration(300).attr('opacity', 0.25).attr('r', 5).end(),
        g.selectAll('.count-label:not(.final-count)').transition().duration(300).attr('opacity', 0).remove().end()
    ]);
    
    await g.selectAll('.final-count').transition().duration(300).attr('opacity', 0).remove().end();

    if (finalTargetNode) {
        d3.select(finalTargetNode).transition().duration(300).attr('fill', hlColor).attr('opacity', 1).attr('r', 8);
        const cx = +d3.select(finalTargetNode).attr('cx');
        const cy = +d3.select(finalTargetNode).attr('cy');
        
        g.append("line").attr("class", "annotation")
            .attr("x1", cx).attr("y1", cy)
            .attr("x2", cx).attr("y2", plot.h)
            .attr("stroke", hlColor)
            .attr("stroke-dasharray", "4 4");

        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy)
            .attr("stroke", hlColor)
            .attr("stroke-dasharray", "4 4");

        g.append("text").attr("class", "annotation")
            .attr("x", cx + 5)
            .attr("y", cy - 10)
            .attr("fill", hlColor)
            .attr("font-weight", "bold")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(targetDatum.value.toLocaleString());
    }
    
    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth (from ${from}): ${n}`);

    return targetDatum;
}

export async function simpleLineCount(chartId, op, data) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataCount(data, op, xField, yField);
    const totalCount = result ? result.value : 0;

    if (totalCount === 0) {
        return result;
    }

    const baseLine = selectMainLine(g);
    const points = selectMainPoints(g);
    const hlColor = '#20c997';

    await Promise.all([
        baseLine.transition().duration(150).attr('opacity', 0.3).end(),
        points.transition().duration(150).attr('fill', '#a9a9a9').attr('opacity', 0.3).end()
    ]);

    for (let i = 0; i < totalCount; i++) {
        const datum = data[i];
        const candidates = toPointIdCandidates(datum.target);
        const pointSel = points.filter(function() {
            const id = d3.select(this).attr("data-id");
            return candidates.includes(id);
        });

        if (!pointSel.empty()) {
            await pointSel.transition().duration(150)
                .attr('fill', hlColor)
                .attr('opacity', 1)
                .attr('r', Math.max(6, +pointSel.attr('r') || 6))
                .end();

            g.append('text')
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
                .attr('opacity', 0)
                .transition().duration(125).attr('opacity', 1);

            await delay(60);
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

