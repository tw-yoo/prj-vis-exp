import {OperationType} from "../../../object/operationType.js";
import { IntervalValue, DatumValue, BoolValue, ScalarValue } from "../../../object/valueType.js";
import {
    simpleBarAverage,
    simpleBarCompare,
    simpleBarCompareBool,
    simpleBarCount,
    simpleBarDetermineRange,
    simpleBarDiff,
    simpleBarFilter,
    simpleBarFindExtremum,
    simpleBarNth,
    simpleBarRetrieveValue,
    simpleBarSort,
    simpleBarSum
} from "./simpleBarFunctions.js";
import {
    addChartOpsText,
    buildSimpleBarSpec,
    convertToDatumValues,
    dataCache, lastCategory, lastMeasure,
    renderChart,
    stackChartToTempTable
} from "../../../util/util.js";
import {addChildDiv, clearDivChildren} from "../../operationUtil.js";

const SIMPLE_BAR_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: simpleBarRetrieveValue,
    [OperationType.FILTER]:         simpleBarFilter,
    [OperationType.FIND_EXTREMUM]:  simpleBarFindExtremum,
    [OperationType.DETERMINE_RANGE]:simpleBarDetermineRange,
    [OperationType.COMPARE]:        simpleBarCompare,
    [OperationType.COMPARE_BOOL]:   simpleBarCompareBool,
    [OperationType.SORT]:           simpleBarSort,
    [OperationType.SUM]:            simpleBarSum,
    [OperationType.AVERAGE]:        simpleBarAverage,
    [OperationType.DIFF]:           simpleBarDiff,
    [OperationType.NTH]:            simpleBarNth,
    [OperationType.COUNT]:          simpleBarCount,
};

const chartDataStore = {};
function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}
function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const orientation = svg.attr("data-orientation") || "vertical";
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const margins = {
        left: +svg.attr("data-m-left") || 0,
        top: +svg.attr("data-m-top") || 0,
    };
    const plot = {
        w: +svg.attr("data-plot-w") || 0,
        h: +svg.attr("data-plot-h") || 0,
    };
    const g = svg.select("g");
    return { svg, g, orientation, xField, yField, margins, plot };
}

function updateOpCaption(chartId, text) {
    try {
        if (!text) return;
        const svg = d3.select(`#${chartId}`).select("svg");
        if (svg.empty()) return;
        const mTop = +svg.attr("data-m-top") || 40;
        const plotH = +svg.attr("data-plot-h") || 300;
        const y = mTop + plotH + 30;

        svg.selectAll(".op-caption").remove();

        svg.append("text")
            .attr("class", "op-caption")
            .attr("x", svg.attr("width") ? +svg.attr("width") / 2 : 300) // center horizontally
            .attr("y", y + 40) // further down below the chart
            .attr("text-anchor", "middle")
            .style("font-size", "16px") // larger font
            .style("fill", "#444")
            .text(text);
    } catch (e) {
        console.warn("updateOpCaption failed", e);
    }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function applySimpleBarOperation(chartId, operation, currentData, isLast = false) {
    const fn = SIMPLE_BAR_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData, isLast);
}

async function executeSimpleBarOpsList(chartId, opsList, currentData, isLast = false) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applySimpleBarOperation(chartId, operation, currentData, isLast);
        await delay(1500);

    }
    return currentData;
}

