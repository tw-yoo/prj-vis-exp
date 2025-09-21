import {
    simpleBarAverage, simpleBarFilter, simpleBarFindExtremum, simpleBarSort, simpleBarDiff, simpleBarNth,
    simpleBarCount
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
    count as dataCount
} from "../../operationFunctions.js";

import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";
function findRectByTuple(g, t = {}) {
    const { facet, key } = t;
    let sel = g.selectAll("rect");
    if (facet != null) {
        sel = sel.filter(d => d && String(d.key) === String(facet));
    }
    if (key != null) {
        sel = sel.filter(d => d && String(d.subgroup) === String(key));
    }
    return sel.empty() ? null : sel.node();
}
async function animateSimpleToStacked(chartId, simpleData, fullData) {
    const { svg, g, xField, yField, colorField, plot, margins } = getSvgAndSetup(chartId);

    // 1. 되돌아갈 카테고리 목록 확보
    const keptCategories = new Set(simpleData.map(d => d.target));
    if (keptCategories.size === 0) {
        // 되돌아갈 데이터가 없으면 차트를 비움
        await g.selectAll("rect").transition().duration(500).attr("opacity", 0).remove().end();
        return;
    }

    // 2. 현재의 Simple Bar 막대들 제거
    await g.selectAll("rect").transition().duration(500).attr("y", plot.h).attr("height", 0).remove().end();

    // 3. 원래의 Stacked Bar 데이터를 필터링하여 재구성
    const stackedDataToShow = fullData.filter(d => keptCategories.has(d.target));

    // 4. 새로운 스케일과 D3 스택 레이아웃 생성
    const subgroups = Array.from(new Set(fullData.map(d => d.group)));
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(subgroups);

    const newXScale = d3.scaleBand().domain(Array.from(keptCategories)).range([0, plot.w]).padding(0.1);
    const yMax = d3.max(Array.from(d3.rollup(stackedDataToShow, v => d3.sum(v, d => d.value), d => d.target).values()));
    const newYScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const dataForStack = Array.from(keptCategories).map(cat => {
        const obj = { [xField]: cat };
        subgroups.forEach(sg => {
            const datum = stackedDataToShow.find(d => d.target === cat && d.group === sg);
            obj[sg] = datum ? datum.value : 0;
        });
        return obj;
    });

    const stackedSeries = d3.stack().keys(subgroups)(dataForStack);

    // 5. 축 업데이트 및 범례 다시 표시
    g.select(".y-axis").transition().duration(800).call(d3.axisLeft(newYScale));
    g.select(".x-axis").transition().duration(800).call(d3.axisBottom(newXScale));
    svg.select(".legend").transition().duration(800).attr("opacity", 1);

    // 6. 필터링된 Stacked Bar 다시 그리기
    g.append("g")
        .selectAll("g")
        .data(stackedSeries)
        .join("g")
        .attr("fill", d => colorScale(d.key))
        .attr("class", d => `series-${d.key}`)
        .selectAll("rect")
        .data(d => d.map(seg => ({ ...seg, seriesKey: d.key })))
        .join("rect")
        .attr("x", d => newXScale(d.data[xField]))
        .attr("width", newXScale.bandwidth())
        .attr("y", d => newYScale(d[0]))
        .attr("height", 0)
        .datum(function (d) {
            return {
                key: d.data[xField],
                subgroup: d.seriesKey,
                value: d.data[d.seriesKey] || 0,
                y0: d[0],
                y1: d[1],
            };
        })
        .transition().duration(800)
        .attr("y", d => newYScale(d.y1))
        .attr("height", d => newYScale(d.y0) - newYScale(d.y1));
}
function readGroupX(node) {
    const p = node?.parentNode?.parentNode; // rect -> series-g -> plot-area-g
    if (!p) return 0;
    const t = p.getAttribute && p.getAttribute("transform");
    if (!t) return 0;
    const m = /translate\(([-\d.]+)/.exec(t);
    return m ? +m[1] : 0;
}

function absCenter(svg, node) {
    const margins = { left: +svg.attr("data-m-left") || 0, top: +svg.attr("data-m-top") || 0 };
    const r = node.getBBox();
    const groupX = 0; // Stacked bar doesn't have facet groups, so groupX is 0 relative to plot area
    return { x: margins.left + groupX + r.x + r.width / 2, y: margins.top + r.y };
}

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
    const { svg, plot, margins } = getSvgAndSetup(chartId);

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
        const seriesData = dataFilter(data, { field: 'group', operator: '==', value: op.group });
        await stackedBarToSimpleBar(chartId, seriesData);
        return seriesData;
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
    const { svg, g, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const filterOp = { target: op.target };
    if (op.group) {
        filterOp.group = op.group;
    }
    const matchedData = dataRetrieveValue(data, filterOp);

    if (matchedData.length === 0) {
        console.warn('stackedBarRetrieveValue: no matching data found for', op);
        return [];
    }

    const targetPairs = new Set(matchedData.map(d => `${d.target}-${d.group}`));

    await g.selectAll('rect').transition().duration(400)
        .attr('opacity', function() {
            const d = d3.select(this).datum();
            return d && targetPairs.has(`${d.key}-${d.subgroup}`) ? 1 : 0.25;
        })
        .attr('stroke', function() {
            const d = d3.select(this).datum();
            return d && targetPairs.has(`${d.key}-${d.subgroup}`) ? 'black' : 'none';
        })
        .attr('stroke-width', 1)
        .end();

    const value = op.group
        ? matchedData[0].value
        : d3.sum(matchedData, d => d.value);

    const targetNodes = g.selectAll('rect').filter(function() {
        const d = d3.select(this).datum();
        return d && targetPairs.has(`${d.key}-${d.subgroup}`);
    }).nodes();

    if (targetNodes.length > 0) {
        let minY = Infinity;
        targetNodes.forEach(n => {
            const b = n.getBBox();
            minY = Math.min(minY, b.y);
        });
        const lastNodeBBox = targetNodes[targetNodes.length - 1].getBBox();

        const labelX = lastNodeBBox.x + lastNodeBBox.width / 2;
        const labelY = minY - 8;

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
            .text(fmtNum(value))
            .attr('opacity', 0)
            .transition().duration(200).attr('opacity', 1);
    }

    return matchedData;
}


export async function stackedBarFindExtremum(chartId, op, data) {
    const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    let targetDatum = null;
    let extremumValue = null;
    let scope = 'all';

    if (op.category != null) {
        scope = 'category';
        const subset = data.filter(d => String(d.target) === String(op.category));
        targetDatum = dataFindExtremum(subset, op);
        if (targetDatum) extremumValue = targetDatum.value;
    } else if (op.group != null) {
        scope = 'group';
        const subset = data.filter(d => String(d.group) === String(op.group));
        targetDatum = dataFindExtremum(subset, op);
        if (targetDatum) extremumValue = targetDatum.value;
    } else {
        scope = 'total';
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const totals = Array.from(sumsByCategory.entries(), ([key, value]) => ({ target: key, value }));
        const extremumTotal = dataFindExtremum(totals, op);
        if (extremumTotal) {
            targetDatum = data.find(d => String(d.target) === String(extremumTotal.target));
            extremumValue = extremumTotal.value;
        }
    }

    if (!targetDatum) {
        console.warn('FindExtremum: No result found for', op);
        return [];
    }

    const allRects = g.selectAll('rect');
    const hlColor = '#8A2BE2';

    if (scope === 'category') {
        const category = String(op.category);
        const targetRect = allRects.filter(d => String(d.key) === category && String(d.subgroup) === String(targetDatum.group));
        const categoryRects = allRects.filter(d => String(d.key) === category);
        const otherRects = allRects.filter(d => String(d.key) !== category);
        const nonTargetInCategory = categoryRects.filter(function() {
            return this !== targetRect.node();
        });

        await otherRects.transition().duration(600).attr("opacity", 0.2).end();
        await delay(300);

        await Promise.all([
            nonTargetInCategory.transition().duration(500).attr("opacity", 0.6).end(),
            targetRect.transition().duration(500).attr("fill", hlColor).attr("stroke", "black").attr("stroke-width", 1).end()
        ]);

    } else if (scope === 'group') {
        const group = String(op.group);
        const groupRects = allRects.filter(d => String(d.subgroup) === group);
        const targetRect = groupRects.filter(d => String(d.key) === String(targetDatum.target));
        await allRects.transition().duration(500).attr("opacity", 0.2).end();
        await groupRects.transition().duration(500).attr("opacity", 0.6).end();
        await targetRect.transition().duration(300).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 2).end();
    } else { // scope === 'total'
        const extremumCategory = targetDatum.target;
        const targetStackRects = allRects.filter(d => String(d.key) === String(extremumCategory));
        await g.selectAll("rect").transition().duration(500).attr("opacity", 0.2).end();
        await targetStackRects.transition().duration(500).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 0.5).end();

        const yMax = d3.max(Array.from(d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target).values()));
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = margins.top + y(extremumValue);

        svg.append("line").attr("class", "annotation").attr("x1", margins.left).attr("y1", yPos).attr("x2", margins.left + plot.w).attr("y2", yPos).attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
            .attr("text-anchor", "end").attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`${op.which} Total: ${fmtNum(extremumValue)}`);
    }

    if (scope === 'category' || scope === 'group') {
        const node = findRectByTuple(g, { facet: targetDatum.target, key: targetDatum.group });
        if(node) {
            const pos = absCenter(svg, node);
            svg.append("text").attr("class", "annotation")
                .attr("x", pos.x).attr("y", pos.y + node.getBBox().height/2)
                .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
                .attr("fill", "black").attr("font-weight", "bold")
                .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
                .text(fmtNum(extremumValue));
        }
    }

    return targetDatum ? [targetDatum] : [];
}

