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
    count as dataCount
} from "../../operationFunctions.js";


// ---------- 공통 셋업 ----------
export function getSvgAndSetup(chartId) {
  const svg = d3.select(`#${chartId}`).select("svg");
  const g = svg.select(".plot-area");
  const margins = { left: +svg.attr("data-m-left") || 0, top: +svg.attr("data-m-top") || 0 };
  const plot = { w: +svg.attr("data-plot-w") || 0, h: +svg.attr("data-plot-h") || 0 };
  const xField = svg.attr("data-x-field");
  const yField = svg.attr("data-y-field");
  const facetField = svg.attr("data-facet-field");
  const colorField = svg.attr("data-color-field");
  return { svg, g, margins, plot, xField, yField, facetField, colorField };
}

export function clearAllAnnotations(svg) {
  svg.selectAll(
    ".annotation, .filter-label, .compare-label, .range-line, .extremum-label, .value-tag, .threshold-line, .threshold-label"
  ).remove();
}

export const delay = (ms) => new Promise(r => setTimeout(r, ms));

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function cssEscape(x){ try{ return CSS.escape(String(x)); } catch { return String(x).replace(/[^\w-]/g,'_'); } }
function idOf(row, facetField, xField) { return `${row[facetField]}-${row[xField]}`; }
function idOfDatum(d) { return `${d.facet}-${d.key}`; }

