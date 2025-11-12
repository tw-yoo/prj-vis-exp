import { DatumValue, BoolValue, IntervalValue, ScalarValue } from "../../../object/valueType.js";
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
import { storeAxisDomain } from "../../common/scaleHelpers.js";
import { resetRuntimeResults, storeRuntimeResult, makeRuntimeKey } from "../../runtimeResultStore.js";


export const chartDataStore = {};
// Ensure layout/paint settles between ops (fallbacks to a short delay if rAF is unavailable)
const settleFrame = () => (typeof requestAnimationFrame === 'function'
    ? new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
    : delay(50));

const toSeriesKey = (value) => (value == null ? '__default__' : String(value));

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

async function executeMultipleLineOpsList(chartId, opsList, initialData, isLastList = false, opKey = null) {
    const list = Array.isArray(opsList) ? opsList : [];
    resetRuntimeResults();
    let workingData = initialData;
    let lastResult = initialData;

    for (let i = 0; i < list.length; i++) {
        const operation = list[i];
        const isLast = isLastList && (i === list.length - 1);
        const inputData = workingData;
        const result = await applyMultipleLineOperation(chartId, operation, inputData, isLast);
        lastResult = result;

        const stepKey = makeRuntimeKey(opKey, i);
        storeRuntimeResult(stepKey, result);

        const preserveInput = !!(result && result.__keepInput);
        if (!preserveInput) {
            if (Array.isArray(result)) {
                workingData = result;
            } else if (result instanceof IntervalValue || result instanceof BoolValue || result instanceof ScalarValue || result == null) {
                // keep workingData unchanged
            } else {
                workingData = result;
            }
        }

        // Ensure browser paints/settles before moving on
        await settleFrame();
    }
    return lastResult;
}

