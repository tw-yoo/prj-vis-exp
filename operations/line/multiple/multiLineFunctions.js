import {
    retrieveValue as lineChartRetrieveValue,
    filter as lineChartFilter,
    findExtremum as lineChartFindExtremum,
    determineRange as lineChartDetermineRange,
    compareBool as lineChartCompareBool,
    diff as lineChartDiff,
    sum as lineChartSum,
    average as lineChartAverage,
    nth as lineChartNth,
    count as lineChartCount
} from "../../lineChartOperationFunctions.js";
import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";

const fmtISO = d3.timeFormat("%Y-%m-%d");

function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const g = svg.select(".plot-area");
    const margins = { left: +svg.attr("data-m-left") || 0, top: +svg.attr("data-m-top") || 0 };
    const plot = { w: +svg.attr("data-plot-w") || 0, h: +svg.attr("data-plot-h") || 0 };
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const colorField = svg.attr("data-color-field");
    return { svg, g, margins, plot, xField, yField, colorField };
}

function clearAllAnnotations(svg) {
    svg.selectAll(".annotation").remove();
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

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

function buildScales(data, plot) {
    const xVals = data.map(d => d.target);
    const isTemporal = xVals.every(v => v instanceof Date);
    const xScale = isTemporal
        ? d3.scaleTime().domain(d3.extent(xVals)).range([0, plot.w])
        : d3.scalePoint().domain(xVals).range([0, plot.w]);

    const yValues = data.map(d => d.value).filter(v => Number.isFinite(v));
    const yMax = d3.max(yValues);
    const yMin = d3.min(yValues);
    const yScale = d3.scaleLinear().domain([yMin > 0 ? 0 : yMin, yMax]).nice().range([plot.h, 0]);

    return { xScale, yScale };
}

export async function multipleLineRetrieveValue(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetDatums = lineChartRetrieveValue(data, op);

    if (targetDatums.length === 0) return [];

    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const cx = xScale(targetDatums[0].target);

    await g.selectAll("path.series-line").transition().duration(500)
        .attr("opacity", 0.3)
        .attr("stroke-width", 1.5)
        .end().catch(err => {});

    g.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("y1", plot.h)
        .attr("x2", cx).attr("y2", 0)
        .attr("stroke", "#333").attr("stroke-dasharray", "4 4");

    targetDatums.forEach(datum => {
        const cy = yScale(datum.value);
        const color = colorScale(datum.group);

        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy)
            .attr("stroke", color).attr("stroke-dasharray", "2 2")
            .attr("opacity", 0.7);

        g.append("circle").attr("class", "annotation")
            .attr("cx", cx).attr("cy", cy).attr("r", 0)
            .attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
            .transition().duration(400).delay(200)
            .attr("r", 6);

        g.append("text").attr("class", "annotation")
            .attr("x", cx + 8).attr("y", cy)
            .attr("dominant-baseline", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .text(datum.value.toLocaleString())
            .attr("opacity", 0)
            .transition().duration(400).delay(300)
            .attr("opacity", 1);
    });

    return targetDatums;
}

export async function multipleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, colorField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const filteredData = lineChartFilter(data, op, xField, yField, colorField);
    
    const { xScale: originalXScale, yScale: originalYScale } = buildScales(data, plot);
    const allLines = g.selectAll("path.series-line");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    if (op.field === yField) {
        const yPos = originalYScale(op.value);
        g.append("line").attr("class", "annotation")
            .attr("x1", 0).attr("y1", yPos).attr("x2", plot.w).attr("y2", yPos)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
        
        g.append("text").attr("class", "annotation")
            .attr("x", plot.w - 5).attr("y", yPos - 5)
            .attr("text-anchor", "end").attr("fill", "red")
            .attr("font-weight", "bold").attr("font-size", "12px")
            .text(op.value.toLocaleString());

    } else if (op.field === xField && op.operator === 'between' && Array.isArray(op.value)) {
        const [startDate, endDate] = op.value.map(d => parseDate(d));
        if (startDate && endDate) {
            const xStart = originalXScale(startDate);
            const xEnd = originalXScale(endDate);
            g.append("rect").attr("class", "annotation").attr("x", xStart).attr("y", 0).attr("width", xEnd - xStart).attr("height", plot.h).attr("fill", "steelblue").attr("opacity", 0.15);
        }
    }

    await delay(800);

    if (filteredData.length === 0) {
        await g.selectAll(".annotation, path.series-line, circle.datapoint").transition().duration(500).attr("opacity", 0).remove().end();
        return [];
    }

    allLines.transition().duration(1000).attr("opacity", 0.1);
    g.selectAll("circle.datapoint").transition().duration(1000).attr("opacity", 0).remove();

    const highlightLineGen = d3.line().x(d => originalXScale(d.target)).y(d => originalYScale(d.value));
    const filteredSeries = d3.groups(filteredData, d => d.group);

    g.selectAll(".highlight-line")
        .data(filteredSeries)
        .join("path")
        .attr("class", "annotation highlight-line")
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d[0]))
        .attr("stroke-width", 2.5)
        .attr("opacity", 0)
        .attr("d", d => highlightLineGen(d[1]))
        .transition().duration(800)
        .attr("opacity", 1);

    await delay(1200);

    g.selectAll(".annotation:not(.highlight-line)").transition().duration(500).attr("opacity", 0).remove();
    
    const { xScale: newXScale, yScale: newYScale } = buildScales(filteredData, plot);
    const newLineGen = d3.line().x(d => newXScale(d.target)).y(d => newYScale(d.value));

    await Promise.all([
        g.select(".x-axis").transition().duration(1200).call(d3.axisBottom(newXScale)).end(),
        g.select(".y-axis").transition().duration(1200).call(d3.axisLeft(newYScale)).end(),
        allLines.transition().duration(800).attr("opacity", 0).remove().end(),
        g.selectAll(".highlight-line")
            .transition().duration(1200)
            .attr("d", d => newLineGen(d[1]))
            .end()
    ]);

    g.selectAll(".highlight-line").attr("class", "series-line").classed("annotation", false);

    return filteredData;
}

