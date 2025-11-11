import { DatumValue } from "../../../object/valueType.js";
import { clearAllAnnotations as simpleClearAllAnnotations, delay } from '../simple/simpleLineFunctions.js';

import {
    multipleLineRetrieveValue, multipleLineFilter, multipleLineFindExtremum,
    multipleLineDetermineRange, multipleLineCompare, multipleLineAverage, multipleLineDiff,
    multipleLineCount, multipleLineNth, multipleLineCompareBool, multipleLineLagDiff
} from './multiLineFunctions.js';
import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, buildSimpleBarSpec} from "../../../util/util.js";
import { runOpsSequence, shrinkSvgViewBox } from "../../operationUtil.js";
import {renderSimpleBarChart, executeSimpleBarOpsList} from "../../bar/simple/simpleBarUtil.js";
import { ensurePercentDiffAggregate, buildCompareDatasetFromCache } from "../../common/lastStageHelpers.js";


export const chartDataStore = {};
// Ensure layout/paint settles between ops (fallbacks to a short delay if rAF is unavailable)
const settleFrame = () => (typeof requestAnimationFrame === 'function'
    ? new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
    : delay(50));

const MULTIPLE_LINE_OP_HANDLERS = {
    [OperationType.RETRIEVE_VALUE]: multipleLineRetrieveValue,
    [OperationType.FILTER]:         multipleLineFilter,
    [OperationType.FIND_EXTREMUM]:  multipleLineFindExtremum,
    [OperationType.DETERMINE_RANGE]:multipleLineDetermineRange,
    [OperationType.COMPARE]:        multipleLineCompare,
    [OperationType.COMPARE_BOOL]:   multipleLineCompareBool,
    //[OperationType.SUM]:            multipleLineSum,
    [OperationType.AVERAGE]:        multipleLineAverage,
    [OperationType.DIFF]:           multipleLineDiff,
    [OperationType.LAG_DIFF]:       multipleLineLagDiff,
    [OperationType.NTH]:            multipleLineNth,
    [OperationType.COUNT]:          multipleLineCount,
};

function coerceDatumValue(datum, idx, categoryLabel, measureLabel, opKey) {
    const fallbackCategory = categoryLabel ?? lastCategory ?? 'category';
    const fallbackMeasure = measureLabel ?? lastMeasure ?? 'value';
    const category = (typeof datum?.category === 'string' && datum.category.trim().length > 0)
        ? datum.category
        : fallbackCategory;
    const measure = (typeof datum?.measure === 'string' && datum.measure.trim().length > 0)
        ? datum.measure
        : fallbackMeasure;
    const target = datum?.target != null
        ? String(datum.target)
        : (datum && category && datum[category] != null)
            ? String(datum[category])
            : `Result ${idx + 1}`;
    const value = Number.isFinite(Number(datum?.value))
        ? Number(datum.value)
        : (Number.isFinite(Number(datum?.[measure])))
            ? Number(datum[measure])
            : 0;
    const group = datum?.group ?? null;
    const stableId = `${opKey}_${idx}`;
    const lookupSource = datum?.id ?? datum?.lookupId ?? datum?.target ?? null;

    const dv = new DatumValue(category, measure, target, group, value, stableId);
    dv.lookupId = lookupSource != null ? String(lookupSource) : stableId;

    if (datum && typeof datum === 'object') {
        const protectedKeys = new Set(['category', 'measure', 'target', 'group', 'value', 'id', 'lookupId']);
        Object.keys(datum).forEach((key) => {
            if (protectedKeys.has(key)) return;
            dv[key] = datum[key];
        });
    }

    return dv;
}


async function applyMultipleLineOperation(chartId, operation, currentData, isLast = false) {
    const fn = MULTIPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    const next = await Promise.resolve(fn(chartId, operation, currentData, isLast));
    return (next === undefined ? currentData : next);
}

