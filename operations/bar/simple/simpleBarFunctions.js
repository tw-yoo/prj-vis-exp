import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";
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
import { OP_COLORS } from "../../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";
import { normalizeLagDiffResults } from "../../common/lagDiffHelpers.js";
import { resolveLinearDomain, storeAxisDomain } from "../../common/scaleHelpers.js";

// 🔥 템플릿 임포트
import * as Helpers from '../../animationHelpers.js';
import * as Templates from '../../operationTemplates.js';
import { DURATIONS, OPACITIES } from '../../animationConfig.js';

// ============= Helper functions =============
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function selectAllMarks(g) { return g.selectAll('rect'); }

function getMarkValue(node) {
    if (!node) return null;
    const sel = d3.select(node);
    const vAttr = sel.attr('data-value');
    if (vAttr != null && vAttr !== '') {
        const n = +vAttr; return Number.isNaN(n) ? null : n;
    }
    const d = sel.datum ? sel.datum() : null;
    if (d && typeof d === 'object') {
        if (d.value != null && Number.isFinite(+d.value)) return +d.value;
        if (d.y != null && Number.isFinite(+d.y)) return +d.y;
        if (d.x != null && Number.isFinite(+d.x)) return +d.x;
    }
    return null;
}

function getBarKeyFromDatum(d) {
    if (!d) return '';
    return String(d.target ?? d.id ?? d.key ?? d.label ?? '');
}

function getBarKeyFromNode(node) {
    const sel = d3.select(node);
    return String(sel.attr('data-id') ?? sel.attr('data-key') ?? sel.attr('data-target') ?? '');
}

function selectBarByKey(g, key) {
    const want = String(key);
    return g.selectAll('rect').filter(function () { return getBarKeyFromNode(this) === want; });
}

function selectBarsExcept(g, keys) {
    const set = new Set((keys || []).map(k => String(k)));
    return g.selectAll('rect').filter(function () { return !set.has(getBarKeyFromNode(this)); });
}

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

export function getSvgAndSetup(chartId) {
    const svgNode = getPrimarySvgElement(chartId);
    const svg = svgNode ? d3.select(svgNode) : d3.select(null);
    const orientation = svgNode?.getAttribute("data-orientation") || "vertical";
    const xField = svgNode?.getAttribute("data-x-field");
    const yField = svgNode?.getAttribute("data-y-field");
    const margins = { left: +(svgNode?.getAttribute("data-m-left") || 0), top: +(svgNode?.getAttribute("data-m-top") || 0) };
    const plot = { w: +(svgNode?.getAttribute("data-plot-w") || 0), h: +(svgNode?.getAttribute("data-plot-h") || 0) };
    let g = svg.select(".plot-area");
    if (g.empty()) g = svg.select("g");
    return { svg, g, orientation, xField, yField, margins, plot };
}

export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}

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

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function signalOpDone(chartId, opName) {
    document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId, op: opName } }));
}

function collectNumericValues(data, fallbackField = 'value') {
    if (!Array.isArray(data)) return [];
    return data.map(d => {
        if (!d) return NaN;
        if (d.value !== undefined) return Number(d.value);
        if (fallbackField && d[fallbackField] !== undefined) return Number(d[fallbackField]);
        return NaN;
    }).filter(Number.isFinite);
}

function buildValueScale(svgNode, orientation, plot, values, fallbackDomain = null) {
    const axis = orientation === 'vertical' ? 'y' : 'x';
    const finiteValues = Array.isArray(values) && values.length
        ? values.filter(Number.isFinite)
        : [];
    let inferredDomain = fallbackDomain;
    if ((!inferredDomain || inferredDomain.length < 2) && finiteValues.length) {
        const minVal = d3.min(finiteValues);
        const maxVal = d3.max(finiteValues);
        const domainMin = Math.min(minVal, 0);
        const domainMax = Math.max(maxVal, 0);
        inferredDomain = (domainMin === domainMax)
            ? [domainMin, domainMin === 0 ? 1 : domainMin * 1.1]
            : [domainMin, domainMax];
    }
    const domain = resolveLinearDomain(svgNode, axis, inferredDomain);
    if (!domain) return null;
    const range = orientation === 'vertical'
        ? [plot.h, 0]
        : [0, plot.w];
    return d3.scaleLinear().domain(domain).range(range);
}

