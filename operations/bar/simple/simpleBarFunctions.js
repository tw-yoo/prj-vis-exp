import {DatumValue, IntervalValue} from "../../../object/valueType.js";
import {
    retrieveValue,
    filter as dataFilter,
    findExtremum as dataFindExtremum,
    sort as dataSort,
    sum as dataSum,
    average as dataAverage,
    diff as dataDiff,
    nth as dataNth,
    compare as dataCompare,
    compareBool as dataCompareBool,
    count as dataCount,
    lagDiff as dataLagDiff
} from "../../operationFunctions.js";
import { OP_COLORS } from "../../../object/colorPalette.js";
import { normalizeLagDiffResults } from "../../common/lagDiffHelpers.js";
import { makeGetSvgAndSetup } from "../../common/chartContext.js";
import { clearAnnotations } from "../../common/annotations.js";
import {
    getMarkValue as readMarkValue,
    getDatumKey,
    getMarkKey,
    selectMarks
} from "../../common/markAccessors.js";
import { signalOpDone, delay as commonDelay } from "../../common/events.js";

// 🔥 템플릿 임포트
import * as Helpers from '../../animationHelpers.js';
import { DURATIONS, OPACITIES } from '../../animationConfig.js';
import {
    highlightBarsByKeys,
    labelBars,
    drawValueGuideline,
    drawCenterGuideline,
    resetAnnotations,
    sortBars,
    drawDiffBridge,
    highlightFirstNBars,
    makeValueScaleFromData,
    dimBarsExcludingKeys,
    dimAllBars,
    selectBarsByKeys,
    addCenterValueLabel,
    runSumStackAnimation,
    renderLagDiffBars,
    drawLagDiffZeroLine,
    labelLagDiffBars,
    summarizeLagDiff
} from "./simpleBarActionPrimitives.js";

// ============= Helper functions =============
const selectAllMarks = (g) => selectMarks(g, 'rect');
const getBarKeyFromDatum = (d) => getDatumKey(d, '');
const getBarKeyFromNode = (node) => getMarkKey(node, '');
const getMarkValue = (node) => readMarkValue(node);

function markKeepInput(arr) {
    if (!Array.isArray(arr)) return arr;
    if (!Object.prototype.hasOwnProperty.call(arr, '__keepInput')) {
        Object.defineProperty(arr, '__keepInput', {
            value: true,
            enumerable: false,
            configurable: true
        });
    }
    return arr;
}

export const getSvgAndSetup = makeGetSvgAndSetup({ preferPlotArea: true, defaultOrientation: "vertical" });

export const clearAllAnnotations = clearAnnotations;

export function getCenter(bar, orientation, margins) {
    const x0 = +bar.getAttribute("x"), y0 = +bar.getAttribute("y"),
        w = +bar.getAttribute("width"), h = +bar.getAttribute("height");
    const valueAttr = Number(bar.getAttribute("data-value"));
    const isNegative = Number.isFinite(valueAttr) && valueAttr < 0;
    if (orientation === "horizontal") {
        if (isNegative) {
            return { x: x0 - 6 + margins.left, y: y0 + h / 2 + margins.top };
        }
        return { x: x0 + w + 6 + margins.left, y: y0 + h / 2 + margins.top };
    } else {
        if (isNegative) {
            return { x: x0 + w / 2 + margins.left, y: y0 + h + 14 + margins.top };
        }
        return { x: x0 + w / 2 + margins.left, y: y0 - 6 + margins.top };
    }
}

export const delay = commonDelay;

// ============= RETRIEVE VALUE (✅ 템플릿 적용) =============
export async function simpleBarRetrieveValue(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const selected = retrieveValue(data, op, isLast) || [];

    const keys = selected.map(d => isLast
        ? String(d?.id ?? d?.target ?? getBarKeyFromDatum(d))
        : getBarKeyFromDatum(d));

    const bars = await highlightBarsByKeys(ctx, { keys, color: OP_COLORS.RETRIEVE_VALUE });
    if (bars) {
        await labelBars(ctx, {
            bars,
            color: OP_COLORS.RETRIEVE_VALUE,
            textFn: (val) => val
        });
    } else {
        console.warn("RetrieveValue: target bar(s) not found for key(s):", op?.target);
    }

    signalOpDone(chartId, 'retrieveValue');

    if (isLast) {
        const first = selected[0];
        const lastResult = first ? [new DatumValue(first.category, first.measure, first.target, first.group, first.value, first.id)] : [];
        return markKeepInput(lastResult);
    }
    return markKeepInput(selected);
}

