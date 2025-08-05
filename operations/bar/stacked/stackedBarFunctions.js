import { renderStackedBarChart } from "./stackedBarUtil.js";

// --- 헬퍼 함수 ---

function getSvgAndSetup(chartId) {
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

// 이 함수는 Util 파일에서도 사용하므로 export 합니다.
export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .value-line, .value-tag, .filter-label, .threshold-line, .extremum-highlight, .compare-label").remove();
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


// --- 오퍼레이션 함수 ---

export async function stackedBarRetrieveValue(chartId, op, data) {
    const { svg, margins } = getSvgAndSetup(chartId);
    
    const isTarget = d => d && String(d.key) === String(op.key) && d.subgroup === op.subgroupKey;

    // 단일 전환으로 모든 막대의 투명도를 조절 (자연스러운 전환)
    svg.select(".plot-area").selectAll("rect")
        .transition().duration(500)
        .attr("opacity", d => isTarget(d) ? 1.0 : 0.2);

    const targetRects = svg.selectAll("rect").filter(isTarget);

    if (!targetRects.empty()) {
        const targetNode = targetRects.node();
        const d = targetRects.datum();
        const bbox = targetNode.getBBox();
        const hlColor = d3.select(targetNode.parentNode).attr("fill");

        svg.append("rect")
            .attr("class", "annotation")
            .attr("x", margins.left + bbox.x - 2).attr("y", margins.top + bbox.y - 2)
            .attr("width", bbox.width + 4).attr("height", bbox.height + 4)
            .attr("fill", "none").attr("stroke", hlColor).attr("stroke-width", 3);
        
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + bbox.x + bbox.width / 2).attr("y", margins.top + bbox.y - 5)
            .attr("text-anchor", "middle").attr("fill", hlColor)
            .attr("font-weight", "bold").text(d.value);
    }
    
    return data;
}

export async function stackedBarFilter(chartId, op, data) {
    const { svg, xField, yField, colorField, plot, margins } = getSvgAndSetup(chartId);
    
    // 필터링 로직
    let filteredData = [...data];
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

    // 1단계: 하이라이트
    const highlightPromises = [];
    chartRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        const isTarget = targetIds.has(`${d.key}-${d.subgroup}`);
        const t = rect.transition().duration(800)
            .attr("opacity", isTarget ? 1.0 : 0.2)
            .attr("stroke", isTarget ? "black" : "none")
            .attr("stroke-width", 1).end();
        highlightPromises.push(t);
    });
    await Promise.all(highlightPromises);

    // 잠시 대기
    await delay(1000);

    // 2단계: 변환
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

export async function stackedBarFindExtremum(chartId, op, data) {
    const { svg, yField } = getSvgAndSetup(chartId);
    
    const valueAccessor = d => d[yField];
    const extremumValue = op.type === 'min' ? d3.min(data, valueAccessor) : d3.max(data, valueAccessor);
    const targetData = data.find(d => valueAccessor(d) === extremumValue);

    const targetRect = svg.select(".plot-area").selectAll("rect")
        .filter(d => d.key === targetData.month && d.subgroup === targetData.weather);

    if (!targetRect.empty()) {
        const hlColor = "#e60049";
        targetRect.transition().duration(600)
            .attr("stroke", hlColor)
            .attr("stroke-width", 4);
        
        const bbox = targetRect.node().getBBox();

        svg.append("text").attr("class", "extremum-highlight")
            .attr("x", bbox.x + bbox.width / 2)
            .attr("y", bbox.y - 10)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor).text(`${op.type}: ${extremumValue}`);
    }
    return data;
}

export async function stackedBarSort(chartId, op, data) {
    const { svg, g, orientation, xField, yField, plot } = getSvgAndSetup(chartId);
    
    const sortedData = [...data].sort((a, b) => {
        const valA = a[op.field || yField];
        const valB = b[op.field || yField];
        return op.order === "ascending" ? valA - valB : valB - valA;
    });

    const newXScale = d3.scaleBand()
        .domain(sortedData.map(d => d[xField]))
        .range([0, plot.w]).padding(0.1);

    const transitions = [];
    transitions.push(
        svg.select(".plot-area").selectAll("rect")
            .data(sortedData, d => d[xField]) // Re-bind data for sorting
            .transition().duration(800)
            .attr("x", d => newXScale(d[xField]))
            .attr("width", newXScale.bandwidth()).end()
    );

    transitions.push(
        svg.select(".x-axis").transition().duration(800)
            .call(d3.axisBottom(newXScale)).end()
    );
    await Promise.all(transitions);
    return sortedData;
}

export async function stackedBarCompare(chartId, op, data) {
    const { svg, margins } = getSvgAndSetup(chartId);
    
    const leftBar = svg.select(".plot-area").selectAll("rect").filter(d => d.key === op.left);
    const rightBar = svg.select(".plot-area").selectAll("rect").filter(d => d.key === op.right);
    
    if (leftBar.empty() || rightBar.empty()) return data;

    const lv = leftBar.datum().value;
    const rv = rightBar.datum().value;
    const cmp = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a === b }[op.satisfy];
    const ok = cmp ? cmp(lv, rv) : false;
    const leftColor = "#ffb74d", rightColor = "#64b5f6";

    await Promise.all([
        leftBar.transition().duration(600).attr("fill", leftColor).attr("stroke", "black").end(),
        rightBar.transition().duration(600).attr("fill", rightColor).attr("stroke", "black").end()
    ]);

    [
        { bar: leftBar, value: lv, color: leftColor },
        { bar: rightBar, value: rv, color: rightColor }
    ].forEach(item => {
        const node = item.bar.node(), bbox = node.getBBox();
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + bbox.x + bbox.width / 2)
            .attr("y", margins.top + bbox.y - 5)
            .attr("text-anchor", "middle").attr("fill", item.color)
            .attr("font-weight", "bold").text(item.value);
    });

    const symbol = { ">": ">", ">=": "≥", "<": "<", "<=": "≤", "==": "=" }[op.satisfy];
    svg.append("text").attr("class", "compare-label")
        .attr("x", margins.left + 20).attr("y", margins.top - 10)
        .attr("fill", ok ? "green" : "red").text(`${op.left} ${symbol} ${op.right} → ${ok}`);
        
    return data;
}

export async function stackedBarDetermineRange(chartId, op, data) {
    const { svg, yField, margins, plot } = getSvgAndSetup(chartId);
    
    const values = data.map(d => d[yField]);
    const minV = d3.min(values), maxV = d3.max(values);
    const newYMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, newYMax || 1]).nice().range([plot.h, 0]);
    const hlColor = "blue";

    [
        { value: minV, label: "Min" },
        { value: maxV, label: "Max" }
    ].forEach(item => {
        const yPos = margins.top + yScale(item.value);
        svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left + plot.w)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left - 5).attr("y", yPos)
            .attr("text-anchor", "end").attr("dominant-baseline", "middle")
            .attr("fill", hlColor).text(`${item.label}: ${item.value}`);
    });
    
    return data;
}