import {
    simpleBarAverage, simpleBarFilter, simpleBarFindExtremum, simpleBarSort, simpleBarDiff, simpleBarNth,
    simpleBarCount, simpleBarDetermineRange, simpleBarCompare, simpleBarCompareBool, simpleBarSum
} from "../simple/simpleBarFunctions.js";

import {
    retrieveValue as dataRetrieveValue,
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
    determineRange as dataDetermineRange
} from "../../operationFunctions.js";

import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import { OP_COLORS } from "../../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";

// 🔥 템플릿 임포트
import * as Helpers from '../../animationHelpers.js';
import * as Templates from '../../operationTemplates.js';
import { DURATIONS, OPACITIES } from '../../animationConfig.js';

// ---- small helpers ---------------------------------------------------------
const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
export const delay = (ms) => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function waitFrames(n = 1){ for (let i=0;i<n;i++) await nextFrame(); }

function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function getDatumCategoryKey(d) {
    if (!d) return '';
    return String(d.key ?? d.target ?? d.category ?? d.id ?? '');
}
function evalComparison(op, a, b) {
    switch ((op || '').toLowerCase()) {
        case '<':  return a <  b;
        case '<=': return a <= b;
        case '>':  return a >  b;
        case '>=': return a >= b;
        case '==':
        case '=':
        case 'eq': return a === b;
        case '!=':
        case '<>': return a !== b;
        default:   return a > b;
    }
}
function resolveStackedDatum(data, key, sumsMap) {
    const arr = Array.isArray(data) ? data : [];
    const str = String(key);
    let datum = arr.find(d => String(d?.id) === str) || arr.find(d => String(d?.target) === str) || arr.find(d => String(d?.key) === str);
    if (!datum && sumsMap && sumsMap.has(str)) {
        return { datum: null, category: str, value: Number(sumsMap.get(str)) };
    }
    if (!datum) return { datum: null, category: str, value: undefined };
    let numeric = Number(datum.value);
    if (!Number.isFinite(numeric) && datum.measure && datum[datum.measure] !== undefined) numeric = Number(datum[datum.measure]);
    if (!Number.isFinite(numeric) && datum.count   !== undefined) numeric = Number(datum.count);
    if (!Number.isFinite(numeric) && sumsMap) {
        const catKey = String(datum.target ?? datum.key ?? str);
        if (sumsMap.has(catKey)) numeric = Number(sumsMap.get(catKey));
    }
    const category = String(datum.target ?? datum.key ?? str);
    const group = datum.group ?? null;
    return { datum, category, group, value: Number.isFinite(numeric) ? numeric : undefined };
}

export function getSvgAndSetup(chartId) {
    const svgNode = getPrimarySvgElement(chartId);
    const svg = svgNode ? d3.select(svgNode) : d3.select(null);
    const orientation = svgNode?.getAttribute("data-orientation");
    const xField = svgNode?.getAttribute("data-x-field");
    const yField = svgNode?.getAttribute("data-y-field");
    const colorField = svgNode?.getAttribute("data-color-field");
    const margins = { left:+(svgNode?.getAttribute("data-m-left") || 0), top:+(svgNode?.getAttribute("data-m-top") || 0) };
    const plot = { w:+(svgNode?.getAttribute("data-plot-w") || 0), h:+(svgNode?.getAttribute("data-plot-h") || 0) };
    const g = svg.select(".plot-area");
    return { svg, g, orientation, xField, yField, colorField, margins, plot };
}
export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .value-line, .value-tag, .filter-label, .threshold-line, .extremum-highlight, .compare-label").remove();
}

async function stackedBarToSimpleBar(chartId, filteredData) {
    const { svg, g, plot, xField } = getSvgAndSetup(chartId);
    if (!Array.isArray(filteredData)) return [];

    const targetIds = new Set(filteredData.map(d => `${d.target}-${d.group}-${d.value}`));
    const chartRects = g.selectAll("rect");

    // 🔥 템플릿 적용: 강조/디밍
    const hi = [];
    chartRects.each(function(){
        const sel = d3.select(this);
        const d = sel.datum();
        const isTarget = d ? targetIds.has(`${d.key}-${d.subgroup}-${d.value}`) : false;
        hi.push(sel.transition().duration(DURATIONS.HIGHLIGHT)
            .attr("opacity", isTarget ? OPACITIES.FULL : OPACITIES.DIM)
            .attr("stroke", isTarget ? "black" : "none")
            .attr("stroke-width", 1)
            .end());
    });
    await Promise.all(hi);
    await Helpers.delay(30);

    if (filteredData.length === 0) {
        await chartRects.transition().duration(300).attr("opacity", 0).remove().end();
        return [];
    }

    const toRemove = chartRects.filter(d => {
        const dd = d || {};
        return !targetIds.has(`${dd.key}-${dd.subgroup}-${dd.value}`);
    }).transition().duration(300).attr("opacity", 0).remove().end();

    const newYMax = d3.max(filteredData, d => d.value) || 0;
    const y = d3.scaleLinear().domain([0, newYMax]).nice().range([plot.h, 0]);

    const stay = chartRects.filter(d => {
        const dd = d || {};
        return targetIds.has(`${dd.key}-${dd.subgroup}-${dd.value}`);
    });
    const geom = [];
    stay.each(function(){
        const rect = d3.select(this);
        const d = rect.datum();
        const targetKey = d.key;
        const norm = (xField)
            ? { ...d, [xField]: targetKey, target: targetKey, value: d.value }
            : { ...d, target: targetKey, value: d.value };
        rect.datum(norm).attr("data-target", targetKey).attr("data-id", targetKey);
        geom.push(rect.transition().duration(550)
            .attr("y", y(d.value))
            .attr("height", plot.h - y(d.value))
            .attr("stroke-width", 0.5).end());
    });

    const axis = g.select(".y-axis").transition().duration(550).call(d3.axisLeft(y)).end();

    await Promise.all([toRemove, ...geom, axis].filter(Boolean));
    await Helpers.delay(30);
    return filteredData;
}

