import { OperationType } from "../../../object/operationType.js";
import {
  simpleBarCompare,
  simpleBarFindExtremum,
  simpleBarFilter,
  simpleBarRetrieveValue,
  simpleBarDetermineRange,
  simpleBarSort,
  simpleBarSum
} from "./simpleBarFunctions.js";
import {stackChartToTempTable} from "../../../util/util.js";

const chartDataStore = {};
function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}
function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const orientation = svg.attr("data-orientation") || "vertical";
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const margins = {
        left: +svg.attr("data-m-left") || 0,
        top: +svg.attr("data-m-top") || 0,
    };
    const plot = {
        w: +svg.attr("data-plot-w") || 0,
        h: +svg.attr("data-plot-h") || 0,
    };
    const g = svg.select("g");
    return { svg, g, orientation, xField, yField, margins, plot };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runSimpleBarOps(chartId, vlSpec, opsSpec) {
    const { svg, g } = getSvgAndSetup(chartId);

    clearAllAnnotations(svg);
    const resetPromises = [];
    g.selectAll("rect").each(function() {
        const rect = d3.select(this);
        const t = rect.transition().duration(400)
            .attr("fill", "#69b3a2") 
            .attr("opacity", 1)    
            .attr("stroke", "none")  
            .end();
        resetPromises.push(t);
    });
    await Promise.all(resetPromises);

    if (!chartDataStore[chartId]) {
        console.error("runSimpleBarOps: No data in store. Please render the chart first.");
        return;
    }
    const fullData = [...chartDataStore[chartId]];
    let currentData = [...fullData];

    for (let i = 0; i < opsSpec.ops.length; i++) {
        const operation = opsSpec.ops[i];

        switch (operation.op.toLowerCase()) {
            case OperationType.RETRIEVE_VALUE:
                currentData = await simpleBarRetrieveValue(chartId, operation, currentData);
                break;
            case OperationType.FILTER:
                currentData = await simpleBarFilter(chartId, operation, currentData);
                break;
            case OperationType.FIND_EXTREMUM:
                currentData = await simpleBarFindExtremum(chartId, operation, currentData);
                break;
            case OperationType.DETERMINE_RANGE:
                currentData = await simpleBarDetermineRange(chartId, operation, currentData);
                break;
            case OperationType.COMPARE:
                currentData = await simpleBarCompare(chartId, operation, currentData);
                break;
            case OperationType.SORT:
                currentData = await simpleBarSort(chartId, operation, currentData);
                break;
            case OperationType.SUM:
                currentData = await simpleBarSum(chartId, operation, currentData);
                break;
            case OperationType.STACK:
                await stackChartToTempTable(chartId, vlSpec);
                break
            default:
                console.warn(`Unsupported operation: ${operation.op}`);
        }

        if (i < opsSpec.ops.length - 1) {
            await delay(1500);
        }
    }
}

export async function renderSimpleBarChart(chartId, spec) {
    const yField = spec.encoding.y.field;
    const xField = spec.encoding.x.field;
    const xType = spec.encoding.x.type;
    const yType = spec.encoding.y.type;
    const isHorizontal = xType === 'quantitative' && yType !== 'quantitative';

    let data;
    if (spec.data.url.endsWith('.json')) {
        data = await d3.json(spec.data.url);
    } else {
        data = await d3.csv(spec.data.url);
    }

    data.forEach(d => {
        if (xType === 'quantitative') d[xField] = +d[xField];
        if (yType === 'quantitative') d[yField] = +d[yField];
    });
    
    if (spec.transform) {
        spec.transform.forEach(t => {
            if (t.filter) {
                const expr = t.filter.replace(/datum\./g, 'd.');
                const filterFn = new Function('d', `return ${expr};`);
                data = data.filter(filterFn);
            }
        });
    }

    const enc = spec.encoding;
    const agg = enc.x.aggregate || enc.y.aggregate;
    if (agg) {
        const groupField = enc.x.aggregate ? enc.y.field : enc.x.field;
        const valueField = enc.x.aggregate ? enc.x.field : enc.y.field;
        data = Array.from(
            d3.rollup(
                data,
                v => d3[agg](v, d => +d[valueField]),
                d => d[groupField]
            )
        ).map(([key, value]) => ({
            [groupField]: key,
            [valueField]: value
        }));
    }

    chartDataStore[chartId] = data;

    const margin = { top: 40, right: 20, bottom: 80, left: 60 };
    const width = 600;
    const height = 300;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();
    
    const svg = host.append("svg")
        .attr("viewBox", [0, 0, width, height])
        .style("overflow", "visible")
        .attr("data-orientation", isHorizontal ? "horizontal" : "vertical")
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", plotW)
        .attr("data-plot-h", plotH)
        .attr("data-x-field", xField)
        .attr("data-y-field", yField);
    
    svg.attr("data-x-sort-order", spec.encoding.x.sort ? spec.encoding.x.sort.join(',') : null);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    if (isHorizontal) {
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[xField])]).nice()
            .range([0, plotW]);
        const yScale = d3.scaleBand()
            .domain(data.map(d => d[yField]))
            .range([0, plotH])
            .padding(0.2);

        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yScale));
        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${plotH})`)
            .call(d3.axisBottom(xScale).ticks(5));

        g.selectAll("rect")
            .data(data)
            .join("rect")
            .attr("x", 0)
            .attr("y", d => yScale(d[yField]))
            .attr("width", d => xScale(d[xField]))
            .attr("height", yScale.bandwidth())
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d[yField])
            .attr("data-value", d => d[xField]);
    } else {
        const xDomain = spec.encoding.x.sort || data.map(d => d[xField]);
        const xScale = d3.scaleBand()
            .domain(xDomain)
            .range([0, plotW])
            .padding(0.2);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[yField])]).nice()
            .range([plotH, 0]);

        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${plotH})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");

        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yScale).ticks(5));

        g.selectAll("rect")
            .data(data)
            .join("rect")
            .attr("x", d => xScale(d[xField]))
            .attr("y", d => yScale(d[yField]))
            .attr("width", xScale.bandwidth())
            .attr("height", d => plotH - yScale(d[yField]))
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d[xField])
            .attr("data-value", d => d[yField]);
    }

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + plotW / 2)
        .attr("y", height - margin.bottom + 40)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text(xField);

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + plotH / 2))
        .attr("y", margin.left - 45)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text(yField);
}