function makeValuePositionResolver(svgNode, orientation, plot, values) {
    const scale = buildValueScale(svgNode, orientation, plot, values);
    if (orientation === 'vertical') {
        return (node) => {
            const val = getMarkValue(node);
            const y = Number(node?.getAttribute?.('y') ?? 0);
            const height = Number(node?.getAttribute?.('height') ?? 0);

            if (scale && Number.isFinite(val)) {
                const scaled = val >= 0 ? scale(val) : scale(0);
                if (Number.isFinite(scaled)) {
                    return scaled;
                }
            }

            if (Number.isFinite(val) && val < 0 && Number.isFinite(y) && Number.isFinite(height)) {
                return y + height;
            }
            return Number.isFinite(y) ? y : 0;
        };
    }
    return (node) => {
        const val = getMarkValue(node);
        const x = Number(node?.getAttribute?.('x') ?? 0);
        const width = Number(node?.getAttribute?.('width') ?? 0);

        if (scale && Number.isFinite(val)) {
            const scaled = val >= 0 ? scale(val) : scale(0);
            if (Number.isFinite(scaled)) {
                return scaled;
            }
        }

        if (Number.isFinite(val) && val < 0 && Number.isFinite(x)) {
            return x;
        }
        if (Number.isFinite(x) && Number.isFinite(width)) {
            return x + width;
        }
        return 0;
    };
}

// ============= RETRIEVE VALUE (✅ 템플릿 적용) =============
export async function simpleBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const hlColor = OP_COLORS.RETRIEVE_VALUE;
    const selected = retrieveValue(data, op, isLast) || [];
    const bars = selectAllMarks(g);
    
    const selectedKeys = selected.map(d => {
        return isLast ? String(d?.id ?? d?.target ?? getBarKeyFromDatum(d))
                      : getBarKeyFromDatum(d);
    });
    
    const target = bars.filter(function () {
        const nodeKey = getBarKeyFromNode(this);
        return selectedKeys.includes(String(nodeKey));
    });
    
    if (target.empty()) {
        console.warn("RetrieveValue: target bar(s) not found for key(s):", op?.target);
        return markKeepInput(selected);
    }
    
    // 스케일 설정
    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    } else {
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
    }
    
    // 🔥 템플릿 적용: highlightAndAnnotatePattern
    await Templates.highlightAndAnnotatePattern({
        allElements: bars,
        targetElements: target,
        color: hlColor,
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        getValueFn: (node) => getMarkValue(node),
        getYPositionFn: (node) => {
            const val = getMarkValue(node);
            return orientation === 'vertical' ? yScale(val) : xScale(val);
        },
        getCenterFn: (node) => getCenter(node, orientation, margins),
        useDim: false  // retrieveValue는 dim 안함
    });
    
    await Helpers.delay(30);
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
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const toNumber = v => (v == null ? NaN : +v);
    const getDatumValue = d => {
        if (d && d.value !== undefined) return +d.value;
        if (yField && d && d[yField] !== undefined) return +d[yField];
        if (xField && d && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const effectiveOp = { ...op };
    if (data.length > 0) {
        const sample = data[0];
        if (op.field === sample.measure) {
            effectiveOp.field = 'value';
        } else if (op.field === sample.category) {
            effectiveOp.field = 'target';
        }
    }

    let filteredData = dataFilter(data, effectiveOp, xField, yField, isLast);

    if (!filteredData || filteredData.length === 0) {
        console.warn("Filter resulted in empty data.");
        await Helpers.fadeElements(g.selectAll("rect"), 0, 500);
        g.selectAll("rect").remove();
        
        if (isLast) {
            signalOpDone(chartId, 'filter');
            return [new DatumValue('filter', 'count', 'result', null, 0, 'last_filter')];
        }
        signalOpDone(chartId, 'filter');
        return [];
    }

    const categoryKey = filteredData[0]?.category || xField;
    const plainRows = filteredData.map(d => ({
        [categoryKey]: d.target,
        target: d.target,
        value: d.value,
        group: d.group,
        category: d.category ?? categoryKey,
        measure: d.measure ?? yField ?? 'value'
    }));

    const sampleDatum = data[0] || {};
    const measureFieldName = sampleDatum.measure || yField;
    const isMeasureField = effectiveOp.field === 'value' || effectiveOp.field === yField || effectiveOp.field === measureFieldName;

    const numericOps = new Set(['>','>=','<','<=','==','eq']);
    const isNumericMeasureFilter = numericOps.has(op.operator) && Number.isFinite(toNumber(op.value)) && isMeasureField;

    const allBars = selectAllMarks(g);
    const keptTargets = new Set(plainRows.map(d => String(d[categoryKey])));

    // 🔥 템플릿 적용: filterPattern
    await Templates.filterPattern({
        allBars: allBars,
        keptTargets: keptTargets,
        categoryKey: categoryKey,
        filteredData: filteredData,
        svg: svg,
        g: g,
        margins: margins,
        plot: plot,
        showThreshold: isNumericMeasureFilter ? {
            yPos: (() => {
                const v = toNumber(op.value);
                if (!Number.isFinite(v)) return 0;
                const maxV = d3.max(data, getDatumValue) || 0;
                const yScaleFull = d3.scaleLinear().domain([0, maxV]).nice().range([plot.h, 0]);
                const domain = yScaleFull.domain();
                const clamped = Math.max(domain[0], Math.min(domain[domain.length - 1], v));
                return yScaleFull(clamped);
            })(),
            color: OP_COLORS.FILTER_THRESHOLD
        } : null,
        onRepositioned: async (filteredBars) => {
            // 값 태그 추가
            const yMax = d3.max(data, datum => +datum.value) || 0;
            const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
            
            filteredBars.each(function(d) {
                const bar = d3.select(this);
                g.append("text").attr("class", "annotation value-tag")
                    .attr("x", +bar.attr("x") + +bar.attr("width") / 2)
                    .attr("y", yScale(d.value) - 5)
                    .attr("text-anchor", "middle")
                    .attr("font-size", 12).attr("font-weight", "bold")
                    .attr("fill", "black")
                    .text(d.value);
            });
        }
    });

    await Helpers.delay(1000);
    signalOpDone(chartId, 'filter');
    return isLast
        ? [new DatumValue('filter', 'count', 'result', null, Array.isArray(filteredData) ? filteredData.length : 0, 'last_filter')]
        : filteredData;
}

// ============= FIND EXTREMUM (✅ 템플릿 적용) =============
export async function simpleBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, orientation, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'findExtremum');
        return [];
    }
    
    const selected = dataFindExtremum(data, op, xField, yField, isLast);
    if (!selected) {
        signalOpDone(chartId, 'findExtremum');
        return [];
    }
    
    const hlColor = OP_COLORS.EXTREMUM;
    const selId = String(selected.target);
    const selVal = +(selected.value !== undefined ? selected.value : (selected[yField] !== undefined ? selected[yField] : selected[xField]));
    
    const bars = selectAllMarks(g);
    const targetBar = selectBarByKey(g, selId);
    
    if (targetBar.empty()) {
        signalOpDone(chartId, 'findExtremum');
        return [selected];
    }
    
    // 스케일 설정
    const valueResolver = makeValuePositionResolver(svg.node(), orientation, plot, collectNumericValues(data, yField));
    
    // 🔥 템플릿 적용: highlightAndAnnotatePattern
    await Templates.highlightAndAnnotatePattern({
        allElements: bars,
        targetElements: targetBar,
        color: hlColor,
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        getValueFn: (node) => {
            const val = getMarkValue(node);
            const label = op?.which === 'min' ? 'Min' : 'Max';
            return `${label}: ${val}`;
        },
        getYPositionFn: (node) => valueResolver(node),
        getCenterFn: (node) => getCenter(node, orientation, margins),
        useDim: false
    });
    
    await Helpers.delay(30);
    signalOpDone(chartId, 'findExtremum');
    
    if (isLast) {
        return [new DatumValue(selected.category, selected.measure, selected.target, selected.group, selected.value, selected.id)];
    }
    return [selected];
}