// 여기서부터는 너무 길어서 part2로 분리합니다

// ============= DETERMINE RANGE (✅ simpleBar와 100% 동일한 애니메이션) =============
export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (!subset.length) return new IntervalValue(op.group, NaN, NaN);
        await stackedBarToSimpleBar(chartId, subset);

        const values = subset.map(d => +d.value);
        const minV = d3.min(values), maxV = d3.max(values);
        const result = new IntervalValue(op.group, minV, maxV);

        const all = g.selectAll('rect');
        const minBars = all.filter(d => +d.value === minV);
        const maxBars = all.filter(d => +d.value === maxV);
        const others  = all.filter(d => +d.value !== minV && +d.value !== maxV);

        const color = OP_COLORS.RANGE;
        const y = d3.scaleLinear().domain([0, d3.max(values)||0]).nice().range([plot.h, 0]);

        // 🔥 simpleBar와 동일: 다른 막대 흐리게 + min/max 강조
        const animationPromises = [];
        
        animationPromises.push(
            Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT)
        );
        animationPromises.push(
            Helpers.fadeElements(minBars, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
        );
        animationPromises.push(
            Helpers.fadeElements(maxBars, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
        );
        
        await Promise.all(animationPromises);

        // 🔥 simpleBar와 동일: 수평선 먼저 그리기
        const lines = [minV, maxV].map(v =>
            Helpers.drawHorizontalGuideline(svg, y(v), color, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
        );
        await Promise.all(lines);

        // 🔥 simpleBar와 동일: Min과 Max 레이블 동시에 표시
        const labelTasks = [];

        const minNodes = minBars.nodes();
        if (minNodes.length) {
            let minY = Infinity, minX = Infinity, maxX = -Infinity;
            minNodes.forEach(n => { 
                const b = n.getBBox(); 
                minY = Math.min(minY, b.y); 
                minX = Math.min(minX, b.x); 
                maxX = Math.max(maxX, b.x + b.width); 
            });
            const cx = minX + (maxX - minX)/2;
            
            labelTasks.push(
                Helpers.addValueLabel(g, cx, minY - 8, `Min: ${fmtNum(minV)}`, color, {
                    textAnchor: 'middle',
                    fontSize: 12,
                    withBackground: true
                })
            );
        }

        const maxNodes = maxBars.nodes();
        if (maxNodes.length) {
            let minY = Infinity, minX = Infinity, maxX = -Infinity;
            maxNodes.forEach(n => { 
                const b = n.getBBox(); 
                minY = Math.min(minY, b.y); 
                minX = Math.min(minX, b.x); 
                maxX = Math.max(maxX, b.x + b.width); 
            });
            const cx = minX + (maxX - minX)/2;
            
            labelTasks.push(
                Helpers.addValueLabel(g, cx, minY - 8, `Max: ${fmtNum(maxV)}`, color, {
                    textAnchor: 'middle',
                    fontSize: 12,
                    withBackground: true
                })
            );
        }

        await Promise.all(labelTasks);
        return result;
    }

    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sums.values());
    if (!totals.length) return new IntervalValue('Stack Totals', NaN, NaN);

    const minTotal = d3.min(totals), maxTotal = d3.max(totals);
    const result = new IntervalValue('Stack Totals', minTotal, maxTotal);

    const all = g.selectAll('rect');
    let minCat, maxCat;
    sums.forEach((sum, cat) => { 
        if (sum === minTotal) minCat = cat; 
        if (sum === maxTotal) maxCat = cat; 
    });

    const minSel = all.filter(d => getDatumCategoryKey(d) === String(minCat));
    const maxSel = all.filter(d => getDatumCategoryKey(d) === String(maxCat));
    const others = all.filter(d => {
        const k = getDatumCategoryKey(d);
        return k !== String(minCat) && k !== String(maxCat);
    });

    const color = OP_COLORS.RANGE;
    const y = d3.scaleLinear().domain([0, d3.max(totals)||0]).nice().range([plot.h, 0]);

    // 🔥 simpleBar와 동일
    await Promise.all([
        Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(minSel, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(maxSel, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
    ]);

    const lines = [minTotal, maxTotal].map(v =>
        Helpers.drawHorizontalGuideline(svg, y(v), color, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
    );
    await Promise.all(lines);

    const labelTasks = [];

    const minNodes = minSel.nodes();
    if (minNodes.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        minNodes.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, `Min: ${fmtNum(minTotal)}`, color, {
                textAnchor: 'middle',
                fontSize: 12,
                withBackground: true
            })
        );
    }

    const maxNodes = maxSel.nodes();
    if (maxNodes.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        maxNodes.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, `Max: ${fmtNum(maxTotal)}`, color, {
                textAnchor: 'middle',
                fontSize: 12,
                withBackground: true
            })
        );
    }

    await Promise.all(labelTasks);
    return result;
}

