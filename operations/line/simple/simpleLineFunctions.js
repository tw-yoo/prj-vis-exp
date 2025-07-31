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

  /* ── 초기화 ─────────────────────────── */
  pts.interrupt().attr("fill", "#69b3a2").attr("stroke", "none");
  svg.selectAll(".compare-label, .value-tag").remove();

  /* ── 연산자 매핑 ────────────────────── */
  const oper = String(op.operator || op.op || "").trim();
  const cmp = {
    ">":  (a, b) => a >  b,  gt:  (a, b) => a >  b,
    ">=": (a, b) => a >= b,  gte: (a, b) => a >= b,
    "<":  (a, b) => a <  b,  lt:  (a, b) => a <  b,
    "<=": (a, b) => a <= b,  lte: (a, b) => a <= b,
    "==": (a, b) => a === b, "=":  (a, b) => a === b,  eq: (a, b) => a === b,
    "!=": (a, b) => a !== b, ne:  (a, b) => a !== b,
  }[oper];
  if (!cmp) {
    console.warn(`simpleLineCompare: unsupported operator "${oper}"`);
    return chartId;
  }

  /* ── 헬퍼 ───────────────────────────── */
  const marginL = +svg.attr("data-m-left") || 0;
  const plotW   = +svg.attr("data-plot-w") || 0;
  const sample  = pts.datum() || {};
  const isField = v => typeof v === "string" && v in sample;
  const num     = v => +v;

  const headLabel = (ok, l, o, r) => {
    const sym = { gt: ">", gte: "≥", lt: "<", lte: "≤",
                  eq: "=", ne: "≠", ">": ">", ">=": "≥",
                  "<": "<", "<=": "≤", "==": "=", "=": "=", "!=": "≠" }[o] || o;
    svg.append("text")
       .attr("class", "compare-label")
       .attr("x", marginL + plotW / 2)
       .attr("y", 18)
       .attr("text-anchor", "middle")
       .attr("font-size", 13)
       .attr("font-weight", "bold")
       .attr("fill", ok ? "#2e7d32" : "#c62828")
       .text(`${l} ${sym} ${r} → ${ok}`);
  };

  const highlight = (sel, val, color) => {
    sel.attr("fill", color).attr("stroke", "black");
    const n = sel.node();
    svg.append("text")
       .attr("class", "value-tag")
       .attr("x", +n.getAttribute("cx"))
       .attr("y", +n.getAttribute("cy") - 8)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .attr("fill", color)
       .text(val);
  };

  /* ── Case 1: 포인트 id vs id ───────── */
  if (!isField(op.left) && !isField(op.right)) {
    const selById = id => pts.filter(function () {
      return d3.select(this).attr("data-id") === String(id);
    });
    const leftPt  = selById(op.left);
    const rightPt = selById(op.right);
    if (leftPt.empty() || rightPt.empty()) {
      console.warn("simpleLineCompare: point id not found", op.left, op.right);
      return chartId;
    }

    const lv = num(leftPt.attr("data-value"));
    const rv = num(rightPt.attr("data-value"));
    const ok = cmp(lv, rv);

    highlight(leftPt,  lv, "#ffb74d");
    highlight(rightPt, rv, "#64b5f6");
    headLabel(ok, op.left, oper, op.right);
    return chartId;
  }

  /* ── Case 2: 필드·상수 비교 ────────── */
  const lv = isField(op.left)  ? num(sample[op.left])  : num(op.left);
  const rv = isField(op.right) ? num(sample[op.right]) : num(op.right);
  const ok = cmp(lv, rv);

  headLabel(ok, op.left, oper, op.right);
  return chartId;
}