// ============= DETERMINE RANGE (✅ 템플릿 적용) =============
export async function simpleBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = OP_COLORS.RANGE;
    const valueField = op.field || (orientation === 'vertical' ? yField : xField);
    const categoryAxisName = orientation === 'vertical' ? xField : yField;
    
    const values = data.map(d => {
        return d.value !== undefined ? +d.value : +d[valueField];
    }).filter(v => !isNaN(v));

    if (values.length === 0) {
        console.warn("DetermineRange: No valid data to determine range.");
        signalOpDone(chartId, 'determineRange');
        return null;
    }

    const minV = d3.min(values);
    const maxV = d3.max(values);
    const valueResolver = makeValuePositionResolver(svg.node(), orientation, plot, values);

    const findBars = (val) => selectAllMarks(g).filter(d => {
        if (!d) return false;
        const barValue = d.value !== undefined ? d.value : d[valueField];
        return +barValue === val;
    });

    const minBars = findBars(minV);
    const maxBars = findBars(maxV);

    // 🔥 템플릿 적용: comparePattern (min과 max 비교처럼 처리)
    await Templates.comparePattern({
        allElements: selectAllMarks(g),
        elementA: minBars,
        elementB: maxBars,
        colorA: hlColor,
        colorB: hlColor,
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        getValueFn: (node) => {
            const val = getMarkValue(node);
            const isMin = minBars.filter(function() { return this === node; }).size() > 0;
            return `${isMin ? 'Min' : 'Max'}: ${val}`;
        },
        getYPositionFn: (node) => valueResolver(node),
        getCenterFn: (node) => getCenter(node, orientation, margins),
        useDim: false
    });

    await Helpers.delay(30);
    signalOpDone(chartId, 'determineRange');
    
    return new IntervalValue(categoryAxisName, minV, maxV);
}

