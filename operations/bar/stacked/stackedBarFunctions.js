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

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
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
        const t = rect.transition().duration(800)
            .attr("opacity", isTarget ? 1.0 : 0.2)
            .attr("stroke", isTarget ? "black" : "none")
            .attr("stroke-width", 1).end();
        highlightPromises.push(t);
    });
    await Promise.all(highlightPromises);
    await delay(1000);

    if (filteredData.length === 0) {
        console.warn("Filter resulted in no matching bars.");
        chartRects.transition().duration(500).attr("opacity", 0).remove();
        return;
    }

    const transformPromises = [];
    const fadeOut = chartRects.filter(d => !targetIds.has(`${d.key}-${d.subgroup}-${d.value}`))
        .transition().duration(500).attr("opacity", 0).remove().end();
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
        const t = rect.transition().duration(1000)
            .attr("y", newYScale(d.value))
            .attr("height", plot.h - newYScale(d.value))
            .attr("stroke-width", 0.5).end();
        transformPromises.push(t);
    });

    const yAxisTransition = svg.select(".y-axis").transition().duration(1000)
        .call(d3.axisLeft(newYScale)).end();
    transformPromises.push(yAxisTransition);
    await Promise.all(transformPromises);
}

export async function stackedBarFilter(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        const subgroup = String(op.group);
        // 1) Slice to the requested subgroup only
        const seriesData = dataFilter(data, { field: 'group', operator: '==', value: subgroup });
        // 2) Convert stacked → simple using only this subgroup
        await stackedBarToSimpleBar(chartId, seriesData);
        // 3) Run the same filter animation/logic as simpleBar
        const op2 = { ...op };
        delete op2.group; // group already applied by slicing
        return await simpleBarFilter(chartId, op2, seriesData, false);
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
        const filteredByTarget = dataFilter(data, { field: 'target', operator: op.operator, value: op.value });
        keepCategories = new Set(filteredByTarget.map(d => d.target));
    }

    // 필터 조건 라벨 (차트 상단 왼쪽)
    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 8)
        .attr("font-size", 12).attr("fill", "black").attr("font-weight", "bold")
        .text(`Filter: ${op.field} ${op.operator} ${op.value}`);

    if (op.field === measureField && Number.isFinite(op.value)) {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const maxTotal = d3.max(sumsByCategory.values());
        const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
        const yPos = yScale(op.value); // plot.h 기준이므로 margins.top 더하지 않음

        // 기준선 그리기
        g.append('line').attr('class', 'annotation threshold-line')
            .attr('x1', 0).attr('y1', yPos)
            .attr('x2', plot.w).attr('y2', yPos)
            .attr('stroke', 'blue').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 5');

        // 기준선 라벨 (차트 내부, 선 위에)
        g.append('text').attr('class', 'annotation threshold-label')
            .attr('x', plot.w - 5).attr('y', yPos - 5)
            .attr('text-anchor', 'end')
            .attr('fill', 'blue').attr('font-size', 12).attr('font-weight', 'bold')
            .text(`${op.value}`);

        await delay(800);
    }

    const allRects = g.selectAll('rect');
    const keepSel = allRects.filter(d => keepCategories.has(String(d.key)));
    const dropSel = allRects.filter(d => !keepCategories.has(String(d.key)));

    await dropSel.transition().duration(500).attr("opacity", 0).remove().end();

    const newXScale = d3.scaleBand().domain(Array.from(keepCategories)).range([0, plot.w]).padding(0.1);

    const rectTransition = keepSel.transition().duration(800)
        .attr("x", d => newXScale(d.key))
        .attr("width", newXScale.bandwidth())
        .end();

    const axisTransition = g.select(".x-axis").transition().duration(800)
        .call(d3.axisBottom(newXScale))
        .end();

    await Promise.all([rectTransition, axisTransition]);

    return data.filter(d => keepCategories.has(String(d.target)));
}

