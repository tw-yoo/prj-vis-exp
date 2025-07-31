/* simpleLineFunctions.js ────────────────────────────────────────── */
export async function simpleLineRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  // 0. 기존 artefacts 제거
  svg.selectAll(".retrieval-line,.retrieval-point,.retrieval-label").remove();

  /* 1. 모든 path에서 datum 수집 */
  let allSeries = [];
  svg.selectAll("path").each(function (d) {
    if (d && Array.isArray(d)) allSeries = allSeries.concat(d);
  });
  if (!allSeries.length) {
    console.warn("simpleLineRetrieveValue: no datum bound to line paths");
    return chartId;
  }

  /* 2. 파라미터 */
  const keyField = op.keyField;
  const yField   = op.field;
  const keyValue = op.key;

  const target = allSeries.find(d => {
    const k = d[keyField];
    return k instanceof Date
      ? k.getFullYear() === +keyValue
      : k == keyValue;
  });
  if (!target) {
    console.warn("Key not found:", keyValue);
    return chartId;
  }

  /* 3. 스케일 재생성 (렌더와 동일) */
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  const xVals = allSeries.map(d => d[keyField]);
  const yVals = allSeries.map(d => d[yField]);
  const isTemporal = xVals[0] instanceof Date;

  const xScale = isTemporal
    ? d3.scaleTime().domain(d3.extent(xVals)).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(xVals)]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(yVals)]).nice()
    .range([height - margin.bottom, margin.top]);

  const cx = xScale(target[keyField]);
  const cy = yScale(target[yField]);

  /* 4. 시각 표시 */
  svg.append("line")
     .attr("class", "retrieval-line")
     .attr("x1", cx).attr("x2", cx)
     .attr("y1", cy).attr("y2", height - margin.bottom)
     .attr("stroke", "#ffa500").attr("stroke-width", 1.5)
     .attr("stroke-dasharray", "4 2");

  svg.append("line")
     .attr("class", "retrieval-line")
     .attr("x1", margin.left).attr("x2", cx)
     .attr("y1", cy).attr("y2", cy)
     .attr("stroke", "#ffa500").attr("stroke-width", 1.5)
     .attr("stroke-dasharray", "4 2");

  svg.append("circle")
     .attr("class", "retrieval-point")
     .attr("cx", cx).attr("cy", cy).attr("r", 6)
     .attr("fill", "#ffa500").attr("stroke", "#fff").attr("stroke-width", 1.5);

  svg.append("text")
     .attr("class", "retrieval-label")
     .attr("x", cx + 8).attr("y", cy - 8)
     .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
     .text(target[yField].toLocaleString());

  return chartId;
}

/* ──────────────────────────────────────────────────────────────── */
/*  Filter & highlight points                                       */
/* ──────────────────────────────────────────────────────────────── */
export async function simpleLineFilter(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  /* ── 0. 기존 하이라이트 제거 ───────────────────────────────── */
  svg.selectAll(".filter-point,.filter-label").remove();
  svg.selectAll("g.tick text")         // 축 글자 색 원복
     .attr("fill", "#000")
     .attr("font-weight", null);

  /* ── 1. 모든 시리즈 데이터 수집 ─────────────────────────────── */
  let allSeries = [];
  svg.selectAll("path").each(function (d) {
    if (Array.isArray(d)) allSeries = allSeries.concat(d);
  });
  if (!allSeries.length) {
    console.warn("simpleLineFilter: no data found");
    return chartId;
  }

  /* ── 2. 파라미터 & 비교 함수 ──────────────────────────────── */
  const field    = op.field;   // 비교 대상 필드
  const satisfy  = op.satisfy; // >, >=, <, <=, ==, !=
  const key      = op.key;

  const cmp = (v) => {
    switch (satisfy) {
      case ">":  return +v  >  +key;
      case ">=": return +v >=  +key;
      case "<":  return +v  <  +key;
      case "<=": return +v <=  +key;
      case "!=": return  v !=  key;
      case "==":
      default:   return  v ==  key;
    }
  };

  const selected = allSeries.filter(d => cmp(d[field]));
  if (!selected.length) {
    console.warn("simpleLineFilter: no points satisfy condition");
    return chartId;
  }

  /* ── 3. 스케일 재구성 (렌더러와 동일) ──────────────────────── */
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  // x축 후보 필드 = 첫 데이터의 key 중 filter-field 제외
  const first   = allSeries[0];
  const xField  = Object.keys(first).find(k => k !== field);
  const xVals   = allSeries.map(d => d[xField]);
  const yVals   = allSeries.map(d => d[field]);
  const isTime  = xVals[0] instanceof Date;

  const xScale = isTime
    ? d3.scaleTime().domain(d3.extent(xVals)).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(xVals)]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(yVals)]).nice()
    .range([height - margin.bottom, margin.top]);

  /* ── 4. 선택된 점 시각화 ──────────────────────────────────── */
  const xTicksToHighlight = new Set();

  selected.forEach(d => {
    const cx = xScale(d[xField]);
    const cy = yScale(d[field]);

    // 포인트
    svg.append("circle")
       .attr("class", "filter-point")
       .attr("cx", cx).attr("cy", cy).attr("r", 6)
       .attr("fill", "#ffa500").attr("stroke", "#fff").attr("stroke-width", 1.5);

    // 값 레이블
    svg.append("text")
       .attr("class", "filter-label")
       .attr("x", cx + 8).attr("y", cy - 8)
       .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
       .text(d[field].toLocaleString());

    xTicksToHighlight.add(d[xField] instanceof Date ? +d[xField] : d[xField]);
  });

  /* ── 5. x축 tick 강조 ────────────────────────────────────── */
  svg.selectAll("g.tick")
     .each(function(tickVal){
        const val = tickVal instanceof Date ? +tickVal : tickVal;
        if (xTicksToHighlight.has(val)) {
          d3.select(this).select("text")
            .attr("fill", "#ffa500")
            .attr("font-weight", "bold");
        }
     });

  return chartId;
}


