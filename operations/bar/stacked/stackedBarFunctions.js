import {
    simpleBarAverage,
    simpleBarFilter,
    simpleBarFindExtremum,
    simpleBarSort,
    simpleBarDiff,
    simpleBarNth,
    simpleBarCount,
    simpleBarDetermineRange,
    simpleBarCompare,
    simpleBarCompareBool,
    simpleBarSum
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
    determineRange as dataDetermineRange,
    lagDiff as dataLagDiff
} from "../../operationFunctions.js";

import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";
import { OP_COLORS } from "../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";
import { normalizeLagDiffResults } from "../../common/lagDiffHelpers.js";

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

    // 강조/디밍
    const hi = [];
    chartRects.each(function(){
        const sel = d3.select(this);
        const d = sel.datum();
        const isTarget = d ? targetIds.has(`${d.key}-${d.subgroup}-${d.value}`) : false;
        hi.push(sel.transition().duration(400)
            .attr("opacity", isTarget ? 1 : 0.2)
            .attr("stroke", isTarget ? "black" : "none")
            .attr("stroke-width", 1)
            .end());
    });
    await Promise.all(hi);
    await waitFrames(1);

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
        // simple-bar 스키마로 정규화
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
    await waitFrames(1);
    return filteredData;
}

export async function stackedBarFilter(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, colorField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        const subgroup = String(op.group);
        const seriesData = dataFilter(data, { field: 'group', operator: '==', value: subgroup }, xField, yField, isLast);
        await stackedBarToSimpleBar(chartId, seriesData);
        const op2 = { ...op }; delete op2.group;
        return await simpleBarFilter(chartId, op2, seriesData, isLast);
    }

    // 스택 합 기준 필터(측정값)에 대응
    let keepCategories = new Set();
    const categoryField = xField;
    const measureField = yField;
    const normalizedColorField = colorField ? String(colorField).toLowerCase() : '';
    const normalizedFilterField = op?.field ? String(op.field).toLowerCase() : '';
    const matchesColorField = normalizedColorField && normalizedFilterField && normalizedColorField === normalizedFilterField;

    if (op.field === measureField) {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const cmp = cmpMap[op.operator];
        if (cmp) {
            sumsByCategory.forEach((sum, cat) => { if (cmp(sum, op.value)) keepCategories.add(String(cat)); });
        }
    } else if (op.field === categoryField) {
        const filteredByTarget = dataFilter(data, { field: 'target', operator: op.operator, value: op.value }, xField, yField, isLast);
        keepCategories = new Set(filteredByTarget.map(d => d.target));
    } else if (matchesColorField) {
        const groupScopedOp = { ...op, field: 'group' };
        const subset = dataFilter(data, groupScopedOp, xField, yField, isLast) || [];
        if (!subset.length) {
            console.warn('[stackedBarFilter] No matches for subgroup filter', op);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        return subset;
    }

    if (op.field === measureField && Number.isFinite(op.value)) {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const maxTotal = d3.max(sumsByCategory.values()) || 0;
        const y = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
        const yPos = y(op.value);

        const line = g.append('line').attr('class','annotation threshold-line')
            .attr('x1',0).attr('y1',yPos).attr('x2',0).attr('y2',yPos)
            .attr('stroke', OP_COLORS.FILTER_THRESHOLD).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
            .transition().duration(600).attr('x2', plot.w).end();

        const text = g.append('text').attr('class','annotation threshold-label')
            .attr('x', plot.w - 5).attr('y', yPos - 6).attr('text-anchor','end')
            .attr('fill', OP_COLORS.FILTER_THRESHOLD).attr('font-size', 12).attr('font-weight','bold')
            .attr('opacity', 0).text(`${op.value}`)
            .transition().duration(400).attr('opacity', 1).end();

        await Promise.all([line, text]);
    }

    const allRects = g.selectAll('rect');
    const keepSel = allRects.filter(d => keepCategories.has(getDatumCategoryKey(d)));
    const dropSel = allRects.filter(d => !keepCategories.has(getDatumCategoryKey(d)));

    await dropSel.transition().duration(400).attr("opacity", 0).remove().end();

    const newX = d3.scaleBand().domain(Array.from(keepCategories)).range([0, plot.w]).padding(0.1);
    const rectT = keepSel.transition().duration(650)
        .attr("x", d => newX(getDatumCategoryKey(d)))
        .attr("width", newX.bandwidth()).end();
    const axisT = g.select(".x-axis").transition().duration(650).call(d3.axisBottom(newX)).end();

    await Promise.all([rectT, axisT]);
    await waitFrames(1);

    return data.filter(d => keepCategories.has(String(d?.target ?? getDatumCategoryKey(d))));
}

