// groupedBarFunctions.js — 중복 제거 최종본

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

// ---------- 유틸(한 번만 선언) ----------
const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function cssEscape(x){ try{ return CSS.escape(String(x)); } catch { return String(x).replace(/[^\w-]/g,'_'); } }
function idOf(row, facetField, xField) { return `${row[facetField]}-${row[xField]}`; }
function idOfDatum(d) { return `${d.facet}-${d.key}`; }

// parent <g transform="translate(x,0)"> 의 x를 안전하게 읽기
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

// ---------- FILTER ----------
export async function groupedBarFilter(chartId, op, currentData, fullData) {
  const { svg, g, margins, plot, xField, yField, facetField } = getSvgAndSetup(chartId);

  svg.selectAll(".annotation, .filter-label, .compare-label, .range-line, .threshold-line, .threshold-label, .value-tag").remove();

  const mode       = (op.mode||"highlight").toLowerCase();      // highlight | hide | keep
  const rescaleY   = (op.rescaleY !== false);
  const logic      = op.logic || "and";
  const showValues = (op.showValues ?? "match");                 // "match" | "all" | "none"
  const style      = op.style || {};                             // { matchFill, otherFill, matchStroke, otherOpacity }

  const conditions = Array.isArray(op.conditions) && op.conditions.length ? op.conditions
                    : [op].filter(c => c && c.field);

  const pass = buildPredicate(conditions, logic);
  const allowedIds = new Set(fullData.filter(pass).map(r => idOf(r, facetField, xField)));

  const rects = g.selectAll("rect");
  if (rects.empty()) return currentData;

  const yMaxForGuide = d3.max(fullData, r=>+r[yField]) || 1;
  const yGuide = d3.scaleLinear().domain([0, yMaxForGuide]).nice().range([plot.h, 0]);

  if (mode==="highlight" || mode==="hide") {
    const dim = (mode==="hide") ? 0.08 : (style.otherOpacity ?? 0.25);

    const hit = [], miss = [];
    rects.each(function(){
      const d = d3.select(this).datum();
      (allowedIds.has(idOfDatum(d)) ? hit : miss).push(this);
    });

    const t1 = d3.selectAll(hit).transition().duration(350)
      .attr("opacity", 1)
      .attr("stroke", style.matchStroke || "black")
      .attr("stroke-width", style.matchStroke ? 1.5 : 1)
      .end();

    const t2 = d3.selectAll(miss).transition().duration(350)
      .attr("opacity", dim)
      .attr("stroke", "none")
      .end();

    if (style.matchFill) d3.selectAll(hit).attr("fill", style.matchFill);
    if (style.otherFill) d3.selectAll(miss).attr("fill", style.otherFill);

    await Promise.all([t1, t2]);

    if (showValues !== "none") {
      const targets = (showValues==="all") ? rects.nodes() : hit;
      targets.forEach(node => {
        const d = d3.select(node).datum();
        const bb = node.getBBox();
        const cx = margins.left + readGroupX(node) + bb.x + bb.width/2;
        const cy = margins.top + bb.y - 6;
        svg.append("text")
          .attr("class","value-tag").attr("x", cx).attr("y", cy)
          .attr("text-anchor","middle").attr("font-size",11).attr("font-weight","bold")
          .attr("fill","#333").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
          .text(fmtNum(d.value));
      });
    }

    drawThresholdsForY(svg, margins, plot, yGuide, yField, conditions);

    svg.append("text").attr("class","filter-label")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight","bold").attr("fill","#0d6efd")
      .text(describeFilter(conditions, logic));

    return fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)));
  }

  // keep
  const keepSel = rects.filter(function(){
    const d = d3.select(this).datum();
    return allowedIds.has(idOfDatum(d));
  });
  const dropSel = rects.filter(function(){
    const d = d3.select(this).datum();
    return !allowedIds.has(idOfDatum(d));
  });

  await dropSel.transition().duration(250).attr("opacity",0).attr("width",0).remove().end();

  const keptData = [];
  keepSel.each(function(){ keptData.push(d3.select(this).datum()); });
  if (!keptData.length) return [];

  const keptFacets = Array.from(new Set(keptData.map(d=>d.facet)));
  const keptKeys   = Array.from(new Set(keptData.map(d=>d.key)));

  const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
  const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);
  const yMax = rescaleY ? d3.max(keptData, d=>d.value) : d3.max(currentData, r=>+r[yField]);
  const y = d3.scaleLinear().domain([0, (yMax||1)]).nice().range([plot.h, 0]);

  const tasks = [];
  keptFacets.forEach(fv => {
    tasks.push(
      g.select(`.facet-group-${cssEscape(fv)}`)
        .transition().duration(600)
        .attr("transform", `translate(${x0(fv)},0)`)
        .attr("opacity", 1)
        .end()
    );
  });
  g.selectAll(`[class^="facet-group-"]`).each(function(){
    const cls = this.getAttribute("class")||"";
    const fv  = cls.replace(/^facet-group-/, "");
    if (!keptFacets.map(String).includes(String(fv))) {
      d3.select(this).transition().duration(250).attr("opacity",0).remove();
    }
  });

  keepSel.each(function(){
    const R = d3.select(this), d = R.datum();
    let sel = R.transition().duration(700)
      .attr("x", x1(d.key))
      .attr("width", x1.bandwidth())
      .attr("y", y(d.value))
      .attr("height", plot.h - y(d.value))
      .attr("opacity", 1);
    if (style.matchFill) sel.attr("fill", style.matchFill);
  });
  tasks.push(g.select(".y-axis").transition().duration(700).call(d3.axisLeft(y)).end());

  g.select(".x-axis-top-labels").transition().duration(300).attr("opacity", 0);
  const bottom = g.select(".x-axis-bottom-line");
  tasks.push(bottom.transition().duration(700)
    .call(d3.axisBottom(x0).tickSizeOuter(0))
    .end());
  bottom.attr("transform", `translate(0,${plot.h})`);

  await Promise.all(tasks);

  if (showValues !== "none") {
    keepSel.nodes().forEach(node => {
      const d = d3.select(node).datum();
      const bb = node.getBBox();
      const cx = margins.left + readGroupX(node) + bb.x + bb.width/2;
      const cy = margins.top + bb.y - 6;
      svg.append("text").attr("class","value-tag")
        .attr("x", cx).attr("y", cy)
        .attr("text-anchor","middle").attr("font-size",11).attr("font-weight","bold")
        .attr("fill","#333").attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
        .text(fmtNum(d.value));
    });
  }

  drawThresholdsForY(svg, margins, plot, y, yField, conditions);

  svg.append("text").attr("class","filter-label")
    .attr("x", margins.left).attr("y", margins.top - 10)
    .attr("font-size",14).attr("font-weight","bold").attr("fill","#0d6efd")
    .text(describeFilter(conditions, logic));

  return fullData.filter(r => allowedIds.has(idOf(r, facetField, xField)));
}

