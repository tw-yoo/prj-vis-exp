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
  const mk = (c)=> (row)=>{
    const { field, satisfy, key, from, to, equals, in: arr, notIn } = c||{};
    const v = row[field];

    if (from!=null || to!=null) {
      const vn = v instanceof Date ? +v : (toNum(v) ?? v);
      const fn = from instanceof Date ? +from : (toNum(from) ?? from);
      const tn = to   instanceof Date ? +to   : (toNum(to)   ?? to);
      if (from!=null && vn < fn) return false;
      if (to!=null   && vn > tn) return false;
      return true;
    }
    if (equals!=null) return String(v)===String(equals);
    if (Array.isArray(arr))    return arr.map(String).includes(String(v));
    if (Array.isArray(notIn))  return !notIn.map(String).includes(String(v));
    if (satisfy && key!=null) {
      const f = cmpMap[satisfy]; if (!f) return true;
      const vn = toNum(v); const kn = toNum(key);
      return f(vn ?? v, kn ?? key);
    }
    return true;
  };
  const ps = conds.map(mk);
  return (row)=> ps[L](f=>f(row));
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
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const wantFacet = op.facet;
    const wantKey   = op.x ?? op.key ?? op.label;
    let targetSel = g.selectAll("rect");
    if (wantFacet != null) targetSel = targetSel.filter(d => d && String(d.facet)===String(wantFacet));
    if (wantKey   != null) targetSel = targetSel.filter(d => d && String(d.key)===String(wantKey));

    if (targetSel.empty()) { console.warn("groupedBarRetrieveValue: 타깃을 찾지 못함", op); return data; }

    const node = targetSel.node();
    const d = d3.select(node).datum();

    await targetSel.transition().duration(300).attr("stroke","#ff6961").attr("stroke-width",2).end();

    const bbox = node.getBBox();
    const cx = margins.left + readGroupX(node) + bbox.x + bbox.width/2;
    const cy = margins.top + bbox.y;

    svg.append("line").attr("class","annotation")
        .attr("x1", cx).attr("x2", cx).attr("y1", cy).attr("y2", cy)
        .attr("stroke","#ff6961").attr("stroke-dasharray","4 4")
        .transition().duration(300).attr("y2", margins.top + plot.h);

    svg.append("text").attr("class","annotation")
        .attr("x", cx).attr("y", cy-6).attr("text-anchor","middle")
        .attr("fill","#ff6961").attr("font-weight","bold")
        .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
        .text(fmtNum(d.value));

    return data;
}

export async function groupedBarFilter(chartId, op, data, fullData) {
  const { yField } = getSvgAndSetup(chartId);
  const conditions = Array.isArray(op.conditions) && op.conditions.length ? op.conditions : [op].filter(Boolean);
  const { yConds, xConds } = splitCondsByAxis(conditions, yField);

  if (yConds.length && xConds.length) {
    const mid = { ...op, conditions: yConds };
    data = await groupedBarFilterByY(chartId, mid, data, fullData);
    const last = { ...op, conditions: xConds };
    return await groupedBarFilterByX(chartId, last, data, fullData);
  }
  if (yConds.length) {
    return await groupedBarFilterByY(chartId, { ...op, conditions: yConds }, data, fullData);
  }
  return await groupedBarFilterByX(chartId, { ...op, conditions: xConds }, data, fullData);
}