export async function stackedBarRetrieveValue(chartId, op, data) {
    const { svg, g, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // If a subgroup is specified, convert stacked → simple and animate
    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarRetrieveValue: no data for group', subgroup);
            return [];
        }

        // 1) Transform chart to show only the requested subgroup as simple bars
        await stackedBarToSimpleBar(chartId, subset);

        // 2) Resolve selection within the subgroup (same semantics as simpleBarRetrieveValue)
        const selected = dataRetrieveValue(subset, op) || [];
        const selectedTargets = selected.map(d => String(d.target));

        // 3) Highlight target bars
        const hlColor = '#ff6961';
        const bars = g.selectAll('rect');
        const target = bars.filter(function () {
            const d = d3.select(this).datum();
            return d && selectedTargets.includes(String(d.key));
        });
        if (target.empty()) {
            console.warn('stackedBarRetrieveValue(group): target bars not found for', op?.target);
            return selected;
        }

        const animPromises = [];
        animPromises.push(
            target.transition().duration(600).attr('fill', hlColor).attr('opacity', 1).end()
        );

        // 4) Scales for guide lines (use subgroup-only data)
        let xScale, yScale;
        if (orientation === 'horizontal') {
            // Horizontal simple bars
            yScale = d3.scaleBand().domain(subset.map(d => String(d.target))).range([0, plot.h]).padding(0.2);
            const xMax = d3.max(subset, d => +d.value) || 0;
            xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        } else {
            // Vertical simple bars
            xScale = d3.scaleBand().domain(subset.map(d => String(d.target))).range([0, plot.w]).padding(0.2);
            const yMax = d3.max(subset, d => +d.value) || 0;
            yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        }

        // 5) Animated dashed guide lines (draw on svg, meet y-axis exactly)
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
                .attr('stroke', 'red')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
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
                .attr('stroke', 'red')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', 0);
            animPromises.push(
                entered.transition().duration(400)
                    .attr('x2', margins.left)
                    .attr('opacity', 1)
                    .end()
            );
        }

        // 6) Add value labels centered above each selected bar
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

    // --- No group: Highlight the entire stack and show the total ---
    const matchedData = dataRetrieveValue(data, { target: op.target }) || [];
    if (matchedData.length === 0) {
        console.warn('stackedBarRetrieveValue: no matching data found for', op);
        return [];
    }
    
    // Calculate the total value for the stack
    const totalValue = d3.sum(matchedData, d => d.value);
    
    const targetStackId = String(op.target);
    const targetRects = g.selectAll('rect').filter(d => d && String(d.key) === targetStackId);
    const otherRects = g.selectAll('rect').filter(d => !d || String(d.key) !== targetStackId);

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
        
        // Add total value label
        g.append('text')
            .attr('class', 'value-tag annotation')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .attr('fill', '#e03131')
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(fmtNum(totalValue))
            .attr('opacity', 0)
            .transition().duration(200).attr('opacity', 1);
            
        // Add guideline
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
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('opacity', 0)
            .transition().duration(400)
            .attr('x1', margins.left)
            .attr('opacity', 1);
    }
    
    // Return a single DatumValue with the summed value for 'last' operation
    const firstMatch = matchedData[0];
    return [new DatumValue(firstMatch.category, firstMatch.measure, firstMatch.target, null, totalValue, `${targetStackId}-total`)];
}