// ============= COMPARE (✅ 템플릿 적용) =============
export async function simpleBarCompare(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'compare');
        return [];
    }

    const winner = dataCompare(data, op, xField, yField, isLast);
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

    const barA = selectBarByKey(g, visKeyA);
    const barB = selectBarByKey(g, visKeyB);

    if (barA.empty() || barB.empty()) {
        console.warn("simpleBarCompare: target bars not found for", keyA, keyB);
        signalOpDone(chartId, 'compare');
        return winner ? [winner] : [];
    }

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
    const valueResolver = makeValuePositionResolver(svg.node(), orientation, plot, collectNumericValues(data, yField));

    // 🔥 템플릿 적용: comparePattern
    await Templates.comparePattern({
        allElements: selectAllMarks(g),
        elementA: barA,
        elementB: barB,
        colorA: colorA,
        colorB: colorB,
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        getValueFn: (node) => getMarkValue(node),
        getYPositionFn: (node) => valueResolver(node),
        getCenterFn: (node) => getCenter(node, orientation, margins),
        useDim: false
    });

    if (isPercentOfTotal) {
        const percentLabel = Number.isFinite(result.value)
            ? `${result.value.toFixed(1)}%`
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
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

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

    const barA = selectBarByKey(g, visKeyA);
    const barB = selectBarByKey(g, visKeyB);

    if (barA.empty() || barB.empty()) {
        console.warn("simpleBarCompareBool: target bars not found for", keyA, keyB);
        signalOpDone(chartId, 'compareBool');
        return verdict;
    }

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
    const valueResolver = makeValuePositionResolver(svg.node(), orientation, plot, collectNumericValues(data, yField));

    // 🔥 템플릿 적용: comparePattern
    await Templates.comparePattern({
        allElements: selectAllMarks(g),
        elementA: barA,
        elementB: barB,
        colorA: colorA,
        colorB: colorB,
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        getValueFn: (node) => getMarkValue(node),
        getYPositionFn: (node) => valueResolver(node),
        getCenterFn: (node) => getCenter(node, orientation, margins),
        useDim: false
    });

    await Helpers.delay(30);
    signalOpDone(chartId, 'compareBool');
    return verdict;
}