function readGroupX(node) {
  const p = node?.parentNode;
  if (!p) return 0;
  const t = p.getAttribute && p.getAttribute("transform");
  if (!t) return 0;
  const m = /translate\(([-\d.]+)/.exec(t);
  return m ? +m[1] : 0;
}

function buildPredicate(conds=[], logic="and") {
    const L = (logic||"and").toLowerCase()==="or" ? "some" : "every";
    
    const mk = (c) => (row) => {
        const { field, satisfy, key, equals, in: arr, notIn } = c||{};

        const isNumericOp = ['>', '>=', '<', '<='].includes(satisfy) || 
                            typeof key === 'number' || 
                            typeof equals === 'number';

        if (isNumericOp) {
            const v = row.value; 
            const f = cmpMap[satisfy];
            if (f && key != null) {
                const vn = toNum(v);
                const kn = toNum(key);
                return f(vn, kn);
            }
        } else {
            const v_target = String(row.target);
            const v_group = String(row.group);
            
            if (equals != null) {
                return v_target === String(equals) || v_group === String(equals);
            }
            if (Array.isArray(arr)) {
                const strArr = arr.map(String);
                return strArr.includes(v_target) || strArr.includes(v_group);
            }
            if (Array.isArray(notIn)) {
                const strArr = notIn.map(String);
                return !strArr.includes(v_target) && !strArr.includes(v_group);
            }
        }
        return true; 
    };

    const ps = conds.map(mk);
    return (row) => ps[L](f => f(row));
}

function describeFilter(op) {
    if (!op || !op.field) return "Filter";
    
    if (op.operator === 'in' || op.operator === 'not-in') {
        const arr = Array.isArray(op.value) ? op.value : [op.value];
        const symbol = op.operator === 'in' ? '∈' : '∉';
        return `Filter: ${op.field} ${symbol} {${arr.join(',')}}`;
    }
    return `Filter: ${op.field} ${op.operator} ${op.value}`;
}

function xOfFacet(g, facet) {
  const node = g.select(`.facet-group-${cssEscape(facet)}`).node();
  if (!node) return 0;
  const t = node.getAttribute("transform") || "";
  const m = /translate\(([-\d.]+)/.exec(t);
  return m ? +m[1] : 0;
}
function widthOfFacet(g) {
  const one = g.select(`[class^="facet-group-"]`).node();
  return one ? one.getBBox().width : 0;
}
function absCenter(svg, node) {
  const margins = { left:+svg.attr("data-m-left")||0, top:+svg.attr("data-m-top")||0 };
  const r = node.getBBox();
  const groupX = readGroupX(node);
  return { x: margins.left + groupX + r.x + r.width/2, y: margins.top + r.y };
}
function findRectByTuple(g, t={}) {
  const { facet, x, key } = t;
  let sel = g.selectAll("rect");
  if (facet!=null) sel = sel.filter(d => d && String(d.facet)===String(facet));
  const wantKey = x ?? key;
  if (wantKey!=null) sel = sel.filter(d => d && String(d.key)===String(wantKey));
  return sel.empty() ? null : sel.node();
}

function drawYThresholdsOnce(svg, margins, plot, yScale, yField, conditions) {
    const yConds = (conditions || []).filter(c =>
        c.field === yField && (['>', '>=', '<', '<='].includes(c.operator))
    );
    
    svg.selectAll(".threshold-line, .threshold-label").remove();

    yConds.forEach(c => {
        const yVal = +c.value;
        if (isNaN(yVal)) return;

        const yPix = margins.top + yScale(yVal);
        svg.append("line")
            .attr("class", "threshold-line")
            .attr("x1", margins.left).attr("x2", margins.left + plot.w)
            .attr("y1", yPix).attr("y2", yPix)
            .attr("stroke", "#0d6efd").attr("stroke-width", 1.5).attr("stroke-dasharray", "5 5");
        svg.append("text")
            .attr("class", "threshold-label")
            .attr("x", margins.left + plot.w + 6).attr("y", yPix)
            .attr("dominant-baseline", "middle").attr("fill", "#0d6efd")
            .attr("font-size", 12).attr("font-weight", "bold")
            .text(`${c.operator} ${fmtNum(yVal)}`);
    });
}


export async function groupedBarRetrieveValue(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const filterOp = {
        target: op.group,
        group: op.target
    };

    const selectedData = retrieveValue(data, filterOp);

    if (!selectedData || selectedData.length === 0) {
        console.warn("RetrieveValue: Target not found for op:", op);
        return [];
    }
    const targetDatum = selectedData[0];

    const targetNode = findRectByTuple(g, { facet: targetDatum.target, key: targetDatum.group });

    if (!targetNode) {
        console.warn("RetrieveValue: DOM element not found for datum:", targetDatum);
        return selectedData;
    }

    const targetSel = d3.select(targetNode);
    const hlColor = "#ff6961";

    await g.selectAll("rect").transition().duration(400).attr("opacity", 0.3).end();
    await targetSel.transition().duration(400).attr("opacity", 1).attr("stroke", hlColor).attr("stroke-width", 2).end();

    const bbox = targetNode.getBBox();
    const groupX = readGroupX(targetNode);
    const cx = margins.left + groupX + bbox.x + bbox.width / 2;
    const cy = margins.top + bbox.y;

    svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", cy)
        .attr("x2", cx).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    svg.append("text").attr("class", "annotation")
        .attr("x", cx).attr("y", cy - 6)
        .attr("text-anchor", "middle")
        .attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(fmtNum(targetDatum.value));

    return selectedData;
}


export async function groupedBarFilter(chartId, op, data) {
    const { svg, g, margins, plot, xField, yField, facetField } = getSvgAndSetup(chartId);
    
    await g.selectAll("rect").transition().duration(200)
        .attr("opacity", 1)
        .attr("stroke", "none")
        .end();
    clearAllAnnotations(svg);

    let filteredData = [];
    const numericOps = new Set(['>', '>=', '<', '<=']);

    // 필터링 방식 결정: op.field가 yField와 같으면 '총합' 기준, 다르면 '개별' 기준
    if (op.field === yField && numericOps.has(op.operator)) {
        // 숫자 값 필터 (그룹 총합 기준)
        const sumsByFacet = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        const facetsToKeep = new Set();
        const cmp = cmpMap[op.operator];
        if (cmp) {
            sumsByFacet.forEach((sum, facet) => {
                if (cmp(sum, op.value)) {
                    facetsToKeep.add(facet);
                }
            });
        }
        filteredData = data.filter(d => facetsToKeep.has(d.target));
    } else {
        // 카테고리/개별 값 필터 (simpleBarFilter의 어댑터 방식)
        const correctedOp = { ...op };
        if (data.length > 0) {
            const sample = data[0];
            if (op.field === sample.category) correctedOp.field = 'target';
            else if (op.field === xField) correctedOp.field = 'group';
            // 'people'과 같은 추가 필드는 DatumValue에 없으므로, 이 로직에서는 처리 불가
        }
        filteredData = dataFilter(data, correctedOp);
    }

    if (numericOps.has(op.operator)) {
        const fullYScale = d3.scaleLinear().domain([0, d3.max(data, d => d.value)]).nice().range([plot.h, 0]);
        await drawYThresholdsOnce(svg, margins, plot, fullYScale, yField, [op]);
        await delay(300);
    }
    
    if (filteredData.length === 0) {
        g.selectAll("rect").transition().duration(500).attr("opacity", 0).remove();
        svg.append("text").attr("class", "filter-label")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .text("No data matches the filter.");
        return [];
    }
    
    const allowedIds = new Set(filteredData.map(d => `${d.target}-${d.group}`));
    const keepSel = g.selectAll("rect").filter(d => allowedIds.has(`${d.facet}-${d.key}`));
    const dropSel = g.selectAll("rect").filter(d => !allowedIds.has(`${d.facet}-${d.key}`));

    await dropSel.transition().duration(800).attr("opacity", 0).remove().end();
    await delay(250);

    const keptFacets = [...new Set(filteredData.map(d => d.target))];
    const keptKeys = [...new Set(filteredData.map(d => d.group))];
    const yMax = d3.max(filteredData, d => d.value);

    const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);
    const y = d3.scaleLinear().domain([0, yMax || 1]).nice().range([plot.h, 0]);

    const tasks = [];
    g.selectAll('[class^="facet-group-"]').each(function() {
        const cls = this.getAttribute("class") || "";
        const fv = cls.replace(/^facet-group-/, "");
        if (!keptFacets.includes(String(fv))) {
            d3.select(this).transition().duration(400).attr("opacity", 0).remove();
        } else {
            tasks.push(d3.select(this).transition().duration(800).attr("transform", `translate(${x0(fv)},0)`).end());
        }
    });

    tasks.push(
        keepSel.transition().duration(800)
            .attr("x", d => x1(d.key))
            .attr("width", x1.bandwidth())
            .attr("y", d => y(d.value))
            .attr("height", d => plot.h - y(d.value))
            .end()
    );

    tasks.push(g.select(".y-axis").transition().duration(800).call(d3.axisLeft(y)).end());
    tasks.push(g.select(".x-axis-bottom-line").transition().duration(800).call(d3.axisBottom(x0).tickSizeOuter(0)).end());
    
    await Promise.all(tasks);
    
    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", "#0d6efd")
        .text(describeFilter(op));
        
    return filteredData;
}




export async function groupedBarFindExtremum(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    
    const targetDatum = dataFindExtremum(data, op, facetField, yField);

    clearAllAnnotations(svg);
    const hlColor = "#a65dfb";

    // 1. 모든 막대를 선명한 초기 상태로 리셋
    await g.selectAll("rect")
        .transition().duration(200)
        .attr("opacity", 1)
        .attr("stroke", "none")
        .end();

    if (!targetDatum) {
        console.warn("FindExtremum: Could not find target datum for:", op);
        return [];
    }

    const extremumValue = targetDatum.value;
    const targetNode = findRectByTuple(g, { facet: targetDatum.target, key: targetDatum.group });

    if (!targetNode) {
        console.warn("FindExtremum: Target DOM element not found for datum:", targetDatum);
        return [targetDatum];
    }

    const targetRect = d3.select(targetNode);
    const otherRects = g.selectAll("rect").filter(function() { return this !== targetNode; });

    // 2. 리셋 후, 다른 막대들을 흐리게 하고 목표 막대를 강조
    await Promise.all([
        otherRects.transition().duration(500).attr("opacity", 0.2).end(),
        targetRect.transition().duration(500).attr("opacity", 1).attr("fill", hlColor).end()
    ]);
    
    await delay(500);

    const yMax = d3.max(data, d => d.value);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const yPos = margins.top + y(extremumValue);
    
    svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", yPos)
        .attr("x2", margins.left).attr("y2", yPos)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
        .transition().duration(600)
        .attr("x2", margins.left + plot.w);
    
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
        .attr("text-anchor", "end").attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(`${op.which || 'max'}: ${fmtNum(extremumValue)}`)
        .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);
        
    return [targetDatum];
}
export async function groupedBarDetermineRange(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const isGlobalScope = op.group == null;
    const targetData = isGlobalScope ? data : data.filter(d => String(d.target) === String(op.group));
    
    if (targetData.length === 0) {
        console.warn("DetermineRange: No data to process for the scope.", op);
        return null;
    }

    const values = targetData.map(d => d.value);
    const minV = d3.min(values);
    const maxV = d3.max(values);
    const result = new IntervalValue(isGlobalScope ? facetField : op.group, minV, maxV);

    const yMaxGlobal = d3.max(data, r => r.value);
    const y = d3.scaleLinear().domain([0, yMaxGlobal]).nice().range([plot.h, 0]);
    const hlColor = "#0d6efd";
    const animationPromises = [];
    
    if (isGlobalScope) {
        const minRects = g.selectAll("rect").filter(d => d.value === minV);
        const maxRects = g.selectAll("rect").filter(d => d.value === maxV);
        const otherRects = g.selectAll("rect").filter(d => d.value !== minV && d.value !== maxV);

        animationPromises.push(otherRects.transition().duration(600).attr("opacity", 0.2).end());
        animationPromises.push(minRects.transition().duration(600).attr("opacity", 1).attr("fill", hlColor).end());
        animationPromises.push(maxRects.transition().duration(600).attr("opacity", 1).attr("fill", hlColor).end());

        [{ value: minV, label: "MIN" }, { value: maxV, label: "MAX" }].forEach(item => {
            const yPos = margins.top + y(item.value);
            const line = svg.append("line").attr("class", "annotation range-line")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            animationPromises.push(line.transition().duration(700).attr("x2", margins.left + plot.w).end());
            
            const text = svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
                .attr("text-anchor", "end").attr("fill", hlColor).attr("font-weight", "bold")
                .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
                .text(`${item.label}: ${fmtNum(item.value)}`).attr("opacity", 0);
            animationPromises.push(text.transition().delay(200).duration(500).attr("opacity", 1).end());
        });
        
        const topLabel = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(`Overall Range: ${fmtNum(minV)} ~ ${fmtNum(maxV)}`).attr("opacity", 0);
        animationPromises.push(topLabel.transition().duration(400).attr("opacity", 1).end());

    } else { // op.group is specified
        const targetGroup = op.group;
        const groupRects = g.selectAll("rect").filter(d => String(d.facet) === String(targetGroup));
        const otherRects = g.selectAll("rect").filter(d => String(d.facet) !== String(targetGroup));

        const minRectInGroup = groupRects.filter(d => d.value === minV);
        const maxRectInGroup = groupRects.filter(d => d.value === maxV);

        animationPromises.push(otherRects.transition().duration(600).attr("opacity", 0.2).end());
        animationPromises.push(minRectInGroup.transition().duration(600).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 1.5).end());
        animationPromises.push(maxRectInGroup.transition().duration(600).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 1.5).end());
        
        const x0 = xOfFacet(g, targetGroup);
        const w = widthOfFacet(g);
        
        [{ value: minV, label: "MIN" }, { value: maxV, label: "MAX" }].forEach(item => {
            const yPos = margins.top + y(item.value);
            const line = svg.append("line").attr("class", "annotation range-line")
                .attr("x1", margins.left + x0).attr("y1", yPos)
                .attr("x2", margins.left + x0).attr("y2", yPos)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
            animationPromises.push(line.transition().duration(700).attr("x2", margins.left + x0 + w).end());
            
            const text = svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + x0 + w - 8).attr("y", yPos - 8)
                .attr("text-anchor", "end").attr("fill", hlColor).attr("font-weight", "bold")
                .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
                .text(`${item.label}: ${fmtNum(item.value)}`).attr("opacity", 0);
            animationPromises.push(text.transition().delay(200).duration(500).attr("opacity", 1).end());
        });
        
        const topLabel = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(`Range for ${targetGroup}: ${fmtNum(minV)} ~ ${fmtNum(maxV)}`).attr("opacity", 0);
        animationPromises.push(topLabel.transition().duration(400).attr("opacity", 1).end());
    }
    
    await Promise.all(animationPromises);
    return result;
}

