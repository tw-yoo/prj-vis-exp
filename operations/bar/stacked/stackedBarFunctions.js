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

import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";
import { OP_COLORS } from "../../../../object/colorPalette.js";

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function getDatumCategoryKey(d) {
    if (!d) return '';
    return String(d.key ?? d.target ?? d.category ?? d.id ?? '');
}
function evalComparison(op, a, b) {
    switch ((op || '').toLowerCase()) {
        case '<':  return a < b;
        case '<=': return a <= b;
        case '>':  return a > b;
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
    if (!Number.isFinite(numeric) && datum.measure && datum[datum.measure] !== undefined) {
        numeric = Number(datum[datum.measure]);
    }
    if (!Number.isFinite(numeric) && datum.count !== undefined) {
        numeric = Number(datum.count);
    }
    if (!Number.isFinite(numeric) && sumsMap) {
        const catKey = String(datum.target ?? datum.key ?? str);
        if (sumsMap.has(catKey)) {
            numeric = Number(sumsMap.get(catKey));
        }
    }
    const category = String(datum.target ?? datum.key ?? str);
    const group = datum.group ?? null;
    return { datum, category, group, value: Number.isFinite(numeric) ? numeric : undefined };
}
export function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const orientation = svg.attr("data-orientation");
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const colorField = svg.attr("data-color-field");
    const margins = {
        left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top")
    };
    const plot = {
        w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h")
    };
    const g = svg.select(".plot-area");
    return { svg, g, orientation, xField, yField, colorField, margins, plot };
}

async function animateStackToTotalsBar(chartId, totalsData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);

    const oldRects = g.selectAll("rect");
    const oldSeries = g.selectAll("[class^='series-']");

    await oldRects.transition().duration(500).attr("opacity", 0).remove().end();
    oldSeries.remove();

    const newXScale = d3.scaleBand().domain(totalsData.map(d => d.target)).range([0, plot.w]).padding(0.1);
    const newYMax = d3.max(totalsData, d => d.value);
    const newYScale = d3.scaleLinear().domain([0, newYMax || 1]).nice().range([plot.h, 0]);

    g.select(".y-axis").transition().duration(800).call(d3.axisLeft(newYScale));
    g.select(".x-axis").transition().duration(800).call(d3.axisBottom(newXScale));

    const newBars = g.selectAll(".total-bar")
        .data(totalsData, d => d.target)
        .join("rect")
        .attr("class", "total-bar")
        .attr("x", d => newXScale(d.target))
        .attr("width", newXScale.bandwidth())
        .attr("y", plot.h)
        .attr("height", 0)
        .attr("fill", "#69b3a2")
        .attr("data-id", d => d.target)
        .attr("data-value", d => d.value);

    await newBars.transition().duration(800)
        .attr("y", d => newYScale(d.value))
        .attr("height", d => plot.h - newYScale(d.value))
        .end();
}

export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .value-line, .value-tag, .filter-label, .threshold-line, .extremum-highlight, .compare-label").remove();
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function stackedBarToSimpleBar(chartId, filteredData) {
    const { svg, plot, margins, xField } = getSvgAndSetup(chartId);

    if (!Array.isArray(filteredData)) return [];

    const targetIds = new Set(filteredData.map(d => `${d.target}-${d.group}-${d.value}`));
    const chartRects = svg.select(".plot-area").selectAll("rect");

    const highlightPromises = [];
    chartRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        const isTarget = d ? targetIds.has(`${d.key}-${d.subgroup}-${d.value}`) : false;
        const t = rect.transition().duration(400)
            .attr("opacity", isTarget ? 1.0 : 0.2)
            .attr("stroke", isTarget ? "black" : "none")
            .attr("stroke-width", 1).end();
        highlightPromises.push(t);
    });
    await Promise.all(highlightPromises);
    await delay(300);

    if (filteredData.length === 0) {
        console.warn("Filter resulted in no matching bars.");
        chartRects.transition().duration(500).attr("opacity", 0).remove();
        return;
    }

    const transformPromises = [];
    const fadeOut = chartRects.filter(d => !targetIds.has(`${d.key}-${d.subgroup}-${d.value}`))
        .transition().duration(350).attr("opacity", 0).remove().end();
    transformPromises.push(fadeOut);

    const selectedRects = chartRects.filter(d => targetIds.has(`${d.key}-${d.subgroup}-${d.value}`));
    const newYMax = d3.max(filteredData, d => d.value);
    const newYScale = d3.scaleLinear().domain([0, newYMax || 1]).nice().range([plot.h, 0]);

    selectedRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        // Normalize datum for simple-bar key join: inject category field and target
        if (xField) {
            rect.datum({ ...d, [xField]: d.key, target: d.key, value: d.value });
        } else {
            rect.datum({ ...d, target: d.key, value: d.value });
        }
        // Also expose a stable target attribute for downstream selectors
        rect.attr("data-target", d.key).attr("data-id", d.key);
        const t = rect.transition().duration(600)
            .attr("y", newYScale(d.value))
            .attr("height", plot.h - newYScale(d.value))
            .attr("stroke-width", 0.5).end();
        transformPromises.push(t);
    });

    const yAxisTransition = svg.select(".y-axis").transition().duration(600)
        .call(d3.axisLeft(newYScale)).end();
    transformPromises.push(yAxisTransition);
    await Promise.all(transformPromises);
}

