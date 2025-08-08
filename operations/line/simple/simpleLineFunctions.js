// simpleLineFunctions.js (최종 완성본)
// simpleLineFunctions.js 파일에 이 함수를 추가하세요.

/**
 * 다음 오퍼레이션을 위해 차트를 정리하고 준비합니다.
 * 모든 보조선과 텍스트를 지우고, 이전에 하이라이트된 점들은 회색 '흔적'으로 변경합니다.
 */
export async function prepareForNextOperation(chartId) {
    const { svg, g } = getSvgAndSetup(chartId);
    
    // 1. 모든 보조선과 텍스트(class="annotation")를 제거합니다.
   // clearAllAnnotations(svg);

    // 2. 현재 하이라이트된 점들을 찾아 회색 '흔적'으로 변경합니다.
    //    (여기서는 반지름(r)이 5보다 큰 점을 하이라이트된 것으로 간주)
    g.selectAll("circle.datapoint")
     .filter(function() { return d3.select(this).attr("r") > 5; })
     .transition().duration(500)
     .attr("r", 6) // 흔적 포인트 크기
     .attr("fill", "#a9a9a9") // 흔적 색상 (어두운 회색)
     .attr("stroke", "none");

    // 3. 메인 라인 색상도 연하게 유지하여 배경 역할을 하도록 할 수 있습니다.
    g.select("path.series-line")
     .transition().duration(500)
     .attr("stroke", "#d3d3d3"); // 연한 회색

    await delay(500);
}
// --- 헬퍼 함수 ---
export function getSvgAndSetup(chartId) {
    const svg = d3.select(`#${chartId}`).select("svg");
    const g = svg.select(".plot-area");
    const xField = svg.attr("data-x-field");
    const yField = svg.attr("data-y-field");
    const margins = { left: +svg.attr("data-m-left"), top: +svg.attr("data-m-top") };
    const plot = { w: +svg.attr("data-plot-w"), h: +svg.attr("data-plot-h") };
    return { svg, g, xField, yField, margins, plot };
}
export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation").remove();
}
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


// --- 오퍼레이션 함수 ---

export async function simpleLineRetrieveValue(chartId, op, data, fullData) {
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
   // clearAllAnnotations(svg);
    
    const targetKey = String(op.key);
    const hlColor = "#ff6961";

    const targetPoint = g.selectAll("circle.datapoint")
        .filter(function() { return d3.select(this).attr("data-id") === targetKey; });

    if (targetPoint.empty()) {
        console.warn("RetrieveValue: target point not found for key:", op.key);
        return data;
    }

    const cx = +targetPoint.attr("cx");
    const cy = +targetPoint.attr("cy");
    const val = targetPoint.attr("data-value");

    g.select("path.series-line").transition().duration(600).attr("opacity", 0.3);
    targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 2);
    await delay(600);
    
    // --- 여기가 핵심 수정 부분: 두 선을 동시에 그리기 ---
    const xLine = svg.append("line").attr("class", "annotation")
        .attr("x1", cx + margins.left).attr("y1", cy + margins.top)
        .attr("x2", cx + margins.left).attr("y2", cy + margins.top)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    const yLine = svg.append("line").attr("class", "annotation")
        .attr("x1", cx + margins.left).attr("y1", cy + margins.top)
        .attr("x2", cx + margins.left).attr("y2", cy + margins.top)
        .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

    // 두 애니메이션을 동시에 시작하고, 모두 끝날 때까지 기다립니다.
    const xLinePromise = xLine.transition().duration(500).attr("y2", plot.h + margins.top).end();
    const yLinePromise = yLine.transition().duration(500).attr("x2", margins.left).end();
    
    await Promise.all([xLinePromise, yLinePromise]);
    // --- 수정 끝 ---
        
    // 선이 모두 그려진 후 텍스트를 표시합니다.
    svg.append("text").attr("class", "annotation")
        .attr("x", cx + margins.left + 5).attr("y", cy + margins.top - 5)
        .attr("fill", hlColor)
        .attr("font-weight", "bold")
        .text(val);

    return data;
}