// ---------- RETRIEVE VALUE ----------
export async function groupedBarRetrieveValue(chartId, op, currentData, fullData) {
  const { svg, g, margins, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const wantFacet = op.facet;
  const wantKey   = op.x ?? op.key ?? op.label;
  let targetSel = g.selectAll("rect");
  if (wantFacet != null) targetSel = targetSel.filter(d => d && String(d.facet)===String(wantFacet));
  if (wantKey   != null) targetSel = targetSel.filter(d => d && String(d.key)===String(wantKey));

  if (targetSel.empty()) { console.warn("groupedBarRetrieveValue: 타깃을 찾지 못함", op); return currentData; }

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

  return currentData;
}

// ---------- FIND EXTREMUM ----------
export async function groupedBarFindExtremum(chartId, op, currentData) {
  const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const type = (op.type||"max").toLowerCase();
  const scope = (op.scope||"global").toLowerCase();
  const vals = currentData.map(r=>+r[op.field||yField]);
  if (!vals.length) return currentData;

  const yMax = d3.max(currentData, r=>+r[op.field||yField]);
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
    return currentData;
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
    return currentData;
  }

  console.warn("groupedBarFindExtremum: 지원하지 않는 scope", scope);
  return currentData;
}

// ---------- DETERMINE RANGE ----------
export async function groupedBarDetermineRange(chartId, op, currentData) {
  const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const scope = (op.scope||"global").toLowerCase();
  const yf = op.field || yField;

  const yMaxGlobal = d3.max(currentData, r=>+r[yf]);
  const y = d3.scaleLinear().domain([0, yMaxGlobal]).nice().range([plot.h, 0]);

  if (scope==="global") {
    const vals = g.selectAll("rect").data().map(d=>d.value);
    if (!vals.length) return currentData;
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
    return currentData;
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
    return currentData;
  }

  console.warn("groupedBarDetermineRange: 지원하지 않는 scope", scope);
  return currentData;
}