// ============= SORT (✅ 템플릿 적용) =============
export async function simpleBarSort(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
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
    
    const bars = selectAllMarks(g);
    
    // 🔥 템플릿 적용: repositionPattern
    if (orientation === 'vertical') {
        const xScale = d3.scaleBand().domain(sortedIds).range([0, plot.w]).padding(0.2);
        
        await Templates.repositionPattern({
            elements: bars,
            newXScale: xScale,
            orientation: 'vertical',
            g: g,
            duration: DURATIONS.REPOSITION
        });
    } else {
        const yScale = d3.scaleBand().domain(sortedIds).range([0, plot.h]).padding(0.2);
        
        await Templates.repositionPattern({
            elements: bars,
            newXScale: yScale,
            orientation: 'horizontal',
            g: g,
            duration: DURATIONS.REPOSITION
        });
    }
    
    await Helpers.delay(30);
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
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

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
    sumDatum.name = result.name || sumDatum.target;

    // 스택 애니메이션 (기존 유지)
    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);
    const yAxisTransition = svg.select('.y-axis').transition().duration(DURATIONS.STACK).call(d3.axisLeft(newYScale)).end();
    const bars = selectAllMarks(g);
    const barWidth = +bars.attr('width');
    const targetX = plot.w / 2 - barWidth / 2;
    let runningTotal = 0;
    const stackPromises = [];

    bars.each(function() {
        const rect = d3.select(this);
        const raw = getMarkValue(this);
        const value = Number.isFinite(+raw) ? +raw : 0;
        const t = rect.transition().duration(DURATIONS.STACK)
            .attr('x', targetX)
            .attr('y', newYScale(runningTotal + value))
            .attr('height', plot.h - newYScale(value))
            .end();
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    if (svg.node()) {
        storeAxisDomain(svg.node(), 'y', newYScale.domain());
    }
    await Helpers.delay(DURATIONS.SUM_DELAY);

    // 🔥 템플릿 적용: aggregateResultPattern
    await Templates.aggregateResultPattern({
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: 'vertical',
        value: totalSum,
        yScale: newYScale,
        color: OP_COLORS.SUM,
        labelText: `Sum: ${totalSum.toLocaleString()}`,
        lineStyle: 'dashed'
    });

    await Helpers.delay(30);
    signalOpDone(chartId, 'sum');
    return isLast ? [sumDatum] : [sumDatum];
}

// ============= AVERAGE (✅ 템플릿 적용) =============
export async function simpleBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

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
    averageDatum.name = result.name || averageDatum.target;

    // 스케일 설정 (막대가 그대로 남아 있는 상태를 기반으로 계산)
    const currentBars = selectAllMarks(g);
    const currentValues = currentBars.nodes()
        .map(node => getMarkValue(node))
        .map(v => (Number.isFinite(+v) ? +v : NaN))
        .filter(Number.isFinite);
    const domMax = d3.max(currentValues) || 0;
    const dataMax = d3.max(numeric) || 0;
    const axisMax = Math.max(domMax, dataMax);

    let yScale, xScale;
    if (orientation === 'vertical') {
        yScale = d3.scaleLinear()
            .domain([0, axisMax])
            .nice()
            .range([plot.h, 0]);
    } else {
        xScale = d3.scaleLinear()
            .domain([0, axisMax])
            .nice()
            .range([0, plot.w]);
    }

    // 🔥 템플릿 적용: aggregateResultPattern
    await Templates.aggregateResultPattern({
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        value: orientation === 'vertical' ? avg : xScale(avg),
        yScale: orientation === 'vertical' ? yScale : null,
        color: OP_COLORS.AVERAGE,
        labelText: `Avg: ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        lineStyle: 'dashed'
    });

    await Helpers.delay(30);
    signalOpDone(chartId, 'average');
    return isLast ? [averageDatum] : [averageDatum];
}

// ============= DIFF (✅ 템플릿 적용) =============
export async function simpleBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

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

    const diffValue = isPercentMode ? result.value : Math.abs(result.value);

    const diffDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, diffValue, result.id
    );
    diffDatum.name = result.name || diffDatum.target;

    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const resolveKey = (k) => {
        if (!isLast || !Array.isArray(data)) return k;
        const foundById = data.find(d => String(d?.id) === k);
        if (foundById) return String(foundById.id);
        const foundByTarget = data.find(d => String(d?.target) === k);
        return foundByTarget ? String(foundByTarget.target) : k;
    };
    const visKeyA = resolveKey(keyA);
    const visKeyB = resolveKey(keyB);

    const barA = selectBarByKey(g, visKeyA);
    const barB = selectBarByKey(g, visKeyB);

    if (barA.empty() || barB.empty()) {
        console.warn('simpleBarDiff: One or both targets not found.');
        signalOpDone(chartId, 'diff');
        return [diffDatum];
    }

    const valueA = getMarkValue(barA.node());
    const valueB = getMarkValue(barB.node());
    const colorA = OP_COLORS.DIFF_A;
    const colorB = OP_COLORS.DIFF_B;

    // 스케일 설정
    let xScale, yScale;
    if (orientation === "vertical") {
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
    }

    // 🔥 템플릿 적용: comparePattern으로 막대 하이라이트
    await Templates.comparePattern({
        allElements: selectAllMarks(g),
        elementA: barA,
        elementB: barB,
        colorA: colorA,
        colorB: colorB,
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: orientation,
        getValueFn: (node) => getMarkValue(node),
        getYPositionFn: (node) => {
            const val = getMarkValue(node);
            return orientation === "vertical" ? yScale(val) : xScale(val);
        },
        getCenterFn: (node) => getCenter(node, orientation, margins),
        useDim: false
    });

    const diffMagnitude = Number.isFinite(result?.value)
        ? (isPercentMode ? result.value : Math.abs(result.value))
        : (Number.isFinite(valueA) && Number.isFinite(valueB) ? Math.abs(valueA - valueB) : null);

    if (!isPercentMode && Number.isFinite(diffMagnitude)) {
        await Templates.rangeBridgePattern({
            svg: svg,
            margins: margins,
            plot: plot,
            orientation: orientation,
            valueA: valueA,
            valueB: valueB,
            yScale: yScale,
            color: OP_COLORS.DIFF_LINE,
            labelText: `Diff: ${diffMagnitude.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        });
    }

    if (isPercentOfTotal) {
        const percentLabel = Number.isFinite(result.value)
            ? `${result.value.toFixed(1)}%`
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

    await Helpers.delay(30);
    signalOpDone(chartId, 'diff');
    return [diffDatum];
}

const formatLagDiffValue = (value) => {
    if (!Number.isFinite(value) || value === 0) return '0';
    const magnitude = Math.abs(value);
    const base = fmtNum(magnitude);
    return value > 0 ? `+${base}` : `-${base}`;
};

const formatLagDiffLabel = (datum) => {
    const head = datum.prevTarget ? `${datum.prevTarget} -> ${datum.target}` : datum.target;
    return `${head}: ${formatLagDiffValue(datum.value)}`;
};

function computeLagDiffDomain(values) {
    const minVal = d3.min(values.filter(Number.isFinite));
    const maxVal = d3.max(values.filter(Number.isFinite));
    let domainMin = Math.min(0, Number.isFinite(minVal) ? minVal : 0);
    let domainMax = Math.max(0, Number.isFinite(maxVal) ? maxVal : 0);
    if (domainMin === domainMax) {
        domainMax = domainMin === 0 ? 1 : domainMin + Math.abs(domainMin) * 0.5;
    }
    if (!Number.isFinite(domainMin)) domainMin = 0;
    if (!Number.isFinite(domainMax)) domainMax = 1;
    if (domainMax <= domainMin) domainMax = domainMin + 1;
    return [domainMin, domainMax];
}

async function renderLagDiffState(ctx, diffData) {
    const { svg, g, orientation, margins, plot } = ctx;
    const categories = diffData.map(d => String(d.target));
    const values = diffData.map(d => Number(d.value) || 0);
    const [domainMin, domainMax] = computeLagDiffDomain(values);

    if (orientation === 'horizontal') {
        const yScale = d3.scaleBand().domain(categories).range([0, plot.h]).padding(0.2);
        const xScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([0, plot.w]);
        const zeroX = xScale(0);

        const bars = g.selectAll('rect').classed('main-bar', true).data(diffData, d => d.target);
        const exiting = bars.exit();
        if (!exiting.empty()) {
            await exiting.transition().duration(200).attr('opacity', 0).remove().end().catch(() => {});
        }

        const entered = bars.enter().append('rect')
            .attr('class', 'main-bar')
            .attr('y', d => yScale(d.target))
            .attr('height', yScale.bandwidth())
            .attr('x', zeroX)
            .attr('width', 0)
            .attr('opacity', 0.05);

        await entered.merge(bars)
            .attr('data-target', d => d.target)
            .attr('data-id', d => d.id ?? d.target)
            .attr('data-value', d => d.value)
            .transition().duration(500)
            .attr('y', d => yScale(d.target))
            .attr('height', yScale.bandwidth())
            .attr('x', d => (d.value >= 0 ? zeroX : xScale(d.value)))
            .attr('width', d => {
                const span = Math.abs(xScale(d.value) - zeroX);
                return span < 2 ? 2 : span;
            })
            .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
            .attr('opacity', 0.95)
            .end().catch(() => {});

        const xAxis = g.select('.x-axis');
        if (!xAxis.empty()) {
            xAxis.call(d3.axisBottom(xScale).ticks(5));
        }
        const yAxis = g.select('.y-axis');
        if (!yAxis.empty()) {
            yAxis.call(d3.axisLeft(yScale));
        }

        svg.selectAll('.lagdiff-zero-line').remove();
        svg.append('line')
            .attr('class', 'annotation lagdiff-zero-line')
            .attr('x1', margins.left + zeroX)
            .attr('x2', margins.left + zeroX)
            .attr('y1', margins.top)
            .attr('y2', margins.top + plot.h)
            .attr('stroke', '#666')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 4');

        const labels = svg.selectAll('.lagdiff-label').data(diffData, d => d.id || d.target);
        labels.exit().remove();
        labels.enter().append('text').attr('class', 'annotation lagdiff-label')
            .merge(labels)
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .attr('text-anchor', d => d.value >= 0 ? 'start' : 'end')
            .attr('x', d => {
                const valueX = xScale(d.value);
                const offset = 10;
                return margins.left + valueX + (d.value >= 0 ? offset : -offset);
            })
            .attr('y', d => margins.top + yScale(d.target) + yScale.bandwidth() / 2 + 4)
            .text(formatLagDiffLabel);
        return;
    }

    // vertical orientation
    const xScale = d3.scaleBand().domain(categories).range([0, plot.w]).padding(0.2);
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plot.h, 0]);
    const zeroY = yScale(0);

    const bars = g.selectAll('rect').classed('main-bar', true).data(diffData, d => d.target);
    const exiting = bars.exit();
    if (!exiting.empty()) {
        await exiting.transition().duration(200).attr('opacity', 0).attr('height', 0).remove().end().catch(() => {});
    }

    const entered = bars.enter().append('rect')
        .attr('class', 'main-bar')
        .attr('x', d => xScale(d.target))
        .attr('width', xScale.bandwidth())
        .attr('y', zeroY)
        .attr('height', 0)
        .attr('opacity', 0.05);

    await entered.merge(bars)
        .attr('data-target', d => d.target)
        .attr('data-id', d => d.id ?? d.target)
        .attr('data-value', d => d.value)
        .transition().duration(500)
        .attr('x', d => xScale(d.target))
        .attr('width', xScale.bandwidth())
        .attr('y', d => (d.value >= 0 ? yScale(d.value) : zeroY))
        .attr('height', d => {
            const span = Math.abs(yScale(d.value) - zeroY);
            return span < 2 ? 2 : span;
        })
        .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
        .attr('opacity', 0.95)
        .end().catch(() => {});

    const xAxis = g.select('.x-axis');
    if (!xAxis.empty()) {
        xAxis.call(d3.axisBottom(xScale));
        xAxis.selectAll('text').attr('transform', 'rotate(-45)').style('text-anchor', 'end');
    }
    const yAxis = g.select('.y-axis');
    if (!yAxis.empty()) {
        yAxis.call(d3.axisLeft(yScale).ticks(5));
    }

    svg.selectAll('.lagdiff-zero-line').remove();
    svg.append('line')
        .attr('class', 'annotation lagdiff-zero-line')
        .attr('x1', margins.left)
        .attr('x2', margins.left + plot.w)
        .attr('y1', margins.top + zeroY)
        .attr('y2', margins.top + zeroY)
        .attr('stroke', '#666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4');

    const labels = svg.selectAll('.lagdiff-label').data(diffData, d => d.id || d.target);
    labels.exit().remove();
    labels.enter().append('text').attr('class', 'annotation lagdiff-label')
        .merge(labels)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .attr('x', d => margins.left + xScale(d.target) + xScale.bandwidth() / 2)
        .attr('y', d => {
            const base = d.value >= 0 ? yScale(d.value) - 8 : Math.max(yScale(d.value), zeroY) + 16;
            return margins.top + base;
        })
        .text(formatLagDiffLabel);
}