export async function groupedBarCompare(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForCompare = {
        targetA: { target: op.targetA.category, group: op.targetA.series },
        targetB: { target: op.targetB.category, group: op.targetB.series },
        operator: op.operator,
        which: op.which
    };
    const winner = dataCompare(data, opForCompare);
    
    const nodeA = findRectByTuple(g, { facet: op.targetA.category, key: op.targetA.series });
    const nodeB = findRectByTuple(g, { facet: op.targetB.category, key: op.targetB.series });
    
    if (!nodeA || !nodeB) {
        console.warn("groupedBarCompare: One or both DOM elements not found", op);
        return winner ? [winner] : [];
    }

    const datumA = d3.select(nodeA).datum();
    const datumB = d3.select(nodeB).datum();
    const otherBars = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });
    const colorA = "#ffb74d";
    const colorB = "#64b5f6";

    await Promise.all([
        otherBars.transition().duration(500).attr("opacity", 0.2).end(),
        d3.select(nodeA).transition().duration(500).attr("opacity", 1).attr("stroke", colorA).attr("stroke-width", 2).end(),
        d3.select(nodeB).transition().duration(500).attr("opacity", 1).attr("stroke", colorB).attr("stroke-width", 2).end(),
    ]);

    const drawAnnotation = (node, datum, color) => {
        const pos = absCenter(svg, node);
        const y = pos.y;
        svg.append("line")
            .attr("class", "annotation compare-hline")
            .attr("x1", margins.left).attr("y1", y)
            .attr("x2", margins.left).attr("y2", y)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(450)
            .attr("x2", margins.left + plot.w);
        svg.append("text")
            .attr("class", "annotation compare-value")
            .attr("x", pos.x).attr("y", y - 8)
            .attr("text-anchor", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(datum.value));
    };
    
    drawAnnotation(nodeA, datumA, colorA);
    drawAnnotation(nodeB, datumB, colorB);

    let summary;
    if (winner) {
        const winnerLabel = `${winner.target}(${winner.group})`;
        summary = `${op.which === 'min' ? 'Min' : 'Max'}: ${winnerLabel} (${fmtNum(winner.value)})`;
    } else {
        const labelA = `${op.targetA.category}(${op.targetA.series})`;
        const labelB = `${op.targetB.category}(${op.targetB.series})`;
        summary = `${labelA}: ${fmtNum(datumA.value)} vs ${labelB}: ${fmtNum(datumB.value)} (Tie)`;
    }
    
    svg.append("text").attr("class", "annotation compare-summary")
        .attr("x", margins.left).attr("y", margins.top - 28)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", "#333")
        .text(summary);

    return winner ? [winner] : [];
}



