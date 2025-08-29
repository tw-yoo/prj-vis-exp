import {
    simpleBarAverage, simpleBarFilter, simpleBarFindExtremum, simpleBarSort, simpleBarDiff, simpleBarNth,
    simpleBarCount
} from "../simple/simpleBarFunctions.js";


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

export async function stackedBarToSimpleBar(chartId, op, data) {
    const { svg, xField, yField, colorField, plot, margins } = getSvgAndSetup(chartId);
    
    let filteredData = [...data];
    if (op.group) {
        filteredData = filteredData.filter(d => d.group === op.group);
    }
    // if (op.key !== undefined && op.satisfy) {
    //     const cmp = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a == b };
    //     const satisfyFn = cmp[op.satisfy];
    //     if (satisfyFn) {
    //         filteredData = filteredData.filter(d => satisfyFn(d[yField], op.key));
    //     }
    // }

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
        return [];
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
    
    // let labelText = "Filtered by: ";
    // const conditions = [];
    // if (op.group) conditions.push(`'${op.group}'`);
    // if (op.key !== undefined) conditions.push(`${op.field || yField} ${op.satisfy} ${op.key}`);
    // labelText += conditions.join(" & ");
    //
    // svg.append("text").attr("class", "filter-label")
    //   .attr("x", margins.left).attr("y", margins.top - 10)
    //   .attr("font-size", 14).attr("font-weight", "bold")
    //   .attr("fill", "#007bff").text(labelText);

    return filteredData;
}

export async function stackedBarFilter(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (op.group != null) {
        return await stackedBarToSimpleBar(chartId, op, data);
    }

    const categoryField = xField;
    const measureField = yField;
    let keepCategories = new Set();

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
        
        if (Number.isFinite(op.value)) {
            const maxTotal = d3.max(sumsByCategory.values());
            const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
            const yPos = margins.top + yScale(op.value);
            
            svg.append('line').attr('class', 'annotation threshold-line')
                .attr('x1', margins.left).attr('y1', yPos)
                .attr('x2', margins.left + plot.w).attr('y2', yPos)
                .attr('stroke', 'blue').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 5');
                
            svg.append('text').attr('class', 'annotation threshold-label')
                .attr('x', margins.left + plot.w + 6).attr('y', yPos)
                .attr('dominant-baseline', 'middle')
                .attr('fill', 'blue').attr('font-weight', 'bold')
                .text(`${op.operator} ${op.value}`);
        }

    } else if (op.field === categoryField) {
        const operator = op.operator;
        const value = op.value;
        if (operator === '==' || operator === 'eq') {
            keepCategories.add(String(value));
        } else if (operator === 'in' && Array.isArray(value)) {
            value.forEach(v => keepCategories.add(String(v)));
        }
    }

    await g.selectAll('rect').transition().duration(600)
        .attr('opacity', function() {
            const d = d3.select(this).datum();
            return d && keepCategories.has(String(d.key)) ? 1 : 0.2;
        })
        .end();

    return data.filter(d => keepCategories.has(String(d.target)));
}