// ============= FILTER (✅ 템플릿 적용) =============
export async function simpleBarFilter(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    const { xField, yField } = ctx;
    resetAnnotations(ctx);

    const effectiveOp = { ...op };
    if (data.length > 0) {
        const sample = data[0];
        if (op.field === sample.measure) {
            effectiveOp.field = 'value';
        } else if (op.field === sample.category) {
            effectiveOp.field = 'target';
        }
    }

    const filteredData = dataFilter(data, effectiveOp, xField, yField, isLast);

    if (!filteredData || filteredData.length === 0) {
        await dimAllBars(ctx, { opacity: 0, duration: 300 });
        ctx.g.selectAll("rect").remove();
        signalOpDone(chartId, 'filter');
        return isLast
            ? [new DatumValue('filter', 'count', 'result', null, 0, 'last_filter')]
            : [];
    }

    const keptKeys = filteredData.map(d => String(d.target));
    await dimBarsExcludingKeys(ctx, { keys: keptKeys, opacity: 0.2, duration: 250 });

    const sampleDatum = data[0] || {};
    const measureFieldName = sampleDatum.measure || yField;
    const numericOps = new Set(['>','>=','<','<=','==','eq']);
    const isMeasureField = effectiveOp.field === 'value' || effectiveOp.field === yField || effectiveOp.field === measureFieldName;
    const isNumericMeasureFilter = numericOps.has(op.operator) && Number.isFinite(+op.value) && isMeasureField;

    if (isNumericMeasureFilter) {
        await drawValueGuideline(ctx, { data, value: +op.value, color: OP_COLORS.FILTER_THRESHOLD });
    }

    await highlightBarsByKeys(ctx, { keys: keptKeys, color: OP_COLORS.FILTER_KEEP });
    const keptBars = selectBarsByKeys(ctx, keptKeys);
    await labelBars(ctx, {
        bars: keptBars,
        color: "#111",
        textFn: (val) => val
    });

    signalOpDone(chartId, 'filter');
    return isLast
        ? [new DatumValue('filter', 'count', 'result', null, Array.isArray(filteredData) ? filteredData.length : 0, 'last_filter')]
        : (filteredData || []);
}

// ============= FIND EXTREMUM (✅ 템플릿 적용) =============
export async function simpleBarFindExtremum(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    const { xField, yField } = ctx;
    resetAnnotations(ctx);

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'findExtremum');
        return [];
    }
    
    const selected = dataFindExtremum(data, op, xField, yField, isLast);
    if (!selected) {
        signalOpDone(chartId, 'findExtremum');
        return [];
    }

    const key = String(selected.target);
    const bars = await highlightBarsByKeys(ctx, { keys: [key], color: OP_COLORS.EXTREMUM });
    if (bars) {
        await labelBars(ctx, {
            bars,
            color: OP_COLORS.EXTREMUM,
            textFn: (val) => `${op?.which === 'min' ? 'Min' : 'Max'}: ${val}`
        });
        await drawValueGuideline(ctx, { data, value: selected.value, color: OP_COLORS.EXTREMUM });
    } else {
        console.warn("FindExtremum: target bar not found for", key);
    }

    signalOpDone(chartId, 'findExtremum');
    
    if (isLast) {
        return [new DatumValue(selected.category, selected.measure, selected.target, selected.group, selected.value, selected.id)];
    }
    return [selected];
}

// ============= DETERMINE RANGE (✅ 템플릿 적용) =============
export async function simpleBarDetermineRange(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const { xField, yField, orientation } = ctx;

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'determineRange');
        return null;
    }

    const valueField = op.field || (orientation === 'vertical' ? yField : xField);
    const categoryAxisName = orientation === 'vertical' ? xField : yField;

    const values = data
        .map(d => {
            const raw = d.value !== undefined ? d.value : d[valueField];
            return Number(raw);
        })
        .filter(Number.isFinite);

    if (!values.length) {
        console.warn("DetermineRange: No valid data to determine range.");
        signalOpDone(chartId, 'determineRange');
        return null;
    }

    const minV = d3.min(values);
    const maxV = d3.max(values);
    const valueScale = makeValueScaleFromData(ctx, data);

    const isValue = (d, target) => {
        const v = d.value !== undefined ? d.value : d[valueField];
        return Number.isFinite(+v) && +v === target;
    };

    const minKeys = data.filter(d => isValue(d, minV)).map(d => String(d.target));
    const maxKeys = data.filter(d => isValue(d, maxV)).map(d => String(d.target));

    const minBars = await highlightBarsByKeys(ctx, { keys: minKeys, color: OP_COLORS.RANGE });
    const maxBars = await highlightBarsByKeys(ctx, { keys: maxKeys, color: OP_COLORS.RANGE });

    if (minBars) {
        await drawCenterGuideline(ctx, { bars: minBars, valueScale, orientation, color: OP_COLORS.RANGE });
        await labelBars(ctx, { bars: minBars, color: OP_COLORS.RANGE, textFn: (val) => `Min: ${val}` });
    }
    if (maxBars) {
        await drawCenterGuideline(ctx, { bars: maxBars, valueScale, orientation, color: OP_COLORS.RANGE });
        await labelBars(ctx, { bars: maxBars, color: OP_COLORS.RANGE, textFn: (val) => `Max: ${val}` });
    }

    signalOpDone(chartId, 'determineRange');
    return new IntervalValue(categoryAxisName, minV, maxV);
}

