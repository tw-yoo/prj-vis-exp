/* ------------------------------------------------------------
 * operations/line/simple/simpleLineUtil.js
 *   - ① 단일 라인 차트 렌더링(renderSimpleLineChart)
 *   - ② 라인 차트용 6개 오퍼레이션 실행(runSimpleLineOps)
 * ------------------------------------------------------------ */
import { OperationType } from "../../../object/operationType.js";
import {
  simpleLineRetrieveValue,
  simpleLineFilter,
  simpleLineFindExtremum,
  simpleLineDetermineRange,
  simpleLineCompare,
  simpleLineSort,
} from "./simpleLineFunctions.js";

/* ---------- 1) 오퍼레이션 러너 --------------------------------- */
export async function runSimpleLineOps(chartId, opsSpec) {
  for (const op of opsSpec.ops) {
    switch (op.op) {
      case OperationType.RETRIEVE_VALUE:
        simpleLineRetrieveValue(chartId, op);
        break;
      case OperationType.FILTER:
        simpleLineFilter(chartId, op);
        break;
      case OperationType.FIND_EXTREMUM:
        simpleLineFindExtremum(chartId, op);
        break;
      case OperationType.DETERMINE_RANGE:
        simpleLineDetermineRange(chartId, op);
        break;
      case OperationType.COMPARE:
        simpleLineCompare(chartId, op);
        break;
      case OperationType.SORT:
        simpleLineSort(chartId, op);
        break;
      default:
        console.warn("알 수 없는 op →", op.op);
    }
  }
}

/* ---------- 2) 라인 차트 렌더러 -------------------------------- */
export function renderSimpleLineChart(chartId, spec) {
  // ── ① 마운트 영역 정리
  const host = d3.select(`#${chartId}`);
  host.selectAll("*").remove();

  // ── ② 데이터‧필드 추출
  const data   = spec.data.values;
  const xField = spec.encoding.x.field;
  const yField = spec.encoding.y.field;

  // ── ③ 사이즈 & 마진
  const margin = { top: 40, right: 20, bottom: 80, left: 60 };
  const width  = 600;
  const height = 300;
  const plotW  = width  - margin.left - margin.right;
  const plotH  = height - margin.top  - margin.bottom;

  // ── ④ 스케일
  const xScale = d3.scalePoint()
                   .domain(data.map(d => d[xField]))
                   .range([0, plotW])
                   .padding(0.5);              // 간격 확보

  const yScale = d3.scaleLinear()
                   .domain([0, d3.max(data, d => +d[yField])]).nice()
                   .range([plotH, 0]);

  // ── ⑤ SVG 생성 및 meta 속성
  const svg = host.append("svg")
                  .attr("viewBox", [0, 0, width, height])
                  .style("overflow", "visible")
                  .attr("data-m-left",  margin.left)
                  .attr("data-m-top",   margin.top)
                  .attr("data-plot-w",  plotW)
                  .attr("data-plot-h",  plotH)
                  .attr("data-y-domain-max", yScale.domain()[1]);

  const g = svg.append("g")
               .attr("transform", `translate(${margin.left},${margin.top})`);

  // ── ⑥ 축
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

  // ── ⑦ 라인 path
  const lineGen = d3.line()
                    .x(d => xScale(d[xField]))
                    .y(d => yScale(+d[yField]));

  g.append("path")
   .datum(data)
   .attr("class", "main-line")
   .attr("fill", "none")
   .attr("stroke", "#69b3a2")
   .attr("stroke-width", 2)
   .attr("d", lineGen);

  // ── ⑧ 데이터 포인트(circle) 추가 → 오퍼레이션 대상
  g.selectAll("circle.point")
   .data(data)
   .join("circle")
   .attr("class", "point")
   .attr("cx", d => xScale(d[xField]))
   .attr("cy", d => yScale(+d[yField]))
   .attr("r", 4)
   .attr("fill", "#69b3a2")
   .attr("data-id",    d => d[xField])   // key
   .attr("data-value", d => d[yField]);  // value

  // ── ⑨ 축 라벨
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
     .attr("x", - (margin.top + plotH / 2))
     .attr("y", margin.left - 45)
     .attr("text-anchor", "middle")
     .attr("font-size", 14)
     .text(yField);
}