export async function stackedBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subset);

        const selected = dataRetrieveValue(subset, op, isLast) || [];
        const targets = new Set(selected.map(d => String(d.target)));
        const color = OP_COLORS.RETRIEVE_VALUE;

        const bars = g.selectAll('rect');
        const target = bars.filter(d => targets.has(getDatumCategoryKey(d)));
        const others = bars.filter(d => !targets.has(getDatumCategoryKey(d)));

        await Promise.all([
            others.transition().duration(300).attr('opacity', 0.25).end(),
            target.transition().duration(300).attr('opacity', 1).attr('stroke', color).attr('stroke-width', 2).end()
        ]);

        let xScale, yScale;
        if (orientation === 'horizontal') {
            yScale = d3.scaleBand().domain(subset.map(d=>String(d.target))).range([0, plot.h]).padding(0.2);
            const xMax = d3.max(subset, d => +d.value) || 0;
            xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        } else {
            xScale = d3.scaleBand().domain(subset.map(d=>String(d.target))).range([0, plot.w]).padding(0.2);
            const yMax = d3.max(subset, d => +d.value) || 0;
            yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        }

        const lineIns = [];
        if (orientation === 'horizontal') {
            selected.forEach(dv => {
                const y = margins.top + yScale(String(dv.target)) + yScale.bandwidth()/2;
                const x = margins.left + xScale(dv.value);
                const l = svg.append('line').attr('class','annotation retrieve-line')
                    .attr('x1', x).attr('y1', y).attr('x2', x).attr('y2', y)
                    .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray','5 5')
                    .transition().duration(350).attr('y2', margins.top).end();
                lineIns.push(l);
            });
        } else {
            selected.forEach(dv => {
                const x = margins.left + xScale(String(dv.target)) + xScale.bandwidth()/2;
                const y = margins.top + yScale(dv.value);
                const l = svg.append('line').attr('class','annotation retrieve-line')
                    .attr('x1', x).attr('y1', y).attr('x2', x).attr('y2', y)
                    .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray','5 5')
                    .transition().duration(350).attr('x2', margins.left).end();
                lineIns.push(l);
            });
        }
        await Promise.all(lineIns);

        const tagIns = [];
        target.each(function(){
            const b = this.getBBox();
            const x = b.x + b.width/2, y = Math.min(b.y, b.y + b.height) - 6;
            const val = +d3.select(this).datum()?.value;
            if (Number.isFinite(val)) {
                tagIns.push(
                    g.append('text').attr('class','annotation value-tag')
                        .attr('x', x).attr('y', y).attr('text-anchor','middle')
                        .attr('font-size', 12).attr('font-weight','bold')
                        .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
                        .text(fmtNum(val)).attr('opacity', 0)
                        .transition().duration(300).attr('opacity', 1).end()
                );
            }
        });
        await Promise.all(tagIns);
        await waitFrames(1);
        return selected;
    }

    const color = OP_COLORS.RETRIEVE_VALUE;
    const matched = dataRetrieveValue(data, isLast ? { ...op } : { target: op.target }, isLast) || [];
    if (!matched.length) return [];

    const total = d3.sum(matched, d => d.value);
    const targetKey = String(matched[0]?.target ?? matched[0]?.category ?? matched[0]?.key ?? op.target);

    const targetRects = g.selectAll('rect').filter(d => getDatumCategoryKey(d) === targetKey);
    const others = g.selectAll('rect').filter(d => getDatumCategoryKey(d) !== targetKey);

    await Promise.all([
        others.transition().duration(300).attr('opacity', 0.25).end(),
        targetRects.transition().duration(300).attr('opacity', 1).attr('stroke','black').attr('stroke-width',1).end()
    ]);

    if (!targetRects.empty()) {
        let minY = Infinity, last;
        targetRects.nodes().forEach(n => { const bb = n.getBBox(); minY = Math.min(minY, bb.y); last = bb; });
        const labelX = last.x + last.width/2;
        const labelY = minY - 8;

        const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const yMax = d3.max(sums.values()) || 0;
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = y(total);

        const t = g.append('text').attr('class','annotation value-tag')
            .attr('x', labelX).attr('y', labelY).attr('text-anchor','middle')
            .attr('font-size', 12).attr('font-weight','bold')
            .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
            .text(fmtNum(total)).attr('opacity', 0).transition().duration(250).attr('opacity', 1).end();

        const l = svg.append('line').attr('class','annotation retrieve-line')
            .attr('x1', margins.left + labelX).attr('x2', margins.left + labelX)
            .attr('y1', margins.top + yPos).attr('y2', margins.top + yPos)
            .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray','5 5')
            .attr('opacity', 0).transition().duration(350).attr('x1', margins.left).attr('opacity', 1).end();

        await Promise.all([t, l]);
    }

    const first = matched[0];
    return [new DatumValue(first.category, first.measure, first.target, null, total, `${targetKey}-total`)];
}

export async function stackedBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, yField, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const color = OP_COLORS.EXTREMUM;

    const drawGuideAt = async (val, domainMax) => {
        if (!Number.isFinite(val)) return;
        const y = d3.scaleLinear().domain([0, domainMax || 0]).nice().range([plot.h, 0]);
        const yPos = margins.top + y(val);
        const line = svg.append('line').attr('class','annotation')
            .attr('x1', margins.left).attr('y1', yPos).attr('x2', margins.left).attr('y2', yPos)
            .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray','5 5')
            .transition().duration(450).attr('x2', margins.left + plot.w).end();
        await line;
    };

    const labelBar = (node, text) => {
        if (!node) return;
        const bb = node.getBBox();
        const x = margins.left + bb.x + bb.width/2;
        const y = margins.top + bb.y - 6;
        return svg.append('text').attr('class','annotation')
            .attr('x', x).attr('y', y).attr('text-anchor','middle')
            .attr('font-size', 12).attr('font-weight','bold')
            .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
            .text(text).attr('opacity',0).transition().duration(350).attr('opacity',1).end();
    };

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subset);

        const target = dataFindExtremum(subset, op, xField, yField, isLast);
        if (!target) return [];
        const maxV = d3.max(subset, d => +d.value) || 0;
        await drawGuideAt(+target.value, maxV);

        const sel = g.selectAll('rect').filter(d => getDatumCategoryKey(d) === String(target.target));
        const others = g.selectAll('rect').filter(d => getDatumCategoryKey(d) !== String(target.target));

        await Promise.all([
            others.transition().duration(400).attr('opacity', 0.2).end(),
            sel.transition().duration(400).attr('fill', color).attr('stroke','black').attr('stroke-width',1).end()
        ]);
        await labelBar(sel.node(), `${op?.which==='min'?'Min':'Max'}: ${fmtNum(+target.value)}`);
        return [target];
    }

    if (op.category != null) {
        const cat = String(op.category);
        const subset = data.filter(d => String(d.target) === cat);
        const target = dataFindExtremum(subset, op, xField, yField, isLast);
        if (!target) return [];
        const globalMax = d3.max(data, d => +d.value) || 0;
        await drawGuideAt(+target.value, globalMax);

        const all = g.selectAll('rect');
        const hit = all.filter(d => getDatumCategoryKey(d) === cat && String(d.subgroup) === String(target.group));
        const othersInCat = all.filter(d => getDatumCategoryKey(d) === cat && String(d.subgroup) !== String(target.group));
        const rest = all.filter(d => getDatumCategoryKey(d) !== cat);

        await Promise.all([
            rest.transition().duration(400).attr('opacity', 0.2).end(),
            othersInCat.transition().duration(400).attr('opacity', 0.6).end(),
            hit.transition().duration(400).attr('fill', color).attr('stroke','black').attr('stroke-width',1).end()
        ]);
        await labelBar(hit.node(), `${op?.which==='min'?'Min':'Max'}: ${fmtNum(+target.value)}`);
        return [target];
    }

    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sums.entries(), ([key, value]) => ({ target: key, value }));
    const extremumTotal = dataFindExtremum(totals, op, xField, yField, isLast);
    if (!extremumTotal) return [];

    const yMaxTotal = d3.max(totals, d => d.value) || 0;
    await drawGuideAt(+extremumTotal.value, yMaxTotal);

    const allRects = g.selectAll('rect');
    const targetRects = allRects.filter(d => getDatumCategoryKey(d) === String(extremumTotal.target));
    const others = allRects.filter(d => getDatumCategoryKey(d) !== String(extremumTotal.target));

    await Promise.all([
        others.transition().duration(400).attr('opacity', 0.2).end(),
        targetRects.transition().duration(400).attr('opacity', 1).attr('stroke','black').attr('stroke-width',0.5).end()
    ]);

    await svg.append('text').attr('class','annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 12).attr('font-weight','bold').attr('fill', color)
        .attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
        .text(`${op.which} Total: ${fmtNum(+extremumTotal.value)}`)
        .attr('opacity',0).transition().duration(350).attr('opacity',1).end();

    return [data.find(d => String(d.target) === String(extremumTotal.target)) || extremumTotal];
}

