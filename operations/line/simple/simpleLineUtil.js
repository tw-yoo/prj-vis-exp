
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
import {OperationType} from "../../../object/operationType.js";
import {stackChartToTempTable} from "../../../util/util.js";

const chartDataStore = {};
async function fullChartReset(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
    g.selectAll(".highlighted-line").remove(); 
    clearAllAnnotations(svg); 

    const resetPromises = [];

    resetPromises.push(g.select("path.series-line").transition().duration(400)
        .attr("stroke", "steelblue").attr("opacity", 1).end());

    resetPromises.push(g.selectAll("circle.datapoint").transition().duration(400)
        .attr("opacity", 0).end());
        
    await Promise.all(resetPromises);
}

export async function runSimpleLineOps(chartId, vlSpec, opsSpec) {
    await fullChartReset(chartId);

    const fullData = chartDataStore[chartId];
    if (!fullData) {
        console.error("No data for chart:", chartId);
        return;
    }
    let currentData = [...fullData];
    let previousOpType = null; 
    for (let i = 0; i < opsSpec.ops.length; i++) {
      
        if (previousOpType) {
            if (previousOpType === 'filter') {
                
                const { svg } = getSvgAndSetup(chartId);
                clearAllAnnotations(svg);
                await delay(200);
            } else {
                
                await fullChartReset(chartId);
            }
        }
        
        const operation = opsSpec.ops[i];

        switch (operation.op) {
            case OperationType.RETRIEVE_VALUE: currentData = await simpleLineRetrieveValue(chartId, operation, currentData, fullData); break;
            case OperationType.FILTER: currentData = await simpleLineFilter(chartId, operation, currentData, fullData); break;
            case OperationType.FIND_EXTREMUM: currentData = await simpleLineFindExtremum(chartId, operation, currentData, fullData); break;
            case OperationType.DETERMINE_RANGE: currentData = await simpleLineDetermineRange(chartId, operation, currentData, fullData); break;
            case OperationType.COMPARE: currentData = await simpleLineCompare(chartId, operation, currentData, fullData); break;
            case OperationType.SORT: currentData = await simpleLineSort(chartId, operation, currentData, fullData); break;
            case OperationType.STACK: await stackChartToTempTable(chartId, vlSpec); break;
            default: console.warn(`Unsupported operation: ${operation.op}`);
        }

        previousOpType = operation.op;

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
  const xType  = spec.encoding.x.type; 

  const raw = await d3.csv(spec.data.url);


  const data = raw.map(d => {
    const o = { ...d };

    o[yField] = +o[yField];

    if (xType === 'temporal') {
      if (/^\d{4}$/.test(d[xField])) o[xField] = new Date(+d[xField], 0, 1);
      else                           o[xField] = new Date(d[xField]);
    } else if (xType === 'quantitative') {
      o[xField] = +d[xField];
    } else {
      o[xField] = d[xField];
    }
    return o;
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

  const xScale = (xType === 'temporal')
    ? d3.scaleTime().domain(d3.extent(data, d => d[xField])).range([0, width])
    : (xType === 'quantitative'
        ? d3.scaleLinear().domain(d3.extent(data, d => d[xField])).nice().range([0, width])
        : d3.scalePoint().domain(data.map(d => d[xField])).range([0, width]));

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

  const fmtISO = d3.timeFormat("%Y-%m-%d");
  g.selectAll(".datapoint")
    .data(data)
    .join("circle")
    .attr("class", "datapoint")
    .attr("cx", d => xScale(d[xField]))
    .attr("cy", d => yScale(d[yField]))
    .attr("r", 5)
    .attr("fill", "steelblue")
    .attr("opacity", 0)
    .attr("data-id", d => (
      d[xField] instanceof Date ? fmtISO(d[xField]) : String(d[xField])
    ))
    .attr("data-key-year", d => (
      d[xField] instanceof Date ? d[xField].getFullYear() : null
    ))
    .attr("data-value", d => d[yField]);

  svg.append("text").attr("class", "x-axis-label")
    .attr("x", margin.left + width / 2).attr("y", height + margin.top + margin.bottom - 10)
    .attr("text-anchor", "middle").text(xField);
  svg.append("text").attr("class", "y-axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + height / 2)).attr("y", margin.left - 60)
    .attr("text-anchor", "middle").text(yField);
}
