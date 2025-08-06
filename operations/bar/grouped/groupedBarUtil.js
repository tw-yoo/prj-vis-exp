// groupedBarUtil.js (최종 완성본)

import {
    simpleBarCompare,
    simpleBarFindExtremum,
    simpleBarFilter,
    simpleBarRetrieveValue,
    simpleBarDetermineRange,
    simpleBarSort,
    getSvgAndSetup as simpleGetSvgAndSetup,
    clearAllAnnotations as simpleClearAllAnnotations,
    delay as simpleDelay
} from "../simple/simpleBarFunctions.js";

import {
    groupedBarFocus,
    groupedBarRetrieveValue,
    getSvgAndSetup,
    clearAllAnnotations,
    delay
} from "./groupedBarFunctions.js";

const chartDataStore = {};

// vlSpec 인자를 제거하여 독립적으로 만듭니다.
export async function runGroupedBarOps(chartId, opsSpec) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const chartInfo = chartDataStore[chartId];

    if (!chartInfo || !chartInfo.spec) {
        console.error("Chart info or spec not found in store. Please render the chart first.");
        return;
    }
    const spec = chartInfo.spec; // 저장소에서 spec을 가져옵니다.

    if (svg.select(".plot-area").empty()) {
        await renderGroupedBarChart(chartId, spec);
    }
    
    const { g, colorField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const originalData = chartInfo.data;
    const colorDomain = Array.from(new Set(originalData.map(d => d[colorField])));
    
    // BUG FIX: vlSpec -> spec으로 변수명 수정
    const colorScale = d3.scaleOrdinal(spec.encoding.color.scale.range).domain(colorDomain);

    const resetPromises = [];
    g.selectAll("rect").each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        if (d) {
            const t = rect.transition().duration(400)
                .attr("opacity", 1)
                .attr("stroke", "none")
                .attr("fill", colorScale(d.key))
                .end();
            resetPromises.push(t);
        }
    });
    await Promise.all(resetPromises);
    
    const fullData = chartInfo.data;
    let currentData = [...fullData];
    let isTransformed = false;

    for (let i = 0; i < opsSpec.ops.length; i++) {
        const operation = opsSpec.ops[i];
        const opType = operation.op.toLowerCase();

        if (isTransformed) {
            switch (opType) {
                case 'retrievevalue': currentData = await simpleBarRetrieveValue(chartId, operation, currentData, fullData); break;
                case 'filter': currentData = await simpleBarFilter(chartId, operation, currentData, fullData); break;
                case 'findextremum': currentData = await simpleBarFindExtremum(chartId, operation, currentData, fullData); break;
                case 'determinerange': currentData = await simpleBarDetermineRange(chartId, operation, currentData, fullData); break;
                case 'compare': currentData = await simpleBarCompare(chartId, operation, currentData, fullData); break;
                case 'sort': currentData = await simpleBarSort(chartId, operation, currentData, fullData); break;
                default: console.warn(`Unsupported operation after focus: ${operation.op}`);
            }
        } else {
            switch (opType) {
                case 'retrievevalue':
                    currentData = await groupedBarRetrieveValue(chartId, operation, currentData, fullData);
                    break;
                case 'focus':
                    currentData = await groupedBarFocus(chartId, operation, currentData, fullData);
                    isTransformed = true;
                    break;
                default:
                    console.warn(`Operation '${opType}' is not supported. Please start with 'focus'.`);
            }
        }

        if (i < opsSpec.ops.length - 1) {
            await delay(1500);
        }
    }
}

export async function renderGroupedBarChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = {top: 50, right: 120, bottom: 50, left: 80};
    const width = 900 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const {column, x, y, color} = spec.encoding;
    const facetField = column.field;
    const xField = x.field;
    const yField = y.field;
    const colorField = color.field;

    const rawData = await d3.csv(spec.data.url, d => {
        d[yField] = +d[yField];
        return d;
    });

    chartDataStore[chartId] = { data: rawData, spec: spec };
    const data = rawData;

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-facet-field", facetField)
        .attr("data-color-field", colorField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", height);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);
        
    const facets = Array.from(new Set(data.map(d => d[facetField])));
    const xDomain = Array.from(new Set(data.map(d => d[xField])));

    const x0 = d3.scaleBand().domain(facets).range([0, width]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(xDomain).range([0, x0.bandwidth()]).padding(0.05);
    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);
    const colorScale = d3.scaleOrdinal(spec.encoding.color.scale.range).domain(xDomain);

    g.append("g").attr("class", "x-axis-top-labels").selectAll("text")
        .data(facets)
        .join("text")
        .attr("x", d => x0(d) + x0.bandwidth() / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text(d => d);

    facets.forEach(facetValue => {
        const facetGroup = g.append("g")
            .attr("class", `facet-group-${facetValue}`)
            .attr("transform", `translate(${x0(facetValue)},0)`);

        const facetData = data.filter(d => d[facetField] === facetValue);

        facetGroup.selectAll("rect")
            .data(facetData)
            .join("rect")
                .attr("x", d => x1(d[xField]))
                .attr("y", d => yScale(d[yField]))
                .attr("width", x1.bandwidth())
                .attr("height", d => height - yScale(d[yField]))
                .attr("fill", d => colorScale(d[colorField]))
                .datum(d => ({
                    facet: d[facetField],
                    key: d[xField],
                    value: d[yField]
                }))
                .attr("data-id", d => `${d.facet}-${d.key}`)
                .attr("data-value", d => d.value);
    });

    g.append("g").attr("class", "x-axis-bottom-line")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x0).tickSize(0).tickFormat(""));

    g.append("g").attr("class", "y-axis")
      .call(d3.axisLeft(yScale));

    const legend = svg.append("g")
        .attr("transform", `translate(${width + margin.left + 20},${margin.top})`);

    xDomain.forEach((value, i) => {
        const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect")
            .attr("width", 15).attr("height", 15)
            .attr("fill", colorScale(value));
        legendRow.append("text")
            .attr("x", 20).attr("y", 12.5)
            .text(value);
    });
}