/* simpleLineFunctions.js ───────────────────────────────────────── */
/*  Extremum (max/min) 표시                                         */
export async function simpleLineFindExtremum(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  /* ── 0. 이전 표시 제거 ─────────────────────────────────────── */
  svg.selectAll(".extremum-line,.extremum-point,.extremum-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null);

  /* ── 1. 데이터 수집 ───────────────────────────────────────── */
  let allSeries = [];
  svg.selectAll("path").each(function (d) {
    if (Array.isArray(d)) allSeries = allSeries.concat(d);
  });
  if (!allSeries.length) {
    console.warn("simpleLineFindExtremum: no data found");
    return chartId;
  }

  /* ── 2. 파라미터 & 극값 계산 ──────────────────────────────── */
  const field   = op.field;   // y축 필드
  const type    = (op.type || "max").toLowerCase(); // "max" | "min"

  const extremumValue = type === "min"
      ? d3.min(allSeries, d => d[field])
      : d3.max(allSeries, d => d[field]);

  const selected = allSeries.filter(d => d[field] === extremumValue);

  /* ── 3. 스케일 재구성 (렌더와 동일) ───────────────────────── */
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  const xField = Object.keys(allSeries[0]).find(k => k !== field);
  const xVals  = allSeries.map(d => d[xField]);
  const isTime = xVals[0] instanceof Date;

  const xScale = isTime
    ? d3.scaleTime().domain(d3.extent(xVals)).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(xVals)]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(allSeries, d => d[field])]).nice()
    .range([height - margin.bottom, margin.top]);

  /* ── 4. 시각화 ────────────────────────────────────────────── */
  const xTicksToHighlight = new Set();

  selected.forEach(d => {
    const cx = xScale(d[xField]);
    const cy = yScale(d[field]);

    // 수직선
    svg.append("line")
       .attr("class", "extremum-line")
       .attr("x1", cx).attr("x2", cx)
       .attr("y1", cy).attr("y2", height - margin.bottom)
       .attr("stroke", "#ffa500").attr("stroke-width", 1.5)
       .attr("stroke-dasharray", "4 2");

    // 수평선
    svg.append("line")
       .attr("class", "extremum-line")
       .attr("x1", margin.left).attr("x2", cx)
       .attr("y1", cy).attr("y2", cy)
       .attr("stroke", "#ffa500").attr("stroke-width", 1.5)
       .attr("stroke-dasharray", "4 2");

    // 포인트
    svg.append("circle")
       .attr("class", "extremum-point")
       .attr("cx", cx).attr("cy", cy).attr("r", 6)
       .attr("fill", "#ffa500").attr("stroke", "#fff").attr("stroke-width", 1.5);

    // 값 라벨
    svg.append("text")
       .attr("class", "extremum-label")
       .attr("x", cx + 8).attr("y", cy - 8)
       .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
       .text(d[field].toLocaleString());

    xTicksToHighlight.add(isTime ? +d[xField] : d[xField]);
  });

  /* ── 5. x축 눈금 강조 ──────────────────────────────────── */
  svg.selectAll("g.tick")
     .each(function(tickVal){
       const val = tickVal instanceof Date ? +tickVal : tickVal;
       if (xTicksToHighlight.has(val)) {
         d3.select(this).select("text")
           .attr("fill", "#ffa500")
           .attr("font-weight", "bold");
       }
     });

  return chartId;
}
/* simpleLineFunctions.js ───────────────────────────────────────── */
/*  Range 표시 (min-line, max-line, Δ 라벨, 포인트/값 라벨)          */
export async function simpleLineDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  /* ── 0. 이전 표시 제거 ───────────────────────────────────── */
  svg.selectAll(".range-line,.range-point,.range-label,.delta-label").remove();

  /* ── 1. 데이터 수집 ─────────────────────────────────────── */
  let allSeries = [];
  svg.selectAll("path").each(function (d) {
    if (Array.isArray(d)) allSeries = allSeries.concat(d);
  });
  if (!allSeries.length) return chartId;

  /* ── 2. 파라미터 & min / max 계산 ──────────────────────── */
  const field = op.field;
  const minVal = d3.min(allSeries, d => d[field]);
  const maxVal = d3.max(allSeries, d => d[field]);
  if (minVal === maxVal) return chartId;

  /* ── 3. 스케일 재구성 (렌더와 동일) ─────────────────────── */
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  const xField = Object.keys(allSeries[0]).find(k => k !== field);
  const xVals  = allSeries.map(d => d[xField]);
  const isTime = xVals[0] instanceof Date;

  const xScale = isTime
    ? d3.scaleTime().domain(d3.extent(xVals)).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(xVals)]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, maxVal]).nice()
    .range([height - margin.bottom, margin.top]);

  const yMin = yScale(minVal);
  const yMax = yScale(maxVal);

  /* ── 4. 수평선 (최대 / 최소) ────────────────────────────── */
  svg.append("line")
     .attr("class", "range-line")
     .attr("x1", margin.left).attr("x2", width - margin.right)
     .attr("y1", yMax).attr("y2", yMax)
     .attr("stroke", "#ffa500").attr("stroke-width", 1.5);

  svg.append("line")
     .attr("class", "range-line")
     .attr("x1", margin.left).attr("x2", width - margin.right)
     .attr("y1", yMin).attr("y2", yMin)
     .attr("stroke", "#ffa500").attr("stroke-width", 1.5);

  /* ── 5. Δ 수직선 ─────────────────────────────────────── */
  const xPos = width - margin.right + 10;
  svg.append("line")
     .attr("class", "range-line")
     .attr("x1", xPos).attr("x2", xPos)
     .attr("y1", yMax).attr("y2", yMin)
     .attr("stroke", "#ffa500").attr("stroke-width", 1.5);

  svg.append("text")
     .attr("class", "delta-label")
     .attr("x", xPos + 6)
     .attr("y", (yMax + yMin) / 2)
     .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
     .attr("dominant-baseline", "middle")
     .text(`Δ ${(maxVal - minVal).toLocaleString()}`);

  /* ── 6. 포인트 & 값 라벨 (min / max) ─────────────────── */
  const minDatum = allSeries.find(d => d[field] === minVal);
  const maxDatum = allSeries.find(d => d[field] === maxVal);

  [
    { datum: maxDatum, y: yMax, label: `MAX ${maxVal.toLocaleString()}` },
    { datum: minDatum, y: yMin, label: `MIN ${minVal.toLocaleString()}` }
  ].forEach(({ datum, y, label }) => {
    const cx = xScale(datum[xField]);

    svg.append("circle")
       .attr("class", "range-point")
       .attr("cx", cx).attr("cy", y).attr("r", 6)
       .attr("fill", "#ffa500").attr("stroke", "#fff").attr("stroke-width", 1.5);

    svg.append("text")
       .attr("class", "range-label")
       .attr("x", cx + 8).attr("y", y - 8)
       .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
       .text(label);
  });

  return chartId;
}

