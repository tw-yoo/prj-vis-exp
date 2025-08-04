import { OperationType } from "../../../object/operationType.js";
import {
  simpleBarCompare,
  simpleBarFindExtremum,
  simpleBarFilter,
  simpleBarRetrieveValue,
  simpleBarDetermineRange,
  simpleBarSort,
} from "./simpleBarFunctions.js";

export async function runSimpleBarOps(chartId, opsSpec) {
  for (const operation of opsSpec.ops) {
    switch (operation.op) {
      case OperationType.RETRIEVE_VALUE:
        simpleBarRetrieveValue(chartId, operation);
        break;
      case OperationType.FILTER:
        simpleBarFilter(chartId, operation);
        break;
      case OperationType.FIND_EXTREMUM:
        simpleBarFindExtremum(chartId, operation);
        break;
      case OperationType.DETERMINE_RANGE:
        simpleBarDetermineRange(chartId, operation);
        break;
      case OperationType.COMPARE:
        simpleBarCompare(chartId, operation);
        break;
      case OperationType.SORT:
        simpleBarSort(chartId, operation);
        break;
    }
  }
}

export async function renderSimpleBarChart(chartId, spec) {
  const yField = spec.encoding.y.field;
  const xField = spec.encoding.x.field;
  const xType  = spec.encoding.x.type;
  const yType  = spec.encoding.y.type;
  const isHorizontal = xType === 'quantitative' && yType !== 'quantitative';

  // ── 1) 데이터 로드 & 숫자형 변환 ─────────────────────
  let data;
  if (spec.data.url.endsWith('.json')) {
    data = await d3.json(spec.data.url);
    data.forEach(d => {
      if (xType === 'quantitative') d[xField] = +d[xField];
      if (yType === 'quantitative') d[yField] = +d[yField];
    });
  } else {
    data = await d3.csv(spec.data.url, d => {
      if (xType === 'quantitative') d[xField] = +d[xField];
      if (yType === 'quantitative') d[yField] = +d[yField];
      return d;
    });
  }

  // ── 2) transform(filter) 처리 ───────────────────────
  if (spec.transform) {
    spec.transform.forEach(t => {
      if (t.filter) {
        const expr = t.filter.replace(/datum\./g, 'd.');
        const filterFn = new Function('d', `return ${expr};`);
        data = data.filter(filterFn);
      }
    });
  }

  // ── 3) aggregation 처리 ─────────────────────────────
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

  // ── 4) 크기 & 마진 계산 ─────────────────────────────
  const margin = { top: 40, right: 20, bottom: 80, left: 60 };
  const width  = 600;
  const height = 300;
  const plotW  = width  - margin.left - margin.right;
  const plotH  = height - margin.top  - margin.bottom;

  // ── 5) SVG 생성 & 공통 속성 설정 ────────────────────
  const host = d3.select(`#${chartId}`);
  host.selectAll("*").remove();
  const svg = host.append("svg")
                  .attr("viewBox", [0, 0, width, height])
                  .style("overflow", "visible")
                  .attr("data-orientation", isHorizontal ? "horizontal" : "vertical")
                  .attr("data-m-left",  margin.left)
                  .attr("data-m-top",   margin.top)
                  .attr("data-plot-w",  plotW)
                  .attr("data-plot-h",  plotH)
                  .attr("data-x-field", xField)
                  .attr("data-y-field", yField)
                  .attr("data-original-data", JSON.stringify(data.map(d => ({
                    id: d[xField] || d[yField],
                    value: d[yField] || d[xField],
                  }))));

  const g = svg.append("g")
               .attr("transform", `translate(${margin.left},${margin.top})`);

  // ── 6) 차트 그리기 (가로 vs 세로) ────────────────────
  if (isHorizontal) {
    // — 가로 막대
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
     .attr("x",      0)
     .attr("y",      d => yScale(d[yField]))
     .attr("width",  d => xScale(d[xField]))
     .attr("height", yScale.bandwidth())
     .attr("fill",   "#69b3a2")
     .attr("data-id",     d => d[yField])
     .attr("data-value",  d => d[xField]);
  } else {
    // — 세로 막대
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
     .attr("x",      d => xScale(d[xField]))
     .attr("y",      d => yScale(d[yField]))
     .attr("width",  xScale.bandwidth())
     .attr("height", d => plotH - yScale(d[yField]))
     .attr("fill",   "#69b3a2")
     .attr("data-id",     d => d[xField])
     .attr("data-value",  d => d[yField]);
  }

  // ── 7) 축 레이블 ────────────────────────────────────
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