export async function groupedBarCompareBool(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForCompare = {
        targetA: { target: op.targetA.category, group: op.targetA.series },
        targetB: { target: op.targetB.category, group: op.targetB.series },
        operator: op.operator
    };
    const compareResult = dataCompareBool(data, opForCompare);
    
    if (compareResult === null) {
        console.warn("groupedBarCompare: Comparison failed, likely data not found.", op);
        return null;
    }
    const result = compareResult.bool;

    const nodeA = findRectByTuple(g, { facet: op.targetA.category, key: op.targetA.series });
    const nodeB = findRectByTuple(g, { facet: op.targetB.category, key: op.targetB.series });
    
    if (!nodeA || !nodeB) {
        console.warn("groupedBarCompare: One or both DOM elements not found", op);
        return compareResult;
    }

    const datumA = d3.select(nodeA).datum();
    const datumB = d3.select(nodeB).datum();
    const otherBars = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });
    const colorA = "#ffb74d";
    const colorB = "#64b5f6";

    await Promise.all([
        otherBars.transition().duration(500).attr("opacity", 0.2).end(),
        d3.select(nodeA).transition().duration(500).attr("opacity", 1).attr("stroke", colorA).attr("stroke-width", 2).end(),
        d3.select(nodeB).transition().duration(500).attr("opacity", 1).attr("stroke", colorB).attr("stroke-width", 2).end(),
    ]);

    const drawAnnotation = (node, datum, color) => {
        const pos = absCenter(svg, node);
        const y = pos.y;
        svg.append("line")
            .attr("class", "annotation compare-hline")
            .attr("x1", margins.left).attr("y1", y)
            .attr("x2", margins.left).attr("y2", y)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(450)
            .attr("x2", margins.left + plot.w);
        svg.append("text")
            .attr("class", "annotation compare-value")
            .attr("x", pos.x).attr("y", y - 8)
            .attr("text-anchor", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(datum.value));
    };
    
    drawAnnotation(nodeA, datumA, colorA);
    drawAnnotation(nodeB, datumB, colorB);

    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const summary = `${fmtNum(datumA.value)}${symbol}${fmtNum(datumB.value)} → ${result}`;
    
    svg.append("text").attr("class", "annotation compare-summary")
        .attr("x", margins.left).attr("y", margins.top - 28)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", result ? "green" : "red")
        .text(summary);

    return compareResult;
}

