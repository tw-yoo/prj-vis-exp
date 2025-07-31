// ── simpleLineFunctions.js ────────────────────────────────────────────────
export function simpleLineRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;       

  const hlColor   = "#ff6961";
  const origColor = "#69b3a2";
  const duration  = 600;


  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top")  || 0;


  const points = svg.selectAll("circle.point");

  points
    .interrupt()
    .attr("fill", origColor)
    .attr("stroke", "none")
    .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  const target = points.filter(function () {
    return d3.select(this).attr("data-id") === String(op.key);
  });


  target
    .transition()
    .duration(duration)
    .attr("fill", hlColor)
    .attr("stroke", "black")
    .attr("stroke-width", 2);

  const n = target.node();
  if (n) {
    const x = +n.getAttribute("cx") + marginL;
    const y = +n.getAttribute("cy") - 8 + marginT;   
    const val = n.getAttribute("data-value");

    svg.append("text")
       .attr("class", "annotation")
       .attr("x", x)
       .attr("y", y)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .attr("fill", hlColor)
       .text(val);
  }

  return chartId;
}


export function simpleLineFilter(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const points = svg.selectAll("circle.point");
  if (points.empty()) return chartId;

  const duration   = 600;
  const matchColor = "#ffa500";   
  const origColor  = "#69b3a2";  
  const dimOpacity = 0.15;       


  points
    .interrupt()
    .attr("fill", origColor)
    .attr("opacity", 1)
    .attr("stroke", "none");
  svg.selectAll(".annotation, .filter-label").remove();

  const satisfy = {
    ">" : (a, b) => a >  b,
    ">=": (a, b) => a >= b,
    "<" : (a, b) => a <  b,
    "<=": (a, b) => a <= b,
    "==": (a, b) => a === b,
  }[op.satisfy] ?? (() => true);


  points.each(function () {
    const sel  = d3.select(this);
    const val  = +sel.attr("data-value");
    const pass = satisfy(val, op.key);

    sel.transition()
       .duration(duration)
       .attr("fill", pass ? matchColor : origColor)
       .attr("opacity", pass ? 1 : dimOpacity);
  });

  svg.append("text")
     .attr("class", "filter-label")
     .attr("x", 8)
     .attr("y", 14)
     .attr("font-size", 12)
     .attr("fill", matchColor)
     .text(`Filter: value ${op.satisfy} ${op.key}`);

  return chartId;
}