async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;

    const g = svg.select(".plot-area");
    if (g.empty()) return;

    const chartInfo = chartDataStore[chartId];
    if (!chartInfo) return;

    const {
        data: baseData = [],
        series = [],
        colorScale: storedColorScale,
        fullXScale,
        fullYScale,
        xField,
        yField,
        colorField,
        isTemporal
    } = chartInfo;

    simpleClearAllAnnotations(svg);

    g.interrupt();
    g.selectAll("*").interrupt();

    const colorScale = storedColorScale && typeof storedColorScale.copy === "function"
        ? storedColorScale.copy()
        : (storedColorScale || d3.scaleOrdinal(d3.schemeCategory10));
    const xScale = fullXScale && typeof fullXScale.copy === "function" ? fullXScale.copy() : fullXScale;
    const yScale = fullYScale && typeof fullYScale.copy === "function" ? fullYScale.copy() : fullYScale;

    if (xScale && yScale && Array.isArray(series) && series.length > 0 && xField && yField) {
        const lineGen = d3.line()
            .x(d => {
                if (isTemporal) {
                    return xScale(d.__parsedX);
                }
                return xScale(String(d[xField]));
            })
            .y(d => yScale(Number(d[yField])));

        g.selectAll("path.series-line")
            .data(series, d => d.id)
            .join(
                enter => enter.append("path")
                    .attr("class", d => `series-line series-${String(d.id).replace(/\s+/g, '-')}`)
                    .attr("data-series", d => d.id)
                    .attr("fill", "none")
                    .attr("stroke", d => colorScale(d.id))
                    .attr("stroke-width", 2)
                    .attr("opacity", 1)
                    .attr("d", d => lineGen(d.values)),
                update => update
                    .attr("fill", "none")
                    .attr("data-series", d => d.id)
                    .attr("stroke", d => colorScale(d.id))
                    .attr("stroke-width", 2)
                    .attr("opacity", 1)
                    .attr("d", d => lineGen(d.values)),
                exit => exit.remove()
            );
    } else {
        g.selectAll("path.series-line")
            .attr("opacity", 1)
            .attr("stroke-width", 2)
            .attr("stroke", function(d) {
                const key = d?.id ?? this.getAttribute("data-series");
                const safeKey = toSeriesKey(key);
                return colorScale ? colorScale(safeKey) : d3.schemeCategory10[0];
            });
    }

    const xAxisSel = g.select(".x-axis");
    if (!xAxisSel.empty() && xScale) {
        xAxisSel.interrupt();
        xAxisSel.call(d3.axisBottom(xScale));
    }
    const yAxisSel = g.select(".y-axis");
    if (!yAxisSel.empty() && yScale) {
        yAxisSel.interrupt();
        yAxisSel.call(d3.axisLeft(yScale));
    }

    const legend = svg.select(".legend");
    if (!legend.empty()) {
        legend.selectAll("g")
            .attr("opacity", 1)
            .select("text")
            .attr("font-weight", "normal");
    }

    const safeSeriesKey = (datum) => toSeriesKey(datum ? (datum[colorField] ?? datum.group) : null);
    const safeTargetKey = (datum) => String(datum ? (datum[xField] ?? datum.target ?? '') : '');

    const pointKey = (d) => {
        const cxKey = safeTargetKey(d);
        const groupKey = safeSeriesKey(d);
        return `${cxKey}|${groupKey}`;
    };

    g.selectAll("circle.datapoint-highlight, circle.main-dp").remove();

    if (Array.isArray(baseData) && xScale && yScale && xField && yField) {
        g.selectAll("circle.datapoint")
            .data(baseData, pointKey)
            .join(
                enter => enter.append("circle")
                    .attr("class", "datapoint")
                    .attr("cx", d => {
                        if (!d) return 0;
                        if (isTemporal) {
                            const parsed = d.__parsedX instanceof Date ? d.__parsedX : null;
                            if (!parsed) return 0;
                            const projected = xScale(parsed);
                            return Number.isFinite(projected) ? projected : 0;
                        }
                        const key = String(d[xField]);
                        const projected = xScale(key);
                        return Number.isFinite(projected) ? projected : 0;
                    })
                    .attr("cy", d => {
                        const val = Number(d ? d[yField] : NaN);
                        if (!Number.isFinite(val)) return yScale.range ? yScale.range()[0] : 0;
                        const projected = yScale(val);
                        return Number.isFinite(projected) ? projected : (yScale.range ? yScale.range()[0] : 0);
                    })
                    .attr("r", 3.5)
                    .attr("fill", d => colorScale(safeSeriesKey(d)))
                    .attr("opacity", 0)
                    .attr("data-id", d => safeTargetKey(d))
                    .attr("data-value", d => (d ? d[yField] : ''))
                    .attr("data-series", d => safeSeriesKey(d)),
                update => update
                    .attr("cx", d => {
                        if (!d) return 0;
                        if (isTemporal) {
                            const parsed = d.__parsedX instanceof Date ? d.__parsedX : null;
                            if (!parsed) return 0;
                            const projected = xScale(parsed);
                            return Number.isFinite(projected) ? projected : 0;
                        }
                        const key = String(d[xField]);
                        const projected = xScale(key);
                        return Number.isFinite(projected) ? projected : 0;
                    })
                    .attr("cy", d => {
                        const val = Number(d ? d[yField] : NaN);
                        if (!Number.isFinite(val)) return yScale.range ? yScale.range()[0] : 0;
                        const projected = yScale(val);
                        return Number.isFinite(projected) ? projected : (yScale.range ? yScale.range()[0] : 0);
                    })
                    .attr("fill", d => colorScale(safeSeriesKey(d)))
                    .attr("opacity", 0)
                    .attr("data-id", d => safeTargetKey(d))
                    .attr("data-value", d => (d ? d[yField] : ''))
                    .attr("data-series", d => safeSeriesKey(d)),
                exit => exit.remove()
            );
    } else {
        g.selectAll("circle.datapoint").attr("opacity", 0);
    }

    await settleFrame();
}