export function simpleLineSort(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const marginL  = +svg.attr("data-m-left")  || 0;
  const marginT  = +svg.attr("data-m-top")   || 0;
  const plotW    = +svg.attr("data-plot-w")  || 0;
  const plotH    = +svg.attr("data-plot-h")  || 0;
  const yMax     = +svg.attr("data-y-domain-max");
  const duration = 600;

  const pts = svg.selectAll("circle.point");
  if (pts.empty()) return chartId;

  /* ── 초기화 ───────────────────────── */
  const origColor = "#69b3a2";
  const hlColor   = "#ffa500";
  pts.interrupt().attr("fill", origColor).attr("stroke", "none");
  svg.selectAll(".value-tag,.sort-label, path.sorted-line").remove();

  /* ── 정렬 배열 만들기 ─────────────── */
  const dataArr = pts.nodes().map(el => {
    const s = d3.select(el);
    return { el, id: s.attr("data-id"), value: +s.attr("data-value") };
  });
  const orderFn = op.order === "descending" ? d3.descending : d3.ascending;
  dataArr.sort((a, b) => orderFn(a.value, b.value));

  const limit  = op.limit > 0 ? Math.min(op.limit, dataArr.length) : dataArr.length;
  const topSet = new Set(dataArr.slice(0, limit).map(d => d.id));

  /* ── 스케일 ───────────────────────── */
  const xScale = d3.scalePoint()
                   .domain(dataArr.map(d => d.id))
                   .range([marginL, marginL + plotW])
                   .padding(0.5);

  const yScale = d3.scaleLinear()
                   .domain([0, yMax])
                   .range([marginT + plotH, marginT]);

  /* ── 점 이동 + 하이라이트 ─────────── */
  dataArr.forEach(d =>
    d3.select(d.el)
      .transition().duration(duration)
      .attr("cx", xScale(d.id))
      .attr("fill", topSet.has(d.id) ? hlColor : origColor)
  );

  /* ── 값 라벨 (상위 limit) ─────────── */
  dataArr.slice(0, limit).forEach(d =>
    svg.append("text")
       .attr("class", "value-tag")
       .attr("x", xScale(d.id))
       .attr("y", +d.el.getAttribute("cy") - 8)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .text(d.value)
  );

  /* ── 기존 선 제거 ─────────────────── */
  svg.selectAll("path.series-line").remove();

  /* ── x-축 갱신 ────────────────────── */
  let xAxis = svg.select(".x-axis");
  if (xAxis.empty())
    xAxis = svg.append("g")
               .attr("class", "x-axis")
               .attr("transform", `translate(0,${marginT + plotH})`);
  xAxis.transition().duration(duration).call(d3.axisBottom(xScale));

  /* ── 점 이동이 끝난 뒤 정확 좌표로 새 선 그리기 ── */
  d3.timeout(() => {
    // circle 의 실제 cx, cy 좌표를 읽어 line 을 그림
    const lineData = dataArr.map(d => ({
      x: +d.el.getAttribute("cx"),
      y: +d.el.getAttribute("cy")
    }));

    const lineGen = d3.line()
                      .x(d => d.x)
                      .y(d => d.y);

    svg.append("path")
       .datum(lineData)
       .attr("class", "sorted-line")
       .attr("fill", "none")
       .attr("stroke", "#1976d2")
       .attr("stroke-width", 2)
       .attr("d", lineGen)
       .attr("stroke-dasharray", function () {
         const L = this.getTotalLength();
         return `${L} ${L}`;
       })
       .attr("stroke-dashoffset", function () { return this.getTotalLength(); })
       .transition()
         .duration(duration)
         .attr("stroke-dashoffset", 0);
  }, duration);  // ← 점 이동과 동일한 시간만큼 기다림

  /* ── 헤더 라벨 ───────────────────── */
  svg.append("text")
     .attr("class", "sort-label")
     .attr("x", marginL)
     .attr("y", marginT - 15)
     .attr("font-size", 12)
     .attr("fill", hlColor)
     .text(`Sort: value ${op.order}${op.limit ? `, limit ${limit}` : ""}`);

  return chartId;
}
