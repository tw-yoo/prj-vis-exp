// stackedBarFunctions.js (최종 단순화 버전)

// --- 헬퍼 함수 ---
export function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const orientation = svg.attr("data-orientation");
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const colorField = svg.attr("data-color-field");
    const margins = {
        left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top")
    };
    const plot = {
        w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h")
    };
    const g = svg.select(".plot-area");
    return { svg, g, orientation, xField, yField, colorField, margins, plot };
}

export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .value-line, .value-tag, .filter-label, .threshold-line, .extremum-highlight, .compare-label").remove();
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- 유일한 오퍼레이션 함수 ---
export async function stackedBarChangeToSimple(chartId, op, currentData, fullData) {
    const { svg, xField, yField, colorField, plot, margins } = getSvgAndSetup(chartId);
    
    let filteredData = [...fullData];
    if (op.subgroupKey) {
        filteredData = filteredData.filter(d => d[colorField] === op.subgroupKey);
    }
    if (op.key !== undefined && op.satisfy) {
        const cmp = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a == b };
        const satisfyFn = cmp[op.satisfy];
        if (satisfyFn) {
            filteredData = filteredData.filter(d => satisfyFn(d[yField], op.key));
        }
    }
    
    const targetIds = new Set(filteredData.map(d => `${d[xField]}-${d[colorField]}`));
    const chartRects = svg.select(".plot-area").selectAll("rect");

    const highlightPromises = [];
    chartRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        const isTarget = d ? targetIds.has(`${d.key}-${d.subgroup}`) : false;
        const t = rect.transition().duration(800)
            .attr("opacity", isTarget ? 1.0 : 0.2)
            .attr("stroke", isTarget ? "black" : "none")
            .attr("stroke-width", 1).end();
        highlightPromises.push(t);
    });
    await Promise.all(highlightPromises);
    await delay(1000);

    if (filteredData.length === 0) {
        console.warn("Filter resulted in no matching bars.");
        chartRects.transition().duration(500).attr("opacity", 0).remove();
        return [];
    }
    
    const transformPromises = [];
    const fadeOut = chartRects.filter(d => !targetIds.has(`${d.key}-${d.subgroup}`))
        .transition().duration(500).attr("opacity", 0).remove().end();
    transformPromises.push(fadeOut);
    
    const selectedRects = chartRects.filter(d => targetIds.has(`${d.key}-${d.subgroup}`));
    const newYMax = d3.max(filteredData, d => d[yField]);
    const newYScale = d3.scaleLinear().domain([0, newYMax || 1]).nice().range([plot.h, 0]);

    selectedRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        const t = rect.transition().duration(1000)
            .attr("y", newYScale(d.value))
            .attr("height", plot.h - newYScale(d.value))
            .attr("stroke-width", 0.5).end();
        transformPromises.push(t);
    });

    const yAxisTransition = svg.select(".y-axis").transition().duration(1000)
        .call(d3.axisLeft(newYScale)).end();
    transformPromises.push(yAxisTransition);
    await Promise.all(transformPromises);
    
    let labelText = "Filtered by: ";
    const conditions = [];
    if (op.subgroupKey) conditions.push(`'${op.subgroupKey}'`);
    if (op.key !== undefined) conditions.push(`${op.field || yField} ${op.satisfy} ${op.key}`);
    labelText += conditions.join(" & ");

    svg.append("text").attr("class", "filter-label")
      .attr("x", margins.left).attr("y", margins.top - 10)
      .attr("font-size", 14).attr("font-weight", "bold")
      .attr("fill", "#007bff").text(labelText);

    return filteredData;
}