// ============= COMPARE (✅ simpleBar와 100% 동일한 애니메이션) =============
export async function stackedBarCompare(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opFor = { targetA: op.targetA, targetB: op.targetB, group: op.group ?? null, operator: op.operator, which: op.which, field: op.field || yField || 'value' };
    let winner = dataCompare(data, opFor, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return winner ? [winner] : [];
        await stackedBarToSimpleBar(chartId, subset);

        const values = subset.map(d => ({ target: d.target, value: +d.value }));
        const A = values.find(v => String(v.target) === String(op.targetA));
        const B = values.find(v => String(v.target) === String(op.targetB));
        
        if (!A || !B || !Number.isFinite(A.value) || !Number.isFinite(B.value)) {
            return winner ? [winner] : [];
        }

        const all = g.selectAll('rect');
        const barsA = all.filter(d => String(d.target) === String(op.targetA));
        const barsB = all.filter(d => String(d.target) === String(op.targetB));
        const others = all.filter(d => {
            const t = String(d.target);
            return t !== String(op.targetA) && t !== String(op.targetB);
        });

        const colorA = OP_COLORS.COMPARE_A, colorB = OP_COLORS.COMPARE_B;
        
        // 🔥 simpleBar와 동일: 1단계 - 막대 강조
        await Promise.all([
            Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
            Helpers.changeBarColor(barsA, colorA, DURATIONS.HIGHLIGHT),
            Helpers.fadeElements(barsA, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
            Helpers.changeBarColor(barsB, colorB, DURATIONS.HIGHLIGHT),
            Helpers.fadeElements(barsB, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
        ]);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        // 🔥 simpleBar와 동일: 2단계 - 수평선 그리기
        await Promise.all([
            Helpers.drawHorizontalGuideline(svg, y(A.value), colorA, margins, plot.w, DURATIONS.GUIDELINE_DRAW),
            Helpers.drawHorizontalGuideline(svg, y(B.value), colorB, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
        ]);

        // 🔥 simpleBar와 동일: 3단계 - 값 레이블 표시
        const labelTasks = [];
        const nodesA = barsA.nodes();
        if (nodesA.length) {
            const bb = nodesA[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                Helpers.addValueLabel(g, cx, bb.y - 8, fmtNum(A.value), colorA, {
                    textAnchor: 'middle',
                    fontSize: 12,
                    withBackground: true
                })
            );
        }

        const nodesB = barsB.nodes();
        if (nodesB.length) {
            const bb = nodesB[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                Helpers.addValueLabel(g, cx, bb.y - 8, fmtNum(B.value), colorB, {
                    textAnchor: 'middle',
                    fontSize: 12,
                    withBackground: true
                })
            );
        }

        await Promise.all(labelTasks);

        if (winner) {
            return [new DatumValue(
                winner.category ?? xField,
                winner.measure ?? yField,
                winner.target ?? (A.value >= B.value ? op.targetA : op.targetB),
                subgroup,
                winner.value ?? (A.value >= B.value ? A.value : B.value),
                winner.id
            )];
        }
        return [];
    }

    // 스택 전체 합계 비교
    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    
    const sumA = sums.get(String(op.targetA));
    const sumB = sums.get(String(op.targetB));
    
    if (!Number.isFinite(sumA) || !Number.isFinite(sumB)) {
        console.warn('Compare: could not find sum for targetA or targetB', op.targetA, op.targetB, sums);
        return winner ? [winner] : [];
    }

    const all = g.selectAll('rect');
    const barsA = all.filter(d => getDatumCategoryKey(d) === String(op.targetA));
    const barsB = all.filter(d => getDatumCategoryKey(d) === String(op.targetB));
    const others = all.filter(d => {
        const k = getDatumCategoryKey(d);
        return k !== String(op.targetA) && k !== String(op.targetB);
    });

    const colorA = OP_COLORS.COMPARE_A, colorB = OP_COLORS.COMPARE_B;
    
    // 🔥 simpleBar와 동일
    await Promise.all([
        Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(barsA, colorA, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(barsA, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(barsB, colorB, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(barsB, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
    ]);

    const maxStackTotal = d3.max(Array.from(sums.values())) || 0;
    const y = d3.scaleLinear().domain([0, maxStackTotal]).nice().range([plot.h, 0]);
    
    await Promise.all([
        Helpers.drawHorizontalGuideline(svg, y(sumA), colorA, margins, plot.w, DURATIONS.GUIDELINE_DRAW),
        Helpers.drawHorizontalGuideline(svg, y(sumB), colorB, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
    ]);

    const labelTasks = [];

    const nodesA = barsA.nodes();
    if (nodesA.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        nodesA.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, fmtNum(sumA), colorA, {
                textAnchor: 'middle',
                fontSize: 12,
                withBackground: true
            })
        );
    }

    const nodesB = barsB.nodes();
    if (nodesB.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        nodesB.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, fmtNum(sumB), colorB, {
                textAnchor: 'middle',
                fontSize: 12,
                withBackground: true
            })
        );
    }

    await Promise.all(labelTasks);

    if (winner) {
        const winnerKey = winner?.target ?? (sumA >= sumB ? op.targetA : op.targetB);
        const winnerValue = sumA >= sumB ? sumA : sumB;
        const datum = new DatumValue(
            winner.category ?? xField,
            winner.measure ?? yField,
            String(winnerKey),
            winner.group ?? null,
            winnerValue,
            winner.id ?? undefined
        );
        return [datum];
    }
    return [];
}

// COMPARE_BOOL, DIFF, NTH, COUNT는 동일한 패턴으로 작성...
// 파일이 너무 길어져서 핵심만 보여드렸습니다.

// ============= NTH (✅ simpleBar와 100% 동일한 애니메이션) =============
export async function stackedBarNth(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const getOrdinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subset);

        // 🔥 simpleBar와 동일한 로직
        const nValues = Array.isArray(op.n) ? op.n : [op.n];
        const from = String(op?.from || 'left').toLowerCase();
        const color = OP_COLORS.NTH;

        const all = g.selectAll('rect');
        const cats = [...new Set(subset.map(d => String(d.target)))];
        const seq = from === 'right' ? cats.slice().reverse() : cats;

        // 모든 막대 흐리게
        await Helpers.fadeElements(all, OPACITIES.DIM, 250);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        // 🔥 1단계: 카운팅 애니메이션
        const countedBars = [];
        const maxN = Math.max(...nValues);
        const countLimit = Math.min(maxN, cats.length);

        for (let i = 0; i < countLimit; i++) {
            const c = seq[i];
            const sel = all.filter(d => String(d.target) === c);
            const targetData = subset.find(d => String(d.target) === c);
            
            countedBars.push({ 
                index: i + 1, 
                category: c, 
                selection: sel, 
                value: targetData?.value || 0 
            });
            
            await Helpers.changeBarColor(sel, color, DURATIONS.NTH_HIGHLIGHT);
            await Helpers.fadeElements(sel, OPACITIES.FULL, DURATIONS.NTH_HIGHLIGHT);

            const nodes = sel.nodes();
            if (nodes.length) {
                const bb = nodes[0].getBBox();
                const cx = bb.x + bb.width / 2;
                
                await Helpers.addValueLabel(
                    g, cx, bb.y - 8,
                    String(i + 1),
                    color,
                    { className: 'annotation count-label', fontSize: 14 }
                );
            }
            
            await Helpers.delay(DURATIONS.NTH_COUNT);
        }

        // 🔥 2단계: 선택되지 않은 것들 페이드아웃
        const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
        const finals = [];
        
        countedBars.forEach((item) => {
            if (!selectedIndices.has(item.index)) {
                finals.push(Helpers.fadeElements(item.selection, OPACITIES.DIM, 300));
            }
        });
        finals.push(g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
        await Promise.all(finals);

        // 🔥 3단계: 선택된 것들 강조 + 수평선 + 값 표시 (동시에)
        const lineTasks = [];
        const labelTasks = [];

        nValues.forEach(n => {
            if (n > countLimit) return;
            
            const item = countedBars.find(cb => cb.index === n);
            if (!item) return;

            // 수평선
            const yPos = y(item.value);
            lineTasks.push(
                Helpers.drawHorizontalGuideline(svg, yPos, color, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
            );

            // 값 표시 (서수 + 값)
            const nodes = item.selection.nodes();
            if (nodes.length) {
                const bb = nodes[0].getBBox();
                const cx = bb.x + bb.width / 2;
                
                const ordinalText = getOrdinal(n);
                const valueText = fmtNum(item.value);
                const valueWidth = Math.max(30, valueText.length * 7);
                
                // 서수 배경 + 텍스트
                labelTasks.push(Helpers.addLabelBackground(g, cx, bb.y - 30, 30, 14));
                labelTasks.push(Helpers.addValueLabel(g, cx, bb.y - 20, ordinalText, color, { fontSize: 11 }));
                
                // 값 배경 + 텍스트
                labelTasks.push(Helpers.addLabelBackground(g, cx, bb.y - 16, valueWidth, 14));
                labelTasks.push(Helpers.addValueLabel(g, cx, bb.y - 6, valueText, color, { fontSize: 12 }));
            }
        });

        await Promise.all([...lineTasks]);
        await Promise.all([...labelTasks]);

        const nthOp = { ...op };
        delete nthOp.group;
        const result = dataNth(subset, nthOp);
        return result || [];
    }

    // 🔥 스택 전체 (group 없음)
    const nValues = Array.isArray(op.n) ? op.n : [op.n];
    const from = String(op?.from || 'left').toLowerCase();
    const color = OP_COLORS.NTH;

    const all = g.selectAll('rect');
    const cats = [...new Set(data.map(d => d.target))];
    const seq = from === 'right' ? cats.slice().reverse() : cats;

    // 모든 막대 흐리게
    await Helpers.fadeElements(all, OPACITIES.DIM, 250);

    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const y = d3.scaleLinear().domain([0, d3.max(sums.values()) || 0]).nice().range([plot.h, 0]);

    // 🔥 1단계: 카운팅 애니메이션
    const countedStacks = [];
    const maxN = Math.max(...nValues);
    const countLimit = Math.min(maxN, cats.length);

    for (let i = 0; i < countLimit; i++) {
        const c = seq[i];
        const sel = all.filter(d => getDatumCategoryKey(d) === c);
        
        countedStacks.push({ 
            index: i + 1, 
            category: c, 
            selection: sel 
        });
        
        await Helpers.changeBarColor(sel, color, DURATIONS.NTH_HIGHLIGHT);
        await Helpers.fadeElements(sel, OPACITIES.FULL, DURATIONS.NTH_HIGHLIGHT);

        const nodes = sel.nodes();
        if (nodes.length) {
            let minY = Infinity, minX = Infinity, maxX = -Infinity;
            nodes.forEach(nod => {
                const b = nod.getBBox();
                minY = Math.min(minY, b.y);
                minX = Math.min(minX, b.x);
                maxX = Math.max(maxX, b.x + b.width);
            });
            const cx = minX + (maxX - minX) / 2;
            
            await Helpers.addValueLabel(
                g, cx, minY - 8,
                String(i + 1),
                color,
                { className: 'annotation count-label', fontSize: 14 }
            );
        }
        
        await Helpers.delay(DURATIONS.NTH_COUNT);
    }

    // 🔥 2단계: 선택되지 않은 것들 페이드아웃
    const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
    const finals = [];
    
    countedStacks.forEach((item) => {
        if (!selectedIndices.has(item.index)) {
            finals.push(Helpers.fadeElements(item.selection, OPACITIES.DIM, 300));
        }
    });
    finals.push(g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
    await Promise.all(finals);

    // 🔥 3단계: 선택된 것들 강조 + 수평선 + 값 표시 (동시에)
    const lineTasks = [];
    const labelTasks = [];

    nValues.forEach(n => {
        if (n > countLimit) return;
        
        const item = countedStacks.find(cs => cs.index === n);
        if (!item) return;

        // 수평선
        const targetData = data.filter(d => d.target === item.category);
        const sum = d3.sum(targetData, d => d.value);
        const yPos = y(sum);
        
        lineTasks.push(
            Helpers.drawHorizontalGuideline(svg, yPos, color, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
        );

        // 값 표시 (서수 + 값)
        const nodes = item.selection.nodes();
        if (nodes.length) {
            let minY = Infinity, minX = Infinity, maxX = -Infinity;
            nodes.forEach(nd => {
                const b = nd.getBBox();
                minY = Math.min(minY, b.y);
                minX = Math.min(minX, b.x);
                maxX = Math.max(maxX, b.x + b.width);
            });
            const cx = minX + (maxX - minX) / 2;
            
            const ordinalText = getOrdinal(n);
            const valueText = fmtNum(sum);
            const valueWidth = Math.max(30, valueText.length * 7);
            
            // 서수 배경 + 텍스트
            labelTasks.push(Helpers.addLabelBackground(g, cx, minY - 30, 30, 14));
            labelTasks.push(Helpers.addValueLabel(g, cx, minY - 20, ordinalText, color, { fontSize: 11 }));
            
            // 값 배경 + 텍스트
            labelTasks.push(Helpers.addLabelBackground(g, cx, minY - 16, valueWidth, 14));
            labelTasks.push(Helpers.addValueLabel(g, cx, minY - 6, valueText, color, { fontSize: 12 }));
        }
    });

    await Promise.all([...lineTasks]);
    await Promise.all([...labelTasks]);

    const nthOp = { ...op, groupBy: 'target' };
    const result = dataNth(data, nthOp);
    return result || [];
}

// ============= COUNT (✅ simpleBar와 100% 동일한 애니메이션) =============
export async function stackedBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return [new DatumValue(xField, yField, 'Category Count', subgroup, 0, null)];
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op }; delete op2.group;
        return await simpleBarCount(chartId, op2, subset, isLast);
    }

    const cats = [...new Set(data.map(d => d.target))];
    const total = cats.length;
    const result = new DatumValue(xField, yField, 'Category Count', null, total, null);
    if (total === 0) return [result];

    const all = g.selectAll('rect');
    const color = OP_COLORS.COUNT;

    // 🔥 simpleBar와 동일: 초기 dim
    await Helpers.fadeElements(all, OPACITIES.SEMI_DIM, 150);

    // 🔥 simpleBar와 동일: 순차 카운팅
    for (let i = 0; i < total; i++) {
        const c = cats[i];
        const sel = all.filter(d => getDatumCategoryKey(d) === c);
        
        await Helpers.changeBarColor(sel, color, DURATIONS.NTH_HIGHLIGHT);
        await Helpers.fadeElements(sel, OPACITIES.FULL, DURATIONS.NTH_HIGHLIGHT);

        const nodes = sel.nodes();
        if (nodes.length) {
            let minY = Infinity, minX = Infinity, maxX = -Infinity;
            nodes.forEach(n => { 
                const b = n.getBBox(); 
                minY = Math.min(minY, b.y); 
                minX = Math.min(minX, b.x); 
                maxX = Math.max(maxX, b.x + b.width); 
            });
            const cx = minX + (maxX - minX)/2;
            
            await Helpers.addValueLabel(
                g, cx, minY - 8,
                String(i + 1),
                color,
                { className: 'annotation count-label', fontSize: 12 }
            );
        }
        
        await Helpers.delay(DURATIONS.COUNT_INTERVAL);
    }

    return [result];
}

// ============= SORT (✅ simpleBar와 100% 동일) =============
export async function stackedBarSort(chartId, op, data, isLast = false) {
    const { g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(d3.select(`#${chartId}`).select("svg"));

    if (!Array.isArray(data) || !data.length) return data;

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subgroup, data);
        const op2 = { ...op }; delete op2.group;
        return await simpleBarSort(chartId, op2, subset, isLast);
    }

    const sorted = dataSort(data, { ...op, aggregate: 'sum' }, xField, yField);
    const domain = [...new Set(sorted.map(d => d.target))];
    const x = d3.scaleBand().domain(domain).range([0, plot.w]).padding(0.1);

    // 🔥 simpleBar와 동일: DURATIONS.REPOSITION 사용
    const rectT = g.selectAll("rect").transition().duration(DURATIONS.REPOSITION)
        .attr("x", d => x(d.key)).attr("width", x.bandwidth()).end();
    const axisT = g.select(".x-axis").transition().duration(DURATIONS.REPOSITION).call(d3.axisBottom(x)).end();

    await Promise.all([rectT, axisT]);
    await Helpers.delay(30);
    return sorted;
}

// ============= SUM (✅ simpleBar와 100% 동일) =============
export async function stackedBarSum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, yField, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op }; delete op2.group;
        return await simpleBarSum(chartId, op2, subset, isLast);
    }

    const rawResult = dataSum(data, op, xField, yField, isLast);
    const total = rawResult ? rawResult.value : 0;
    if (!rawResult) return [];

    const datumResult = new DatumValue(
        rawResult.category ?? (yField || 'value'),
        rawResult.measure ?? (yField || 'value'),
        rawResult.target ?? 'Sum',
        rawResult.group ?? null,
        rawResult.value,
        rawResult.id
    );

    if (!Number.isFinite(total) || total === 0) {
        return [datumResult];
    }

    const all = g.selectAll("rect");
    const y = d3.scaleLinear().domain([0, total]).nice().range([plot.h, 0]);

    // 🔥 simpleBar와 동일: DURATIONS.STACK 사용
    const yAxisT = svg.select(".y-axis").transition().duration(DURATIONS.STACK).call(d3.axisLeft(y)).end();

    const states = [];
    all.each(function(){
        states.push({ node:this, x:+this.getAttribute('x'), y:+this.getAttribute('y'), d:d3.select(this).datum() });
    });
    states.sort((a,b)=> a.x - b.x || b.y - a.y);

    const bw = all.size() ? +all.node().getAttribute('width') : 20;
    const targetX = plot.w/2 - bw/2;
    let running = 0;

    const moves = states.map(s => {
        const v = +s.d.value || 0;
        const t = d3.select(s.node).transition().duration(DURATIONS.STACK).ease(d3.easeCubicInOut)
            .attr('x', targetX).attr('width', bw)
            .attr('y', y(running + v))
            .attr('height', y(0) - y(v))
            .end();
        running += v;
        return t;
    });

    await Promise.all([yAxisT, ...moves]);
    await Helpers.delay(DURATIONS.SUM_DELAY);

    // 🔥 simpleBar와 동일: 수평선 + 레이블
    const yPos = margins.top + y(total);
    const color = OP_COLORS.SUM;
    
    await svg.append("line").attr("class","annotation sum-line")
        .attr("x1", margins.left).attr("x2", margins.left)
        .attr("y1", yPos).attr("y2", yPos)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(DURATIONS.GUIDELINE_DRAW).attr("x2", margins.left + plot.w).end();

    await Helpers.addValueLabel(svg, plot.w/2, yPos - margins.top - 10, `Sum: ${fmtNum(total)}`, color, {
        textAnchor: 'middle',
        fontSize: 12,
        withBackground: true,
        useSvgCoords: true
    });

    await Helpers.delay(30);
    return [datumResult];
}

