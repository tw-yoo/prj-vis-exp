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

// stackedBarFunctions.js 파일의 stackedBarRetrieveValue 함수 (최종 수정 완료)


export async function stackedBarRetrieveValue(chartId, op, currentData, fullData) {
    const { svg, margins } = getSvgAndSetup(chartId);
    
    // --- 상태 감지: currentData와 fullData의 길이를 비교 ---
    const isFilteredState = currentData.length < fullData.length;

    if (isFilteredState) {
        // --- 상태 2: 필터링된 단순 차트에서의 동작 ---
        console.log("RetrieveValue on a filtered chart.");
        const targetRect = svg.select(".plot-area").selectAll("rect")
            .filter(d => String(d.key) === String(op.key) && d.subgroup === op.subgroupKey);

        if (!targetRect.empty()) {
            const d = targetRect.datum();
            const bbox = targetRect.node().getBBox();
            const hlColor = "#e60049";

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
    } else {
        // --- 상태 1: 원본 누적 차트에서의 동작 ---
        console.log("RetrieveValue on the original chart.");
        const isTarget = d => d && String(d.key) === String(op.key) && d.subgroup === op.subgroupKey;

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
    }
    
    return currentData; // 작업의 결과인 currentData를 반환
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


// stackedBarFunctions.js의 stackedBarFindExtremum 함수 (수정 완료)

export async function stackedBarFindExtremum(chartId, op, data, fullData) {
    const { svg, yField, margins, xField, colorField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const valueAccessor = d => d[yField];
    const extremumValue = op.type === 'min' ? d3.min(data, valueAccessor) : d3.max(data, valueAccessor);
    const targetData = data.find(d => valueAccessor(d) === extremumValue);

    if (!targetData) {
        console.warn("Could not find target data for extremum value.");
        return data;
    }

    // --- 여기가 핵심 수정 부분: 두 가지 데이터 형태를 모두 검색 ---
    const targetXValue = targetData[xField];
    const targetColorValue = targetData[colorField];

    const targetRect = svg.select(".plot-area").selectAll("rect")
        .filter(d => {
            if (!d) return false;
            // Case 1: render/filter 직후의 데이터 형태 {key, subgroup}
            const keyMatch1 = String(d.key) === String(targetXValue) && d.subgroup === targetColorValue;
            // Case 2: sort 직후의 데이터 형태 {month, weather}
            const keyMatch2 = String(d[xField]) === String(targetXValue) && d[colorField] === targetColorValue;
            
            return keyMatch1 || keyMatch2;
        });
    // --- 수정 끝 ---

    if (!targetRect.empty()) {
        const hlColor = "#e60049";
        
        targetRect.transition().duration(600)
            .attr("stroke", hlColor)
            .attr("stroke-width", 4);
        
        const bbox = targetRect.node().getBBox();

        const lineY = margins.top + bbox.y;
        svg.append("line")
            .attr("class", "extremum-highlight")
            .attr("x1", margins.left).attr("y1", lineY)
            .attr("x2", margins.left + bbox.x + bbox.width / 2).attr("y2", lineY)
            .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
        
        svg.append("text")
            .attr("class", "extremum-highlight")
            .attr("x", margins.left + bbox.x + bbox.width / 2)
            .attr("y", margins.top + bbox.y - 10)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor).text(`${op.type}: ${extremumValue}`);
    }
    return data;
}
// stackedBarFunctions.js의 stackedBarSort 함수 (수정 완료)

export async function stackedBarSort(chartId, op, currentData, fullData) {
    const { svg, xField, yField, plot, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sortField = op.field || yField;
    
    const sortedData = [...currentData].sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return op.order === "ascending" ? valA - valB : valB - valA;
    });

    const newXScale = d3.scaleBand()
        .domain(sortedData.map(d => d[xField]))
        .range([0, plot.w])
        .padding(0.1);

    const transitions = [];
    const duration = 1000;

    // --- 여기가 핵심 수정 부분: Key 함수를 더 똑똑하게 변경 ---
    // 데이터의 두 가지 형태(d.key 또는 d[xField])를 모두 처리할 수 있는 Key 함수
    const keyFunction = d => d.key || d[xField];

    transitions.push(
        svg.select(".plot-area").selectAll("rect")
            .data(sortedData, keyFunction) // 수정된 Key 함수 사용
            .transition().duration(duration)
            .attr("x", d => newXScale(d[xField]))
            .attr("width", newXScale.bandwidth())
            .end()
    );
    // --- 수정 끝 ---

    transitions.push(
        svg.select(".x-axis")
            .transition().duration(duration)
            .call(d3.axisBottom(newXScale))
            .end()
    );

    await Promise.all(transitions);

    const orderText = op.order === 'ascending' ? 'Ascending' : 'Descending';
    const labelText = `Sorted by ${sortField} (${orderText})`;
    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 10)
        .attr("font-size", 14)
        .attr("font-weight", "bold")
        .attr("fill", "#6f42c1")
        .text(labelText);

    return sortedData;
}


