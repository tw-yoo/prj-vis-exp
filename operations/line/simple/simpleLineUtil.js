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
/**
 * 차트의 모든 시각적 요소를 기본 상태로 완벽하게 리셋하는 헬퍼 함수
 */
async function fullChartReset(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
    g.selectAll(".highlighted-line").remove(); // 필터 하이라이트 라인 제거
    clearAllAnnotations(svg); // 모든 텍스트 및 보조선 제거

    const resetPromises = [];
    // 기본 라인 스타일 복구
    resetPromises.push(g.select("path.series-line").transition().duration(400)
        .attr("stroke", "steelblue").attr("opacity", 1).end());
    // 기본 포인트 스타일(투명) 복구
    resetPromises.push(g.selectAll("circle.datapoint").transition().duration(400)
        .attr("opacity", 0).end());
        
    await Promise.all(resetPromises);
}

/**
 * SimpleLineChart에 대한 연속적인 오퍼레이션을 실행하는 메인 함수
 */
export async function runSimpleLineOps(chartId, opsSpec) {
    // 1. 전체 시퀀스 시작 전, 이전 실행 결과를 완벽하게 초기화
    await fullChartReset(chartId);

    const fullData = chartDataStore[chartId];
    if (!fullData) {
        console.error("No data for chart:", chartId);
        return;
    }
    let currentData = [...fullData];
    let previousOpType = null; // 이전 오퍼레이션 타입을 기억할 변수

    // 2. 오퍼레이션 루프 실행
    for (let i = 0; i < opsSpec.ops.length; i++) {
        // === 조건부 리셋 로직 ===
        if (previousOpType) { // 첫 번째 오퍼레이션이 아닐 경우에만 리셋 실행
            if (previousOpType === 'filter') {
                // 이전 오퍼레이션이 'filter'였으면, 텍스트와 보조선만 지움 (부분 리셋)
                const { svg } = getSvgAndSetup(chartId);
                clearAllAnnotations(svg);
                await delay(200);
            } else {
                // 그 외 모든 오퍼레이션이었으면, 차트를 완벽하게 리셋 (전체 리셋)
                await fullChartReset(chartId);
            }
        }
        
        const operation = opsSpec.ops[i];
        
        // 3. 현재 오퍼레이션 실행
        switch (operation.op.toLowerCase()) {
            case 'retrievevalue': currentData = await simpleLineRetrieveValue(chartId, operation, currentData, fullData); break;
            case 'filter': currentData = await simpleLineFilter(chartId, operation, currentData, fullData); break;
            case 'findextremum': currentData = await simpleLineFindExtremum(chartId, operation, currentData, fullData); break;
            case 'determinerange': currentData = await simpleLineDetermineRange(chartId, operation, currentData, fullData); break;
            case 'compare': currentData = await simpleLineCompare(chartId, operation, currentData, fullData); break;
            case 'sort': currentData = await simpleLineSort(chartId, operation, currentData, fullData); break;
            default: console.warn(`Unsupported operation: ${operation.op}`);
        }

        // 4. 다음 루프를 위해 현재 오퍼레이션 타입을 기록
        previousOpType = operation.op.toLowerCase();

        // 마지막 단계가 아니면 결과 확인을 위해 잠시 대기
        if (i < opsSpec.ops.length - 1) {
            await delay(2500);
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