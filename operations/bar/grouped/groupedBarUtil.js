import {
  groupedBarFilter,
  groupedBarRetrieveValue,
  groupedBarFindExtremum,
  groupedBarDetermineRange,
  groupedBarCompare,
  groupedBarSort,
  groupedBarFocus,

  getSvgAndSetup,
  clearAllAnnotations,
  delay
} from "./groupedBarFunctions.js";

const chartDataStore = {};

export async function runGroupedBarOps(chartId, opsSpec) {
  const svg = d3.select(`#${chartId}`).select("svg");
  const chartInfo = chartDataStore[chartId];

  if (!chartInfo || !chartInfo.spec) {
    console.error("Chart info/spec not found. Please render the chart first via renderGroupedBarChart(...).");
    return;
  }

  if (svg.select(".plot-area").empty()) {
    await renderGroupedBarChart(chartId, chartInfo.spec);
  }

  const fullData = chartInfo.data;
  let currentData = [...fullData];

  for (let i = 0; i < (opsSpec?.ops?.length || 0); i++) {
    const op = opsSpec.ops[i];
    const opType = String(op.op || "").toLowerCase();

    clearAllAnnotations(d3.select(`#${chartId}`).select("svg"));

    switch (opType) {
      case "filter":
        currentData = await groupedBarFilter(chartId, op, currentData, fullData);
        break;

      case "retrievevalue":
        currentData = await groupedBarRetrieveValue(chartId, op, currentData, fullData);
        break;

      case "findextremum":
        currentData = await groupedBarFindExtremum(chartId, op, currentData, fullData);
        break;

      case "determinerange":
        currentData = await groupedBarDetermineRange(chartId, op, currentData, fullData);
        break;

      case "compare":
        currentData = await groupedBarCompare(chartId, op, currentData, fullData);
        break;

      case "sort":
        currentData = await groupedBarSort(chartId, op, currentData, fullData);
        break;

      case "focus":
        currentData = await groupedBarFocus(chartId, op, currentData, fullData);
        break;

      default:
        console.warn(`Unsupported operation: '${op.op}'.`);
    }

    if (i < opsSpec.ops.length - 1) {
      await delay(1500);
    }
  }
}
export async function renderGroupedBarChart(chartId, spec) {
  const container = d3.select(`#${chartId}`);
  container.selectAll("*").remove();

  const margin = { top: 50, right: 120, bottom: 60, left: 80 }; // bottom 여유 ↑
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const { column, x, y, color } = spec.encoding;
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

  const defaultPalette = ["#0072B2", "#E69F00"];
  const palette = (spec.encoding?.color?.scale?.range) ?? defaultPalette;
  const colorScale = d3.scaleOrdinal(palette).domain(xDomain);

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

  g.append("g")
    .attr("class", "x-axis-bottom-line")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0).tickPadding(6));

  g.append("g").attr("class", "y-axis")
    .call(d3.axisLeft(yScale));

  const legend = svg.append("g")
    .attr("class", "legend")
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
