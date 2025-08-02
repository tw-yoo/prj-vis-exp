export function stackedBarRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  /* reset */
  svg.selectAll(".retrieve-rect,.retrieve-label").remove();
  svg.selectAll("g.tick text").attr("fill", "#000").attr("font-weight", null);

  /* params */
  const key           = String(op.key);
  const keyField      = op.keyField      || "month";
  const subgroupKey   = String(op.subgroupKey);
  const subgroupField = op.subgroupField || "weather";

  /* locate rect */
  let targetRect = null;
  svg.selectAll("rect").each(function () {
    const d = d3.select(this).datum();
    if (!d || d.start === undefined) return;
    const catVal = String((keyField in d) ? d[keyField] : d.category);
    const subVal = String((subgroupField in d) ? d[subgroupField] : d.subgroup);
    if (catVal === key && subVal === subgroupKey) targetRect = d3.select(this);
  });
  if (!targetRect) { console.warn("stackedBarRetrieveValue: target not found"); return chartId; }

  /* geometry & value */
  const { x, y, width, height } = targetRect.node().getBBox();
  const value = targetRect.datum().end - targetRect.datum().start;

  /* highlight colours */
  const hl   = "#ffeb3b";
  const halo = "#ffffff";
  const pad  = 2;

  // white halo outline
  svg.append("rect")
     .attr("class", "retrieve-rect")
     .attr("x", x-pad).attr("y", y-pad)
     .attr("width", width+pad*2).attr("height", height+pad*2)
     .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
     .attr("pointer-events", "none")
     .attr("opacity", 0)
     .transition().duration(400).attr("opacity", 1);

  // yellow outline
  svg.append("rect")
     .attr("class", "retrieve-rect")
     .attr("x", x-pad).attr("y", y-pad)
     .attr("width", width+pad*2).attr("height", height+pad*2)
     .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
     .attr("pointer-events", "none")
     .attr("opacity", 0)
     .transition().duration(400).attr("opacity", 1);

  // value label with black stroke
  const horiz = width > height;
  svg.append("text")
     .attr("class", "retrieve-label")
     .attr("x", horiz ? x + width + 6 : x + width / 2)
     .attr("y", horiz ? y + height / 2 : y - 6)
     .attr("fill", hl).attr("font-size", "12px").attr("font-weight", "bold")
     .attr("paint-order", "stroke").attr("stroke", "#000").attr("stroke-width", 3)
     .attr("dominant-baseline", horiz ? "middle" : "auto")
     .attr("text-anchor", horiz ? "start" : "middle")
     .text(value.toLocaleString())
     .attr("opacity", 0)
     .transition().delay(200).duration(400).attr("opacity", 1);

  // x-axis tick highlight
  svg.selectAll("g.tick").each(function (t) {
    if (String(t) === key) {
      d3.select(this).select("text")
        .attr("fill", hl).attr("font-weight", "bold")
        .attr("opacity", 0)
        .transition().delay(200).duration(400).attr("opacity", 1);
    }
  });

  return chartId;
}

