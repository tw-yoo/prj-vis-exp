import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, buildSimpleBarSpec, ensureXAxisLabelClearance} from "../../../util/util.js";
import {
    clearAllAnnotations,
    delay,
    groupedBarAverage,
    groupedBarCompare, groupedBarCompareBool, groupedBarCount,
    groupedBarDetermineRange, groupedBarDiff,
    groupedBarFilter,
    groupedBarFindExtremum, groupedBarLagDiff, groupedBarNth,
    groupedBarRetrieveValue, groupedBarSort, groupedBarSum
} from "./groupedBarFunctions.js";
import { DatumValue, IntervalValue, BoolValue, ScalarValue } from "../../../object/valueType.js";
import { runOpsSequence, shrinkSvgViewBox } from "../../operationUtil.js";
import { ensurePercentDiffAggregate, buildCompareDatasetFromCache } from "../../common/lastStageHelpers.js";
import { renderChartWithFade } from "../common/chartRenderUtils.js";
import { normalizeCachedData } from "../common/datumCacheHelpers.js";
import { storeAxisDomain } from "../../common/scaleHelpers.js";
import { resetRuntimeResults, storeRuntimeResult, makeRuntimeKey } from "../../runtimeResultStore.js";

// Wait for a few animation frames to allow DOM/layout/transition to settle
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function waitFrames(n = 2) {
  for (let i = 0; i < n; i++) await nextFrame();
}

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
    [OperationType.LAG_DIFF]:       groupedBarLagDiff,
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

async function executeGroupedBarOpsList(chartId, opsList, currentData, isLast = false, delayMs = 0, opKey = null)  {
    const list = Array.isArray(opsList) ? opsList : [];
    resetRuntimeResults();
    let workingData = currentData;
    let lastResult = currentData;

    for (let i = 0; i < list.length; i++) {
        const operation = list[i];
        const result = await applyGroupedBarOperation(chartId, operation, workingData, isLast);
        lastResult = result;

        const stepKey = makeRuntimeKey(opKey, i);
        storeRuntimeResult(stepKey, result);

        const preserveInput = !!(result && result.__keepInput);
        if (!preserveInput) {
            if (Array.isArray(result)) {
                workingData = result;
            } else if (result instanceof IntervalValue || result instanceof BoolValue || result instanceof ScalarValue || result == null) {
                // keep workingData as-is
            } else {
                workingData = result;
            }
        }

        if (delayMs > 0) {
            await delay(delayMs);
        }
    }
    return lastResult;
}


async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;

    clearAllAnnotations(svg);

    const resetPromises = [];
    svg.selectAll("rect[data-id]").each(function() {
        const rect = d3.select(this);
        const t = rect.transition().duration(400)
            .attr("opacity", 1)
            .attr("stroke", "none")
            .end();
        resetPromises.push(t);
    });
    await Promise.all(resetPromises);
}

async function resetGroupedBarChart(chartId, vlSpec, ctx = {}) {
    const forceInitial = ctx?.forceInitialReset === true;
    if (ctx?.stepIndex === 0 && !forceInitial) {
        return;
    }
    if (ctx?.isLast && !forceInitial) {
        return;
    }
    const info = chartDataStore[chartId];
    const specForReset = info?.spec ?? vlSpec;
    if (specForReset) {
        await renderGroupedBarChart(chartId, specForReset);
        await waitFrames(2);
    } else {
        await fullChartReset(chartId);
    }
}