// vvv --- 여기가 핵심 수정 부분 --- vvv
export async function stackedBarCompare(chartId, op, currentData, fullData) {
    const { svg, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg); // 함수 시작 시 이전 주석(filter 레이블 등) 제거

    const finder = (key) => (d) => {
        const keyMatch = String(d.key) === String(key);
        const subgroupMatch = op.subgroupKey ? d.subgroup === op.subgroupKey : true;
        return keyMatch && subgroupMatch;
    };

    const leftBar = svg.select(".plot-area").selectAll("rect").filter(finder(op.left));
    const rightBar = svg.select(".plot-area").selectAll("rect").filter(finder(op.right));
    
    if (leftBar.empty() || rightBar.empty()) {
        console.warn("Compare targets not found. Left:", op.left, "Right:", op.right);
        return currentData;
    }

    const lv = leftBar.datum().value;
    const rv = rightBar.datum().value;
    const cmp = { "gt": (a, b) => a > b, ">": (a, b) => a > b, "gte": (a, b) => a >= b, ">=": (a, b) => a >= b, "lt": (a, b) => a < b, "<": (a, b) => a < b, "lte": (a, b) => a <= b, "<=": (a, b) => a <= b, "eq": (a, b) => a === b, "==": (a, b) => a === b };
    const ok = cmp[op.operator] ? cmp[op.operator](lv, rv) : false;
    
    const leftColor = "#ffb74d", rightColor = "#64b5f6";

    await Promise.all([
        leftBar.transition().duration(600).attr("fill", leftColor).attr("stroke", "black").end(),
        rightBar.transition().duration(600).attr("fill", rightColor).attr("stroke", "black").end()
    ]);

    const addCompareAnnotation = (bar, value, color) => {
        const node = bar.node(), bbox = node.getBBox();
        const lineY = margins.top + bbox.y;

        svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("y1", lineY)
            .attr("x2", margins.left + bbox.x + bbox.width / 2).attr("y2", lineY)
            .attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");

        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + bbox.x + bbox.width / 2)
            .attr("y", margins.top + bbox.y - 5)
            .attr("text-anchor", "middle").attr("fill", color)
            .attr("font-weight", "bold").text(value);
    };

    addCompareAnnotation(leftBar, lv, leftColor);
    addCompareAnnotation(rightBar, rv, rightColor);

    const symbol = { "gt": ">", ">": ">", "gte": "≥", ">=": "≥", "lt": "<", "<": "<", "lte": "≤", "<=": "≤", "eq": "=", "==": "=" }[op.operator];
    svg.append("text").attr("class", "compare-label")
        .attr("x", margins.left).attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", ok ? "green" : "red").text(`${op.left} ${symbol} ${op.right} → ${ok}`);
        
    return currentData;
}

// stackedBarFunctions.js의 stackedBarDetermineRange 함수 (수정 완료)

export async function stackedBarDetermineRange(chartId, op, data, fullData) {
    const { svg, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    
    const values = data.map(d => d[yField]);
    const minV = d3.min(values);
    const maxV = d3.max(values);

    const newYMax = d3.max(data, d => d[yField]);
    const yScale = d3.scaleLinear().domain([0, newYMax || 1]).nice().range([plot.h, 0]);
    const hlColor = "blue";

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
        
        // --- 여기가 핵심 수정 부분 ---
        // Y축 옆 라벨의 x 위치를 -5에서 -10으로 변경하여 더 왼쪽으로 이동시킵니다.
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left - 10) // 간격 조정
            .attr("y", yPos)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .attr("fill", hlColor)
            .text(`${item.label}: ${item.value}`);
        // --- 수정 끝 ---
    });

    if (minV !== undefined && maxV !== undefined) {
        const rangeText = `Range: ${minV} ~ ${maxV}`;
        svg.append("text")
            .attr("class", "annotation")
            .attr("x", margins.left)
            .attr("y", margins.top - 10)
            .attr("font-size", 14)
            .attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(rangeText);
    }
    
    return data;
}