// ---------- COMPARE ----------
export async function groupedBarCompare(chartId, op, currentData) {
  const { svg, g } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const L = findRectByTuple(g, op.left);
  const R = findRectByTuple(g, op.right);
  if (!L || !R) { console.warn("groupedBarCompare: 대상 막대를 찾지 못했어요", op); return currentData; }

  const ld = d3.select(L).datum(), rd = d3.select(R).datum();

  await Promise.all([
    d3.select(L).transition().duration(300).attr("stroke","#ffb74d").attr("stroke-width",2).end(),
    d3.select(R).transition().duration(300).attr("stroke","#64b5f6").attr("stroke-width",2).end(),
  ]);

  const pL = absCenter(svg, L), pR = absCenter(svg, R);
  const diff = Math.abs(ld.value - rd.value);

  svg.append("line").attr("class","annotation")
    .attr("x1", pL.x).attr("y1", pL.y - 8)
    .attr("x2", pL.x).attr("y2", pL.y - 8)
    .attr("stroke","#333").attr("stroke-dasharray","4 4")
    .transition().duration(300).attr("x2", pR.x);

  svg.append("text").attr("class","annotation")
    .attr("x", pL.x).attr("y", pL.y - 12).attr("text-anchor","middle")
    .attr("fill","#ffb74d").attr("font-weight","bold")
    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
    .text(fmtNum(ld.value));

  svg.append("text").attr("class","annotation")
    .attr("x", pR.x).attr("y", pR.y - 12).attr("text-anchor","middle")
    .attr("fill","#64b5f6").attr("font-weight","bold")
    .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
    .text(fmtNum(rd.value));

  svg.append("text").attr("class","annotation compare-label")
    .attr("x", (pL.x+pR.x)/2).attr("y", Math.min(pL.y,pR.y) - 18)
    .attr("text-anchor","middle").attr("font-size",14).attr("font-weight","bold")
    .attr("fill","#333").text(`Δ ${fmtNum(diff)}`);

  return currentData;
}
// groupedBarFunctions.js 내 groupedBarSort 교체본
export async function groupedBarSort(chartId, op, currentData) {
  const { svg, g, plot } = getSvgAndSetup(chartId);
  clearAllAnnotations(svg);

  const target = (op.target||"x").toLowerCase();
  const by = (op.by||"value").toLowerCase();
  const order = (op.order||"descending").toLowerCase();
  const asc = order==="ascending";

  const rectData = g.selectAll("rect").data();

  if (target === "facet") {
    // 1) 정렬 순서 계산
    let facets = Array.from(new Set(rectData.map(d=>d.facet)));
    if (by === "key") {
      facets.sort((a,b)=> asc ? (a>b?1:-1) : (a<b?1:-1));
    } else {
      const sum = d3.rollup(rectData, v=> d3.sum(v, d=>d.value), d=>d.facet);
      facets.sort((a,b)=> asc ? (sum.get(a)-sum.get(b)) : (sum.get(b)-sum.get(a)));
    }

    // 2) 스케일과 그룹 위치 업데이트
    const x0 = d3.scaleBand().domain(facets).range([0, plot.w]).paddingInner(0.2);
    const tasks = [];
    facets.forEach(f => {
      tasks.push(
        g.select(`.facet-group-${CSS.escape(String(f))}`)
          .transition().duration(700)
          .attr("transform", `translate(${x0(f)},0)`).end()
      );
    });

    // 3) 아래축을 "보이는" 라벨로 갱신 (← 핵심: tickFormat("") 제거)
    let bottom = g.select(".x-axis-bottom-line");
    if (bottom.empty()) {
      bottom = g.append("g").attr("class","x-axis-bottom-line");
    }
    bottom.attr("transform", `translate(0,${plot.h})`);
    tasks.push(
      bottom.transition().duration(700)
        .call(d3.axisBottom(x0).tickSizeOuter(0)) // 라벨 출력!
        .end()
    );

    await Promise.all(tasks);

    // 4) 읽기 좋게 라벨 약간 기울이기(겹침 방지)
    bottom.selectAll("text")
      .attr("dy", "0.7em")
      .attr("dx", "-0.3em")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");

    return currentData;
  }

  // 기존 x(target) 정렬 분기는 그대로 둠
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
  return currentData;
}

// ---------- FOCUS ----------
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