export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(dv => String(dv.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarDetermineRange: no data for group', subgroup);
            return null;
        }

        const simpleBarData = await stackedBarToSimpleBar(chartId, op, data);
        const { simpleBarDetermineRange } = await import("../simple/simpleBarFunctions.js");

        await simpleBarDetermineRange(chartId, { field: op.field || yField }, simpleBarData, isLast);

        const vals = subset.map(d => +d.value).filter(Number.isFinite);
        const minV = d3.min(vals);
        const maxV = d3.max(vals);

        return new IntervalValue(subgroup, minV ?? 0, maxV ?? 0);
    }

    const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
    const totals = Array.from(sumsByCategory.values());
    if (totals.length === 0) return null;

    const minTotal = d3.min(totals);
    const maxTotal = d3.max(totals);

    let minCategory, maxCategory;
    sumsByCategory.forEach((sum, cat) => {
        if (sum === minTotal) minCategory = cat;
        if (sum === maxTotal) maxCategory = cat;
    });

    const allRects = g.selectAll('rect');
    const minStackRects = allRects.filter(d => String(d.key) === String(minCategory));
    const maxStackRects = allRects.filter(d => String(d.key) === String(maxCategory));
    const otherRects = allRects.filter(d => String(d.key) !== String(minCategory) && String(d.key) !== String(maxCategory));

    const hlColor = "#0d6efd";
    const y = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
    const animationPromises = [];

    animationPromises.push(
        otherRects.transition().duration(600).attr("opacity", 0.2).end()
    );
    animationPromises.push(
        minStackRects.transition().duration(600).attr("opacity", 1).end()
    );
    animationPromises.push(
        maxStackRects.transition().duration(600).attr("opacity", 1).end()
    );

    [{ value: minTotal, label: "MIN" }, { value: maxTotal, label: "MAX" }].forEach(item => {
        const yPos = margins.top + y(item.value);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("y1", yPos).attr("x2", margins.left).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        const text = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + plot.w - 8)
            .attr("y", yPos - 8)
            .attr("text-anchor", "end")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`${item.label}: ${fmtNum(item.value)}`)
            .attr("opacity", 0);

        animationPromises.push(
            text.transition().delay(400).duration(400).attr("opacity", 1).end()
        );
    });

    const rangeText = `Range of Stack Totals: ${fmtNum(minTotal)} ~ ${fmtNum(maxTotal)}`;
    const topLabel = svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
        .text(rangeText)
        .attr("opacity", 0);

    animationPromises.push(
        topLabel.transition().delay(200).duration(600).attr("opacity", 1).end()
    );

    await Promise.all(animationPromises);

    return new IntervalValue('Stack Totals', minTotal, maxTotal);
}

