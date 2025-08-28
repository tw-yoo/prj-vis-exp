
import {
    getSvgAndSetup,
    clearAllAnnotations,
    delay,
} from '../simple/simpleLineFunctions.js';
import {getFilteredData} from "../../operationUtil.js";


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

export async function multipleLineFilter(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const dataArray = Array.isArray(data) ? data : [];
    if (dataArray.length === 0) return [];

    // 0) 필터 결과 (op.group 고려됨)
    const filteredData = getFilteredData(op, dataArray);


    return filteredData;
}

export async function multipleLineFindExtremum(chartId, op, data) {}

export async function multipleLineDetermineRange(chartId, op, data) {}

export async function multipleLineCompare(chartId, op, data) {}

export async function multipleLineSum(chartId, op, data) {}

export async function multipleLineAverage(chartId, op, data) {}

export async function multipleLineDiff(chartId, op, data) {}

export async function multipleLineNth(chartId, op, data) {}

export async function multipleLineCount(chartId, op, data) {}

