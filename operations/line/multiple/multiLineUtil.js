import { DatumValue } from "../../../object/valueType.js";
import {
    simpleLineCompare,
    simpleLineDetermineRange,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineRetrieveValue,
    clearAllAnnotations as simpleClearAllAnnotations,
    delay, simpleLineSum, simpleLineAverage, simpleLineDiff, simpleLineCount
} from '../simple/simpleLineFunctions.js';

import {
    multipleLineRetrieveValue, multipleLineFilter, multipleLineFindExtremum,
    multipleLineDetermineRange, multipleLineCompare, multipleLineAverage, multipleLineDiff,
    multipleLineCount, multipleLineNth
} from './multiLineFunctions.js';
import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, stackChartToTempTable} from "../../../util/util.js";

export const chartDataStore = {};

const MULTIPLE_LINE_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: multipleLineRetrieveValue,
    [OperationType.FILTER]:         multipleLineFilter,
    [OperationType.FIND_EXTREMUM]:  multipleLineFindExtremum,
    [OperationType.DETERMINE_RANGE]:multipleLineDetermineRange,
    [OperationType.COMPARE]:        multipleLineCompare,
    //[OperationType.SUM]:            multipleLineSum,
    [OperationType.AVERAGE]:        multipleLineAverage,
    [OperationType.DIFF]:           multipleLineDiff,
    [OperationType.NTH]:            multipleLineNth,
    [OperationType.COUNT]:          multipleLineCount,
};


async function applyMultipleLineOperation(chartId, operation, currentData) {
    const fn = MULTIPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData);
}

async function executeMultipleLineOpsList(chartId, opsList, currentData) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applyMultipleLineOperation(chartId, operation, currentData);
        
            await delay(1500);
        
    }
    return currentData;
}

async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;

    const g = svg.select(".plot-area");
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) return;

    const { colorScale } = chartInfo;

    simpleClearAllAnnotations(svg);

    const resetPromises = [];

    // [수정] 점들을 삭제하는 대신, 투명하게 만들어 다음을 위해 남겨둡니다.
    resetPromises.push(
        g.selectAll("circle.datapoint")
            .transition().duration(400)
            .attr("opacity", 0)
            .end()
    );

    resetPromises.push(
        g.selectAll("path.series-line")
            .transition().duration(400)
            .attr("opacity", 1)
            .attr("stroke-width", 2)
            .attr("stroke", d => colorScale(d.key))
            .end()
    );

    resetPromises.push(
        g.select(".legend")
            .transition().duration(400)
            .attr("opacity", 1)
            .end()
    );

    await Promise.all(resetPromises).catch(err => {});
}

export async function runMultipleLineOps(chartId, vlSpec, opsSpec) {
    await fullChartReset(chartId);
    
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) {
        console.error(`runMultipleLineOps: No data in store for chartId '${chartId}'.`);
        return;
    }
    
    let fullData = [...chartInfo.data];
    const { rows, datumValues, categoryLabel, measureLabel } =
        multipleLineToDatumValues(fullData, vlSpec);
    let isTransformed = false;

    const operationKeys = Object.keys(opsSpec);
    for (const opKey of operationKeys) {
        let currentData = datumValues;
        console.log('before op:', opKey, currentData);
        const opsList = opsSpec[opKey];
        currentData = await executeMultipleLineOpsList(chartId, opsList, currentData);
        const currentDataArray = Array.isArray(currentData)
            ? currentData
            : (currentData != null ? [currentData] : []);

        currentDataArray.forEach((datum, idx) => {
            datum.id = `${opKey}_${idx}`;
            datum.category = lastCategory;
            datum.measure = lastMeasure;
        })

        dataCache[opKey] = currentDataArray
        await stackChartToTempTable(chartId, vlSpec);
        console.log('after op:', opKey, currentDataArray);
    }

    Object.keys(dataCache).forEach(key => delete dataCache[key]);
}


export async function renderMultipleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 40, right: 120, bottom: 50, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color.field;
    const isTemporal = spec.encoding.x.type === 'temporal';

    const data = await d3.csv(spec.data.url, d => {
        if (isTemporal) d[xField] = new Date(d[xField]);
        d[yField] = +d[yField];
        return d;
    });

    const series = d3.groups(data, d => d[colorField]).map(([key, values]) => ({ key, values }));

    // xScale
    let xScale;
    if (isTemporal) {
        xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d[xField]))
            .range([0, width]);
    } else {
        // Non-temporal: use unique ordered domain for scalePoint
        const seen = new Set();
        const domain = [];
        for (const d of data) {
            const k = String(d[xField]);
            if (!seen.has(k)) { seen.add(k); domain.push(k); }
        }
        xScale = d3.scalePoint()
            .domain(domain)
            .range([0, width]);
    }

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[yField])]).nice()
        .range([height, 0]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(series.map(s => s.key));

    chartDataStore[chartId] = {
        data,
        series,
        fullXScale: xScale,
        fullYScale: yScale,
        colorScale
    };

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height + margin.top + margin.bottom])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-color-field", colorField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", height);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

    g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => xScale(d[xField]))
        .y(d => yScale(d[yField]));

    // Draw series lines
    g.selectAll(".series-line")
        .data(series, d => d.key)
        .join("path")
        .attr("class", d => `series-line series-${String(d.key).replace(/\s+/g, '-')}`)
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.key))
        .attr("stroke-width", 2)
        .attr("d", d => lineGen(d.values));

    // Draw datapoint circles for all series
    const fmtISO = d3.timeFormat("%Y-%m-%d");
    g.selectAll("circle.datapoint")
        .data(
            data,
            d => {
                const kx = isTemporal ? +d[xField] : String(d[xField]);
                const ks = String(d[colorField]);
                return `${kx}|${ks}`; // stable key per (x, series)
            }
        )
        .join(
            enter => enter.append("circle")
                .attr("class", "datapoint")
                .attr("cx", d => xScale(d[xField]))
                .attr("cy", d => yScale(d[yField]))
                .attr("r", 3.5)
                .attr("fill", d => colorScale(d[colorField]))
                .attr("opacity", 0)
                .attr("data-id", d => isTemporal ? fmtISO(d[xField]) : String(d[xField]))
                .attr("data-value", d => d[yField])
                .attr("data-series", d => String(d[colorField]))
        );

    // Simple legend
    const legend = g.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width + 20}, 0)`);

    series.forEach((s, i) => {
        const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale(s.key));
        legendRow.append("text").attr("x", 20).attr("y", 12).text(s.key).style("font-size", "12px");
    });
}

function multipleLineToDatumValues(rawData, spec) {
  const xEnc = spec.encoding.x || {};
  const yEnc = spec.encoding.y || {};
  const colorEnc = spec.encoding.color || {};

  const xField = xEnc.field;
  const yField = yEnc.field;
  const colorField = colorEnc.field;

  const categoryLabel = (xEnc.axis && xEnc.axis.title) || xField || 'x';
  const measureLabel = (yEnc.axis && yEnc.axis.title) || yField || 'y';

  const rows = [];
  const datumValues = [];

  rawData.forEach(d => {
    const categoryVal = d[xField];
    const measureVal = +d[yField];
    const groupVal = colorField ? d[colorField] : null;

    rows.push({
      [categoryLabel]: categoryVal,
      [measureLabel]: measureVal,
      group: groupVal
    });

    datumValues.push(new DatumValue(
      xField,
      yField,
      categoryVal,
      groupVal,
      measureVal,
      undefined
    ));
  });

  return { rows, datumValues, categoryLabel, measureLabel };
}