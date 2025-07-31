import { OperationType } from "../../../object/operationType.js";
import {
    stackedBarCompare,
    stackedBarDetermineRange,
    stackedBarFilter,
    stackedBarFindExtremum,
    stackedBarRetrieveValue,
    stackedBarSort
} from "./stackedBarFunctions.js";


export async function runStackedBarOps(chartId, opsSpec) {
    for (const operation of opsSpec.ops) {
        switch (operation.op) {
            case OperationType.RETRIEVE_VALUE:
                stackedBarRetrieveValue(chartId, operation);
                break;
            case OperationType.FILTER:
                stackedBarFilter(chartId, operation);
                break;
            case OperationType.FIND_EXTREMUM:
                stackedBarFindExtremum(chartId, operation);
                break;
            case OperationType.DETERMINE_RANGE:
                stackedBarDetermineRange(chartId, operation);
                break;
            case OperationType.COMPARE:
                stackedBarCompare(chartId, operation);
                break;
            case OperationType.SORT:
                stackedBarSort(chartId, operation);
                break;
            default:
                console.warn("Not supported operation", operation.op);
        }
    }
}

export async function renderStackedBarChart(chartId, spec) {
    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color.field;
    const xType = spec.encoding.x.type;
    const yType = spec.encoding.y.type;
    const orientation = (xType === 'quantitative' && yType !== 'quantitative')
        ? 'horizontal'
        : (yType === 'quantitative' && xType !== 'quantitative')
        ? 'vertical'
        : 'horizontal';

    const data = await d3.csv(spec.data.url, d => {
        if (xType === 'quantitative') d[xField] = +d[xField];
        if (yType === 'quantitative') d[yField] = +d[yField];
        return d;
    });

    const margin = { top: 20, right: 30, bottom: 30, left: 100 };
    const width = 600;
    const height = 400;

    // Build stack series
    const series = d3.rollup(
        data,
        v => {
            const total = d3.sum(v, d => orientation === 'horizontal' ? d[xField] : d[yField]);
            let acc = 0;
            return v.map(d => {
                const value = orientation === 'horizontal' ? d[xField] : d[yField];
                const start = acc;
                acc += value;
                return {
                    category: orientation === 'horizontal' ? d[yField] : d[xField],
                    subgroup: d[colorField],
                    start,
                    end: acc,
                    normStart: start / total,
                    normEnd: acc / total
                };
            });
        },
        d => orientation === 'horizontal' ? d[yField] : d[xField]
    );

    const stackData = Array.from(series.values()).flat();
    const categories = Array.from(new Set(data.map(d => orientation === 'horizontal' ? d[yField] : d[xField])));
    const subgroups = Array.from(new Set(data.map(d => d[colorField])));

    // Scales and axes
    let xScale, yScale, xAxis, yAxis;
    if (orientation === 'horizontal') {
        const xMax = d3.max(stackData, d => d.end);
        xScale = d3.scaleLinear().domain([0, xMax]).range([margin.left, width - margin.right]);
        yScale = d3.scaleBand().domain(categories).range([margin.top, height - margin.bottom]).padding(0.1);
        xAxis = d3.axisBottom(xScale);
        yAxis = d3.axisLeft(yScale);
    } else {
        const yMax = d3.max(stackData, d => d.end);
        xScale = d3.scaleBand().domain(categories).range([margin.left, width - margin.right]).padding(0.1);
        yScale = d3.scaleLinear().domain([0, yMax]).range([height - margin.bottom, margin.top]);
        xAxis = d3.axisBottom(xScale);
        yAxis = d3.axisLeft(yScale);
    }

    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(subgroups);

    // Create SVG
    const svg = host.append("svg")
        .attr("width", width)
        .attr("height", height);

    // Draw bars
    svg.selectAll("rect")
        .data(stackData)
        .enter()
        .append("rect")
        .attr("fill", d => color(d.subgroup))
        .attr(orientation === 'horizontal' ? "x" : "x", d =>
            orientation === 'horizontal' ? xScale(d.start) : xScale(d.category))
        .attr(orientation === 'horizontal' ? "width" : "width", d =>
            orientation === 'horizontal' ? xScale(d.end) - xScale(d.start) : xScale.bandwidth())
        .attr(orientation === 'horizontal' ? "y" : "y", d =>
            orientation === 'horizontal' ? yScale(d.category) : yScale(d.end))
        .attr(orientation === 'horizontal' ? "height" : "height", d =>
            orientation === 'horizontal' ? yScale.bandwidth() : yScale(d.start) - yScale(d.end));

    // Append axes
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(xAxis);

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(yAxis);

    // Axis labels
    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - margin.bottom + 25)
        .attr("text-anchor", "middle")
        .text(spec.encoding.x.field);

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height - margin.bottom) / 2)
        .attr("y", margin.left - 40)
        .attr("text-anchor", "middle")
        .text(spec.encoding.y.field);

    // Legend
    const legend = svg.append("g")
        .attr("transform", `translate(${width - margin.right + 20},${margin.top})`);
    legend.append("text")
        .attr("x", 0)
        .attr("y", -10)
        .attr("text-anchor", "start")
        .text(spec.encoding.color.field);
    subgroups.forEach((name, i) => {
        const row = legend.append("g")
            .attr("transform", `translate(0,${i*20})`);
        row.append("rect")
            .attr("width", 15).attr("height", 15)
            .attr("fill", color(name));
        row.append("text")
            .attr("x", 20).attr("y", 12).attr("text-anchor", "start")
            .text(name);
    });
}