export async function multipleLineFindExtremum(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const extremumDatums = lineChartFindExtremum(data, op);

    if (extremumDatums.length === 0) return null;

    await g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0).end();

    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    const which = op.which || 'max';
    const extremumValue = extremumDatums[0].value;

    extremumDatums.forEach(datum => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        const color = seriesColors(datum.group);

        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").transition().duration(700).delay(200).attr("y2", plot.h);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").transition().duration(700).delay(200).attr("x2", 0);
        
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).delay(200).attr("r", 7);

        const valueText = `${which.charAt(0).toUpperCase() + which.slice(1)}: ${extremumValue.toLocaleString()}`;
        const dateText = `(${fmtISO(datum.target)})`;
        const textLabel = g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 20).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke");
        
        textLabel.append("tspan").attr("x", cx).attr("dy", "0em").text(valueText);
        textLabel.append("tspan").attr("x", cx).attr("dy", "1.2em").text(dateText);
    });

    return extremumDatums[0] || null;
}

export async function multipleLineDetermineRange(chartId, op, data) {
    const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const rangeResult = lineChartDetermineRange(data, op, yField);
    if (!rangeResult) return null;

    const { minV, maxV, minDatums, maxDatums } = rangeResult;
    
    await g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0).remove().end();

    const { xScale, yScale } = buildScales(data, plot);
    const seriesColors = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));
    const hlColor = "#0d6efd";

    const annotateValue = (value, label, datums) => {
        const yPos = yScale(value);

        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos).attr("stroke", hlColor).attr("stroke-dasharray", "4 4").transition().duration(1000).attr("x2", plot.w);
        
        datums.forEach(datum => {
            const cx = xScale(datum.target);
            const color = seriesColors(datum.group);

            g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", yPos).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).delay(200).attr("r", 7);
            g.append("text").attr("class", "annotation").attr("x", cx).attr("y", yPos - 12).attr("text-anchor", "middle").attr("font-weight", "bold").attr("fill", color).attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(`${label}: ${value.toLocaleString()}`).attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
        });
    };

    annotateValue(minV, "Min", minDatums);
    annotateValue(maxV, "Max", maxDatums);

    await delay(500);

    const summaryText = `Range: ${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`;
    svg.append("text").attr("class", "annotation").attr("x", margins.left).attr("y", margins.top - 10).attr("font-size", 14).attr("font-weight", "bold").attr("fill", hlColor).text(summaryText).attr('opacity', 0).transition().duration(400).delay(800).attr('opacity', 1);

    return rangeResult.interval;
}