export function simpleLineFindExtremum(chartId, op) {
  console.log("[findExtremum] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const duration  = 600;
  const hlColor   = "#a65dfb";
  const origColor = "#69b3a2";
  const marginL   = +svg.attr("data-m-left") || 0;
  const marginT   = +svg.attr("data-m-top")  || 0;

  const points = svg.selectAll("circle.point");
  if (points.empty()) return chartId;

  points
    .interrupt()
    .attr("fill", origColor)
    .attr("stroke", "none")
    .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  const field = op.field || "value";         
  const getVal = el => {
    const row = d3.select(el).datum();
    return field in row ? +row[field] : +el.getAttribute("data-value");
  };

  const vals = points.nodes().map(getVal);
  const idx  = op.type === "min"
               ? vals.indexOf(d3.min(vals))
               : vals.indexOf(d3.max(vals));
  if (idx === -1) {
    console.warn("findExtremum: target not found");
    return chartId;
  }

  const extremeVal = vals[idx];
  const target     = points.filter((d, i) => i === idx);

  target
    .transition()
    .duration(duration)
    .attr("fill", hlColor)
    .attr("stroke", "black")
    .attr("stroke-width", 2);

  const n = target.node();
  if (n) {
    const x     = +n.getAttribute("cx") + marginL;
    const y     = +n.getAttribute("cy") - 8 + marginT;
    const label = `${op.type === "min" ? "Min" : "Max"}: ${extremeVal}`;

    svg.append("text")
       .attr("class", "annotation")
       .attr("x", x)
       .attr("y", y)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .attr("fill", hlColor)
       .text(label);
  }

  return chartId;
}

// ▼ 기존 simpleLineDetermineRange 함수 자리에 교체 ▼
export function simpleLineDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const marginL = +svg.attr("data-m-left")  || 0;
  const marginT = +svg.attr("data-m-top")   || 0;
  const plotW   = +svg.attr("data-plot-w")  || 0;

  // 이미 찍혀 있는 circle 들을 그대로 활용
  const pts   = svg.selectAll("circle.point");
  const nodes = pts.nodes();
  const vals  = nodes.map(el => +el.getAttribute("data-value"));

  if (!vals.length) return chartId;           // 포인트 없으면 종료

  const minVal = d3.min(vals);
  const maxVal = d3.max(vals);
  const diff   = +(maxVal - minVal).toFixed(3);

  const minIdx  = vals.indexOf(minVal);
  const maxIdx  = vals.indexOf(maxVal);
  const minNode = nodes[minIdx];
  const maxNode = nodes[maxIdx];

  const yMinAbs = +minNode.getAttribute("cy");
  const yMaxAbs = +maxNode.getAttribute("cy");

  // 같은 값일 때 보정
  if (yMinAbs === yMaxAbs) yMaxAbs -= 0.01;

  const xVert   = marginL + plotW + 10;

  // 초기화
  pts.attr("fill", "#69b3a2").attr("stroke", "none");
  svg.selectAll(".range-line, .delta-label, .annotation").remove();

  // 수평선 2개
  [yMinAbs, yMaxAbs].forEach(y =>
    svg.append("line")
       .attr("class", "range-line")
       .attr("x1", marginL)
       .attr("x2", marginL + plotW)
       .attr("y1", y)
       .attr("y2", y)
       .attr("stroke", "#ffb74d")
       .attr("stroke-width", 2)
       .attr("stroke-dasharray", "4 4")
  );

  // 수직 Δ 선
  svg.append("line")
     .attr("class", "range-line")
     .attr("x1", xVert)
     .attr("x2", xVert)
     .attr("y1", yMinAbs)
     .attr("y2", yMaxAbs)
     .attr("stroke", "#ffb74d")
     .attr("stroke-width", 2)
     .attr("stroke-dasharray", "4 4");

  // Δ 라벨
  svg.append("text")
     .attr("class", "delta-label")
     .attr("x", xVert + 5)
     .attr("y", (yMinAbs + yMaxAbs) / 2)
     .attr("dominant-baseline", "middle")
     .attr("font-size", 12)
     .attr("fill", "#ffb74d")
     .text(`Δ ${diff}`);

  // 최대·최소 강조 + 값 라벨
  [[minIdx, minVal, yMinAbs], [maxIdx, maxVal, yMaxAbs]].forEach(
    ([i, v, y]) => {
      const pt = pts.filter((d, idx) => idx === i).attr("fill", "#ffb74d");
      const x  = +pt.node().getAttribute("cx");

      svg.append("text")
         .attr("class", "annotation")
         .attr("x", x)
         .attr("y", y - 8)
         .attr("text-anchor", "middle")
         .attr("font-size", 12)
         .attr("fill", "#ffb74d")
         .text(v);
    }
  );

  return chartId;
}