export async function simpleBarLagDiff(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    clearAllAnnotations(ctx.svg);

    const diffsRaw = dataLagDiff(data, op, null, null, isLast);
    if (!Array.isArray(diffsRaw) || diffsRaw.length === 0) {
        console.warn('[simpleBarLagDiff] no differences computed');
        return [];
    }

    const canonicalCategory = diffsRaw[0]?.category || ctx.xField || 'target';
    const canonicalMeasure = diffsRaw[0]?.measure || ctx.yField || 'value';

    const diffDatumValues = normalizeLagDiffResults(diffsRaw, canonicalCategory, canonicalMeasure);

    await renderLagDiffState(ctx, diffDatumValues);

    const positiveTotal = diffDatumValues
        .map(d => Number(d.value))
        .filter(v => Number.isFinite(v) && v > 0)
        .reduce((sum, v) => sum + v, 0);

    ctx.svg.append('text').attr('class', 'annotation lagdiff-summary')
        .attr('x', ctx.margins.left + 4)
        .attr('y', ctx.margins.top - 12)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.SUM)
        .text(
            Number.isFinite(positiveTotal)
                ? `lagDiff computed ${diffDatumValues.length} changes (sum of positives = ${positiveTotal.toLocaleString()})`
                : `lagDiff computed ${diffDatumValues.length} changes`
        );

    signalOpDone(chartId, 'lagDiff');
    return diffDatumValues;
}

