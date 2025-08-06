// groupedBarFunctions.js (최종 수정본 - import 경로 문제 해결)

// --- 여기가 핵심 수정 부분: import 경로를 올바르게 수정합니다. ---
import { getSvgAndSetup as simpleGetSvgAndSetup } from "../simple/simpleBarFunctions.js"; // ../simpleBar/ -> ../simple/

// --- 헬퍼 함수 ---
export function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const g = svg.select(".plot-area");
    const margins = { left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top") };
    const plot = { w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h") };
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const facetField = svg.attr("data-facet-field");
    const colorField = svg.attr("data-color-field");
    return { svg, g, margins, plot, xField, yField, facetField, colorField };
}

export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- 오퍼레이션 함수 ---

// 원본 그룹 차트에서 특정 막대의 값을 확인하는 함수
export async function groupedBarRetrieveValue(chartId, op, data, fullData) {
    const { svg, g, margins } = getSvgAndSetup(chartId);

    const targetId = `${op.facet}-${op.key}`;
    const hlColor = "#ff6961";
    
    const target = g.selectAll("rect").filter(`[data-id="${targetId}"]`);
    const otherBars = g.selectAll("rect").filter(`:not([data-id="${targetId}"])`);

    if (target.empty()) return data;

    await Promise.all([
        target.transition().duration(600).attr("stroke", hlColor).attr("stroke-width", 3).end(),
        otherBars.transition().duration(600).attr("opacity", 0.3).end()
    ]);

    const barNode = target.node();
    const val = target.datum().value;
    
    const x0 = +barNode.getAttribute("x"), y0 = +barNode.getAttribute("y"),
          w = +barNode.getAttribute("width");
    const groupTransform = d3.select(barNode.parentNode).attr("transform");
    const groupX = +groupTransform.substring(groupTransform.indexOf("(") + 1, groupTransform.indexOf(","));

    const absX = margins.left + groupX + x0 + w / 2;
    const absY = margins.top + y0 - 5;
    
    svg.append("text").attr("class", "annotation")
        .attr("x", absX).attr("y", absY)
        .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
        .attr("fill", hlColor).attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(val.toLocaleString());

    return data;
}
// groupedBarFunctions.js의 groupedBarFocus 함수 (수정 완료)

export async function groupedBarFocus(chartId, op, data, fullData) {
    const { svg, g, plot, yField, facetField, xField } = getSvgAndSetup(chartId);

    const focusKey = op.key;
    const transformedData = fullData.filter(d => d[xField] === focusKey);

    const targetRects = g.selectAll("rect").filter(d => d && d.key === focusKey);
    const otherRects = g.selectAll("rect").filter(d => d && d.key !== focusKey);

    const newYMax = d3.max(transformedData, d => d[yField]);
    const newYScale = d3.scaleLinear().domain([0, newYMax]).nice().range([plot.h, 0]);
    
    // 변환 후의 새로운 X축은 원래의 facet(age)이 됩니다.
    const facets = Array.from(new Set(fullData.map(d => d[facetField])));
    const newXScale = d3.scaleBand().domain(facets).range([0, plot.w]).padding(0.2);
    
    const animationPromises = [];
    
    // 선택되지 않은 막대들(Male)은 사라집니다.
    animationPromises.push(otherRects.transition().duration(800)
        .attr("width", 0).attr("opacity", 0).remove().end());

    // 선택된 막대들(Female)은 새로운 X, Y 스케일에 맞춰 변환됩니다.
    animationPromises.push(targetRects.transition().duration(1000)
        .attr("x", d => newXScale(d.facet))
        .attr("width", newXScale.bandwidth())
        .attr("y", d => newYScale(d.value))
        .attr("height", d => plot.h - newYScale(d.value))
        .end());
        
    // Y축과 X축을 새로운 스케일에 맞게 업데이트합니다.
    animationPromises.push(g.select(".y-axis").transition().duration(1000)
        .call(d3.axisLeft(newYScale)).end());
        
    animationPromises.push(g.select(".x-axis-top-labels").transition().duration(1000)
        .attr("opacity", 0).end()); // 상단 그룹 라벨은 숨깁니다.

    animationPromises.push(g.select(".x-axis-bottom-line").transition().duration(1000)
        .call(d3.axisBottom(newXScale)).end());

    await Promise.all(animationPromises);

    // --- 여기가 핵심 수정 부분 ---
    // 차트가 변신했음을 SVG 정보에 업데이트합니다.
    svg.attr("data-x-field", facetField); // 새로운 xField는 이제 'age' 입니다.
    svg.attr("data-y-field", yField);     // yField는 'people' 그대로입니다.
    // --- 수정 끝 ---

    const { margins } = simpleGetSvgAndSetup(chartId);
    svg.append("text").attr("class", "filter-label")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight", "bold")
      .attr("fill", "#007bff").text(`Focused on: '${focusKey}'`);

    return transformedData;
}