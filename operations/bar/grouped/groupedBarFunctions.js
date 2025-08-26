import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";

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

function describeFilter(conds, logic) {
  const j = (c)=>{
    if (c.from!=null || c.to!=null) return `${c.field}∈[${c.from ?? "-∞"}, ${c.to ?? "+∞"}]`;
    if (c.equals!=null) return `${c.field}=${c.equals}`;
    if (Array.isArray(c.in)) return `${c.field}∈{${c.in.join(",")}}`;
    if (Array.isArray(c.notIn)) return `${c.field}∉{${c.notIn.join(",")}}`;
    if (c.satisfy && c.key!=null) return `${c.field} ${c.satisfy} ${c.key}`;
    return c.field || "filter";
  };
  return `Filter: ${conds.map(j).join(` ${(logic||"AND").toUpperCase()} `)}`;
}

function drawThresholdsForY(svg, margins, plot, yScale, yField, conds) {
  const yConds = (conds||[]).filter(c => c.field === yField && (c.from!=null || c.to!=null || (c.satisfy && c.key!=null)));
  if (!yConds.length) return;
  const makeLine = (yVal, text) => {
    const y = margins.top + yScale(yVal);
    svg.append("line").attr("class","threshold-line")
      .attr("x1", margins.left).attr("y1", y).attr("x2", margins.left).attr("y2", y)
      .attr("stroke","#0d6efd").attr("stroke-width",1.5).attr("stroke-dasharray","5 5")
      .transition().duration(350).attr("x2", margins.left + plot.w);
    svg.append("text").attr("class","threshold-label")
      .attr("x", margins.left + plot.w + 6).attr("y", y)
      .attr("dominant-baseline","middle").attr("fill","#0d6efd")
      .attr("font-size",12).attr("font-weight","bold").text(text);
  };
  yConds.forEach(c => {
    if (c.from!=null) makeLine(+c.from, `from ${fmtNum(+c.from)}`);
    if (c.to!=null)   makeLine(+c.to,   `to ${fmtNum(+c.to)}`);
    if (c.satisfy && c.key!=null) makeLine(+c.key, `${c.satisfy} ${fmtNum(+c.key)}`);
  });
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

function splitCondsByAxis(conds, yField) {
  const yConds = [], xConds = [];
  (conds||[]).forEach(c => {
    if (!c || !c.field) return;
    if (c.field === yField && (c.from!=null || c.to!=null || (c.satisfy && c.key!=null))) yConds.push(c);
    else xConds.push(c);
  });
  return { yConds, xConds };
}
function drawYThresholdsOnce(svg, margins, plot, yScale, yField, conditions) {
  const yConds = (conditions||[]).filter(c =>
    c.field === yField && (c.from!=null || c.to!=null || (c.satisfy && c.key!=null))
  );
  const uniq = new Map();
  yConds.forEach(c => {
    if (c.from!=null) uniq.set(`from:${+c.from}`, { y:+c.from, label:`from ${fmtNum(+c.from)}` });
    if (c.to!=null)   uniq.set(`to:${+c.to}`,     { y:+c.to,   label:`to ${fmtNum(+c.to)}` });
    if (c.satisfy && c.key!=null)
      uniq.set(`${c.satisfy}:${+c.key}`, { y:+c.key, label:`${c.satisfy} ${fmtNum(+c.key)}` });
  });

  
  svg.selectAll(".threshold-line, .threshold-label").remove();

  for (const [id, { y, label }] of uniq) {
    const yPix = margins.top + yScale(y);
    svg.append("line")
      .attr("class", "threshold-line")
      .attr("data-thr-id", id)
      .attr("x1", margins.left).attr("x2", margins.left + plot.w)
      .attr("y1", yPix).attr("y2", yPix)
      .attr("stroke", "#0d6efd").attr("stroke-width", 1.5).attr("stroke-dasharray", "5 5");
    svg.append("text")
      .attr("class", "threshold-label")
      .attr("data-thr-id", id)
      .attr("x", margins.left + plot.w + 6).attr("y", yPix)
      .attr("dominant-baseline", "middle").attr("fill", "#0d6efd")
      .attr("font-size", 12).attr("font-weight", "bold")
      .text(label);
  }
}

export async function groupedBarRetrieveValue(chartId, op, data) {
    const { svg, g, margins, plot, facetField, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const wantTarget = op.target;
    const wantGroup = op.group;

    let targetSel = g.selectAll("rect");

    if (wantGroup != null) {
        targetSel = targetSel.filter(d => d && String(d.facet) === String(wantGroup));
    }
    if (wantTarget != null) {
        targetSel = targetSel.filter(d => d && String(d.key) === String(wantTarget));
    }

    if (targetSel.empty()) {
        console.warn("groupedBarRetrieveValue: Target not found", { target: wantTarget, group: wantGroup });
        return null;
    }

    const node = targetSel.node();
    const datum = d3.select(node).datum();
    const hlColor = "#ff6961";

    await g.selectAll("rect").transition().duration(400).attr("opacity", 0.3).end();
    await targetSel.transition().duration(400).attr("opacity", 1).attr("stroke", hlColor).attr("stroke-width", 2).end();

    const bbox = node.getBBox();
    const groupX = readGroupX(node);
    const cx = margins.left + groupX + bbox.x + bbox.width / 2;
    const cy = margins.top + bbox.y;

    svg.append("line").attr("class", "annotation")
        .attr("x1", cx).attr("x2", cx).attr("y1", cy).attr("y2", cy)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
        .transition().duration(300).attr("y2", margins.top + plot.h);

    svg.append("text").attr("class", "annotation")
        .attr("x", cx).attr("y", cy - 6).attr("text-anchor", "middle")
        .attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(fmtNum(datum.value));

    const targetDatum = data.find(d => {
        return String(d.target) === String(wantGroup) && String(d.group) === String(wantTarget);
    });

    return targetDatum || null;
}

export async function groupedBarFilter(chartId, op, data, isLast = false) {
    const { yField, facetField, xField } = getSvgAndSetup(chartId);
    
    const operatorMap = {
        '==': 'equals',
        'in': 'in',
        'not-in': 'notIn',
    };

    const condition = {
        field: op.field,
    };
    
    const mappedOp = operatorMap[op.operator];
    if (mappedOp) {
        condition[mappedOp] = op.value;
    } else {
        condition.satisfy = op.operator;
        condition.key = op.value;
    }

    const filterOp = {
        conditions: [condition],
        logic: 'and',
        rescaleY: true, 
    };

    if (op.field === yField) {
        return await groupedBarFilterByY(chartId, filterOp, data, data);
    } else {
        return await groupedBarFilterByX(chartId, filterOp, data, data);
    }
}

export async function groupedBarFindExtremum(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const which = op.which || 'max';
    const field = op.field || yField;
    const hlColor = "#a65dfb";

    if (!data || data.length === 0) {
        console.warn("FindExtremum: No data to process.");
        return null;
    }

    const allValues = data.map(d => d.value);
    const extremumValue = which === 'min' ? d3.min(allValues) : d3.max(allValues);
    const targetDatum = data.find(d => d.value === extremumValue) || null;

    if (!targetDatum) {
        console.warn("FindExtremum: Could not find target datum for:", op);
        return null;
    }

    const targetNode = findRectByTuple(g, { facet: targetDatum.target, key: targetDatum.group });
    if (!targetNode) return null;

    const targetRect = d3.select(targetNode);
    const otherRects = g.selectAll("rect").filter(function() { return this !== targetNode; });

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
        .text(`${which.toUpperCase()}: ${fmtNum(extremumValue)}`)
        .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);
        
    return targetDatum;
}

export async function groupedBarDetermineRange(chartId, op, data) {
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const yf = op.field || yField;
    const yMaxGlobal = d3.max(data, r => r.value);
    const y = d3.scaleLinear().domain([0, yMaxGlobal]).nice().range([plot.h, 0]);
    const hlColor = "#0d6efd";

    if (op.group == null) {
        // Global Scope
        const allRects = g.selectAll("rect");
        const allValues = allRects.data().map(d => d.value);
        if (!allValues.length) return null;
        
        const minV = d3.min(allValues);
        const maxV = d3.max(allValues);

        const minRects = allRects.filter(d => d.value === minV);
        const maxRects = allRects.filter(d => d.value === maxV);

        await g.selectAll("rect")
            .transition().duration(500)
            .attr("opacity", 0.2).end();
        
        await Promise.all([
            minRects.transition().duration(500).attr("opacity", 1).attr("fill", hlColor).end(),
            maxRects.transition().duration(500).attr("opacity", 1).attr("fill", hlColor).end()
        ]);
        
        await delay(800);

        const drawLine = (value, label) => {
            const yPos = margins.top + y(value);
            svg.append("line").attr("class", "annotation range-line")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
                .transition().duration(700).attr("x2", margins.left + plot.w);
            svg.append("text").attr("class", "annotation")
                .attr("x", margins.left - 8).attr("y", yPos)
                .attr("text-anchor", "end").attr("dominant-baseline", "middle")
                .attr("fill", hlColor).attr("font-weight", "bold")
                .text(label).attr("opacity", 0)
                .transition().delay(200).duration(500).attr("opacity", 1);
        };

        drawLine(minV, `MIN: ${fmtNum(minV)}`);
        await delay(400);
        drawLine(maxV, `MAX: ${fmtNum(maxV)}`);

        await delay(800);
        
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(`Overall Range: ${fmtNum(minV)} ~ ${fmtNum(maxV)}`)
            .attr("opacity", 0).transition().duration(400).attr("opacity", 1);

        return new IntervalValue(facetField, minV, maxV);

    } else {
        // Per-Group (Facet) Scope
        const targetGroup = op.group;
        const groupRects = g.selectAll("rect").filter(d => String(d.facet) === String(targetGroup));
        const otherRects = g.selectAll("rect").filter(d => String(d.facet) !== String(targetGroup));
        const groupValues = groupRects.data().map(d => d.value);
        if (!groupValues.length) return null;

        const minV = d3.min(groupValues);
        const maxV = d3.max(groupValues);

        await Promise.all([
            otherRects.transition().duration(500).attr("opacity", 0.2).end(),
            groupRects.transition().duration(500).attr("opacity", 1).end()
        ]);
        await delay(700);

        const x0 = xOfFacet(g, targetGroup);
        const w = widthOfFacet(g);

        const drawLine = (value, label) => {
             const yPos = margins.top + y(value);
             svg.append("line").attr("class", "annotation range-line")
                .attr("x1", margins.left + x0).attr("y1", yPos)
                .attr("x2", margins.left + x0).attr("y2", yPos)
                .attr("stroke", hlColor).attr("stroke-dasharray", "4 4")
                .transition().duration(700).attr("x2", margins.left + x0 + w);
            svg.append("text").attr("class", "annotation")
                .attr("x", margins.left + x0 - 8).attr("y", yPos)
                .attr("text-anchor", "end").attr("dominant-baseline", "middle")
                .attr("fill", hlColor).attr("font-weight", "bold")
                .text(label).attr("opacity", 0)
                .transition().delay(200).duration(500).attr("opacity", 1);
        };
        
        drawLine(minV, `MIN: ${fmtNum(minV)}`);
        await delay(400);
        drawLine(maxV, `MAX: ${fmtNum(maxV)}`);
        
        await delay(800);

        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(`Range for ${targetGroup}: ${fmtNum(minV)} ~ ${fmtNum(maxV)}`)
            .attr("opacity", 0).transition().duration(400).attr("opacity", 1);

        return new IntervalValue(facetField, minV, maxV);
    }
}



export async function groupedBarCompare(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetA = { facet: op.targetA.category, key: op.targetA.series };
    const targetB = { facet: op.targetB.category, key: op.targetB.series };

    const nodeA = findRectByTuple(g, targetA);
    const nodeB = findRectByTuple(g, targetB);

    if (!nodeA || !nodeB) {
        console.warn("groupedBarCompare: One or both targets not found", op);
        return new BoolValue("Comparison failed", false);
    }

    const rectA = d3.select(nodeA);
    const rectB = d3.select(nodeB);
    const datumA = rectA.datum();
    const datumB = rectB.datum();
    const valueA = datumA.value;
    const valueB = datumB.value;
    
    const idA = nodeA.getAttribute('data-id');
    const idB = nodeB.getAttribute('data-id');

    const otherBars = g.selectAll("rect").filter(function() {
        const currentId = this.getAttribute('data-id');
        return currentId !== idA && currentId !== idB;
    });

    const colorA = "#ffb74d";
    const colorB = "#64b5f6";

    await Promise.all([
        otherBars.transition().duration(500).attr("opacity", 0.2).end(),
        rectA.transition().duration(500).attr("opacity", 1).attr("stroke", colorA).attr("stroke-width", 2).end(),
        rectB.transition().duration(500).attr("opacity", 1).attr("stroke", colorB).attr("stroke-width", 2).end(),
    ]).catch(err => {
        console.log("A transition was interrupted, which is often expected.", err);
    });

    const posA = absCenter(svg, nodeA);
    const posB = absCenter(svg, nodeB);

    const drawAnnotation = (pos, datum, color) => {
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
    
    drawAnnotation(posA, datumA, colorA);
    drawAnnotation(posB, datumB, colorB);

    const comparisonFunc = cmpMap[op.operator] || (() => false);
    const result = comparisonFunc(valueA, valueB);
    const symbol = {'>':' > ','>=':' >= ','<':' < ','<=':' <= ','==':' == ','!=':' != '}[op.operator] || ` ${op.operator} `;
    const summary = `${fmtNum(valueA)}${symbol}${fmtNum(valueB)} → ${result}`;
    
    svg.append("text").attr("class", "annotation compare-summary")
        .attr("x", margins.left).attr("y", margins.top - 28)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", result ? "green" : "red")
        .text(summary);

    return new BoolValue('', result);
}

export async function groupedBarSort(chartId, op, data) {
    const { svg, g, plot, facetField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sortField = op.field;
    const asc = (op.order || 'asc') === 'asc';
    
    let sortedFacets = Array.from(new Set(data.map(d => d.target)));

    if (sortField === facetField) {
        sortedFacets.sort((a, b) => {
            const aNum = parseFloat(a);
            const bNum = parseFloat(b);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return asc ? aNum - bNum : bNum - aNum;
            }
            return asc ? String(a).localeCompare(String(b)) : String(b).localeCompare(String(a));
        });
    } else if (sortField === yField) {
        const sumsByFacet = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.target);
        sortedFacets.sort((a, b) => asc ? sumsByFacet.get(a) - sumsByFacet.get(b) : sumsByFacet.get(b) - sumsByFacet.get(a));
    }

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
        .text(`Sorted by ${sortField} (${op.order})`);

    const sortedData = [];
    const dataByFacet = d3.group(data, d => d.target);
    sortedFacets.forEach(facet => {
        if (dataByFacet.has(facet)) {
            sortedData.push(...dataByFacet.get(facet));
        }
    });

    return sortedData;
}

export async function groupedBarSum(chartId, op, data) {}

export async function groupedBarAverage(chartId, op, data) {}

export async function groupedBarDiff(chartId, op, data) {}

export async function groupedBarNth(chartId, op, data) {}

export async function groupedBarCount(chartId, op, data) {}

export async function groupedBarFilterByY(chartId, op, currentData, fullData) {
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
    const yMax = rescaleY ? d3.max(filteredData, r => r.value) : d3.max(currentData, r => r.value);
    const yFinal = d3.scaleLinear().domain([0, yMax || 1]).nice().range([plot.h, 0]);

    drawYThresholdsOnce(svg, margins, plot, yFinal, yField, conditions);

    if (mode === "highlight" || mode === "hide") {
        const dim = (mode === "hide") ? 0.08 : (style.otherOpacity ?? 0.25);
        rects.transition().duration(650)
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

    await dropSel.transition().duration(500).attr("opacity", 0).attr("width", 0).remove().end();

    const keptData = filteredData.map(d => ({ facet: d.target, key: d.group, value: d.value }));
    if (!keptData.length) return [];
    
    const keptFacets = Array.from(new Set(keptData.map(d => d.facet)));
    const keptKeys = Array.from(new Set(keptData.map(d => d.key)));

    const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);

    const tasks = [];
    g.selectAll('[class^="facet-group-"]').each(function() {
        const cls = this.getAttribute("class") || "";
        const fv = cls.replace(/^facet-group-/, "");
        if (!keptFacets.map(String).includes(String(fv))) {
            d3.select(this).transition().duration(450).attr("opacity", 0).remove();
        } else {
           tasks.push(d3.select(this).transition().duration(900).attr("transform", `translate(${x0(fv)},0)`).end());
        }
    });

    keepSel.transition().duration(900)
        .attr("x", d => x1(d.key))
        .attr("width", x1.bandwidth())
        .attr("y", d => yFinal(d.value))
        .attr("height", d => plot.h - yFinal(d.value));

    tasks.push(g.select(".y-axis").transition().duration(900).call(d3.axisLeft(yFinal)).end());
    const bottom = g.select(".x-axis-bottom-line");
    tasks.push(bottom.transition().duration(900).call(d3.axisBottom(x0).tickSizeOuter(0)).end());
    
    await Promise.all(tasks);

    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold").attr("fill", "#0d6efd")
        .text(describeFilter(conditions, logic));
    
    return filteredData;
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
