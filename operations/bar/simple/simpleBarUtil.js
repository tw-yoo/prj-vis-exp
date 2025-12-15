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
    simpleBarLagDiff,
    simpleBarNth,
    simpleBarRetrieveValue,
    simpleBarSort,
    simpleBarSum
} from "./simpleBarFunctions.js";
import {
    addChartOpsText,
    buildSimpleBarSpec,
    convertToDatumValues,
    dataCache, ensureXAxisLabelClearance, lastCategory, lastMeasure,
    renderChart,
    stackChartToTempTable
} from "../../../util/util.js";
import { addChildDiv, clearDivChildren, updateOpCaption, attachOpNavigator, updateNavigatorStates, runOpsSequence, shrinkSvgViewBox } from "../../operationUtil.js";
import { ensurePercentDiffAggregate, buildCompareDatasetFromCache } from "../../common/lastStageHelpers.js";
import { renderChartWithFade } from "../common/chartRenderUtils.js";
import { normalizeCachedData } from "../common/datumCacheHelpers.js";
import { storeAxisDomain } from "../../common/scaleHelpers.js";
import { resetRuntimeResults, storeRuntimeResult, makeRuntimeKey } from "../../runtimeResultStore.js";
import { clearAnnotations } from "../../common/annotations.js";
import { makeGetSvgAndSetup } from "../../common/chartContext.js";
import { delay as commonDelay } from "../../common/events.js";

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
    [OperationType.LAG_DIFF]:       simpleBarLagDiff,
    [OperationType.NTH]:            simpleBarNth,
    [OperationType.COUNT]:          simpleBarCount,
};

const chartDataStore = {};

const clearAllAnnotations = clearAnnotations;

const SORT_OP_FNS = {
    sum: (values) => d3.sum(values),
    mean: (values) => d3.mean(values),
    average: (values) => d3.mean(values),
    avg: (values) => d3.mean(values),
    median: (values) => d3.median(values),
    min: (values) => d3.min(values),
    max: (values) => d3.max(values),
    count: (_values, rows) => rows.length,
    valid: (_values, rows) => rows.length
};

function aggregateForSort(rows, sortField, op = 'sum') {
    const normalizedOp = typeof op === 'string' ? op.toLowerCase() : 'sum';
    const fn = SORT_OP_FNS[normalizedOp] || SORT_OP_FNS.sum;
    if (normalizedOp === 'count' || normalizedOp === 'valid' || !sortField) {
        const countResult = fn([], rows);
        return Number.isFinite(countResult) ? countResult : rows.length;
    }
    const numericValues = rows
        .map(d => Number(d[sortField]))
        .filter(Number.isFinite);
    if (numericValues.length === 0) return 0;
    const result = fn(numericValues, rows);
    return Number.isFinite(result) ? result : 0;
}

function resolveCategoricalDomain(data, xField, sortSpec) {
    const fallbackDomain = Array.from(new Set(data.map(d => d[xField])));
    if (!sortSpec) return fallbackDomain;

    if (Array.isArray(sortSpec)) {
        return sortSpec.slice();
    }

    if (typeof sortSpec === 'string') {
        const unique = Array.from(new Set(fallbackDomain));
        if (sortSpec === 'ascending') {
            return unique.sort((a, b) => d3.ascending(String(a), String(b)));
        }
        if (sortSpec === 'descending') {
            return unique.sort((a, b) => d3.descending(String(a), String(b)));
        }
        return unique;
    }

    if (typeof sortSpec === 'object') {
        const { field: sortField, op = 'sum', order = 'ascending' } = sortSpec;
        const grouped = new Map();
        data.forEach(d => {
            const key = d[xField];
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(d);
        });
        const entries = Array.from(grouped.entries()).map(([key, rows]) => ({
            key,
            value: aggregateForSort(rows, sortField, op)
        }));
        const direction = String(order).toLowerCase() === 'descending' ? -1 : 1;
        entries.sort((a, b) => {
            const diff = (a.value ?? 0) - (b.value ?? 0);
            if (Number.isFinite(diff) && diff !== 0) {
                return diff * direction;
            }
            return d3.ascending(String(a.key), String(b.key));
        });
        return entries.map(entry => entry.key);
    }

    return fallbackDomain;
}
const getSvgAndSetup = makeGetSvgAndSetup({ preferPlotArea: true, defaultOrientation: "vertical" });



