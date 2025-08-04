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

  let data;
  if (spec.data.url.endsWith('.json')) {
    // Load JSON data when URL points to a .json file
    data = await d3.json(spec.data.url);
    // Coerce numeric fields for JSON-loaded data
    data.forEach(d => {
      if (xType === 'quantitative') d[xField] = +d[xField];
      if (yType === 'quantitative') d[yField] = +d[yField];
    });
  } else {
    // Fallback to CSV loader for other formats
    data = await d3.csv(spec.data.url, d => {
      if (xType === 'quantitative') d[xField] = +d[xField];
      if (yType === 'quantitative') d[yField] = +d[yField];
      return d;
    });
  }

  // Apply Vega-Lite transforms (e.g., filter)
  let processedData = data;
  if (spec.transform) {
    spec.transform.forEach(t => {
      if (t.filter) {
        const expr = t.filter.replace(/datum\./g, 'd.');
        const filterFn = new Function('d', `return ${expr};`);
        processedData = processedData.filter(filterFn);
      }
      // Future: handle other transform types (e.g., calculate)
    });
    data = processedData;
  }

  // Handle Vega-Lite aggregation (e.g., sum)
  const enc = spec.encoding;
  const agg = enc.x.aggregate || enc.y.aggregate;
  if (agg) {
    // Determine grouping and value fields based on which channel has aggregation
    const groupField = enc.x.aggregate ? enc.y.field : enc.x.field;
    const valueField = enc.x.aggregate ? enc.x.field : enc.y.field;
    // Perform grouping and aggregation using d3.rollup
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

  if (isHorizontal) {
    // Horizontal bar chart
    const margin = { top: 40, right: 20, bottom: 80, left: 60 };
    const width  = 600;
    const height = 300;
    const plotW  = width  - margin.left - margin.right;
    const plotH  = height - margin.top  - margin.bottom;

    const xScale = d3.scaleLinear()
                     .domain([0, d3.max(data, d => d[xField])]).nice()
                     .range([0, plotW]);
    const yScale = d3.scaleBand()
                     .domain(data.map(d => d[yField]))
                     .range([0, plotH])
                     .padding(0.2);

    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();
    const svg = host.append("svg")
                    .attr("viewBox", [0, 0, width, height])
                    .style("overflow", "visible");
    const g = svg.append("g")
                 .attr("transform", `translate(${margin.left},${margin.top})`);

    // Y axis (categories)
    g.append("g").call(d3.axisLeft(yScale));

    // X axis (values)
    g.append("g")
     .attr("transform", `translate(0,${plotH})`)
     .call(d3.axisBottom(xScale).ticks(5));

    // Bars
    g.selectAll("rect")
     .data(data)
     .join("rect")
     .attr("y", d => yScale(d[yField]))
     .attr("x", 0)
     .attr("height", yScale.bandwidth())
     .attr("width", d => xScale(d[xField]))
     .attr("fill", "#69b3a2")
     .attr("data-id",    d => d[yField])
     .attr("data-value", d => d[xField]);

    // Axis labels
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

    return;
  } else {
    const host   = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    const margin = { top: 40, right: 20, bottom: 80, left: 60 };
    const width  = 600;
    const height = 300;
    const plotW  = width  - margin.left - margin.right;
    const plotH  = height - margin.top  - margin.bottom;

    const xScale = d3.scaleBand()
                     .domain(data.map(d => d[xField]))
                     .range([0, plotW])
                     .padding(0.2);

    const yScale = d3.scaleLinear()
                     .domain([0, d3.max(data, d => d[yField])]).nice()
                     .range([plotH, 0]);

    const svg = host.append("svg")
                    .attr("viewBox", [0, 0, width, height])
                    .style("overflow", "visible")
                    .attr("data-m-left", margin.left)
                    .attr("data-m-top",  margin.top)
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
     .data(data)
     .join("rect")
     .attr("x", d => xScale(d[xField]))
     .attr("y", d => yScale(d[yField]))
     .attr("width",  xScale.bandwidth())
     .attr("height", d => plotH - yScale(d[yField]))
     .attr("fill",   "#69b3a2")
     .attr("data-id",    d => d[xField])
     .attr("data-value", d => d[yField]);

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
}