export async function multipleLineNth(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    if (allPoints.empty()) return [];

    const categoryMap = new Map();
    data.forEach(d => {
        if (!d || d.target === undefined) return;
        const categoryStr = d.target instanceof Date ? fmtISO(d.target) : String(d.target);
        if (!categoryMap.has(categoryStr)) {
            categoryMap.set(categoryStr, d.target);
        }
    });
    
    const sortedCategories = Array.from(categoryMap.values())
        .sort((a, b) => a - b) 
        .map(date => fmtISO(date));

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    
    if (sortedCategories.length === 0) return [];
    
    const total = sortedCategories.length;
    if (!Number.isFinite(n) || n <= 0 || n > total) return [];

    const sequence = from === 'right' ? sortedCategories.slice().reverse() : sortedCategories;
    const pickedCategory = sequence[n - 1];

    const nthData = lineChartNth(data, { ...op, groupBy: 'target' });

    await Promise.all([
        allLines.transition().duration(300).attr("opacity", 0.2).end(),
        allPoints.transition().duration(300).attr("opacity", 0.2).end()
    ]);
    await delay(300);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(d => d.group));

    for (let i = 0; i < n; i++) {
        const category = sequence[i];
        const categoryPoints = allPoints.filter(function(d) {
            if (!d || d.target === undefined) return false;
            const currentCategory = d.target instanceof Date ? fmtISO(d.target) : String(d.target);
            return currentCategory === category;
        });
        
        if (categoryPoints.empty()) continue;

        await categoryPoints.transition().duration(150).attr('opacity', 1).attr('r', 6).end();
        
        categoryPoints.each(function(d){
            const point = d3.select(this);
            const cx = point.attr('cx');
            const cy = point.attr('cy');
            const color = colorScale(d.group);
            
            g.append('text')
                .attr('class', 'annotation count-label')
                .attr('x', cx)
                .attr('y', cy - 10)
                .attr('text-anchor', 'middle')
                .attr('font-weight', 'bold')
                .attr('font-size', '12px')
                .attr('fill', color)
                .attr('stroke', 'white')
                .attr('stroke-width', 2.5)
                .attr('paint-order', 'stroke')
                .text(String(i + 1));
        });

        await delay(300);

        if (i < n - 1) {
            await categoryPoints.transition().duration(150).attr('opacity', 0.2).attr('r', 3.5).end();
        }
    }

    await g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end();
    
    const { xScale, yScale } = buildScales(data, plot);
    
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
        .attr('fill', '#20c997')
        .text(`Nth (from ${from}): ${n} (${pickedCategory})`);

    return nthData;
}

export async function multipleLineCompare(chartId, op, data) {
    const { svg, g, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumA = data.find(d => isSameDateOrValue(d.target, op.targetA.category) && d.group === op.targetA.series);
    const datumB = data.find(d => isSameDateOrValue(d.target, op.targetB.category) && d.group === op.targetB.series);
    const boolResult = lineChartCompareBool(data, op);

    if (!datumA || !datumB || !boolResult) {
        console.warn("Compare failed: points or boolResult not found.");
        return null;
    }
    
    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    
    g.selectAll("path.series-line, circle.datapoint").transition().duration(600).attr("opacity", 0.1);

    const annotatePoint = (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4").style("opacity", 0).transition().duration(700).style("opacity", 1);
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 0).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2).transition().duration(500).attr("r", 7);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString()).attr("opacity", 0).transition().duration(400).delay(400).attr("opacity", 1);
    };
    
    annotatePoint(datumA, colorScale(datumA.group));
    annotatePoint(datumB, colorScale(datumB.group));
    
    await delay(800);
    
    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const valA = datumA.value;
    const valB = datumB.value;
    const groupA = datumA.group;
    const groupB = datumB.group;
    const result = boolResult.value;

    const summary = `${valA.toLocaleString()} (${groupA})${symbol}${valB.toLocaleString()} (${groupB}) → ${result}`;
    
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", result === true ? "green" : "red")
        .text(summary);

    return boolResult;
}

export async function multipleLineAverage(chartId, op, data) {
    const { svg, g, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!data || data.length === 0) return null;

    const result = lineChartAverage(data, op, yField);
    if (!result) return null;
    const avg = result.value;
    
    const { yScale } = buildScales(data, plot);
    const yPos = yScale(avg);
    const color = "red";
    
    const line = g.append("line").attr("class", "annotation avg-line").attr("x1", 0).attr("y1", yPos).attr("x2", 0).attr("y2", yPos).attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    await line.transition().duration(800).attr("x2", plot.w).end();

    g.append("text").attr("class", "annotation avg-label")
        .attr("x", plot.w - 10).attr("y", yPos - 5)
        .attr("text-anchor", "end")
        .attr("fill", color).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
        .text(`Avg: ${avg.toLocaleString(undefined, {maximumFractionDigits: 2})}`)
        .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);

    return result;
}

