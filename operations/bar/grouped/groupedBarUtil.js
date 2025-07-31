import { OperationType } from "../../../object/operationType.js";
import {
  groupedBarCompare,
  groupedBarDetermineRange,
  groupedBarFilter,
  groupedBarFindExtremum,
  groupedBarRetrieveValue,
   groupedBarSort

} from "./groupedBarFunctions.js";

export async function runGroupedBarOps(chartId, opsSpec) {
  for (const operation of opsSpec.ops) {
    switch (operation.op) {
      case OperationType.RETRIEVE_VALUE:
        groupedBarRetrieveValue(chartId, operation);
        break;
      case OperationType.FILTER:
        groupedBarFilter(chartId, operation);
        break;
      case OperationType.FIND_EXTREMUM:
        groupedBarFindExtremum(chartId, operation);
        break;
      case OperationType.DETERMINE_RANGE:
        groupedBarDetermineRange(chartId, operation);
        break;
      case OperationType.COMPARE:
        groupedBarCompare(chartId, operation);
        break;
      case OperationType.SORT:
        groupedBarSort(chartId, operation);
        break;
      default:
        console.warn("Not supported operation", operation.op);
    }
  }
}

export async function renderGroupedBarChart(chartId, spec) {
  const container = await d3.select(`#${chartId}`);
  await container.selectAll("*").remove();

  const margin = { top: 50, right: 120, bottom: 50, left: 60 };
  const fullWidth = container.node().clientWidth || 900;
  const fullHeight = container.node().clientHeight || 400;
  const width  = fullWidth  - margin.left - margin.right;
  const height = fullHeight - margin.top  - margin.bottom;

  const { column, row, x, y, color } = spec.encoding;
  const isVertical = y.type === 'quantitative';
  const facetEncoding = column ?? row;
  const facetField = facetEncoding.field;
  const xField     = x.field;
  const yField     = y.field;
  const colorField = color?.field;

  const data = await d3.csv(spec.data.url, d => {
    if (x.type === 'quantitative') d[xField] = +d[xField];
    if (y.type === 'quantitative') d[yField] = +d[yField];
    return d;
  });

  if (!isVertical) {
    const facets = d3.groups(data, d => d[facetEncoding.field]);
    const y0 = d3.scaleBand()
        .domain(facets.map(([f]) => f))
        .range([margin.top, margin.top + height])
        .paddingInner(0.2);
    const yDomain = Array.from(new Set(data.map(d => d[yField])));
    const y1 = d3.scaleBand()
        .domain(yDomain)
        .range([0, y0.bandwidth()])
        .padding(0.05);
    const xMax = d3.max(data, d => d[xField]);
    const xScale = d3.scaleLinear()
        .domain([0, xMax])
        .nice()
        .range([margin.left, margin.left + width]);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(Array.from(new Set(data.map(d => d[colorField] || d[yField]))));
    const svg = container.append("svg")
        .attr("width", fullWidth)
        .attr("height", fullHeight);
    facets.forEach(([facetValue, vals]) => {
      const g = svg.append("g")
          .attr("transform", `translate(0,${y0(facetValue)})`);
      g.selectAll("rect")
          .data(vals)
          .join("rect")
          .attr("y", d => y1(d[yField]))
          .attr("x", margin.left)
          .attr("height", y1.bandwidth())
          .attr("width", d => xScale(d[xField]) - margin.left)
          .attr("fill", d => colorScale(d[colorField]));
      g.append("text")
          .attr("x", margin.left / 2)
          .attr("y", y0.bandwidth() / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .style("font-weight", "bold")
          .text(facetValue);
    });
    svg.append("g")
        .attr("transform", `translate(0,${margin.top + height})`)
        .call(d3.axisBottom(xScale));
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y0));
    return;
  }

  const facets = d3.groups(data, d => d[facetField]);

  const x0 = d3.scaleBand()
      .domain(facets.map(([facet]) => facet))
      .range([margin.left, margin.left + width])
      .paddingInner(0.2);

  const xDomain = Array.from(new Set(data.map(d => d[xField])));
  const x1 = d3.scaleBand()
      .domain(xDomain)
      .range([0, x0.bandwidth()])
      .padding(0.05);

  const yMax = d3.max(data, d => d[yField]);
  const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([margin.top + height, margin.top]);

  const colorDomain = Array.from(new Set(data.map(d => d[colorField] || d[xField])));
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(colorDomain);

  const svg = container.append("svg")
      .attr("width", fullWidth)
      .attr("height", fullHeight);

  facets.forEach(([facetValue, vals]) => {
    const g = svg.append("g")
        .attr("transform", `translate(${x0(facetValue)},0)`);

    g.selectAll("rect")
        .data(vals)
        .join("rect")
        .attr("x", d => x1(d[xField]))
        .attr("y", d => yScale(d[yField]))
        .attr("width", x1.bandwidth())
        .attr("height", d => margin.top + height - yScale(d[yField]))
        .attr("fill", d => colorScale(d[colorField]));

    g.append("text")
        .attr("x", x0.bandwidth() / 2)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-weight", "bold")
        .text(facetValue);
  });

  svg.append("g")
      .attr("transform", `translate(0,${margin.top + height})`)
      .call(d3.axisBottom(x0));

  svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(5));

  if (colorField) {
    const legend = svg.append("g")
        .attr("transform", `translate(${margin.left + width + 20},${margin.top})`);

    legend.append("text")
        .attr("y", -10)
        .attr("font-weight", "bold")
        .text(colorField);

    colorDomain.forEach((c, i) => {
      const row = legend.append("g")
          .attr("transform", `translate(0,${i * 20})`);
      row.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("fill", colorScale(c));
      row.append("text")
          .attr("x", 16)
          .attr("y", 10)
          .attr("font-size", "10px")
          .text(c);
    });
  }

  svg.append("text")
      .attr("x", margin.left + width / 2)
      .attr("y", fullHeight - margin.bottom / 4)
      .attr("text-anchor", "middle")
      .text(xField);

  svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + height / 2))
      .attr("y", margin.left / 4)
      .attr("text-anchor", "middle")
      .text(yField);
}