/* simpleLineFunctions.js ───────────────────────────────────────── */
/*  Compare two keys                                                */
export async function simpleLineCompare(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  /* ── 0. 기존 표시 제거 ───────────────────────────────────── */
  svg.selectAll(".compare-line,.compare-point,.compare-label").remove();
  svg.selectAll("g.tick text")
     .attr("fill", "#000")
     .attr("font-weight", null);

  /* ── 1. 데이터 수집 ─────────────────────────────────────── */
  let allSeries = [];
  svg.selectAll("path").each(function (d) {
    if (Array.isArray(d)) allSeries = allSeries.concat(d);
  });
  if (!allSeries.length) return chartId;

  /* ── 2. 파라미터 파싱 ──────────────────────────────────── */
  const field    = op.field;                // y축 필드
  const leftKey  = op.left;                 // ex) 2014
  const rightKey = op.right;                // ex) 1994
  const operator = (op.operator || "gt").toLowerCase(); // gt, lt, gte, lte, eq, neq
  const keyField = op.keyField || Object.keys(allSeries[0]).find(k => k !== field);

  // Dates 비교 시 연도 단위
  const match = (d, k) => {
    const v = d[keyField];
    return v instanceof Date ? v.getFullYear() === +k : v == k;
  };

  const leftDatum  = allSeries.find(d => match(d, leftKey));
  const rightDatum = allSeries.find(d => match(d, rightKey));

  if (!leftDatum || !rightDatum) {
    console.warn("simpleLineCompare: key not found");
    return chartId;
  }

  /* ── 3. 스케일 재구성 (렌더와 동일) ─────────────────────── */
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };

  const xVals  = allSeries.map(d => d[keyField]);
  const isTime = xVals[0] instanceof Date;

  const xScale = isTime
    ? d3.scaleTime().domain(d3.extent(xVals)).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(xVals)]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(allSeries, d => d[field])]).nice()
    .range([height - margin.bottom, margin.top]);

  const cx1 = xScale(leftDatum[keyField]);
  const cy1 = yScale(leftDatum[field]);
  const cx2 = xScale(rightDatum[keyField]);
  const cy2 = yScale(rightDatum[field]);

  /* ── 4. 두 점 연결선 ──────────────────────────────────── */
  svg.append("line")
     .attr("class", "compare-line")
     .attr("x1", cx1).attr("y1", cy1)
     .attr("x2", cx2).attr("y2", cy2)
     .attr("stroke", "#ffa500").attr("stroke-width", 2);

  /* ── 5. 포인트 & 값 라벨 ──────────────────────────────── */
  [
    { cx: cx1, cy: cy1, val: leftDatum[field] },
    { cx: cx2, cy: cy2, val: rightDatum[field] }
  ].forEach(({ cx, cy, val }) => {
    svg.append("circle")
       .attr("class", "compare-point")
       .attr("cx", cx).attr("cy", cy).attr("r", 6)
       .attr("fill", "#ffa500").attr("stroke", "#fff").attr("stroke-width", 1.5);

    svg.append("text")
       .attr("class", "compare-label")
       .attr("x", cx + 8).attr("y", cy - 8)
       .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
       .text(val.toLocaleString());
  });

  /* ── 6. 비교 결과 라벨 (연결선 중간) ─────────────────── */
  const midX = (cx1 + cx2) / 2;
  const midY = (cy1 + cy2) / 2;

  const compareFn = {
    "gt":  (a, b) => a >  b,
    "lt":  (a, b) => a <  b,
    "gte": (a, b) => a >= b,
    "lte": (a, b) => a <= b,
    "eq":  (a, b) => a == b,
    "neq": (a, b) => a != b
  }[operator] || ((a, b) => a > b);

  const resultBool = compareFn(leftDatum[field], rightDatum[field]);
  const delta      = leftDatum[field] - rightDatum[field];
  const operatorSymbol = { gt: ">", lt: "<", gte: "≥", lte: "≤", eq: "=", neq: "≠" }[operator] || ">";

  svg.append("text")
     .attr("class", "compare-label")
     .attr("x", midX).attr("y", midY - 10)
     .attr("fill", "#ffa500").attr("font-size", "13px").attr("font-weight", "bold")
     .attr("text-anchor", "middle")
     .text(`${leftKey} ${operatorSymbol} ${rightKey} ${resultBool ? "✓" : "✗"}`);

  svg.append("text")
     .attr("class", "compare-label")
     .attr("x", midX).attr("y", midY + 8)
     .attr("fill", "#ffa500").attr("font-size", "12px").attr("text-anchor", "middle")
     .text(`Δ ${delta.toLocaleString()}`);

  /* ── 7. x축 tick 강조 ────────────────────────────────── */
  const ticksToHighlight = new Set(
    [leftDatum[keyField], rightDatum[keyField]].map(v => (v instanceof Date ? +v : v))
  );
  svg.selectAll("g.tick")
     .each(function(tickVal){
       const val = tickVal instanceof Date ? +tickVal : tickVal;
       if (ticksToHighlight.has(val)) {
         d3.select(this).select("text")
           .attr("fill", "#ffa500")
           .attr("font-weight", "bold");
       }
     });

  return chartId;
}

//


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