async function executeMultipleLineOpsList(chartId, opsList, currentData, isLastList = false) {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        const isLast = isLastList && (i === opsList.length - 1);
        currentData = await applyMultipleLineOperation(chartId, operation, currentData, isLast);
        // Ensure browser paints/settles before moving on
        await settleFrame();
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
            .attr("stroke", d => colorScale ? colorScale(d.key) : d3.schemeCategory10[0])
            .end()
    );

    resetPromises.push(
        g.select(".legend")
            .transition().duration(400)
            .attr("opacity", 1)
            .end()
    );

    await Promise.all(resetPromises).catch(() => {});
    await settleFrame();
}

async function resetMultipleLineChart(chartId, vlSpec, ctx = {}) {
    const forceInitial = ctx?.forceInitialReset === true;
    if (ctx?.stepIndex === 0 && !forceInitial) {
        return;
    }
    const svg = d3.select(`#${chartId}`).select("svg");
    const hasLines = !svg.empty() && !svg.selectAll("path.series-line").empty();
    if (!hasLines || !ctx || !ctx.isLast || forceInitial) {
        await renderMultipleLineChart(chartId, vlSpec);
        await settleFrame();
    } else {
        await fullChartReset(chartId);
    }
}

export async function runMultipleLineOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    ensurePercentDiffAggregate(opsSpec, textSpec);
    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) {
        console.error(`runMultipleLineOps: No data in store for chartId '${chartId}'.`);
        return;
    }

    let fullData = [...chartInfo.data];
    const { rows, datumValues, categoryLabel, measureLabel } = multipleLineToDatumValues(fullData, vlSpec);

    // reset cache
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    await runOpsSequence({
        chartId,
        opsSpec,
        textSpec,
        onReset: async (ctx = {}) => { await resetMultipleLineChart(chartId, vlSpec, ctx); },
        onRunOpsList: async (opsList, isLast) => {
            if (isLast) {
                const cached = Object.values(dataCache).flat().filter(Boolean);
                if (cached.length === 0) {
                    console.warn('runMultipleLineOps:last — no cached data to operate on');
                    return [];
                }

                const fallbackCategory = lastCategory ?? categoryLabel ?? 'category';
                const fallbackMeasure = lastMeasure ?? measureLabel ?? 'value';

                const prepared = buildCompareDatasetFromCache(cached, fallbackCategory, fallbackMeasure);
                if (!prepared) {
                    console.warn('runMultipleLineOps:last — cached data missing DatumValue entries');
                    return [];
                }
                const { compareData, specOpts } = prepared;
                const compareSpec = buildSimpleBarSpec(compareData, specOpts);
                await renderSimpleBarChart(chartId, compareSpec);
                return await executeSimpleBarOpsList(chartId, opsList, compareData, true, 0);
            }

            const base = datumValues.slice();
            return await executeMultipleLineOpsList(chartId, opsList, base, false);
        },
        onCache: (opKey, currentData) => {
            const arr = Array.isArray(currentData) ? currentData : (currentData != null ? [currentData] : []);
            const normalized = arr
                .filter(d => d != null)
                .map((datum, idx) => coerceDatumValue(datum, idx, categoryLabel, measureLabel, opKey));
            dataCache[opKey] = normalized;
        },
        isLastKey: (k) => k === 'last',
        delayMs: 0,
        navOpts: { x: 15, y: 15 }
    });
}


