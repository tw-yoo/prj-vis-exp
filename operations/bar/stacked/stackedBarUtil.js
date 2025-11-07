import {OperationType} from "../../../object/operationType.js";
import {
    buildSimpleBarSpec,
    dataCache,
    lastCategory,
    lastMeasure,
    renderChart
} from "../../../util/util.js";
import {
    getSvgAndSetup,
    clearAllAnnotations,
    delay,
    stackedBarAverage,
    stackedBarCompare, stackedBarCompareBool, stackedBarCount,
    stackedBarDetermineRange, stackedBarDiff,
    stackedBarFilter,
    stackedBarFindExtremum, stackedBarNth,
    stackedBarRetrieveValue, stackedBarSort, stackedBarSum
} from "./stackedBarFunctions.js";
import { DatumValue } from "../../../object/valueType.js";
import { runOpsSequence, shrinkSvgViewBox } from "../../operationUtil.js";

// --- settle helpers (match groupedBar pattern) ---
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function waitFrames(n = 2) { for (let i = 0; i < n; i++) await nextFrame(); }

const GROUPED_BAR_OP_HANDLES = {
    [OperationType.RETRIEVE_VALUE]: stackedBarRetrieveValue,
    [OperationType.FILTER]:         stackedBarFilter,
    [OperationType.FIND_EXTREMUM]:  stackedBarFindExtremum,
    [OperationType.DETERMINE_RANGE]:stackedBarDetermineRange,
    [OperationType.COMPARE]:        stackedBarCompare,
    [OperationType.COMPARE_BOOL]:   stackedBarCompareBool,
    [OperationType.SORT]:           stackedBarSort,
    [OperationType.SUM]:            stackedBarSum,
    [OperationType.AVERAGE]:        stackedBarAverage,
    [OperationType.DIFF]:           stackedBarDiff,
    [OperationType.NTH]:            stackedBarNth,
    [OperationType.COUNT]:          stackedBarCount,
}

const chartDataStore = {};