export async function groupedBarFindExtremum(chartId, op, data) {
    const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const type = (op.type||"max").toLowerCase();
    const scope = (op.scope||"global").toLowerCase();
    const vals = data.map(r=>+r[op.field||yField]);
    if (!vals.length) return data;

    const yMax = d3.max(data, r=>+r[op.field||yField]);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const pick = (arr, f= d=>d.value)=> (type==="min" ? d3.min(arr, f) : d3.max(arr, f));

    if (scope==="global") {
        const targetVal = pick(g.selectAll("rect").data(), d=>d.value);
        const sel = g.selectAll("rect").filter(d => d && d.value===targetVal);
        await sel.transition().duration(300).attr("fill","#a65dfb").end();

        const yPos = y(targetVal);
        svg.append("line").attr("class","annotation range-line")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", margins.top + yPos).attr("y2", margins.top + yPos)
            .attr("stroke","#a65dfb").attr("stroke-dasharray","4 4")
            .transition().duration(300).attr("x2", margins.left + plot.w);

        svg.append("text").attr("class","annotation extremum-label")
            .attr("x", margins.left + plot.w - 6).attr("y", margins.top + yPos - 6)
            .attr("text-anchor","end").attr("fill","#a65dfb").attr("font-weight","bold")
            .text(`${type.toUpperCase()}: ${fmtNum(targetVal)}`);
        return data;
    }

    if (scope==="perfacet") {
        const groups = d3.groups(g.selectAll("rect").data(), d=>d.facet);
        const tasks = [];
        groups.forEach(([facet, arr])=>{
            const v = pick(arr, d=>d.value);
            const rs = g.selectAll(`.facet-group-${cssEscape(facet)} rect`).filter(d=>d && d.value===v);
            tasks.push(rs.transition().duration(300).attr("fill","#a65dfb").end());

            const groupX = xOfFacet(g, facet);
            const bandW  = widthOfFacet(g);
            svg.append("line").attr("class","annotation range-line")
                .attr("x1", margins.left + groupX).attr("x2", margins.left + groupX)
                .attr("y1", margins.top + y(v)).attr("y2", margins.top + y(v))
                .attr("stroke","#a65dfb").attr("stroke-dasharray","4 4")
                .transition().duration(300).attr("x2", margins.left + groupX + bandW);

            svg.append("text").attr("class","annotation extremum-label")
                .attr("x", margins.left + groupX + bandW - 4).attr("y", margins.top + y(v) - 6)
                .attr("text-anchor","end").attr("fill","#a65dfb").attr("font-weight","bold")
                .text(`${facet}: ${type.toUpperCase()} ${fmtNum(v)}`);
        });
        await Promise.all(tasks);
        return data;
    }

    console.warn("groupedBarFindExtremum: 지원하지 않는 scope", scope);
    return data;
}

export async function groupedBarDetermineRange(chartId, op, data) {
    const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const scope = (op.scope||"global").toLowerCase();
    const yf = op.field || yField;

    const yMaxGlobal = d3.max(data, r=>+r[yf]);
    const y = d3.scaleLinear().domain([0, yMaxGlobal]).nice().range([plot.h, 0]);

    if (scope==="global") {
        const vals = g.selectAll("rect").data().map(d=>d.value);
        if (!vals.length) return data;
        const minV = d3.min(vals), maxV = d3.max(vals);
        [ [minV,"MIN"], [maxV,"MAX"] ].forEach(([v,label],i)=>{
            svg.append("line").attr("class","annotation range-line")
                .attr("x1", margins.left).attr("x2", margins.left)
                .attr("y1", margins.top + y(v)).attr("y2", margins.top + y(v))
                .attr("stroke","#0d6efd").attr("stroke-dasharray","4 4")
                .transition().duration(300).attr("x2", margins.left + plot.w);
            svg.append("text").attr("class","annotation")
                .attr("x", margins.left + plot.w - 6).attr("y", margins.top + y(v) + (i?14:-6))
                .attr("text-anchor","end").attr("fill","#0d6efd").attr("font-weight","bold")
                .text(`${label} ${fmtNum(v)}`);
        });
        svg.append("text").attr("class","annotation")
            .attr("x", margins.left + plot.w - 6).attr("y", margins.top + plot.h/2)
            .attr("text-anchor","end").attr("fill","#0d6efd").attr("font-weight","bold")
            .text(`Range: ${fmtNum(minV)} ~ ${fmtNum(maxV)}`);
        return data;
    }

    if (scope==="perfacet") {
        const groups = d3.groups(g.selectAll("rect").data(), d=>d.facet);
        groups.forEach(([facet, arr])=>{
            const minV = d3.min(arr, d=>d.value), maxV = d3.max(arr, d=>d.value);
            const x0 = xOfFacet(g, facet), w = widthOfFacet(g);
            [ [minV,"MIN"], [maxV,"MAX"] ].forEach(([v,label],i)=>{
                svg.append("line").attr("class","annotation range-line")
                    .attr("x1", margins.left + x0).attr("x2", margins.left + x0)
                    .attr("y1", margins.top + y(v)).attr("y2", margins.top + y(v))
                    .attr("stroke","#0d6efd").attr("stroke-dasharray","4 4")
                    .transition().duration(300).attr("x2", margins.left + x0 + w);
                svg.append("text").attr("class","annotation")
                    .attr("x", margins.left + x0 + w - 4).attr("y", margins.top + y(v) + (i?14:-6))
                    .attr("text-anchor","end").attr("fill","#0d6efd").attr("font-weight","bold")
                    .text(`${facet} ${label} ${fmtNum(v)}`);
            });
        });
        return data;
    }

    console.warn("groupedBarDetermineRange: 지원하지 않는 scope", scope);
    return data;
}