export async function stackedBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const categoryLabel = op.target != null ? String(op.target) : null;
    if (!categoryLabel) {
        console.warn('stackedBarRetrieveValue: missing target category');
        return null;
    }

    const seriesLabel = op.group != null ? String(op.group) : null;
    const targetPairs = new Set();
    
    if (seriesLabel) {
        targetPairs.add(`${categoryLabel}-${seriesLabel}`);
    } else {
        const seriesInCategroy = Array.from(new Set(data
            .filter(dv => String(dv.target) === categoryLabel)
            .map(dv => String(dv.group))));
        seriesInCategroy.forEach(sg => targetPairs.add(`${categoryLabel}-${sg}`));
    }

    const allRects = g.selectAll('rect');
    const promises = [];
    allRects.each(function() {
        const rect = d3.select(this);
        const rd = rect.datum();
        const isHit = rd && targetPairs.has(`${String(rd.key)}-${String(rd.subgroup)}`);
        const p = rect.transition().duration(400)
            .attr('opacity', isHit ? 1 : 0.25)
            .attr('stroke', isHit ? 'black' : 'none')
            .attr('stroke-width', isHit ? 1 : 0)
            .end();
        promises.push(p);
    });
    await Promise.all(promises);

    const matchedData = data.filter(dv => {
        if (seriesLabel) {
            return String(dv.target) === categoryLabel && String(dv.group) === seriesLabel;
        }
        return String(dv.target) === categoryLabel;
    });

    if (matchedData.length > 0) {
        const value = seriesLabel
            ? (matchedData[0]?.value ?? 0)
            : matchedData.reduce((acc, dv) => acc + (+dv.value || 0), 0);

        const targetNodes = [];
        allRects.each(function() {
            const rd = d3.select(this).datum();
            if (rd && targetPairs.has(`${String(rd.key)}-${String(rd.subgroup)}`)) {
                targetNodes.push(this);
            }
        });

        if (targetNodes.length > 0) {
            let minY = Infinity, maxY = -Infinity;
            targetNodes.forEach(n => {
                const b = n.getBBox();
                minY = Math.min(minY, b.y);
                maxY = Math.max(maxY, b.y + b.height);
            });
            const lastNodeBBox = targetNodes[targetNodes.length-1].getBBox();
            
            const labelX = margins.left + lastNodeBBox.x + lastNodeBBox.width / 2;
            const labelY = margins.top + (seriesLabel ? (minY + maxY) / 2 : Math.max(10, minY - 8));
            
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
                .text(String(value))
                .attr('opacity', 0)
                .transition().duration(200).attr('opacity', 1);
        }
    }
    
    return seriesLabel ? matchedData[0] || null : matchedData;
}


export async function stackedBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const which = op.which || 'max';
    const hlColor = '#a65dfb';
    let targetDatum = null;

    if (!data || data.length === 0) return null;
    const allRects = g.selectAll('rect');

    // Scope 1: 카테고리(막대) 내에서 찾기 (op.category 지정)
    if (op.category != null) {
        const category = String(op.category);
        const subset = data.filter(d => String(d.target) === category);
        if (subset.length === 0) return null;

        const values = subset.map(d => d.value);
        const extremumValue = which === 'min' ? d3.min(values) : d3.max(values);
        targetDatum = subset.find(d => d.value === extremumValue) || null;
        if (!targetDatum) return null;

        const targetRect = allRects.filter(d => String(d.key) === category && String(d.subgroup) === String(targetDatum.group));
        const categoryRects = allRects.filter(d => String(d.key) === category);
        const otherRects = allRects.filter(d => String(d.key) !== category);

        await Promise.all([
            otherRects.transition().duration(500).attr("opacity", 0.2).end(),
            categoryRects.transition().duration(500).attr("opacity", 0.6).end(),
        ]);
        await targetRect.transition().duration(300).attr("opacity", 1).attr("fill", hlColor).end();
    }
    // Scope 2: 시리즈(조각) 내에서 찾기 (op.group 지정)
    else if (op.group != null) {
        const group = String(op.group);
        const subset = data.filter(d => String(d.group) === group);
        if (subset.length === 0) return null;

        const values = subset.map(d => d.value);
        const extremumValue = which === 'min' ? d3.min(values) : d3.max(values);
        targetDatum = subset.find(d => d.value === extremumValue) || null;
        if (!targetDatum) return null;

        const groupRects = allRects.filter(d => String(d.subgroup) === String(group));
        const targetRect = groupRects.filter(d => String(d.key) === String(targetDatum.target));
        
        await allRects.transition().duration(500).attr("opacity", 0.2).end();
        await groupRects.transition().duration(500).attr("opacity", 0.6).end();
        await targetRect.transition().duration(300).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 2).end();
    }
    // Scope 3: 전체 막대 총합 기준 (둘 다 없음)
    else {
        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const totals = Array.from(sumsByCategory.values());
        if (totals.length === 0) return null;

        const extremumTotal = which === 'min' ? d3.min(totals) : d3.max(totals);
        let extremumCategory = null;
        sumsByCategory.forEach((sum, cat) => { if (sum === extremumTotal) extremumCategory = cat; });

        const targetStackRects = allRects.filter(d => String(d.key) === String(extremumCategory));
        await g.selectAll("rect").transition().duration(500).attr("opacity", 0.2).end();
        await targetStackRects.transition().duration(500).attr("opacity", 1).end();

        const yMax = d3.max(totals);
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = margins.top + y(extremumTotal);
        
        svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("y1", yPos).attr("x2", margins.left + plot.w).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
            .attr("text-anchor", "end").attr("fill", hlColor).attr("font-weight", "bold")
            .text(`${which.toUpperCase()} Total: ${fmtNum(extremumTotal)}`);
        
        targetDatum = data.find(d => String(d.target) === String(extremumCategory));
    }

    if (targetDatum && op.group != null || op.category != null) {
        const node = findRectByTuple(g, { facet: targetDatum.target, key: targetDatum.group });
        const pos = absCenter(svg, node);
        svg.append("text").attr("class", "annotation")
            .attr("x", pos.x).attr("y", pos.y - 10)
            .attr("text-anchor", "middle").attr("fill", hlColor).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`${which.toUpperCase()}: ${fmtNum(targetDatum.value)}`);
    }
    
    return targetDatum;
}