// ============= COMPARE (✅ 템플릿 적용) =============
export async function simpleBarCompare(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    const { svg, xField, yField, margins, plot, orientation } = ctx;
    resetAnnotations(ctx);

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'compare');
        return [];
    }

    const winner = dataCompare(data, op, xField, yField, isLast);
    const aggregateMode = typeof op?.aggregate === 'string'
        ? op.aggregate.toLowerCase()
        : null;
    const isPercentOfTotal = aggregateMode === 'percentage_of_total' || aggregateMode === 'percent_of_total';
    const animationPromises = [];

    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const resolveKey = (k) => {
        if (!isLast || !Array.isArray(data)) return k;
        const foundById = data.find(d => String(d?.id) === k);
        if (foundById) return String(foundById.id);
        const foundByLookup = data.find(d => d?.lookupId != null && String(d.lookupId) === k);
        if (foundByLookup) {
            return String(foundByLookup.id ?? foundByLookup.lookupId);
        }
        const foundByTarget = data.find(d => String(d?.target) === k);
        return foundByTarget ? String(foundByTarget.target) : k;
    };
    const visKeyA = resolveKey(keyA);
    const visKeyB = resolveKey(keyB);

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;

    // 스케일 설정 (값 → 픽셀)
    const valueScale = orientation === "vertical"
        ? d3.scaleLinear().domain([0, d3.max(data, d => +d.value) || 0]).nice().range([plot.h, 0])
        : d3.scaleLinear().domain([0, d3.max(data, d => +d.value) || 0]).nice().range([0, plot.w]);

    const barsA = await highlightBarsByKeys(ctx, { keys: [visKeyA], color: colorA });
    const barsB = await highlightBarsByKeys(ctx, { keys: [visKeyB], color: colorB });

    if (!barsA || !barsB || barsA.empty() || barsB.empty()) {
        console.warn("simpleBarCompare: target bars not found for", keyA, keyB);
        signalOpDone(chartId, 'compare');
        return winner ? [winner] : [];
    }

    await drawCenterGuideline(ctx, { bars: barsA, valueScale, orientation, color: colorA });
    await drawCenterGuideline(ctx, { bars: barsB, valueScale, orientation, color: colorB });

    await labelBars(ctx, { bars: barsA, color: colorA, textFn: (v) => v });
    await labelBars(ctx, { bars: barsB, color: colorB, textFn: (v) => v });

    if (isPercentOfTotal && winner) {
        const percentValue = Number.isFinite(+winner.value) ? +winner.value : null;
        const precision = Number.isInteger(op?.precision) ? op.precision : 1;
        const percentLabel = Number.isFinite(percentValue)
            ? `${percentValue.toFixed(precision)}%`
            : '—';
        svg.append('text')
            .attr('class', 'annotation diff-percent-summary')
            .attr('x', margins.left + plot.w / 2)
            .attr('y', Math.max(24, margins.top - 6))
            .attr('text-anchor', 'middle')
            .attr('font-size', 16)
            .attr('font-weight', 'bold')
            .attr('fill', OP_COLORS.DIFF_LINE)
            .text(`Percent of total = ${percentLabel}`);
    }

    await Promise.all(animationPromises).catch(() => {});
    await delay(30);
    signalOpDone(chartId, 'compare');
    return winner ? [winner] : [];
}