// simpleLineFunctions.js 파일의 simpleLineFilter 함수를 교체해주세요.

export async function simpleLineFilter(chartId, op, data, fullData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);

    if (op.field !== xField) {
        console.warn(`This filter only supports the x-axis field ('${xField}').`);
        return data;
    }

    const hlColor = "steelblue";

    const fromDate = op.from ? new Date(op.from) : d3.min(fullData, d => d[xField]);
    const toDate = op.to ? new Date(op.to) : d3.max(fullData, d => d[xField]);
    const xScale = d3.scaleTime().domain(d3.extent(fullData, d => d[xField])).range([0, plot.w]);

    const clipId = `${chartId}-clip-path`;
    svg.select("defs").remove();
    const defs = svg.append("defs");
    
    defs.append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", xScale(fromDate))
        .attr("y", 0)
        .attr("width", xScale(toDate) - xScale(fromDate))
        .attr("height", plot.h);

    const baseLine = g.select("path.series-line");
    g.selectAll("circle.datapoint").transition().duration(600).attr("opacity", 0);

    await baseLine.transition().duration(600).attr("stroke", "#d3d3d3").end();

    const drawVLine = (date) => {
        const xPos = xScale(date);
        const vLine = svg.append("line").attr("class", "annotation") // 지워져야 할 요소
            .attr("x1", margins.left + xPos).attr("y1", margins.top)
            .attr("x2", margins.left + xPos).attr("y2", margins.top)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        return vLine.transition().duration(600).attr("y2", margins.top + plot.h).end();
    };
    await Promise.all([drawVLine(fromDate), drawVLine(toDate)]);
    
    // === 핵심 수정: .annotation 클래스 제거 ===
    const highlightedLine = baseLine.clone(true)
        .attr("class", "highlighted-line") // 다음 단계까지 남아있어야 할 요소
        .attr("stroke", hlColor)
        .attr("stroke-width", 2.5)
        .attr("clip-path", `url(#${clipId})`);
    
    const filterLabel = svg.append("text").attr("class", "annotation filter-label") // 지워져야 할 요소
        .attr("x", margins.left + plot.w / 2)
        .attr("y", margins.top - 10)
        .attr("text-anchor", "middle")
        .attr("font-size", 12).attr("font-weight", "bold").attr("fill", hlColor)
        .text(`Filter Range: ${op.from} ~ ${op.to}`);

    highlightedLine.attr("opacity", 0).transition().duration(500).attr("opacity", 1);
    filterLabel.attr("opacity", 0).transition().duration(500).attr("opacity", 1);
    
    await delay(500);

    const filteredData = data.filter(d => d[xField] >= fromDate && d[xField] <= toDate);
    return filteredData;
}



export async function simpleLineFindExtremum(chartId, op, data, fullData) {
    const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
    
    const hlColor = "#a65dfb";
    const extremumValue = op.type === 'min' ? d3.min(data, d => d[yField]) : d3.max(data, d => d[yField]);
    const targetPoint = g.selectAll("circle.datapoint").filter(d => d[yField] === extremumValue);

    if (targetPoint.empty()) return data;

    g.select("path.series-line").transition().duration(600).attr("opacity", 0.3);
    await targetPoint.transition().duration(600)
        .attr("opacity", 1).attr("r", 8).attr("fill", hlColor).attr("stroke", "white")
        .end();

    const node = targetPoint.nodes()[0];
    if (node) {
        const cx = +node.getAttribute("cx");
        const cy = +node.getAttribute("cy");
        
        const vLine = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
            .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
            .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
            
        const hLine = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
            .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
            .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");

        const vLinePromise = vLine.transition().duration(500).attr("y2", margins.top + plot.h).end();
        const hLinePromise = hLine.transition().duration(500).attr("x2", margins.left).end();
        await Promise.all([vLinePromise, hLinePromise]);
            
        const labelText = `${op.type === "min" ? "Min" : "Max"}: ${extremumValue.toLocaleString()}`;
        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor).attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(labelText)
            .attr("opacity", 0).transition().duration(400).attr("opacity", 1);
    }
    return data;
}