/* ------------------------------------------------------------------ */
/*   stackedBarFilter  (numeric + subgroup combined)                  */
/*   with fade-in animations                                         */
/* ------------------------------------------------------------------ */
export function stackedBarFilter(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. 리셋
  svg.selectAll(".filter-rect,.filter-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);
  svg.selectAll("rect")
     .attr("opacity", 1);

  // 1. 파라미터
  const field          = op.field          || "count";
  const satisfy        = op.satisfy        || ">=";
  const keyValue       = op.key;
  const subgroupField  = op.subgroupField  || null;
  const subgroupKey    = op.subgroupKey != null
                          ? String(op.subgroupKey)
                          : null;

  // 2. 비교 함수
  const cmp = {
    ">":  (v,k) => v  >  k,
    ">=": (v,k) => v >= k,
    "<":  (v,k) => v  <  k,
    "<=": (v,k) => v <= k,
    "==": (v,k) => v == k,
    "!=": (v,k) => v != k
  }[satisfy] || ((v,k) => v >= k);

  // 3. 하이라이트 색상
  const hl   = "#ffeb3b";
  const halo = "#ffffff";
  const pad  = 2;

  // 4. 강조할 카테고리 모음 (축 강조용)
  const highlightCats = new Set();

  // 5. 각 rect 에 대해
  svg.selectAll("rect").each(function() {
    const sel = d3.select(this);
    const d   = sel.datum();

    // 데이터 없는 rect 스킵
    if (!d || d.start == null || d.end == null) return;

    // subgroup 필터: 일치하지 않으면 디밍
    if (subgroupField && subgroupKey !== null) {
      const subVal = String(d[subgroupField] ?? d.subgroup);
      if (subVal !== subgroupKey) {
        sel.transition().duration(300).attr("opacity", 0.25);
        return;
      }
    }

    // numeric 필터: 불충족 시 디밍
    const value = d.end - d.start;
    if (op.field && !cmp(value, keyValue)) {
      sel.transition().duration(300).attr("opacity", 0.25);
      return;
    }

    // 두 조건 모두 만족하면 하이라이트
    const bbox = this.getBBox();

    // white halo outline (fade in)
    svg.append("rect")
       .attr("class", "filter-rect")
       .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
       .attr("width", bbox.width + pad*2)
       .attr("height", bbox.height + pad*2)
       .attr("fill", "none")
       .attr("stroke", halo)
       .attr("stroke-width", 4)
       .attr("pointer-events", "none")
       .attr("opacity", 0)
       .transition().duration(400).attr("opacity", 1);

    // yellow outline (fade in)
    svg.append("rect")
       .attr("class", "filter-rect")
       .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
       .attr("width", bbox.width + pad*2)
       .attr("height", bbox.height + pad*2)
       .attr("fill", "none")
       .attr("stroke", hl)
       .attr("stroke-width", 3)
       .attr("pointer-events", "none")
       .attr("opacity", 0)
       .transition().duration(400).attr("opacity", 1);

    // value label with black halo (fade in with delay)
    const isH = bbox.width > bbox.height;
    svg.append("text")
       .attr("class", "filter-label")
       .attr("x", isH ? bbox.x + bbox.width + 6 : bbox.x + bbox.width/2)
       .attr("y", isH ? bbox.y + bbox.height/2 : bbox.y - 6)
       .attr("fill", hl)
       .attr("font-size", "12px")
       .attr("font-weight", "bold")
       .attr("paint-order", "stroke")
       .attr("stroke", "#000")
       .attr("stroke-width", 3)
       .attr("dominant-baseline", isH ? "middle" : "auto")
       .attr("text-anchor", isH ? "start" : "middle")
       .text(value.toLocaleString())
       .attr("opacity", 0)
       .transition().delay(200).duration(400).attr("opacity", 1);

    // 축 강조용 카테고리 저장
    highlightCats.add(String(d.category));
  });

  // 6. x축 tick 강조 (fade in)
  svg.selectAll("g.tick").each(function(tickVal) {
    if (highlightCats.has(String(tickVal))) {
      d3.select(this).select("text")
        .attr("fill", hl)
        .attr("font-weight", "bold")
        .attr("opacity", 0)
        .transition().delay(300).duration(400).attr("opacity", 1);
    }
  });

  return chartId;
}


/* ------------------------------------------------------------------ */
/*   stackedBarFindExtremum  (rain 세그먼트만 필터 + 애니메이션)      */
/* ------------------------------------------------------------------ */
export function stackedBarFindExtremum(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. 이전 표시 제거
  svg.selectAll(".extremum-rect,.extremum-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);

  // 1. 파라미터
  const subgroupField = op.subgroupField;
  const subgroupKey   = op.subgroupKey != null ? String(op.subgroupKey) : null;
  const type          = (op.type || "max").toLowerCase();

  // 2. 모든 스택 세그먼트 수집 (rain만)
  const segments = [];
  svg.selectAll("rect").each(function() {
    const d = d3.select(this).datum();
    if (!d || d.start == null || d.end == null) return;
    // subgroup 필터링
    if (subgroupField && subgroupKey !== null) {
      const subVal = String(d[subgroupField] ?? d.subgroup);
      if (subVal !== subgroupKey) return;
    }
    segments.push({ datum: d, node: this, value: d.end - d.start });
  });
  if (!segments.length) return chartId;

  // 3. extremum 계산
  const extremumValue = (type === "min")
    ? d3.min(segments, s => s.value)
    : d3.max(segments, s => s.value);

  // 4. 스타일 설정
  const halo = "#ffffff";
  const hl   = "#ffeb3b";
  const pad  = 2;
  const highlightCats = new Set();

  // 5. 극값 세그먼트 강조 (fade-in)
  segments
    .filter(s => s.value === extremumValue)
    .forEach(s => {
      const { datum, node, value } = s;
      const bbox = node.getBBox();
      const isH = bbox.width > bbox.height;
      const labelX = isH
        ? bbox.x + bbox.width + 6
        : bbox.x + bbox.width / 2;
      const labelY = isH
        ? bbox.y + bbox.height / 2
        : bbox.y - 6;

      // 흰색 halo
      svg.append("rect")
         .attr("class", "extremum-rect")
         .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
         .attr("width", bbox.width + pad*2)
         .attr("height", bbox.height + pad*2)
         .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
         .attr("pointer-events", "none")
         .attr("opacity", 0)
         .transition().duration(400).attr("opacity", 1);

      // 노란색 outline
      svg.append("rect")
         .attr("class", "extremum-rect")
         .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
         .attr("width", bbox.width + pad*2)
         .attr("height", bbox.height + pad*2)
         .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
         .attr("pointer-events", "none")
         .attr("opacity", 0)
         .transition().delay(100).duration(400).attr("opacity", 1);

      // 값 라벨
      svg.append("text")
         .attr("class", "extremum-label")
         .attr("x", labelX).attr("y", labelY)
         .attr("fill", hl).attr("font-size", "12px").attr("font-weight", "bold")
         .attr("paint-order", "stroke").attr("stroke", "#000").attr("stroke-width", 3)
         .attr("dominant-baseline", isH ? "middle" : "auto")
         .attr("text-anchor", isH ? "start" : "middle")
         .text(`${type === "min" ? "MIN" : "MAX"} ${value.toLocaleString()}`)
         .attr("opacity", 0)
         .transition().delay(200).duration(400).attr("opacity", 1);

      highlightCats.add(String(datum.category));
    });

  // 6. x축 tick 강조 (fade-in)
  svg.selectAll("g.tick").each(function(t) {
    if (highlightCats.has(String(t))) {
      d3.select(this).select("text")
        .attr("fill", hl).attr("font-weight", "bold")
        .attr("opacity", 0)
        .transition().delay(300).duration(400).attr("opacity", 1);
    }
  });

  return chartId;
}

/* ------------------------------------------------------------------ */
/*   stackedBarCompare  (with animations)                            */
/*   Compare two segments (same subgroup)                             */
/* ------------------------------------------------------------------ */
export function stackedBarCompare(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. 이전 표시 제거
  svg.selectAll(".compare-rect,.compare-line,.compare-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null)
     .attr("opacity", 1);

  // 1. 파라미터
  const field          = op.field           || "count";
  const keyField       = op.keyField        || "month";
  const subgroupField  = op.subgroupField   || null;
  const subgroupKey    = op.subgroupKey     != null ? String(op.subgroupKey) : null;
  const leftKey        = op.left;
  const rightKey       = op.right;
  const operator       = (op.operator || "gt").toLowerCase();

  // 2. 타겟 세그먼트 찾기
  let leftRect = null, rightRect = null, leftDatum, rightDatum;
  svg.selectAll("rect").each(function() {
    const d = d3.select(this).datum();
    if (!d || d.start == null || d.end == null) return;
    const catVal = String(d[keyField] ?? d.category);
    const subVal = subgroupField ? String(d[subgroupField] ?? d.subgroup) : null;
    if (String(leftKey) === catVal && (!subgroupKey || subgroupKey === subVal)) {
      leftRect = d3.select(this); leftDatum = d;
    }
    if (String(rightKey) === catVal && (!subgroupKey || subgroupKey === subVal)) {
      rightRect = d3.select(this); rightDatum = d;
    }
  });
  if (!leftRect || !rightRect) {
    console.warn("stackedBarCompare: target not found");
    return chartId;
  }

  // 3. geometry & values
  const lbox = leftRect.node().getBBox();
  const rbox = rightRect.node().getBBox();
  const lval = leftDatum.end - leftDatum.start;
  const rval = rightDatum.end - rightDatum.start;

  // 4. 스타일
  const halo = "#ffffff", hl = "#ffeb3b", pad = 2;
  const midX = (lbox.x + rbox.x + rbox.width) / 2;
  const midY = Math.min(lbox.y + lbox.height/2, rbox.y + rbox.height/2) - 20;

  // 5. outlines fade‐in
  [lbox, rbox].forEach(bbox => {
    svg.append("rect")
       .attr("class", "compare-rect")
       .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
       .attr("width", bbox.width + pad*2).attr("height", bbox.height + pad*2)
       .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
       .attr("opacity", 0).transition().duration(400).attr("opacity", 1);
    svg.append("rect")
       .attr("class", "compare-rect")
       .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
       .attr("width", bbox.width + pad*2).attr("height", bbox.height + pad*2)
       .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
       .attr("opacity", 0).transition().delay(100).duration(400).attr("opacity", 1);
  });

  // 6. connecting line with stroke‐dash animation
  const x1 = lbox.x + lbox.width/2, y1 = lbox.y + lbox.height/2;
  const x2 = rbox.x + rbox.width/2, y2 = rbox.y + rbox.height/2;
  svg.append("line")
     .attr("class", "compare-line")
     .attr("x1", x1).attr("y1", y1)
     .attr("x2", x2).attr("y2", y2)
     .attr("stroke", hl).attr("stroke-width", 2)
     .attr("stroke-dasharray", function(){ const L=this.getTotalLength(); return `${L} ${L}` })
     .attr("stroke-dashoffset", function(){ return this.getTotalLength() })
     .transition().duration(600).attr("stroke-dashoffset", 0);

  // 7. value labels fade‐in
  [[x1,y1,lval], [x2,y2,rval]].forEach(([cx,cy,val], i) => {
    svg.append("text")
       .attr("class", "compare-label")
       .attr("x", cx + 6).attr("y", cy - 6)
       .attr("fill", hl).attr("font-size", "12px").attr("font-weight", "bold")
       .attr("paint-order", "stroke").attr("stroke", "#000").attr("stroke-width", 3)
       .attr("text-anchor", "start").attr("dominant-baseline", "middle")
       .text(val.toLocaleString())
       .attr("opacity", 0)
       .transition().delay(200 + i*100).duration(400).attr("opacity", 1);
  });

  // 8. comparison result label fade‐in
  const cmpFns = { gt:(a,b)=>a>b, lt:(a,b)=>a<b, gte:(a,b)=>a>=b, lte:(a,b)=>a<=b, eq:(a,b)=>a===b, neq:(a,b)=>a!==b };
  const cmpSyms = { gt:">", lt:"<", gte:"≥", lte:"≤", eq:"=", neq:"≠" };
  const sym = cmpSyms[operator] || ">";
  const ok  = cmpFns[operator](lval,rval) ? "✓" : "✗";
  const delta = lval - rval;

  svg.append("text")
     .attr("class", "compare-label")
     .attr("x", midX).attr("y", midY)
     .attr("fill", hl).attr("font-size", "13px").attr("font-weight", "bold")
     .attr("text-anchor", "middle")
     .text(`${leftKey} ${sym} ${rightKey} ${ok}`)
     .attr("opacity", 0).transition().delay(300).duration(400).attr("opacity", 1);

  svg.append("text")
     .attr("class", "compare-label")
     .attr("x", midX).attr("y", midY + 16)
     .attr("fill", hl).attr("font-size", "12px")
     .attr("text-anchor", "middle")
     .text(`Δ ${delta.toLocaleString()}`)
     .attr("opacity", 0).transition().delay(350).duration(400).attr("opacity", 1);

  // 9. x-axis tick 강조 fade‐in
  const ticks = new Set([String(leftKey), String(rightKey)]);
  svg.selectAll("g.tick").each(function(t) {
    if (ticks.has(String(t))) {
      d3.select(this).select("text")
        .attr("fill", hl).attr("font-weight", "bold")
        .attr("opacity", 0).transition().delay(400).duration(400).attr("opacity", 1);
    }
  });

  return chartId;
}





export function stackedBarDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId} svg:last-of-type`);
  if (svg.empty()) return chartId;

  const subgroupField = op.subgroupField;
  const subgroupKey   = String(op.subgroupKey);
  if (!subgroupField || !subgroupKey) {
    console.warn("subgroupField/subgroupKey required");
    return chartId;
  }

  // dims & margins
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 20, right: 30, bottom: 30, left: 50 };

  // 1) collect every bar segment
  const allSegs = [];
  svg.selectAll("rect").each(function() {
    const d = d3.select(this).datum();
    if (d && d.start != null && d.end != null) {
      allSegs.push({
        node:     this,
        category: String(d.category),
        subgroup: String(d[subgroupField] ?? d.subgroup),
        value:    d.end - d.start
      });
    }
  });

  // 2) filter to just your season
  const rainSegs = allSegs.filter(s => s.subgroup === subgroupKey);
  if (!rainSegs.length) {
    console.warn("no segments matched", subgroupKey);
    return chartId;
  }

  // 3) compute new scales
  const months    = Array.from(new Set(rainSegs.map(s => s.category)));
  const xNewScale = d3.scaleBand()
                      .domain(months)
                      .range([margin.left, width - margin.right])
                      .padding(0.1);
  const maxVal    = d3.max(rainSegs, s => s.value);
  const yNewScale = d3.scaleLinear()
                      .domain([0, maxVal]).nice()
                      .range([height - margin.bottom, margin.top]);

  // 4) fade out non-rain bars
  svg.selectAll("rect")
     .transition().duration(800)
     .attr("opacity", d => (d && String(d[subgroupField] ?? d.subgroup) === subgroupKey) ? 1 : 0)
     .on("end", function(d) {
       if (!(d && String(d[subgroupField] ?? d.subgroup) === subgroupKey)) {
         d3.select(this).remove();
       }
     });

  // 5) after fade completes, reflow axes + rain bars
  svg.transition().delay(800).duration(0).on("end", () => {
    // remove old axes
    svg.selectAll("g")
       .filter(function() {
         const t = d3.select(this).attr("transform") || "";
         return t.startsWith("translate(0,"); // x-axis
       })
       .remove();

    svg.selectAll("g")
       .filter(function() {
         const t = d3.select(this).attr("transform") || "";
         return t.startsWith("translate(") && t.includes(",0)"); // y-axis
       })
       .remove();

    // 5a) draw new axes (invisibly)
    const xG = svg.append("g")
                  .attr("transform", `translate(0,${height - margin.bottom})`)
                  .attr("opacity", 0)
                  .call(d3.axisBottom(xNewScale));
    const yG = svg.append("g")
                  .attr("transform", `translate(${margin.left},0)`)
                  .attr("opacity", 0)
                  .call(d3.axisLeft(yNewScale));

    xG.transition().duration(500).attr("opacity", 1);
    yG.transition().duration(500).attr("opacity", 1);

    // 5b) reposition each rain bar
    rainSegs.forEach((s, i) => {
      const sel = d3.select(s.node);
      const newX = xNewScale(s.category);
      const newY = yNewScale(s.value);
      const newH = height - margin.bottom - newY;

      sel.transition()
         .delay(300)
         .duration(600)
         .attr("x", newX)
         .attr("width", xNewScale.bandwidth())
         .attr("y", newY)
         .attr("height", newH);
    });
  });

  // 6) draw range lines + Δ once bars settled
  const hl   = "#ffeb3b", halo = "#ffffff";
  const pad  = 2;
  const xPos = width - margin.right + 10;
  const yMin = yNewScale(0);
  const yMax = yNewScale(maxVal);
  const delta= maxVal;

  // schedule after all bars have moved
  setTimeout(() => {
    [yMax, yMin].forEach(yPos => {
      // white halo
      svg.append("line")
         .attr("class","range-line")
         .attr("x1", margin.left).attr("x2", margin.left)
         .attr("y1", yPos).attr("y2", yPos)
         .attr("stroke", halo).attr("stroke-width", 4)
         .attr("pointer-events","none")
         .transition().duration(600).attr("x2", width - margin.right);

      // yellow line
      svg.append("line")
         .attr("class","range-line")
         .attr("x1", margin.left).attr("x2", margin.left)
         .attr("y1", yPos).attr("y2", yPos)
         .attr("stroke", hl).attr("stroke-width", 2)
         .attr("pointer-events","none")
         .transition().duration(600).attr("x2", width - margin.right);
    });

    // Δ vertical
    svg.append("line")
       .attr("class","range-line")
       .attr("x1", xPos).attr("x2", xPos)
       .attr("y1", yMin).attr("y2", yMin)
       .attr("stroke", hl).attr("stroke-width", 2)
       .attr("pointer-events","none")
       .transition().duration(600).attr("y2", yMax);

    // Δ label
    svg.append("text")
       .attr("class","delta-label")
       .attr("x", xPos+6).attr("y", yMin)
       .attr("fill", hl).attr("font-size","12px").attr("font-weight","bold")
       .attr("dominant-baseline","middle")
       .attr("opacity",0)
       .text(`Δ ${delta.toLocaleString()}`)
       .transition().delay(600).duration(400)
       .attr("y",(yMin+yMax)/2).attr("opacity",1);

    // highlight new x-ticks
    svg.selectAll("g.tick text")
       .attr("fill", hl).attr("font-weight", "bold");
  }, 1600);

  return chartId;
}


/* ------------------------------------------------------------------ */
/*   stackedBarSort – animated sort & reflow (bars anchored to x-axis)*/
/* ------------------------------------------------------------------ */
export function stackedBarSort(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
  if (svg.empty()) return chartId;

  // 0. parameters
  const order         = (op.order || "ascending").toLowerCase();
  const limit         = op.limit != null ? +op.limit : null;
  const subgroupField = op.subgroupField || null;
  const subgroupKey   = op.subgroupKey   != null
                         ? String(op.subgroupKey)
                         : null;

  // 1. dimensions
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 20, right: 30, bottom: 50, left: 60 };

  // 2. collect only data-bound bars
  const bars = svg.selectAll("rect")
    .filter(d => d && d.start != null && d.end != null);

  // 3. extract segments for later outline
  const segs = [];
  bars.each(function(d) {
    segs.push({
      node:     this,
      category: String(d.category),
      subgroup: String(d[subgroupField] ?? d.subgroup),
      value:    d.end - d.start
    });
  });

  // 4. compute per-category sums (optionally subgroup-only)
  const sums = new Map();
  segs.forEach(s => {
    if (subgroupField && subgroupKey && s.subgroup !== subgroupKey) return;
    sums.set(s.category, (sums.get(s.category) || 0) + s.value);
  });

  // 5. sort categories
  const sortedCats = Array.from(sums.entries())
    .sort((a, b) =>
      order === "ascending" ? a[1] - b[1] : b[1] - a[1]
    )
    .map(([cat]) => cat);

  // 6. new scales
  const xNew = d3.scaleBand()
    .domain(sortedCats)
    .range([margin.left, width - margin.right])
    .padding(0.1);

  const yMax = d3.max(sortedCats.map(c => sums.get(c)));
  const yNew = d3.scaleLinear()
    .domain([0, yMax]).nice()
    .range([height - margin.bottom, margin.top]);

  // 7. fade out non-subgroup bars (0–500ms)
  bars.transition().duration(500)
      .attr("opacity", d => {
        if (subgroupField && subgroupKey) {
          return String(d[subgroupField] ?? d.subgroup) === subgroupKey ? 1 : 0;
        }
        return 1;
      });

  // 8. slide & re-anchor bars (500–1500ms)
  bars.transition().delay(500).duration(1000)
      .attr("x", d => xNew(String(d.category)))
      .attr("width", xNew.bandwidth())
      .attr("y", d => yNew(d.end - d.start))
      .attr("height", d => (height - margin.bottom) - yNew(d.end - d.start));

  // 9. fade out old axes & legend (1500–1800ms)
  svg.selectAll("g")
     .transition().delay(1500).duration(300)
     .attr("opacity", 0)
     .remove();

  // 10. draw new axes (1800–2300ms)
  setTimeout(() => {
    // x-axis
    svg.append("g")
       .attr("class", "sorted-x-axis")
       .attr("transform", `translate(0,${height - margin.bottom})`)
       .attr("opacity", 0)
       .call(d3.axisBottom(xNew))
       .transition().duration(500).attr("opacity", 1);

    // y-axis
    svg.append("g")
       .attr("class", "sorted-y-axis")
       .attr("transform", `translate(${margin.left},0)`)
       .attr("opacity", 0)
       .call(d3.axisLeft(yNew))
       .transition().duration(500).attr("opacity", 1);
  }, 1800);

  // 11. highlight top-N (2300–2800ms)
  if (limit != null) {
    setTimeout(() => {
      const topCats = sortedCats.slice(0, limit);
      const hl   = "#ffeb3b", halo = "#ffffff", pad = 2;
      segs.forEach(s => {
        if (topCats.includes(s.category) &&
            (!subgroupField || s.subgroup === subgroupKey)) {
          const bbox = d3.select(s.node).node().getBBox();
          // white halo
          svg.append("rect")
             .attr("class", "sort-outline")
             .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
             .attr("width", bbox.width + pad*2)
             .attr("height", bbox.height + pad*2)
             .attr("fill", "none")
             .attr("stroke", halo)
             .attr("stroke-width", 4)
             .attr("opacity", 0)
             .transition().duration(400).attr("opacity", 1).raise();
          // yellow outline
          svg.append("rect")
             .attr("class", "sort-outline")
             .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
             .attr("width", bbox.width + pad*2)
             .attr("height", bbox.height + pad*2)
             .attr("fill", "none")
             .attr("stroke", hl)
             .attr("stroke-width", 3)
             .attr("opacity", 0)
             .transition().duration(400).attr("opacity", 1).raise();
        }
      });
    }, 2300);
  }

  return chartId;
}