// groupedBarFunctions.js
export async function groupedBarSort(chartId, op, data) {
    const { svg, g, plot, facetField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sortOp = { ...op };
    if (op.field === yField) {
        sortOp.aggregate = 'sum';
    }
    const sortedData = dataSort(data, sortOp, facetField, yField);

    const sortedFacets = [...new Set(sortedData.map(d => d.target))];
    const x0 = d3.scaleBand().domain(sortedFacets).range([0, plot.w]).paddingInner(0.2);
    
    const tasks = [];
    sortedFacets.forEach(facet => {
        const groupSelection = g.select(`.facet-group-${cssEscape(String(facet))}`);
        if (!groupSelection.empty()) {
            tasks.push(
                groupSelection.transition().duration(800).ease(d3.easeCubicInOut)
                    .attr("transform", `translate(${x0(facet)},0)`)
                    .end()
            );
        }
    });

    const bottomAxis = g.select(".x-axis-bottom-line");
    tasks.push(
        bottomAxis.transition().duration(800)
            .call(d3.axisBottom(x0).tickSizeOuter(0))
            .end()
    );

    await Promise.all(tasks);

    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .text(`Sorted by ${op.field} (${op.order})`);

    return sortedData;
}

export async function groupedBarSum(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataSum(data, op, facetField, yField);
    if (!result) {
        console.warn("Sum could not be calculated.");
        return [];
    }
    
    const sumDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, result.value, result.id
    );
    const totalSum = sumDatum.value;

    if (totalSum === 0) {
        console.warn("Sum is 0 or could not be calculated.");
        return [sumDatum];
    }

    const allRects = g.selectAll("rect");
    const color = '#e83e8c';

    const originalStates = [];
    allRects.each(function() {
        originalStates.push({
            node: this,
            datum: d3.select(this).datum(),
            groupX: readGroupX(this),
        });
    });

    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);

    const yAxisTransition = svg.select(".y-axis").transition().duration(1200)
        .call(d3.axisLeft(newYScale))
        .end();

    let runningTotal = 0;
    const stackPromises = [];
    const barWidth = allRects.size() > 0 ? +allRects.node().getAttribute('width') : 20;
    const targetX = plot.w / 2 - barWidth / 2;

    originalStates.forEach(state => {
        const value = state.datum.value;
        const newX = targetX - state.groupX;
        const t = d3.select(state.node)
            .transition().duration(1500).ease(d3.easeCubicInOut)
            .attr("x", newX)
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

    return [sumDatum];
}

export async function groupedBarAverage(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataAverage(data, op, facetField, yField);

    if (!result) {
        console.warn('groupedBarAverage: Could not compute average.');
        return [];
    }
    
    const avgDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, result.value, result.id
    );
    const avgValue = avgDatum.value;

    const color = '#fd7e14';

    const yMax = d3.max(data, d => d.value);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const yPos = margins.top + yScale(avgValue);

    const line = svg.append("line").attr("class", "annotation avg-line")
        .attr("x1", margins.left).attr("x2", margins.left)
        .attr("y1", yPos).attr("y2", yPos)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "6 6");

    await line.transition().duration(800)
        .attr("x2", margins.left + plot.w)
        .end();

    svg.append("text").attr("class", "annotation avg-label")
        .attr("x", margins.left + plot.w - 10)
        .attr("y", yPos - 10)
        .attr("text-anchor", "end")
        .attr("fill", color)
        .attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(`Avg: ${fmtNum(avgValue)}`)
        .attr("opacity", 0)
        .transition().duration(400)
        .attr("opacity", 1);

    return [avgDatum];
}
export async function groupedBarDiff(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForDiff = {
        targetA: { target: op.targetA.category, group: op.targetA.series },
        targetB: { target: op.targetB.category, group: op.targetB.series }
    };
    const diffResult = dataDiff(data, opForDiff);

    if (!diffResult) {
        console.warn("groupedBarDiff: Could not compute difference.", op);
        return [];
    }
    
    const diffDatum = new DatumValue(
        diffResult.category, diffResult.measure, diffResult.target,
        diffResult.group, Math.abs(diffResult.value), diffResult.id
    );

    const nodeA = findRectByTuple(g, { facet: op.targetA.category, key: op.targetA.series });
    const nodeB = findRectByTuple(g, { facet: op.targetB.category, key: op.targetB.series });
    
    if (!nodeA || !nodeB) {
        console.warn("groupedBarDiff: One or both DOM elements not found", op);
        return [diffDatum];
    }

    const datumA = d3.select(nodeA).datum();
    const datumB = d3.select(nodeB).datum();
    const otherBars = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });
    const colorA = "#ffb74d";
    const colorB = "#64b5f6";

    await Promise.all([
        otherBars.transition().duration(500).attr("opacity", 0.2).end(),
        d3.select(nodeA).transition().duration(500).attr("opacity", 1).attr("stroke", colorA).attr("stroke-width", 2).end(),
        d3.select(nodeB).transition().duration(500).attr("opacity", 1).attr("stroke", colorB).attr("stroke-width", 2).end(),
    ]);

    const drawAnnotation = (node, datum, color) => {
        const pos = absCenter(svg, node);
        const y = pos.y;
        svg.append("line")
            .attr("class", "annotation compare-hline")
            .attr("x1", margins.left).attr("y1", y)
            .attr("x2", margins.left).attr("y2", y)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(450)
            .attr("x2", margins.left + plot.w);
        svg.append("text")
            .attr("class", "annotation compare-value")
            .attr("x", pos.x).attr("y", y - 8)
            .attr("text-anchor", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(datum.value));
    };
    
    drawAnnotation(nodeA, datumA, colorA);
    drawAnnotation(nodeB, datumB, colorB);
    
    const summary = `Difference: ${fmtNum(diffDatum.value)}`;
    
    svg.append("text").attr("class", "annotation compare-summary")
        .attr("x", margins.left).attr("y", margins.top - 28)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", "#333")
        .text(summary);

    return [diffDatum];
}



