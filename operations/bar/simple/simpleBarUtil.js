import {OperationType} from "../../../object/operationType.js";
import {simpleBarFilter, simpleBarRetrieveValue} from "./simpleBarFunctions.js";

export async function runSimpleBarOps(chartId, opsSpec) {
    for (const operation of opsSpec.ops) {
        switch (operation.op) {
            case OperationType.RETRIEVE_VALUE:
                simpleBarRetrieveValue(chartId, operation)
                break
            case OperationType.FILTER:
                simpleBarFilter(chartId, operation)
                break
            case OperationType.FIND_EXTREMUM:
                break
            case OperationType.DETERMINE_RANGE:
                break
            case OperationType.COMPARE:
                break
            case OperationType.SORT:
                break
        }
    }
}

export function renderSimpleBarChart(chartId, spec) {

    let svg, xScale, yScale;

    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    const data = spec.data.values;
    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const margin = { top: 40, right: 20, bottom: 80, left: 60 },
        width  = 600, height = 300,
        plotW  = width - margin.left - margin.right,
        plotH  = height - margin.top - margin.bottom;

    xScale = d3.scaleBand()
        .domain(data.map(d => d[xField]))
        .range([0, plotW])
        .padding(0.2);

    yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[yField])]).nice()
        .range([plotH, 0]);

    svg = host.append("svg")
        .attr("viewBox", [0, 0, width, height])
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", plotW)
        .attr("data-plot-h", plotH)
        .attr("data-y-domain-max", yScale.domain()[1]);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
        .attr("transform", `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    g.append("g").call(d3.axisLeft(yScale).ticks(5));

    g.selectAll("rect")
        .data(data).join("rect")
        .attr("x", d => xScale(d[xField]))
        .attr("y", d => yScale(d[yField]))
        .attr("width",  xScale.bandwidth())
        .attr("height", d => plotH - yScale(d[yField]))
        .attr("fill",   "#69b3a2")
        .attr("data-id", d => d[xField])
        .attr("data-value", d => d[yField])
        .attr("data-y-domain-max", yScale.domain()[1]);   // y 값 보존
}

export function renderStackedBarChart(chartId, spec) {}