export async function stackedBarFilter(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        const subgroup = String(op.group);
        const seriesData = dataFilter(data, { field: 'group', operator: '==', value: subgroup }, xField, yField, isLast);
        await stackedBarToSimpleBar(chartId, seriesData);
        const op2 = { ...op };
        delete op2.group;
        return await simpleBarFilter(chartId, op2, seriesData, isLast);
    }

    let keepCategories = new Set();
    const categoryField = xField;
    const measureField = yField;

    if (op.field === measureField) {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const cmp = cmpMap[op.operator];
        if (cmp) {
            sumsByCategory.forEach((sum, cat) => {
                if (cmp(sum, op.value)) {
                    keepCategories.add(String(cat));
                }
            });
        }
    } else if (op.field === categoryField) {
        const filteredByTarget = dataFilter(data, { field: 'target', operator: op.operator, value: op.value }, xField, yField, isLast);
        keepCategories = new Set(filteredByTarget.map(d => d.target));
    }

    if (op.field === measureField && Number.isFinite(op.value)) {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const maxTotal = d3.max(sumsByCategory.values());
        const yScale = d3.scaleLinear().domain([0, maxTotal || 1]).nice().range([plot.h, 0]);
        const yPos = yScale(op.value);

        g.append('line').attr('class', 'annotation threshold-line')
            .attr('x1', 0).attr('y1', yPos)
            .attr('x2', plot.w).attr('y2', yPos)
            .attr('stroke', OP_COLORS.FILTER_THRESHOLD).attr('stroke-width', 2).attr('stroke-dasharray', '5 5');

        g.append('text').attr('class', 'annotation threshold-label')
            .attr('x', plot.w - 5).attr('y', yPos - 5)
            .attr('text-anchor', 'end')
            .attr('fill', OP_COLORS.FILTER_THRESHOLD).attr('font-size', 12).attr('font-weight', 'bold')
            .text(`${op.value}`);

        await delay(800);
    }

    const allRects = g.selectAll('rect');
    const keepSel = allRects.filter(d => keepCategories.has(getDatumCategoryKey(d)));
    const dropSel = allRects.filter(d => !keepCategories.has(getDatumCategoryKey(d)));

    await dropSel.transition().duration(500).attr("opacity", 0).remove().end();

    const newXScale = d3.scaleBand().domain(Array.from(keepCategories)).range([0, plot.w]).padding(0.1);

    const rectTransition = keepSel.transition().duration(800)
        .attr("x", d => newXScale(getDatumCategoryKey(d)))
        .attr("width", newXScale.bandwidth())
        .end();

    const axisTransition = g.select(".x-axis").transition().duration(800)
        .call(d3.axisBottom(newXScale))
        .end();

    await Promise.all([rectTransition, axisTransition]);

    return data.filter(d => keepCategories.has(String(d?.target ?? getDatumCategoryKey(d))));
}

export async function stackedBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarRetrieveValue: no data for group', subgroup);
            return [];
        }

        await stackedBarToSimpleBar(chartId, subset);

        const selected = dataRetrieveValue(subset, op, isLast) || [];
        const selectedTargets = selected.map(d => String(d.target));

        const hlColor = OP_COLORS.RETRIEVE_VALUE;
        const bars = g.selectAll('rect');
        const target = bars.filter(function () {
            const key = getDatumCategoryKey(d3.select(this).datum());
            return key && selectedTargets.includes(String(key));
        });
        if (target.empty()) {
            console.warn('stackedBarRetrieveValue(group): target bars not found for', op?.target);
            return selected;
        }

        const animPromises = [];
        animPromises.push(
            target.transition().duration(600).attr('fill', hlColor).attr('opacity', 1).end()
        );

        let xScale, yScale;
        if (orientation === 'horizontal') {
            yScale = d3.scaleBand().domain(subset.map(d => String(d.target))).range([0, plot.h]).padding(0.2);
            const xMax = d3.max(subset, d => +d.value) || 0;
            xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        } else {
            xScale = d3.scaleBand().domain(subset.map(d => String(d.target))).range([0, plot.w]).padding(0.2);
            const yMax = d3.max(subset, d => +d.value) || 0;
            yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        }

        const lineData = selected;
        if (orientation === 'horizontal') {
            const sel = svg.selectAll('.retrieve-line').data(lineData, d => d.id || d.target);
            sel.exit().remove();
            const entered = sel.enter().append('line')
                .attr('class', 'retrieve-line annotation')
                .attr('x1', d => margins.left + xScale(d.value))
                .attr('x2', d => margins.left + xScale(d.value))
                .attr('y1', d => margins.top + yScale(String(d.target)) + yScale.bandwidth() / 2)
                .attr('y2', d => margins.top + yScale(String(d.target)) + yScale.bandwidth() / 2)
                .attr('stroke', hlColor)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5 5')
                .attr('opacity', 0);
            animPromises.push(
                entered.transition().duration(400)
                    .attr('y2', margins.top)
                    .attr('opacity', 1)
                    .end()
            );
        } else { // vertical
            const sel = svg.selectAll('.retrieve-line').data(lineData, d => d.id || d.target);
            sel.exit().remove();
            const entered = sel.enter().append('line')
                .attr('class', 'retrieve-line annotation')
                .attr('x1', d => margins.left + xScale(String(d.target)) + xScale.bandwidth() / 2)
                .attr('x2', d => margins.left + xScale(String(d.target)) + xScale.bandwidth() / 2)
                .attr('y1', d => margins.top + yScale(d.value))
                .attr('y2', d => margins.top + yScale(d.value))
                .attr('stroke', hlColor)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5 5')
                .attr('opacity', 0);
            animPromises.push(
                entered.transition().duration(400)
                    .attr('x2', margins.left)
                    .attr('opacity', 1)
                    .end()
            );
        }

        target.each(function () {
            const sel = d3.select(this);
            const dd = sel.datum();
            const val = Number.isFinite(+dd?.value) ? +dd.value : null;
            const bbox = this.getBBox();
            const labelX = bbox.x + bbox.width / 2;
            const labelY = bbox.y - 6;
            if (val != null) {
                const p = g.append('text')
                    .attr('class', 'value-tag annotation')
                    .attr('x', labelX)
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', 12)
                    .attr('font-weight', 'bold')
                    .attr('fill', hlColor)
                    .attr('stroke', 'white')
                    .attr('stroke-width', 3)
                    .attr('paint-order', 'stroke')
                    .text(fmtNum(val))
                    .attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1)
                    .end();
                animPromises.push(p);
            }
        });

        await Promise.all(animPromises);
        return selected;
    }

    const hlColor = OP_COLORS.RETRIEVE_VALUE;
    
    const retrieveSpec = isLast ? { ...op } : { target: op.target };
    const matchedData = dataRetrieveValue(data, retrieveSpec, isLast) || [];
    if (matchedData.length === 0) {
        console.warn('stackedBarRetrieveValue: no matching data found for', op);
        return [];
    }
    
    const totalValue = d3.sum(matchedData, d => d.value);
    const targetCategoryKey = String(matchedData[0]?.target ?? matchedData[0]?.category ?? matchedData[0]?.key ?? op.target);
    const targetStackId = targetCategoryKey;
    const targetRects = g.selectAll('rect').filter(d => getDatumCategoryKey(d) === targetCategoryKey);
    const otherRects = g.selectAll('rect').filter(d => getDatumCategoryKey(d) !== targetCategoryKey);

    await otherRects.transition().duration(400).attr('opacity', 0.25).end();
    await targetRects.transition().duration(400)
        .attr('opacity', 1)
        .attr('stroke', 'black')
        .attr('stroke-width', 1)
        .end();
    
    const targetNodes = targetRects.nodes();
    if (targetNodes.length > 0) {
        let minY = Infinity;
        let lastNodeBBox;
        targetNodes.forEach(n => { 
            const b = n.getBBox(); 
            minY = Math.min(minY, b.y);
            lastNodeBBox = b;
        });
        
        const labelX = lastNodeBBox.x + lastNodeBBox.width / 2;
        const labelY = minY - 8;
        
        g.append('text')
            .attr('class', 'value-tag annotation')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(fmtNum(totalValue))
            .attr('opacity', 0)
            .transition().duration(200).attr('opacity', 1);
            
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const maxTotal = d3.max(Array.from(sumsByCategory.values()));
        const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
        const yPos = margins.top + yScale(totalValue);

        svg.append('line')
            .attr('class', 'retrieve-line annotation')
            .attr('x1', margins.left + labelX)
            .attr('x2', margins.left + labelX)
            .attr('y1', yPos)
            .attr('y2', yPos)
            .attr('stroke', hlColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5 5')
            .attr('opacity', 0)
            .transition().duration(400)
            .attr('x1', margins.left)
            .attr('opacity', 1);
    }
    
    const firstMatch = matchedData[0];
    return [new DatumValue(firstMatch.category, firstMatch.measure, firstMatch.target, null, totalValue, `${targetStackId}-total`)];
}