export async function groupedBarNth(chartId, op, data) {
    const { svg, g, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = '#20c997';

    const allRects = g.selectAll("rect");
    if (allRects.empty()) {
        console.warn('groupedBarNth: no bars found');
        return [];
    }

    const total = allRects.size();
    n = Math.max(1, Math.min(n, total));

    const items = [];
    allRects.each(function() {
        items.push({
            node: this,
            globalX: readGroupX(this) + (+this.getAttribute('x')),
        });
    });
    items.sort((a, b) => a.globalX - b.globalX);

    const sequence = from === 'right' ? items.slice().reverse() : items;
    const pickedItem = sequence[n - 1];
    if (!pickedItem) return [];

    await allRects.transition().duration(200).attr("opacity", 0.2).end();

    for (let i = 0; i < n; i++) {
        const { node } = sequence[i];
        
        await d3.select(node).transition().duration(100).attr('opacity', 1).end();

        const { x, y } = absCenter(svg, node);
        svg.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', x).attr('y', y - 8)
            .attr('text-anchor', 'middle').attr('font-weight', 'bold')
            .attr('fill', hlColor).attr('stroke', 'white')
            .attr('stroke-width', 3).attr('paint-order', 'stroke')
            .text(String(i + 1));
        
        await delay(150);
    }
    
    const cleanupPromises = [];
    for (let i = 0; i < n - 1; i++) {
        const { node } = sequence[i];
        cleanupPromises.push(
            d3.select(node).transition().duration(200).attr('opacity', 0.2).end()
        );
    }
    
    cleanupPromises.push(
        svg.selectAll('.count-label').transition().duration(200).attr('opacity', 0).remove().end()
    );
    await Promise.all(cleanupPromises);
    
    const pickedNode = pickedItem.node;
    const pickedDatum = d3.select(pickedNode).datum();
    const originalDatum = data.find(d => 
        String(d.target) === String(pickedDatum.facet) && 
        String(d.group) === String(pickedDatum.key)
    );

    if (originalDatum) {
        const { x, y } = absCenter(svg, pickedNode);
        svg.append('line').attr('class', 'annotation')
            .attr('x1', margins.left).attr('y1', y)
            .attr('x2', x).attr('y2', y)
            .attr('stroke', hlColor).attr('stroke-dasharray', '4 4');

        svg.append('text').attr('class', 'annotation value-tag')
            .attr('x', x).attr('y', y - 8)
            .attr('text-anchor', 'middle').attr('font-weight', 'bold')
            .attr('fill', hlColor).attr('stroke', 'white')
            .attr('stroke-width', 3).attr('paint-order', 'stroke')
            .text(fmtNum(originalDatum.value));
    }

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth: ${from} ${n}`);
        
    return originalDatum ? [originalDatum] : [];
}


export async function groupedBarCount(chartId, op, data) {
    const { svg, g, margins, xField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataCount(data, op, facetField, xField);
    if (!result) {
        console.warn('groupedBarCount: could not compute count');
        return [];
    }
    
    const countDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, result.value, result.id
    );
    const totalCount = countDatum.value;

    if (totalCount === 0) {
        console.warn('groupedBarCount: empty data');
        return [countDatum];
    }

    const bars = g.selectAll('rect');
    if (bars.empty()) {
        console.warn('groupedBarCount: no bars on chart');
        return [countDatum];
    }

    const hlColor = '#20c997';
    await bars.transition().duration(150).attr('opacity', 0.3).end();

    const nodes = bars.nodes();
    const items = nodes.map(node => {
        const groupX = readGroupX(node);
        const barX = +node.getAttribute('x') || 0;
        return { node, globalX: groupX + barX };
    });

    items.sort((a, b) => a.globalX - b.globalX);

    for (let i = 0; i < totalCount; i++) {
        const { node } = items[i];
        await d3.select(node).transition().duration(100)
            .attr('fill', hlColor)
            .attr('opacity', 1)
            .end();

        const { x, y } = absCenter(svg, node);
        svg.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', x)
            .attr('y', y - 6)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(String(i + 1))
            .attr('opacity', 0)
            .transition().duration(100).attr('opacity', 1);

        await delay(50);
    }

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount}`)
        .attr('opacity', 0)
        .transition().duration(200).attr('opacity', 1);

    return [countDatum];
}

