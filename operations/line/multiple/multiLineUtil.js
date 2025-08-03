import { OperationType } from "../../../object/operationType.js";
import {
  multipleLineRetrieveValue,
  multipleLineFilter,
  multipleLineFindExtremum,
  multipleLineDetermineRange,
  multipleLineCompare,
  multipleLineSort,
} from "./multiLineFunctions.js";

export async function runMultipleLineOps(chartId, opsSpec) {
  for (const operation of opsSpec.ops) {
    switch (operation.op) {
      case OperationType.RETRIEVE_VALUE:
        multipleLineRetrieveValue(chartId, operation);
        break;
      case OperationType.FILTER:
        multipleLineFilter(chartId, operation);
        break;
      case OperationType.FIND_EXTREMUM:
        multipleLineFindExtremum(chartId, operation);
        break;
      case OperationType.DETERMINE_RANGE:
        multipleLineDetermineRange(chartId, operation);
        break;
      case OperationType.COMPARE:
        multipleLineCompare(chartId, operation);
        break;
      case OperationType.SORT:
        multipleLineSort(chartId, operation);
        break;
      default:
        console.warn("Unsupported operation for multipleLine:", operation.op);
    }
  }
}
export async function renderMultipleLineChart(chartId, spec) {
  // 1) 컨테이너 초기화
  const container = d3.select(`#${chartId}`);
  container.selectAll("*").remove();

  // 2) 치수 설정
  const width = 1200;
  const height = 800;
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  // 3) 인코딩 필드
  const xField = spec.encoding.x.field;
  const yField = spec.encoding.y.field;
  const colorField = spec.encoding.color?.field;

  // 4) 데이터 로드 및 파싱
  const data = await d3.csv(spec.data.url, (d) => {
    d[xField] =
      spec.encoding.x.type === "temporal" ? new Date(d[xField]) : d[xField];
    d[yField] = +d[yField];
    if (colorField) d[colorField] = d[colorField];
    return d;
  });

  // 5) 시리즈 생성 (색상별 그룹화)
  const series = colorField
    ? d3
        .groups(data, (d) => d[colorField])
        .map(([key, values]) => ({ key, values }))
    : [{ key: yField, values: data }];

  // 6) 스케일 정의
  const xValues = data.map((d) => d[xField]);
  const yMax = d3.max(data, (d) => d[yField]);

  const xScale =
    spec.encoding.x.type === "temporal"
      ? d3
          .scaleTime()
          .domain(d3.extent(xValues))
          .range([margin.left, width - margin.right])
      : d3
          .scalePoint()
          .domain([...new Set(xValues)])
          .range([margin.left, width - margin.right]);

  const yScale = d3
    .scaleLinear()
    .domain([0, yMax])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // 7) 컬러 스케일
  const colorScale = d3
    .scaleOrdinal(d3.schemeCategory10)
    .domain(series.map((s) => s.key));

  // 8) SVG 생성
  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // 9) 축 그리기
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale));

  // 10) 라인 제너레이터
  const lineGen = d3
    .line()
    .x((d) => xScale(d[xField]))
    .y((d) => yScale(d[yField]));

  // 11) 시리즈별 path 그리기 (★ class="series-line" 반드시 추가)
  series.forEach((s) => {
    svg
      .append("path")
      .datum(s.values)
      .attr("class", "series-line") // ← 이 줄이 없으면 retrieveValue가 동작하지 않습니다
      .attr("fill", "none")
      .attr("stroke", colorScale(s.key))
      .attr("stroke-width", 2)
      .attr("d", lineGen);
  });
  svg.node().__xScale = xScale;
  svg.node().__yScale = yScale;

  // 12) 범례
  if (series.length > 1) {
    const legend = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width - margin.right + 20}, ${margin.top})`
      );
    legend
      .append("text")
      .attr("x", 0)
      .attr("y", -10)
      .attr("font-weight", "bold")
      .text(colorField);
    series.forEach((s, i) => {
      const g = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
      g.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", colorScale(s.key));
      g.append("text")
        .attr("x", 16)
        .attr("y", 10)
        .attr("font-size", "10px")
        .text(s.key);
    });
  }
}