export async function runGroupedBarOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    ensurePercentDiffAggregate(opsSpec, textSpec);
    const svg = d3.select(`#${chartId}`).select("svg");
    const chartInfo = chartDataStore[chartId];

    if (!chartInfo || !chartInfo.spec) {
        console.error("Chart info/spec not found. Please render the chart first via renderGroupedBarChart(...).");
        document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId, error: 'no-spec' } }));
        return { ok: false };
    }

    if (svg.empty() || svg.select(".plot-area").empty()) {
        await renderGroupedBarChart(chartId, chartInfo.spec);
    }

    const fullData = chartInfo.data;
    const { datumValues, categoryLabel, measureLabel } = toGroupedDatumValues(fullData, vlSpec);

    // reset cache
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    await runOpsSequence({
        chartId,
        opsSpec,
        textSpec,
        onReset: async (ctx = {}) => { await resetGroupedBarChart(chartId, vlSpec, ctx); },
        onRunOpsList: async (opsList, isLast, opKey) => {
            if (isLast) {
                const cached = Object.values(dataCache).flat().filter(Boolean);
                if (cached.length === 0) {
                    console.warn('groupedBar last stage: no cached data');
                    return [];
                }

                const fallbackCategory = lastCategory ?? categoryLabel ?? 'category';
                const fallbackMeasure = lastMeasure ?? measureLabel ?? 'value';
                const prepared = buildCompareDatasetFromCache(cached, fallbackCategory, fallbackMeasure);
                if (!prepared) {
                    console.warn('groupedBar last stage: no DatumValue results to visualize');
                    return [];
                }

                const { compareData, specOpts } = prepared;
                const simpleSpec = buildSimpleBarSpec(compareData, specOpts);
                await renderChartWithFade(chartId, simpleSpec, 450);
                ensureXAxisLabelClearance(chartId, { attempts: 6, minGap: 14, maxShift: 140 });
                return await executeGroupedBarOpsList(chartId, opsList, compareData, true, 0, opKey);
            }

            const base = datumValues.slice();
            return await executeGroupedBarOpsList(chartId, opsList, base, false, 0, opKey);
        },
        onCache: (opKey, currentData) => {
            if (currentData instanceof IntervalValue || currentData instanceof BoolValue || currentData instanceof ScalarValue) {
                dataCache[opKey] = [currentData];
                return;
            }
            const fallbackCategory = categoryLabel ?? lastCategory ?? 'category';
            const fallbackMeasure = measureLabel ?? lastMeasure ?? 'value';
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

export async function renderGroupedBarChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

  const margin = { top: 80, right: 120, bottom: 60, left: 80 };
  const width = 900 - margin.left - margin.right;
  const height = 600; // 🔥 수정: SVG 높이를 400에서 600으로 늘림
  const plotH = 400 - margin.top - margin.bottom; // 플롯 영역 높이는 유지

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
        .attr("viewBox", [0, 0, width + margin.left + margin.right, height]) // 🔥 수정: 높이 변수 적용
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-facet-field", facetField)
        .attr("data-color-field", colorField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", width)
        .attr("data-plot-h", plotH);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const facets = Array.from(new Set(data.map(d => d[facetField])));
    const xDomain = Array.from(new Set(data.map(d => d[xField])));

    const x0 = d3.scaleBand().domain(facets).range([0, width]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(xDomain).range([0, x0.bandwidth()]).padding(0.05);
    const yMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plotH, 0]);
    storeAxisDomain(svg.node(), 'y', yScale.domain());

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
            .attr("height", d => plotH - yScale(d[yField]))
            .attr("fill", d => colorScale(d[colorField]))
            .datum((d, idx) => ({
                facet: d[facetField],
                key: d[xField],
                group: d[colorField],
                value: d[yField],
                id: `${d[facetField]}-${d[xField]}-${idx}`
            }))
            .attr("data-id", d => d.id)
            .attr("data-target", d => d.facet)
            .attr("data-group", d => d.key)
            .attr("data-value", d => d.value);
    });

    g.append("g")
        .attr("class", "x-axis x-axis-bottom-line")
        .attr("transform", `translate(0,${plotH})`)
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

    const xLabel = (column.axis && column.axis.title) || facetField || 'category';
    const yLabel = (y.axis && y.axis.title) || yField || 'value';

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + width / 2)
        .attr("y", margin.top + plotH + 50)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(xLabel);

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + plotH / 2))
        .attr("y", margin.left - 45)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(yLabel);

    shrinkSvgViewBox(svg, 6);
}

export function toGroupedDatumValues(rawData, spec) {
    const enc = spec?.encoding || {};
    const xEnc = enc.x || {};
    const yEnc = enc.y || {};
    const colorEnc = enc.color || {};
    const colEnc = enc.column || {};
    const rowEnc = enc.row || {};

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
  const valueField = isXQuant ? xField : yField;
  const numericEnc = isXQuant ? xEnc : yEnc;
  const measureLabel = (numericEnc.axis && numericEnc.axis.title) || (numericEnc.aggregate || numericEnc.field || 'value');

  const facetLabel = (colEnc.axis && colEnc.axis.title) || (rowEnc.axis && rowEnc.axis.title) || (facetField || 'category');

  let subgroupField = colorField || (isXQuant ? null : xField);
  if (!subgroupField) subgroupField = colorField || xField || null;

  const toNum = v => { const n = +v; return Number.isFinite(n) ? n : 0; };

  const facets = facetField ? Array.from(new Set(rawData.map(d => d[facetField]))) : [null];
  const subgroups = subgroupField ? Array.from(new Set(rawData.map(d => d[subgroupField]))) : [null];

  function aggregateFor(facetVal, subgroupVal) {
    const rows = rawData.filter(r =>
      (facetField ? r[facetField] === facetVal : true) &&
      (subgroupField ? r[subgroupField] === subgroupVal : true)
    );

    if (yAgg === 'count' || xAgg === 'count' || !valueField) return rows.length;

    const vals = valueField ? rows.map(r => toNum(r[valueField])) : [];
    if (xAgg === 'mean' || yAgg === 'mean') return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
    if (xAgg === 'min'  || yAgg === 'min')  return vals.length ? Math.min(...vals) : 0;
    if (xAgg === 'max'  || yAgg === 'max')  return vals.length ? Math.max(...vals) : 0;
    return vals.reduce((a,b)=>a+b,0);
  }

    const rows = [];
    const datumValues = [];

  subgroups.forEach(sg => {
    facets.forEach(fv => {
      const v = aggregateFor(fv, sg);
      const row = { [facetLabel]: fv, [measureLabel]: v, group: sg };
      rows.push(row);
      const id = `${fv ?? 'facet'}-${sg ?? 'group'}`;
      datumValues.push(new DatumValue(facetField || 'category', measureLabel, fv, sg, v, id));
    });
  });

    return { rows, datumValues, categoryLabel: facetLabel, measureLabel };
}