export async function stackedBarFindExtremum(chartId, op, data) {
    const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = '#a65dfb';

    // Helper: draw animated dashed guide line at the value position (vertical)
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
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4 4');
        await line.transition().duration(400).attr('x2', margins.left + plot.w).end();
    };

    // Helper: add centered label above a bar node (like simpleBarFindExtremum)
    const labelBar = (node, text) => {
        if (!node) return;
        const bbox = node.getBBox();
        const x = margins.left + bbox.x + bbox.width / 2;
        const y = margins.top + bbox.y - 6; // slightly above bar top
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

    // Case 1: op.group 지정 시 — 해당 시리즈만 simple bar로 변환 후 extremum 처리
    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(dv => String(dv.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarFindExtremum: no data for group', subgroup);
            return [];
        }

        // Stacked → Simple (해당 subgroup만 유지)
        await stackedBarToSimpleBar(chartId, subset);

        // Extremum 계산 (subset 내에서)
        const targetDatum = dataFindExtremum(subset, op);
        if (!targetDatum) {
            console.warn('FindExtremum(group): No result for', op);
            return [];
        }

        const extremumValue = +targetDatum.value;
        const yMax = d3.max(subset, d => +d.value) || 0;
        await drawGuideAt(extremumValue, yMax);

        // 변환 후 남은 rect들 중 target 카테고리 선택
        const targetRect = g.selectAll('rect').filter(d => d && String(d.key) === String(targetDatum.target));
        if (!targetRect.empty()) {
            await targetRect.transition().duration(500).attr('fill', hlColor).attr('stroke', 'black').attr('stroke-width', 1).end();
            const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${fmtNum(extremumValue)}`;
            labelBar(targetRect.node(), labelText);
        }
        return [targetDatum];
    }

    // Case 2: op.category 지정 — 해당 카테고리 내부의 extremum (stacked 유지)
    if (op.category != null) {
        const category = String(op.category);
        const subset = data.filter(d => String(d.target) === category);
        const targetDatum = dataFindExtremum(subset, op);
        if (!targetDatum) {
            console.warn('FindExtremum(category): No result for', op);
            return [];
        }
        const extremumValue = +targetDatum.value;

        // 전체 도메인 기준 가이드라인 + 하이라이트 (simpleBar 스타일)
        const globalMax = d3.max(data, d => +d.value) || 0;
        await drawGuideAt(extremumValue, globalMax);

        const allRects = g.selectAll('rect');
        const targetRect = allRects.filter(d => d && String(d.key) === category && String(d.subgroup) === String(targetDatum.group));
        const otherInCategory = allRects.filter(d => d && String(d.key) === category && String(d.subgroup) !== String(targetDatum.group));
        const others = allRects.filter(d => !d || String(d.key) !== category);

        await others.transition().duration(500).attr('opacity', 0.2).end();
        await otherInCategory.transition().duration(500).attr('opacity', 0.6).end();
        await targetRect.transition().duration(500).attr('fill', hlColor).attr('stroke', 'black').attr('stroke-width', 1).end();

        const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${fmtNum(extremumValue)}`;
        labelBar(targetRect.node(), labelText);
        return [targetDatum];
    }

    // Case 3: 전체 합계 기준 extremum (각 카테고리 합계 → min/max)
    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sumsByCategory.entries(), ([key, value]) => ({ target: key, value }));
    const extremumTotal = dataFindExtremum(totals, op);
    if (!extremumTotal) {
        console.warn('FindExtremum(total): No result for', op);
        return [];
    }

    const extremumValue = +extremumTotal.value;
    const extremumCategory = extremumTotal.target;

    // 전체 라인/라벨 (simpleBar 스타일)
    const yMaxTotal = d3.max(totals, d => d.value) || 0;
    await drawGuideAt(extremumValue, yMaxTotal);

    const allRects = g.selectAll('rect');
    const targetStackRects = allRects.filter(d => d && String(d.key) === String(extremumCategory));
    const others = allRects.filter(d => !d || String(d.key) !== String(extremumCategory));

    await others.transition().duration(500).attr('opacity', 0.2).end();
    await targetStackRects.transition().duration(500).attr('opacity', 1).attr('stroke', 'black').attr('stroke-width', 0.5).end();

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
        .text(`${op.which} Total: ${fmtNum(extremumValue)}`)
        .attr('opacity', 0)
        .transition().duration(400).attr('opacity', 1);

    return [data.find(d => String(d.target) === String(extremumCategory)) || extremumTotal];
}

export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // If a group is specified, convert to simple bar and reuse simpleBar animations
    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(dv => String(dv.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarDetermineRange: no data for group', subgroup);
            return new IntervalValue(op.group, NaN, NaN);
        }
        await stackedBarToSimpleBar(chartId, subset);
        // Reuse simple-bar animation style, which already implements the desired labeling
        return await simpleBarDetermineRange(chartId, { field: op.field || yField }, subset, isLast);
    }

    // No subgroup: operate on stack totals
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
    const minStackRects = allRects.filter(d => String(d.key) === String(minCategory));
    const maxStackRects = allRects.filter(d => String(d.key) === String(maxCategory));
    const otherRects = allRects.filter(d => String(d.key) !== String(minCategory) && String(d.key) !== String(maxCategory));

    const hlColor = '#0d6efd';
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

    // --- 수정된 부분 시작 ---
    // Helper to get the center-top position of a stack of bars
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
            y: minY - 8 // 8px above the top of the stack
        };
    };

    [
        { value: minTotal, label: "Min", bars: minStackRects },
        { value: maxTotal, label: "Max", bars: maxStackRects }
    ].forEach(item => {
        if (item.value === undefined) return;
        const yPos = margins.top + yScale(item.value);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        // Position label above the center of the stack
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
                .text(`${item.label}: ${fmtNum(item.value)}`)
                .attr("opacity", 0);
            
            animationPromises.push(
                text.transition().delay(400).duration(400).attr("opacity", 1).end()
            );
        }
    });
    
    // 상단 Range 텍스트 라벨 생성 코드 제거

    await Promise.all(animationPromises);

    return result;
}