export async function stackedBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, yField, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = OP_COLORS.EXTREMUM;

    const drawGuideAt = async (val, domainMax) => {
        if (!Number.isFinite(val)) return;
        const y = d3.scaleLinear().domain([0, domainMax || 0]).nice().range([plot.h, 0]);
        const yPos = margins.top + y(val);
        const line = svg.append('line')
            .attr('class', 'annotation')
            .attr('x1', margins.left)
            .attr('y1', yPos)
            .attr('x2', margins.left)
            .attr('y2', yPos)
            .attr('stroke', hlColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5 5');
        await line.transition().duration(400).attr('x2', margins.left + plot.w).end();
    };

    const labelBar = (node, text) => {
        if (!node) return;
        const bbox = node.getBBox();
        const x = margins.left + bbox.x + bbox.width / 2;
        const y = margins.top + bbox.y - 6;
        svg.append('text')
            .attr('class', 'annotation')
            .attr('x', x).attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12).attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
            .text(text)
            .attr('opacity', 0)
            .transition().duration(400).attr('opacity', 1);
    };

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(dv => String(dv.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarFindExtremum: no data for group', subgroup);
            return [];
        }

        await stackedBarToSimpleBar(chartId, subset);

        const targetDatum = dataFindExtremum(subset, op, xField, yField, isLast);
        if (!targetDatum) {
            console.warn('FindExtremum(group): No result for', op);
            return [];
        }

        const extremumValue = +targetDatum.value;
        const yMax = d3.max(subset, d => +d.value) || 0;
        await drawGuideAt(extremumValue, yMax);

        const targetRect = g.selectAll('rect').filter(d => getDatumCategoryKey(d) === String(targetDatum.target));
        if (!targetRect.empty()) {
            await targetRect.transition().duration(500).attr('fill', hlColor).attr('stroke', 'black').attr('stroke-width', 1).end();
            const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${fmtNum(extremumValue)}`;
            labelBar(targetRect.node(), labelText);
        }
        return [targetDatum];
    }

    if (op.category != null) {
        const category = String(op.category);
        const subset = data.filter(d => String(d.target) === category);
        const targetDatum = dataFindExtremum(subset, op, xField, yField, isLast);
        if (!targetDatum) {
            console.warn('FindExtremum(category): No result for', op);
            return [];
        }
        const extremumValue = +targetDatum.value;

        const globalMax = d3.max(data, d => +d.value) || 0;
        await drawGuideAt(extremumValue, globalMax);

        const allRects = g.selectAll('rect');
        const targetRect = allRects.filter(d => getDatumCategoryKey(d) === category && String(d.subgroup) === String(targetDatum.group));
        const otherInCategory = allRects.filter(d => getDatumCategoryKey(d) === category && String(d.subgroup) !== String(targetDatum.group));
        const others = allRects.filter(d => getDatumCategoryKey(d) !== category);

        await others.transition().duration(500).attr('opacity', 0.2).end();
        await otherInCategory.transition().duration(500).attr('opacity', 0.6).end();
        await targetRect.transition().duration(500).attr('fill', hlColor).attr('stroke', 'black').attr('stroke-width', 1).end();

        const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${fmtNum(extremumValue)}`;
        labelBar(targetRect.node(), labelText);
        return [targetDatum];
    }

    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sumsByCategory.entries(), ([key, value]) => ({ target: key, value }));
    const extremumTotal = dataFindExtremum(totals, op, xField, yField, isLast);
    if (!extremumTotal) {
        console.warn('FindExtremum(total): No result for', op);
        return [];
    }

    const extremumValue = +extremumTotal.value;
    const extremumCategory = extremumTotal.target;

    const yMaxTotal = d3.max(totals, d => d.value) || 0;
    await drawGuideAt(extremumValue, yMaxTotal);

    const allRects = g.selectAll('rect');
    const targetStackRects = allRects.filter(d => getDatumCategoryKey(d) === String(extremumCategory));
    const others = allRects.filter(d => getDatumCategoryKey(d) !== String(extremumCategory));

    await others.transition().duration(500).attr('opacity', 0.2).end();
    await targetStackRects.transition().duration(500).attr('opacity', 1).attr('stroke', 'black').attr('stroke-width', 0.5).end();

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
        .text(`${op.which} Total: ${fmtNum(extremumValue)}`)
        .attr('opacity', 0)
        .transition().duration(400).attr('opacity', 1);

    return [data.find(d => String(d.target) === String(extremumCategory)) || extremumTotal];
}
export async function stackedBarSort(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn("Sort operation received no data.");
        return data;
    }

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarSort: no data for group', subgroup);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op };
        delete op2.group;
        return await simpleBarSort(chartId, op2, subset, isLast);
    }

    const sortOp = { ...op, aggregate: 'sum' };
    const sortedData = dataSort(data, sortOp, xField, yField);

    const sortedCategories = [...new Set(sortedData.map(d => d.target))];
    const xScale = d3.scaleBand().domain(sortedCategories).range([0, plot.w]).padding(0.1);

    const rectTransition = g.selectAll("rect")
        .transition().duration(1000)
        .attr("x", function(d) { return xScale(d.key); })
        .attr("width", xScale.bandwidth())
        .end();

    const axisTransition = g.select(".x-axis").transition().duration(1000)
        .call(d3.axisBottom(xScale))
        .end();

    await Promise.all([rectTransition, axisTransition]);

    return sortedData;
}