export async function simpleLineDetermineRange(chartId, op, data, fullData) {
    const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
    const hlColor = "#0d6efd";

    const minV = d3.min(data, d => d[yField]);
    const maxV = d3.max(data, d => d[yField]);
    const minPoint = g.selectAll("circle.datapoint").filter(d => d[yField] === minV);
    const maxPoint = g.selectAll("circle.datapoint").filter(d => d[yField] === maxV);

    if (minPoint.empty() || maxPoint.empty()) return data;

    g.select("path.series-line").transition().duration(600).attr("opacity", 0.3);
    await Promise.all([
        minPoint.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end(),
        maxPoint.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", hlColor).end()
    ]);

    const animationPromises = [];
    const pointsToAnnotate = [
        { point: minPoint, label: "MIN", value: minV },
        { point: maxPoint, label: "MAX", value: maxV }
    ];

    pointsToAnnotate.forEach(item => {
        const cx = +item.point.attr("cx");
        const cy = +item.point.attr("cy");

        // 수직선 (점 -> X축)
        const vLine = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
            .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        animationPromises.push(vLine.transition().duration(800).attr("y2", margins.top + plot.h).end());
        
        // 수평선 (차트 전체 너비)
        const hLine = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("y1", margins.top + cy)
            .attr("x2", margins.left).attr("y2", margins.top + cy)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");
        animationPromises.push(hLine.transition().duration(800).attr("x2", margins.left + plot.w).end());

        // 점 위의 라벨 (MIN/MAX)
        const pointLabel = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
            .attr("text-anchor", "middle").attr("fill", hlColor)
            .attr("font-weight", "bold").attr("font-size", "12px")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(`${item.label}: ${item.value.toLocaleString()}`)
            .attr("opacity", 0);
        animationPromises.push(pointLabel.transition().delay(200).duration(400).attr("opacity", 1).end());
    });

    // === 이 부분이 수정되었습니다: 값 범위 텍스트 위치 및 스타일 변경 ===
    const rangeText = svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w - 15) // 오른쪽 끝에 가깝게
        .attr("y", margins.top + plot.h / 2)   // 세로 중앙에
        .attr("text-anchor", "end") // 오른쪽 정렬
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .attr("fill", hlColor)
        .attr("stroke", "white") // 흰색 테두리 (배경 역할)
        .attr("stroke-width", 4)
        .attr("paint-order", "stroke"); // 텍스트를 먼저 그리고 테두리를 그려서 가독성 확보

    // 텍스트를 두 줄로 표시
    rangeText.append("tspan")
        .attr("x", margins.left + plot.w - 15)
        .attr("dy", "-0.6em") // 윗줄
        .text("값 범위:");

    rangeText.append("tspan")
        .attr("x", margins.left + plot.w - 15)
        .attr("dy", "1.2em") // 아랫줄
        .text(`${minV.toLocaleString()} ~ ${maxV.toLocaleString()}`);

    animationPromises.push(
        rangeText.attr("opacity", 0).transition().delay(600).duration(400).attr("opacity", 1).end()
    );
    // --- 수정 끝 ---

    await Promise.all(animationPromises);
    return data;
}