// ============= NTH (✅ 수정 완료 - 순서 보장) =============
export async function simpleBarNth(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const getOrdinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const resultArray = dataNth(data, op, xField, yField, isLast);

    if (!resultArray || resultArray.length === 0) {
        console.warn('simpleBarNth: selection failed, dataNth returned empty.');
        signalOpDone(chartId, 'nth');
        return [];
    }

    const nValues = Array.isArray(op.n) ? op.n : [op.n];
    const from = String(op?.from || 'left').toLowerCase();
    const color = OP_COLORS.NTH;

    const all = g.selectAll('rect');
    const cats = data.map(d => String(d.target));
    const seq = from === 'right' ? cats.slice().reverse() : cats;

    // 스케일 설정
    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
    }

    // 🔥 수정: 막대를 순서대로 정렬한 배열 생성
    const orderedBars = [];
    seq.forEach(category => {
        const bar = all.filter(function() { 
            return getBarKeyFromNode(this) === category; 
        });
        if (!bar.empty()) {
            orderedBars.push({ 
                node: bar.node(), 
                selection: bar, 
                category: category 
            });
        }
    });

    // 모든 막대 흐리게
    await Helpers.fadeElements(all, OPACITIES.DIM, 250);
    
    // 🔥 순차 카운팅 (직접 구현 - 템플릿의 순서 보장 문제 회피)
    const countedBars = [];
    const maxN = Math.max(...nValues);
    const countLimit = Math.min(maxN, orderedBars.length);

    for (let i = 0; i < countLimit; i++) {
        const { node, selection, category } = orderedBars[i];
        
        countedBars.push({ 
            index: i + 1, 
            category: category, 
            selection: selection, 
            node: node 
        });
        
        await Helpers.changeBarColor(selection, color, DURATIONS.NTH_HIGHLIGHT);
        await Helpers.fadeElements(selection, OPACITIES.FULL, DURATIONS.NTH_HIGHLIGHT);

        const { x, y } = getCenter(node, orientation, margins);
        
        await Helpers.addValueLabel(
            svg, x, y,
            String(i + 1),
            color,
            { className: 'annotation count-label', fontSize: 14 }
        );
        
        await Helpers.delay(DURATIONS.NTH_COUNT);
    }

    // 선택되지 않은 것들 dim
    const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
    const finals = [];
    
    countedBars.forEach((item) => {
        if (!selectedIndices.has(item.index)) {
            finals.push(Helpers.fadeElements(item.selection, OPACITIES.DIM, 300));
        }
    });
    finals.push(svg.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
    await Promise.all(finals);

    // 선택된 것들에 가이드라인 + 상세 레이블 추가
    const lineTasks = [];
    const labelTasks = [];

    nValues.forEach(n => {
        const item = countedBars.find(cb => cb.index === n);
        if (!item) return;

        // 데이터에서 값 찾기
        const targetData = data.find(d => String(d.target) === item.category);
        const value = targetData?.value || 0;

        // 가이드라인
        if (orientation === 'vertical') {
            const yPos = yScale(value);
            lineTasks.push(
                Helpers.drawHorizontalGuideline(svg, yPos, color, margins, plot.w)
            );
        }

        // 레이블 (서수 + 값)
        const { x, y } = getCenter(item.node, orientation, margins);
        
        const ordinalText = getOrdinal(n);
        const valueText = fmtNum(value);
        const valueWidth = Math.max(30, valueText.length * 7);
        
        // 서수 배경 + 텍스트
        labelTasks.push(Helpers.addLabelBackground(svg, x, y - 25, 30, 14));
        labelTasks.push(Helpers.addValueLabel(svg, x, y - 15, ordinalText, color, { fontSize: 11 }));
        
        // 값 배경 + 텍스트
        labelTasks.push(Helpers.addLabelBackground(svg, x, y - 11, valueWidth, 14));
        labelTasks.push(Helpers.addValueLabel(svg, x, y - 1, valueText, color, { fontSize: 12 }));
    });

    await Promise.all([...lineTasks, ...labelTasks]);

    await Helpers.delay(30);
    signalOpDone(chartId, 'nth');
    return Array.isArray(resultArray) ? resultArray : [];
}