export async function groupedBarFilterByX(chartId, op, currentData, fullData) {
    const { svg, g, margins, plot, xField, yField, facetField } = getSvgAndSetup(chartId);
    svg.selectAll(".annotation, .filter-label, .compare-label, .extremum-label, .value-tag").remove();

    const mode = (op.mode || "keep").toLowerCase();
    const rescaleY = (op.rescaleY !== false);
    const logic = op.logic || "and";
    const style = op.style || {};

    const conditions = op.conditions || [];
    const pass = buildPredicate(conditions, logic);

    const allowedIds = new Set(currentData.filter(pass).map(r => `${r.target}-${r.group}`));

    const rects = g.selectAll("rect");
    if (rects.empty()) return currentData;

    const filteredData = currentData.filter(d => allowedIds.has(`${d.target}-${d.group}`));

    if (mode === "highlight" || mode === "hide") {
        const dim = (mode === "hide") ? 0.08 : (style.otherOpacity ?? 0.25);
        rects.transition().duration(500)
            .attr("opacity", function() {
                const d = d3.select(this).datum();
                return allowedIds.has(idOfDatum(d)) ? 1.0 : dim;
            });
        
        svg.append("text").attr("class", "filter-label")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold").attr("fill", "#0d6efd")
            .text(describeFilter(conditions, logic));
        
        return filteredData;
    }

    const keepSel = rects.filter(function() { const d = d3.select(this).datum(); return allowedIds.has(idOfDatum(d)); });
    const dropSel = rects.filter(function() { const d = d3.select(this).datum(); return !allowedIds.has(idOfDatum(d)); });
    
    await dropSel.transition().duration(450).attr("opacity", 0).attr("width", 0).remove().end();

    const keptData = filteredData.map(d => ({ facet: d.target, key: d.group, value: d.value }));
    if (!keptData.length) return [];
    
    const keptFacets = Array.from(new Set(keptData.map(d => d.facet)));
    const keptKeys = Array.from(new Set(keptData.map(d => d.key)));

    const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);
    const yMax = rescaleY ? d3.max(keptData, d => d.value) : d3.max(currentData, r => r.value);
    const y = d3.scaleLinear().domain([0, (yMax || 1)]).nice().range([plot.h, 0]);

    const tasks = [];
    g.selectAll('[class^="facet-group-"]').each(function() {
        const cls = this.getAttribute("class") || "";
        const fv = cls.replace(/^facet-group-/, "");
        if (!keptFacets.map(String).includes(String(fv))) {
            d3.select(this).transition().duration(400).attr("opacity", 0).remove();
        } else {
            tasks.push(d3.select(this).transition().duration(800).attr("transform", `translate(${x0(fv)},0)`).end());
        }
    });

    keepSel.transition().duration(800)
        .attr("x", d => x1(d.key))
        .attr("width", x1.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => plot.h - y(d.value));

    tasks.push(g.select(".y-axis").transition().duration(800).call(d3.axisLeft(y)).end());
    const bottom = g.select(".x-axis-bottom-line");
    tasks.push(bottom.transition().duration(800).call(d3.axisBottom(x0).tickSizeOuter(0)).end());
    
    await Promise.all(tasks);
    
    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold").attr("fill", "#0d6efd")
        .text(describeFilter(conditions, logic));
        
    return filteredData;
}

export async function groupedBarFocus(chartId, op, currentData, fullData) {
  const key = op.x ?? op.key ?? op.label;
  if (key==null) { console.warn("groupedBarFocus: key(x) 필요"); return currentData; }
  const spec = {
    op: "filter",
    mode: "keep",
    logic: "and",
    conditions: [{ field: (getSvgAndSetup(chartId).xField), equals: key }]
  };
  return await groupedBarFilter(chartId, spec, currentData, fullData);
}