export async function simpleLineCompare(chartId, op, data, fullData) {
    const { svg, g, yField, margins, plot } = getSvgAndSetup(chartId);
    //clearAllAnnotations(svg);
    const leftColor = "#ffb74d", rightColor = "#64b5f6";

    const leftPoint = g.selectAll("circle.datapoint").filter(function() { return d3.select(this).attr("data-id") === String(op.left); });
    const rightPoint = g.selectAll("circle.datapoint").filter(function() { return d3.select(this).attr("data-id") === String(op.right); });
    
    if (leftPoint.empty() || rightPoint.empty()) {
        console.warn("Compare: One or both points not found.");
        return data;
    }

    const lv = +leftPoint.attr("data-value");
    const leftId = leftPoint.attr("data-id");
    const rv = +rightPoint.attr("data-value");
    const rightId = rightPoint.attr("data-id");

    // 시리즈 라인 흐리게 처리 및 두 점 강조
    g.select("path.series-line").transition().duration(600).attr("opacity", 0.3);
    leftPoint.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", leftColor);
    rightPoint.transition().duration(600).attr("opacity", 1).attr("r", 8).attr("fill", rightColor);
    await delay(600);

    const animationPromises = [];
    const pointsToAnnotate = [
        { point: leftPoint, color: leftColor, id: leftId, value: lv },
        { point: rightPoint, color: rightColor, id: rightId, value: rv }
    ];

    pointsToAnnotate.forEach(item => {
        const cx = +item.point.attr("cx");
        const cy = +item.point.attr("cy");

        // 수평선 (Y축 -> 점)
        const hLine = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("y1", margins.top + cy)
            .attr("x2", margins.left).attr("y2", margins.top + cy)
            .attr("stroke", item.color).attr("stroke-dasharray", "4 4");
        animationPromises.push(hLine.transition().duration(500).attr("x2", margins.left + cx).end());

        // 수직선 (점 -> X축)
        const vLine = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left + cx).attr("y1", margins.top + cy)
            .attr("x2", margins.left + cx).attr("y2", margins.top + cy)
            .attr("stroke", item.color).attr("stroke-dasharray", "4 4");
        animationPromises.push(vLine.transition().duration(500).attr("y2", margins.top + plot.h).end());

        // 점 레이블 (값 표시)
        const label = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left + cx).attr("y", margins.top + cy - 15)
            .attr("text-anchor", "middle").attr("fill", item.color)
            .attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(item.value.toLocaleString())
            .attr("opacity", 0);
        animationPromises.push(label.transition().delay(200).duration(400).attr("opacity", 1).end());
    });

    // 비교 결과 텍스트 생성
    const diff = Math.abs(lv - rv);
    let resultText = "";
    if (lv > rv) {
        resultText = `${leftId}이(가) ${rightId}보다 ${diff.toLocaleString()} 더 큽니다.`;
    } else if (rv > lv) {
        resultText = `${rightId}이(가) ${leftId}보다 ${diff.toLocaleString()} 더 큽니다.`;
    } else {
        resultText = `${leftId}와(과) ${rightId}의 값이 ${lv.toLocaleString()}으로 동일합니다.`;
    }

    // 비교 결과 텍스트를 차트 상단에 표시
    const resultLabel = svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", "14px").attr("font-weight", "bold")
        .attr("fill", "#333")
        .text(resultText)
        .attr("opacity", 0);

    animationPromises.push(
        resultLabel.transition().delay(500).duration(400).attr("opacity", 1).end()
    );
    
    await Promise.all(animationPromises);
    return data;
}

export async function simpleLineSort(chartId, op, data, fullData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    
    const sortedData = [...data].sort((a, b) => {
        return op.order === "ascending" ? a[yField] - b[yField] : b[yField] - a[yField];
    });

    const newXScale = d3.scalePoint().domain(sortedData.map(d => d[xField])).range([0, plot.w]);
    const yScale = d3.scaleLinear().domain(d3.extent(data, d => d[yField])).nice().range([plot.h, 0]);

    const lineGen = d3.line()
        .x(d => newXScale(d[xField]))
        .y(d => yScale(d[yField]));

    await Promise.all([
        g.select(".x-axis").transition().duration(1200).call(d3.axisBottom(newXScale)).end(),
        g.selectAll("circle.datapoint").data(sortedData, d => d[xField])
            .transition().duration(1200).attr("cx", d => newXScale(d[xField])).end(),
        g.select("path.series-line").datum(sortedData)
            .transition().duration(1200).attr("d", lineGen).end()
    ]);
    
    return sortedData;
}