// multipleLineUtil.js

import {
    // Import all simple line functions that will be used after the transformation
    simpleLineCompare,
    simpleLineDetermineRange,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineRetrieveValue,
    simpleLineSort,
    // Import helpers from simple line as they are compatible
    clearAllAnnotations as simpleClearAllAnnotations,
    delay
} from '../simple/simpleLineFunctions.js';

import {
    // The one unique function for multi-line charts
    multipleLineChangeToSimple
} from './multiLineFunctions.js';

// Global store for chart data and state
const chartDataStore = {};

/**
 * Resets the chart to its initial multi-line state before running new operations.
 */
async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;

    const g = svg.select(".plot-area");
    const { colorScale } = chartDataStore[chartId];

    // Remove all annotations and temporary elements
    simpleClearAllAnnotations(svg);
    g.selectAll(".datapoint").remove();

    const resetPromises = [];

    // Restore all series lines
    resetPromises.push(g.selectAll("path.series-line")
        .transition().duration(400)
        .attr("opacity", 1)
        .attr("stroke-width", 2)
        .attr("stroke", d => colorScale(d.key))
        .end()
    );

    // Restore the legend
    resetPromises.push(g.select(".legend")
        .transition().duration(400)
        .attr("opacity", 1)
        .end()
    );

    await Promise.all(resetPromises);
}


/**
 * Runs a sequence of operations on a multiple line chart.
 * It handles the transformation to a simple line chart.
 */
export async function runMultipleLineOps(chartId, opsSpec) {
    // 1. Reset the chart to its original state before starting
    await fullChartReset(chartId);
    
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) {
        console.error(`runMultipleLineOps: No data in store for chartId '${chartId}'. Render the chart first.`);
        return;
    }
    
    // Start with the full dataset
    const fullData = chartInfo.data;
    let currentData = [...fullData];
    let isTransformed = false; // State to track if we've switched to simple-line mode

    // 2. Loop through the operations
    for (let i = 0; i < opsSpec.ops.length; i++) {
        const operation = opsSpec.ops[i];
        const opType = operation.op.toLowerCase();

        if (isTransformed) {
            // After transformation, use simple line functions
            switch (opType) {
                case 'retrievevalue':
                    currentData = await simpleLineRetrieveValue(chartId, operation, currentData, fullData);
                    break;
                case 'filter':
                    currentData = await simpleLineFilter(chartId, operation, currentData, fullData);
                    break;
                case 'findextremum':
                    currentData = await simpleLineFindExtremum(chartId, operation, currentData, fullData);
                    break;
                case 'determinerange':
                    currentData = await simpleLineDetermineRange(chartId, operation, currentData, fullData);
                    break;
                case 'compare':
                    currentData = await simpleLineCompare(chartId, operation, currentData, fullData);
                    break;
                case 'sort':
                    // Note: Sort is less meaningful for time-series but implemented for completeness
                    currentData = await simpleLineSort(chartId, operation, currentData, fullData);
                    break;
                default:
                    console.warn(`Unsupported operation after transformation: ${operation.op}`);
            }
        } else {
            // Before transformation, only 'changetosimple' is allowed
            switch (opType) {
                case 'changetosimple':
                    // Pass the full chartInfo object which contains series, scales, etc.
                    currentData = await multipleLineChangeToSimple(chartId, operation, currentData, chartInfo);
                    isTransformed = true; // CRITICAL: Update state after transformation
                    break;
                default:
                    console.warn(`Invalid operation. You must start with 'changeToSimple' for a multiple-line chart. Received: '${opType}'`);
                    return; // Stop execution if the sequence is invalid
            }
        }

        // Add a delay between operations for visualization
        if (i < opsSpec.ops.length - 1) {
            await delay(2500); // Wait 2.5 seconds before the next step
             if (isTransformed) {
                // After a simple operation, we might want to reset highlights before the next one
                const svg = d3.select(`#${chartId} svg`);
                simpleClearAllAnnotations(svg);
                svg.selectAll("circle.datapoint").transition().duration(300).attr("r", 5).attr("opacity", 0);
                await delay(300);
            }
        }
    }
}


/**
 * Renders the initial multiple line chart from a Vega-Lite-like spec.
 */
export async function renderMultipleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 40, right: 120, bottom: 50, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color.field;
    const isTemporal = spec.encoding.x.type === 'temporal';

    const data = await d3.csv(spec.data.url, d => {
        if (isTemporal) d[xField] = new Date(d[xField]);
        d[yField] = +d[yField];
        return d;
    });

    const series = d3.groups(data, d => d[colorField]).map(([key, values]) => ({ key, values }));

    const xScale = (isTemporal ? d3.scaleTime() : d3.scalePoint())
        .domain(d3.extent(data, d => d[xField]))
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[yField])]).nice()
        .range([height, 0]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(series.map(s => s.key));

    // Store data and scales for operations
    chartDataStore[chartId] = {
        data,
        series,
        fullXScale: xScale,
        fullYScale: yScale,
        colorScale
    };

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-color-field", colorField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", height);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    g.append("g").attr("class", "y-axis").call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => xScale(d[xField]))
        .y(d => yScale(d[yField]));

    g.selectAll(".series-line")
        .data(series)
        .join("path")
        .attr("class", d => `series-line series-${d.key.replace(/\s+/g, '-')}`)
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.key))
        .attr("stroke-width", 2)
        .attr("d", d => lineGen(d.values));

    const legend = g.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width + 20}, 0)`);

    series.forEach((s, i) => {
        const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale(s.key));
        legendRow.append("text").attr("x", 20).attr("y", 12).text(s.key).style("font-size", "12px");
    });
}