const delay = commonDelay;

// Wait for a few animation frames to allow DOM/layout/transition to settle
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function waitFrames(n = 2) {
  for (let i = 0; i < n; i++) await nextFrame();
}

async function applySimpleBarOperation(chartId, operation, currentData, isLast = false) {
    const fn = SIMPLE_BAR_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData, isLast);
}

export async function executeSimpleBarOpsList(chartId, opsList, initialData, isLast = false, delayMs = 0, opKey = null) {
    const list = Array.isArray(opsList) ? opsList : [];
    resetRuntimeResults();
    let workingData = initialData;
    let lastResult = initialData;
    const pauseMs = delayMs > 0 ? delayMs : 1500;

    for (let i = 0; i < list.length; i++) {
        const operation = list[i];
        const inputData = workingData;
        const result = await applySimpleBarOperation(chartId, operation, inputData, isLast);
        lastResult = result;

        const stepKey = makeRuntimeKey(opKey, i);
        storeRuntimeResult(stepKey, result);

        const shouldPreserveInput = !!(result && result.__keepInput);
        if (!shouldPreserveInput) {
            if (Array.isArray(result)) {
                workingData = result;
            } else if (result instanceof IntervalValue || result instanceof BoolValue || result instanceof ScalarValue || result == null) {
                // keep workingData as-is for scalar/bool/interval or null results
            } else {
                workingData = result;
            }
        }

        if (pauseMs > 0) {
            await delay(pauseMs);
        }
    }
    return lastResult;
}


/**
 * 차트 리셋
 */
async function fullChartReset(chartId) {
    // console.log("fullChartReset");
    const { svg, g } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const resetPromises = [];
    g.selectAll("rect").each(function() {
        const rect = d3.select(this);
        const t = rect.transition().duration(400)
            .attr("fill", "#69b3a2")
            .attr("opacity", 1)
            .attr("stroke", "none")
            .end();
        resetPromises.push(t);
    });
    await Promise.all(resetPromises);
}

export async function runSimpleBarOps(chartId, vlSpec, opsSpec, textSpec = {}) {
ensurePercentDiffAggregate(opsSpec, textSpec);
await renderSimpleBarChart(chartId, vlSpec);
    const raw = chartDataStore[chartId] || [];

    const { orientation, xField, yField } = getSvgAndSetup(chartId);
    const baseDatumValues = convertToDatumValues(raw, xField, yField, orientation);
    const ORIGINAL_DATA = baseDatumValues.slice();

    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    await runOpsSequence({
        chartId,
        opsSpec,
        textSpec,
        onReset: async (ctx = {}) => {
            const forceInitial = ctx?.forceInitialReset === true;
            if (ctx?.stepIndex === 0 && !forceInitial) {
                return;
            }
            if (ctx?.isLast && !forceInitial) {
                // Skip restoring the original chart when transitioning to `last`.
                return;
            }
            await renderSimpleBarChart(chartId, vlSpec);
        },
        onRunOpsList: async (opsList, isLast, opKey) => {
            const { orientation, xField, yField } = getSvgAndSetup(chartId);
            const fullData = [...chartDataStore[chartId]];
            const baseDatumValues = await convertToDatumValues(fullData, xField, yField, orientation);

            if (isLast) {
                const allCachedResults = Object.values(dataCache).flat().filter(Boolean);
                if (allCachedResults.length === 0) {
                    console.warn('last stage: no cached data');
                    return [];
                }

                const fallbackCategory = xField ?? lastCategory ?? 'category';
                const fallbackMeasure = yField ?? lastMeasure ?? 'value';
                const prepared = buildCompareDatasetFromCache(allCachedResults, fallbackCategory, fallbackMeasure);
                if (!prepared) {
                    console.warn('last stage: no DatumValue results to visualize');
                    return [];
                }

                const { compareData, specOpts } = prepared;
                const compareSpec = buildSimpleBarSpec(compareData, specOpts);
                await renderChartWithFade(chartId, compareSpec, 450);
                ensureXAxisLabelClearance(chartId, { attempts: 6, minGap: 14, maxShift: 140 });

                return await executeSimpleBarOpsList(chartId, opsList, compareData, true, 0, opKey);
            }

            return await executeSimpleBarOpsList(chartId, opsList, baseDatumValues, false, 0, opKey);
        },
        onCache: (opKey, currentData) => {
            if (currentData instanceof IntervalValue || currentData instanceof BoolValue || currentData instanceof ScalarValue) {
                dataCache[opKey] = [currentData];
                return;
            }
            const fallbackCategory = xField ?? lastCategory ?? 'category';
            const fallbackMeasure = yField ?? lastMeasure ?? 'value';
            dataCache[opKey] = normalizeCachedData(currentData, opKey, fallbackCategory, fallbackMeasure);
        },
        isLastKey: (k) => k === 'last',
        delayMs: 0,
        navOpts: { x: 15, y: 15 }
    });

    // Allow any trailing transitions/layout to flush, then signal completion
    await waitFrames(2);
    await delay(50);
    document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId } }));
    return { ok: true };
}

