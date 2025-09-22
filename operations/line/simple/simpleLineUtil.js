import {
    clearAllAnnotations,
    delay,
    getSvgAndSetup,
    simpleLineAverage,
    simpleLineCompare,
    simpleLineCompareBool,
    simpleLineCount,
    simpleLineDetermineRange,
    simpleLineDiff,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineNth,
    simpleLineRetrieveValue, simpleLineSort,
    simpleLineSum
} from "./simpleLineFunctions.js";
import {OperationType} from "../../../object/operationType.js";
import {convertToDatumValues, dataCache, lastCategory, lastMeasure} from "../../../util/util.js";

const SIMPLE_LINE_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: simpleLineRetrieveValue,
    [OperationType.FILTER]:         simpleLineFilter,
    [OperationType.FIND_EXTREMUM]:  simpleLineFindExtremum,
    [OperationType.DETERMINE_RANGE]:simpleLineDetermineRange,
    [OperationType.COMPARE]:        simpleLineCompare,
    [OperationType.COMPARE_BOOL]:   simpleLineCompareBool,
    [OperationType.SORT]:           simpleLineSort,
    [OperationType.SUM]:            simpleLineSum,
    [OperationType.AVERAGE]:        simpleLineAverage,
    [OperationType.DIFF]:           simpleLineDiff,
    [OperationType.NTH]:            simpleLineNth,
    [OperationType.COUNT]:          simpleLineCount,
};

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


async function applySimpleLineOperation(chartId, operation, currentData) {
    const fn = SIMPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData);
}

async function executeSimpleLineOpsList(chartId, opsList, currentData) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applySimpleLineOperation(chartId, operation, currentData);

        await delay(2000);

    }
    return currentData;
}

export async function runSimpleLineOps(chartId, vlSpec, opsSpec) {
    await fullChartReset(chartId);

    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);

    const fullData = chartDataStore[chartId];
    if (!fullData) {
        console.error("No data for chart:", chartId);
        return;
    }
    const data = convertToDatumValues(fullData, xField, yField, orientation);

    const operationKeys = Object.keys(opsSpec);
    for (const opKey of operationKeys) {
        let currentData = data;
        // console.log('before op:', opKey, currentData);
        const opsList = opsSpec[opKey];
        currentData = await executeSimpleLineOpsList(chartId, opsList, currentData);
        const currentDataArray = Array.isArray(currentData)
            ? currentData
            : (currentData != null ? [currentData] : []);

        currentDataArray.forEach((datum, idx) => {
            datum.id = `${opKey}_${idx}`;
            datum.category = lastCategory;
            datum.measure = lastMeasure;
        })

        dataCache[opKey] = currentDataArray
        // await stackChartToTempTable(chartId, vlSpec); // 지금 당장은 stack 기능 필요하지 않음.
        // console.log('after op:', opKey, currentDataArray);
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
            // Keep as raw text even if it looks like a date
            o[xField] = String(d[xField]);
        } else if (xType === 'quantitative') {
            o[xField] = +d[xField];
        } else {
            o[xField] = String(d[xField]);
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
        ? d3.scaleTime().domain(d3.extent(data, d => new Date(d[xField]))).range([0, width])
        : (xType === 'quantitative'
            ? d3.scaleLinear().domain(d3.extent(data, d => d[xField])).nice().range([0, width])
            : d3.scalePoint().domain(data.map(d => String(d[xField]))).range([0, width]));

    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    g.append("g").attr("class", "y-axis").call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => xType === 'temporal' ? xScale(new Date(d[xField])) : xScale(d[xField]))
        .y(d => yScale(d[yField]));

    g.append("path")
        .datum(data)
        .attr("class", "series-line")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", lineGen);

    g.selectAll(".datapoint")
        .data(data)
        .join("circle")
        .attr("class", "datapoint")
        .attr("cx", d => xType === 'temporal' ? xScale(new Date(d[xField])) : xScale(d[xField]))
        .attr("cy", d => yScale(d[yField]))
        .attr("r", 5)
        .attr("fill", "steelblue")
        .attr("opacity", 0)
        .attr("data-id", d => String(d[xField]))
        .attr("data-key-year", d => (
            xType === 'temporal' ? new Date(d[xField]).getFullYear() : null
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