export async function stackedBarCompare(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // Build a normalized op for the data layer
    const opForCompare = {
        targetA: op.targetA,
        targetB: op.targetB,
        group: op.group ?? null,
        operator: op.operator,
        which: op.which,
        field: op.field || yField || 'value'
    };

    // Compute the canonical result (used as return value)
    let winner = dataCompare(data, opForCompare, xField, yField, false);

    // --- Visualization path ---
    if (op.group != null) {
        // Case A: compare within a single subgroup → convert to simple bar and reuse simpleBarCompare
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarCompare: no data for group', subgroup);
            return winner ? [winner] : [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { targetA: op.targetA, targetB: op.targetB, operator: op.operator, which: op.which, field: 'value' };
        return await simpleBarCompare(chartId, op2, subset, false);
    }

    // Case B: compare totals across categories (no group specified)
    // 1) Aggregate to totals per category
    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totalsData = Array.from(sumsByCategory, ([target, value]) => ({ target, value }));

    if (totalsData.length === 0) {
        console.warn('stackedBarCompare: no data to aggregate for totals');
        return winner ? [winner] : [];
    }

    // 2) Animate the chart to a two-column simple bar of totals
    await animateStackToTotalsBar(chartId, totalsData);

    // 3) Reuse simpleBarCompare on the totals view
    const op2 = { targetA: op.targetA, targetB: op.targetB, operator: op.operator, which: op.which, field: 'value' };
    const visResult = await simpleBarCompare(chartId, op2, totalsData, false);

    // Prefer visual result if present; otherwise fall back to winner
    return Array.isArray(visResult) && visResult.length ? visResult : (winner ? [winner] : []);
}

export async function stackedBarCompareBool(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1) 데이터 계층: op 정규화
    const opFor = {
        targetA: op.targetA,
        targetB: op.targetB,
        group: op.group ?? null,
        operator: op.operator,
        field: op.field || yField || 'value'
    };

    // 시맨틱 결과 미리 계산
    const verdict = dataCompareBool(data, opFor, xField, yField, true); // isLast=true로 전달

    // 2) 시각화 경로
    if (op.group != null) {
        // (A) 특정 subgroup 내 비교 (기존 로직 유지)
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarCompareBool: no data for group', subgroup);
            return verdict || new BoolValue('', false);
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { targetA: op.targetA, targetB: op.targetB, operator: op.operator, field: 'value' };
        const visVerdict = await simpleBarCompareBool(chartId, op2, subset, false);
        return visVerdict || verdict || new BoolValue('', false);
    }

    // (B) group 미지정: 카테고리 합계(스택 토털) 기준 비교
    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totalsData = Array.from(sums, ([target, value]) => ({ target, value }));

    if (totalsData.length === 0) {
        console.warn('stackedBarCompareBool: no data to aggregate for totals');
        return verdict || new BoolValue('', false);
    }

    // 차트를 합계 기준의 단순 막대 차트로 애니메이션
    await animateStackToTotalsBar(chartId, totalsData);

    // --- 수정된 부분 시작 ---
    // 'last' 연산에서 넘어온 ID('ops_0')를 실제 카테고리 값('7')으로 변환하는 헬퍼 함수
    const getTargetFromId = (id) => {
        // ID 형식이 아니면 원래 값을 그대로 반환
        if (typeof id !== 'string' || !id.startsWith('ops')) return id;
        
        // 'data' 파라미터는 이 컨텍스트에서 dataCache의 전체 목록임
        const found = Array.isArray(data) ? data.find(d => d.id === id) : null;
        // 찾은 DatumValue에서 실제 target 값(예: '7')을 반환
        return found ? found.target : id;
    };

    // op.targetA와 op.targetB에 ID가 들어왔을 경우, 실제 카테고리 값으로 변환
    const targetA_resolved = getTargetFromId(op.targetA);
    const targetB_resolved = getTargetFromId(op.targetB);

    // 변환된 카테고리 값으로 새로운 op 객체 생성
    const op2 = { targetA: targetA_resolved, targetB: targetB_resolved, operator: op.operator, field: 'value' };
    
    // simpleBarCompareBool 호출. 이제 '7', '11'과 같은 값으로 막대를 찾게 됨.
    const visVerdict = await simpleBarCompareBool(chartId, op2, totalsData, false);
    // --- 수정된 부분 끝 ---

    return visVerdict || verdict || new BoolValue('', false);
}