export async function groupedBarCompare(chartId, op, data) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);

    svg.selectAll(".compare-label, .compare-summary, .compare-hline, .compare-dot, .compare-value").remove();

    const Ln = findRectByTuple(g, op.left);
    const Rn = findRectByTuple(g, op.right);
    if (!Ln || !Rn) { console.warn("groupedBarCompare: 대상 막대를 찾지 못했어요", op); return data; }

    const L = d3.select(Ln), R = d3.select(Rn);
    const ld = L.datum(),     rd = R.datum();

    await Promise.all([
        L.transition().duration(500).attr("stroke","#ffb74d").attr("stroke-width",2).end(),
        R.transition().duration(500).attr("stroke","#64b5f6").attr("stroke-width",2).end(),
    ]);

    const pL = absCenter(svg, Ln), pR = absCenter(svg, Rn);
    const yL = pL.y, yR = pR.y;

    const near = Math.abs(yL - yR) < 6;
    const o = near ? 6 : 0;

    const drawH = (y, color, cls, dy=0) => {
        svg.append("line")
            .attr("class", `compare-hline ${cls}`)
            .attr("x1", margins.left).attr("y1", y+dy)
            .attr("x2", margins.left).attr("y2", y+dy)
            .attr("stroke", color).attr("stroke-dasharray", "4 4")
            .transition().duration(450)
            .attr("x2", margins.left + plot.w);
    };
    drawH(yL, "#ffb74d", "left",  -o/2);
    drawH(yR, "#64b5f6", "right", +o/2);

    const gap = 12;
    svg.append("text").attr("class","compare-value")
        .attr("x", pL.x - gap).attr("y", yL - 10 - o/2).attr("text-anchor","end")
        .attr("fill","#ffb74d").attr("font-weight","bold")
        .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
        .text(fmtNum(ld.value));

    svg.append("text").attr("class","compare-value")
        .attr("x", pR.x + gap).attr("y", yR - 10 + o/2).attr("text-anchor","start")
        .attr("fill","#64b5f6").attr("font-weight","bold")
        .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
        .text(fmtNum(rd.value));

    const topY = Math.min(yL - o/2, yR + o/2) - 14;
    svg.append("text").attr("class","compare-label")
        .attr("x", (pL.x+pR.x)/2).attr("y", topY)
        .attr("text-anchor","middle").attr("font-size",14).attr("font-weight","bold")
        .attr("fill","#333")
        .text(`Δ ${fmtNum(Math.abs(ld.value - rd.value))}`);

    const nameOf = (d) => {
        const parts = [];
        if (d.facet != null && d.facet !== "") parts.push(String(d.facet));
        if (d.key   != null && d.key   !== "") parts.push(String(d.key));
        return parts.join(" · ") || "선택값";
    };
    const leftName  = nameOf(ld);
    const rightName = nameOf(rd);

    let summary;
    if (ld.value === rd.value) {
        summary = `${leftName}와 ${rightName}는 같습니다 — ${fmtNum(ld.value)}`;
    } else if (ld.value > rd.value) {
        summary = `${leftName}가 ${rightName}보다 큽니다 (Δ ${fmtNum(ld.value - rd.value)})`;
    } else {
        summary = `${rightName}가 ${leftName}보다 큽니다 (Δ ${fmtNum(rd.value - ld.value)})`;
    }

    svg.append("text").attr("class","compare-summary")
        .attr("x", margins.left).attr("y", margins.top - 28)
        .attr("font-size", 13).attr("font-weight", "bold").attr("fill", "#111")
        .text(summary);

    return data;
}