// ============= AVERAGE (✅ simpleBar와 100% 동일) =============
export async function stackedBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op, field: 'value' }; delete op2.group;
        return await simpleBarAverage(chartId, op2, subset, isLast);
    }

    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sums.values());
    if (!totals.length) return [];

    const avg = d3.mean(totals);
    if (!Number.isFinite(avg)) return [];

    const result = dataAverage(data, op, xField, yField, isLast);

    const y = d3.scaleLinear().domain([0, d3.max(totals) || 0]).nice().range([plot.h, 0]);
    const yPos = y(avg);
    const color = OP_COLORS.AVERAGE;

    // 🔥 simpleBar와 동일: 가이드라인 먼저 그리기
    await Helpers.drawHorizontalGuideline(g, yPos, color, {left: 0, top: 0}, plot.w, DURATIONS.GUIDELINE_DRAW);

    // 🔥 simpleBar와 동일: 레이블 표시
    await Helpers.addValueLabel(g, plot.w/2, yPos - 10, `Avg: ${fmtNum(avg)}`, color, {
        textAnchor: 'middle',
        fontSize: 12,
        withBackground: true,
        delay: 150
    });

    await Helpers.delay(30);
    return result;
}

// ============= DIFF (✅ simpleBar와 100% 동일한 4단계 애니메이션) =============
export async function stackedBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const semantic = dataDiff(data, { targetA: op.targetA, targetB: op.targetB, group: op.group ?? null, field: op.field }, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return semantic ? [new DatumValue(semantic.category, semantic.measure, semantic.target, subgroup, Math.abs(semantic.value), null)] : [];
        await stackedBarToSimpleBar(chartId, subset);

        const values = subset.map(d => ({ target: d.target, value: +d.value }));
        const A = values.find(v => String(v.target) === String(op.targetA));
        const B = values.find(v => String(v.target) === String(op.targetB));
        
        if (!A || !B || !Number.isFinite(A.value) || !Number.isFinite(B.value)) {
            if (semantic) {
                const v = op.signed ? semantic.value : Math.abs(semantic.value);
                return [new DatumValue(semantic.category, semantic.measure, semantic.target, semantic.group ?? null, v, semantic.id)];
            }
            return [];
        }

        const all = g.selectAll('rect');
        const barsA = all.filter(d => String(d.target) === String(op.targetA));
        const barsB = all.filter(d => String(d.target) === String(op.targetB));
        const others = all.filter(d => {
            const t = String(d.target);
            return t !== String(op.targetA) && t !== String(op.targetB);
        });

        const colorA = OP_COLORS.DIFF_A;
        const colorB = OP_COLORS.DIFF_B;
        const diffColor = OP_COLORS.DIFF_LINE;
        
        // 🔥 1단계: 막대 강조 (simpleBar와 동일)
        await Promise.all([
            Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
            Helpers.changeBarColor(barsA, colorA, DURATIONS.HIGHLIGHT),
            Helpers.fadeElements(barsA, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
            Helpers.changeBarColor(barsB, colorB, DURATIONS.HIGHLIGHT),
            Helpers.fadeElements(barsB, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
        ]);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        // 🔥 2단계: 수평선 그리기 (simpleBar와 동일)
        await Promise.all([
            Helpers.drawHorizontalGuideline(svg, y(A.value), colorA, margins, plot.w, DURATIONS.GUIDELINE_DRAW),
            Helpers.drawHorizontalGuideline(svg, y(B.value), colorB, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
        ]);

        // 🔥 3단계: 값 레이블 표시 (simpleBar와 동일)
        const labelTasks = [];
        const nodesA = barsA.nodes();
        if (nodesA.length) {
            const bb = nodesA[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                Helpers.addValueLabel(g, cx, bb.y - 8, fmtNum(A.value), colorA, {
                    textAnchor: 'middle',
                    fontSize: 14,
                    withBackground: true
                })
            );
        }

        const nodesB = barsB.nodes();
        if (nodesB.length) {
            const bb = nodesB[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                Helpers.addValueLabel(g, cx, bb.y - 8, fmtNum(B.value), colorB, {
                    textAnchor: 'middle',
                    fontSize: 14,
                    withBackground: true
                })
            );
        }

        await Promise.all(labelTasks);

        // 🔥 4단계: 브리지 라인 (simpleBar와 동일)
        const diff = op.signed ? (A.value - B.value) : Math.abs(A.value - B.value);
        
        await Templates.rangeBridgePattern({
            svg: svg,
            margins: margins,
            plot: plot,
            orientation: 'vertical',
            valueA: A.value,
            valueB: B.value,
            yScale: y,
            color: diffColor,
            labelText: `Diff: ${fmtNum(diff)}`
        });

        const diffDatum = new DatumValue(xField, yField, "Diff", subgroup, diff);
        return [diffDatum];
    }

    // 스택 전체 합계 diff
    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    
    const sumA = sums.get(String(op.targetA));
    const sumB = sums.get(String(op.targetB));
    
    if (!Number.isFinite(sumA) || !Number.isFinite(sumB)) {
        if (semantic) {
            const v = op.signed ? semantic.value : Math.abs(semantic.value);
            return [new DatumValue(semantic.category, semantic.measure, semantic.target, semantic.group ?? null, v, semantic.id)];
        }
        return [];
    }

    const diff = op.signed ? (sumA - sumB) : Math.abs(sumA - sumB);
    const diffDatum = new DatumValue(xField, yField, "Diff", null, diff);

    const all = g.selectAll('rect');
    const barsA = all.filter(d => getDatumCategoryKey(d) === String(op.targetA));
    const barsB = all.filter(d => getDatumCategoryKey(d) === String(op.targetB));
    const others = all.filter(d => {
        const k = getDatumCategoryKey(d);
        return k !== String(op.targetA) && k !== String(op.targetB);
    });

    const colorA = OP_COLORS.DIFF_A;
    const colorB = OP_COLORS.DIFF_B;
    const diffColor = OP_COLORS.DIFF_LINE;

    // 🔥 simpleBar와 100% 동일한 4단계
    // 1단계: 막대 강조
    await Promise.all([
        Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(barsA, colorA, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(barsA, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(barsB, colorB, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(barsB, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
    ]);

    const y = d3.scaleLinear().domain([0, d3.max(Array.from(sums.values())) || 0]).nice().range([plot.h, 0]);

    // 2단계: 수평선
    await Promise.all([
        Helpers.drawHorizontalGuideline(svg, y(sumA), colorA, margins, plot.w, DURATIONS.GUIDELINE_DRAW),
        Helpers.drawHorizontalGuideline(svg, y(sumB), colorB, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
    ]);

    // 3단계: 값 레이블
    const labelTasks = [];

    const nodesA = barsA.nodes();
    if (nodesA.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        nodesA.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, fmtNum(sumA), colorA, {
                textAnchor: 'middle',
                fontSize: 14,
                withBackground: true
            })
        );
    }

    const nodesB = barsB.nodes();
    if (nodesB.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        nodesB.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, fmtNum(sumB), colorB, {
                textAnchor: 'middle',
                fontSize: 14,
                withBackground: true
            })
        );
    }

    await Promise.all(labelTasks);

    // 4단계: 브리지 라인
    await Templates.rangeBridgePattern({
        svg: svg,
        margins: margins,
        plot: plot,
        orientation: 'vertical',
        valueA: sumA,
        valueB: sumB,
        yScale: y,
        color: diffColor,
        labelText: `Diff: ${fmtNum(diff)}`
    });

    await Helpers.delay(300);
    return [diffDatum];
}

// ============= COMPARE BOOL (✅ simpleBar와 100% 동일) =============
export async function stackedBarCompareBool(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (isLast) {
        const simpleVerdict = await simpleBarCompareBool(chartId, op, data, true);
        if (Array.isArray(simpleVerdict)) return simpleVerdict;
        if (simpleVerdict instanceof BoolValue) return [simpleVerdict];
        const findValue = (key) => {
            const str = String(key);
            const hit = data.find(d => String(d?.id) === str) || data.find(d => String(d?.target) === str);
            return hit ? Number(hit.value) : NaN;
        };
        const a = findValue(op.targetA), b = findValue(op.targetB);
        const res = evalComparison(op.operator, a, b);
        const label = op.field || (simpleVerdict && simpleVerdict.category) || yField || 'value';
        return [new BoolValue(label, res)];
    }

    const opFor = { targetA: op.targetA, targetB: op.targetB, group: op.group ?? null, operator: op.operator, field: op.field || yField || 'value' };
    const verdict = isLast ? null : dataCompareBool(data, opFor, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return [new BoolValue(op.field || yField || 'value', false)];
        await stackedBarToSimpleBar(chartId, subset);

        const values = subset.map(d => ({ target: d.target, value: +d.value }));
        const A = values.find(v => String(v.target) === String(op.targetA));
        const B = values.find(v => String(v.target) === String(op.targetB));
        
        if (!A || !B || !Number.isFinite(A.value) || !Number.isFinite(B.value)) {
            return [new BoolValue(op.field || yField || 'value', false)];
        }

        const bool = evalComparison(op.operator, A.value, B.value);
        const colorA = OP_COLORS.COMPARE_A;
        const colorB = OP_COLORS.COMPARE_B;

        const all = g.selectAll('rect');
        const barsA = all.filter(d => String(d.target) === String(op.targetA));
        const barsB = all.filter(d => String(d.target) === String(op.targetB));
        const others = all.filter(d => {
            const t = String(d.target);
            return t !== String(op.targetA) && t !== String(op.targetB);
        });
        
        // 🔥 simpleBar와 동일: compare와 같은 3단계
        await Promise.all([
            Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
            Helpers.changeBarColor(barsA, colorA, DURATIONS.HIGHLIGHT),
            Helpers.fadeElements(barsA, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
            Helpers.changeBarColor(barsB, colorB, DURATIONS.HIGHLIGHT),
            Helpers.fadeElements(barsB, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
        ]);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        await Promise.all([
            Helpers.drawHorizontalGuideline(svg, y(A.value), colorA, margins, plot.w, DURATIONS.GUIDELINE_DRAW),
            Helpers.drawHorizontalGuideline(svg, y(B.value), colorB, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
        ]);

        const labelTasks = [];
        const nodesA = barsA.nodes();
        if (nodesA.length) {
            const bb = nodesA[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                Helpers.addValueLabel(g, cx, bb.y - 8, fmtNum(A.value), colorA, {
                    textAnchor: 'middle',
                    fontSize: 12,
                    withBackground: true
                })
            );
        }

        const nodesB = barsB.nodes();
        if (nodesB.length) {
            const bb = nodesB[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                Helpers.addValueLabel(g, cx, bb.y - 8, fmtNum(B.value), colorB, {
                    textAnchor: 'middle',
                    fontSize: 12,
                    withBackground: true
                })
            );
        }

        await Promise.all(labelTasks);

        return [new BoolValue(op.field || yField || 'value', bool, verdict?.id ?? null)];
    }

    // 스택 전체 합계 비교
    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    
    const sumA = sums.get(String(op.targetA));
    const sumB = sums.get(String(op.targetB));
    
    if (!Number.isFinite(sumA) || !Number.isFinite(sumB)) {
        return [new BoolValue(op.field || yField || 'value', false)];
    }

    const bool = (verdict && typeof verdict.bool === 'boolean') ? verdict.bool : evalComparison(op.operator, sumA, sumB);
    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;

    const all = g.selectAll('rect');
    const barsA = all.filter(d => getDatumCategoryKey(d) === String(op.targetA));
    const barsB = all.filter(d => getDatumCategoryKey(d) === String(op.targetB));
    const others = all.filter(d => {
        const k = getDatumCategoryKey(d);
        return k !== String(op.targetA) && k !== String(op.targetB);
    });
    
    // 🔥 simpleBar와 100% 동일
    await Promise.all([
        Helpers.fadeElements(others, OPACITIES.DIM, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(barsA, colorA, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(barsA, OPACITIES.FULL, DURATIONS.HIGHLIGHT),
        Helpers.changeBarColor(barsB, colorB, DURATIONS.HIGHLIGHT),
        Helpers.fadeElements(barsB, OPACITIES.FULL, DURATIONS.HIGHLIGHT)
    ]);

    const maxStackTotal = d3.max(Array.from(sums.values())) || 0;
    const y = d3.scaleLinear().domain([0, maxStackTotal]).nice().range([plot.h, 0]);
    
    await Promise.all([
        Helpers.drawHorizontalGuideline(svg, y(sumA), colorA, margins, plot.w, DURATIONS.GUIDELINE_DRAW),
        Helpers.drawHorizontalGuideline(svg, y(sumB), colorB, margins, plot.w, DURATIONS.GUIDELINE_DRAW)
    ]);

    const labelTasks = [];

    const nodesA = barsA.nodes();
    if (nodesA.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        nodesA.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, fmtNum(sumA), colorA, {
                textAnchor: 'middle',
                fontSize: 12,
                withBackground: true
            })
        );
    }

    const nodesB = barsB.nodes();
    if (nodesB.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity;
        nodesB.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y); 
            minX = Math.min(minX, b.x); 
            maxX = Math.max(maxX, b.x + b.width); 
        });
        const cx = minX + (maxX - minX)/2;
        
        labelTasks.push(
            Helpers.addValueLabel(g, cx, minY - 8, fmtNum(sumB), colorB, {
                textAnchor: 'middle',
                fontSize: 12,
                withBackground: true
            })
        );
    }

    await Promise.all(labelTasks);

    return [new BoolValue(op.field || verdict?.category || yField || 'value', bool, verdict?.id ?? null)];
}