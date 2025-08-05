// simpleBarFunctions.js

// 헬퍼 함수들 (이 파일 내에서만 사용)
function getOrientation(svg) {
  return svg.attr("data-orientation") || "vertical";
}

function getMargins(svg) {
  return {
    left: +svg.attr("data-m-left") || 0,
    top: +svg.attr("data-m-top") || 0,
  };
}

function getCenter(bar, orientation, margins) {
  const x0 = +bar.getAttribute("x"),
    y0 = +bar.getAttribute("y"),
    w = +bar.getAttribute("width"),
    h = +bar.getAttribute("height");

  if (orientation === "horizontal") {
    return {
      x: x0 + w + 4 + margins.left,
      y: y0 + h / 2 + margins.top,
    };
  } else {
    return {
      x: x0 + w / 2 + margins.left,
      y: y0 - 6 + margins.top,
    };
  }
}

// ────────────────────────────────────────────────────────────────
// 오퍼레이션 함수들 (simpleBarFunctions.js의 내용)
// ────────────────────────────────────────────────────────────────

// simpleBarRetrieveValue (비동기 처리를 위해 async/await 적용)
export async function simpleBarRetrieveValue(chartId, op, data) {
  console.log("[RetrieveValue] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const bars = svg.selectAll("rect");
  bars.interrupt().attr("fill", "#69b3a2").attr("stroke", "none").attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label").remove();

  const target = bars.filter(function () {
    return d3.select(this).attr("data-id") === `${op.key}`;
  });

  if (target.empty()) {
      console.warn("RetrieveValue: target bar not found for key:", op.key);
      return data;
  }
  
  await target.transition().duration(600).attr("fill", "#ff6961").attr("stroke", "black").attr("stroke-width", 2).end();

  const bar = target.node();
  if (bar) {
    const orientation = getOrientation(svg);
    const margins = getMargins(svg);
    const { x, y } = getCenter(bar, orientation, margins);
    const val = bar.getAttribute("data-value");
    svg.append("text")
      .attr("class", "annotation")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("fill", "#ff6961")
      .text(val);
  }

  return data;
}

// simpleBarFunctions.js 파일의 simpleBarFilter 함수를 아래와 같이 수정
export async function simpleBarFilter(chartId, op, data) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const duration = 600;
  const origColor = "#69b3a2";
  const matchColor = "#ffa500";
  const yField = svg.attr("data-y-field");
  const xField = svg.attr("data-x-field");
  const orientation = getOrientation(svg);
  
  // 필터링에 사용할 필드를 op.field에서 가져오고, 없으면 yField를 사용
  const filterField = op.field || yField;
  
  // 이전 스타일 및 레이블 초기화
  svg.selectAll("rect").interrupt().attr("fill", origColor).attr("opacity", 1).attr("stroke", "none");
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label").remove();

  // 필터링 조건 정의
  const satisfyMap = {
    ">": (a, b) => a > b,
    ">=": (a, b) => a >= b,
    "<": (a, b) => a < b,
    "<=": (a, b) => a <= b,
    "==": (a, b) => a === b
  };
  const satisfy = satisfyMap[op.satisfy] || (() => true);
  
  const filterKey = +op.key;
  
  console.log("simpleBarFilter debug:");
  console.log("  - filterField:", filterField);
  console.log("  - satisfy:", op.satisfy);
  console.log("  - filterKey:", filterKey);
  console.log("  - first data item to check:", data[0]);

  // 필터링 로직: filterField를 사용하여 조건 검사
  const filteredData = data.filter(d => {
    const value = +d[filterField];
    const condition = satisfy(value, filterKey);
    console.log(`  - Check item: ${d[xField] || d[yField]} | value: ${value} ${op.satisfy} ${filterKey} -> ${condition}`);
    return condition;
  });

  if (filteredData.length === 0) {
      console.warn("simpleBarFilter: Filtered data is empty. All bars will be removed.");
  }

  // 이 아래의 코드는 수정하지 않았습니다.
  const g = svg.select("g");
  const plotW = +svg.attr("data-plot-w");
  const plotH = +svg.attr("data-plot-h");
  
  // y축 스케일은 전체 데이터셋을 기준으로 설정하여 시각적 일관성 유지
  const yScaleFull = d3.scaleLinear().domain([0, d3.max(data, d => d[yField])]).nice().range([plotH, 0]);
  const xScaleFull = d3.scaleLinear().domain([0, d3.max(data, d => d[xField])]).nice().range([0, plotW]);

  const transitions = [];
  
  if (orientation === 'vertical') {
    // x축 스케일은 필터링된 데이터에 맞춰 재정의
    const xScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d[xField])).range([0, plotW]).padding(0.2);

    const bars = g.selectAll("rect").data(filteredData, d => d[xField]);
    
    transitions.push(
      bars.exit()
        .transition().duration(duration)
        .attr("y", plotH)
        .attr("height", 0)
        .remove()
        .end()
    );
    
    const updateBars = bars.enter().append("rect")
      .attr("x", d => xScaleFiltered(d[xField]))
      .attr("y", plotH)
      .attr("height", 0)
      .merge(bars);
      
    transitions.push(
      updateBars.transition().duration(duration)
        .attr("x", d => xScaleFiltered(d[xField]))
        .attr("y", d => yScaleFull(d[yField]))
        .attr("width", xScaleFiltered.bandwidth())
        .attr("height", d => plotH - yScaleFull(d[yField]))
        .attr("fill", matchColor)
        .attr("opacity", 1)
        .attr("stroke", "black")
        .attr("stroke-width", 1.5)
        .attr("data-id", d => d[xField])
        .attr("data-value", d => d[yField])
        .end()
    );
    
    transitions.push(
      g.select(".x-axis")
        .transition().duration(duration)
        .call(d3.axisBottom(xScaleFiltered))
        .end()
    );
  } else {
    const yScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d[yField])).range([0, plotH]).padding(0.2);
    
    const bars = g.selectAll("rect").data(filteredData, d => d[yField]);
    
    transitions.push(
      bars.exit()
        .transition().duration(duration)
        .attr("width", 0)
        .remove()
        .end()
    );
    
    const updateBars = bars.enter().append("rect")
      .attr("x", 0)
      .attr("y", d => yScaleFiltered(d[yField]))
      .attr("width", 0)
      .merge(bars);
      
    transitions.push(
      updateBars.transition().duration(duration)
        .attr("x", 0)
        .attr("y", d => yScaleFiltered(d[yField]))
        .attr("width", d => xScaleFull(d[xField]))
        .attr("height", yScaleFiltered.bandwidth())
        .attr("fill", matchColor)
        .attr("opacity", 1)
        .attr("stroke", "black")
        .attr("stroke-width", 1.5)
        .end()
    );

    transitions.push(
      g.select(".y-axis")
        .transition().duration(duration)
        .call(d3.axisLeft(yScaleFiltered))
        .end()
    );
  }

  await Promise.all(transitions);

  const margins = getMargins(svg);
  svg.append("text")
    .attr("class", "filter-label")
    .attr("x", margins.left + 8)
    .attr("y", margins.top + 14)
    .attr("font-size", 12)
    .attr("fill", matchColor)
    .text(`Filter: ${filterField} ${op.satisfy} ${op.key}`);

  return filteredData;
}