async function resetMultipleLineChart(chartId, vlSpec, ctx = {}) {
    const forceInitial = ctx?.forceInitialReset === true;
    if (ctx?.stepIndex === 0 && !forceInitial) {
        return;
    }

    const svg = d3.select(`#${chartId}`).select("svg");
    const hasLines = !svg.empty() && !svg.selectAll("path.series-line").empty();
    const chartInfo = chartDataStore[chartId];
    const shouldReRender = forceInitial || !hasLines || !chartInfo;

    if (shouldReRender) {
        await renderMultipleLineChart(chartId, vlSpec);
        await settleFrame();
        return;
    }

    await fullChartReset(chartId);
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
        onRunOpsList: async (opsList, isLast, opKey) => {
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
                return await executeSimpleBarOpsList(chartId, opsList, compareData, true, 0, opKey);
            }

            const base = datumValues.slice();
            return await executeMultipleLineOpsList(chartId, opsList, base, false, opKey);
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
    container.selectAll("*").interrupt();
    container.selectAll("*").remove();

    const margin = { top: 48, right: 96, bottom: 48, left: 84 };
    const innerWidth = (spec?.width ?? 600);
    const innerHeight = (spec?.height ?? 320);
    const totalWidth = innerWidth + margin.left + margin.right;
    const totalHeight = innerHeight + margin.top + margin.bottom;

    const xEnc = spec?.encoding?.x || {};
    const yEnc = spec?.encoding?.y || {};
    const colorEnc = spec?.encoding?.color || {};

    const xField = xEnc.field;
    const yField = yEnc.field;
    const colorField = colorEnc.field;
    const sourceUrl = spec?.data?.url;

    if (!xField || !yField || !colorField || !sourceUrl) {
        console.error("renderMultipleLineChart: missing required spec fields", { xField, yField, colorField, sourceUrl });
        return;
    }

    const isTemporal = xEnc.type === 'temporal';
    const xTimeUnit = xEnc.timeUnit || null;

    const parseTemporal = (rawValue) => {
        if (!isTemporal) return null;
        const raw = String(rawValue ?? '').trim();
        if (!raw) return null;
        if (xTimeUnit === 'month') {
            const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
            const idx = monthNames.indexOf(raw.slice(0, 3).toLowerCase());
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

    const cached = chartDataStore[chartId];
    const canReuseCache =
        cached &&
        cached.sourceUrl === sourceUrl &&
        cached.xField === xField &&
        cached.yField === yField &&
        cached.colorField === colorField &&
        cached.isTemporal === isTemporal &&
        cached.xTimeUnit === xTimeUnit &&
        Array.isArray(cached.rawRows) &&
        cached.rawRows.length > 0;

    let preparedRows;
    if (canReuseCache) {
        preparedRows = cached.rawRows.map(row => ({ ...row }));
    } else {
        preparedRows = await d3.csv(sourceUrl, row => {
            const clone = { ...row };
            clone[xField] = String(row[xField]);
            clone[yField] = Number(row[yField]);
            if (isTemporal) {
                clone.__parsedX = parseTemporal(clone[xField]);
            }
            return clone;
        });
    }

    if (isTemporal) {
        preparedRows.forEach(row => {
            if (!(row.__parsedX instanceof Date) || Number.isNaN(+row.__parsedX)) {
                row.__parsedX = parseTemporal(row[xField]);
            }
        });
    }

    const filteredData = isTemporal
        ? preparedRows.filter(row => row.__parsedX instanceof Date && !Number.isNaN(+row.__parsedX))
        : preparedRows.slice();

    if (isTemporal && filteredData.length === 0) {
        console.warn('renderMultipleLineChart: no valid temporal values for', xField);
    }

    const baseData = filteredData.map(row => ({ ...row }));
    const series = d3.groups(baseData, row => toSeriesKey(row[colorField]))
        .map(([id, values]) => {
            const sample = values.find(v => v[colorField] != null);
            const label = sample ? String(sample[colorField]) : id;
            return { id, key: label, values };
        });

    let xScale;
    if (isTemporal) {
        let extentValues = d3.extent(baseData, row => row.__parsedX);
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
        for (const row of preparedRows) {
            const key = String(row[xField]);
            if (!seen.has(key)) {
                seen.add(key);
                domain.push(key);
            }
        }
        if (domain.length === 0) {
            domain.push('0');
        }
        xScale = d3.scalePoint()
            .domain(domain)
            .range([0, innerWidth]);
    }

    const yValues = baseData.map(row => Number(row[yField])).filter(Number.isFinite);
    const yMax = yValues.length ? d3.max(yValues) : 0;
    const yMin = yValues.length ? d3.min(yValues) : 0;
    const yDomain = [
        Number.isFinite(yMin) && yMin < 0 ? yMin : 0,
        Number.isFinite(yMax) ? yMax : 0
    ];

    const yScale = d3.scaleLinear()
        .domain(yDomain[0] === yDomain[1] ? [yDomain[0], yDomain[0] + 1] : yDomain)
        .nice()
        .range([innerHeight, 0]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(series.map(s => s.id));

    chartDataStore[chartId] = {
        sourceUrl,
        rawRows: baseData.map(row => ({ ...row })),
        data: baseData,
        series,
        fullXScale: typeof xScale.copy === "function" ? xScale.copy() : xScale,
        fullYScale: typeof yScale.copy === "function" ? yScale.copy() : yScale,
        colorScale: typeof colorScale.copy === "function" ? colorScale.copy() : colorScale,
        xField,
        yField,
        colorField,
        isTemporal,
        xTimeUnit
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

    const svgNode = svg.node();
    if (svgNode) {
        svgNode.__chartInfo = chartDataStore[chartId];
    }

    storeAxisDomain(svgNode, 'y', yScale.domain());

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale));

    g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale));

    const lineGen = d3.line()
        .x(row => isTemporal ? xScale(row.__parsedX) : xScale(String(row[xField])))
        .y(row => yScale(Number(row[yField])));

    g.selectAll("path.series-line")
        .data(series, s => s.id)
        .join("path")
        .attr("class", s => `series-line series-${String(s.id).replace(/\s+/g, '-')}`)
        .attr("data-series", s => s.id)
        .attr("fill", "none")
        .attr("stroke", s => colorScale(s.id))
        .attr("stroke-width", 2)
        .attr("opacity", 1)
        .attr("d", s => lineGen(s.values));

    const pointKey = (row) => {
        const category = String(row[xField]);
        const seriesKey = toSeriesKey(row[colorField]);
        return `${category}|${seriesKey}`;
    };

    g.selectAll("circle.datapoint")
        .data(baseData, pointKey)
        .join(
            enter => enter.append("circle")
                .attr("class", "datapoint")
                .attr("cx", row => isTemporal ? xScale(row.__parsedX) : xScale(String(row[xField])))
                .attr("cy", row => yScale(Number(row[yField])))
                .attr("r", 3.5)
                .attr("fill", row => colorScale(toSeriesKey(row[colorField])))
                .attr("opacity", 0)
                .attr("data-id", row => String(row[xField]))
                .attr("data-value", row => row[yField])
                .attr("data-series", row => toSeriesKey(row[colorField])),
            update => update
                .attr("cx", row => isTemporal ? xScale(row.__parsedX) : xScale(String(row[xField])))
                .attr("cy", row => yScale(Number(row[yField])))
                .attr("fill", row => colorScale(toSeriesKey(row[colorField])))
                .attr("opacity", 0)
                .attr("data-id", row => String(row[xField]))
                .attr("data-value", row => row[yField])
                .attr("data-series", row => toSeriesKey(row[colorField])),
            exit => exit.remove()
        );

    const legend = g.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${innerWidth + 20}, 0)`);

    series.forEach((s, idx) => {
        const legendRow = legend.append("g").attr("transform", `translate(0, ${idx * 20})`);
        legendRow.append("rect")
            .attr("width", 15)
            .attr("height", 15)
            .attr("fill", colorScale(s.id));
        legendRow.append("text")
            .attr("x", 20)
            .attr("y", 12)
            .style("font-size", "12px")
            .text(s.key);
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