export async function stackedBarCompare(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForCompare = {
        targetA: { target: op.targetA.category, group: op.targetA.series },
        targetB: { target: op.targetB.category, group: op.targetB.series },
        operator: op.operator,
        which: op.which
    };
    const winner = dataCompare(data, opForCompare);

    if (winner === undefined) {
        console.warn("stackedBarCompare: Comparison failed, data not found.", op);
        return [];
    }

    const datumA = data.find(d => String(d.target) === op.targetA.category && String(d.group) === op.targetA.series);
    const datumB = data.find(d => String(d.target) === op.targetB.category && String(d.group) === op.targetB.series);

    if (!datumA || !datumB) {
        console.warn("stackedBarCompare: One or both data points not found.", op);
        return [];
    }
    const valueA = datumA.value;
    const valueB = datumB.value;

    const allRects = g.selectAll("rect");
    let rectA, rectB;

    allRects.each(function() {
        const d = d3.select(this).datum();
        if (d && String(d.key) === op.targetA.category && String(d.subgroup) === op.targetA.series) rectA = d3.select(this);
        if (d && String(d.key) === op.targetB.category && String(d.subgroup) === op.targetB.series) rectB = d3.select(this);
    });

    if (!rectA || !rectB) {
        return winner ? [winner] : [];
    }

    const otherRects = allRects.filter(function() {
        return this !== rectA.node() && this !== rectB.node();
    });

    await otherRects.transition().duration(600).attr("opacity", 0).remove().end();

    const tempXDomain = [`${op.targetA.category}(${op.targetA.series})`, `${op.targetB.category}(${op.targetB.series})`];
    const tempXScale = d3.scaleBand().domain(tempXDomain).range([0, plot.w]).padding(0.4);
    const newYMax = Math.max(valueA, valueB);
    const newYScale = d3.scaleLinear().domain([0, newYMax]).nice().range([plot.h, 0]);

    const transformPromises = [];
    transformPromises.push(g.select(".y-axis").transition().duration(1000).call(d3.axisLeft(newYScale)).end());
    transformPromises.push(g.select(".x-axis").transition().duration(1000).call(d3.axisBottom(tempXScale)).end());
    transformPromises.push(rectA.transition().duration(1000)
        .attr("x", tempXScale(tempXDomain[0]))
        .attr("width", tempXScale.bandwidth())
        .attr("y", newYScale(valueA))
        .attr("height", plot.h - newYScale(valueA)).end());
    transformPromises.push(rectB.transition().duration(1000)
        .attr("x", tempXScale(tempXDomain[1]))
        .attr("width", tempXScale.bandwidth())
        .attr("y", newYScale(valueB))
        .attr("height", plot.h - newYScale(valueB)).end());

    await Promise.all(transformPromises);
    await delay(500);

    const colorA = rectA.attr('fill');
    const colorB = rectB.attr('fill');

    const addAnnotation = (bar, value, color) => {
        const bbox = bar.node().getBBox();
        const xPos = margins.left + bbox.x + bbox.width / 2;
        const yPos = margins.top + bbox.y;

        svg.append('line').attr('class', 'annotation')
            .attr('x1', margins.left).attr('y1', yPos)
            .attr('x2', margins.left + plot.w).attr('y2', yPos)
            .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
        svg.append('text').attr('class', 'annotation')
            .attr('x', xPos).attr('y', yPos - 5)
            .attr('text-anchor', 'middle').attr('fill', color).attr('font-weight', 'bold')
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(value));
    };

    addAnnotation(rectA, valueA, colorA);
    addAnnotation(rectB, valueB, colorB);

    const labelA = tempXDomain[0];
    const labelB = tempXDomain[1];

    const resultText = `${labelA}: ${fmtNum(valueA)} vs ${labelB}: ${fmtNum(valueB)}`;
    svg.append('text').attr('class', 'compare-label annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text(resultText);

    return winner ? [winner] : [];
}