// simpleBarFindExtremum (비동기 처리 적용 및 색상 수정)
export async function simpleBarFindExtremum(chartId, op, data) {
  console.log("[findExtremum] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const duration = 600;
  const hlColor = "#a65dfb";
  const origColor = "#ffa500"; // 필터링 후 색상
  const bars = svg.selectAll("rect");
  
  // 기존 막대가 필터링 후의 상태일 수 있으므로 색상을 원색으로 초기화
  bars.interrupt().attr("fill", origColor).attr("stroke", "none").attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label").remove();

  const currentBarsData = bars.data();
  if (currentBarsData.length === 0) {
      console.warn("findExtremum: No bars found to process.");
      return data;
  }
  
  const field = op.field || "value";
  const vals = currentBarsData.map(d => +d[field]);

  const idx = op.type === "min" ? vals.indexOf(d3.min(vals)) : vals.indexOf(d3.max(vals));
  
  if (idx === -1) {
    console.warn("findExtremum: target bar not found");
    return data;
  }

  const extremeVal = vals[idx];
  const target = bars.filter((d, i) => i === idx);

  // 애니메이션이 끝날 때까지 기다립니다.
  await target.transition().duration(duration).attr("fill", hlColor).attr("stroke", "black").attr("stroke-width", 2).end();

  const node = target.node();
  if (node) {
    const orientation = getOrientation(svg);
    const margins = getMargins(svg);
    const { x: baseX, y: baseY } = getCenter(node, orientation, margins);
    const padding = 12;
    const x = orientation === "horizontal" ? baseX + padding : baseX;
    const y = orientation === "horizontal" ? baseY : baseY - padding;
    const labelText = `${op.type === "min" ? "Min" : "Max"}: ${extremeVal}`;

    svg.append("text")
      .attr("class", "annotation")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("fill", hlColor)
      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text(labelText);
  }

  return data;
}

// simpleBarCompare (비동기 처리를 위해 async/await 적용)
export async function simpleBarCompare(chartId, op, data) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const bars = svg.selectAll("rect");
  if (bars.empty()) return data;

  const origColor = "#69b3a2";
  bars.interrupt().attr("fill", origColor).attr("stroke", "none");
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label").remove();

  const { keyField = "id", field = "value" } = op;
  const cmp = {
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
  }[op.operator];
  if (!cmp) {
    console.warn("simpleBarCompare: bad operator", op.operator);
    return data;
  }

  const orientation = getOrientation(svg);
  const { left: marginL, top: marginT } = getMargins(svg);
  const plotW = +svg.attr("data-plot-w");
  const plotH = +svg.attr("data-plot-h");

  const leftBar = bars.filter(d => d[keyField] == op.left);
  const rightBar = bars.filter(d => d[keyField] == op.right);

  if (leftBar.empty() || rightBar.empty()) {
    console.warn("simpleBarCompare: bar not found for", op.left, op.right);
    return data;
  }

  const leftData = data.find(d => d[keyField] == op.left);
  const rightData = data.find(d => d[keyField] == op.right);

  const lv = +leftData[field];
  const rv = +rightData[field];
  const ok = cmp(lv, rv);

  function highlight(selection, value, color) {
    selection.attr("fill", color).attr("stroke", "black");
    const barNode = selection.node();
    const { x: cx, y: cy } = getCenter(barNode, orientation, { left: marginL, top: marginT });
    const pad = 12;
    const x = orientation === "horizontal" ? cx + pad : cx;
    const y = orientation === "horizontal" ? cy : cy - pad;
    svg.append("text").attr("class", "value-tag").attr("x", x).attr("y", y).attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 12).attr("fill", color).text(value);
  }

  function showHeader(ok, lKey, oper, rKey) {
    const symbol = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", ne: "≠" }[oper] || oper;
    const text = `${lKey} ${symbol} ${rKey} → ${ok}`;
    const fill = ok ? "#2e7d32" : "#c62828";
    if (orientation === "horizontal") {
      const x = marginL + plotW + 16;
      const y = marginT + plotH / 2;
      svg.append("text").attr("class", "compare-label").attr("x", x).attr("y", y).attr("text-anchor", "start").attr("dominant-baseline", "middle").attr("font-size", 13).attr("font-weight", "bold").attr("fill", fill).text(text);
    } else {
      const x = marginL + plotW / 2;
      const y = marginT - 8;
      svg.append("text").attr("class", "compare-label").attr("x", x).attr("y", y).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", "bold").attr("fill", fill).text(text);
    }
  }

  highlight(leftBar, lv, "#ffb74d");
  highlight(rightBar, rv, "#64b5f6");
  showHeader(ok, op.left, op.operator, op.right);
  
  // D3.js transition이 없으므로 바로 반환 가능
  return data;
}