// ============= COMPARE BOOL (✅ 템플릿 적용 - compare와 동일) =============
export async function simpleBarCompareBool(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    const { xField, yField, orientation } = ctx;
    resetAnnotations(ctx);

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'compareBool');
        return null;
    }

    const verdict = dataCompareBool(data, op, xField, yField, isLast);
    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const resolveKey = (k) => {
        if (!isLast || !Array.isArray(data)) return k;
        const foundById = data.find(d => String(d?.id) === k);
        if (foundById) return String(foundById.id);
        const foundByLookup = data.find(d => d?.lookupId != null && String(d.lookupId) === k);
        if (foundByLookup) {
            return String(foundByLookup.id ?? foundByLookup.lookupId);
        }
        const foundByTarget = data.find(d => String(d?.target) === k);
        return foundByTarget ? String(foundByTarget.target) : k;
    };
    const visKeyA = resolveKey(keyA);
    const visKeyB = resolveKey(keyB);

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;

    const valueScale = orientation === "vertical"
        ? d3.scaleLinear().domain([0, d3.max(data, d => +d.value) || 0]).nice().range([ctx.plot.h, 0])
        : d3.scaleLinear().domain([0, d3.max(data, d => +d.value) || 0]).nice().range([0, ctx.plot.w]);

    const barsA = await highlightBarsByKeys(ctx, { keys: [visKeyA], color: colorA });
    const barsB = await highlightBarsByKeys(ctx, { keys: [visKeyB], color: colorB });

    if (!barsA || !barsB || barsA.empty() || barsB.empty()) {
        console.warn("simpleBarCompareBool: target bars not found for", keyA, keyB);
        signalOpDone(chartId, 'compareBool');
        return verdict;
    }

    await drawCenterGuideline(ctx, { bars: barsA, valueScale, orientation, color: colorA });
    await drawCenterGuideline(ctx, { bars: barsB, valueScale, orientation, color: colorB });

    await labelBars(ctx, { bars: barsA, color: colorA, textFn: (v) => v });
    await labelBars(ctx, { bars: barsB, color: colorB, textFn: (v) => v });

    signalOpDone(chartId, 'compareBool');
    return verdict;
}

// ============= SORT (✅ 템플릿 적용) =============
export async function simpleBarSort(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    const { xField, yField, orientation } = ctx;
    resetAnnotations(ctx);
    
    if (!Array.isArray(data) || data.length === 0) { 
        signalOpDone(chartId, 'sort'); 
        return data; 
    }
    
    const categoryName = data[0]?.category || (orientation === 'vertical' ? xField : yField);
    const getCategoryIdFromData = (d) => {
        if (!d) return '';
        if (d.target !== undefined) return String(d.target);
        if (categoryName && d[categoryName] !== undefined) return String(d[categoryName]);
        if (xField && d[xField] !== undefined) return String(d[xField]);
        return '';
    };
    
    const sortedData = dataSort(data, op, xField, yField, isLast);
    const sortedIds = sortedData.map(getCategoryIdFromData);
    
    await sortBars(ctx, { sortedIds, orientation });

    signalOpDone(chartId, 'sort');
    
    if (isLast) {
        const first = sortedData && sortedData[0];
        if (!first) return [];
        return [new DatumValue(first.category, first.measure, first.target, first.group, first.value, first.id)];
    }
    return sortedData;
}

// ============= SUM (✅ 템플릿 적용) =============
export async function simpleBarSum(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const { xField, yField } = ctx;

    const result = dataSum(data, op, xField, yField, isLast);
    if (!result) {
        signalOpDone(chartId, 'sum');
        return [];
    }

    const totalSum = +result.value;
    if (!Number.isFinite(totalSum)) {
        const errorDatum = new DatumValue(result.category, result.measure, result.target, result.group, result.value, result.id);
        signalOpDone(chartId, 'sum');
        return [errorDatum];
    }

    const sumDatum = new DatumValue(
        result.category,
        result.measure,
        result.target,
        result.group,
        result.value,
        result.id
    );

    await runSumStackAnimation(ctx, totalSum);

    signalOpDone(chartId, 'sum');
    return isLast ? [sumDatum] : [sumDatum];
}