export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 특정 시리즈(group)의 범위 구하기
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

    // 2. 스택 총합의 범위 구하기
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

    // 최소값 막대 강조
    await Promise.all([
        otherRects.transition().duration(500).attr("opacity", 0.2).end(),
        maxStackRects.transition().duration(500).attr("opacity", 0.2).end()
    ]);
    await minStackRects.transition().duration(500).attr("opacity", 1).end();
    await delay(700);
    
    // 최소값 라인 및 텍스트 표시
    const yPosMin = margins.top + y(minTotal);
    svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", yPosMin).attr("x2", margins.left).attr("y2", yPosMin)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
        .transition().duration(600).attr("x2", margins.left + plot.w);
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left - 8).attr("y", yPosMin).attr("text-anchor", "end")
        .attr("dominant-baseline", "middle").attr("fill", hlColor).attr("font-weight", "bold")
        .text(`MIN: ${fmtNum(minTotal)}`);

    await delay(800);

    // 최대값 막대 강조
    await minStackRects.transition().duration(500).attr("opacity", 0.2).end();
    await maxStackRects.transition().duration(500).attr("opacity", 1).end();
    await delay(700);

    // 최대값 라인 및 텍스트 표시
    const yPosMax = margins.top + y(maxTotal);
    svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", yPosMax).attr("x2", margins.left).attr("y2", yPosMax)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
        .transition().duration(600).attr("x2", margins.left + plot.w);
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left - 8).attr("y", yPosMax).attr("text-anchor", "end")
        .attr("dominant-baseline", "middle").attr("fill", hlColor).attr("font-weight", "bold")
        .text(`MAX: ${fmtNum(maxTotal)}`);

    await delay(800);
    
    // 최종 결과 텍스트 표시
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", hlColor)
        .text(`Range of Stack Totals: ${fmtNum(minTotal)} ~ ${fmtNum(maxTotal)}`)
        .attr("opacity", 0).transition().duration(400).attr("opacity", 1);

    return new IntervalValue('Stack Totals', minTotal, maxTotal);
}


