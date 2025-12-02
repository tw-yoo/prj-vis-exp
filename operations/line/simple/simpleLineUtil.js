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
    simpleLineLagDiff,
    simpleLineFilter,
    simpleLineFindExtremum,
    simpleLineNth,
    simpleLineRetrieveValue, simpleLineSort,
    simpleLineSum
} from "./simpleLineFunctions.js";
import {OperationType} from "../../../object/operationType.js";
import {dataCache, lastCategory, lastMeasure, buildSimpleBarSpec} from "../../../util/util.js";
import {DatumValue} from "../../../object/valueType.js";
import { runOpsSequence, shrinkSvgViewBox } from "../../operationUtil.js";
import {renderSimpleBarChart, executeSimpleBarOpsList} from "../../bar/simple/simpleBarUtil.js";
import { ensurePercentDiffAggregate, buildCompareDatasetFromCache } from "../../common/lastStageHelpers.js";
import { storeAxisDomain } from "../../common/scaleHelpers.js";
import { resetRuntimeResults, storeRuntimeResult, makeRuntimeKey } from "../../runtimeResultStore.js";

/** 내부 사용: 라인 차트 데이터 저장 (renderSimpleLineChart에서 적재) */
const chartDataStore = {};

/** op → 핸들러 매핑 */
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
    [OperationType.LAG_DIFF]:       simpleLineLagDiff,
    [OperationType.NTH]:            simpleLineNth,
    [OperationType.COUNT]:          simpleLineCount,
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

async function fullChartReset(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
    if (!svg || svg.empty()) return;

    g.selectAll(".highlighted-line").remove();
    clearAllAnnotations(svg);

    const resetPromises = [];
    const mainLine = g.select("path.series-line");
    if (!mainLine.empty()) {
        resetPromises.push(
            mainLine.transition().duration(400)
                .attr("stroke", "steelblue")
                .attr("opacity", 1)
                .end()
        );
    }

    resetPromises.push(
        g.selectAll("circle.datapoint")
            .transition().duration(400)
            .attr("opacity", 0)
            .end()
    );

    await Promise.all(resetPromises);
}

async function resetSimpleLineChart(chartId, vlSpec, ctx = {}) {
    const forceInitial = ctx?.forceInitialReset === true;
    
    // 🔸 첫 단계(stepIndex === 0)에서는 리셋하지 않음
    if (ctx?.stepIndex === 0 && !forceInitial) {
        return;
    }
    
    const svg = d3.select(`#${chartId}`).select("svg");
    const hasSeries = !svg.empty() && !svg.select("path.series-line").empty();
    
    // 🔸 마지막 단계이거나 강제 리셋이 아니면 fullChartReset만 호출
    if (!ctx || !ctx.isLast || forceInitial) {
        await renderSimpleLineChart(chartId, vlSpec);
        await settleFrame();
    } else {
        await fullChartReset(chartId);
    }
}
// Ensure layout/paint settles between ops (fallbacks to a short delay if rAF is unavailable)
const settleFrame = () => (typeof requestAnimationFrame === 'function'
    ? new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
    : delay(50));

async function applySimpleLineOperation(chartId, operation, currentData, isLast = false) {
    const fn = SIMPLE_LINE_OP_HANDLERS[operation.op];
    if (!fn) {
        console.warn(`Unsupported operation: ${operation.op}`);
        return currentData;
    }
    // Some handlers may return a plain value; Promise.resolve normalizes to a Promise
    const next = await Promise.resolve(fn(chartId, operation, currentData, isLast));
    return (next === undefined ? currentData : next);
}