async function applyStackedBarOperation(chartId, operation, currentData, isLast = false)  {
    const fn = GROUPED_BAR_OP_HANDLES[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    return await fn(chartId, operation, currentData, isLast);
}

async function executeStackedBarOpsList(chartId, opsList, currentData, isLast = false, delayMs = 0)  {
    for (let i = 0; i < opsList.length; i++) {
        const operation = opsList[i];
        currentData = await applyStackedBarOperation(chartId, operation, currentData, isLast);

        if (delayMs > 0) {
            await delay(delayMs);
        }
    }
    return currentData;
}

async function fullChartReset(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return;

    const { colorField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const chartRects = svg.select(".plot-area").selectAll("rect");
    const originalData = chartDataStore[chartId]?.data || [];
    const subgroups = Array.from(new Set(originalData.map((d) => d[colorField])));
    const colorScale = colorField
        ? d3.scaleOrdinal(d3.schemeTableau10).domain(subgroups)
        : null;

    const resetPromises = [];
    chartRects.each(function () {
        const rect = d3.select(this);
        const d = rect.datum();
        if (d && (d.subgroup || d.seriesKey || d.group || d.key || d.target)) {
            const subgroup = d.subgroup ?? d.seriesKey ?? d.group ?? null;
            const fill = (colorScale && subgroup != null)
                ? colorScale(subgroup)
                : rect.attr('data-fill') || rect.attr('fill') || '#69b3a2';
            const t = rect
                .transition()
                .duration(400)
                .attr("opacity", 1)
                .attr("stroke", "none")
                .attr("fill", fill)
                .end();
            resetPromises.push(t);
        }
    });
    await Promise.all(resetPromises);
}

async function resetStackedBarChart(chartId, vlSpec, ctx = {}) {
    const forceInitial = ctx?.forceInitialReset === true;
    if (ctx?.stepIndex === 0 && !forceInitial) {
        return;
    }
    if (ctx?.isLast && !forceInitial) {
        return;
    }
    await renderStackedBarChart(chartId, vlSpec);
    await waitFrames(2);
}


/**
 * 차트 리셋
 */
export async function runStackedBarOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    const svg = d3.select(`#${chartId}`).select("svg");

    if (svg.empty() || svg.select(".plot-area").empty()) {
        if (!vlSpec) {
            console.error("Chart not found and vlSpec not provided.");
            // Signal completion anyway so upstream awaiters don't hang
            document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId, error: 'no-spec' } }));
            return { ok: false };
        }
        await renderStackedBarChart(chartId, vlSpec);
    }

    const fullData = chartDataStore[chartId].data;
    const { datumValues, categoryLabel, measureLabel } = toStackedDatumValues(fullData, vlSpec);

    // reset cache
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    await runOpsSequence({
        chartId,
        opsSpec,
        textSpec,
        onReset: async (ctx = {}) => { await resetStackedBarChart(chartId, vlSpec, ctx); },
        onRunOpsList: async (opsList, isLast) => {
            if (isLast) {
                const cachedValues = Object.values(dataCache).flat().filter(Boolean);
                const datumResults = cachedValues.filter(v => v instanceof DatumValue);
                if (datumResults.length === 0) {
                    console.warn('last stage: no DatumValue results to visualize');
                    return [];
                }

                const categories = new Set();
                const measures = new Set();
                const normalized = datumResults.map((datum, idx) => {
                    const categoryName = typeof datum.category === 'string' && datum.category.trim().length > 0
                        ? datum.category
                        : (categoryLabel ?? lastCategory ?? 'category');
                    const measureName = typeof datum.measure === 'string' && datum.measure.trim().length > 0
                        ? datum.measure
                        : (measureLabel ?? lastMeasure ?? 'value');
                    categories.add(categoryName);
                    measures.add(measureName);

                    const baseLabel = (() => {
                        if (datum.target != null) {
                            const t = String(datum.target).trim();
                            if (t.length > 0) return t;
                        }
                        return `Result ${idx + 1}`;
                    })();
                    const groupSuffix = datum.group != null ? ` · ${String(datum.group)}` : '';
                    const idHint = (typeof datum.id === 'string' && datum.id.includes('_'))
                        ? ` (${datum.id.split('_')[0]})`
                        : '';
                    const targetLabel = `${baseLabel}${groupSuffix}${idHint}`;

                    const id = datum.id ?? `last_${idx}`;
                    return new DatumValue(categoryName, measureName, targetLabel, datum.group ?? null, datum.value, id);
                });

                const axisLabelOverrides = {};
                if (categories.size !== 1) axisLabelOverrides.x = null;
                if (measures.size !== 1) axisLabelOverrides.y = null;

                const specOpts = {};
                if (Object.keys(axisLabelOverrides).length > 0) {
                    specOpts.axisLabels = axisLabelOverrides;
                }

                const chartSpec = buildSimpleBarSpec(normalized, specOpts);
                await renderChart(chartId, chartSpec);
                return await executeStackedBarOpsList(chartId, opsList, normalized, true, 0);
            }

            const base = datumValues.slice();
            return await executeStackedBarOpsList(chartId, opsList, base, false, 0);
        },
        onCache: (opKey, currentData) => {
            const arr = Array.isArray(currentData) ? currentData : (currentData != null ? [currentData] : []);
            arr.forEach((datum, idx) => {
                if (datum instanceof DatumValue) {
                    datum.id = `${opKey}_${idx}`;
                    const hasCategory = typeof datum.category === 'string' && datum.category.trim().length > 0;
                    const hasMeasure = typeof datum.measure === 'string' && datum.measure.trim().length > 0;
                    if (!hasCategory) {
                        datum.category = categoryLabel ?? lastCategory;
                    }
                    if (!hasMeasure) {
                        datum.measure = measureLabel ?? lastMeasure;
                    }
                }
            });
            dataCache[opKey] = arr;
        },
        isLastKey: (k) => k === 'last',
        delayMs: 0,
        navOpts: { x: 15, y: 15 }
    });

    // Settle any trailing transitions/layout and signal completion
    await waitFrames(2);
    await delay(50);
    document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId } }));
    return { ok: true };
}
export async function renderStackedBarChart(chartId, spec) {
    const host = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    // 1) Read spec
    const xField = spec.encoding.x.field || null;
    const yField = spec.encoding.y.field || null;
    const colorField = spec.encoding.color?.field || null;
    const xType = spec.encoding.x.type;
    const yType = spec.encoding.y.type;
    const xTimeUnit = spec.encoding.x.timeUnit || null;
    const yTimeUnit = spec.encoding.y.timeUnit || null;
    const xAggregate = spec.encoding.x.aggregate || null;
    const yAggregate = spec.encoding.y.aggregate || null;
    const aggregate = yAggregate || xAggregate; // e.g., 'count'

    // 2) Infer axes & orientation
    const isXQuant = xType === "quantitative";
    const valueField = isXQuant ? xField : yField;
    const categoryField = isXQuant ? yField : xField;
    const orientation = isXQuant ? "horizontal" : "vertical";

    // 3) Load data
    let data;
    if (spec.data && Array.isArray(spec.data.values)) {
        data = spec.data.values.map(d => ({ ...d }));
    } else if (spec.data && typeof spec.data.url === "string") {
        data = spec.data.url.endsWith(".json")
            ? await d3.json(spec.data.url)
            : await d3.csv(spec.data.url);
    } else {
        console.warn("renderStackedBarChart: spec.data.values or spec.data.url is required");
        data = [];
    }

    // 4) Coerce numeric for explicit quantitative field
    if (valueField && ((valueField === xField && xType === "quantitative") || (valueField === yField && yType === "quantitative"))) {
        data.forEach(d => { d[valueField] = +d[valueField]; });
    }
    
    // 5) timeUnitKey function definition (moved here for scope)
    function timeUnitKey(dateStr, tu) {
        if (!dateStr || !tu) return dateStr;
        const dt = new Date(dateStr);
        if (!(dt instanceof Date) || isNaN(dt)) return dateStr;
        switch(tu) {
            case "month": return dt.toLocaleString('default', { month: 'short' });
            case "year": return dt.getFullYear().toString();
            case "day": return dt.toISOString().split('T')[0];
            case "quarter": return `Q${Math.floor(dt.getMonth() / 3) + 1}`;
            default: return dateStr;
        }
    }

    // Handle timeUnit transformation
    const categoryTimeUnit = (categoryField === xField ? xTimeUnit : yTimeUnit) || null;
    data.forEach(d => {
        d.__cat = categoryTimeUnit ? timeUnitKey(d[categoryField], categoryTimeUnit) : d[categoryField];
    });

    // 6) Color scale
    const colorScaleSpec = spec.encoding.color?.scale;
    const subgroupsFromData = Array.from(new Set(data.map(d => d[colorField])));
    let subgroups = subgroupsFromData;
    let color;
    if (colorScaleSpec?.domain && colorScaleSpec?.range) {
        subgroups = colorScaleSpec.domain.slice();
        color = d3.scaleOrdinal().domain(subgroups).range(colorScaleSpec.range);
    } else {
        color = d3.scaleOrdinal(d3.schemeTableau10).domain(subgroups);
    }

    // 7) --- 수정된 부분: 데이터 원본 순서를 유지하며 카테고리(groups) 생성 ---
    const groups = [];
    const seenGroups = new Set();
    data.forEach(d => {
        if (!seenGroups.has(d.__cat)) {
            seenGroups.add(d.__cat);
            groups.push(d.__cat);
        }
    });

    // 8) Build stacked input rows
    const dataForStack = groups.map(group => {
        const values = data.filter(row => row.__cat === group);
        const obj = { [categoryField]: group };
        subgroups.forEach(sg => {
            let v = 0;
            if (aggregate === "count" || !valueField) {
                v = values.filter(vv => vv[colorField] === sg).length;
            } else if (aggregate === "sum" || !aggregate) {
                v = d3.sum(values.filter(vv => vv[colorField] === sg), vv => +vv[valueField]);
            } else {
                v = d3.sum(values.filter(vv => vv[colorField] === sg), vv => +vv[valueField]);
            }
            if (!Number.isFinite(v)) v = 0;
            obj[sg] = v;
        });
        return obj;
    });

    const stackedData = d3.stack().keys(subgroups)(dataForStack);

    // Cache for ops
    chartDataStore[chartId] = {data: data};

    // 9) Layout
    const margin = { top: 60, right: 140, bottom: 50, left: 60 };
    const width = 700;
    const height = 600; 
    const plotW = width - margin.left - margin.right;
    const plotH = 420 - margin.top - margin.bottom;

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

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 10) Scales/axes/rects
    if (orientation === "vertical") {
        const xScale = d3.scaleBand().domain(groups).range([0, plotW]).padding(0.1);
        let maxVal = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        if (!Number.isFinite(maxVal)) maxVal = d3.max(dataForStack, row => d3.sum(subgroups, k => +row[k] || 0)) || 0;
        const yScale = d3.scaleLinear().domain([0, maxVal]).nice().range([plotH, 0]);

        g.append("g").attr("class", "x-axis")
            .attr("transform", `translate(0,${plotH})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");
        g.append("g").attr("class", "y-axis")
            .call(d3.axisLeft(yScale));

        g.append("g")
            .selectAll("g")
            .data(stackedData)
            .join("g")
            .attr("fill", d => color(d.key))
            .attr("class", d => `series-${d.key}`)
            .selectAll("rect")
            .data(d => d.map(seg => ({ ...seg, seriesKey: d.key })))
            .join("rect")
            .attr("x", d => xScale(d.data[categoryField]))
            .attr("y", d => yScale(d[1]))
            .attr("height", d => yScale(d[0]) - yScale(d[1]))
            .attr("width", xScale.bandwidth())
            .datum(function (d) {
                return {
                    key: d.data[categoryField],
                    subgroup: d.seriesKey,
                    value: d.data[d.seriesKey] || 0,
                    y0: d[0],
                    y1: d[1],
                };
            })
            .attr("data-id", function () { return d3.select(this).datum().key; })
            .attr("data-value", function () { return d3.select(this).datum().value; });

    } else { // Horizontal
        const yScale = d3.scaleBand().domain(groups).range([0, plotH]).padding(0.1);
        let maxVal = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        if (!Number.isFinite(maxVal)) maxVal = d3.max(dataForStack, row => d3.sum(subgroups, k => +row[k] || 0)) || 0;
        const xScale = d3.scaleLinear().domain([0, maxVal]).nice().range([0, plotW]);

        g.append("g").attr("class", "x-axis")
            .attr("transform", `translate(0,${plotH})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");
        g.append("g").attr("class", "y-axis")
            .call(d3.axisLeft(yScale));

        g.append("g")
            .selectAll("g")
            .data(stackedData)
            .join("g")
            .attr("fill", d => color(d.key))
            .attr("class", d => `series-${d.key}`)
            .selectAll("rect")
            .data(d => d.map(seg => ({ ...seg, seriesKey: d.key })))
            .join("rect")
            .attr("y", d => yScale(d.data[categoryField]))
            .attr("x", d => xScale(d[0]))
            .attr("width", d => xScale(d[1]) - xScale(d[0]))
            .attr("height", yScale.bandwidth())
            .datum(function (d) {
                return {
                    key: d.data[categoryField],
                    subgroup: d.seriesKey,
                    value: d.data[d.seriesKey] || 0,
                    x0: d[0],
                    x1: d[1],
                };
            })
            .attr("data-id", function () { return d3.select(this).datum().key; })
            .attr("data-value", function () { return d3.select(this).datum().value; });
    }

    // 11) Axis labels
    const xLabel = (spec.encoding.x.axis && spec.encoding.x.axis.title) || (xTimeUnit ? `${xField || ""} (${xTimeUnit})` : (xField || ""));
    const yLabel = (spec.encoding.y.axis && spec.encoding.y.axis.title) || (aggregate || yField || "");

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + plotW / 2)
        .attr("y", margin.top + plotH + 40)
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

    // 12) Legend
    const legend = svg.append("g")
        .attr("transform", `translate(${width - margin.right + 10}, ${margin.top})`);

    subgroups.forEach((subgroup, i) => {
        const legendRow = legend.append("g")
            .attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect")
            .attr("width", 15)
            .attr("height", 15)
            .attr("fill", color(subgroup));
        legendRow.append("text")
            .attr("x", 20)
            .attr("y", 12)
            .attr("text-anchor", "start")
            .style("font-size", "12px")
            .text(subgroup);
    });

    shrinkSvgViewBox(svg, 6);
}

