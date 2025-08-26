
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
        .attr("data-value", d => d[yField])
        .attr("data-series", () => String(targetSeriesKey));

    svg.append("text")
        .attr("class", "transform-label annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", highlightColor)
        .text(`Displaying Series: ${targetSeriesKey}`);

    return filteredData;
}

export async function multipleLineRetrieveValue(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // Guards
    if (!Array.isArray(data) || data.length === 0) {
        console.warn('multipleLineRetrieveValue: empty data');
        return null;
    }

    const lines = g.selectAll('path.series-line');
    const retrieveField = op.field || xField; // default: by x
    const seriesKey = op.group ?? op.series ?? null;

    // Try to derive a color from the series path; fallback otherwise
    let hlColor = '#ff6961';
    if (seriesKey) {
        const sp = lines.filter(d => d && d.key === seriesKey);
        if (!sp.empty()) {
            const s = sp.attr('stroke');
            if (s) hlColor = s;
        }
    }

    // --- Helpers for x normalization and candidate matching ---
    const fmtISO = d3.timeFormat('%Y-%m-%d');
    const parseMaybeDate = (v) => {
        if (v instanceof Date) return v;
        const d = new Date(v);
        return isNaN(+d) ? null : d;
    };
    const normalizeX = (v) => {
        const d = parseMaybeDate(v);
        return d ? d : String(v);
    };
    const xCandidates = (v) => {
        const d = parseMaybeDate(v);
        if (d) return [fmtISO(d), String(d.getFullYear()), String(+d)];
        return [String(v)];
    };

    // --- Build scales from provided DatumValue[] (no DOM points needed) ---
    const xVals = data.map(d => normalizeX(d.target));
    const isTemporal = xVals.every(v => v instanceof Date);

    let xScale;
    if (isTemporal) {
        xScale = d3.scaleTime()
            .domain(d3.extent(xVals))
            .range([0, plot.w]);
    } else {
        const seen = new Set();
        const domain = [];
        for (const v of xVals) {
            const k = String(v);
            if (!seen.has(k)) { seen.add(k); domain.push(k); }
        }
        xScale = d3.scalePoint().domain(domain).range([0, plot.w]);
    }

    const allValues = data.map(d => +d.value).filter(Number.isFinite);
    const yMin = Math.min(0, d3.min(allValues) ?? 0);
    const yMax = d3.max(allValues) ?? 1;
    const yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([plot.h, 0]);

    // --- Find the target datum in data (series-aware) ---
    const inSeries = seriesKey ? data.filter(d => d.group != null && String(d.group) === String(seriesKey)) : data;
    let picked = null;

    if (retrieveField === yField) {
        const targetY = +op.target;
        picked = inSeries.find(d => +d.value === targetY) || data.find(d => +d.value === targetY) || null;
    } else {
        const userCands = xCandidates(op.target);
        const matchX = (dv) => {
            const dc = xCandidates(dv.target);
            return dc.some(v => userCands.includes(v));
        };
        picked = inSeries.find(matchX) || data.find(matchX) || null;
    }

    if (!picked) {
        console.warn('multipleLineRetrieveValue: could not match target in data', { target: op.target, field: retrieveField, seriesKey });
        return null;
    }

    // --- Compute pixel coordinates from scales ---
    const cx = xScale(normalizeX(picked.target));
    const cy = yScale(+picked.value);

    // Dim non-target series if possible
    try {
        await lines.transition().duration(600).attr('opacity', d => (seriesKey && d && d.key === seriesKey) ? 1 : (seriesKey ? 0.15 : 1)).end();
    } catch (e) {}

    // Marker at picked location (plot-area coords)
    const marker = g.append('circle')
        .attr('class', 'annotation retrieve-marker')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 0)
        .attr('fill', hlColor)
        .attr('stroke', 'white')
        .attr('stroke-width', 2);
    try { await marker.transition().duration(450).attr('r', 7).end(); } catch(e) {}

    // Guide lines (SVG coords)
    const vx = margins.left + cx;
    const vy = margins.top + cy;

    const vLine = svg.append('line').attr('class','annotation')
        .attr('x1', vx).attr('y1', vy)
        .attr('x2', vx).attr('y2', vy)
        .attr('stroke', hlColor).attr('stroke-dasharray', '4 4');
    const hLine = svg.append('line').attr('class','annotation')
        .attr('x1', vx).attr('y1', vy)
        .attr('x2', vx).attr('y2', vy)
        .attr('stroke', hlColor).attr('stroke-dasharray', '4 4');

    try {
        await Promise.all([
            vLine.transition().duration(500).attr('y2', margins.top + plot.h).end(),
            hLine.transition().duration(500).attr('x2', margins.left).end()
        ]);
    } catch(e) {}

    // Label
    const labelText = (retrieveField === yField)
        ? (isTemporal ? fmtISO(normalizeX(picked.target)) : String(picked.target))
        : Number(picked.value).toLocaleString();

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', vx + 6)
        .attr('y', vy - 6)
        .attr('fill', hlColor)
        .attr('font-weight', 'bold')
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(labelText)
        .attr('opacity', 0)
        .transition().duration(300).attr('opacity', 1);

    return picked;
}

export async function multipleLineFilter(chartId, op, data) {}

export async function multipleLineFindExtremum(chartId, op, data) {}

export async function multipleLineDetermineRange(chartId, op, data) {}

export async function multipleLineCompare(chartId, op, data) {}

export async function multipleLineSum(chartId, op, data) {}

export async function multipleLineAverage(chartId, op, data) {}

export async function multipleLineDiff(chartId, op, data) {}

export async function multipleLineNth(chartId, op, data) {}

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