// ============= AVERAGE (✅ 템플릿 적용) =============
export async function simpleBarAverage(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const { xField, yField } = ctx;

    const numeric = Array.isArray(data) ? data.map(d => +d.value).filter(v => !Number.isNaN(v)) : [];

    if (numeric.length === 0) {
        console.warn('simpleBarAverage: Input data is empty or contains no numeric values.');
        signalOpDone(chartId, 'average');
        return [];
    }

    const result = dataAverage(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarAverage: unable to compute average');
        signalOpDone(chartId, 'average');
        return [];
    }

    const avg = +result.value;

    if (!Number.isFinite(avg)) {
        console.error('simpleBarAverage: Average value is not a finite number.', { result });
        const errorDatum = new DatumValue(result.category, result.measure, result.target, result.group, result.value, result.id);
        signalOpDone(chartId, 'average');
        return [errorDatum];
    }

    const averageDatum = new DatumValue(
        result.category,
        result.measure,
        result.target,
        result.group,
        result.value,
        result.id
    );

    await drawValueGuideline(ctx, { data, value: avg, color: OP_COLORS.AVERAGE });
    await addCenterValueLabel(ctx, {
        value: avg,
        text: `Avg: ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        color: OP_COLORS.AVERAGE,
        data
    });

    signalOpDone(chartId, 'average');
    return isLast ? [averageDatum] : [averageDatum];
}

// ============= DIFF (✅ 템플릿 적용) =============
export async function simpleBarDiff(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const { xField, yField, orientation, plot } = ctx;

    const result = dataDiff(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarDiff: unable to compute diff', op);
        signalOpDone(chartId, 'diff');
        return [];
    }

    const aggregateMode = typeof op?.aggregate === 'string'
        ? op.aggregate.toLowerCase()
        : null;
    const isPercentOfTotal = aggregateMode === 'percentage_of_total' || aggregateMode === 'percent_of_total';
    const isRatioMode = String(op?.mode || '').toLowerCase() === 'ratio';
    const isPercentMode = isPercentOfTotal || op?.percent === true || isRatioMode;

    const diffValue = Number.isFinite(result?.value) ? result.value : null;
    const diffMagnitude = Number.isFinite(diffValue)
        ? (isPercentMode ? diffValue : Math.abs(diffValue))
        : NaN;

    const diffDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, Number.isFinite(diffMagnitude) ? diffMagnitude : result.value, result.id
    );

    const maxValue = d3.max(data, d => +d.value) || 0;
    const valueScale = orientation === "vertical"
        ? d3.scaleLinear().domain([0, maxValue]).nice().range([plot.h, 0])
        : d3.scaleLinear().domain([0, maxValue]).nice().range([0, plot.w]);

    const toArray = (value) => Array.isArray(value) ? value : [value];
    const findDatumValue = (keyStr) => {
        const datum = data.find(d => {
            const idKey = d?.id != null ? String(d.id) : null;
            const targetKey = d?.target != null ? String(d.target) : null;
            return idKey === keyStr || targetKey === keyStr;
        });
        return Number(datum?.value);
    };
    const resolveKey = (key) => {
        const keyStr = String(key);
        if (!isLast || !Array.isArray(data)) return keyStr;
        const foundById = data.find(d => String(d?.id) === keyStr);
        if (foundById) return String(foundById.id);
        const foundByTarget = data.find(d => String(d?.target) === keyStr);
        return foundByTarget ? String(foundByTarget.target) : keyStr;
    };

    const toEntries = (targets, color) => {
        return toArray(targets)
            .map((entry) => {
                if (entry == null) return null;
                const rawKey = typeof entry === 'object' ? (entry.id ?? entry.target ?? entry.category ?? entry) : entry;
                const resolvedKey = resolveKey(rawKey);
                const node = ctx.g.selectAll("rect").filter(function () {
                    return getBarKeyFromNode(this) === resolvedKey;
                }).node();
                const nodeValue = node ? Number(getMarkValue(node)) : NaN;
                const value = Number.isFinite(nodeValue) ? nodeValue : findDatumValue(resolvedKey);
                return { key: resolvedKey, color, value };
            })
            .filter(Boolean);
    };

    const entriesA = toEntries(op.targetA, OP_COLORS.DIFF_A);
    const entriesB = toEntries(op.targetB, OP_COLORS.DIFF_B);

    if (!entriesA.length || !entriesB.length) {
        console.warn('simpleBarDiff: unable to locate all targets', { op, foundA: entriesA.length, foundB: entriesB.length });
        signalOpDone(chartId, 'diff');
        return [diffDatum];
    }

    const annotateEntries = async (entries) => {
        const positions = [];
        for (const entry of entries) {
            const { key, color, value } = entry;
            const bars = await highlightBarsByKeys(ctx, { keys: [key], color });
            if (!bars || bars.empty()) continue;
            const numericValue = Number.isFinite(value) ? value : Number(readMarkValue(bars.node()));
            const pos = Number.isFinite(numericValue) ? valueScale(numericValue) : null;
            await drawCenterGuideline(ctx, { bars, valueScale, orientation, color });
            await labelBars(ctx, { bars, color, textFn: (v) => Number.isFinite(+v) ? +v : v });
            positions.push(pos);
        }
        return positions;
    };

    const positionsA = await annotateEntries(entriesA);
    const positionsB = await annotateEntries(entriesB);
    const posA = positionsA.length === 1 ? positionsA[0] : null;
    const posB = positionsB.length === 1 ? positionsB[0] : null;

    if (!isPercentMode && Number.isFinite(posA) && Number.isFinite(posB) && Number.isFinite(diffMagnitude)) {
        await drawDiffBridge(ctx, {
            posA,
            posB,
            orientation,
            color: OP_COLORS.DIFF_LINE,
            label: `Diff: ${diffMagnitude.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        });
    }

    signalOpDone(chartId, 'diff');
    return [diffDatum];
}

