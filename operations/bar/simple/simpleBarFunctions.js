export function simpleBarRetrieveValue(chartId, op) {
  console.log("[RetrieveValue] called", op);
  let returnChartId = chartId;

  const hlColor = "#ff6961";
  const origColor = "#69b3a2";
  const duration = 600;

  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top") || 0;

  const bars = svg.selectAll("rect");

  bars
    .interrupt()
    .attr("fill", origColor)
    .attr("stroke", "none")
    .attr("opacity", 1);

  svg.selectAll(".annotation, .filter-label").remove();

  const target = bars.filter(function () {
    return d3.select(this).attr("data-id") === `${op.key}`;
  });

  target
    .transition()
    .duration(duration)
    .attr("fill", hlColor)
    .attr("stroke", "black")
    .attr("stroke-width", 2);
  const bar = target.node();
  if (bar) {
    const x = +bar.getAttribute("x") + +bar.getAttribute("width") / 2 + marginL;
    const y = +bar.getAttribute("y") - 6 + marginT;
    const val = bar.getAttribute("data-value");
    svg
      .append("text")
      .attr("class", "annotation")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("fill", hlColor)
      .text(val);
  }

  return returnChartId;
}

export function simpleBarFilter(chartId, op) {
  let returnChartId = chartId;

  const duration = 600;

  const matchColor = "#ffa500";
  const dimOpacity = 0.15;
  const origColor = "#69b3a2";

  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const bars = svg.selectAll("rect");

  bars
    .interrupt()
    .attr("fill", origColor)
    .attr("opacity", 1)
    .attr("stroke", "none");

  svg.selectAll(".annotation, .filter-label").remove();

  const satisfy =
    {
      ">": (a, b) => a > b,
      ">=": (a, b) => a >= b,
      "<": (a, b) => a < b,
      "<=": (a, b) => a <= b,
      "==": (a, b) => a === b,
    }[op.satisfy] ?? (() => true);

  bars.each(function () {
    const node = d3.select(this);
    const val = +node.attr("data-value");
    const pass = satisfy(val, op.key);

    node
      .transition()
      .duration(duration)
      .attr("fill", pass ? matchColor : origColor)
      .attr("opacity", pass ? 1 : dimOpacity);
  });

  svg
    .append("text")
    .attr("class", "filter-label")
    .attr("x", 8)
    .attr("y", 14)
    .attr("font-size", 12)
    .attr("fill", matchColor)
    .text(`Filter: value ${op.satisfy} ${op.key}`);

  return returnChartId;
}

export function simpleBarFindExtremum(chartId, op) {
  console.log("[findExtremum] called", op);
  let returnChartId = chartId;
  const duration = 600;
  const hlColor = "#a65dfb";
  const origColor = "#69b3a2";

  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return returnChartId;

  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top") || 0;

  const bars = svg.selectAll("rect");
  bars
    .interrupt()
    .attr("fill", origColor)
    .attr("stroke", "none")
    .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  const field = op.field || "value";
  const getVal = (el) => {
    const row = d3.select(el).datum();
    return field in row ? +row[field] : +el.getAttribute("data-value");
  };

  const vals = bars.nodes().map(getVal);
  const idx =
    op.type === "min" ? vals.indexOf(d3.min(vals)) : vals.indexOf(d3.max(vals));
  if (idx === -1) {
    console.warn("findExtremum: target bar not found");
    return returnChartId;
  }

  const extremeVal = vals[idx];
  const target = bars.filter((d, i) => i === idx);

  target
    .transition()
    .duration(duration)
    .attr("fill", hlColor)
    .attr("stroke", "black")
    .attr("stroke-width", 2);

  const node = target.node();
  if (node) {
    const x =
      +node.getAttribute("x") + +node.getAttribute("width") / 2 + marginL;
    const y = +node.getAttribute("y") - 6 + marginT;
    const label = `${op.type === "min" ? "Min" : "Max"}: ${extremeVal}`;

    svg
      .append("text")
      .attr("class", "annotation")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("fill", hlColor)
      .text(label);
  }

  return returnChartId;
}