export async function stackedBarSort(chartId, op, data) {
    const { svg, g, xField, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn("Sort operation received no data.");
        return data;
    }

    // ✅ group이 지정되면: 해당 subgroup 데이터만 남겨 simple bar로 변환 후 simpleBarSort 재사용
    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarSort: no data for group', subgroup);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);        // 스택 → 심플로 변환(애니메이션 통일)
        const op2 = { ...op };
        delete op2.group;                                    // 이미 슬라이스됨
        return await simpleBarSort(chartId, op2, subset, false);
    }

    // 🧱 group 미지정: 기존 “스택 합계 기준 정렬” 유지
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

export async function stackedBarSum(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // (group 있을 때 로직은 변경 없음)
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
        return await simpleBarSum(chartId, op2, subset, false);
    }

    const result = dataSum(data, op, facetField, yField);
    const totalSum = result ? result.value : 0;

    if (totalSum === 0) {
        console.warn("Sum is 0 or could not be calculated.");
        return result;
    }

    const allRects = g.selectAll("rect");
    const color = '#e83e8c';

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
        .attr("x1", margins.left).attr("x2", margins.left + plot.w)
        .attr("y1", yPos).attr("y2", yPos).attr("stroke", color).attr("stroke-width", 2.5);

    svg.append("text").attr("class", "annotation sum-label")
        .attr("x", margins.left + plot.w - 10).attr("y", yPos - 15)
        .attr("text-anchor", "end").attr("fill", color).attr("font-weight", "bold").attr("font-size", "14px")
        .text(`Sum: ${fmtNum(totalSum)}`);

    return result;
}