export async function simpleBarLagDiff(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);

    const diffsRaw = dataLagDiff(data, op, null, null, isLast);
    if (!Array.isArray(diffsRaw) || diffsRaw.length === 0) {
        console.warn('[simpleBarLagDiff] no differences computed');
        return [];
    }

    const canonicalCategory = diffsRaw[0]?.category || ctx.xField || 'target';
    const canonicalMeasure = diffsRaw[0]?.measure || ctx.yField || 'value';

    const diffDatumValues = normalizeLagDiffResults(diffsRaw, canonicalCategory, canonicalMeasure);

    const scales = await renderLagDiffBars(ctx, diffDatumValues);
    await drawLagDiffZeroLine(ctx, scales?.zeroPos);
    await labelLagDiffBars(ctx, diffDatumValues, scales);
    await summarizeLagDiff(ctx, diffDatumValues);

    signalOpDone(chartId, 'lagDiff');
    return diffDatumValues;
}

export async function simpleBarNth(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const { xField, yField, orientation } = ctx;

    const resultArray = dataNth(data, op, xField, yField, isLast);

    if (!Array.isArray(resultArray) || resultArray.length === 0) {
        console.warn('simpleBarNth: selection failed, dataNth returned empty.');
        signalOpDone(chartId, 'nth');
        return [];
    }

    const rankInputs = Array.isArray(op?.n) ? op.n : [op?.n ?? 1];
    const nToHighlight = rankInputs
        .map((value) => Number(value))
        .filter(Number.isFinite)
        .reduce((max, val) => Math.max(max, val), 0) || resultArray.length;

    const { pickedBars } = await highlightFirstNBars(ctx, {
        n: nToHighlight,
        orientation,
        color: OP_COLORS.NTH,
        showIndex: true
    });

    if (pickedBars) {
        await labelBars(ctx, {
            bars: pickedBars,
            color: OP_COLORS.NTH,
            textFn: (val) => val
        });
    }

    signalOpDone(chartId, 'nth');
    return resultArray;
}

// ============= COUNT (✅ 수정 완료 - 순서 보장) =============
export async function simpleBarCount(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    resetAnnotations(ctx);
    const { xField, yField } = ctx;

    const result = dataCount(data, op, xField, yField, isLast);
    const totalCount = result ? Number(result.value) : 0;
    const bars = selectAllMarks(ctx.g);

    if (bars.empty() || totalCount <= 0) {
        signalOpDone(chartId, 'count');
        return result ? [result] : [];
    }

    // 모든 막대를 먼저 희미하게 만든 뒤, 상위 N개를 강조
    await dimAllBars(ctx, { opacity: OPACITIES.SEMI_DIM, duration: 150 });

    const { pickedKeys, pickedBars } = await highlightFirstNBars(ctx, {
        n: totalCount,
        orientation: ctx.orientation,
        color: OP_COLORS.COUNT,
        showIndex: true
    });

    // 선택되지 않은 막대를 더 희미하게 유지
    if (pickedKeys && pickedKeys.length > 0) {
        const set = new Set(pickedKeys);
        const others = bars.filter(function () {
            return !set.has(getBarKeyFromNode(this));
        });
        if (!others.empty()) {
            await Helpers.fadeElements(others, OPACITIES.DIM, 200);
        }
    }

    // 값 라벨 표시
    if (pickedBars) {
        await labelBars(ctx, {
            bars: pickedBars,
            color: OP_COLORS.COUNT,
            textFn: (val) => val
        });
    }

    signalOpDone(chartId, 'count');
    return result ? [result] : [];
}