export function simpleBarCompare(chartId, op) {
  let returnChartId = chartId;

  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return returnChartId;

  const bars = svg.selectAll("rect");
  if (bars.empty()) return returnChartId;


  const origColor = "#69b3a2";
  bars.interrupt().attr("fill", origColor).attr("stroke", "none");
  svg.selectAll(".compare-label, .value-tag").remove();


  const cmp = {
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
  }[op.operator];
  if (!cmp) {
    console.warn("Bad operator", op.operator);
    return returnChartId;
  }

  const sample = bars.datum();
  const isField = (v) => typeof v === "string" && v in sample;
  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top") || 0;

  if (!isField(op.left) && !isField(op.right)) {
    const sel = (id) =>
      bars.filter(function () {
        return d3.select(this).attr("data-id") === String(id);
      });

    const leftBar = sel(op.left);
    const rightBar = sel(op.right);
    if (leftBar.empty() || rightBar.empty()) return returnChartId;

    const lv = +leftBar.attr("data-value");
    const rv = +rightBar.attr("data-value");
    const ok = cmp(lv, rv);

    highlightBar(leftBar, lv, "#ffb74d"); 
    highlightBar(rightBar, rv, "#64b5f6"); 
    showHeadText(ok, op.left, op.operator, op.right);

    return returnChartId;
  }

  const getVal = (row, v) => (isField(v) ? row[v] : v);
  const row = sample;
  const lv = getVal(row, op.left);
  const rv = getVal(row, op.right);
  const ok = cmp(+lv, +rv);

  showHeadText(ok, op.left, op.operator, op.right);
  return returnChartId;

  function highlightBar(selection, value, color) {
    selection.attr("fill", color).attr("stroke", "black");
    const n = selection.node();
    const x = +n.getAttribute("x") + +n.getAttribute("width") / 2 + marginL;
    const y = +n.getAttribute("y") - 6 + marginT;

    svg
      .append("text")
      .attr("class", "value-tag")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("fill", color)
      .text(value);
  }

  function showHeadText(ok, lKey, oper, rKey) {
    const center =
      (+svg.attr("data-m-left") || 0) + (+svg.attr("data-plot-w") || 0) / 2;
    const symbol =
      { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", ne: "≠" }[oper] || oper;
    svg
      .append("text")
      .attr("class", "compare-label")
      .attr("x", center)
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .attr("font-size", 13)
      .attr("font-weight", "bold")
      .attr("fill", ok ? "#2e7d32" : "#c62828")
      .text(`${lKey} ${symbol} ${rKey} → ${ok}`);
  }
}

export function simpleBarDetermineRange(chartId, op) {
  console.log("[determineRange] called", op);
  let returnChartId = chartId;

  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return returnChartId;

  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top")  || 0;
  const plotW   = +svg.attr("data-plot-w") || 0;
  const plotH   = +svg.attr("data-plot-h") || 0;

  const dataMax = +svg.attr("data-y-domain-max");
  const yScale  = d3.scaleLinear()
                    .domain([0, dataMax])
                    .range([plotH, 0]);

  const bars   = svg.selectAll("rect");
  const vals   = bars.nodes().map(el => +el.getAttribute("data-value"));
  const minVal = d3.min(vals);
  const maxVal = d3.max(vals);
  const diff   = +(maxVal - minVal).toFixed(3);
  const minIdx = vals.indexOf(minVal);
  const maxIdx = vals.indexOf(maxVal);

  const yMinPix = yScale(minVal);
  const yMaxPix = yScale(maxVal);
  const yMinAbs = marginT + yMinPix;
  const yMaxAbs = marginT + yMaxPix;
  const xVert   = marginL + plotW + 10;

  bars.attr("fill", "#69b3a2").attr("stroke", "none");
  svg.selectAll(".range-line, .delta-label, .annotation").remove();

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

  svg.append("line")
     .attr("class", "range-line")
     .attr("x1", xVert)
     .attr("x2", xVert)
     .attr("y1", yMinAbs)
     .attr("y2", yMaxAbs)
     .attr("stroke", "#ffb74d")
     .attr("stroke-width", 2)
     .attr("stroke-dasharray", "4 4");

  svg.append("text")
     .attr("class", "delta-label")
     .attr("x", xVert + 5)
     .attr("y", (yMinAbs + yMaxAbs) / 2)
     .attr("dominant-baseline", "middle")
     .attr("font-size", 12)
     .attr("fill", "#ffb74d")
     .text(`Δ ${diff}`);

  [[minIdx, minVal], [maxIdx, maxVal]].forEach(([idx, v]) => {
    const bar = bars.filter((d,i) => i === idx)
                    .attr("fill", "#ffb74d");
    const n   = bar.node();
    const x   = +n.getAttribute("x") + (+n.getAttribute("width")/2) + marginL;
    const y   = +n.getAttribute("y") - 6 + marginT;

    svg.append("text")
       .attr("class", "annotation")
       .attr("x", x)
       .attr("y", y)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .attr("fill", "#ffb74d")
       .text(v);
  });

  return returnChartId;
}

export function simpleBarSort(chartId, op) {
  console.log("[sort] called", op);
  let returnChartId = chartId;
  const duration = 600;
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return returnChartId;
  const marginL = +svg.attr("data-m-left") || 0;
  const marginT = +svg.attr("data-m-top")  || 0;
  const plotW   = +svg.attr("data-plot-w") || 0;
  const bars = svg.selectAll("rect");
  if (bars.empty()) return returnChartId;

  const origColor = "#69b3a2";
  const hlColor   = "#ffa500";

  bars.interrupt()
      .attr("fill", origColor)
      .attr("stroke", "none")
      .attr("opacity", 1);

  svg.selectAll(".annotation,.filter-label,.compare-label,.range-line,.delta-label,.value-tag,.sort-label").remove();

  const field = op.field;
  const order = op.order === "descending" ? "descending" : "ascending";
  const limit = op.limit > 0 ? Math.min(op.limit, bars.size()) : bars.size();

  const originalX = bars.nodes()
    .map(el => +el.getAttribute("x") + marginL)
    .sort((a, b) => a - b);

  const arr = bars.nodes().map(el => {
    const row   = d3.select(el).datum() || {};
    const raw   = el.getAttribute("data-value");
    const value = row[field] !== undefined ? +row[field] : +raw;
    const id    = d3.select(el).attr("data-id");
    return { el, value, id };
  });

  const sortedByValue = arr.slice().sort((a, b) =>
    order === "ascending" ? a.value - b.value : b.value - a.value
  );
  const limited = sortedByValue.slice(0, limit);
  const rest    = arr.filter(item => !limited.includes(item));
  const newOrder = limited.concat(rest);

  newOrder.forEach((item, i) => {
    d3.select(item.el)
      .transition()
        .duration(duration)
        .attr("x", originalX[i] - marginL)
      .transition()
        .duration(duration / 2)
        .attr("fill", limited.includes(item) ? hlColor : origColor);
  });

  const xScale = d3.scaleBand()
    .domain(newOrder.map(d => d.id))
    .range([marginL, marginL + plotW])
    .padding(0.1);

  svg.select(".x-axis")
     .transition()
       .duration(duration)
     .call(d3.axisBottom(xScale))
     .selectAll("text")
       .attr("y", 10);

  svg.selectAll(".x-axis g.tick")
     .transition()
       .duration(duration)
     .attr("transform", (d, i) => `translate(${originalX[i]},0)`);

  limited.forEach(item => {
    const idx = newOrder.indexOf(item);
    const x   = originalX[idx] + (+bars.nodes()[0].getAttribute("width") / 2);
    const y   = +item.el.getAttribute("y") - 6 + marginT;
    svg.append("text")
       .attr("class", "value-tag")
       .attr("x", x)
       .attr("y", y)
       .attr("text-anchor", "middle")
       .attr("font-size", 12)
       .attr("fill", "black")
       .text(item.value);
  });

  svg.append("text")
     .attr("class", "sort-label")
     .attr("x", originalX[0])
     .attr("y", marginT - 15)
     .attr("font-size", 12)
     .attr("fill", hlColor)
     .text(`Sort: ${field} ${order}` + (op.limit ? `, limit ${limit}` : ""));

  return returnChartId;
}