export async function stackedBarCompare(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // --- 1. 분리(Isolate) 단계 ---
    const targetA_key = op.targetA.category;
    const targetA_series = op.targetA.series;
    const targetB_key = op.targetB.category;
    const targetB_series = op.targetB.series;

    const allRects = g.selectAll("rect");
    let rectA, rectB;

    allRects.each(function() {
        const d = d3.select(this).datum();
        if (d && String(d.key) === targetA_key && String(d.subgroup) === targetA_series) rectA = d3.select(this);
        if (d && String(d.key) === targetB_key && String(d.subgroup) === targetB_series) rectB = d3.select(this);
    });

    if (!rectA || !rectB) {
        console.warn("stackedBarCompare: One or both targets not found", op);
        return new BoolValue('', false);
    }

    const otherRects = allRects.filter(function() {
        return this !== rectA.node() && this !== rectB.node();
    });

    // 요청대로 나머지 막대는 완전히 삭제
    await otherRects.transition().duration(600).attr("opacity", 0).remove().end();
    
    // --- 2. 변환(Transform) 단계 ---
    const valueA = rectA.datum().value;
    const valueB = rectB.datum().value;

    const tempXDomain = [`${targetA_key}(${targetA_series})`, `${targetB_key}(${targetB_series})`];
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

    // --- 3. 비교(Compare) 및 주석 단계 ---
    const ok = cmpMap[op.operator] ? cmpMap[op.operator](valueA, valueB) : false;
    
    const colorA = rectA.attr('fill');
    const colorB = rectB.attr('fill');

    const addAnnotation = (bar, value, color) => {
        const bbox = bar.node().getBBox();
        const xPos = margins.left + bbox.x + bbox.width / 2;
        const yPos = margins.top + bbox.y;

        svg.append('line').attr('class', 'annotation')
            .attr('x1', margins.left).attr('y1', yPos)
            .attr('x2', xPos).attr('y2', yPos)
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
        .attr('fill', ok ? 'green' : 'red')
        .text(`${labelA}${symbol}${labelB} → ${ok}`);

    return new BoolValue('', ok);
}

export async function stackedBarSort(chartId, op, data, isLast = false) {
    const { svg, g, xField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        // 필터링 결과 데이터가 없으면 정렬을 수행하지 않음
        console.warn("Sort operation received no data, possibly from a previous filter.");
        return data;
    }

    const asc = (op.order || 'asc') === 'asc';

    // 1. 전달받은 데이터(data)를 기준으로 각 카테고리(월)의 정렬 기준 값을 계산
    const valuesByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);

    // 2. 현재 차트에 있는 모든 카테고리 목록을 가져옴
    const allCategories = Array.from(new Set(g.selectAll('rect').data().map(d => d.key)));
    
    // 3. 기준 값에 따라 전체 카테고리 순서를 정렬
    const sortedCategories = allCategories.sort((a, b) => {
        const valA = valuesByCategory.get(String(a)) ?? -Infinity;
        const valB = valuesByCategory.get(String(b)) ?? -Infinity;
        return asc ? valA - valB : valB - valA;
    });

    // 4. 정렬된 순서로 새로운 X축 스케일 생성
    const xScale = d3.scaleBand().domain(sortedCategories).range([0, plot.w]).padding(0.1);
    const transitions = [];

    // 5. 화면의 모든 막대 조각(rect)들을 새 X축 위치로 이동
    g.selectAll("rect")
        .transition().duration(1000)
        .attr("x", function(d) {
            return xScale(d.key);
        })
        .attr("width", xScale.bandwidth())
        .end()
        .then(p => transitions.push(p));

    // 6. X축 라벨 업데이트
    transitions.push(
        g.select(".x-axis").transition().duration(1000)
            .call(d3.axisBottom(xScale))
            .end()
    );

    await Promise.all(transitions);

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .text(`Sorted by ${op.group || 'Total'} ${op.field} (${op.order})`);

    // 7. 정렬된 데이터 반환
    const sortedData = [];
    const dataByTarget = d3.group(data, d => d.target);
    sortedCategories.forEach(cat => {
        if (dataByTarget.has(cat)) {
            sortedData.push(...dataByTarget.get(cat));
        }
    });

    return sortedData;
}

