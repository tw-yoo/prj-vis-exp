// simpleLineUtil.js (최종 수정본)

import {
    simpleLineCompare,
    simpleLineDetermineRange,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineRetrieveValue,
    simpleLineSort,
    getSvgAndSetup,
    clearAllAnnotations,
    delay,
    prepareForNextOperation
} from "./simpleLineFunctions.js";

const chartDataStore = {}; // 이 파일에 chartDataStore가 있다고 가정


// simpleLineUtil.js

export async function runSimpleLineOps(chartId, opsSpec) {
    const fullData = chartDataStore[chartId];
    if (!fullData) {
        console.error("No data for chart:", chartId);
        return;
    }
    let currentData = [...fullData];

    // 오퍼레이션 루프
    for (let i = 0; i < opsSpec.ops.length; i++) {
        // =================================================================
        // === 각 오퍼레이션 시작 직전에 차트를 깨끗하게 리셋합니다. ===
        // =================================================================
        const { svg, g } = getSvgAndSetup(chartId);
        clearAllAnnotations(svg);

        const resetPromises = [];
        
        // 라인을 기본 상태로 복구
        resetPromises.push(g.select("path.series-line").transition().duration(400)
            .attr("stroke", "steelblue").attr("opacity", 1).end());

        // 모든 점들을 기본 상태(투명)로 복구
        resetPromises.push(g.selectAll("circle.datapoint").transition().duration(400)
            .attr("r", 5).attr("opacity", 0).attr("fill", "steelblue").attr("stroke", "none").end());
            
        await Promise.all(resetPromises);
        // === 리셋 끝 ===

        const operation = opsSpec.ops[i];
        
        // 현재 데이터셋을 기반으로 오퍼레이션 실행
        switch (operation.op.toLowerCase()) {
            case 'retrievevalue': currentData = await simpleLineRetrieveValue(chartId, operation, currentData, fullData); break;
            case 'filter': currentData = await simpleLineFilter(chartId, operation, currentData, fullData); break;
            case 'findextremum': currentData = await simpleLineFindExtremum(chartId, operation, currentData, fullData); break;
            case 'determinerange': currentData = await simpleLineDetermineRange(chartId, operation, currentData, fullData); break;
            case 'compare': currentData = await simpleLineCompare(chartId, operation, currentData, fullData); break;
            case 'sort': currentData = await simpleLineSort(chartId, operation, currentData, fullData); break;
            default: console.warn(`Unsupported operation: ${operation.op}`);
        }

        // 마지막 오퍼레이션이 아니면, 사용자가 결과를 볼 수 있도록 대기
        if (i < opsSpec.ops.length - 1) {
            await delay(2500); // 결과를 충분히 볼 수 있도록 시간 조정
        }
    }
}  
export async function renderSimpleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 40, right: 60, bottom: 50, left: 80 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;

    const data = await d3.csv(spec.data.url, d => {
        d[xField] = new Date(d[xField]);
        d[yField] = +d[yField];
        return d;
    });

    chartDataStore[chartId] = data;

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", height);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);
        
    const xScale = d3.scaleTime().domain(d3.extent(data, d => d[xField])).range([0, width]);
    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

    g.append("g").attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    g.append("g").attr("class", "y-axis").call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => xScale(d[xField]))
        .y(d => yScale(d[yField]));

    g.append("path")
        .datum(data)
        .attr("class", "series-line")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", lineGen);

    // 상호작용을 위한 투명한 점들을 미리 생성
    g.selectAll(".datapoint")
        .data(data)
        .join("circle")
        .attr("class", "datapoint")
        .attr("cx", d => xScale(d[xField]))
        .attr("cy", d => yScale(d[yField]))
        .attr("r", 5)
        .attr("fill", "steelblue")
        .attr("opacity", 0)
        .attr("data-id", d => d[xField].getFullYear())
        .attr("data-value", d => d[yField]);
        
    // 축 레이블 추가
    svg.append("text").attr("class", "x-axis-label")
        .attr("x", margin.left + width / 2).attr("y", height + margin.top + margin.bottom - 10)
        .attr("text-anchor", "middle").text(xField);

    svg.append("text").attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height / 2)).attr("y", margin.left - 60)
        .attr("text-anchor", "middle").text(yField);
}