export async function renderMultipleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 48, right: 96, bottom: 48, left: 84 };
    const innerWidth = (spec?.width ?? 600);
    const innerHeight = (spec?.height ?? 320);
    const totalWidth = innerWidth + margin.left + margin.right;
    const totalHeight = innerHeight + margin.top + margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color.field;
    const isTemporal = spec.encoding.x.type === 'temporal';

    const xTimeUnit = spec.encoding.x.timeUnit || null;
    const parseTemporal = (rawValue) => {
        if (!isTemporal) return null;
        const raw = String(rawValue ?? '').trim();
        if (!raw) return null;
        if (xTimeUnit === 'month') {
            const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
            const idx = monthNames.indexOf(raw.slice(0,3).toLowerCase());
            if (idx >= 0) {
                return new Date(Date.UTC(2000, idx, 1));
            }
        }
        if (xTimeUnit === 'quarter') {
            const match = raw.match(/Q([1-4])/i);
            if (match) {
                const quarterIdx = Number(match[1]) - 1;
                return new Date(Date.UTC(2000, quarterIdx * 3, 1));
            }
        }
        const date = new Date(raw);
        return Number.isNaN(date?.getTime?.()) ? null : date;
    };

    const data = await d3.csv(spec.data.url, d => {
        const clone = { ...d };
        clone[xField] = String(d[xField]);
        clone[yField] = +d[yField];
        if (isTemporal) {
            clone.__parsedX = parseTemporal(clone[xField]);
        }
        return clone;
    });

    const filteredData = isTemporal
        ? data.filter(d => d.__parsedX instanceof Date && !Number.isNaN(d.__parsedX.getTime()))
        : data.slice();

    if (isTemporal && filteredData.length === 0) {
        console.warn('renderMultipleLineChart: no valid temporal values for', xField);
    }

    const series = d3.groups(filteredData, d => d[colorField]).map(([key, values]) => ({ key, values }));

    let xScale;
    if (isTemporal) {
        let extentValues = d3.extent(filteredData, d => d.__parsedX);
        if (!extentValues[0] || !extentValues[1]) {
            const now = new Date();
            extentValues = [now, new Date(now.getTime() + 86400000)];
        }
        xScale = d3.scaleTime()
            .domain(extentValues)
            .range([0, innerWidth]);
    } else {
        const seen = new Set();
        const domain = [];
        for (const d of data) {
            const k = String(d[xField]);
            if (!seen.has(k)) { seen.add(k); domain.push(k); }
        }
        xScale = d3.scalePoint()
            .domain(domain)
            .range([0, innerWidth]);
    }

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(filteredData, d => d[yField])]).nice()
        .range([innerHeight, 0]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(series.map(s => s.key));

    chartDataStore[chartId] = {
        data: filteredData,
        series,
        fullXScale: xScale,
        fullYScale: yScale,
        colorScale
    };

    const svg = container.append("svg")
        .attr("viewBox", [0, 0, totalWidth, totalHeight])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-color-field", colorField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", innerWidth)
        .attr("data-plot-h", innerHeight);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale));

    g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(d => isTemporal ? xScale(d.__parsedX) : xScale(d[xField]))
        .y(d => yScale(d[yField]));

    g.selectAll(".series-line")
        .data(series, d => d.key)
        .join("path")
        .attr("class", d => `series-line series-${String(d.key).replace(/\s+/g, '-')}`)
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.key))
        .attr("stroke-width", 2)
        .attr("opacity", 1)
        .attr("d", d => lineGen(d.values));

    g.selectAll("circle.datapoint")
        .data(
            filteredData,
            d => {
                const kx = String(d[xField]);
                const ks = String(d[colorField]);
                return `${kx}|${ks}`;
            }
        )
        .join(
            enter => enter.append("circle")
                .attr("class", "datapoint")
                .attr("cx", d => isTemporal ? xScale(d.__parsedX) : xScale(d[xField]))
                .attr("cy", d => yScale(d[yField]))
                .attr("r", 3.5)
                .attr("fill", d => colorScale(d[colorField]))
                .attr("opacity", 0)
                .attr("data-id", d => String(d[xField]))
                .attr("data-value", d => d[yField])
                .attr("data-series", d => String(d[colorField]))
        );

    const legend = g.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${innerWidth + 20}, 0)`);

    series.forEach((s, i) => {
        const legendRow = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale(s.key));
        legendRow.append("text").attr("x", 20).attr("y", 12).text(s.key).style("font-size", "12px");
    });
    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + innerWidth / 2)
        .attr("y", margin.top + innerHeight + 40)
        .attr("text-anchor", "middle")
        .text(xField);

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + innerHeight / 2))
        .attr("y", margin.left - 48)
        .attr("text-anchor", "middle")
        .text(yField);

    shrinkSvgViewBox(svg, 12);
    // shrinkSvgViewBox(svg, 6);
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
        const categoryVal = String(d[xField]);
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