async function executeSimpleLineOpsList(chartId, opsList, currentData, opKey = null) {
    const list = Array.isArray(opsList) ? opsList : [];
    resetRuntimeResults();
    let workingData = currentData;
    let lastResult = currentData;

    for (let i = 0; i < list.length; i++) {
        const operation = list[i];
        const isLast = (i === list.length - 1);
        const result = await applySimpleLineOperation(chartId, operation, workingData, isLast);
        lastResult = result;

        const stepKey = makeRuntimeKey(opKey, i);
        storeRuntimeResult(stepKey, result);

        const preserveInput = !!(result && result.__keepInput);
        if (!preserveInput) {
            workingData = result;
        }

        await settleFrame();
    }
    return lastResult;
}

/** CSV 원본 → DatumValue[]로 정규화 (multiLineUtil과 동일한 철학) */
function simpleLineToDatumValues(rawData, spec) {
    const xEnc = spec.encoding?.x ?? {};
    const yEnc = spec.encoding?.y ?? {};
    const xField = xEnc.field;
    const yField = yEnc.field;

    const categoryLabel = (xEnc.axis && xEnc.axis.title) || xField || "x";
    const measureLabel  = (yEnc.axis && yEnc.axis.title) || yField || "y";

    const rows = [];
    const datumValues = [];

    (rawData || []).forEach((d, idx) => {
        const categoryVal = String(d[xField]);     // 예: "1994-01-01" (문자열 유지)
        const measureVal  = Number(d[yField]);     // 수치

        rows.push({
            [categoryLabel]: categoryVal,
            [measureLabel]: measureVal
        });

        datumValues.push(new DatumValue(
            xField,           // category key label
            yField,           // measure key label
            categoryVal,      // target (문자열)
            null,             // group (단일 라인이라 null)
            measureVal,       // value
            undefined
        ));
    });

    return { rows, datumValues, categoryLabel, measureLabel };
}