export async function stackedBarCompareBool(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForCompare = {
        targetA: { target: op.targetA.category, group: op.targetA.series },
        targetB: { target: op.targetB.category, group: op.targetB.series },
        operator: op.operator
    };
    const compareResult = dataCompareBool(data, opForCompare);

    if (compareResult === null) {
        console.warn("stackedBarCompareBool: Comparison failed, data not found.", op);
        return new BoolValue('', false);
    }

    const result = compareResult.bool;
    const datumA = data.find(d => String(d.target) === op.targetA.category && String(d.group) === op.targetA.series);
    const datumB = data.find(d => String(d.target) === op.targetB.category && String(d.group) === op.targetB.series);

    if (!datumA || !datumB) {
        console.warn("stackedBarCompareBool: One or both data points not found", op);
        return compareResult;
    }

    const valueA = datumA.value;
    const valueB = datumB.value;

    const allRects = g.selectAll("rect");
    let rectA, rectB;

    allRects.each(function() {
        const d = d3.select(this).datum();
        if (d && String(d.key) === op.targetA.category && String(d.subgroup) === op.targetA.series) rectA = d3.select(this);
        if (d && String(d.key) === op.targetB.category && String(d.subgroup) === op.targetB.series) rectB = d3.select(this);
    });

    if (!rectA || !rectB) {
        return compareResult;
    }

    const otherRects = allRects.filter(function() {
        return this !== rectA.node() && this !== rectB.node();
    });

    await otherRects.transition().duration(600).attr("opacity", 0).remove().end();

    const tempXDomain = [`${op.targetA.category}(${op.targetA.series})`, `${op.targetB.category}(${op.targetB.series})`];
    const tempXScale = d3.scaleBand().domain(tempXDomain).range([0, plot.w]).padding(0.4);
    const newYMax = Math.max(valueA, valueB);
    const newYScale = d3.scaleLinear().domain([0, newYMax]).nice().range([plot.h, 0]);

    const transformPromises = [];
    transformPromises.push(g.select(".y-axis").transition().duration(1000).call(d3.axisLeft(newYScale)).end());
    transformPromises.push(g.select(".x-axis").transition().duration(1000).call(d3.axisBottom(tempXScale)).end());
    transformPromises.push(rectA.transition().duration(1000)
        .attr("x", tempXScale(tempXDomain[0]))
        .attr("width", tempXScale.bandwidth())
        .attr("y", newYScale(valueA))
        .attr("height", plot.h - newYScale(valueA)).end());
    transformPromises.push(rectB.transition().duration(1000)
        .attr("x", tempXScale(tempXDomain[1]))
        .attr("width", tempXScale.bandwidth())
        .attr("y", newYScale(valueB))
        .attr("height", plot.h - newYScale(valueB)).end());

    await Promise.all(transformPromises);
    await delay(500);

    const colorA = rectA.attr('fill');
    const colorB = rectB.attr('fill');

    const addAnnotation = (bar, value, color) => {
        const bbox = bar.node().getBBox();
        const xPos = margins.left + bbox.x + bbox.width / 2;
        const yPos = margins.top + bbox.y;

        svg.append('line').attr('class', 'annotation')
            .attr('x1', margins.left).attr('y1', yPos)
            .attr('x2', margins.left + plot.w).attr('y2', yPos) // 전체 너비로 수정
            .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
        svg.append('text').attr('class', 'annotation')
            .attr('x', xPos).attr('y', yPos - 5)
            .attr('text-anchor', 'middle').attr('fill', color).attr('font-weight', 'bold')
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(value));
    };

    addAnnotation(rectA, valueA, colorA);
    addAnnotation(rectB, valueB, colorB);

    const symbol = { '>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ' }[op.operator] || ` ${op.operator} `;
    const labelA = tempXDomain[0];
    const labelB = tempXDomain[1];

    svg.append('text').attr('class', 'compare-label annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', result ? 'green' : 'red')
        .text(`${labelA}${symbol}${labelB} → ${result}`);

    return compareResult;
}


