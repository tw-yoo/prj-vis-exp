// ── simpleLineFunctions.js ────────────────────────────────────────────────
export function simpleLineRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;        // 안전장치

  const hlColor   = "#ff6961";
  const origColor = "#69b3a2";
  const duration  = 600;

  // ── margin 값(라벨 좌표용)
  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top")  || 0;

  // ── 대상 selection : circle.point
  const points = svg.selectAll("circle.point");

  /* 초기화 */
  points
    .interrupt()
    .attr("fill", origColor)
    .attr("stroke", "none")
    .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  /* key 매칭 */
  const target = points.filter(function () {
    return d3.select(this).attr("data-id") === String(op.key);
  });

  /* 하이라이트 애니메이션 */
  target
    .transition()
    .duration(duration)
    .attr("fill", hlColor)
    .attr("stroke", "black")
    .attr("stroke-width", 2);

  /* 라벨(값) 그리기 */
  const n = target.node();
  if (n) {
    const x = +n.getAttribute("cx") + marginL;
    const y = +n.getAttribute("cy") - 8 + marginT;   // 점 위에 8px 띄우기
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
  const matchColor = "#ffa500";   // 조건 충족 점
  const origColor  = "#69b3a2";   // 기본 색
  const dimOpacity = 0.15;        // 조건 불충족 점 투명도

  /* ── 초기화 ─────────────────────────────────────────── */
  points
    .interrupt()
    .attr("fill", origColor)
    .attr("opacity", 1)
    .attr("stroke", "none");
  svg.selectAll(".annotation, .filter-label").remove();

  /* ── 비교 연산자 매핑 -------------------------------- */
  const satisfy = {
    ">" : (a, b) => a >  b,
    ">=": (a, b) => a >= b,
    "<" : (a, b) => a <  b,
    "<=": (a, b) => a <= b,
    "==": (a, b) => a === b,
  }[op.satisfy] ?? (() => true);

  /* ── 애니메이션 ------------------------------------- */
  points.each(function () {
    const sel  = d3.select(this);
    const val  = +sel.attr("data-value");
    const pass = satisfy(val, op.key);

    sel.transition()
       .duration(duration)
       .attr("fill", pass ? matchColor : origColor)
       .attr("opacity", pass ? 1 : dimOpacity);
  });

  /* ── 화면 좌상단 필터 정보 라벨 ----------------------- */
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

  /* ── 준비 ------------------------------------------------------ */
  const duration  = 600;
  const hlColor   = "#a65dfb";
  const origColor = "#69b3a2";
  const marginL   = +svg.attr("data-m-left") || 0;
  const marginT   = +svg.attr("data-m-top")  || 0;

  const points = svg.selectAll("circle.point");
  if (points.empty()) return chartId;

  /* ── 초기화 ---------------------------------------------------- */
  points
    .interrupt()
    .attr("fill", origColor)
    .attr("stroke", "none")
    .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  /* ── 값 배열 & 극값 인덱스 탐색 -------------------------------- */
  const field = op.field || "value";          // 기본 'value'
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

  /* ── 하이라이트 애니메이션 ------------------------------------ */
  target
    .transition()
    .duration(duration)
    .attr("fill", hlColor)
    .attr("stroke", "black")
    .attr("stroke-width", 2);

  /* ── 라벨(annotation) ----------------------------------------- */
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

export function simpleLineDetermineRange(chartId, op) { /* TODO */ }
export function simpleLineCompare(chartId, op)        { /* TODO */ }
export function simpleLineSort(chartId, op)           { /* TODO */ }