export function toStackedDatumValues(rawData, spec) {
    const enc = spec.encoding || {};
    const xEnc = enc.x || {};
    const yEnc = enc.y || {};
    const colorEnc = enc.color || {};

    const xField = xEnc.field || null;
    const yField = yEnc.field || null;
    const colorField = colorEnc.field || null;
    const xType = xEnc.type;
    const yType = yEnc.type;
    const xAgg = xEnc.aggregate || null;
    const yAgg = yEnc.aggregate || null;
    const xTimeUnit = xEnc.timeUnit || null;
    const yTimeUnit = yEnc.timeUnit || null;

    const isXQuant = xType === 'quantitative';
    const valueField = isXQuant ? xField : yField;
    const categoryField = isXQuant ? yField : xField;

    const numericEnc = isXQuant ? xEnc : yEnc;
    const categoryEnc = isXQuant ? yEnc : xEnc;
    const measureLabel = (numericEnc.axis && numericEnc.axis.title) || (numericEnc.aggregate || numericEnc.field || 'value');
    const categoryLabel = (categoryEnc.axis && categoryEnc.axis.title) || (categoryEnc.field || 'category');

    const categoryTimeUnit = (categoryField === xField ? xTimeUnit : yTimeUnit) || null;
    function timeUnitKey(v, tu) {
        if (!v || !tu) return v;
        const dt = new Date(v);
        if (isNaN(dt)) return v;
        switch(tu) {
            case 'month': return dt.toLocaleString('default', { month: 'short' });
            case 'year': return dt.getFullYear().toString();
            case 'day': return dt.toISOString().split('T')[0];
            case 'quarter': return `Q${Math.floor(dt.getMonth() / 3) + 1}`;
            default: return v;
        }
    }

    let subgroups;
    if (colorEnc.scale?.domain) subgroups = colorEnc.scale.domain.slice();
    else if (colorField) subgroups = Array.from(new Set(rawData.map(d => d[colorField])));
    else subgroups = [null];

    const withCat = rawData.map(d => ({ ...d, __cat: categoryTimeUnit ? timeUnitKey(d[categoryField], categoryTimeUnit) : d[categoryField] }));
    
    // --- 수정된 부분: 데이터 원본 순서 유지 ---
    const groups = [];
    const seenGroups = new Set();
    withCat.forEach(d => {
        if (!seenGroups.has(d.__cat)) {
            seenGroups.add(d.__cat);
            groups.push(d.__cat);
        }
    });

    function num(v) { const n = +v; return Number.isFinite(n) ? n : 0; }
    function aggFor(group, sg) {
        const rows = withCat.filter(r => r.__cat === group && (colorField ? r[colorField] === sg : true));
        if (yAgg === 'count' || xAgg === 'count' || !valueField) return rows.length;
        const vals = rows.map(r => num(r[valueField]));
        if (xAgg === 'sum' || yAgg === 'sum' || !xAgg && !yAgg) return vals.reduce((a,b)=>a+b,0);
        if (xAgg === 'mean' || yAgg === 'mean') return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
        if (xAgg === 'min' || yAgg === 'min') return vals.length ? Math.min(...vals) : 0;
        if (xAgg === 'max' || yAgg === 'max') return vals.length ? Math.max(...vals) : 0;
        return vals.reduce((a,b)=>a+b,0);
    }

    const rows = [];
    const datumValues = [];
    subgroups.forEach(sg => {
        groups.forEach(cat => {
            const v = aggFor(cat, sg);
            const row = { [categoryLabel]: cat, [measureLabel]: v, group: sg };
            rows.push(row);
            const id = `${String(cat)}__${String(sg)}`;
            datumValues.push(new DatumValue(categoryField, measureLabel, cat, sg, v, id));
        });
    });

    return { rows, datumValues, categoryLabel, measureLabel };
}