export async function stackedBarSort(chartId, op, data) {
    const { svg, g, xField, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn("Sort operation received no data.");
        return data;
    }

    const sortOp = { ...op, aggregate: 'sum' };
    const sortedData = dataSort(data, sortOp, xField, yField);

    const sortedCategories = [...new Set(sortedData.map(d => d.target))];
    const xScale = d3.scaleBand().domain(sortedCategories).range([0, plot.w]).padding(0.1);

    const rectTransition = g.selectAll("rect")
        .transition().duration(1000)
        .attr("x", function(d) {
            return xScale(d.key);
        })
        .attr("width", xScale.bandwidth())
        .end();

    const axisTransition = g.select(".x-axis").transition().duration(1000)
        .call(d3.axisBottom(xScale))
        .end();

    await Promise.all([rectTransition, axisTransition]);

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .text(`Sorted by Total Value (${op.order})`);

    return sortedData;
}

export async function stackedBarSum(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

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
            y: +this.getAttribute('y')
        });
    });
    originalStates.sort((a, b) => a.x - b.x || b.y - a.y);
    const sortedRects = d3.selectAll(originalStates.map(s => s.node));

    let runningTotal = 0;
    const stackPromises = [];
    const barWidth = allRects.size() > 0 ? +allRects.node().getAttribute('width') : 20;
    const targetX = plot.w / 2 - barWidth / 2;

    sortedRects.each(function() {
        const value = d3.select(this).datum().value;
        const t = d3.select(this)
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

    if (op.group) {
        const seriesData = dataFilter(data, { field: 'group', operator: '==', value: op.group });
        const result = dataAverage(seriesData, op, 'target', 'value');

        if (!result) {
            console.warn('stackedBarAverage: Could not compute average for group:', op.group);
            return [];
        }

        const avgDatum = new DatumValue(
            result.category, result.measure, result.target,
            result.group, result.value, result.id
        );

        const simpleBarData = seriesData.map(d => ({ target: d.target, value: d.value }));
        await animateStackToTotalsBar(chartId, simpleBarData);

        const avgValue = avgDatum.value;
        const yMax = d3.max(simpleBarData, d => d.value);
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = margins.top + yScale(avgValue);
        const hlColor = "red";

        svg.append("line").attr("class", "annotation avg-line")
            .attr("x1", margins.left).attr("y1", yPos)
            .attr("x2", margins.left + plot.w).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        svg.append("text").attr("class", "annotation avg-label")
            .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
            .attr("text-anchor", "end")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`Avg: ${fmtNum(avgValue)}`);

        return [avgDatum];

    } else {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const totals = Array.from(sumsByCategory.values());
        const avgTotal = d3.mean(totals);
        const resultDatum = new DatumValue(xField, yField, 'Average of Totals', null, avgTotal, null);

        if (!Number.isFinite(avgTotal)) return [];

        const maxTotal = d3.max(totals);
        const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
        const yPos = margins.top + yScale(avgTotal);
        const hlColor = "red";

        svg.append("line").attr("class", "annotation avg-line")
            .attr("x1", margins.left).attr("y1", yPos)
            .attr("x2", margins.left).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5")
            .transition().duration(800)
            .attr("x2", margins.left + plot.w);

        svg.append("text").attr("class", "annotation avg-label")
            .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
            .attr("text-anchor", "end")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`Avg: ${fmtNum(avgTotal)}`)
            .attr("opacity", 0)
            .transition().delay(200).duration(400).attr("opacity", 1);

        return [resultDatum];
    }
}