// simpleBarDetermineRange (비동기 처리를 위해 async/await 적용)
export async function simpleBarDetermineRange(chartId, op, data) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const orig = "#69b3a2", hl = "#ffb74d";
  const bars = svg.selectAll("rect");
  bars.interrupt().attr("fill", orig).attr("stroke", null);
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label").remove();

  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);
  const plotW = +svg.attr("data-plot-w"), plotH = +svg.attr("data-plot-h");
  const vals = data.map(d => +d[svg.attr("data-y-field")]);
  const minV = d3.min(vals), maxV = d3.max(vals), delta = +(maxV - minV).toFixed(1);
  const pad = 12;
  
  // D3.js transition이 없으므로 async/await 없이도 작동하지만,
  // 일관성을 위해 async로 유지합니다.
  
  if (orientation === "horizontal") {
    const minNode = bars.nodes()[vals.indexOf(minV)];
    const maxNode = bars.nodes()[vals.indexOf(maxV)];
    const xMinEnd = mL + (+minNode.getAttribute("x") + +minNode.getAttribute("width"));
    const xMaxEnd = mL + (+maxNode.getAttribute("x") + +maxNode.getAttribute("width"));
    const yLine = +minNode.getAttribute("y") + mT + pad/2;
    [xMinEnd, xMaxEnd].forEach(x => svg.append("line").attr("class","range-line").attr("x1", x).attr("x2", x).attr("y1", mT).attr("y2", mT + plotH).attr("stroke", hl).attr("stroke-width",2).attr("stroke-dasharray","4 4"));
    svg.append("line").attr("class","range-line").attr("x1", xMinEnd).attr("x2", xMaxEnd).attr("y1", yLine).attr("y2", yLine).attr("stroke", hl).attr("stroke-width",2).attr("stroke-dasharray","4 4");
    svg.append("text").attr("class","delta-label").attr("x",(xMinEnd+xMaxEnd)/2).attr("y", yLine - pad/2).attr("text-anchor","middle").attr("font-size",12).attr("fill",hl).attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text(`Δ ${delta}`);
    [{v:minV,x:xMinEnd},{v:maxV,x:xMaxEnd}].forEach(({v,x}) => svg.append("text").attr("class","annotation").attr("x", x + pad).attr("y", yLine).attr("text-anchor","middle").attr("font-size",12).attr("fill",hl).attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text(v));
  } else {
    const minNode = bars.nodes()[vals.indexOf(minV)];
    const maxNode = bars.nodes()[vals.indexOf(maxV)];
    const yMinEnd = mT + (+minNode.getAttribute("y"));
    const yMaxEnd = mT + (+maxNode.getAttribute("y"));
    const xLine = mL + plotW + pad/2;
    [yMinEnd, yMaxEnd].forEach(y => svg.append("line").attr("class","range-line").attr("x1", mL).attr("x2", mL+plotW).attr("y1", y).attr("y2", y).attr("stroke", hl).attr("stroke-width",2).attr("stroke-dasharray","4 4"));
    svg.append("line").attr("class","range-line").attr("x1", xLine).attr("x2", xLine).attr("y1", yMinEnd).attr("y2", yMaxEnd).attr("stroke", hl).attr("stroke-width",2).attr("stroke-dasharray","4 4");
    svg.append("text").attr("class","delta-label").attr("x", xLine + pad/2).attr("y", (yMinEnd+yMaxEnd)/2).attr("dominant-baseline","middle").attr("font-size",12).attr("fill",hl).attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text(`Δ ${delta}`);
    [{v:minV,y:yMinEnd},{v:maxV,y:yMaxEnd}].forEach(({v,y}) => svg.append("text").attr("class","annotation").attr("x", mL+plotW+pad).attr("y", y - pad/2).attr("text-anchor","middle").attr("font-size",12).attr("fill",hl).attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").text(v));
  }

  return data;
}