export async function multipleLineDiff(chartId, op, data) {
    const { svg, g, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const diffResult = lineChartDiff(data, op, yField);
    if (!diffResult) return null;
    
    const datumA = data.find(d => isSameDateOrValue(d.target, op.targetA.category) && d.group === op.targetA.series);
    const datumB = data.find(d => isSameDateOrValue(d.target, op.targetB.category) && d.group === op.targetB.series);
    if (!datumA || !datumB) return diffResult;

    const { xScale, yScale } = buildScales(data, plot);
    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    
    g.selectAll("path.series-line, circle.datapoint").transition().duration(600).attr("opacity", 0.1);

    const annotatePoint = async (datum, color) => {
        const cx = xScale(datum.target);
        const cy = yScale(datum.value);
        g.append("line").attr("class", "annotation").attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", plot.h).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("line").attr("class", "annotation").attr("x1", 0).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("stroke", color).attr("stroke-dasharray", "4 4");
        g.append("circle").attr("class", "annotation").attr("cx", cx).attr("cy", cy).attr("r", 7).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        g.append("text").attr("class", "annotation").attr("x", cx).attr("y", cy - 12).attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke").text(datum.value.toLocaleString());
    };
    
    await Promise.all([annotatePoint(datumA, colorScale(datumA.group)), annotatePoint(datumB, colorScale(datumB.group))]);

    const summary = `Difference (Δ): ${diffResult.value.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", "bold")
        .attr("fill", "#333").text(summary);

    return diffResult;
}

export async function multipleLineCount(chartId, op, data) {
    const { svg, g, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const countResult = lineChartCount(data, op, yField);
    
    const allLines = g.selectAll("path.series-line");
    const allPoints = g.selectAll("circle.datapoint");
    
    await Promise.all([
        allLines.transition().duration(200).attr('opacity', 0.2).end(),
        allPoints.transition().duration(200).attr('opacity', 0.2).end()
    ]);

    const pointsInOrder = allPoints.nodes().sort((a, b) => (+a.getAttribute('cx')) - (+b.getAttribute('cx')));
    
    for (let i = 0; i < pointsInOrder.length; i++) {
        const node = pointsInOrder[i];
        const point = d3.select(node);
        const cx = +point.attr('cx');
        const cy = +point.attr('cy');
        
        await point.transition().duration(40).attr('opacity', 1).attr('r', 6).end();

        g.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', cx)
            .attr('y', cy - 10)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('font-size', '10px')
            .attr('fill', '#333')
            .text(String(i + 1));

        await delay(40);
    }
    
    await g.selectAll('.count-label').transition().duration(500).delay(200).attr('opacity', 0).remove().end();

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', '#20c997')
        .text(`Count: ${countResult.value}`);

    return countResult;
}

export async function multipleLineChangeToSimple(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const targetSeriesKey = op.group;
    if (!targetSeriesKey) {
        console.warn("ChangeToSimple requires a 'group' property.");
        return data;
    }
    const filteredData = data.filter(d => d.group === targetSeriesKey);

    if (filteredData.length === 0) {
        console.warn(`Series with key '${targetSeriesKey}' not found.`);
        return [];
    }

    const allSeries = Array.from(new Set(data.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSeries);
    const highlightColor = colorScale(targetSeriesKey);
    
    const allLines = g.selectAll("path.series-line");
    
    const targetLine = allLines.filter(d => d[0] === targetSeriesKey);
    const otherLines = allLines.filter(d => d[0] !== targetSeriesKey);

    if (targetLine.empty()) {
        console.warn(`Visual element for series '${targetSeriesKey}' not found.`);
        return filteredData;
    }

    await Promise.all([
        otherLines.transition().duration(800).attr("opacity", 0).remove().end(),
        targetLine.transition().duration(800).attr("stroke-width", 3.5).end(),
        svg.select(".legend").transition().duration(800).attr("opacity", 0).remove().end()
    ]).catch(() => {});

    const { xScale: newXScale, yScale: newYScale } = buildScales(filteredData, plot);
    const newLineGen = d3.line()
        .x(d => newXScale(d.target))
        .y(d => newYScale(d.value));

    await Promise.all([
        targetLine.transition().duration(1000).attr("d", d => newLineGen(d[1])).end(),
        g.select(".y-axis").transition().duration(1000).call(d3.axisLeft(newYScale)).end(),
        g.select(".x-axis").transition().duration(1000).call(d3.axisBottom(newXScale)).end()
    ]).catch(() => {});
    
    g.selectAll("circle.datapoint").remove(); 
    g.selectAll("circle.datapoint-highlight")
        .data(filteredData)
        .join("circle")
        .attr("class", "annotation datapoint-highlight")
        .attr("cx", d => newXScale(d.target))
        .attr("cy", d => newYScale(d.value))
        .attr("r", 0)
        .attr("fill", highlightColor)
        .transition().duration(500).delay((d, i) => i * 20)
        .attr("r", 5);
        
    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", highlightColor)
        .attr("opacity", 0)
        .text(`Displaying Series: ${targetSeriesKey}`)
        .transition().duration(500).delay(200)
        .attr("opacity", 1);

    return filteredData;
}