export async function stackedBarDiff(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForDiff = {
        targetA: { target: op.targetA.category, group: op.targetA.series },
        targetB: { target: op.targetB.category, group: op.targetB.series }
    };
    const diffResult = dataDiff(data, opForDiff);

    if (!diffResult) {
        console.warn("stackedBarDiff: Could not compute difference.", op);
        return [];
    }

    const diffDatum = new DatumValue(
        diffResult.category, diffResult.measure, diffResult.target,
        diffResult.group, Math.abs(diffResult.value), diffResult.id
    );

    const datumA = data.find(d => String(d.target) === op.targetA.category && String(d.group) === op.targetA.series);
    const datumB = data.find(d => String(d.target) === op.targetB.category && String(d.group) === op.targetB.series);

    if (!datumA || !datumB) {
        console.warn("stackedBarDiff: One or both data points not found", op);
        return [];
    }

    const valueA = datumA.value;
    const valueB = datumB.value;
    const diff = Math.abs(diffResult.value);

    const allRects = g.selectAll("rect");
    let rectA, rectB;

    allRects.each(function() {
        const d = d3.select(this).datum();
        if (d && String(d.key) === op.targetA.category && String(d.subgroup) === op.targetA.series) rectA = d3.select(this);
        if (d && String(d.key) === op.targetB.category && String(d.subgroup) === op.targetB.series) rectB = d3.select(this);
    });

    if (!rectA || !rectB) {
        return [diffDatum];
    }

    const otherRects = allRects.filter(function() {
        return this !== rectA.node() && this !== rectB.node();
    });
    await otherRects.transition().duration(600).attr("opacity", 0).remove().end();

    const tempXDomain = [`${op.targetA.category}(${op.targetA.series})`, `${op.targetB.category}(${op.targetB.series})`];
    const tempXScale = d3.scaleBand().domain(tempXDomain).range([0, plot.w]).padding(0.4);
    const newYMax = Math.max(valueA, valueB);
    const newYScale = d3.scaleLinear().domain([0, newYMax]).nice().range([plot.h, 0]);

    const transformPromises = [];
    transformPromises.push(g.select(".y-axis").transition().duration(1000).call(d3.axisLeft(newYScale)).end());
    transformPromises.push(g.select(".x-axis").transition().duration(1000).call(d3.axisBottom(tempXScale)).end());
    transformPromises.push(rectA.transition().duration(1000)
        .attr("x", tempXScale(tempXDomain[0]))
        .attr("width", tempXScale.bandwidth())
        .attr("y", newYScale(valueA))
        .attr("height", plot.h - newYScale(valueA)).end());
    transformPromises.push(rectB.transition().duration(1000)
        .attr("x", tempXScale(tempXDomain[1]))
        .attr("width", tempXScale.bandwidth())
        .attr("y", newYScale(valueB))
        .attr("height", plot.h - newYScale(valueB)).end());

    await Promise.all(transformPromises);
    await delay(500);

    const colorA = rectA.attr('fill');
    const colorB = rectB.attr('fill');

    const addAnnotation = (bar, value, color) => {
        const bbox = bar.node().getBBox();
        const xPos = margins.left + bbox.x + bbox.width / 2;
        const yPos = margins.top + bbox.y;

        svg.append('line').attr('class', 'annotation')
            .attr('x1', margins.left).attr('y1', yPos)
            .attr('x2', margins.left + plot.w).attr('y2', yPos)
            .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
        svg.append('text').attr('class', 'annotation')
            .attr('x', xPos).attr('y', yPos - 5)
            .attr('text-anchor', 'middle').attr('fill', color).attr('font-weight', 'bold')
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(value));
    };

    addAnnotation(rectA, valueA, colorA);
    addAnnotation(rectB, valueB, colorB);

    const resultText = `Difference: ${fmtNum(diff)}`;
    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text(resultText);

    return [diffDatum];
}

export async function stackedBarNth(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

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