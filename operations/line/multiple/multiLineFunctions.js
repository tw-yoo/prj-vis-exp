/**
 * multipleLineRetrieveValue
 * 멀티라인 차트에서 특정 시리즈(seriesField/seriesKey)와 날짜(keyField/key)에 해당하는 값만 강조합니다.
 *
 * @param {string} chartId - 차트 컨테이너 ID
 * @param {object} op      - { seriesField?, seriesKey?, field, keyField, key }
 */
export function multipleLineRetrieveValue(chartId, op) {
  console.log("[multipleLine] retrieveValue called:", op);
  const {
    seriesField,
    seriesKey,
    field: yField,
    keyField,
    key: keyValue
  } = op;

  // 1) SVG 선택
  const svg = d3.select(`#${chartId} svg`);
  if (svg.empty()) {
    console.warn("[multipleLine] retrieveValue: SVG not found");
    return chartId;
  }

  // 2) 이전 강조 제거
  svg.selectAll(".retrieval-line, .retrieval-point, .retrieval-label").remove();

  // 3) series-line paths 중, seriesField/seriesKey가 지정된 경우 해당 시리즈만 필터
  let paths = svg.selectAll("path.series-line");
  if (seriesField && seriesKey) {
    paths = paths.filter(function(datum) {
      // datum은 배열, 첫 요소에서 seriesField 비교
      const first = Array.isArray(datum) ? datum[0] : null;
      return first && first[seriesField] == seriesKey;
    });
  }
  const pathEls = paths.nodes();
  if (!pathEls.length) {
    console.warn("[multipleLine] retrieveValue: no matching series for", seriesField, seriesKey);
    return chartId;
  }

  // 4) 모든 datum 수집 (필터된 시리즈만)
  let allSeries = [];
  pathEls.forEach(el => {
    const arr = d3.select(el).datum();
    if (Array.isArray(arr)) allSeries = allSeries.concat(arr);
  });
  if (!allSeries.length) {
    console.warn("[multipleLine] retrieveValue: no data in filtered series");
    return chartId;
  }

  // 5) keyField/keyValue로 매칭되는 포인트 찾기
  const parsedKey = new Date(keyValue).getTime();
  const matches = allSeries.filter(pt => {
    const v = pt[keyField];
    return v instanceof Date
      ? v.getTime() === parsedKey
      : v == keyValue;
  });
  if (!matches.length) {
    console.warn("[multipleLine] retrieveValue: no matching points for key", keyValue);
    return chartId;
  }

  // 6) 스케일 재생성
  const width  = +svg.attr("width");
  const height = +svg.attr("height");
  const margin = { top: 40, right: 120, bottom: 50, left: 60 };
  const xVals     = allSeries.map(d => d[keyField]);
  const yVals     = allSeries.map(d => d[yField]);
  const isTemporal = xVals[0] instanceof Date;

  const xScale = isTemporal
    ? d3.scaleTime().domain(d3.extent(xVals)).range([margin.left, width - margin.right])
    : d3.scalePoint().domain([...new Set(xVals)]).range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(yVals)]).nice()
    .range([height - margin.bottom, margin.top]);

  // 7) 강조 애니메이션
  const duration = 600;
  matches.forEach(pt => {
    const cx = xScale(pt[keyField]);
    const cy = yScale(pt[yField]);

    // 수직선
    svg.append("line")
      .attr("class", "retrieval-line")
      .attr("x1", cx).attr("x2", cx)
      .attr("y1", height - margin.bottom)
      .attr("y2", height - margin.bottom)
      .attr("stroke", "#ffa500").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 2")
      .transition().duration(duration)
      .attr("y2", cy);

    // 원
    svg.append("circle")
      .attr("class", "retrieval-point")
      .attr("cx", cx).attr("cy", cy)
      .attr("r", 0)
      .attr("fill", "#ffa500").attr("stroke", "#fff").attr("stroke-width", 1.5)
      .transition().duration(duration)
      .attr("r", 6);

    // 라벨
    svg.append("text")
      .attr("class", "retrieval-label")
      .attr("x", cx + 8).attr("y", cy - 8)
      .attr("fill", "#ffa500").attr("font-size", "12px").attr("font-weight", "bold")
      .style("opacity", 0)
      .text(pt[yField].toLocaleString())
      .transition().duration(duration)
      .style("opacity", 1);
  });

  return chartId;
}


export async function multipleLineFilter(chartId, op) {
  console.log("[multipleLine] Filter called", { chartId, op });
  return chartId;
}

export async function multipleLineFindExtremum(chartId, op) {
  console.log("[multipleLine] FindExtremum called", { chartId, op });
  return chartId;
}

export async function multipleLineDetermineRange(chartId, op) {
  console.log("[multipleLine] DetermineRange called", { chartId, op });
  return chartId;
}

export async function multipleLineCompare(chartId, op) {
  console.log("[multipleLine] Compare called", { chartId, op });
  return chartId;
}

export async function multipleLineSort(chartId, op) {
  console.log("[multipleLine] Sort called", { chartId, op });
  return chartId;
}