export async function stackedBarSum(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 현재 화면에 보이는 모든 막대 조각을 선택합니다.
    const allRects = g.selectAll("rect");
    if (allRects.empty()) {
        return new DatumValue('Aggregate', op.field, 'Sum', null, 0, null);
    }
    
    // 현재 값들을 가져와 총합을 계산합니다.
    const currentValues = [];
    allRects.each(function() {
        const d = d3.select(this).datum();
        if (d && d.value != null) {
            currentValues.push(d.value);
        }
    });
    const totalSum = d3.sum(currentValues);

    const color = '#e83e8c';

    // --- 1. Y축 재설정 및 애니메이션 준비 ---
    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);
    const yAxisTransition = svg.select(".y-axis").transition().duration(1200)
        .call(d3.axisLeft(newYScale))
        .end();

    // 일관된 순서로 쌓기 위해 막대들을 시각적 위치(x, y)에 따라 정렬합니다.
    const originalStates = [];
    allRects.each(function() {
        originalStates.push({
            node: this,
            datum: d3.select(this).datum(),
            x: +this.getAttribute('x'),
            y: +this.getAttribute('y')
        });
    });
    originalStates.sort((a, b) => a.x - b.x || b.y - a.y); // 왼쪽 스택부터, 아래 조각 먼저
    const sortedRects = d3.selectAll(originalStates.map(s => s.node));

    // --- 2. 탑 쌓기 애니메이션 ---
    let runningTotal = 0;
    const stackPromises = [];
    const barWidth = allRects.size() > 0 ? +allRects.node().getAttribute('width') : 20;
    const targetX = plot.w / 2 - barWidth / 2;

    sortedRects.each(function() {
        const value = d3.select(this).datum().value;
        const t = d3.select(this)
            .transition().duration(1500).ease(d3.easeCubicInOut)
            .attr("x", targetX) // 그룹 좌표 보정이 필요 없어 더 간단합니다.
            .attr("width", barWidth)
            .attr("y", newYScale(runningTotal + value))
            .attr("height", newYScale(0) - newYScale(value))
            .end();
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    await delay(300);

    // --- 3. 최종 합계 라인 및 텍스트 표시 ---
    const yPos = margins.top + newYScale(totalSum);
    svg.append("line").attr("class", "annotation sum-line")
        .attr("x1", margins.left).attr("x2", margins.left + plot.w)
        .attr("y1", yPos).attr("y2", yPos).attr("stroke", color).attr("stroke-width", 2.5);
        
    svg.append("text").attr("class", "annotation sum-label")
        .attr("x", margins.left + plot.w - 10).attr("y", yPos - 15)
        .attr("text-anchor", "end").attr("fill", color).attr("font-weight", "bold").attr("font-size", "14px")
        .text(`Sum: ${fmtNum(totalSum)}`);

    return new DatumValue('Aggregate', yField, 'Sum', null, totalSum, null);
}

export async function stackedBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // Case 1: 특정 시리즈(group)의 평균 구하기
    if (op.group) {
        const simpleBarData = await stackedBarToSimpleBar(chartId, op, data);
        if (!Array.isArray(simpleBarData) || simpleBarData.length === 0) {
            console.warn('stackedBarAverage: no data after conversion');
            return null;
        }
        
        const { simpleBarAverage } = await import("../simple/simpleBarFunctions.js");
        return await simpleBarAverage(chartId, op, simpleBarData, isLast);
    } 
    
    // Case 2: 스택 총합의 평균 구하기
    else {
        if (!Array.isArray(data) || data.length === 0) {
            console.warn('stackedBarAverage: empty data');
            return null;
        }

        const sumsByCategory = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const totals = Array.from(sumsByCategory.values());
        const avgTotal = d3.mean(totals);

        if (!Number.isFinite(avgTotal)) return null;

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
            .attr("x", margins.left + plot.w + 6).attr("y", yPos)
            .attr("dominant-baseline", "middle")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .text(`Avg: ${fmtNum(avgTotal)}`)
            .attr("opacity", 0)
            .transition().delay(200).duration(400).attr("opacity", 1);

        return new DatumValue(xField, yField, 'Average of Totals', null, avgTotal, null);
    }
}