export async function runSimpleBarOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);

    clearAllAnnotations(svg);
    g.selectAll("rect")
      .interrupt()
      .attr("fill", "#69b3a2")
      .attr("opacity", 1)
      .attr("stroke", "none");

    if (!chartDataStore[chartId]) {
        console.error("runSimpleBarOps: No data in store. Please render the chart first.");
        return;
    }
    const fullData = [...chartDataStore[chartId]];
    let data = convertToDatumValues(fullData, xField, yField, orientation);

    const operationKeys = Object.keys(opsSpec);

    // 기존 chartId 내부 컴포넌트 지우기
    clearDivChildren(chartId);

    for (const opKey of operationKeys) {

        // 새로운 chartId 만들어서 렌더링하기
        let currentChartId = `${chartId}-${opKey}`;
        let currentChartTextId = `${currentChartId}-text`;
        addChildDiv(chartId, currentChartTextId, "append");
        addChildDiv(chartId, currentChartId, "append");

        addChartOpsText(currentChartTextId, textSpec[opKey]);
        await renderChart(currentChartId, vlSpec);
        updateOpCaption(currentChartId, textSpec[opKey]);

        let currentData = data;
        console.log('before op:', opKey, currentData);
        const isLast = opKey === "last";
        if (isLast) {
            const allDatumValues = Object.values(dataCache).flat();
            const chartSpec = buildSimpleBarSpec(allDatumValues)
            await renderChart(currentChartId, chartSpec);
            updateOpCaption(currentChartId, textSpec[opKey]);
            const opsList = opsSpec[opKey];
            currentData = await executeSimpleBarOpsList(currentChartId, opsList, allDatumValues, isLast);
        } else {
            const opsList = opsSpec[opKey];
            currentData = await executeSimpleBarOpsList(currentChartId, opsList, currentData, isLast);
            if (currentData instanceof IntervalValue || currentData instanceof BoolValue || currentData instanceof ScalarValue) {
                dataCache[opKey] = [currentData];
            } else {
                const currentDataArray = Array.isArray(currentData)
                    ? currentData
                    : (currentData != null ? [currentData] : []);

                currentDataArray.forEach((datum, idx) => {
                    if (datum instanceof DatumValue) {
                        datum.id = `${opKey}_${idx}`;
                        datum.category = lastCategory;
                        datum.measure = lastMeasure;
                    }
                });
                dataCache[opKey] = currentDataArray;
            }
            console.log('after op:', opKey, currentData);
            // await stackChartToTempTable(currentChartId, vlSpec);
        }
    }
    Object.keys(dataCache).forEach(key => delete dataCache[key]);
}

export async function renderSimpleBarChart(chartId, spec) {
    const yField = spec.encoding.y.field;
    const xField = spec.encoding.x.field;
    const xType = spec.encoding.x.type;
    const yType = spec.encoding.y.type;
    const isHorizontal = xType === 'quantitative' && yType !== 'quantitative';

    let data;
    if (spec.data && Array.isArray(spec.data.values)) {
        data = spec.data.values.map(d => ({...d}));
    } else if (spec.data && typeof spec.data.url === 'string') {
        if (spec.data.url.endsWith('.json')) {
            data = await d3.json(spec.data.url);
        } else {
            data = await d3.csv(spec.data.url);
        }
    } else {
        console.warn('renderSimpleBarChart: spec.data.values or spec.data.url is required');
        data = [];
    }

    data.forEach(d => {
        if (xType === 'quantitative') d[xField] = +d[xField];
        if (yType === 'quantitative') d[yField] = +d[yField];
    });

    if (spec.transform) {
        spec.transform.forEach(t => {
            if (t.filter) {
                const expr = t.filter.replace(/datum\./g, 'd.');
                const filterFn = new Function('d', `return ${expr};`);
                data = data.filter(filterFn);
            }
        });
    }

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

    chartDataStore[chartId] = data;

    const margin = {top: 40, right: 20, bottom: 80, left: 60};
    const width = 600;
    const height = 300;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    const svg = host.append("svg")
        .attr("viewBox", [0, 0, width, height])
        .style("overflow", "visible")
        .attr("data-orientation", isHorizontal ? "horizontal" : "vertical")
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", plotW)
        .attr("data-plot-h", plotH)
        .attr("data-x-field", xField)
        .attr("data-y-field", yField);

    svg.attr("data-x-sort-order", spec.encoding.x.sort ? spec.encoding.x.sort.join(',') : null);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    if (isHorizontal) {
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
            .attr("x", 0)
            .attr("y", d => yScale(d[yField]))
            .attr("width", d => xScale(d[xField]))
            .attr("height", yScale.bandwidth())
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d[yField])
            .attr("data-value", d => d[xField]);
    } else {
        const xDomain = spec.encoding.x.sort || data.map(d => d[xField]);
        const xScale = d3.scaleBand()
            .domain(xDomain)
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
            .attr("x", d => xScale(d[xField]))
            .attr("y", d => yScale(d[yField]))
            .attr("width", xScale.bandwidth())
            .attr("height", d => plotH - yScale(d[yField]))
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d[xField])
            .attr("data-value", d => d[yField]);
    }

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