export async function stackedBarSum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, yField, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarSum: no data for group', subgroup);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op };
        delete op2.group;
        return await simpleBarSum(chartId, op2, subset, isLast);
    }

    const result = dataSum(data, op, xField, yField, isLast);
    const totalSum = result ? result.value : 0;

    if (totalSum === 0) {
        console.warn("Sum is 0 or could not be calculated.");
        return result;
    }

    const allRects = g.selectAll("rect");
    const color = OP_COLORS.SUM;

    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);
    const yAxisTransition = svg.select(".y-axis").transition().duration(1200)
        .call(d3.axisLeft(newYScale))
        .end();

    const originalStates = [];
    allRects.each(function() {
        originalStates.push({
            node: this,
            x: +this.getAttribute('x'),
            y: +this.getAttribute('y'),
            datum: d3.select(this).datum()
        });
    });
    originalStates.sort((a, b) => a.x - b.x || b.y - a.y);
    
    const barWidth = allRects.size() > 0 ? +allRects.node().getAttribute('width') : 20;
    const targetX = plot.w / 2 - barWidth / 2;
    
    let runningTotal = 0;
    const stackPromises = [];

    originalStates.forEach(state => {
        const value = state.datum.value;
        const t = d3.select(state.node)
            .transition().duration(1500).ease(d3.easeCubicInOut)
            .attr("x", targetX)
            .attr("width", barWidth)
            .attr("y", newYScale(runningTotal + value))
            .attr("height", newYScale(0) - newYScale(value))
            .end();
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    await delay(300);

    const yPos = margins.top + newYScale(totalSum);
    svg.append("line").attr("class", "annotation sum-line")
        .attr("x1", margins.left)
        .attr("x2", margins.left + plot.w)
        .attr("y1", yPos)
        .attr("y2", yPos)
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5 5");

    svg.append("text").attr("class", "annotation sum-label")
        .attr("x", margins.left + plot.w / 2)
        .attr("y", yPos - 10)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("font-weight", "bold")
        .attr("fill", color)
        .attr("stroke", "white")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .text(`Sum: ${fmtNum(totalSum)}`);

    return result;
}

export async function stackedBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarAverage: no data for group', subgroup);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op, field: 'value' };
        delete op2.group;
        return await simpleBarAverage(chartId, op2, subset, isLast);
    }

    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totalsData = Array.from(sumsByCategory.values());
    if (totalsData.length === 0) {
        console.warn('stackedBarAverage: no data to aggregate for totals');
        return [];
    }
    
    const averageValue = d3.mean(totalsData);
    if (!Number.isFinite(averageValue)) {
        console.warn('stackedBarAverage: average could not be computed.');
        return [];
    }
    const resultDatum = dataAverage(data, op, xField, yField, isLast);

    const yMax = d3.max(Array.from(sumsByCategory.values()));
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const yPos = yScale(averageValue);

    const hlColor = OP_COLORS.AVERAGE;

    const line = g.append('line')
        .attr('class', 'annotation avg-line')
        .attr('x1', 0)
        .attr('x2', 0)
        .attr('y1', yPos)
        .attr('y2', yPos)
        .attr('stroke', hlColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 5');
        
    await line.transition().duration(800)
        .attr('x2', plot.w)
        .end();

    g.append('text')
        .attr('class', 'annotation avg-label')
        .attr('x', plot.w / 2)
        .attr('y', yPos - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(`Avg: ${averageValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
        .attr('opacity', 0)
        .transition().delay(200).duration(400)
        .attr('opacity', 1);

    return resultDatum;
}

export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(dv => String(dv.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarDetermineRange: no data for group', subgroup);
            return new IntervalValue(op.group, NaN, NaN);
        }
        await stackedBarToSimpleBar(chartId, subset);
        
        const values = subset.map(d => d.value);
        const minV = d3.min(values);
        const maxV = d3.max(values);
        const result = new IntervalValue(op.group, minV, maxV);

        const allRects = g.selectAll('rect');
        const minBars = allRects.filter(function() { const d = d3.select(this).datum(); return d && +d.value === minV; });
        const maxBars = allRects.filter(function() { const d = d3.select(this).datum(); return d && +d.value === maxV; });
        const otherRects = allRects.filter(function() { const d = d3.select(this).datum(); return d && +d.value !== minV && +d.value !== maxV; });

        const hlColor = OP_COLORS.RANGE;
        const yMax = d3.max(values) || 0;
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const animationPromises = [];

        animationPromises.push(
            otherRects.transition().duration(600).attr('opacity', 0.2).end()
        );
        animationPromises.push(
            minBars.transition().duration(600).attr('opacity', 1).end()
        );
        animationPromises.push(
            maxBars.transition().duration(600).attr('opacity', 1).end()
        );

        const getBarCenterTop = (barNode) => {
            if (!barNode) return null;
            const b = barNode.getBBox();
            return {
                x: b.x + b.width / 2,
                y: b.y - 8
            };
        };

        [
            { value: minV, label: "Min", bars: minBars },
            { value: maxV, label: "Max", bars: maxBars }
        ].forEach(item => {
            if (item.value === undefined) return;
            const yPos = margins.top + yScale(item.value);
            const line = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("x2", margins.left)
                .attr("y1", yPos).attr("y2", yPos)
                .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

            animationPromises.push(
                line.transition().duration(800).attr("x2", margins.left + plot.w).end()
            );

            item.bars.each(function() {
                const pos = getBarCenterTop(this);
                if (pos) {
                    const datum = d3.select(this).datum() || {};
                    const catLabel = String(datum.key ?? datum.target ?? '');
                    const text = g.append("text").attr("class", "annotation")
                        .attr("x", pos.x)
                        .attr("y", pos.y)
                        .attr("text-anchor", "middle")
                        .attr("font-size", 12).attr("font-weight", "bold")
                        .attr("fill", hlColor)
                        .attr("stroke", "white").attr("stroke-width", 3)
                        .attr("paint-order", "stroke")
                        .text(catLabel ? `${item.label}: ${catLabel} (${fmtNum(item.value)})` : `${item.label}: ${fmtNum(item.value)}`)
                        .attr("opacity", 0);
                    
                    animationPromises.push(
                        text.transition().delay(400).duration(400).attr("opacity", 1).end()
                    );
                }
            });
        });
        
        await Promise.all(animationPromises);
        return result;
    }

    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sumsByCategory.values());
    if (totals.length === 0) {
        return new IntervalValue('Stack Totals', NaN, NaN);
    }

    const minTotal = d3.min(totals);
    const maxTotal = d3.max(totals);
    const result = new IntervalValue('Stack Totals', minTotal, maxTotal);

    let minCategory, maxCategory;
    sumsByCategory.forEach((sum, cat) => {
        if (sum === minTotal) minCategory = cat;
        if (sum === maxTotal) maxCategory = cat;
    });

    const allRects = g.selectAll('rect');
    const minStackRects = allRects.filter(d => getDatumCategoryKey(d) === String(minCategory));
    const maxStackRects = allRects.filter(d => getDatumCategoryKey(d) === String(maxCategory));
    const otherRects = allRects.filter(d => {
        const key = getDatumCategoryKey(d);
        return key !== String(minCategory) && key !== String(maxCategory);
    });

    const hlColor = OP_COLORS.RANGE;
    const yMax = d3.max(totals) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const animationPromises = [];

    animationPromises.push(
        otherRects.transition().duration(600).attr('opacity', 0.2).end()
    );
    animationPromises.push(
        minStackRects.transition().duration(600).attr('opacity', 1).end()
    );
    animationPromises.push(
        maxStackRects.transition().duration(600).attr('opacity', 1).end()
    );

    const getStackCenterTop = (rectSelection) => {
        if (rectSelection.empty()) return null;
        const nodes = rectSelection.nodes();
        let minY = Infinity, maxX = -Infinity, minX = Infinity;
        nodes.forEach(node => {
            const b = node.getBBox();
            minX = Math.min(minX, b.x);
            maxX = Math.max(maxX, b.x + b.width);
            minY = Math.min(minY, b.y);
        });
        return {
            x: minX + (maxX - minX) / 2,
            y: minY - 8
        };
    };

    [
        { value: minTotal, label: "Min", bars: minStackRects, category: minCategory },
        { value: maxTotal, label: "Max", bars: maxStackRects, category: maxCategory }
    ].forEach(item => {
        if (item.value === undefined) return;
        const yPos = margins.top + yScale(item.value);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        const pos = getStackCenterTop(item.bars);
        if (pos) {
             const text = g.append("text").attr("class", "annotation")
                .attr("x", pos.x)
                .attr("y", pos.y)
                .attr("text-anchor", "middle")
                .attr("font-size", 12).attr("font-weight", "bold")
                .attr("fill", hlColor)
                .attr("stroke", "white").attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(item.category ? `${item.label}: ${item.category} (${fmtNum(item.value)})` : `${item.label}: ${fmtNum(item.value)}`)
                .attr("opacity", 0);
            
            animationPromises.push(
                text.transition().delay(400).duration(400).attr("opacity", 1).end()
            );
        }
    });
    
    await Promise.all(animationPromises);

    return result;
}

export async function stackedBarCompare(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForCompare = {
        targetA: op.targetA,
        targetB: op.targetB,
        group: op.group ?? null,
        operator: op.operator,
        which: op.which,
        field: op.field || yField || 'value'
    };
    
    let winner = dataCompare(data, opForCompare, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarCompare: no data for group', subgroup);
            return winner ? [winner] : [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { targetA: op.targetA, targetB: op.targetB, operator: op.operator, which: op.which, field: 'value' };
        return await simpleBarCompare(chartId, op2, subset, isLast);
    }
    
    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const resolvedA = resolveStackedDatum(data, op.targetA, sumsByCategory);
    const resolvedB = resolveStackedDatum(data, op.targetB, sumsByCategory);

    if (!Number.isFinite(resolvedA.value) || !Number.isFinite(resolvedB.value)) {
        console.warn('stackedBarCompare: one or both targets not found for summing', op);
        return winner ? [winner] : [];
    }
    const sumA = resolvedA.value;
    const sumB = resolvedB.value;

    const allRects = g.selectAll('rect');
    const barsA = allRects.filter(d => getDatumCategoryKey(d) === String(resolvedA.category));
    const barsB = allRects.filter(d => getDatumCategoryKey(d) === String(resolvedB.category));
    const otherRects = allRects.filter(d => {
        const key = getDatumCategoryKey(d);
        return key !== String(resolvedA.category) && key !== String(resolvedB.category);
    });

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
    const animationPromises = [];

    animationPromises.push(
        otherRects.transition().duration(600).attr('opacity', 0.2).end()
    );
    animationPromises.push(
        barsA.transition().duration(600).attr('opacity', 1).attr('fill', colorA).end()
    );
    animationPromises.push(
        barsB.transition().duration(600).attr('opacity', 1).attr('fill', colorB).end()
    );

    const yMax = d3.max(Array.from(sumsByCategory.values())) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const getStackCenterTop = (rectSelection) => {
        if (rectSelection.empty()) return null;
        const nodes = rectSelection.nodes();
        let minY = Infinity, maxX = -Infinity, minX = Infinity;
        nodes.forEach(node => {
            const b = node.getBBox();
            minX = Math.min(minX, b.x);
            maxX = Math.max(maxX, b.x + b.width);
            minY = Math.min(minY, b.y);
        });
        return { x: minX + (maxX - minX) / 2, y: minY - 8 };
    };

    const annotateStack = (stackSelection, totalValue, color) => {
        const pos = getStackCenterTop(stackSelection);
        if (!pos) return;

        const yPos = margins.top + yScale(totalValue);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        const text = g.append("text").attr("class", "annotation")
            .attr("x", pos.x).attr("y", pos.y)
            .attr("text-anchor", "middle")
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", color)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(totalValue))
            .attr("opacity", 0);
        
        animationPromises.push(
            text.transition().delay(400).duration(400).attr("opacity", 1).end()
        );
    };

    annotateStack(barsA, sumA, colorA);
    annotateStack(barsB, sumB, colorB);

    await Promise.all(animationPromises);

    if (winner) {
        const winnerKey = winner?.id ?? winner?.target ?? (sumA >= sumB ? op.targetA : op.targetB);
        const resolvedWinner = resolveStackedDatum(data, winnerKey, sumsByCategory);
        const winnerSum = Number.isFinite(resolvedWinner.value) ? resolvedWinner.value : (winner?.value ?? (sumA >= sumB ? sumA : sumB));
        const winnerDatum = new DatumValue(
            winner.category ?? resolvedWinner.datum?.category ?? xField,
            winner.measure ?? resolvedWinner.datum?.measure ?? yField,
            resolvedWinner.category ?? winner.target,
            winner.group ?? resolvedWinner.group ?? null,
            winnerSum,
            winner.id ?? resolvedWinner.datum?.id ?? undefined
        );
        return [winnerDatum];
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
        const sumA = findValue(op.targetA);
        const sumB = findValue(op.targetB);
        const boolResult = evalComparison(op.operator, sumA, sumB);
        const label = op.field || (simpleVerdict && simpleVerdict.category) || yField || 'value';
        return [new BoolValue(label, boolResult)];
    }

    const opFor = {
        targetA: op.targetA,
        targetB: op.targetB,
        group: op.group ?? null,
        operator: op.operator,
        field: op.field || yField || 'value'
    };

    const verdict = isLast ? null : dataCompareBool(data, opFor, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarCompareBool: no data for group', subgroup);
            if (verdict instanceof BoolValue) return [verdict];
            return [new BoolValue(op.field || yField || 'value', false)];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { targetA: op.targetA, targetB: op.targetB, operator: op.operator, field: 'value' };
        const visVerdict = await simpleBarCompareBool(chartId, op2, subset, isLast);
        if (visVerdict) return Array.isArray(visVerdict) ? visVerdict : [visVerdict];
        if (verdict instanceof BoolValue) return [verdict];
        return [new BoolValue(op.field || yField || 'value', false)];
    }
    
    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const resolvedA = resolveStackedDatum(data, op.targetA, sumsByCategory);
    const resolvedB = resolveStackedDatum(data, op.targetB, sumsByCategory);

    if (!Number.isFinite(resolvedA.value) || !Number.isFinite(resolvedB.value)) {
        console.warn('stackedBarCompareBool: one or both targets not found for summing', op);
        if (verdict instanceof BoolValue) return [verdict];
        return [new BoolValue(op.field || yField || 'value', false)];
    }
    const sumA = resolvedA.value;
    const sumB = resolvedB.value;

    const allRects = g.selectAll('rect');
    const barsA = allRects.filter(d => getDatumCategoryKey(d) === String(resolvedA.category));
    const barsB = allRects.filter(d => getDatumCategoryKey(d) === String(resolvedB.category));
    const otherRects = allRects.filter(d => {
        const key = getDatumCategoryKey(d);
        return key !== String(resolvedA.category) && key !== String(resolvedB.category);
    });

    const boolResult = (verdict && typeof verdict.bool === 'boolean')
        ? verdict.bool
        : evalComparison(op.operator, sumA, sumB);
    const colorA = boolResult ? OP_COLORS.TRUE : OP_COLORS.FALSE;
    const colorB = colorA;
    const animationPromises = [];

    animationPromises.push(
        otherRects.transition().duration(600).attr('opacity', 0.2).end()
    );
    animationPromises.push(
        barsA.transition().duration(600).attr('opacity', 1).attr('fill', colorA).end()
    );
    animationPromises.push(
        barsB.transition().duration(600).attr('opacity', 1).attr('fill', colorB).end()
    );

    const yMax = d3.max(Array.from(sumsByCategory.values())) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const getStackCenterTop = (rectSelection) => {
        if (rectSelection.empty()) return null;
        const nodes = rectSelection.nodes();
        let minY = Infinity, maxX = -Infinity, minX = Infinity;
        nodes.forEach(node => {
            const b = node.getBBox();
            minX = Math.min(minX, b.x);
            maxX = Math.max(maxX, b.x + b.width);
            minY = Math.min(minY, b.y);
        });
        return { x: minX + (maxX - minX) / 2, y: minY - 8 };
    };

    const annotateStack = (stackSelection, totalValue, color) => {
        const pos = getStackCenterTop(stackSelection);
        if (!pos) return;

        const yPos = margins.top + yScale(totalValue);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        const text = g.append("text").attr("class", "annotation")
            .attr("x", pos.x).attr("y", pos.y)
            .attr("text-anchor", "middle")
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", color)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(totalValue))
            .attr("opacity", 0);
        
        animationPromises.push(
            text.transition().delay(400).duration(400).attr("opacity", 1).end()
        );
    };

    annotateStack(barsA, sumA, colorA);
    annotateStack(barsB, sumB, colorB);

    await Promise.all(animationPromises);

    const boolLabel = op.field || verdict?.category || yField || 'value';
    const boolValue = new BoolValue(boolLabel, boolResult, verdict?.id ?? null);
    return [boolValue];
}


export async function stackedBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const semantic = dataDiff(data, { targetA: op.targetA, targetB: op.targetB, group: op.group ?? null, field: op.field }, xField, yField, isLast);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarDiff: no data for group', subgroup);
            return semantic ? [new DatumValue(semantic.category, semantic.measure, semantic.target, subgroup, Math.abs(semantic.value), null)] : [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { targetA: op.targetA, targetB: op.targetB, field: 'value', signed: op.signed };
        const vis = await simpleBarDiff(chartId, op2, subset, isLast);
        return (vis && vis.length) ? vis : (semantic ? [new DatumValue(semantic.category, semantic.measure, semantic.target, subgroup, Math.abs(semantic.value), null)] : []);
    }

    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const resolvedA = resolveStackedDatum(data, op.targetA, sums);
    const resolvedB = resolveStackedDatum(data, op.targetB, sums);

    if (!Number.isFinite(resolvedA.value) || !Number.isFinite(resolvedB.value)) {
        console.warn('stackedBarDiff: one or both targets not found for summing', op);
        if (semantic) {
            const semanticValue = op.signed ? semantic.value : Math.abs(semantic.value);
            return [new DatumValue(semantic.category, semantic.measure, semantic.target, semantic.group ?? null, semanticValue, semantic.id)];
        }
        return [];
    }

    const sumA = resolvedA.value;
    const sumB = resolvedB.value;
    const diffValue = op.signed ? sumA - sumB : Math.abs(sumA - sumB);
    const diffDatum = new DatumValue(xField, yField, "Diff", null, diffValue);

    const allRects = g.selectAll('rect');
    const barsA = allRects.filter(d => getDatumCategoryKey(d) === String(resolvedA.category));
    const barsB = allRects.filter(d => getDatumCategoryKey(d) === String(resolvedB.category));
    const otherRects = allRects.filter(d => {
        const key = getDatumCategoryKey(d);
        return key !== String(resolvedA.category) && key !== String(resolvedB.category);
    });
    
    const colorA = OP_COLORS.DIFF_A;
    const colorB = OP_COLORS.DIFF_B;
    const diffColor = OP_COLORS.DIFF_LINE;
    const animationPromises = [];

    animationPromises.push(
        otherRects.transition().duration(600).attr('opacity', 0.2).end()
    );
    animationPromises.push(
        barsA.transition().duration(600).attr('opacity', 1).attr('fill', colorA).end()
    );
    animationPromises.push(
        barsB.transition().duration(600).attr('opacity', 1).attr('fill', colorB).end()
    );

    const yMax = d3.max(Array.from(sums.values())) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const getStackCenterTop = (rectSelection) => {
        if (rectSelection.empty()) return null;
        const nodes = rectSelection.nodes();
        let minY = Infinity, maxX = -Infinity, minX = Infinity;
        nodes.forEach(node => {
            const b = node.getBBox();
            minX = Math.min(minX, b.x);
            maxX = Math.max(maxX, b.x + b.width);
            minY = Math.min(minY, b.y);
        });
        return { x: minX + (maxX - minX) / 2, y: minY };
    };
    
    const annotateStack = (stackSelection, totalValue, color) => {
        const pos = getStackCenterTop(stackSelection);
        if (!pos) return;

        const yPos = margins.top + yScale(totalValue);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        const text = g.append("text").attr("class", "annotation")
            .attr("x", pos.x).attr("y", pos.y - 8)
            .attr("text-anchor", "middle")
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", color)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(totalValue))
            .attr("opacity", 0);
        
        animationPromises.push(
            text.transition().delay(400).duration(400).attr("opacity", 1).end()
        );
    };

    annotateStack(barsA, sumA, colorA);
    annotateStack(barsB, sumB, colorB);
    
    const posA = getStackCenterTop(barsA);
    const posB = getStackCenterTop(barsB);

    if (posA && posB) {
        const yA = margins.top + yScale(sumA);
        const yB = margins.top + yScale(sumB);
        const midY = (yA + yB) / 2;
        
        const lineX = margins.left + plot.w - 20;
        const textX = lineX + 8;

        const line = svg.append("line").attr("class", "annotation diff-line")
            .attr("x1", lineX).attr("y1", yA)
            .attr("x2", lineX).attr("y2", yB)
            .attr("stroke", diffColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        const text = svg.append("text").attr("class", "annotation diff-label")
            .attr("x", textX)
            .attr("y", midY)
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "middle")
            .attr("fill", diffColor)
            .attr("font-weight", "bold")
            .attr("font-size", 12)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`Diff: ${fmtNum(diffValue)}`)
            .attr("opacity", 0);
        
        animationPromises.push(line.transition().duration(800).end());
        animationPromises.push(text.transition().delay(400).duration(400).attr("opacity", 1).end());
    }

    await Promise.all(animationPromises);
    return [diffDatum];
}

export async function stackedBarNth(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarNth: no data for group', subgroup);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op };
        delete op2.group;
        return await simpleBarNth(chartId, op2, subset, isLast);
    }

    const nthOp = { ...op, groupBy: 'target' };
    const resultData = dataNth(data, nthOp);

    if (!resultData || resultData.length === 0) {
        console.warn("Nth: No result found for", op);
        return [];
    }

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = OP_COLORS.NTH;

    const allRects = g.selectAll('rect');
    const categoriesInOrder = [...new Set(data.map(d => d.target))];
    const sequence = from === 'right' ? categoriesInOrder.slice().reverse() : categoriesInOrder;

    n = Math.min(n, categoriesInOrder.length);

    await allRects.transition().duration(300).attr("opacity", 0.2).end();

    const countedRects = [];
    for (let i = 0; i < n; i++) {
        const category = sequence[i];
        const categoryRects = allRects.filter(d => getDatumCategoryKey(d) === category);
        countedRects.push(categoryRects);

        await categoryRects.transition().duration(100).attr('opacity', 1).end();

        const nodes = categoryRects.nodes();
        if (nodes.length > 0) {
            let minY = Infinity, maxX = -Infinity, minX = Infinity;
            nodes.forEach(node => {
                const b = node.getBBox();
                minX = Math.min(minX, b.x);
                maxX = Math.max(maxX, b.x + b.width);
                minY = Math.min(minY, b.y);
            });
            const cx = minX + (maxX - minX) / 2;

            g.append('text')
                .attr('class', 'annotation count-label')
                .attr('x', cx)
                .attr('y', minY - 8)
                .attr('text-anchor', 'middle')
                .attr('font-size', 12)
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1));
        }
        await delay(150);
    }

    const finalPromises = [];
    countedRects.forEach((rectSelection, i) => {
        if (i < n - 1) {
            finalPromises.push(rectSelection.transition().duration(300).attr('opacity', 0.2).end());
        }
    });

    finalPromises.push(
        g.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end()
    );
    await Promise.all(finalPromises);

    const targetCategory = sequence[n - 1];
    const targetData = data.filter(d => d.target === targetCategory);
    const totalSum = d3.sum(targetData, d => d.value);

    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const maxTotal = d3.max(sumsByCategory.values());
    const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
    const yPosForLine = margins.top + yScale(totalSum);

    svg.append('line').attr('class', 'annotation')
        .attr('stroke', hlColor).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
        .attr('x1', margins.left).attr('y1', yPosForLine)
        .attr('x2', margins.left + plot.w).attr('y2', yPosForLine);

    const finalStackSelection = countedRects[n - 1];
    const finalNodes = finalStackSelection.nodes();
    if (finalNodes.length > 0) {
        let minY = Infinity, maxX = -Infinity, minX = Infinity;
        finalNodes.forEach(node => {
            const b = node.getBBox();
            minX = Math.min(minX, b.x);
            maxX = Math.max(maxX, b.x + b.width);
            minY = Math.min(minY, b.y);
        });
        const cx = minX + (maxX - minX) / 2;
        g.append('text')
            .attr('class', 'annotation value-tag')
            .attr('x', cx)
            .attr('y', minY - 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(fmtNum(totalSum));
    }

    return resultData;
}

export async function stackedBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarCount: no data for group', subgroup);
            const zero = new DatumValue(xField, yField, 'Category Count', subgroup, 0, null);
            return [zero];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op };
        delete op2.group;
        return await simpleBarCount(chartId, op2, subset, isLast);
    }

    const categories = [...new Set(data.map(d => d.target))];
    const totalCount = categories.length;
    const result = new DatumValue(xField, yField, 'Category Count', null, totalCount, null);

    if (totalCount === 0) {
        console.warn('stackedBarCount: empty data');
        return [result];
    }

    const allRects = g.selectAll('rect');
    const hlColor = OP_COLORS.COUNT;

    await allRects.transition().duration(300).attr("opacity", 0.2).end();
    await delay(300);

    for (let i = 0; i < totalCount; i++) {
        const category = categories[i];
        const categoryRects = allRects.filter(d => getDatumCategoryKey(d) === category);

        await categoryRects.transition().duration(200)
            .attr('opacity', 1)
            .end();

        const nodes = categoryRects.nodes();
        if (nodes.length > 0) {
            let minY = Infinity, maxX = -Infinity, minX = Infinity;
            nodes.forEach(n => {
                const b = n.getBBox();
                minX = Math.min(minX, b.x);
                maxX = Math.max(maxX, b.x + b.width);
                minY = Math.min(minY, b.y);
            });
            const cx = minX + (maxX - minX) / 2;

            g.append('text')
                .attr('class', 'annotation count-label')
                .attr('x', cx)
                .attr('y', minY - 8)
                .attr('text-anchor', 'middle')
                .attr('font-size', 12)
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1));
        }
        await delay(50);
    }
    
    return [result];
}
