import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, stackChartToTempTable} from "../../../util/util.js";
import {
    clearAllAnnotations,
    delay,
    groupedBarAverage,
    groupedBarCompare, groupedBarCompareBool, groupedBarCount,
    groupedBarDetermineRange, groupedBarDiff,
    groupedBarFilter,
    groupedBarFindExtremum, groupedBarNth,
    groupedBarRetrieveValue, groupedBarSort, groupedBarSum
} from "./groupedBarFunctions.js";
import { DatumValue } from "../../../object/valueType.js";

const GROUPED_BAR_OP_HANDLES = {
    [OperationType.RETRIEVE_VALUE]: groupedBarRetrieveValue,
    [OperationType.FILTER]:         groupedBarFilter,
    [OperationType.FIND_EXTREMUM]:  groupedBarFindExtremum,
    [OperationType.DETERMINE_RANGE]:groupedBarDetermineRange,
    [OperationType.COMPARE]:        groupedBarCompare,
    [OperationType.COMPARE_BOOL]:   groupedBarCompareBool,
    [OperationType.SORT]:           groupedBarSort,
    [OperationType.SUM]:            groupedBarSum,
    [OperationType.AVERAGE]:        groupedBarAverage,
    [OperationType.DIFF]:           groupedBarDiff,
    [OperationType.NTH]:            groupedBarNth,
    [OperationType.COUNT]:          groupedBarCount,
}

const chartDataStore = {};

async function applyGroupedBarOperation(chartId, operation, currentData, isLast = false)  {
    const fn = GROUPED_BAR_OP_HANDLES[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData, isLast);
}

async function executeGroupedBarOpsList(chartId, opsList, currentData, isLast = false)  {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applyGroupedBarOperation(chartId, operation, currentData, isLast);

        await delay(2000);
    }
    return currentData;
}

export async function runGroupedBarOps(chartId, vlSpec, opsSpec) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const chartInfo = chartDataStore[chartId];

    if (!chartInfo || !chartInfo.spec) {
        console.error("Chart info/spec not found. Please render the chart first via renderGroupedBarChart(...).");
        return;
    }

    if (svg.select(".plot-area").empty()) {
        await renderGroupedBarChart(chartId, chartInfo.spec);
    }

    clearAllAnnotations(d3.select(`#${chartId}`).select("svg"));

    const fullData = chartInfo.data;
    const { rows, datumValues, categoryLabel, measureLabel } = toGroupedDatumValues(fullData, vlSpec);
    let currentData = datumValues;
    const operationKeys = Object.keys(opsSpec);

    for (const opKey of operationKeys) {
        // console.log('before op:', opKey, currentData);
        const opsList = opsSpec[opKey];

        currentData = await executeGroupedBarOpsList(chartId, opsList, currentData);

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
        // await stackChartToTempTable(chartId, vlSpec);
        // console.log('after op:', opKey, currentData);
    }
}

export async function renderGroupedBarChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 300, right: 120, bottom: 60, left: 80 }; // bottom 여유 ↑
    const width = 900 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

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

export function toGroupedDatumValues(rawData, spec) {
    const enc = spec?.encoding || {};
    const xEnc = enc.x || {};
    const yEnc = enc.y || {};
    const colorEnc = enc.color || {};
    const colEnc = enc.column || {};
    const rowEnc = enc.row || {};

    // Facet field is the high-level category for grouped bars
    const facetField = colEnc.field || rowEnc.field || null;
    if (!facetField) {
        console.warn('toGroupedDatumValues: facet (column/row) field not found; falling back to raw x as category');
    }

    const xField = xEnc.field || null;
    const yField = yEnc.field || null;
    const colorField = colorEnc.field || null;
    const xType = xEnc.type;
    const yType = yEnc.type;
    const xAgg = xEnc.aggregate || null;
    const yAgg = yEnc.aggregate || null;

    const isXQuant = xType === 'quantitative';
    const valueField = isXQuant ? xField : yField; // may be null for count-only
    const numericEnc = isXQuant ? xEnc : yEnc;
    const measureLabel = (numericEnc.axis && numericEnc.axis.title) || (numericEnc.aggregate || numericEnc.field || 'value');

    // Category label: prefer explicit facet title; else use facet field name
    const facetLabel = (colEnc.axis && colEnc.axis.title) || (rowEnc.axis && rowEnc.axis.title) || (facetField || 'category');

    // Determine subgroup dimension: prefer color; else use the non-quant axis (usually x)
    let subgroupField = colorField || (isXQuant ? null : xField);
    if (!subgroupField) subgroupField = colorField || xField || null;

    // Helper
    const toNum = v => { const n = +v; return Number.isFinite(n) ? n : 0; };

    // Facets and subgroups
    const facets = facetField ? Array.from(new Set(rawData.map(d => d[facetField]))) : [null];
    const subgroups = subgroupField ? Array.from(new Set(rawData.map(d => d[subgroupField]))) : [null];

    function aggregateFor(facetVal, subgroupVal) {
        // rows matching this facet/subgroup
        const rows = rawData.filter(r =>
            (facetField ? r[facetField] === facetVal : true) &&
            (subgroupField ? r[subgroupField] === subgroupVal : true)
        );

        // Choose aggregation
        if (yAgg === 'count' || xAgg === 'count' || !valueField) return rows.length;

        // Default: sum
        const vals = valueField ? rows.map(r => toNum(r[valueField])) : [];
        if (xAgg === 'mean' || yAgg === 'mean') return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
        if (xAgg === 'min'  || yAgg === 'min')  return vals.length ? Math.min(...vals) : 0;
        if (xAgg === 'max'  || yAgg === 'max')  return vals.length ? Math.max(...vals) : 0;
        // sum (fallback)
        return vals.reduce((a,b)=>a+b,0);
    }

    const rows = [];
    const datumValues = [];

    subgroups.forEach(sg => {
        facets.forEach(fv => {
            const v = aggregateFor(fv, sg);
            const row = { [facetLabel]: fv, [measureLabel]: v, group: sg };
            rows.push(row);
            // id must be empty/undefined as requested
            datumValues.push(new DatumValue(facetField || 'category', measureLabel, fv, sg, v, undefined));
        });
    });

    return { rows, datumValues, categoryLabel: facetLabel, measureLabel };
}