export async function stackedBarAverage(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // Case A) group이 지정된 경우: 해당 subgroup만 남겨 simple bar로 변환 후 simpleBarAverage 재사용 (기존 로직 유지)
    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarAverage: no data for group', subgroup);
            return [];
        }
        // stacked → simple (연출 통일)
        await stackedBarToSimpleBar(chartId, subset);
        // dataAverage가 value 필드를 쓰도록 field 명시
        const op2 = { ...op, field: 'value' };
        delete op2.group; // 이미 슬라이스됨
        return await simpleBarAverage(chartId, op2, subset, false);
    }

    // --- 수정된 부분 시작 ---
    // Case B) group 미지정: 차트를 다시 그리지 않고 원본 차트 위에 평균선 오버레이

    // 1. 각 카테고리(막대)의 합계를 계산합니다.
    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totalsData = Array.from(sumsByCategory.values());
    if (totalsData.length === 0) {
        console.warn('stackedBarAverage: no data to aggregate for totals');
        return [];
    }
    
    // 2. 합계 데이터의 평균을 계산합니다.
    const averageValue = d3.mean(totalsData);
    if (!Number.isFinite(averageValue)) {
        console.warn('stackedBarAverage: average could not be computed.');
        return [];
    }
    const resultDatum = dataAverage(data, op, xField, yField);

    // 3. 현재 차트의 y축 스케일을 가져와 평균선 위치를 계산합니다.
    const yMax = d3.max(Array.from(sumsByCategory.values()));
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const yPos = yScale(averageValue);

    const hlColor = '#d62728'; // 평균선을 강조할 색상

    // 4. 평균선을 그립니다. (x좌표를 0에서 plot.w까지 애니메이션)
    const line = g.append('line')
        .attr('class', 'annotation avg-line')
        .attr('x1', 0)
        .attr('x2', 0) // 시작은 너비 0
        .attr('y1', yPos)
        .attr('y2', yPos)
        .attr('stroke', hlColor)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6 4');
        
    await line.transition().duration(800)
        .attr('x2', plot.w) // 끝까지 선을 그림
        .end();

    // 5. 평균값 라벨을 추가하고 fade-in 시킵니다.
    g.append('text')
        .attr('class', 'annotation avg-label')
        .attr('x', plot.w - 10)
        .attr('y', yPos - 10)
        .attr('text-anchor', 'end')
        .attr('fill', hlColor)
        .attr('font-weight', 'bold')
        .attr('stroke', 'white')
        .attr('stroke-width', 3.5)
        .attr('paint-order', 'stroke')
        .text(`Avg: ${averageValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
        .attr('opacity', 0)
        .transition().delay(200).duration(400)
        .attr('opacity', 1);

    return resultDatum;
    // --- 수정된 부분 끝 ---
}

export async function stackedBarDiff(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // targetA/targetB를 문자열 키로 정규화 (객체 스펙도 지원)
    const normTarget = (t) => {
        if (t && typeof t === 'object') return String(t.category ?? t.target ?? '');
        return String(t ?? '');
    };
    const op2 = {
        targetA: normTarget(op.targetA),
        targetB: normTarget(op.targetB),
        field: 'value'
    };

    // 의미(수치) 결과는 한 번 계산해 둔다 (반환 보정용)
    const semantic = dataDiff(
        data,
        { targetA: op.targetA, targetB: op.targetB, group: op.group ?? null, field: op.field },
        xField, yField, false
    );

    if (op.group != null) {
        // A) 같은 subgroup 안에서의 차이 → 해당 subgroup으로 슬라이스 후 stacked→simple, simpleBarDiff 재사용
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarDiff: no data for group', subgroup);
            return semantic
                ? [new DatumValue(semantic.category, semantic.measure, semantic.target, subgroup, Math.abs(semantic.value), null)]
                : [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const vis = await simpleBarDiff(chartId, op2, subset, false);
        return (vis && vis.length)
            ? vis
            : (semantic ? [new DatumValue(semantic.category, semantic.measure, semantic.target, subgroup, Math.abs(semantic.value), null)] : []);
    }

    // B) group 미지정: 카테고리별 스택 합계(totals)로 변환 후 simpleBarDiff 재사용
    const sums = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totalsData = Array.from(sums, ([target, value]) => ({ target, value }));
    if (totalsData.length === 0) {
        console.warn('stackedBarDiff: no data to aggregate for totals');
        return semantic
            ? [new DatumValue(semantic.category, semantic.measure, semantic.target, null, Math.abs(semantic.value), null)]
            : [];
    }

    await animateStackToTotalsBar(chartId, totalsData);
    const vis = await simpleBarDiff(chartId, op2, totalsData, false);
    return (vis && vis.length)
        ? vis
        : (semantic ? [new DatumValue(semantic.category, semantic.measure, semantic.target, null, Math.abs(semantic.value), null)] : []);
}

export async function stackedBarNth(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // If a subgroup (series) is specified, slice → stacked→simple → reuse simpleBarNth for consistent animation
    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarNth: no data for group', subgroup);
            return [];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op };
        delete op2.group; // already applied via slicing
        return await simpleBarNth(chartId, op2, subset, false);
    }

    const nthOp = { ...op, groupBy: 'target' };
    const resultData = dataNth(data, nthOp);

    if (!resultData || resultData.length === 0) {
        console.warn("Nth: No result found for", op);
        return [];
    }

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = '#ff6961';

    const allRects = g.selectAll('rect');
    const categoriesInOrder = [...new Set(data.map(d => d.target))];
    const sequence = from === 'right' ? categoriesInOrder.slice().reverse() : categoriesInOrder;

    n = Math.min(n, categoriesInOrder.length);

    await allRects.transition().duration(300).attr("opacity", 0.2).end();

    const countedRects = [];
    for (let i = 0; i < n; i++) {
        const category = sequence[i];
        const categoryRects = allRects.filter(d => d.key === category);
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
        .attr('stroke', hlColor).attr('stroke-width', 2).attr('stroke-dasharray', '4,4')
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
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 3.5)
            .attr('paint-order', 'stroke')
            .text(fmtNum(totalSum));
    }

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth: ${from} ${n}`);

    return resultData;
}

export async function stackedBarCount(chartId, op, data) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // If a subgroup is specified, operate within that series as simple bar and reuse simpleBarCount
    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('stackedBarCount: no data for group', subgroup);
            // Return a zero-count datum consistent with count semantics
            const zero = new DatumValue(xField, yField, 'Category Count', subgroup, 0, null);
            return [zero];
        }
        await stackedBarToSimpleBar(chartId, subset);
        const op2 = { ...op };
        delete op2.group; // already applied via slicing
        return await simpleBarCount(chartId, op2, subset, false);
    }

    const categories = [...new Set(data.map(d => d.target))];
    const totalCount = categories.length;
    const result = new DatumValue(xField, yField, 'Category Count', null, totalCount, null);

    if (totalCount === 0) {
        console.warn('stackedBarCount: empty data');
        return [result];
    }

    const allRects = g.selectAll('rect');
    const hlColor = '#20c997';

    await allRects.transition().duration(300).attr("opacity", 0.2).end();
    await delay(300);

    for (let i = 0; i < totalCount; i++) {
        const category = categories[i];
        const categoryRects = allRects.filter(d => d.key === category);

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
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1));
        }

        await delay(50);
    }

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount} categories`);

    return [result];
}