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

// simpleBarRetrieveValue (수평선 추가 및 비동기 처리 적용)
export async function simpleBarRetrieveValue(chartId, op, data) {
  console.log("[RetrieveValue] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  // 기존의 모든 시각적 요소 초기화
  const bars = svg.selectAll("rect");
  bars.interrupt().attr("fill", "#69b3a2").attr("stroke", "none").attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label, .value-line").remove();

  // 목표 막대 필터링
  const target = bars.filter(function () {
    return d3.select(this).attr("data-id") === `${op.key}`;
  });

  if (target.empty()) {
      console.warn("RetrieveValue: target bar not found for key:", op.key);
      return data;
  }
  
  // 목표 막대 하이라이트 애니메이션
  await target.transition().duration(600).attr("fill", "#ff6961").attr("stroke", "black").attr("stroke-width", 2).end();

  const bar = target.node();
  if (bar) {
    // 필요한 속성들 가져오기
    const orientation = getOrientation(svg);
    const margins = getMargins(svg);
    const { x, y } = getCenter(bar, orientation, margins);
    const val = bar.getAttribute("data-value");

    const barX = +bar.getAttribute("x");
    const barY = +bar.getAttribute("y");
    const barW = +bar.getAttribute("width");
    const barH = +bar.getAttribute("height");
    
    // --- 피드백 반영: Y축에 수직인 선(수평선) 추가 ---
    const lineHighlightColor = "#ff6961";
    
    // 새로운 <line> 요소를 추가
    const line = svg.append("line")
      .attr("class", "value-line")
      .attr("stroke", lineHighlightColor)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 4");

    if (orientation === 'vertical') {
      // 수직 차트: Y축에서 막대 상단 중앙까지 선 그리기
      const lineY = margins.top + barY;
      line.attr("x1", margins.left)
          .attr("y1", lineY)
          .attr("x2", margins.left + barX + barW / 2)
          .attr("y2", lineY);
    } else { // 'horizontal'
      // 수평 차트: Y축에서 막대 오른쪽 끝까지 선 그리기
      const lineY = margins.top + barY + barH / 2;
      line.attr("x1", margins.left)
          .attr("y1", lineY)
          .attr("x2", margins.left + barW) // 막대의 끝부분
          .attr("y2", lineY);
    }
    // --- 수정 끝 ---

    // 값 레이블 추가
    svg.append("text")
      .attr("class", "annotation")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("fill", lineHighlightColor)
      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text(val);
  }

  return data;
}


export async function simpleBarFilter(chartId, op, data) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  // 1. 초기화 부분에 '.threshold-line', '.threshold-label' 추가
  svg.selectAll("rect").interrupt().attr("fill", "#69b3a2").attr("opacity", 1).attr("stroke", "none");
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label, .value-line, .threshold-line, .threshold-label").remove();

  const duration = 800;
  const matchColor = "#ffa500";
  const thresholdColor = "blue"; // 기준선 색상
  const yField = svg.attr("data-y-field");
  const xField = svg.attr("data-x-field");
  const orientation = getOrientation(svg);
  
  const filterField = op.field || (orientation === 'vertical' ? yField : xField);
  
  const satisfyMap = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a == b };
  const satisfy = satisfyMap[op.satisfy] || (() => true);
  const filterKey = isNaN(+op.key) ? op.key : +op.key;

  const filteredData = data.filter(d => {
    const value = isNaN(+d[filterField]) ? d[filterField] : +d[filterField];
    return satisfy(value, filterKey);
  });
  
  if (filteredData.length === 0) {
      console.warn("simpleBarFilter: Filtered data is empty. All bars will be removed.");
  }

  const g = svg.select("g");
  const plotW = +svg.attr("data-plot-w");
  const plotH = +svg.attr("data-plot-h");
  
  const yScaleFull = d3.scaleLinear().domain([0, d3.max(data, d => +d[yField]) || 0]).nice().range([plotH, 0]);
  const xScaleFull = d3.scaleLinear().domain([0, d3.max(data, d => +d[xField]) || 0]).nice().range([0, plotW]);

  const transitions = [];
  
  // (애니메이션 부분은 이전과 동일)
  if (orientation === 'vertical') {
    const xScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d[xField])).range([0, plotW]).padding(0.2);
    const bars = g.selectAll("rect").data(filteredData, d => d[xField]);
    transitions.push(bars.exit().transition().duration(duration).attr("y", plotH).attr("height", 0).remove().end());
    const updateBars = bars.enter().append("rect").attr("x", d => xScaleFiltered(d[xField])).attr("y", plotH).attr("height", 0).merge(bars);
    transitions.push(updateBars.transition().duration(duration).attr("x", d => xScaleFiltered(d[xField])).attr("y", d => yScaleFull(d[yField])).attr("width", xScaleFiltered.bandwidth()).attr("height", d => plotH - yScaleFull(d[yField])).attr("fill", matchColor).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 1).attr("data-id", d => d[xField]).attr("data-value", d => d[yField]).end());
    transitions.push(g.select(".x-axis").transition().duration(duration).call(d3.axisBottom(xScaleFiltered)).end());
  } else {
    const yScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d[yField])).range([0, plotH]).padding(0.2);
    const bars = g.selectAll("rect").data(filteredData, d => d[yField]);
    transitions.push(bars.exit().transition().duration(duration).attr("width", 0).remove().end());
    const updateBars = bars.enter().append("rect").attr("x", 0).attr("y", d => yScaleFiltered(d[yField])).attr("width", 0).merge(bars);
    transitions.push(updateBars.transition().duration(duration).attr("x", 0).attr("y", d => yScaleFiltered(d[yField])).attr("width", d => xScaleFull(d[xField])).attr("height", yScaleFiltered.bandwidth()).attr("fill", matchColor).attr("opacity", 1).attr("stroke", "black").attr("stroke-width", 1).attr("data-id", d => d[yField]).attr("data-value", d => d[xField]).end());
    transitions.push(g.select(".y-axis").transition().duration(duration).call(d3.axisLeft(yScaleFiltered)).end());
  }

  await Promise.all(transitions);

  const margins = getMargins(svg);

  // --- 2. 피드백 반영: 기준선(Threshold Line) 추가 ---
  // op.key가 숫자일 경우에만 기준선을 그립니다.
  if (!isNaN(filterKey)) {
    if (orientation === 'vertical') {
      const yPos = yScaleFull(filterKey); // 기준값의 Y 위치 계산
      // 기준선 추가
      svg.append("line").attr("class", "threshold-line")
        .attr("x1", margins.left).attr("y1", margins.top + yPos)
        .attr("x2", margins.left + plotW).attr("y2", margins.top + yPos)
        .attr("stroke", thresholdColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
      // 기준선 레이블 추가
      svg.append("text").attr("class", "threshold-label")
        .attr("x", margins.left + plotW).attr("y", margins.top + yPos - 5)
        .attr("text-anchor", "end").attr("fill", thresholdColor).attr("font-size", 12).attr("font-weight", "bold")
        .text(`기준: ${filterKey}`);
    } else { // horizontal
      const xPos = xScaleFull(filterKey); // 기준값의 X 위치 계산
      // 기준선 추가 (수평 차트에서는 수직선이 됨)
      svg.append("line").attr("class", "threshold-line")
        .attr("x1", margins.left + xPos).attr("y1", margins.top)
        .attr("x2", margins.left + xPos).attr("y2", margins.top + plotH)
        .attr("stroke", thresholdColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
      // 기준선 레이블 추가
      svg.append("text").attr("class", "threshold-label")
        .attr("x", margins.left + xPos + 5).attr("y", margins.top + 10)
        .attr("text-anchor", "start").attr("fill", thresholdColor).attr("font-size", 12).attr("font-weight", "bold")
        .text(`기준: ${filterKey}`);
    }
  }

  // --- 3. 각 막대의 값은 계속 표시 ---
  g.selectAll("rect").each(function() {
      const bar = this;
      const val = bar.getAttribute("data-value");
      const { x, y } = getCenter(bar, orientation, margins);
      svg.append("text")
          .attr("class", "value-tag").attr("x", x).attr("y", y)
          .attr("text-anchor", "middle").attr("font-size", 10)
          .attr("fill", "#000").attr("stroke", "white").attr("stroke-width", 2).attr("paint-order", "stroke")
          .text(val);
  });
  
  // 필터 정보 레이블
  svg.append("text").attr("class", "filter-label")
    .attr("x", margins.left).attr("y", margins.top - 8)
    .attr("font-size", 12).attr("fill", matchColor).attr("font-weight", "bold")
    .text(`Filter: ${filterField} ${op.satisfy} ${op.key}`);

  return filteredData;
}

export async function simpleBarFindExtremum(chartId, op, data) {
  console.log("[findExtremum] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const duration = 600;
  const hlColor = "#a65dfb"; // 극값 하이라이트 색상 (보라색)
  const baseColor = "#69b3a2"; // 차트의 기본 색상
  const bars = svg.selectAll("rect");
  
  // 1. 초기화 로직 수정
  // 이전 상태가 어떻든 모든 막대를 기본 색상으로 되돌립니다.
  // 이전에 그린 선('.value-line')도 제거합니다.
  bars.interrupt().attr("fill", baseColor).attr("stroke", "none").attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label, .value-line, .threshold-line, .threshold-label").remove();

  // 현재 화면에 보이는 막대들의 데이터를 가져옵니다. (연속/단일 처리의 핵심)
  const currentBarsData = bars.data();
  if (currentBarsData.length === 0) {
      console.warn("findExtremum: No bars found to process.");
      return data;
  }
  
  // 현재 데이터셋 내에서 극값을 찾습니다.
  const valueField = svg.attr("data-orientation") === 'vertical' ? svg.attr("data-y-field") : svg.attr("data-x-field");
  const vals = currentBarsData.map(d => +d[valueField]);
  const extremumFunc = op.type === "min" ? d3.min : d3.max;
  const extremeVal = extremumFunc(vals);
  
  const target = bars.filter(d => +d[valueField] === extremeVal);

  if (target.empty()) {
    console.warn("findExtremum: target bar not found");
    return data;
  }

  // 극값 막대 하이라이트 애니메이션
  await target.transition().duration(duration).attr("fill", hlColor).attr("stroke", "black").attr("stroke-width", 2).end();

  const node = target.node();
  if (node) {
    const orientation = getOrientation(svg);
    const margins = getMargins(svg);
    
    // 2. 수평선 추가 로직
    const barX = +node.getAttribute("x");
    const barY = +node.getAttribute("y");
    const barW = +node.getAttribute("width");
    const barH = +node.getAttribute("height");
    
    const line = svg.append("line")
      .attr("class", "value-line")
      .attr("stroke", hlColor)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 4");

    if (orientation === 'vertical') {
      const lineY = margins.top + barY;
      line.attr("x1", margins.left).attr("y1", lineY)
          .attr("x2", margins.left + barX + barW / 2).attr("y2", lineY);
    } else { // 'horizontal'
      const lineY = margins.top + barY + barH / 2;
      line.attr("x1", margins.left).attr("y1", lineY)
          .attr("x2", margins.left + barW).attr("y2", lineY);
    }

    // 값 레이블 추가 (기존 로직과 동일)
    const { x: baseX, y: baseY } = getCenter(node, orientation, margins);
    const padding = 12;
    const x = orientation === "horizontal" ? baseX + padding : baseX;
    const y = orientation === "horizontal" ? baseY : baseY - padding;
    const labelText = `${op.type === "min" ? "Min" : "Max"}: ${extremeVal}`;

    svg.append("text")
      .attr("class", "annotation")
      .attr("x", x).attr("y", y)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", hlColor)
      .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
      .text(labelText);
  }

  // 현재 필터링된 데이터 상태를 그대로 반환합니다.
  return currentBarsData;
}
export async function simpleBarCompare(chartId, op, data) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return data;

  const bars = svg.selectAll("rect");
  if (bars.empty()) return data;

  // 1. 초기화 로직 수정
  // 모든 막대를 기본 색상으로 되돌리고, 이전에 그렸던 모든 주석/선을 제거합니다.
  const baseColor = "#69b3a2";
  bars.interrupt().attr("fill", baseColor).attr("stroke", "none");
  svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .delta-label, .value-line, .threshold-line, .threshold-label, .compare-label").remove();

  // (기존과 동일한 비교 로직)
  const keyField = op.keyField || (svg.attr("data-orientation") === 'vertical' ? svg.attr("data-x-field") : svg.attr("data-y-field"));
  const valueField = op.field || (svg.attr("data-orientation") === 'vertical' ? svg.attr("data-y-field") : svg.attr("data-x-field"));

  const cmp = { gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b, eq: (a, b) => a === b, ne: (a, b) => a !== b }[op.operator];
  if (!cmp) {
    console.warn("simpleBarCompare: bad operator", op.operator);
    return data;
  }

  const leftBar = bars.filter(d => d[keyField] == op.left);
  const rightBar = bars.filter(d => d[keyField] == op.right);

  if (leftBar.empty() || rightBar.empty()) {
    console.warn("simpleBarCompare: bar not found for", op.left, op.right);
    return data;
  }

  const leftData = data.find(d => d[keyField] == op.left);
  const rightData = data.find(d => d[keyField] == op.right);
  const lv = +leftData[valueField];
  const rv = +rightData[valueField];
  const ok = cmp(lv, rv);

  // 2. 애니메이션 및 주석 추가 로직 수정
  const duration = 600;
  const leftColor = "#ffb74d"; // 왼쪽 막대 색상 (주황)
  const rightColor = "#64b5f6"; // 오른쪽 막대 색상 (파랑)

  // 두 막대의 하이라이트 애니메이션을 동시에 시작
  const transitions = [];
  transitions.push(
    leftBar.transition().duration(duration)
      .attr("fill", leftColor).attr("stroke", "black").attr("stroke-width", 1.5)
      .end()
  );
  transitions.push(
    rightBar.transition().duration(duration)
      .attr("fill", rightColor).attr("stroke", "black").attr("stroke-width", 1.5)
      .end()
  );

  // 모든 애니메이션이 끝날 때까지 기다립니다.
  await Promise.all(transitions);

  const orientation = getOrientation(svg);
  const margins = getMargins(svg);

  // 선과 값 레이블을 추가하는 헬퍼 함수
  function addAnnotations(selection, value, color) {
    const barNode = selection.node();
    if (!barNode) return;

    // 수평선 추가
    const barX = +barNode.getAttribute("x");
    const barY = +barNode.getAttribute("y");
    const barW = +barNode.getAttribute("width");
    const barH = +barNode.getAttribute("height");
    
    const line = svg.append("line")
      .attr("class", "value-line")
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 4");

    if (orientation === 'vertical') {
      const lineY = margins.top + barY;
      line.attr("x1", margins.left).attr("y1", lineY)
          .attr("x2", margins.left + barX + barW / 2).attr("y2", lineY);
    } else {
      const lineY = margins.top + barY + barH / 2;
      line.attr("x1", margins.left).attr("y1", lineY)
          .attr("x2", margins.left + barW).attr("y2", lineY);
    }

    // 값 레이블 추가
    const { x: cx, y: cy } = getCenter(barNode, orientation, margins);
    const pad = 12;
    const x = orientation === "horizontal" ? cx + pad : cx;
    const y = orientation === "horizontal" ? cy : cy - pad;
    svg.append("text")
      .attr("class", "value-tag").attr("x", x).attr("y", y)
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("font-size", 12).attr("fill", color)
      .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
      .text(value);
  }

  // 비교 결과 헤더를 표시하는 헬퍼 함수
  function showHeader(ok, lKey, oper, rKey) {
    const plotW = +svg.attr("data-plot-w");
    const plotH = +svg.attr("data-plot-h");
    const symbol = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", ne: "≠" }[oper] || oper;
    const text = `${lKey} ${symbol} ${rKey} → ${ok}`;
    const fill = ok ? "#2e7d32" : "#c62828";
    const x = margins.left + plotW / 2;
    const y = margins.top - 10;
    svg.append("text").attr("class", "compare-label")
      .attr("x", x).attr("y", y)
      .attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", "bold").attr("fill", fill)
      .text(text);
  }

  // 애니메이션이 끝난 후, 각 막대에 선과 레이블을 추가
  addAnnotations(leftBar, lv, leftColor);
  addAnnotations(rightBar, rv, rightColor);
  showHeader(ok, op.left, op.operator, op.right);
  
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
  //svg.append("text").attr("class", "sort-label").attr("x", mL).attr("y", mT - 10).attr("font-size", 12).attr("fill", hlColor).text(`Order: ${sortedData.map(d => d[keyField]).join(" → ")}`);
  
  return sortedData;
}