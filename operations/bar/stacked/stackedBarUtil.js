import {
  simpleBarCompare,
  simpleBarFindExtremum,
  simpleBarFilter,
  simpleBarRetrieveValue,
  simpleBarDetermineRange,
  simpleBarSort,
  simpleBarSum,
  getSvgAndSetup as simpleGetSvgAndSetup,
  clearAllAnnotations as simpleClearAllAnnotations,
  delay as simpleDelay,
} from "../simple/simpleBarFunctions.js";

import {
  stackedBarChangeToSimple,
  clearAllAnnotations,
  getSvgAndSetup,
  stackedBarRetrieve,
    stackedBarFilter,
} from "./stackedBarFunctions.js";

const chartDataStore = {};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


export async function runStackedBarOps(chartId, opsSpec, vlSpec) {
  const svg = d3.select(`#${chartId}`).select("svg");

  if (svg.select(".plot-area").empty()) {
    if (!vlSpec) {
      console.error("Chart not found and vlSpec not provided.");
      return;
    }
    await renderStackedBarChart(chartId, vlSpec);
  }

  const { colorField } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);
  const chartRects = svg.select(".plot-area").selectAll("rect");
  const originalData = chartDataStore[chartId].data;
  const subgroups = Array.from(new Set(originalData.map((d) => d[colorField])));
  const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(subgroups);

  const resetPromises = [];
  chartRects.each(function () {
    const rect = d3.select(this);
    const d = rect.datum();
    if (d && d.subgroup) {
      const t = rect
        .transition()
        .duration(400)
        .attr("opacity", 1)
        .attr("stroke", "none")
        .attr("fill", colorScale(d.subgroup))
        .end();
      resetPromises.push(t);
    }
  });
  await Promise.all(resetPromises);

  const fullData = chartDataStore[chartId].data;
  let currentData = [...fullData];
  let isTransformed = false;

  for (let i = 0; i < opsSpec.ops.length; i++) {
    const operation = opsSpec.ops[i];
    const opType = operation.op.toLowerCase();

    if (isTransformed) {
      switch (opType) {
        case "retrievevalue":
          currentData = await simpleBarRetrieveValue(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        case "filter":
          currentData = await simpleBarFilter(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        case "findextremum":
          currentData = await simpleBarFindExtremum(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        case "determinerange":
          currentData = await simpleBarDetermineRange(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        case "compare":
          currentData = await simpleBarCompare(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        case "sort":
          currentData = await simpleBarSort(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        case "sum":
          currentData = await simpleBarSum(
            chartId,
            operation,
            currentData,
            fullData
          );
          break;
        default:
          console.warn(
            `Unsupported operation after transformation: ${operation.op}`
          );
      }
    } else {

      switch (opType) {
        case "retrieve":
          await stackedBarRetrieve(chartId, operation, fullData);
          break;
        case "changetosimple":
          currentData = await stackedBarChangeToSimple(
            chartId,
            operation,
            currentData,
            fullData
          );
          isTransformed = true; 
          break;

          case 'filter': 
                    currentData = await stackedBarFilter(chartId, operation, currentData, fullData);
                    break;
        default:
          console.warn(
            `Operation '${opType}' is not supported. Please start with 'changeToSimple'.`
          );
      }
    }

    if (i < opsSpec.ops.length - 1) {
      await delay(1500);
    }
  }
}
export async function renderStackedBarChart(chartId, spec) {
  const host = d3.select(`#${chartId}`);
  host.selectAll("*").remove();

  const xField = spec.encoding.x.field;
  const yField = spec.encoding.y.field;
  const colorField = spec.encoding.color.field;
  const yType = spec.encoding.y.type;
  const orientation = yType === "quantitative" ? "vertical" : "horizontal";

  const rawData = await d3.csv(spec.data.url);
  const data = rawData.map((d) => {
    d[yField] = +d[yField];
    return d;
  });

  chartDataStore[chartId] = { data: data, spec: spec };

  const margin = { top: 40, right: 100, bottom: 50, left: 60 };
  const width = 700;
  const height = 400;
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const svg = host
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .style("overflow", "visible")
    .attr("data-orientation", orientation)
    .attr("data-x-field", xField)
    .attr("data-y-field", yField)
    .attr("data-color-field", colorField)
    .attr("data-m-left", margin.left)
    .attr("data-m-top", margin.top)
    .attr("data-plot-w", plotW)
    .attr("data-plot-h", plotH);

  const subgroups = Array.from(new Set(data.map((d) => d[colorField])));
  const groups = Array.from(new Set(data.map((d) => d[xField])));

  const dataForStack = Array.from(
    d3.group(data, (d) => d[xField]),
    ([group, values]) => {
      const obj = { [xField]: group };
      subgroups.forEach((subgroup) => {
        const findVal = values.find((v) => v[colorField] === subgroup);
        obj[subgroup] = findVal ? findVal[yField] : 0;
      });
      return obj;
    }
  );

  const stackedData = d3.stack().keys(subgroups)(dataForStack);

  const g = svg
    .append("g")
    .attr("class", "plot-area")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand().domain(groups).range([0, plotW]).padding(0.1);
  const yMax = d3.max(stackedData, (layer) => d3.max(layer, (d) => d[1]));
  const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plotH, 0]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(subgroups);

  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${plotH})`)
    .call(d3.axisBottom(xScale));
  g.append("g").attr("class", "y-axis").call(d3.axisLeft(yScale));

  g.append("g")
    .selectAll("g")
    .data(stackedData)
    .join("g")
    .attr("fill", (d) => color(d.key))
    .attr("class", (d) => `series-${d.key}`)
    .selectAll("rect")
    .data((d) => d.map((segment) => ({ ...segment, seriesKey: d.key })))
    .join("rect")
    .attr("x", (d) => xScale(d.data[xField]))
    .attr("y", (d) => yScale(d[1]))
    .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
    .attr("width", xScale.bandwidth())
    .datum(function (d) {
      return {
        key: d.data[xField],
        subgroup: d.seriesKey,
        value: d.data[d.seriesKey] || 0,
        y0: d[0],
        y1: d[1],
      };
    })
    .attr("data-id", function () {
      return d3.select(this).datum().key;
    })
    .attr("data-value", function () {
      return d3.select(this).datum().value;
    });

  svg
    .append("text")
    .attr("x", margin.left + plotW / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .text(xField);

  svg
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + plotH / 2))
    .attr("y", 15)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .text(yField);

  const legend = svg
    .append("g")
    .attr(
      "transform",
      `translate(${width - margin.right + 10}, ${margin.top})`
    );

  subgroups.forEach((subgroup, i) => {
    const legendRow = legend
      .append("g")
      .attr("transform", `translate(0, ${i * 20})`);
    legendRow
      .append("rect")
      .attr("width", 15)
      .attr("height", 15)
      .attr("fill", color(subgroup));
    legendRow
      .append("text")
      .attr("x", 20)
      .attr("y", 12)
      .attr("text-anchor", "start")
      .style("font-size", "12px")
      .text(subgroup);
  });
}
