
import { getSvgAndSetup, clearAllAnnotations, delay } from '../simple/simpleLineFunctions.js';


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

    const filteredData = targetSeries.values;
    const highlightColor = colorScale(targetSeriesKey);

    g.selectAll("path.series-line").classed("main-line", false).attr("data-main", "false");
    const animationPromises = [];
    animationPromises.push(
        g.selectAll("path.series-line").filter(d => d.key !== targetSeriesKey)
            .transition().duration(800).attr("opacity", 0.1).end()
    );
    const targetLine = g.selectAll("path.series-line").filter(d => d.key === targetSeriesKey);
    animationPromises.push(
        targetLine.transition().duration(800)
            .attr("stroke", highlightColor).attr("stroke-width", 2.5).attr("opacity", 1).end()
    );
    const legend = g.select(".legend");
    if (!legend.empty()) {
        animationPromises.push(legend.transition().duration(800).attr("opacity", 0).end());
    }
    await Promise.all(animationPromises);

    targetLine.classed("main-line", true).attr("data-main", "true").raise();

    const fmtISO = d3.timeFormat("%Y-%m-%d");
    g.selectAll("circle.datapoint").remove();
    g.selectAll("circle.datapoint")
        .data(filteredData, d => d[xField] instanceof Date ? +d[xField] : String(d[xField]))
        .join("circle")
        .attr("class", "datapoint main-dp")
        .attr("cx", d => fullXScale(d[xField]))
        .attr("cy", d => fullYScale(d[yField]))
        .attr("r", 5)
        .attr("fill", highlightColor)
        .attr("opacity", 0)
        .attr("data-id", d => d[xField] instanceof Date ? fmtISO(d[xField]) : String(d[xField]))
        .attr("data-value", d => d[yField]);

    svg.append("text")
        .attr("class", "transform-label annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", highlightColor)
        .text(`Displaying Series: ${targetSeriesKey}`);

    return filteredData;
}

export async function multipleLineRetrieveValue(chartId, op, data) {}

export async function multipleLineFilter(chartId, op, data) {}

export async function multipleLineFindExtremum(chartId, op, data) {}

export async function multipleLineDetermineRange(chartId, op, data) {}

export async function multipleLineCompare(chartId, op, data) {}

export async function multipleLineSum(chartId, op, data) {}

export async function multipleLineAverage(chartId, op, data) {}

export async function multipleLineDiff(chartId, op, data) {}

export async function multipleLineCount(chartId, op, data) {}

export async function multiLineRetrieveByX(chartId, op, chartData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    const { series, fullXScale, fullYScale, colorScale } = chartData;
    clearAllAnnotations(svg);

    const targetDate = new Date(op.x);
    if (isNaN(+targetDate)) {
        console.warn("Invalid date for retrieveByX:", op.x);
        return;
    }

    const xPos = fullXScale(targetDate);
    if (xPos === undefined || xPos < 0 || xPos > plot.w) {
        console.warn("Date is out of the chart's range:", op.x);
        return;
    }

    svg.append("line")
        .attr("class", "annotation")
        .attr("x1", margins.left + xPos)
        .attr("y1", margins.top)
        .attr("x2", margins.left + xPos)
        .attr("y2", margins.top) 
        .attr("stroke", "#333")
        .attr("stroke-dasharray", "6 4")
        .transition().duration(800)
        .attr("y2", margins.top + plot.h); 
    series.forEach((s, i) => {
        const pointData = s.values.find(d => +d[xField] === +targetDate);
        if (!pointData) return;

        const yPos = fullYScale(pointData[yField]);
        const color = colorScale(s.key);


        g.append("circle")
            .attr("class", "annotation")
            .attr("cx", xPos)
            .attr("cy", yPos)
            .attr("r", 0)
            .attr("fill", color)
            .attr("stroke", "white")
            .attr("stroke-width", 2)
            .transition().delay(200 * i)
            .duration(500)
            .attr("r", 6);

        g.append("text")
            .attr("class", "annotation")
            .attr("x", xPos + 10)
            .attr("y", yPos)
            .attr("fill", color)
            .attr("font-weight", "bold")
            .attr("dominant-baseline", "middle")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .attr("opacity", 0)
            .text(pointData[yField].toLocaleString())
            .transition().delay(200 * i + 200)
            .duration(500)
            .attr("opacity", 1);
    });
}

export async function multiLineFilterByY(chartId, op, chartData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    const { series, fullXScale, fullYScale, colorScale } = chartData;
    clearAllAnnotations(svg);

    const fromValue = op.from !== undefined ? op.from : -Infinity;
    const toValue = op.to !== undefined ? op.to : Infinity;

    [op.from, op.to].forEach(val => {
        if (val === undefined) return;
        const yPos = fullYScale(val);
        svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left + plot.w)
            .attr("y1", margins.top + yPos).attr("y2", margins.top + yPos)
            .attr("stroke", "#007bff").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
    });

    g.selectAll("path.series-line")
        .transition().duration(600)
        .attr("opacity", 0.1);

    const lineGen = d3.line()
        .x(d => fullXScale(d[xField]))
        .y(d => fullYScale(d[yField]));

    series.forEach(s => {
        const segments = [];
        let currentSegment = [];
        s.values.forEach((d, i) => {
            const isInside = d[yField] >= fromValue && d[yField] <= toValue;
            if (isInside) {
                currentSegment.push(d);
            }
            if (!isInside || i === s.values.length - 1) {
                if (currentSegment.length > 1) {
                    segments.push([...currentSegment]);
                }
                currentSegment = [];
            }
        });

        segments.forEach(segmentData => {
            g.append("path")
                .datum(segmentData)
                .attr("class", "annotation")
                .attr("fill", "none")
                .attr("stroke", colorScale(s.key))
                .attr("stroke-width", 2.5)
                .attr("d", lineGen)
                .attr("opacity", 0)
                .transition().delay(300).duration(600)
                .attr("opacity", 1);
        });
    });

    const labelText = `Filter: ${op.field} in [${op.from !== undefined ? op.from : '...'} ~ ${op.to !== undefined ? op.to : '...'}]`;
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", "#007bff")
        .text(labelText);
}