export async function renderSimpleBarChart(chartId, spec) {
    const yField = spec.encoding.y.field;
    const xField = spec.encoding.x.field;
    const xType = spec.encoding.x.type;
    const yType = spec.encoding.y.type;
    const isHorizontal = xType === 'quantitative' && yType !== 'quantitative';
    const axisLabelsMeta = spec?.meta?.axisLabels ?? {};
    const normalizeOptionalLabel = (value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const str = String(value).trim();
        return str.length > 0 ? str : null;
    };
    const xAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.x);
    const yAxisLabelOverride = normalizeOptionalLabel(axisLabelsMeta.y);
    const resolvedXAxisLabel = xAxisLabelOverride === undefined ? xField : xAxisLabelOverride;
    const resolvedYAxisLabel = yAxisLabelOverride === undefined ? yField : yAxisLabelOverride;

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

    const margin = {top: 60, right: 20, bottom: 80, left: 60}; // top 마진 증가
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

    const xSortSpec = spec?.encoding?.x?.sort;
    const sortAttrValue = (() => {
        if (!xSortSpec) return null;
        if (Array.isArray(xSortSpec)) return xSortSpec.join(',');
        if (typeof xSortSpec === 'string') return xSortSpec;
        try {
            return JSON.stringify(xSortSpec);
        } catch (_) {
            return null;
        }
    })();
    svg.attr("data-x-sort-order", sortAttrValue);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    if (isHorizontal) {
        const xValues = data.map(d => d[xField]).filter(Number.isFinite);
        const minX = d3.min(xValues);
        const maxX = d3.max(xValues);
        let domainMin = Math.min(0, Number.isFinite(minX) ? minX : 0);
        let domainMax = Math.max(0, Number.isFinite(maxX) ? maxX : 0);
        if (domainMin === domainMax) domainMax = domainMin + 1;

        const xScale = d3.scaleLinear()
            .domain([domainMin, domainMax]).nice()
            .range([0, plotW]);
        const zeroX = xScale(0);
        const yScale = d3.scaleBand()
            .domain(data.map(d => d[yField]))
            .range([0, plotH])
            .padding(0.2);
        storeAxisDomain(svg.node(), 'x', xScale.domain());

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
            .attr("class", "main-bar")
            .attr("x", d => (d[xField] >= 0 ? zeroX : xScale(d[xField])))
            .attr("y", d => yScale(d[yField]))
            .attr("width", d => Math.abs(xScale(d[xField]) - zeroX))
            .attr("height", yScale.bandwidth())
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d.id ?? d[yField])
            .attr("data-target", d => d[yField])
            .attr("data-value", d => d[xField]);
    } else {
        const xDomain = resolveCategoricalDomain(data, xField, xSortSpec);
        const xScale = d3.scaleBand()
            .domain(xDomain)
            .range([0, plotW])
            .padding(0.2);
        const yValues = data.map(d => d[yField]).filter(Number.isFinite);
        const minY = d3.min(yValues);
        const maxY = d3.max(yValues);
        let domainMin = Math.min(0, Number.isFinite(minY) ? minY : 0);
        let domainMax = Math.max(0, Number.isFinite(maxY) ? maxY : 0);
        if (domainMin === domainMax) domainMax = domainMin + 1;

        const yScale = d3.scaleLinear()
            .domain([domainMin, domainMax]).nice()
            .range([plotH, 0]);
        const zeroY = yScale(0);
        storeAxisDomain(svg.node(), 'y', yScale.domain());

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
            .attr("class", "main-bar")
            .attr("x", d => xScale(d[xField]))
            .attr("width", xScale.bandwidth())
            .attr("y", d => (d[yField] >= 0 ? yScale(d[yField]) : zeroY))
            .attr("height", d => Math.abs(yScale(d[yField]) - zeroY))
            .attr("fill", "#69b3a2")
            .attr("data-id", d => d.id ?? d[xField])
            .attr("data-target", d => d[xField])
            .attr("data-value", d => d[yField]);
    }

    if (resolvedXAxisLabel) {
        svg.append("text")
            .attr("class", "x-axis-label")
            .attr("x", margin.left + plotW / 2)
            .attr("y", height - margin.bottom + 40)
            .attr("text-anchor", "middle")
            .attr("font-size", 14)
            .text(resolvedXAxisLabel);
    }

    if (resolvedYAxisLabel) {
        svg.append("text")
            .attr("class", "y-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -(margin.top + plotH / 2))
            .attr("y", margin.left - 45)
            .attr("text-anchor", "middle")
            .attr("font-size", 14)
            .text(resolvedYAxisLabel);
    }

    if (typeof window !== 'undefined') {
        const svgNode = svg.node();
        if (svgNode) {
            const xLabelNode = svgNode.querySelector('.x-axis-label');
            const xAxisNode = svgNode.querySelector('.x-axis');
            if (xLabelNode && xAxisNode && typeof xAxisNode.getBoundingClientRect === 'function') {
                const axisRect = xAxisNode.getBoundingClientRect();
                const labelRect = xLabelNode.getBoundingClientRect();
                if (axisRect && labelRect && Number.isFinite(axisRect.bottom) && Number.isFinite(labelRect.top)) {
                    const desiredTop = axisRect.bottom + 16;
                    if (labelRect.top < desiredTop) {
                        const deltaPx = desiredTop - labelRect.top;
                        const viewBox = svgNode.viewBox && svgNode.viewBox.baseVal;
                        const svgRect = svgNode.getBoundingClientRect();
                        let scaleY = 1;
                        if (viewBox && Number.isFinite(viewBox.height) && svgRect && Number.isFinite(svgRect.height) && svgRect.height > 0) {
                            scaleY = viewBox.height / svgRect.height;
                        }
                        const currentY = parseFloat(xLabelNode.getAttribute('y') || '0');
                        if (Number.isFinite(currentY) && deltaPx > 0) {
                            xLabelNode.setAttribute('y', String(currentY + deltaPx * scaleY));
                        }
                    }
                }
            }

            const yLabelNode = svgNode.querySelector('.y-axis-label');
            const yAxisNode = svgNode.querySelector('.y-axis');
            if (yLabelNode && yAxisNode && typeof yAxisNode.getBoundingClientRect === 'function') {
                const axisRect = yAxisNode.getBoundingClientRect();
                const labelRect = yLabelNode.getBoundingClientRect();
                if (axisRect && labelRect && Number.isFinite(axisRect.left) && Number.isFinite(labelRect.right)) {
                    const desiredRight = axisRect.left - 16;
                    if (labelRect.right > desiredRight) {
                        const deltaPx = labelRect.right - desiredRight;
                        const viewBox = svgNode.viewBox && svgNode.viewBox.baseVal;
                        const svgRect = svgNode.getBoundingClientRect();
                        let scaleX = 1;
                        if (viewBox && Number.isFinite(viewBox.width) && svgRect && Number.isFinite(svgRect.width) && svgRect.width > 0) {
                            scaleX = viewBox.width / svgRect.width;
                        }
                        const currentY = parseFloat(yLabelNode.getAttribute('y') || '0');
                        if (Number.isFinite(currentY) && deltaPx > 0) {
                            yLabelNode.setAttribute('y', String(currentY - deltaPx * scaleX));
                        }
                    }
                }
            }
        }
    }

    shrinkSvgViewBox(svg, 6);
}