export async function groupedBarSort(chartId, op, data) {
    const { svg, g, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const target = (op.target||"x").toLowerCase();
    const by = (op.by||"value").toLowerCase();
    const order = (op.order||"descending").toLowerCase();
    const asc = order==="ascending";

    const rectData = g.selectAll("rect").data();

    if (target === "facet") {

        let facets = Array.from(new Set(rectData.map(d=>d.facet)));
        if (by === "key") {
            facets.sort((a,b)=> asc ? (a>b?1:-1) : (a<b?1:-1));
        } else {
            const sum = d3.rollup(rectData, v=> d3.sum(v, d=>d.value), d=>d.facet);
            facets.sort((a,b)=> asc ? (sum.get(a)-sum.get(b)) : (sum.get(b)-sum.get(a)));
        }

        const x0 = d3.scaleBand().domain(facets).range([0, plot.w]).paddingInner(0.2);
        const tasks = [];
        facets.forEach(f => {
            tasks.push(
                g.select(`.facet-group-${CSS.escape(String(f))}`)
                    .transition().duration(700)
                    .attr("transform", `translate(${x0(f)},0)`).end()
            );
        });

        let bottom = g.select(".x-axis-bottom-line");
        if (bottom.empty()) {
            bottom = g.append("g").attr("class","x-axis-bottom-line");
        }
        bottom.attr("transform", `translate(0,${plot.h})`);
        tasks.push(
            bottom.transition().duration(700)
                .call(d3.axisBottom(x0).tickSizeOuter(0))
                .end()
        );

        await Promise.all(tasks);

        bottom.selectAll("text")
            .attr("dy", "0.7em")
            .attr("dx", "-0.3em")
            .attr("transform", "rotate(-30)")
            .style("text-anchor", "end");

        return data;
    }

    const facets = Array.from(new Set(rectData.map(d=>d.facet)));
    const moveTasks = [];
    facets.forEach(f=>{
        const rows = rectData.filter(d=>d.facet===f);
        let keys = Array.from(new Set(rows.map(d=>d.key)));
        if (by==="key") {
            keys.sort((a,b)=> asc ? (a>b?1:-1) : (a<b?1:-1));
        } else {
            const sum = d3.rollup(rows, v=> d3.sum(v, d=>d.value), d=>d.key);
            keys.sort((a,b)=> asc ? (sum.get(a)-sum.get(b)) : (sum.get(b)-sum.get(a)));
        }
        const bandW = g.select(`[class^="facet-group-"]`).node()?.getBBox().width || plot.w/facets.length;
        const x1 = d3.scaleBand().domain(keys).range([0, bandW]).padding(0.05);
        moveTasks.push(
            g.select(`.facet-group-${CSS.escape(String(f))}`).selectAll("rect")
                .transition().duration(700)
                .attr("x", d => x1(d.key))
                .attr("width", x1.bandwidth())
                .end()
        );
    });
    await Promise.all(moveTasks);
    return data;
}

export async function groupedBarSum(chartId, op, data) {}

export async function groupedBarAverage(chartId, op, data) {}

export async function groupedBarDiff(chartId, op, data) {}

export async function groupedBarNth(chartId, op, data) {}

export async function groupedBarCount(chartId, op, data) {}

export async function groupedBarFilterByY(chartId, op, currentData, fullData) {
  const { svg, g, margins, plot, xField, yField, facetField } = getSvgAndSetup(chartId);

  svg.selectAll(".annotation, .filter-label, .compare-label, .extremum-label, .value-tag").remove();

  const mode      = (op.mode||"keep").toLowerCase();
  const rescaleY  = (op.rescaleY !== false);
  const logic     = op.logic || "and";
  const style     = op.style || {};
  const holdMs    = op.holdMs ?? 1200;                    

  const conditions = op.conditions || [];
  const pass = buildPredicate(conditions, logic);
  const allowedIds = new Set(fullData.filter(pass).map(r => idOf(r, facetField, xField)));

  const rects = g.selectAll("rect");
  if (rects.empty()) return currentData;


  const rowsForScale =
    mode === "keep"
      ? fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)))
      : currentData; 
  const yMax = rescaleY ? d3.max(rowsForScale, r=>+r[yField]) : d3.max(currentData, r=>+r[yField]);
  const yFinal = d3.scaleLinear().domain([0, yMax || 1]).nice().range([plot.h, 0]);

  drawYThresholdsOnce(svg, margins, plot, yFinal, yField, conditions);


  if (holdMs > 0) await delay(holdMs);

  if (mode==="highlight" || mode==="hide") {
    const dim = (mode==="hide") ? 0.08 : (style.otherOpacity ?? 0.25);
    const hit = [], miss = [];
    rects.each(function(){ const d = d3.select(this).datum(); (allowedIds.has(idOfDatum(d)) ? hit : miss).push(this); });

    const t1 = d3.selectAll(hit).transition().duration(650)
      .attr("opacity", 1)
      .attr("stroke", style.matchStroke || "black")
      .attr("stroke-width", style.matchStroke ? 1.5 : 1).end();
    const t2 = d3.selectAll(miss).transition().duration(650)
      .attr("opacity", dim).attr("stroke", "none").end();

    if (style.matchFill) d3.selectAll(hit).attr("fill", style.matchFill);
    if (style.otherFill) d3.selectAll(miss).attr("fill", style.otherFill);

    await Promise.all([t1, t2]);

    svg.append("text").attr("class","filter-label")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight","bold").attr("fill","#0d6efd")
      .text(describeFilter(conditions, logic));

    return fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)));
  }


  const keepSel = rects.filter(function(){ const d = d3.select(this).datum(); return allowedIds.has(idOfDatum(d)); });
  const dropSel = rects.filter(function(){ const d = d3.select(this).datum(); return !allowedIds.has(idOfDatum(d)); });

  await dropSel.transition().duration(500).attr("opacity",0).attr("width",0).remove().end();

  const keptData = []; keepSel.each(function(){ keptData.push(d3.select(this).datum()); });
  if (!keptData.length) return [];

  const keptFacets = Array.from(new Set(keptData.map(d=>d.facet)));
  const keptKeys   = Array.from(new Set(keptData.map(d=>d.key)));

  const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
  const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);

  const tasks = [];
  keptFacets.forEach(fv => {
    tasks.push(
      g.select(`.facet-group-${cssEscape(String(fv))}`)
        .transition().duration(900)
        .attr("transform", `translate(${x0(fv)},0)`)
        .attr("opacity", 1).end()
    );
  });
  g.selectAll('[class^="facet-group-"]').each(function(){
    const cls = this.getAttribute("class")||""; const fv  = cls.replace(/^facet-group-/, "");
    if (!keptFacets.map(String).includes(String(fv))) d3.select(this).transition().duration(450).attr("opacity",0).remove();
  });

  keepSel.each(function(){
    const R = d3.select(this), d = R.datum();
    let sel = R.transition().duration(900)
      .attr("x", x1(d.key)).attr("width", x1.bandwidth())
      .attr("y", yFinal(d.value)).attr("height", plot.h - yFinal(d.value))
      .attr("opacity", 1);
    if (style.matchFill) sel.attr("fill", style.matchFill);
  });

  tasks.push(g.select(".y-axis").transition().duration(900).call(d3.axisLeft(yFinal)).end());
  const bottom = g.select(".x-axis-bottom-line");
  tasks.push(bottom.transition().duration(900).call(d3.axisBottom(x0).tickSizeOuter(0)).end());
  bottom.attr("transform", `translate(0,${plot.h})`);

  await Promise.all(tasks);

  svg.append("text").attr("class","filter-label")
    .attr("x", margins.left).attr("y", margins.top - 10)
    .attr("font-size",14).attr("font-weight","bold").attr("fill","#0d6efd")
    .text(describeFilter(conditions, logic));

  return fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)));
}