export async function stackedBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, margins, plot, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetA_key = op.targetA.category;
    const targetA_series = op.targetA.series;
    const targetB_key = op.targetB.category;
    const targetB_series = op.targetB.series;

    const allRects = g.selectAll("rect");
    let rectA, rectB;

    // --- 1. 분리(Isolate) 단계 ---
    allRects.each(function() {
        const d = d3.select(this).datum();
        if (d && String(d.key) === targetA_key && String(d.subgroup) === targetA_series) rectA = d3.select(this);
        if (d && String(d.key) === targetB_key && String(d.subgroup) === targetB_series) rectB = d3.select(this);
    });

    if (!rectA || !rectB) {
        console.warn("stackedBarDiff: One or both targets not found", op);
        return null;
    }

    // 나머지 막대들을 fade out 후 완전히 삭제합니다.
    const otherRects = allRects.filter(function() {
        return this !== rectA.node() && this !== rectB.node();
    });
    await otherRects.transition().duration(600).attr("opacity", 0).remove().end();
    
    // --- 2. 변환(Transform) 단계 ---
    const datumA = rectA.datum();
    const datumB = rectB.datum();
    const valueA = datumA.value;
    const valueB = datumB.value;
    const diff = Math.abs(valueA - valueB);

    const tempXDomain = [`${targetA_key}(${targetA_series})`, `${targetB_key}(${targetB_series})`];
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

    // --- 3. 차이 계산(Subtract) 애니메이션 단계 ---
    const tallerBar = valueA >= valueB ? rectA : rectB;
    const shorterBar = valueA < valueB ? rectA : rectB;
    const shorterValue = Math.min(valueA, valueB);
    
    const colorTaller = "#ffeb3b", colorShorter = "#2196f3", colorSubtract = "#f44336";
    await tallerBar.transition().duration(500).attr("fill", colorTaller).end();
    await shorterBar.transition().duration(500).attr("fill", colorShorter).end();

    // [수정] 짧은 막대를 맨 위로 올려 다른 막대에 가려지지 않도록 합니다.
    shorterBar.raise(); 
    await shorterBar.transition().duration(800).attr("x", tallerBar.attr("x")).end();
    await delay(500);

    const subtractionRect = g.append("rect").attr("class", "annotation")
        .attr("x", tallerBar.attr("x")).attr("y", newYScale(shorterValue))
        .attr("width", tallerBar.attr("width")).attr("height", plot.h - newYScale(shorterValue))
        .attr("fill", colorSubtract).attr("opacity", 0);
    
    await subtractionRect.transition().duration(400).attr("opacity", 0.7).end();
    await delay(600);
    
    await Promise.all([
        subtractionRect.transition().duration(600).attr("opacity", 0).remove().end(),
        shorterBar.transition().duration(600).attr("opacity", 0).remove().end(),
        tallerBar.transition().duration(800)
            .attr("y", newYScale(diff))
            .attr("height", plot.h - newYScale(diff)).end()
    ]);
    
    const finalX = +tallerBar.attr("x") + (+tallerBar.attr("width") / 2);
    const finalY = newYScale(diff);

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + finalX).attr("y", margins.top + finalY - 8)
        .attr("text-anchor", "middle").attr("fill", "#333").attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3.5).attr("paint-order", "stroke")
        .text(`Difference: ${fmtNum(diff)}`);

    return new DatumValue('Difference', yField, `Diff`, null, diff, null);
}

export async function stackedBarNth(chartId, op, data, isLast = false) {
    const { svg, g, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = '#20c997';

    const allRects = g.selectAll('rect');
    const categoriesInOrder = Array.from(new Set(allRects.data().map(d => d.key)));
    n = Math.min(n, categoriesInOrder.length);
    if (!Number.isFinite(n) || n <= 0) return [];
    
    const sequence = from === 'right' ? categoriesInOrder.slice().reverse() : categoriesInOrder;
    const pickedCategory = sequence[n - 1];

    await allRects.transition().duration(300).attr("opacity", 0.2).end();

    const countedRects = [];
    for (let i = 0; i < n; i++) {
        const category = sequence[i];
        const categoryRects = allRects.filter(d => d.key === category);
        countedRects.push(categoryRects);
        
        await categoryRects.transition().duration(150).attr('opacity', 1).end();

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
        await delay(250);
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
    
    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth: ${from} ${n}`);
        
    // [핵심 수정] N번째 카테고리에 해당하는 모든 DatumValue 객체를 찾아 배열로 반환
    return data.filter(d => String(d.target) === pickedCategory);
}

export async function stackedBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn('stackedBarCount: empty data');
        return null;
    }

    const allRects = g.selectAll('rect');
    const categories = Array.from(new Set(allRects.data().map(d => d.key)));
    const totalCount = categories.length;
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
        
        await delay(250);
    }
    
    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount} categories`);

    return new DatumValue(xField, yField, 'Category Count', null, totalCount, null);
}