// simpleBarSort (비동기 처리를 위해 async/await 적용)
export async function simpleBarSort(chartId, op, data) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const orientation = svg.attr("data-orientation");
  const { left: mL, top: mT } = getMargins(svg);
  const plotW = +svg.attr("data-plot-w");
  const plotH = +svg.attr("data-plot-h");
  const xField = svg.attr("data-x-field");
  const yField = svg.attr("data-y-field");
  const g = svg.select("g");
  const origColor = "#69b3a2";
  const hlColor = "#ffa500";
  const duration = 600;

  const keyField = orientation === "vertical" ? xField : yField;
  const valueField = orientation === "vertical" ? yField : xField;
  const { field = valueField, order = "descending", limit = 0 } = op;

  const sortedData = data.slice().sort((a, b) => {
    const valA = a[field];
    const valB = b[field];
    if (isNaN(valA) || isNaN(valB)) return 0;
    return order === "ascending" ? valA - valB : valB - valA;
  });

  const topN = limit > 0 ? sortedData.slice(0, Math.min(limit, sortedData.length)) : [];

  const transitions = [];

  if (orientation === "vertical") {
    const xScale = d3.scaleBand().domain(sortedData.map(d => d[xField])).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d[yField])]).nice().range([plotH, 0]);

    transitions.push(
      g.selectAll("rect").data(sortedData, d => d[keyField])
        .transition().duration(duration)
        .attr("x", d => xScale(d[xField]))
        .attr("y", d => yScale(d[yField]))
        .attr("width", xScale.bandwidth())
        .attr("height", d => plotH - yScale(d[yField]))
        .attr("fill", d => topN.some(item => item[keyField] === d[keyField]) ? hlColor : origColor)
        .end()
    );

    transitions.push(
      g.select(".x-axis").transition().duration(duration).call(d3.axisBottom(xScale))
        .selectAll("text").attr("transform", "rotate(-45)").style("text-anchor", "end")
        .end()
    );
  } else {
    const yScale = d3.scaleBand().domain(sortedData.map(d => d[yField])).range([0, plotH]).padding(0.2);
    const xScale = d3.scaleLinear().domain([0, d3.max(data, d => d[xField])]).nice().range([0, plotW]);

    transitions.push(
      g.selectAll("rect").data(sortedData, d => d[keyField])
        .transition().duration(duration)
        .attr("x", 0)
        .attr("y", d => yScale(d[yField]))
        .attr("width", d => xScale(d[xField]))
        .attr("height", yScale.bandwidth())
        .attr("fill", d => topN.some(item => item[keyField] === d[keyField]) ? hlColor : origColor)
        .end()
    );

    transitions.push(
      g.select(".y-axis").transition().duration(duration).call(d3.axisLeft(yScale))
        .end()
    );
  }
  
  await Promise.all(transitions);
  
  svg.selectAll(".sort-label, .value-tag").remove();
  svg.append("text").attr("class", "sort-label").attr("x", mL).attr("y", mT - 10).attr("font-size", 12).attr("fill", hlColor).text(`Order: ${sortedData.map(d => d[keyField]).join(" → ")}`);
  
  return sortedData;
}