// make sure these helpers are in scope (either above or imported)
function getOrientation(svg) {
  return svg.attr("data-orientation") || "vertical";
}
function getMargins(svg) {
  return {
    left: +svg.attr("data-m-left") || 0,
    top:  +svg.attr("data-m-top")  || 0
  };
}
function getCenter(bar, orientation, margins) {
  const x0 = +bar.getAttribute("x"),
        y0 = +bar.getAttribute("y"),
        w  = +bar.getAttribute("width"),
        h  = +bar.getAttribute("height");

  if (orientation === "horizontal") {
    // put label just to the right of the bar, vertically centered
    return {
      x: x0 + w + 4 + margins.left,
      y: y0 + h/2 + margins.top
    };
  } else {
    // put label above the bar, horizontally centered
    return {
      x: x0 + w/2 + margins.left,
      y: y0 - 6  + margins.top
    };
  }
}

export function simpleBarRetrieveValue(chartId, op) {
  console.log("[RetrieveValue] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  // reset old highlights
  const bars = svg.selectAll("rect");
  bars.interrupt()
      .attr("fill", "#69b3a2")
      .attr("stroke", "none")
      .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  // highlight target bar
  const target = bars.filter(function () {
    return d3.select(this).attr("data-id") === `${op.key}`;
  });
  target.transition().duration(600)
        .attr("fill", "#ff6961")
        .attr("stroke", "black")
        .attr("stroke-width", 2);

  const bar = target.node();
  if (bar) {
    // 1) determine orientation & margins
    const orientation = getOrientation(svg);
    const margins    = getMargins(svg);

    // 2) compute center for annotation
    const { x, y } = getCenter(bar, orientation, margins);

    // 3) draw the value
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

  return chartId;
}

// Assumes getOrientation(svg), getMargins(svg), getCenter(bar, orientation, margins) helpers are available
export function simpleBarFilter(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const duration   = 600;
  const origColor  = "#69b3a2";
  const matchColor = "#ffa500";
  const dimOpacity = 0.15;

  // reset any previous styles and labels
  const bars = svg.selectAll("rect");
  bars.interrupt()
      .attr("fill", origColor)
      .attr("opacity", 1)
      .attr("stroke", "none");
  svg.selectAll(".filter-label, .value-label").remove();

  // determine orientation & margins for label positioning
  const orientation = getOrientation(svg);
  const margins = getMargins(svg);

  // predicate functions
  const satisfyMap = {
    ">":  (a, b) => a > b,
    ">=": (a, b) => a >= b,
    "<":  (a, b) => a < b,
    "<=": (a, b) => a <= b,
    "==": (a, b) => a === b
  };
  const satisfy = satisfyMap[op.satisfy] || (() => true);

  // apply filter and highlight passing bars
  bars.each(function() {
    const node = d3.select(this);
    const val  = +node.attr("data-value");
    const pass = satisfy(val, op.key);

    node.transition()
        .duration(duration)
        .attr("fill",    pass ? matchColor : origColor)
        .attr("opacity", pass ? 1 : dimOpacity);

    if (pass) {
      // compute base center for label
      const barEl = node.node();
      const { x: baseX, y: baseY } = getCenter(barEl, orientation, margins);
      // add extra spacing
      const x = orientation === 'horizontal' ? baseX + 8 : baseX;
      const y = orientation === 'horizontal' ? baseY : baseY - 8;

      svg.append("text")
         .attr("class", "value-label")
         .attr("x", x)
         .attr("y", y)
         .attr("text-anchor", "middle")
         .attr("dominant-baseline", "central")
         .attr("font-size", 12)
         .attr("fill", matchColor)
         .text(val);
    }
  });

  // add overall filter summary label
  svg.append("text")
     .attr("class", "filter-label")
     .attr("x", margins.left + 8)
     .attr("y", margins.top + 14)
     .attr("font-size", 12)
     .attr("fill", matchColor)
     .text(`Filter: value ${op.satisfy} ${op.key}`);

  return chartId;
}

// Assumes getOrientation(svg), getMargins(svg), getCenter(bar, orientation, margins) helpers are available
export function simpleBarFindExtremum(chartId, op) {
  console.log("[findExtremum] called", op);
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const duration  = 600;
  const hlColor   = "#a65dfb";
  const origColor = "#69b3a2";

  // reset previous highlights and labels
  const bars = svg.selectAll("rect");
  bars.interrupt()
      .attr("fill", origColor)
      .attr("stroke", "none")
      .attr("opacity", 1);
  svg.selectAll(".annotation, .filter-label").remove();

  // compute values for each bar
  const field = op.field || "value";
  const getVal = el => {
    const row = d3.select(el).datum() || {};
    return field in row ? +row[field] : +el.getAttribute("data-value");
  };
  const vals = bars.nodes().map(getVal);

  // determine target bar index
  const idx = op.type === "min"
    ? vals.indexOf(d3.min(vals))
    : vals.indexOf(d3.max(vals));
  if (idx === -1) {
    console.warn("findExtremum: target bar not found");
    return chartId;
  }

  const extremeVal = vals[idx];
  const target = bars.filter((d, i) => i === idx);

  // highlight the extremum bar
  target.transition()
        .duration(duration)
        .attr("fill", hlColor)
        .attr("stroke", "black")
        .attr("stroke-width", 2);

  // position label with extra padding
  const node = target.node();
  if (node) {
    const orientation = getOrientation(svg);
    const margins    = getMargins(svg);
    const { x: baseX, y: baseY } = getCenter(node, orientation, margins);

    const padding = 12;
    const x = orientation === "horizontal"
              ? baseX + padding
              : baseX;
    const y = orientation === "horizontal"
              ? baseY
              : baseY - padding;

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

  return chartId;
}


// Assumes getOrientation(svg), getMargins(svg), getCenter(bar, orientation, margins) helpers are available
export function simpleBarCompare(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  const bars = svg.selectAll("rect");
  if (bars.empty()) return chartId;

  // 0) reset styling & remove old labels
  const origColor = "#69b3a2";
  bars.interrupt().attr("fill", origColor).attr("stroke", "none");
  svg.selectAll(".compare-label, .value-tag").remove();

  // 1) pull out field names from op
  const { keyField = "id", field = "value" } = op;

  // comparator 함수
  const cmp = {
    gt:  (a, b) => a >  b,
    gte: (a, b) => a >= b,
    lt:  (a, b) => a <  b,
    lte: (a, b) => a <= b,
    eq:  (a, b) => a === b,
    ne:  (a, b) => a !== b,
  }[op.operator];
  if (!cmp) {
    console.warn("simpleBarCompare: bad operator", op.operator);
    return chartId;
  }

  // orientation & margins
  const orientation = getOrientation(svg);
  const { left: marginL, top: marginT } = getMargins(svg);
  const plotW = +svg.attr("data-plot-w");
  const plotH = +svg.attr("data-plot-h");

  // 2) datum 기반으로 bar 선택
  const selBar = keyValue =>
    bars.filter(d => d[keyField] == keyValue);

  // highlight & label for each bar
  function highlight(selection, value, color) {
    selection.attr("fill", color).attr("stroke", "black");
    const barNode = selection.node();
    const { x: cx, y: cy } = getCenter(barNode, orientation, { left: marginL, top: marginT });
    const pad = 12;
    const x = orientation === "horizontal" ? cx + pad : cx;
    const y = orientation === "horizontal" ? cy : cy - pad;

    svg.append("text")
       .attr("class", "value-tag")
       .attr("x", x)
       .attr("y", y)
       .attr("text-anchor", "middle")
       .attr("dominant-baseline", "central")
       .attr("font-size", 12)
       .attr("fill", color)
       .text(value);
  }

  // header label showing comparison result
  function showHeader(ok, lKey, oper, rKey) {
    const symbol = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", ne: "≠" }[oper] || oper;
    const text = `${lKey} ${symbol} ${rKey} → ${ok}`;

    if (orientation === "horizontal") {
      const x = marginL + plotW + 16;
      const y = marginT + plotH / 2;
      svg.append("text")
         .attr("class", "compare-label")
         .attr("x", x)
         .attr("y", y)
         .attr("text-anchor", "start")
         .attr("dominant-baseline", "middle")
         .attr("font-size", 13)
         .attr("font-weight", "bold")
         .attr("fill", ok ? "#2e7d32" : "#c62828")
         .text(text);
    } else {
      const x = marginL + plotW / 2;
      const y = marginT - 8;
      svg.append("text")
         .attr("class", "compare-label")
         .attr("x", x)
         .attr("y", y)
         .attr("text-anchor", "middle")
         .attr("font-size", 13)
         .attr("font-weight", "bold")
         .attr("fill", ok ? "#2e7d32" : "#c62828")
         .text(text);
    }
  }

  // 3) 두 바 비교
  const leftBar  = selBar(op.left);
  const rightBar = selBar(op.right);
  if (leftBar.empty() || rightBar.empty()) {
    console.warn("simpleBarCompare: bar not found for", op.left, op.right);
    return chartId;
  }

  const lv = +leftBar.datum()[field];
  const rv = +rightBar.datum()[field];
  const ok = cmp(lv, rv);

  highlight(leftBar,  lv, "#ffb74d");
  highlight(rightBar, rv, "#64b5f6");
  showHeader(ok, op.left, op.operator, op.right);

  return chartId;
}

export function simpleBarDetermineRange(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  // 리셋
  const orig = "#69b3a2", hl = "#ffb74d";
  svg.selectAll("rect").interrupt().attr("fill", orig).attr("stroke", null);
  svg.selectAll(".range-line, .delta-label, .annotation").remove();

  const orientation = getOrientation(svg);
  const { left: mL, top: mT } = getMargins(svg);
  const plotW = +svg.attr("data-plot-w"), plotH = +svg.attr("data-plot-h");
  const bars = svg.selectAll("rect");
  const vals = bars.nodes().map(el => +el.getAttribute("data-value"));
  const minV = d3.min(vals), maxV = d3.max(vals), delta = +(maxV - minV).toFixed(1);
  const pad = 12;

  if (orientation === "horizontal") {
    // bar 노드에서 x, width 직접 읽어서 끝 위치 계산
    const minNode = bars.nodes()[vals.indexOf(minV)];
    const maxNode = bars.nodes()[vals.indexOf(maxV)];
    const xMinEnd = mL + (+minNode.getAttribute("x") + +minNode.getAttribute("width"));
    const xMaxEnd = mL + (+maxNode.getAttribute("x") + +maxNode.getAttribute("width"));
    // y 위치는 bar의 중앙이나 상단 대신, 첫번째 bar 상단 바로 위에 고정
    const yLine = +minNode.getAttribute("y") + mT + pad/2;

    // 수직 점선
    [xMinEnd, xMaxEnd].forEach(x =>
      svg.append("line")
         .attr("class","range-line")
         .attr("x1", x).attr("x2", x)
         .attr("y1", mT).attr("y2", mT + plotH)
         .attr("stroke", hl).attr("stroke-width",2)
         .attr("stroke-dasharray","4 4")
    );

    // 수평 커넥터
    svg.append("line")
       .attr("class","range-line")
       .attr("x1", xMinEnd).attr("x2", xMaxEnd)
       .attr("y1", yLine).attr("y2", yLine)
       .attr("stroke", hl).attr("stroke-width",2)
       .attr("stroke-dasharray","4 4");

    // Δ 레이블
    svg.append("text")
       .attr("class","delta-label")
       .attr("x",(xMinEnd+xMaxEnd)/2)
       .attr("y", yLine - pad/2)
       .attr("text-anchor","middle")
       .attr("font-size",12)
       .attr("fill",hl)
       .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
       .text(`Δ ${delta}`);

    // 어노테이션
    [{v:minV,x:xMinEnd},{v:maxV,x:xMaxEnd}].forEach(({v,x})=>{
      svg.append("text")
         .attr("class","annotation")
         .attr("x", x + pad)
         .attr("y", yLine)
         .attr("text-anchor","middle")
         .attr("font-size",12)
         .attr("fill",hl)
         .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
         .text(v);
    });

  } else {
    // vertical 바: y 끝 위치 계산
    const minNode = bars.nodes()[vals.indexOf(minV)];
    const maxNode = bars.nodes()[vals.indexOf(maxV)];
    const yMinEnd = mT + (+minNode.getAttribute("y"));
    const yMaxEnd = mT + (+maxNode.getAttribute("y"));
    const xLine   = mL + plotW + pad/2;

    // 수평 점선
    [yMinEnd, yMaxEnd].forEach(y=>
      svg.append("line")
         .attr("class","range-line")
         .attr("x1", mL).attr("x2", mL+plotW)
         .attr("y1", y).attr("y2", y)
         .attr("stroke", hl).attr("stroke-width",2)
         .attr("stroke-dasharray","4 4")
    );

    // 수직 커넥터
    svg.append("line")
       .attr("class","range-line")
       .attr("x1", xLine).attr("x2", xLine)
       .attr("y1", yMinEnd).attr("y2", yMaxEnd)
       .attr("stroke", hl).attr("stroke-width",2)
       .attr("stroke-dasharray","4 4");

    // Δ 레이블
    svg.append("text")
       .attr("class","delta-label")
       .attr("x", xLine + pad/2)
       .attr("y", (yMinEnd+yMaxEnd)/2)
       .attr("dominant-baseline","middle")
       .attr("font-size",12)
       .attr("fill",hl)
       .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
       .text(`Δ ${delta}`);

    // 어노테이션
    [{v:minV,y:yMinEnd},{v:maxV,y:yMaxEnd}].forEach(({v,y})=>{
      svg.append("text")
         .attr("class","annotation")
         .attr("x", mL+plotW+pad)
         .attr("y", y - pad/2)
         .attr("text-anchor","middle")
         .attr("font-size",12)
         .attr("fill",hl)
         .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke")
         .text(v);
    });
  }

  return chartId;
}



export function simpleBarSort(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg");
  if (svg.empty()) return chartId;

  // 0) 기본 설정
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
  
  // op 파싱
  const { field = valueField, order = "descending", limit = 0 } = op;

  // 1) 기존 차트의 바인딩된 데이터 가져오기
  const data = g.selectAll("rect").data();
  if (!data || data.length === 0) return chartId;

  // 2) 데이터 정렬
  const sortedData = data.slice().sort((a, b) => {
    const valA = a[field];
    const valB = b[field];
    if (isNaN(valA) || isNaN(valB)) {
      console.warn("Sorting encountered a NaN value.");
      return 0;
    }
    return order === "ascending" ? valA - valB : valB - valA;
  });

  // 3) 상위 N개 하이라이트
  const topN = limit > 0 ? sortedData.slice(0, Math.min(limit, sortedData.length)) : [];

  // 4) 스케일 업데이트 및 애니메이션
  if (orientation === "vertical") {
    // 스케일 재정의
    const xScale = d3.scaleBand()
      .domain(sortedData.map(d => d[xField]))
      .range([0, plotW])
      .padding(0.2);
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d[yField])]).nice()
      .range([plotH, 0]);

    // rect 업데이트
    g.selectAll("rect")
      .data(sortedData, d => d[keyField])
      .transition().duration(duration)
      .attr("x", d => xScale(d[xField]))
      .attr("y", d => yScale(d[yField]))
      .attr("width", xScale.bandwidth())
      .attr("height", d => plotH - yScale(d[yField]))
      .attr("fill", d => topN.some(item => item[keyField] === d[keyField]) ? hlColor : origColor);
      
    // X축 업데이트
    g.select(".x-axis")
      .transition().duration(duration)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");
      
    // 값 레이블 업데이트
    g.selectAll(".value-tag")
      .data(sortedData, d => d[keyField])
      .join("text")
      .transition().duration(duration)
      .attr("x", d => xScale(d[xField]) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d[yField]) - 6)
      .attr("text-anchor", "middle")
      .attr("fill", d => topN.some(item => item[keyField] === d[keyField]) ? hlColor : "black")
      .text(d => d[yField]);
  } else {
    // 가로 막대
    const yScale = d3.scaleBand()
      .domain(sortedData.map(d => d[yField]))
      .range([0, plotH])
      .padding(0.2);
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d[xField])]).nice()
      .range([0, plotW]);

    // rect 업데이트
    g.selectAll("rect")
      .data(sortedData, d => d[keyField])
      .transition().duration(duration)
      .attr("x", 0)
      .attr("y", d => yScale(d[yField]))
      .attr("width", d => xScale(d[xField]))
      .attr("height", yScale.bandwidth())
      .attr("fill", d => topN.some(item => item[keyField] === d[keyField]) ? hlColor : origColor);

    // Y축 업데이트
    g.select(".y-axis")
      .transition().duration(duration)
      .call(d3.axisLeft(yScale));
      
    // 값 레이블 업데이트
    g.selectAll(".value-tag")
      .data(sortedData, d => d[keyField])
      .join("text")
      .transition().duration(duration)
      .attr("x", d => xScale(d[xField]) + 6)
      .attr("y", d => yScale(d[yField]) + yScale.bandwidth() / 2)
      .attr("dominant-baseline", "middle")
      .attr("fill", d => topN.some(item => item[keyField] === d[keyField]) ? hlColor : "black")
      .text(d => d[xField]);
  }
  
  // 정렬 순서 요약 레이블 업데이트
  svg.selectAll(".sort-label").remove();
  svg.append("text")
    .attr("class", "sort-label")
    .attr("x", mL)
    .attr("y", mT - 10)
    .attr("font-size", 12)
    .attr("fill", hlColor)
    .text(`Order: ${sortedData.map(d => d[keyField]).join(" → ")}`);
    
  return chartId;
}