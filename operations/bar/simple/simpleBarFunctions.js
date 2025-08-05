// simpleBarFunctions.js
function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const orientation = svg.attr("data-orientation") || "vertical";
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const margins = {
        left: +svg.attr("data-m-left") || 0,
        top: +svg.attr("data-m-top") || 0,
    };
    const plot = {
        w: +svg.attr("data-plot-w") || 0,
        h: +svg.attr("data-plot-h") || 0,
    };
    const g = svg.select("g");
    return { svg, g, orientation, xField, yField, margins, plot };
}


function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}
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
    const x0 = +bar.getAttribute("x"), y0 = +bar.getAttribute("y"),
          w = +bar.getAttribute("width"), h = +bar.getAttribute("height");
    if (orientation === "horizontal") {
        return { x: x0 + w + 4 + margins.left, y: y0 + h / 2 + margins.top };
    } else {
        return { x: x0 + w / 2 + margins.left, y: y0 - 6 + margins.top };
    }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const matchColor = "#ffa500";
    const baseColor = "#69b3a2";

    // 데이터 필터링
    const filterField = op.field || yField;
    const satisfyMap = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a == b };
    const satisfy = satisfyMap[op.satisfy] || (() => true);
    const filterKey = isNaN(+op.key) ? op.key : +op.key;
    const filteredData = data.filter(d => {
        const value = isNaN(+d[filterField]) ? d[filterField] : +d[filterField];
        return satisfy(value, filterKey);
    });

    // --- 1단계: 원본 차트에서 하이라이트 ---
    const targetIds = new Set(filteredData.map(d => d[xField]));
    const allBars = g.selectAll("rect");
    const highlightPromises = [];

    allBars.each(function() {
        const bar = d3.select(this);
        const d = bar.datum();
        const isTarget = d ? targetIds.has(d[xField]) : false;
        const t = bar.transition().duration(1200) // 하이라이트 과정을 길게 보여주기
            .attr("fill", isTarget ? matchColor : baseColor)
            .attr("opacity", isTarget ? 1.0 : 0.2)
            .end();
        highlightPromises.push(t);
    });
    await Promise.all(highlightPromises);

    // --- 2단계: 필터링된 막대들로 재구성 (Transform) ---
    if (filteredData.length === 0) {
        console.warn("simpleBarFilter: Filtered data is empty.");
        allBars.transition().duration(500).attr("opacity", 0).remove();
        return [];
    }
    
    const transformPromises = [];
    const yScaleFull = d3.scaleLinear().domain([0, d3.max(data, d => +d[yField]) || 0]).nice().range([plot.h, 0]);
    const xScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d[xField])).range([0, plot.w]).padding(0.2);
    const bars = g.selectAll("rect").data(filteredData, d => d[xField]);

    transformPromises.push(bars.exit().transition().duration(800)
        .attr("height", 0).attr("y", plot.h).remove().end());
    
    transformPromises.push(bars.transition().duration(800)
        .attr("x", d => xScaleFiltered(d[xField])).attr("width", xScaleFiltered.bandwidth()).end());

    transformPromises.push(g.select(".x-axis").transition().duration(800)
        .call(d3.axisBottom(xScaleFiltered)).end());

    await Promise.all(transformPromises);

    // --- 최종 주석 및 레이블 추가 ---
    if (!isNaN(filterKey)) {
        const yPos = yScaleFull(filterKey);
        svg.append("line").attr("class", "threshold-line")
            .attr("x1", margins.left).attr("y1", margins.top + yPos)
            .attr("x2", plot.w + margins.left).attr("y2", margins.top + yPos)
            .attr("stroke", "blue").attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
        
        // vvv --- 레이블 수정 및 위치 변경 --- vvv
        svg.append("text").attr("class", "threshold-label")
            .attr("x", margins.left + plot.w + 5) // 오른쪽 바깥으로 5px 이동
            .attr("y", margins.top + yPos)
            .attr("text-anchor", "start") // 왼쪽 정렬
            .attr("dominant-baseline", "middle") // Y축 중앙 정렬
            .attr("fill", "blue").attr("font-size", 12).attr("font-weight", "bold")
            .text(filterKey); // '기준:' 글자 삭제
    }

    g.selectAll("rect").each(function() {
        const bar = this;
        const val = bar.getAttribute("data-value");
        svg.append("text").attr("class", "value-tag")
            .attr("x", getCenter(bar, "vertical", margins).x)
            .attr("y", getCenter(bar, "vertical", margins).y)
            .attr("text-anchor", "middle").attr("font-size", 10)
            .attr("fill", "#000").attr("stroke", "white").attr("stroke-width", 2).attr("paint-order", "stroke")
            .text(val);
    });
    
    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 8)
        .attr("font-size", 12).attr("fill", matchColor).attr("font-weight", "bold")
        .text(`Filter: ${filterField} ${op.satisfy} ${op.key}`);

    return filteredData;
}