export async function groupedBarFilterByX(chartId, op, currentData, fullData) {
  const { svg, g, margins, plot, xField, yField, facetField } = getSvgAndSetup(chartId);


  svg.selectAll(".annotation, .filter-label, .compare-label, .extremum-label, .value-tag").remove();

  const mode      = (op.mode||"keep").toLowerCase();
  const rescaleY  = (op.rescaleY !== false);
  const logic     = op.logic || "and";
  const style     = op.style || {};

  const conditions = op.conditions || [];
  const pass = buildPredicate(conditions, logic);
  const allowedIds = new Set(fullData.filter(pass).map(r => idOf(r, facetField, xField)));

  const rects = g.selectAll("rect");
  if (rects.empty()) return currentData;

  if (mode==="highlight" || mode==="hide") {
    const dim = (mode==="hide") ? 0.08 : (style.otherOpacity ?? 0.25);
    const hit = [], miss = [];
    rects.each(function(){ const d = d3.select(this).datum(); (allowedIds.has(idOfDatum(d)) ? hit : miss).push(this); });

    const t1 = d3.selectAll(hit).transition().duration(500)
      .attr("opacity", 1).attr("stroke", style.matchStroke || "black").attr("stroke-width", style.matchStroke ? 1.5 : 1).end();
    const t2 = d3.selectAll(miss).transition().duration(500)
      .attr("opacity", dim).attr("stroke", "none").end();

    if (style.matchFill) d3.selectAll(hit).attr("fill", style.matchFill);
    if (style.otherFill) d3.selectAll(miss).attr("fill", style.otherFill);

    await Promise.all([t1, t2]);

    svg.append("text").attr("class","filter-label")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight","bold").attr("fill","#0d6efd")
      .text(describeFilter(conditions, logic));

    return fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)));
  }


  const keepSel = rects.filter(function(){ const d = d3.select(this).datum(); return allowedIds.has(idOfDatum(d)); });
  const dropSel = rects.filter(function(){ const d = d3.select(this).datum(); return !allowedIds.has(idOfDatum(d)); });

  await dropSel.transition().duration(450).attr("opacity",0).attr("width",0).remove().end();

  const keptData = []; keepSel.each(function(){ keptData.push(d3.select(this).datum()); });
  if (!keptData.length) return [];

  const keptFacets = Array.from(new Set(keptData.map(d=>d.facet)));
  const keptKeys   = Array.from(new Set(keptData.map(d=>d.key)));

  const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
  const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);
  const yMax = rescaleY ? d3.max(keptData, d=>d.value) : d3.max(currentData, r=>+r[yField]);
  const y    = d3.scaleLinear().domain([0, (yMax||1)]).nice().range([plot.h, 0]);

  const tasks = [];
  keptFacets.forEach(fv => {
    tasks.push(
      g.select(`.facet-group-${cssEscape(String(fv))}`)
        .transition().duration(800)
        .attr("transform", `translate(${x0(fv)},0)`)
        .attr("opacity", 1).end()
    );
  });
  g.selectAll('[class^="facet-group-"]').each(function(){
    const cls = this.getAttribute("class")||""; const fv  = cls.replace(/^facet-group-/, "");
    if (!keptFacets.map(String).includes(String(fv))) d3.select(this).transition().duration(400).attr("opacity",0).remove();
  });

  keepSel.each(function(){
    const R = d3.select(this), d = R.datum();
    let sel = R.transition().duration(800)
      .attr("x", x1(d.key)).attr("width", x1.bandwidth())
      .attr("y", y(d.value)).attr("height", plot.h - y(d.value))
      .attr("opacity", 1);
    if (style.matchFill) sel.attr("fill", style.matchFill);
  });

  tasks.push(g.select(".y-axis").transition().duration(800).call(d3.axisLeft(y)).end());
  const bottom = g.select(".x-axis-bottom-line");
  tasks.push(bottom.transition().duration(800).call(d3.axisBottom(x0).tickSizeOuter(0)).end());
  bottom.attr("transform", `translate(0,${plot.h})`);

  await Promise.all(tasks);

  svg.append("text").attr("class","filter-label")
    .attr("x", margins.left).attr("y", margins.top - 10)
    .attr("font-size",14).attr("font-weight","bold").attr("fill","#0d6efd")
    .text(describeFilter(conditions, logic));

  return fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)));
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