// ============= COUNT (✅ 수정 완료 - 순서 보장) =============
export async function simpleBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const result = dataCount(data, op, xField, yField, isLast);
    const totalCount = result ? Number(result.value) : 0;
    const bars = selectAllMarks(g);
    
    if (bars.empty()) {
        signalOpDone(chartId, 'count');
        return result ? [result] : [];
    }
    
    const hlColor = OP_COLORS.COUNT;
    
    // 🔥 막대를 순서대로 정렬
    const nodes = bars.nodes();
    const items = nodes.map((node) => {
        const x = +node.getAttribute('x') || 0;
        const y = +node.getAttribute('y') || 0;
        const w = +node.getAttribute('width') || 0;
        const h = +node.getAttribute('height') || 0;
        const valueRaw = getMarkValue(node);
        const value = Number.isFinite(+valueRaw) ? +valueRaw : NaN;
        return { node, x, y, w, h, value };
    });
    
    let ordered;
    if (orientation === 'vertical') {
        ordered = items.slice().sort((a, b) => a.x - b.x);
    } else {
        ordered = items.slice().sort((a, b) => a.value - b.value);
    }
    
    // 초기 dim
    await Helpers.fadeElements(bars, OPACITIES.SEMI_DIM, 150);
    
    const n = Math.min(totalCount, ordered.length);
    
    // 순차 카운팅
    for (let i = 0; i < n; i++) {
        const { node } = ordered[i];
        const rect = d3.select(node);
        
        await Helpers.changeBarColor(rect, hlColor, DURATIONS.NTH_HIGHLIGHT);
        await Helpers.fadeElements(rect, OPACITIES.FULL, DURATIONS.NTH_HIGHLIGHT);
        
        const { x, y } = getCenter(node, orientation, margins);
        await Helpers.addValueLabel(
            svg, x, y,
            String(i + 1),
            hlColor,
            { className: 'annotation count-label', fontSize: 12 }
        );
        
        await Helpers.delay(DURATIONS.COUNT_INTERVAL);
    }

    await Helpers.delay(30);
    signalOpDone(chartId, 'count');
    return isLast ? (result ? [result] : []) : (result ? [result] : []);
}