export async function stackedBarSort(chartId, op, data, isLast = false) {
    const { g, xField, yField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(d3.select(`#${chartId}`).select("svg"));

    if (!Array.isArray(data) || !data.length) return data;

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (!subset.length) return [];
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op }; delete op2.group;
        return await simpleBarSort(chartId, op2, subset, isLast);
    }

    const sorted = dataSort(data, { ...op, aggregate: 'sum' }, xField, yField);
    const domain = [...new Set(sorted.map(d => d.target))];
    const x = d3.scaleBand().domain(domain).range([0, plot.w]).padding(0.1);

    const rectT = g.selectAll("rect").transition().duration(800)
        .attr("x", d => x(d.key)).attr("width", x.bandwidth()).end();
    const axisT = g.select(".x-axis").transition().duration(800).call(d3.axisBottom(x)).end();

    await Promise.all([rectT, axisT]);
    await waitFrames(1);
    return sorted;
}

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

    const yAxisT = svg.select(".y-axis").transition().duration(1000).call(d3.axisLeft(y)).end();

    // 현재 좌표 기록 후, 가운데로 스택 쌓기
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
        const t = d3.select(s.node).transition().duration(1200).ease(d3.easeCubicInOut)
            .attr('x', targetX).attr('width', bw)
            .attr('y', y(running + v))
            .attr('height', y(0) - y(v))
            .end();
        running += v;
        return t;
    });

    await Promise.all([yAxisT, ...moves]);
    await delay(250);

    const yPos = margins.top + y(total);
    await svg.append("line").attr("class","annotation sum-line")
        .attr("x1", margins.left).attr("x2", margins.left)
        .attr("y1", yPos).attr("y2", yPos)
        .attr("stroke", OP_COLORS.SUM).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(500).attr("x2", margins.left + plot.w).end();

    await svg.append("text").attr("class","annotation sum-label")
        .attr("x", margins.left + plot.w/2).attr("y", yPos - 10).attr("text-anchor","middle")
        .attr("font-size", 12).attr("font-weight","bold").attr("fill", OP_COLORS.SUM)
        .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
        .text(`Sum: ${fmtNum(total)}`).attr('opacity',0)
        .transition().duration(350).attr('opacity',1).end();

    await waitFrames(1);
    return [datumResult];
}

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

    const line = g.append('line').attr('class','annotation avg-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', yPos).attr('y2', yPos)
        .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
        .transition().duration(700).attr('x2', plot.w).end();

    const text = g.append('text').attr('class','annotation avg-label')
        .attr('x', plot.w/2).attr('y', yPos - 10).attr('text-anchor','middle')
        .attr('font-size', 12).attr('font-weight','bold')
        .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
        .text(`Avg: ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
        .attr('opacity', 0).transition().delay(150).duration(400).attr('opacity', 1).end();

    await Promise.all([line, text]);
    await waitFrames(1);
    return result;
}

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

        await Promise.all([
            others.transition().duration(500).attr('opacity', 0.2).end(),
            minBars.transition().duration(500).attr('opacity', 1).end(),
            maxBars.transition().duration(500).attr('opacity', 1).end()
        ]);

        // 🔥 1단계: 수평선 먼저 그리기
        const lines = [minV, maxV].map(v =>
            svg.append('line').attr('class','annotation')
                .attr('x1', margins.left).attr('y1', margins.top + y(v))
                .attr('x2', margins.left).attr('y2', margins.top + y(v))
                .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray','5 5')
                .transition().duration(700).attr('x2', margins.left + plot.w).end()
        );
        await Promise.all(lines);

        // 🔥 2단계: Min과 Max 값 레이블 동시에 표시
        const labelTasks = [];

        // Min 막대 위에 값 표시
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
                g.append('text').attr('class','annotation value-label')
                    .attr('x', cx).attr('y', minY - 8).attr('text-anchor','middle')
                    .attr('font-size', 12).attr('font-weight','bold')
                    .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
                    .text(`Min: ${fmtNum(minV)}`).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
            );
        }

        // Max 막대 위에 값 표시
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
                g.append('text').attr('class','annotation value-label')
                    .attr('x', cx).attr('y', minY - 8).attr('text-anchor','middle')
                    .attr('font-size', 12).attr('font-weight','bold')
                    .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
                    .text(`Max: ${fmtNum(maxV)}`).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
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

    // 강조
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

    await Promise.all([
        others.transition().duration(500).attr('opacity', 0.2).end(),
        minSel.transition().duration(500).attr('opacity', 1).end(),
        maxSel.transition().duration(500).attr('opacity', 1).end()
    ]);

    // 🔥 1단계: 수평선 먼저 그리기
    const lines = [minTotal, maxTotal].map(v =>
        svg.append('line').attr('class','annotation')
            .attr('x1', margins.left).attr('y1', margins.top + y(v))
            .attr('x2', margins.left).attr('y2', margins.top + y(v))
            .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray','5 5')
            .transition().duration(700).attr('x2', margins.left + plot.w).end()
    );
    await Promise.all(lines);

    // 🔥 2단계: Min과 Max 값 레이블 동시에 표시
    const labelTasks = [];

    // Min 막대 스택 위에 값 표시
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
            g.append('text').attr('class','annotation value-label')
                .attr('x', cx).attr('y', minY - 8).attr('text-anchor','middle')
                .attr('font-size', 12).attr('font-weight','bold')
                .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
                .text(`Min: ${fmtNum(minTotal)}`).attr('opacity', 0)
                .transition().duration(400).attr('opacity', 1).end()
        );
    }

    // Max 막대 스택 위에 값 표시
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
            g.append('text').attr('class','annotation value-label')
                .attr('x', cx).attr('y', minY - 8).attr('text-anchor','middle')
                .attr('font-size', 12).attr('font-weight','bold')
                .attr('fill', color).attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
                .text(`Max: ${fmtNum(maxTotal)}`).attr('opacity', 0)
                .transition().duration(400).attr('opacity', 1).end()
        );
    }

    await Promise.all(labelTasks);
    return result;
}

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

        // 🔥 group이 있을 때도 스택 차트와 동일한 애니메이션 적용
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
        
        // 1단계: 막대 강조
        await Promise.all([
            others.transition().duration(500).attr('opacity', 0.2).end(),
            barsA.transition().duration(500).attr('opacity', 1).attr('fill', colorA).end(),
            barsB.transition().duration(500).attr('opacity', 1).attr('fill', colorB).end()
        ]);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        // 2단계: 수평선 그리기
        const lineA = svg.append("line").attr("class","annotation")
            .attr("x1", margins.left).attr("y1", margins.top + y(A.value))
            .attr("x2", margins.left).attr("y2", margins.top + y(A.value))
            .attr("stroke", colorA).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
            .transition().duration(700).attr("x2", margins.left + plot.w).end();
        
        const lineB = svg.append("line").attr("class","annotation")
            .attr("x1", margins.left).attr("y1", margins.top + y(B.value))
            .attr("x2", margins.left).attr("y2", margins.top + y(B.value))
            .attr("stroke", colorB).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
            .transition().duration(700).attr("x2", margins.left + plot.w).end();
        
        await Promise.all([lineA, lineB]);

        // 3단계: 값 레이블 표시
        const labelTasks = [];
        const nodesA = barsA.nodes();
        if (nodesA.length) {
            const bb = nodesA[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                g.append("text").attr("class","annotation")
                    .attr("x", cx).attr("y", bb.y - 8).attr("text-anchor","middle")
                    .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorA)
                    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                    .text(fmtNum(A.value)).attr("opacity",0)
                    .transition().duration(400).attr("opacity",1).end()
            );
        }

        const nodesB = barsB.nodes();
        if (nodesB.length) {
            const bb = nodesB[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                g.append("text").attr("class","annotation")
                    .attr("x", cx).attr("y", bb.y - 8).attr("text-anchor","middle")
                    .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorB)
                    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                    .text(fmtNum(B.value)).attr("opacity",0)
                    .transition().duration(400).attr("opacity",1).end()
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

    // 🔥 스택 전체 합계를 직접 계산
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
    
    // 🔥 1단계: 막대 강조 (색상 변경)
    await Promise.all([
        others.transition().duration(500).attr('opacity', 0.2).end(),
        barsA.transition().duration(500).attr('opacity', 1).attr('fill', colorA).end(),
        barsB.transition().duration(500).attr('opacity', 1).attr('fill', colorB).end()
    ]);

    // 🔥 y 스케일: 스택 전체 합계를 기준으로
    const maxStackTotal = d3.max(Array.from(sums.values())) || 0;
    const y = d3.scaleLinear().domain([0, maxStackTotal]).nice().range([plot.h, 0]);
    
    // 🔥 2단계: 수평선 그리기 (동시에)
    const lineA = svg.append("line").attr("class","annotation")
        .attr("x1", margins.left).attr("y1", margins.top + y(sumA))
        .attr("x2", margins.left).attr("y2", margins.top + y(sumA))
        .attr("stroke", colorA).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(700).attr("x2", margins.left + plot.w).end();
    
    const lineB = svg.append("line").attr("class","annotation")
        .attr("x1", margins.left).attr("y1", margins.top + y(sumB))
        .attr("x2", margins.left).attr("y2", margins.top + y(sumB))
        .attr("stroke", colorB).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(700).attr("x2", margins.left + plot.w).end();
    
    await Promise.all([lineA, lineB]);

    // 🔥 3단계: 값 레이블 표시 (동시에)
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
            g.append("text").attr("class","annotation")
                .attr("x", cx).attr("y", minY - 8).attr("text-anchor","middle")
                .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorA)
                .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                .text(fmtNum(sumA)).attr("opacity",0)
                .transition().duration(400).attr("opacity",1).end()
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
            g.append("text").attr("class","annotation")
                .attr("x", cx).attr("y", minY - 8).attr("text-anchor","middle")
                .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorB)
                .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                .text(fmtNum(sumB)).attr("opacity",0)
                .transition().duration(400).attr("opacity",1).end()
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

        // 🔥 group이 있을 때도 compare와 동일한 애니메이션 적용
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
        
        // 1단계: 막대 강조
        await Promise.all([
            others.transition().duration(500).attr('opacity', 0.2).end(),
            barsA.transition().duration(500).attr('opacity', 1).attr('fill', colorA).end(),
            barsB.transition().duration(500).attr('opacity', 1).attr('fill', colorB).end()
        ]);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        // 2단계: 수평선 그리기
        const lineA = svg.append("line").attr("class","annotation")
            .attr("x1", margins.left).attr("y1", margins.top + y(A.value))
            .attr("x2", margins.left).attr("y2", margins.top + y(A.value))
            .attr("stroke", colorA).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
            .transition().duration(700).attr("x2", margins.left + plot.w).end();
        
        const lineB = svg.append("line").attr("class","annotation")
            .attr("x1", margins.left).attr("y1", margins.top + y(B.value))
            .attr("x2", margins.left).attr("y2", margins.top + y(B.value))
            .attr("stroke", colorB).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
            .transition().duration(700).attr("x2", margins.left + plot.w).end();
        
        await Promise.all([lineA, lineB]);

        // 3단계: 값 레이블 표시
        const labelTasks = [];
        const nodesA = barsA.nodes();
        if (nodesA.length) {
            const bb = nodesA[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                g.append("text").attr("class","annotation")
                    .attr("x", cx).attr("y", bb.y - 8).attr("text-anchor","middle")
                    .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorA)
                    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                    .text(fmtNum(A.value)).attr("opacity",0)
                    .transition().duration(400).attr("opacity",1).end()
            );
        }

        const nodesB = barsB.nodes();
        if (nodesB.length) {
            const bb = nodesB[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                g.append("text").attr("class","annotation")
                    .attr("x", cx).attr("y", bb.y - 8).attr("text-anchor","middle")
                    .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorB)
                    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                    .text(fmtNum(B.value)).attr("opacity",0)
                    .transition().duration(400).attr("opacity",1).end()
            );
        }

        await Promise.all(labelTasks);

        return [new BoolValue(op.field || yField || 'value', bool, verdict?.id ?? null)];
    }

    // 🔥 스택 전체 합계를 직접 계산
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
    
    // 🔥 1단계: 막대 강조
    await Promise.all([
        others.transition().duration(500).attr('opacity', 0.2).end(),
        barsA.transition().duration(500).attr('opacity', 1).attr('fill', colorA).end(),
        barsB.transition().duration(500).attr('opacity', 1).attr('fill', colorB).end()
    ]);

    // 🔥 y 스케일: 스택 전체 합계를 기준으로
    const maxStackTotal = d3.max(Array.from(sums.values())) || 0;
    const y = d3.scaleLinear().domain([0, maxStackTotal]).nice().range([plot.h, 0]);
    
    // 🔥 2단계: 수평선 그리기 (동시에)
    const lineA = svg.append("line").attr("class","annotation")
        .attr("x1", margins.left).attr("y1", margins.top + y(sumA))
        .attr("x2", margins.left).attr("y2", margins.top + y(sumA))
        .attr("stroke", colorA).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(700).attr("x2", margins.left + plot.w).end();
    
    const lineB = svg.append("line").attr("class","annotation")
        .attr("x1", margins.left).attr("y1", margins.top + y(sumB))
        .attr("x2", margins.left).attr("y2", margins.top + y(sumB))
        .attr("stroke", colorB).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(700).attr("x2", margins.left + plot.w).end();
    
    await Promise.all([lineA, lineB]);

    // 🔥 3단계: 값 레이블 표시 (동시에)
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
            g.append("text").attr("class","annotation")
                .attr("x", cx).attr("y", minY - 8).attr("text-anchor","middle")
                .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorA)
                .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                .text(fmtNum(sumA)).attr("opacity",0)
                .transition().duration(400).attr("opacity",1).end()
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
            g.append("text").attr("class","annotation")
                .attr("x", cx).attr("y", minY - 8).attr("text-anchor","middle")
                .attr("font-size", 12).attr("font-weight","bold").attr("fill", colorB)
                .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                .text(fmtNum(sumB)).attr("opacity",0)
                .transition().duration(400).attr("opacity",1).end()
        );
    }

    await Promise.all(labelTasks);

    return [new BoolValue(op.field || verdict?.category || yField || 'value', bool, verdict?.id ?? null)];
}

export async function stackedBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const semantic = dataDiff(data, { targetA: op.targetA, targetB: op.targetB, group: op.group ?? null, field: op.field }, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (!subset.length) return semantic ? [new DatumValue(semantic.category, semantic.measure, semantic.target, subgroup, Math.abs(semantic.value), null)] : [];
        await stackedBarToSimpleBar(chartId, subset);

        // 🔥 group이 있을 때도 compare와 동일한 애니메이션 적용
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
        
        // 🔥 1단계: 막대 강조 (색상 변경)
        await Promise.all([
            others.transition().duration(400).attr('opacity', 0.2).end(),
            barsA.transition().duration(400).attr('opacity', 1).attr('fill', colorA).end(),
            barsB.transition().duration(400).attr('opacity', 1).attr('fill', colorB).end()
        ]);

        const maxVal = d3.max(subset, d => +d.value) || 0;
        const y = d3.scaleLinear().domain([0, maxVal]).nice().range([plot.h, 0]);

        // 🔥 2단계: 수평선 그리기 (동시에)
        const lineA = svg.append("line").attr("class","annotation horizontal-guide")
            .attr("x1", margins.left).attr("y1", margins.top + y(A.value))
            .attr("x2", margins.left).attr("y2", margins.top + y(A.value))
            .attr("stroke", colorA).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
            .transition().duration(500).attr("x2", margins.left + plot.w).end();
        
        const lineB = svg.append("line").attr("class","annotation horizontal-guide")
            .attr("x1", margins.left).attr("y1", margins.top + y(B.value))
            .attr("x2", margins.left).attr("y2", margins.top + y(B.value))
            .attr("stroke", colorB).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
            .transition().duration(500).attr("x2", margins.left + plot.w).end();
        
        await Promise.all([lineA, lineB]);
        await delay(300);

        // 🔥 3단계: 값 레이블 표시 (동시에)
        const labelTasks = [];
        const nodesA = barsA.nodes();
        if (nodesA.length) {
            const bb = nodesA[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                g.append("text").attr("class","annotation")
                    .attr("x", cx).attr("y", bb.y - 8).attr("text-anchor","middle")
                    .attr("font-size", 14).attr("font-weight","bold").attr("fill", colorA)
                    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                    .text(fmtNum(A.value)).attr("opacity",0)
                    .transition().duration(400).attr("opacity",1).end()
            );
        }

        const nodesB = barsB.nodes();
        if (nodesB.length) {
            const bb = nodesB[0].getBBox();
            const cx = bb.x + bb.width/2;
            labelTasks.push(
                g.append("text").attr("class","annotation")
                    .attr("x", cx).attr("y", bb.y - 8).attr("text-anchor","middle")
                    .attr("font-size", 14).attr("font-weight","bold").attr("fill", colorB)
                    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                    .text(fmtNum(B.value)).attr("opacity",0)
                    .transition().duration(400).attr("opacity",1).end()
            );
        }

        await Promise.all(labelTasks);
        await delay(300);

        // 🔥 4단계: 수직선으로 Diff 표시
        const diff = op.signed ? (A.value - B.value) : Math.abs(A.value - B.value);
        const yA = margins.top + y(A.value);
        const yB = margins.top + y(B.value);
        const minY = Math.min(yA, yB);
        const maxY = Math.max(yA, yB);
        const diffX = margins.left + plot.w / 2;
        const diffColor = OP_COLORS.DIFF_LINE;

        const verticalLine = svg.append("line").attr("class","annotation diff-vertical")
            .attr("x1", diffX).attr("x2", diffX)
            .attr("y1", minY).attr("y2", minY)
            .attr("stroke", diffColor).attr("stroke-width", 3);
        
        await verticalLine.transition().duration(600).attr("y2", maxY).end();

        await svg.append("text").attr("class","annotation diff-label")
            .attr("x", diffX + 10).attr("y", (minY + maxY)/2)
            .attr("text-anchor","start").attr("dominant-baseline","middle")
            .attr("fill", diffColor).attr("font-weight","bold").attr("font-size", 16)
            .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
            .text(`Diff: ${fmtNum(diff)}`).attr("opacity",0)
            .transition().duration(400).attr("opacity",1).end();

        await delay(300);

        const diffDatum = new DatumValue(xField, yField, "Diff", subgroup, diff);
        return [diffDatum];
    }

    // 🔥 스택 전체 합계를 직접 계산
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

    // 🔥 1단계: 막대 강조 (노란색/파란색으로 칠하기)
    await Promise.all([
        others.transition().duration(400).attr('opacity', 0.2).end(),
        barsA.transition().duration(400).attr('opacity', 1).attr('fill', colorA).end(),
        barsB.transition().duration(400).attr('opacity', 1).attr('fill', colorB).end()
    ]);

    const y = d3.scaleLinear().domain([0, d3.max(Array.from(sums.values())) || 0]).nice().range([plot.h, 0]);

    // 🔥 2단계: 각 막대 높이에 수평 점선 (전체 너비) - 동시에!
    const yA = margins.top + y(sumA);
    const yB = margins.top + y(sumB);
    
    const lineA = svg.append("line").attr("class","annotation horizontal-guide")
        .attr("x1", margins.left).attr("y1", yA)
        .attr("x2", margins.left).attr("y2", yA)
        .attr("stroke", colorA).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(500).attr("x2", margins.left + plot.w).end();
    
    const lineB = svg.append("line").attr("class","annotation horizontal-guide")
        .attr("x1", margins.left).attr("y1", yB)
        .attr("x2", margins.left).attr("y2", yB)
        .attr("stroke", colorB).attr("stroke-width", 2).attr("stroke-dasharray","5 5")
        .transition().duration(500).attr("x2", margins.left + plot.w).end();
    
    await Promise.all([lineA, lineB]);
    await delay(300);

    // 🔥 3단계: 각 막대 위에 값 표시 (동시에)
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
            g.append("text").attr("class","annotation")
                .attr("x", cx).attr("y", minY - 8).attr("text-anchor","middle")
                .attr("font-size", 14).attr("font-weight","bold").attr("fill", colorA)
                .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                .text(fmtNum(sumA)).attr("opacity",0)
                .transition().duration(400).attr("opacity",1).end()
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
            g.append("text").attr("class","annotation")
                .attr("x", cx).attr("y", minY - 8).attr("text-anchor","middle")
                .attr("font-size", 14).attr("font-weight","bold").attr("fill", colorB)
                .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
                .text(fmtNum(sumB)).attr("opacity",0)
                .transition().duration(400).attr("opacity",1).end()
        );
    }

    await Promise.all(labelTasks);
    await delay(300);

    // 🔥 4단계: 두 수평선 사이를 연결하는 수직선 (중간)
    const minY = Math.min(yA, yB);
    const maxY = Math.max(yA, yB);
    const diffX = margins.left + plot.w / 2; // 중간
    
    const verticalLine = svg.append("line").attr("class","annotation diff-vertical")
        .attr("x1", diffX).attr("x2", diffX)
        .attr("y1", minY).attr("y2", minY)
        .attr("stroke", diffColor).attr("stroke-width", 3);
    
    await verticalLine.transition().duration(600).attr("y2", maxY).end();

    // 🔥 5단계: 수직선 옆에 Diff 값
    await svg.append("text").attr("class","annotation diff-label")
        .attr("x", diffX + 10).attr("y", (minY + maxY)/2)
        .attr("text-anchor","start").attr("dominant-baseline","middle")
        .attr("fill", diffColor).attr("font-weight","bold").attr("font-size", 16)
        .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
        .text(`Diff: ${fmtNum(diff)}`).attr("opacity",0)
        .transition().duration(400).attr("opacity",1).end();

    await delay(300);
    return [diffDatum];
}

export async function stackedBarNth(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 🔥 서수 변환 함수
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

        // 🔥 group이 있을 때도 동일한 애니메이션
        const nValues = Array.isArray(op.n) ? op.n : [op.n];
        const from = String(op?.from || 'left').toLowerCase();
        const color = OP_COLORS.NTH;

        const all = g.selectAll('rect');
        const cats = [...new Set(subset.map(d => String(d.target)))];
        const seq = from === 'right' ? cats.slice().reverse() : cats;

        // 모든 막대 흐리게
        await all.transition().duration(250).attr("opacity", 0.2).end();

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
            countedBars.push({ index: i + 1, category: c, selection: sel, value: targetData?.value || 0 });
            
            await sel.transition().duration(150).attr('opacity', 1).end();

            const nodes = sel.nodes();
            if (nodes.length) {
                const bb = nodes[0].getBBox();
                const cx = bb.x + bb.width / 2;
                
                await g.append('text').attr('class', 'annotation count-label')
                    .attr('x', cx).attr('y', bb.y - 8).attr('text-anchor', 'middle')
                    .attr('font-size', 14).attr('font-weight', 'bold').attr('fill', color)
                    .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
                    .text(String(i + 1)).attr('opacity', 0)
                    .transition().duration(150).attr('opacity', 1).end();
            }
            
            await delay(100);
        }

        // 🔥 2단계: 선택되지 않은 것들 페이드아웃
        const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
        const finals = [];
        
        countedBars.forEach((item) => {
            if (!selectedIndices.has(item.index)) {
                finals.push(item.selection.transition().duration(300).attr('opacity', 0.2).end());
            }
        });
        finals.push(g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
        await Promise.all(finals);

        // 🔥 3단계: 선택된 것들 강조 + 수평선 + 값 표시 (동시에)
        const highlightTasks = [];
        const lineTasks = [];
        const labelTasks = [];

        nValues.forEach(n => {
            if (n > countLimit) return;
            
            const item = countedBars.find(cb => cb.index === n);
            if (!item) return;

            // 강조
            highlightTasks.push(
                item.selection.transition().duration(400).attr('opacity', 1).end()
            );

            // 수평선
            const yPos = margins.top + y(item.value);
            
            lineTasks.push(
                svg.append('line').attr('class', 'annotation nth-line')
                    .attr('x1', margins.left).attr('y1', yPos)
                    .attr('x2', margins.left).attr('y2', yPos)
                    .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
                    .transition().duration(500).attr('x2', margins.left + plot.w).end()
            );

            // 값 표시 (서수 + 값)
            const nodes = item.selection.nodes();
            if (nodes.length) {
                const bb = nodes[0].getBBox();
                const cx = bb.x + bb.width / 2;
                
                // 🔥 서수 배경
                const ordinalText = getOrdinal(n);
                labelTasks.push(
                    g.append('rect').attr('class', 'annotation label-bg')
                        .attr('x', cx - 15).attr('y', bb.y - 30)
                        .attr('width', 30).attr('height', 14)
                        .attr('fill', 'white').attr('rx', 3)
                        .attr('opacity', 0)
                        .transition().duration(400).attr('opacity', 0.9).end()
                );
                
                // 서수 표시 (위쪽)
                labelTasks.push(
                    g.append('text').attr('class', 'annotation value-tag')
                        .attr('x', cx).attr('y', bb.y - 20).attr('text-anchor', 'middle')
                        .attr('font-size', 11).attr('font-weight', 'bold').attr('fill', color)
                        .text(ordinalText).attr('opacity', 0)
                        .transition().duration(400).attr('opacity', 1).end()
                );
                
                // 🔥 값 배경
                const valueText = fmtNum(item.value);
                const valueWidth = Math.max(30, valueText.length * 7);
                labelTasks.push(
                    g.append('rect').attr('class', 'annotation label-bg')
                        .attr('x', cx - valueWidth/2).attr('y', bb.y - 16)
                        .attr('width', valueWidth).attr('height', 14)
                        .attr('fill', 'white').attr('rx', 3)
                        .attr('opacity', 0)
                        .transition().duration(400).attr('opacity', 0.9).end()
                );
                
                // 값 표시 (아래쪽)
                labelTasks.push(
                    g.append('text').attr('class', 'annotation value-tag')
                        .attr('x', cx).attr('y', bb.y - 6).attr('text-anchor', 'middle')
                        .attr('font-size', 12).attr('font-weight', 'bold').attr('fill', color)
                        .text(valueText).attr('opacity', 0)
                        .transition().duration(400).attr('opacity', 1).end()
                );
            }
        });

        await Promise.all([...highlightTasks]);
        await Promise.all([...lineTasks]);
        await Promise.all([...labelTasks]);

        const nthOp = { ...op };
        delete nthOp.group;
        const result = dataNth(subset, nthOp);
        return result || [];
    }

    // 🔥 n을 배열로 처리 (단일 값이면 배열로 변환)
    const nValues = Array.isArray(op.n) ? op.n : [op.n];
    const from = String(op?.from || 'left').toLowerCase();
    const color = OP_COLORS.NTH;

    const all = g.selectAll('rect');
    const cats = [...new Set(data.map(d => d.target))];
    const seq = from === 'right' ? cats.slice().reverse() : cats;

    // 모든 막대 흐리게
    await all.transition().duration(250).attr("opacity", 0.2).end();

    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const y = d3.scaleLinear().domain([0, d3.max(sums.values()) || 0]).nice().range([plot.h, 0]);

    // 🔥 1단계: 카운팅 애니메이션 (템포 느리게)
    const countedStacks = [];
    const maxN = Math.max(...nValues);
    const countLimit = Math.min(maxN, cats.length);

    for (let i = 0; i < countLimit; i++) {
        const c = seq[i];
        const sel = all.filter(d => getDatumCategoryKey(d) === c);
        countedStacks.push({ index: i + 1, category: c, selection: sel });
        
        await sel.transition().duration(150).attr('opacity', 1).end();

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
            
            await g.append('text').attr('class', 'annotation count-label')
                .attr('x', cx).attr('y', minY - 8).attr('text-anchor', 'middle')
                .attr('font-size', 14).attr('font-weight', 'bold').attr('fill', color)
                .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
                .text(String(i + 1)).attr('opacity', 0)
                .transition().duration(100).attr('opacity', 1).end();
        }
        
        await delay(100);
    }

    // 🔥 2단계: 선택되지 않은 것들 페이드아웃
    const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
    const finals = [];
    
    countedStacks.forEach((item) => {
        if (!selectedIndices.has(item.index)) {
            finals.push(item.selection.transition().duration(300).attr('opacity', 0.2).end());
        }
    });
    finals.push(g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
    await Promise.all(finals);

    // 🔥 3단계: 선택된 것들 강조 + 수평선 + 값 표시 (동시에)
    const highlightTasks = [];
    const lineTasks = [];
    const labelTasks = [];

    nValues.forEach(n => {
        if (n > countLimit) return;
        
        const item = countedStacks.find(cs => cs.index === n);
        if (!item) return;

        // 강조
        highlightTasks.push(
            item.selection.transition().duration(400).attr('opacity', 1).end()
        );

        // 수평선
        const targetData = data.filter(d => d.target === item.category);
        const sum = d3.sum(targetData, d => d.value);
        const yPos = margins.top + y(sum);
        
        lineTasks.push(
            svg.append('line').attr('class', 'annotation nth-line')
                .attr('x1', margins.left).attr('y1', yPos)
                .attr('x2', margins.left).attr('y2', yPos)
                .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
                .transition().duration(500).attr('x2', margins.left + plot.w).end()
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
            
            // 🔥 서수 배경
            const ordinalText = getOrdinal(n);
            labelTasks.push(
                g.append('rect').attr('class', 'annotation label-bg')
                    .attr('x', cx - 15).attr('y', minY - 30)
                    .attr('width', 30).attr('height', 14)
                    .attr('fill', 'white').attr('rx', 3)
                    .attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 0.9).end()
            );
            
            // 서수 표시 (위쪽)
            labelTasks.push(
                g.append('text').attr('class', 'annotation value-tag')
                    .attr('x', cx).attr('y', minY - 20).attr('text-anchor', 'middle')
                    .attr('font-size', 11).attr('font-weight', 'bold').attr('fill', color)
                    .text(ordinalText).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
            );
            
            // 🔥 값 배경
            const valueText = fmtNum(sum);
            const valueWidth = Math.max(30, valueText.length * 7);
            labelTasks.push(
                g.append('rect').attr('class', 'annotation label-bg')
                    .attr('x', cx - valueWidth/2).attr('y', minY - 16)
                    .attr('width', valueWidth).attr('height', 14)
                    .attr('fill', 'white').attr('rx', 3)
                    .attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 0.9).end()
            );
            
            // 값 표시 (아래쪽)
            labelTasks.push(
                g.append('text').attr('class', 'annotation value-tag')
                    .attr('x', cx).attr('y', minY - 6).attr('text-anchor', 'middle')
                    .attr('font-size', 12).attr('font-weight', 'bold').attr('fill', color)
                    .text(valueText).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
            );
        }
    });

    await Promise.all([...highlightTasks]);
    await Promise.all([...lineTasks]);
    await Promise.all([...labelTasks]);

    // 결과 반환
    const nthOp = { ...op, groupBy: 'target' };
    const result = dataNth(data, nthOp);
    return result || [];
}

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

    await all.transition().duration(250).attr("opacity", 0.2).end();
    await delay(250);

    for (let i=0;i<total;i++){
        const c = cats[i];
        const sel = all.filter(d => getDatumCategoryKey(d) === c);
        await sel.transition().duration(150).attr('opacity', 1).end();

        const nodes = sel.nodes();
        if (nodes.length){
            let minY=Infinity,minX=Infinity,maxX=-Infinity;
            nodes.forEach(n=>{ const b = n.getBBox(); minY=Math.min(minY,b.y); minX=Math.min(minX,b.x); maxX=Math.max(maxX,b.x+b.width); });
            const cx = minX + (maxX-minX)/2;
            await g.append('text').attr('class','annotation count-label')
                .attr('x', cx).attr('y', minY - 8).attr('text-anchor','middle')
                .attr('font-size', 12).attr('font-weight','bold').attr('fill', color)
                .attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke')
                .text(String(i+1)).attr('opacity',0).transition().duration(120).attr('opacity',1).end();
        }
        await delay(60);
    }

    return [result];
}

export async function stackedBarLagDiff(chartId, op, data, isLast = false) {
    const { svg, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const rawDiffs = dataLagDiff(data, op, null, null, isLast);
    if (!Array.isArray(rawDiffs) || rawDiffs.length === 0) {
        console.warn('[stackedBarLagDiff] no differences computed');
        return [];
    }
    const diffs = normalizeLagDiffResults(rawDiffs, xField || 'target', yField || 'value');

    const positiveTotal = diffs
        .map(d => Number(d.value))
        .filter(v => Number.isFinite(v) && v > 0)
        .reduce((sum, v) => sum + v, 0);

    svg.append('text').attr('class', 'annotation lagdiff-summary')
        .attr('x', 16)
        .attr('y', 20)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.SUM)
        .text(
            Number.isFinite(positiveTotal)
                ? `lagDiff computed ${diffs.length} changes · positives sum ${positiveTotal.toLocaleString()}`
                : `lagDiff computed ${diffs.length} changes`
        );

    return diffs;
}