export function simpleLineCompare(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const pts = svg.selectAll("circle.point");
  if (pts.empty()) return chartId;

  const origColor = "#69b3a2";
  pts.interrupt().attr("fill", origColor).attr("stroke", "none");
  svg.selectAll(".compare-label, .value-tag").remove();

  const cmp = {
    gt: (a, b) => a >  b,
    gte:(a, b) => a >= b,
    lt: (a, b) => a <  b,
    lte:(a, b) => a <= b,
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
  }[op.operator];
  if (!cmp) return chartId;

  const sample = pts.datum();
  const isField = v => typeof v === "string" && v in sample;
  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top")  || 0;

  if (!isField(op.left) && !isField(op.right)) {
    const sel = id => pts.filter(function () {
      return d3.select(this).attr("data-id") === String(id);
    });

    const leftPt  = sel(op.left);
    const rightPt = sel(op.right);
    if (leftPt.empty() || rightPt.empty()) return chartId;

    const lv = +leftPt.attr("data-value");
    const rv = +rightPt.attr("data-value");
    const ok = cmp(lv, rv);

    highlight(leftPt,  lv, "#ffb74d");
    highlight(rightPt, rv, "#64b5f6");
    headText(ok, op.left, op.operator, op.right);
    return chartId;
  }

  const getVal = (row, v) => isField(v) ? row[v] : v;
  const row = sample;
  const lv  = getVal(row, op.left);
  const rv  = getVal(row, op.right);
  const ok  = cmp(+lv, +rv);
  headText(ok, op.left, op.operator, op.right);
  return chartId;

  function highlight(sel, value, color) {
    sel.attr("fill", color).attr("stroke", "black");
    const n = sel.node();
    const x = +n.getAttribute("cx") + marginL;
    const y = +n.getAttribute("cy") - 8 + marginT;
    svg.append("text")
       .attr("class", "value-tag")
       .attr("x", x)
       .attr("y", y)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .attr("fill", color)
       .text(value);
  }

  function headText(ok, lKey, oper, rKey) {
    const center = marginL + (+svg.attr("data-plot-w") || 0) / 2;
    const sym = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", ne: "≠" }[oper] || oper;
    svg.append("text")
       .attr("class", "compare-label")
       .attr("x", center)
       .attr("y", 18)
       .attr("text-anchor", "middle")
       .attr("font-size", 13)
       .attr("font-weight", "bold")
       .attr("fill", ok ? "#2e7d32" : "#c62828")
       .text(`${lKey} ${sym} ${rKey} → ${ok}`);
  }
}


export function simpleLineSort(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const marginL  = +svg.attr("data-m-left")  || 0;
  const marginT  = +svg.attr("data-m-top")   || 0;
  const plotW    = +svg.attr("data-plot-w")  || 0;
  const duration = 600;

  const xField = svg.attr("data-x-field");
  const yField = svg.attr("data-y-field");

  const pts = svg.selectAll("circle.point");
  if (pts.empty()) return chartId;

  const origColor = "#69b3a2";
  const hlColor   = "#ffa500";
  pts.interrupt().attr("fill", origColor).attr("stroke", "none");
  svg.selectAll(".value-tag,.sort-label").remove();

  const field = op.field;
  const orderFn = op.order === "descending" ? d3.descending : d3.ascending;
  const limit = op.limit > 0 ? Math.min(op.limit, pts.size()) : pts.size();

  const arr = pts.nodes().map(el => {
    const datum = d3.select(el).datum();
    const id    = d3.select(el).attr("data-id");
    const value = +d3.select(el).attr("data-value");
    return { el, datum, id, value };
  });

  const sorted  = arr.sort((a, b) => orderFn(a.value, b.value));
  const limited = sorted.slice(0, limit);

const xScale = d3.scalePoint()
                 .domain(sorted.map(d => +d.id))  
                 .range([0, plotW])
                 .padding(0.5);

const lineGen = d3.line()
                  .x(d => xScale(+d[xField]))    
                  .y(d => yScale(+d[yField]));

  sorted.forEach(item => {
    d3.select(item.el)
      .transition()
        .duration(duration)
        .attr("cx", xScale(item.id))
      .transition()
        .duration(duration / 2)
        .attr("fill", limited.includes(item) ? hlColor : origColor);
  });


  const yScale = d3.scaleLinear()
                   .domain([0, +svg.attr("data-y-domain-max")])
                   .range([+svg.attr("data-plot-h"), 0]);



  svg.select("path.main-line")
     .datum(sorted.map(d => d.datum))
     .transition()
       .duration(duration)
       .attr("d", lineGen);

  limited.forEach(item => {
    svg.append("text")
       .attr("class", "value-tag")
       .attr("x", xScale(item.id) + marginL)
       .attr("y", +item.el.getAttribute("cy") - 8 + marginT)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .text(item.value);
  });

  svg.append("text")
     .attr("class", "sort-label")
     .attr("x", marginL)
     .attr("y", marginT - 15)
     .attr("font-size", 12)
     .attr("fill", hlColor)
     .text(`Sort: ${field} ${op.order}` + (op.limit ? `, limit ${limit}` : ""));

  return chartId;
}