export async function runSimpleLineOps(chartId, vlSpec, opsSpec, textSpec = {}) {
    // 기본 차트 렌더 (D3 라인 차트)
    await renderSimpleLineChart(chartId, vlSpec);

    // 데이터 준비 (renderSimpleLineChart가 chartDataStore[chartId]에 원본 저장)
    const raw = chartDataStore[chartId] || [];
    const { datumValues, categoryLabel, measureLabel } = simpleLineToDatumValues(raw, vlSpec);

    ensurePercentDiffAggregate(opsSpec, textSpec);

    // reset cache
    Object.keys(dataCache).forEach(key => delete dataCache[key]);

    // // 🔍 디버깅 로그 추가
    // console.log('=== DEBUG textSpec ===');
    // console.log('textSpec:', textSpec);
    // console.log('textSpec.text:', textSpec.text);
    // console.log('opsSpec keys:', Object.keys(opsSpec));
    // console.log('======================');

    await runOpsSequence({
        chartId,
        opsSpec,
        textSpec,
        onReset: async (ctx = {}) => { await resetSimpleLineChart(chartId, vlSpec, ctx); },
        onRunOpsList: async (opsList, isLast, opKey) => {
            const cachedDatums = Object.values(dataCache).flat().filter(Boolean);
            if (isLast) {
                if (cachedDatums.length === 0) {
                    console.warn('last stage: no cached data');
                    return [];
                }
                const fallbackCategory = lastCategory ?? categoryLabel ?? 'category';
                const fallbackMeasure = lastMeasure ?? measureLabel ?? 'value';
                const prepared = buildCompareDatasetFromCache(cachedDatums, fallbackCategory, fallbackMeasure);
                if (!prepared) {
                    console.warn('last stage: no DatumValue results to visualize');
                    return [];
                }
                const { compareData, specOpts } = prepared;
                const compareSpec = buildSimpleBarSpec(compareData, specOpts);
                await renderSimpleBarChart(chartId, compareSpec);
                return await executeSimpleBarOpsList(chartId, opsList, compareData, true, 0, opKey);
            }
            const base = datumValues.slice();
            return await executeSimpleLineOpsList(chartId, opsList, base, opKey);
        },
        onCache: (opKey, currentData) => {
            const arr = Array.isArray(currentData) ? currentData : (currentData != null ? [currentData] : []);
            const normalized = arr
                .filter(d => d != null)
                .map((d, idx) => coerceDatumValue(d, idx, categoryLabel, measureLabel, opKey));
            dataCache[opKey] = normalized;
        },
        isLastKey: (k) => k === 'last',
        delayMs: 0,
        navOpts: { x: 15, y: 15 }
    });
}
export async function renderSimpleLineChart(chartId, spec) {
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();

    const margin = { top: 80, right: 48, bottom: 48, left: 64 };
    const innerWidth = (spec?.width ?? 560);
    const innerHeight = (spec?.height ?? 320);
    const totalWidth = innerWidth + margin.left + margin.right;
    const totalHeight = innerHeight + margin.top + margin.bottom;

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const xType  = spec.encoding.x.type;
    

    const raw = await d3.csv(spec.data.url);

    const data = raw.map(d => {
        const o = { ...d };
        o[yField] = +o[yField];
        if (xType === 'temporal') {
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
        .attr("viewBox", [0, 0, totalWidth, totalHeight])
        .attr("data-x-field", xField)
        .attr("data-y-field", yField)
        .attr("data-m-left", margin.left)
        .attr("data-m-top", margin.top)
        .attr("data-plot-w", innerWidth)
        .attr("data-plot-h", innerHeight);

    const g = svg.append("g")
        .attr("class", "plot-area")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = (xType === 'temporal')
        ? d3.scaleTime().domain(d3.extent(data, d => new Date(d[xField]))).range([0, innerWidth])
        : (xType === 'quantitative'
            ? d3.scaleLinear().domain(d3.extent(data, d => d[xField])).nice().range([0, innerWidth])
            : d3.scalePoint().domain(data.map(d => String(d[xField]))).range([0, innerWidth]));

    // Y축 범위를 자동으로 여유 있게 잡되, 스펙에 명시된 도메인이 있으면 그대로 사용
    const yScaleSpec = spec?.encoding?.y?.scale || {};
    const hasExplicitDomain = Array.isArray(yScaleSpec.domain) && yScaleSpec.domain.length === 2
        && Number.isFinite(Number(yScaleSpec.domain[0])) && Number.isFinite(Number(yScaleSpec.domain[1]));

    const yValues = data.map(d => d[yField]);
    const yMin = d3.min(yValues);
    const yMax = d3.max(yValues);
    const safeYMin = Number.isFinite(yMin) ? yMin : 0;
    const safeYMax = Number.isFinite(yMax) ? yMax : 0;

    let domainMin;
    let domainMax;

    if (hasExplicitDomain) {
        domainMin = Number(yScaleSpec.domain[0]);
        domainMax = Number(yScaleSpec.domain[1]);
    } else {
        domainMin = safeYMin >= 0 ? safeYMin * 0.8 : safeYMin * 1.2;
        domainMax = safeYMax >= 0 ? safeYMax * 1.2 : safeYMax * 0.8;
    }

    if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) {
        domainMin = 0;
        domainMax = 100;
    }
    if (domainMin === domainMax) {
        domainMin = domainMin - 5;
        domainMax = domainMax + 5;
    }

    const yScale = d3.scaleLinear()
        .domain([domainMin, domainMax])
        .nice()
        .range([innerHeight, 0]);
    
    storeAxisDomain(svg.node(), 'y', yScale.domain());

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(xScale));
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
        .attr("opacity", 1)
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

    const xLabelY = margin.top + innerHeight + 40;
    svg.append("text").attr("class", "x-axis-label")
        .attr("x", margin.left + innerWidth / 2).attr("y", xLabelY)
        .attr("text-anchor", "middle").text(xField);
    svg.append("text").attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + innerHeight / 2)).attr("y", margin.left - 48)
        .attr("text-anchor", "middle").text(yField);

    shrinkSvgViewBox(svg, 12);
}