// simpleBarFunctions.js의 simpleBarFindExtremum 함수 (수정 완료)

export async function simpleBarFindExtremum(chartId, op, data) {
    const { svg, g, xField, yField, margins, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const baseColor = "#69b3a2";
    const hlColor = "#a65dfb";
    const duration = 600;

    // 현재 보이는 막대들의 데이터를 기반으로 작업
    const currentData = g.selectAll("rect").data();
    if (currentData.length === 0) {
        console.warn("findExtremum: No bars found to process.");
        return data;
    }

    // 부드러운 리셋: 모든 막대를 기본 색상으로
    g.selectAll("rect").transition().duration(300).attr("fill", baseColor);

    // 극값 찾기
    const valueField = orientation === 'vertical' ? yField : xField;
    const vals = currentData.map(d => +d[valueField]);
    const extremumFunc = op.type === "min" ? d3.min : d3.max;
    const extremeVal = extremumFunc(vals);
    
    const target = g.selectAll("rect").filter(d => +d[valueField] === extremeVal);

    if (target.empty()) {
        console.warn("findExtremum: target bar not found");
        return data;
    }

    // --- 애니메이션 순서 제어 ---

    // 1단계: 목표 막대 하이라이트
    await target.transition().duration(duration)
        .attr("fill", hlColor)
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .end();

    const node = target.node();
    if (node) {
        const barX = +node.getAttribute("x");
        const barY = +node.getAttribute("y");
        const barW = +node.getAttribute("width");
        const barH = +node.getAttribute("height");
        
        // 2단계: 수평선 애니메이션 (선이 그려지는 효과)
        const lineY = margins.top + (orientation === 'vertical' ? barY : barY + barH / 2);
        const finalX2 = margins.left + (orientation === 'vertical' ? barX + barW / 2 : barW);

        const line = svg.append("line")
            .attr("class", "annotation")
            .attr("stroke", hlColor)
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4 4")
            .attr("x1", margins.left)
            .attr("y1", lineY)
            .attr("x2", margins.left) // 시작점은 Y축
            .attr("y2", lineY);

        await line.transition().duration(400) // 0.4초 동안 선이 그려짐
            .attr("x2", finalX2)
            .end();

        // 3단계: 값 레이블 애니메이션 (fade in 효과)
        const { x, y } = getCenter(node, orientation, margins);
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
            .text(labelText)
            .attr("opacity", 0) // 처음엔 투명
            .transition().duration(400) // 0.4초 동안 나타남
            .attr("opacity", 1);
    }

    return currentData;
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
// simpleBarFunctions.js의 simpleBarDetermineRange 함수 (최종 수정 완료)

export async function simpleBarDetermineRange(chartId, op, data, fullData) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // --- 1. 불필요한 색상 변경 코드 삭제 ---
    // g.selectAll("rect").transition()...attr("fill", "#d3d3d3");

    const valueField = orientation === 'vertical' ? yField : xField;
    const values = data.map(d => +d[valueField]); // 현재 데이터(필터링된 데이터)에서 min/max 찾기
    const minV = d3.min(values);
    const maxV = d3.max(values);

    // --- 2. 중요: 현재 보이는 Y축과 동일한 스케일을 만들기 위해 'fullData'를 사용 ---
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(fullData, d => +d[yField]) || 0]) // 원본 데이터의 최댓값 사용
        .nice()
        .range([plot.h, 0]);

    const hlColor = "blue";

    // 이하 로직은 이전과 동일
    [
        { value: minV, label: "Min" },
        { value: maxV, label: "Max" }
    ].forEach(item => {
        if (item.value === undefined) return;
        const yPos = margins.top + yScale(item.value);

        svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left + plot.w)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left - 20).attr("y", yPos)
            .attr("text-anchor", "end").attr("dominant-baseline", "middle")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .text(`${item.label}: ${item.value}`);
    });

    if (minV !== undefined && maxV !== undefined) {
        const rangeText = `Range: ${minV} ~ ${maxV}`;
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor).text(rangeText);
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