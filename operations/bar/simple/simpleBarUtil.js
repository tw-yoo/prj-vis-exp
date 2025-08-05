import { OperationType } from "../../../object/operationType.js";
import {
  simpleBarCompare,
  simpleBarFindExtremum,
  simpleBarFilter,
  simpleBarRetrieveValue,
  simpleBarDetermineRange,
  simpleBarSort,
} from "./simpleBarFunctions.js";

// simpleBarUtil.js (수정된 부분)
// 전역 데이터 저장소: 이 파일 내의 모든 함수가 접근 가능하도록 최상위에 선언
const chartDataStore = {};

export async function runSimpleBarOps(chartId, opsSpec) {
  const svg = d3.select(`#${chartId}`).select("svg");
  // data-original-data 속성 대신, 전역 저장소에서 데이터를 가져옵니다.
  // 원본 데이터가 변경되지 않도록 깊은 복사를 합니다.
  let currentData = [...chartDataStore[chartId]];

  if (!currentData || currentData.length === 0) {
      console.error("runSimpleBarOps: No data found in chartDataStore for", chartId);
      return;
  }

  for (const operation of opsSpec.ops) {
    switch (operation.op) {
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

  // 데이터 가공 및 타입 변환
  data.forEach(d => {
    if (xType === 'quantitative') d[xField] = +d[xField];
    if (yType === 'quantitative') d[yField] = +d[yField];
  });
  
  // 데이터 필터링 (Vega-Lite 스펙에 transform이 있는 경우)
  if (spec.transform) {
      spec.transform.forEach(t => {
        if (t.filter) {
          const expr = t.filter.replace(/datum\./g, 'd.');
          const filterFn = new Function('d', `return ${expr};`);
          data = data.filter(filterFn);
        }
      });
  }

  // 데이터 집계 (Vega-Lite 스펙에 aggregate가 있는 경우)
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

  // 전역 데이터 저장소에 원본 데이터 저장
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
    .attr("data-y-field", yField); // 이제 data-original-data 속성은 필요 없습니다.

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // (기존과 동일한 D3 렌더링 코드)
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
    const xScale = d3.scaleBand()
      .domain(data.map(d => d[xField]))
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

  // 축 라벨 추가
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