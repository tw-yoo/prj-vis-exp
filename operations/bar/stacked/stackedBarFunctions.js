

function getOrientation(svg) {
  return svg.attr("data-orientation") || "vertical";
}

function getMargins(svg) {
  return {
    left:   +svg.attr("data-m-left")   || 0,
    top:    +svg.attr("data-m-top")    || 0,
    right:  +svg.attr("data-m-right")  || 0,
    bottom: +svg.attr("data-m-bottom") || 0
  };
}

/** stackedBarRetrieveValue */
export function stackedBarRetrieveValue(chartId, op) {
    const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
    if (svg.empty()) return chartId;

    // reset
    svg.selectAll(".retrieve-rect,.retrieve-label").remove();
    svg.selectAll("g.tick text").attr("fill", "#000").attr("font-weight", null);

    // params
    const key = String(op.key);
    const keyField = op.keyField || "month";
    const subgroupKey = String(op.subgroupKey);
    const subgroupField = op.subgroupField || "weather";

    // locate rect
    let targetRect = null;
    svg.selectAll("rect").each(function () {
        const d = d3.select(this).datum();
        if (!d || d.start == null) return;
        const catVal = String(d[keyField] ?? d.category);
        const subVal = String(d[subgroupField] ?? d.subgroup);
        if (catVal === key && subVal === subgroupKey) targetRect = d3.select(this);
    });
    if (!targetRect) {
        console.warn("stackedBarRetrieveValue: target not found");
        return chartId;
    }

    // geometry & value
    const { x, y, width, height } = targetRect.node().getBBox();
    const value = targetRect.datum().end - targetRect.datum().start;

    // highlight colors
    const hl = "#ffeb3b";
    const halo = "#ffffff";
    const pad = 2;

    // draw halo + outline
    svg.append("rect")
        .attr("class", "retrieve-rect")
        .attr("x", x - pad).attr("y", y - pad)
        .attr("width", width + pad * 2).attr("height", height + pad * 2)
        .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
        .attr("opacity", 0).transition().duration(400).attr("opacity", 1);

    svg.append("rect")
        .attr("class", "retrieve-rect")
        .attr("x", x - pad).attr("y", y - pad)
        .attr("width", width + pad * 2).attr("height", height + pad * 2)
        .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
        .attr("opacity", 0).transition().duration(400).attr("opacity", 1);

    // value label
    const horiz = width > height;
    svg.append("text")
        .attr("class", "retrieve-label")
        .attr("x", horiz ? x + width + 6 : x + width / 2)
        .attr("y", horiz ? y + height / 2 : y - 6)
        .attr("fill", hl).attr("font-size", 12).attr("font-weight", "bold")
        .attr("paint-order", "stroke").attr("stroke", "#000").attr("stroke-width", 3)
        .attr("text-anchor", horiz ? "start" : "middle")
        .attr("dominant-baseline", horiz ? "middle" : "auto")
        .text(value.toLocaleString())
        .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);

    // highlight tick
    svg.selectAll("g.tick").each(function (t) {
        if (String(t) === key) {
            d3.select(this).select("text")
                .attr("fill", hl).attr("font-weight", "bold")
                .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);
        }
    });

    return chartId;
}


/** stackedBarFilter */
export function stackedBarFilter(chartId, op) {
    const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
    if (svg.empty()) return chartId;

    // 0. Reset
    svg.selectAll(".filter-rect, .filter-label").remove();
    svg.selectAll("g.tick text")
        .attr("fill", "#000")
        .attr("font-weight", null)
        .attr("opacity", 1);
    svg.selectAll("rect").attr("opacity", 1);

    // 1. Params
    const keyValue = op.key;
    const satisfy = op.satisfy || ">=";
    const subgroupField = op.subgroupField || null;
    const subgroupKey = op.subgroupKey != null ? String(op.subgroupKey) : null;

    // 2. Comparator
    const cmp = {
        ">": (v, k) => v > k,
        ">=": (v, k) => v >= k,
        "<": (v, k) => v < k,
        "<=": (v, k) => v <= k,
        "==": (v, k) => v == k,
        "!=": (v, k) => v != k
    }[satisfy] || ((v, k) => v >= k);

    // highlight colors
    const hl = "#ffeb3b";
    const halo = "#ffffff";
    const pad = 2;

    const orientation = getOrientation(svg);
    const { left: mL, top: mT } = getMargins(svg);

    // track categories to highlight ticks
    const highlightCats = new Set();

    // 3. Process each segment
    svg.selectAll("rect").each(function (d) {
        if (!d || d.start == null || d.end == null) return;
        const sel = d3.select(this);
        const value = d.end - d.start;

        // subgroup filter
        if (subgroupField && subgroupKey !== null) {
            const subVal = String(d[subgroupField] ?? d.subgroup);
            if (subVal !== subgroupKey) {
                sel.transition().duration(300).attr("opacity", 0.25);
                return;
            }
        }

        // numeric filter
        if (!cmp(value, keyValue)) {
            sel.transition().duration(300).attr("opacity", 0.25);
            return;
        }

        // pass → highlight
        const bbox = this.getBBox();
        // halo
        svg.append("rect")
            .attr("class", "filter-rect")
            .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
            .attr("width", bbox.width + pad * 2).attr("height", bbox.height + pad * 2)
            .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
            .attr("opacity", 0).transition().duration(400).attr("opacity", 1);
        // outline
        svg.append("rect")
            .attr("class", "filter-rect")
            .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
            .attr("width", bbox.width + pad * 2).attr("height", bbox.height + pad * 2)
            .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
            .attr("opacity", 0).transition().duration(400).attr("opacity", 1);
        // label
        let x, y, anchor, baseline;
        if (orientation === "horizontal") {
            x = bbox.x + bbox.width + 6; y = bbox.y + bbox.height / 2;
            anchor = "start"; baseline = "middle";
        } else {
            x = bbox.x + bbox.width / 2; y = bbox.y - 6;
            anchor = "middle"; baseline = "auto";
        }
        svg.append("text")
            .attr("class", "filter-label")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", anchor).attr("dominant-baseline", baseline)
            .attr("fill", hl).attr("font-size", 12).attr("font-weight", "bold")
            .attr("stroke", "#000").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(value.toLocaleString())
            .attr("opacity", 0).transition().delay(200).duration(400).attr("opacity", 1);

        highlightCats.add(String(d.category));
    });

    // 4. Highlight axis ticks
    svg.selectAll("g.tick").each(function (t) {
        if (highlightCats.has(String(t))) {
            d3.select(this).select("text")
                .attr("fill", hl).attr("font-weight", "bold")
                .attr("opacity", 0).transition().delay(300).duration(400).attr("opacity", 1);
        }
    });

    return chartId;
}


// Assumes d3, getOrientation(svg), getMargins(svg) helpers are in scope
export function stackedBarFindExtremum(chartId, op) {
    const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
    if (svg.empty()) return chartId;

    // 0) Clear previous highlights
    svg.selectAll(".extremum-rect, .extremum-label").remove();
    svg.selectAll("g.tick text")
        .attr("fill", "#000")
        .attr("font-weight", null)
        .attr("opacity", 1);

    // 1) Parameters
    const subgroupField = op.subgroupField;
    const subgroupKey = op.subgroupKey != null ? String(op.subgroupKey) : null;
    const type = (op.type || "max").toLowerCase();

    // 2) Gather only the stacked segments for this subgroup
    const segments = [];
    svg.selectAll("rect").each(function (d) {
        if (!d || d.start == null || d.end == null) return;
        if (subgroupField && subgroupKey !== null) {
            const subVal = String(d[subgroupField] ?? d.subgroup);
            if (subVal !== subgroupKey) return;
        }
        segments.push({ datum: d, node: this, value: d.end - d.start });
    });
    if (!segments.length) return chartId;

    // 3) Compute extremum value
    const extremumValue = type === "min"
        ? d3.min(segments, s => s.value)
        : d3.max(segments, s => s.value);

    // 4) Styling constants
    const pad = 2;
    const halo = "#ffffff";
    const hl = "#ffeb3b";

    const orientation = getOrientation(svg);
    const { left: mL, top: mT } = getMargins(svg);

    // 5) Highlight each extremum segment
    segments
        .filter(s => s.value === extremumValue)
        .forEach(s => {
            const bbox = s.node.getBBox();

            // draw white halo
            svg.append("rect")
                .attr("class", "extremum-rect")
                .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
                .attr("width", bbox.width + pad * 2)
                .attr("height", bbox.height + pad * 2)
                .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
                .attr("opacity", 0)
                .transition().duration(400).attr("opacity", 1);

            // draw yellow outline
            svg.append("rect")
                .attr("class", "extremum-rect")
                .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
                .attr("width", bbox.width + pad * 2)
                .attr("height", bbox.height + pad * 2)
                .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
                .attr("opacity", 0)
                .transition().delay(100).duration(400).attr("opacity", 1);

            // figure out label position based on chart orientation
            let x, y, anchor, baseline;
            if (orientation === "horizontal") {
                x = bbox.x + bbox.width + 6;
                y = bbox.y + bbox.height / 2;
                anchor = "start";
                baseline = "middle";
            } else {
                x = bbox.x + bbox.width / 2;
                y = bbox.y - 6;
                anchor = "middle";
                baseline = "auto";
            }

            // draw the value label
            svg.append("text")
                .attr("class", "extremum-label")
                .attr("x", x).attr("y", y)
                .attr("text-anchor", anchor)
                .attr("dominant-baseline", baseline)
                .attr("fill", hl)
                .attr("font-size", "12px")
                .attr("font-weight", "bold")
                .attr("paint-order", "stroke")
                .attr("stroke", "#000")
                .attr("stroke-width", 3)
                .text(`${type === "min" ? "MIN" : "MAX"} ${extremumValue.toLocaleString()}`)
                .attr("opacity", 0)
                .transition().delay(200).duration(400).attr("opacity", 1);
        });

    // 6) Highlight the corresponding axis ticks
    if (orientation === "horizontal") {
        svg.select(".y-axis").selectAll("g.tick").each(function (t) {
            if (t === segments[0].datum.category) {
                d3.select(this).select("text")
                    .attr("fill", hl)
                    .attr("font-weight", "bold")
                    .attr("opacity", 0)
                    .transition().delay(300).duration(400).attr("opacity", 1);
            }
        });
    } else {
        svg.select(".x-axis").selectAll("g.tick").each(function (t) {
            if (t === segments[0].datum.category) {
                d3.select(this).select("text")
                    .attr("fill", hl)
                    .attr("font-weight", "bold")
                    .attr("opacity", 0)
                    .transition().delay(300).duration(400).attr("opacity", 1);
            }
        });
    }

    return chartId;
}


export function stackedBarCompare(chartId, op) {
    const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
    if (svg.empty()) return chartId;

    // 0. 기존 비교 관련 요소 제거
    svg.selectAll(".compare-rect, .compare-label, .compare-line, .compare-halo, .comparison-text").remove();
    svg.selectAll(".compare-axis-label, .compare-label-value").remove();
    svg.selectAll("g.tick text")
        .attr("fill", "#000")
        .attr("font-weight", null)
        .attr("opacity", 1);

    // 1. 파라미터 추출
    const keyField = op.keyField || "category";
    const subgroupField = op.subgroupField || "subgroup";
    const subgroupKey = String(op.subgroupKey);
    const leftKey = String(op.left);
    const rightKey = String(op.right);
    const orientation = getOrientation(svg);
    const margins = getMargins(svg);

    // 2. 비교 대상 막대 데이터 및 색상 찾기
    let leftTargetData = null;
    let rightTargetData = null;
    let leftColor = null;
    let rightColor = null;

    svg.selectAll("rect").each(function(d) {
        if (!d || d.start == null || d.end == null) return;
        const catVal = String(d[keyField] ?? d.category);
        const subVal = String(d[subgroupField] ?? d.subgroup);

        if (subVal === subgroupKey) {
            if (catVal === leftKey) {
                leftTargetData = d;
                leftColor = d3.select(this).attr("fill");
            } else if (catVal === rightKey) {
                rightTargetData = d;
                rightColor = d3.select(this).attr("fill");
            }
        }
    });

    if (!leftTargetData || !rightTargetData) {
        console.warn("stackedBarCompare: One or both comparison targets not found.");
        return chartId;
    }

    const leftValue = leftTargetData.end - leftTargetData.start;
    const rightValue = rightTargetData.end - rightTargetData.start;
    const diff = Math.abs(leftValue - rightValue);
    
    const transitionDuration = 1000;
    const delayDuration = 500;

    // 3. 기존 차트 막대 투명도 조절
    svg.selectAll("rect")
        .filter(d => d) // 유효한 데이터만 필터링
        .transition().duration(transitionDuration)
        .attr("opacity", d => {
            const catVal = String(d[keyField] ?? d.category);
            const subVal = String(d[subgroupField] ?? d.subgroup);
            if (subVal === subgroupKey && (catVal === leftKey || catVal === rightKey)) {
                return 1; // 비교 대상 막대는 투명도 유지
            }
            return 0.2; // 그 외 막대는 투명하게 처리
        });

    // 4. 새로운 비교 막대 그리기
    const svgWidth = +svg.attr("width");
    const svgHeight = +svg.attr("height");
    const chartWidth = svgWidth - margins.left - margins.right;
    const chartHeight = svgHeight - margins.top - margins.bottom;

    const barWidth = chartWidth / 10;
    const padding = chartWidth / 20;

    const leftXFinal = margins.left + chartWidth / 2 - barWidth - padding / 2;
    const rightXFinal = margins.left + chartWidth / 2 + padding / 2;
    
    // Y 스케일 계산
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(svg.selectAll("rect").data(), d => (d && d.end != null) ? d.end : 0)])
        .range([chartHeight, 0]);

    // 비교 대상 막대들을 선택하고, 애니메이션으로 이동
    const selectedRects = svg.selectAll("rect").filter(d => {
        if (!d) return false;
        const catVal = String(d[keyField] ?? d.category);
        const subVal = String(d[subgroupField] ?? d.subgroup);
        return subVal === subgroupKey && (catVal === leftKey || catVal === rightKey);
    });

    let leftRectData = {};
    let rightRectData = {};

    selectedRects.each(function(d) {
        const currentRect = d3.select(this);
        const isLeft = String(d[keyField] ?? d.category) === leftKey;
        const targetX = isLeft ? leftXFinal : rightXFinal;
        
        // 기존 너비와 높이 가져오기
        const originalWidth = +currentRect.attr("width");
        const originalHeight = +currentRect.attr("height");

        if (isLeft) {
            leftRectData = { width: originalWidth, height: originalHeight };
        } else {
            rightRectData = { width: originalWidth, height: originalHeight };
        }

        currentRect.transition()
            .delay(delayDuration)
            .duration(transitionDuration)
            .attr("x", targetX)
            .attr("y", yScale(0) - originalHeight) // X축에 닿도록 y 위치 조정
            .attr("width", originalWidth) // 원래 너비 유지
            .attr("height", originalHeight) // 원래 높이 유지
            .attr("stroke", isLeft ? "blue" : "red")
            .attr("stroke-width", 3)
            .attr("opacity", 1); // 투명도 1로 설정
    });

    // 5. 레이블 추가 (애니메이션 완료 후)
    setTimeout(() => {
        // 왼쪽 값 레이블
        svg.append("text")
            .attr("class", "compare-label-value")
            .attr("x", leftXFinal + leftRectData.width / 2)
            .attr("y", yScale(0) - leftRectData.height - 10)
            .attr("text-anchor", "middle")
            .attr("font-weight", "bold")
            .text(leftValue.toLocaleString())
            .attr("opacity", 0)
            .transition().duration(500).attr("opacity", 1);
        
        // 오른쪽 값 레이블
        svg.append("text")
            .attr("class", "compare-label-value")
            .attr("x", rightXFinal + rightRectData.width / 2)
            .attr("y", yScale(0) - rightRectData.height - 10)
            .attr("text-anchor", "middle")
            .attr("font-weight", "bold")
            .text(rightValue.toLocaleString())
            .attr("opacity", 0)
            .transition().duration(500).attr("opacity", 1);

        // X축 레이블
        svg.append("text")
            .attr("class", "compare-axis-label")
            .attr("x", leftXFinal + barWidth / 2)
            .attr("y", yScale(0) + 20)
            .attr("text-anchor", "middle")
            .attr("font-weight", "bold")
            .text(`${leftKey}`)
            .attr("opacity", 0)
            .transition().duration(500).attr("opacity", 1);
        
        svg.append("text")
            .attr("class", "compare-axis-label")
            .attr("x", rightXFinal + barWidth / 2)
            .attr("y", yScale(0) + 20)
            .attr("text-anchor", "middle")
            .attr("font-weight", "bold")
            .text(`${rightKey}`)
            .attr("opacity", 0)
            .transition().duration(500).attr("opacity", 1);
        
        // 비교 결과 텍스트 (범용적으로 수정)
        let comparisonText;
        if (leftValue > rightValue) {
            comparisonText = `${leftKey}의 값이 ${rightKey}의 값보다 ${diff} 더 많습니다.`;
        } else if (leftValue < rightValue) {
            comparisonText = `${rightKey}의 값이 ${leftKey}의 값보다 ${diff} 더 많습니다.`;
        } else {
            comparisonText = `${leftKey}와 ${rightKey}의 값이 같습니다.`;
        }
        
        svg.append("text")
            .attr("class", "comparison-text")
            .attr("x", margins.left + chartWidth / 2)
            .attr("y", margins.top - 20)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .attr("font-size", 14)
            .attr("font-weight", "bold")
            .text(comparisonText)
            .attr("opacity", 0)
            .transition().duration(500).attr("opacity", 1);

    }, transitionDuration + delayDuration);

    return chartId;
}

// Assumes d3 is in scope
export function stackedBarDetermineRange(chartId, op) {
    const svg = d3.select(`#${chartId} svg:last-of-type`);
    if (svg.empty()) return chartId;

    const subgroupField = op.subgroupField || "subgroup";
    const subgroupKey = String(op.subgroupKey);
    if (!subgroupField || !subgroupKey) {
        console.warn("subgroupField/subgroupKey required");
        return chartId;
    }

    // Remove previous range lines and labels
    svg.selectAll(".range-line, .delta-label, .range-rect-halo, .range-min-max-label").remove();

    const chartWidth = +svg.attr("width");
    const chartHeight = +svg.attr("height");

    // Collect only the segments for this subgroup, including their original height
    const segs = [];
    svg.selectAll("rect").each(function(d) {
        if (!d || d.start == null || d.end == null) return;
        const subVal = String(d[subgroupField] ?? d.subgroup);
        if (subVal !== subgroupKey) return;
        segs.push({ 
            node: this, 
            data: d, 
            value: d.end - d.start,
            originalHeight: +d3.select(this).attr("height") // Store original height
        });
    });

    if (!segs.length) {
        console.warn("no segments matched", subgroupKey);
        return chartId;
    }

    // Hide all other segments and highlight selected ones
    svg.selectAll("rect")
        .transition().duration(500)
        .attr("opacity", d => {
            if (!d) return 0;
            const subVal = String(d[subgroupField] ?? d.subgroup);
            return subVal === subgroupKey ? 1 : 0.2;
        });

    // Animate the selected bars to the x-axis, maintaining original height
    const selectedBars = svg.selectAll("rect").filter(d => {
        if (!d) return false;
        const subVal = String(d[subgroupField] ?? d.subgroup);
        return subVal === subgroupKey;
    });

    selectedBars
        .transition().duration(1000).delay(500)
        .attr("y", d => {
            const seg = segs.find(s => s.data === d);
            return chartHeight - 50 - seg.originalHeight; // Calculate new y based on original height
        })
        .attr("height", d => {
            const seg = segs.find(s => s.data === d);
            return seg.originalHeight; // Maintain original height
        });

    // Find min/max values and corresponding boxes after animation
    const values = segs.map(s => s.value);
    const minV = d3.min(values);
    const maxV = d3.max(values);
    
    // Use setTimeout to draw the lines after the animation is complete
    setTimeout(() => {
        // Calculate y coordinates based on the new animated positions
        const minSeg = segs.find(s => s.value === minV);
        const maxSeg = segs.find(s => s.value === maxV);

        const yMin = chartHeight - 50 - minSeg.originalHeight;
        const yMax = chartHeight - 50 - maxSeg.originalHeight;
        
        const x0 = 50;
        const x1 = chartWidth - 30;

        const hl = "blue";
        const halo = "#ffffff";
        const pad = 2;

        // Draw horizontal dashed lines for min and max values
        [
            { y: yMax, value: maxV },
            { y: yMin, value: minV }
        ].forEach(({ y, value }) => {
            // White halo line
            svg.append("line")
                .attr("class", "range-line range-rect-halo")
                .attr("x1", x0).attr("x2", x1)
                .attr("y1", y).attr("y2", y)
                .attr("stroke", halo).attr("stroke-width", 4)
                .attr("opacity", 0)
                .transition().duration(400).attr("opacity", 1);

            // Blue dashed line
            svg.append("line")
                .attr("class", "range-line")
                .attr("x1", x0).attr("x2", x1)
                .attr("y1", y).attr("y2", y)
                .attr("stroke", hl).attr("stroke-width", 2)
                .attr("stroke-dasharray", "4 4")
                .attr("opacity", 0)
                .transition().delay(100).duration(400).attr("opacity", 1);

            // Value label
            svg.append("text")
                .attr("class", "range-min-max-label")
                .attr("x", x0 - 5)
                .attr("y", y)
                .attr("text-anchor", "end")
                .attr("dominant-baseline", "middle")
                .attr("font-size", 10)
                .attr("fill", hl)
                .text(value.toLocaleString());
        });

        // Vertical connector at right
        svg.append("line")
            .attr("class", "range-line range-rect-halo")
            .attr("x1", x1 + pad).attr("x2", x1 + pad)
            .attr("y1", yMax).attr("y2", yMin)
            .attr("stroke", halo).attr("stroke-width", 4)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);

        svg.append("line")
            .attr("class", "range-line")
            .attr("x1", x1 + pad).attr("x2", x1 + pad)
            .attr("y1", yMax).attr("y2", yMin)
            .attr("stroke", hl).attr("stroke-width", 2)
            .attr("stroke-dasharray", "4 4")
            .attr("opacity", 0)
            .transition().delay(100).duration(400).attr("opacity", 1);

        // Δ label to the right
        svg.append("text")
            .attr("class", "delta-label")
            .attr("x", x1 + pad * 3)
            .attr("y", (yMax + yMin) / 2)
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "middle")
            .attr("font-size", 12)
            .attr("fill", hl)
            .text(`Δ ${ (maxV - minV).toLocaleString() }`);
    }, 1500); // Wait for the animation to complete

    return chartId;
}


// Assumes d3 is in scope
export function stackedBarSort(chartId, op) {
    const svg = d3.select(`#${chartId}`).select("svg:last-of-type");
    if (svg.empty()) return chartId;

    // --- Helper function to determine chart orientation ---
    function getOrientation(chartSvg) {
        // A simple heuristic: check the dimensions of the first bar.
        const firstBar = chartSvg.select("rect");
        if (firstBar.empty() || firstBar.node() === null) return "vertical";
        const width = +firstBar.attr("width");
        const height = +firstBar.attr("height");
        return height > width ? "horizontal" : "vertical";
    }

    // 0. parameters
    const order = (op.order || "descending").toLowerCase();
    const limit = op.limit != null ? +op.limit : null;
    const subgroupField = op.subgroupField || null;
    const subgroupKey = op.subgroupKey != null ? String(op.subgroupKey) : null;
    const sortField = op.field || "value";

    // 1. dimensions & orientation
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const orientation = getOrientation(svg);

    // 2. collect all data-bound bars
    const allBars = svg.selectAll("rect")
        .filter(d => d && d.start != null && d.end != null);
    if (allBars.empty()) {
        console.warn("No data-bound rect elements found in the SVG.");
        return chartId;
    }

    // 3. create a selection for the bars we want to sort and animate
    const selectedBars = allBars
        .filter(d => subgroupField && subgroupKey ? String(d[subgroupField] ?? d.subgroup) === subgroupKey : true);
    
    if (selectedBars.empty()) {
        console.warn(`No bars matched for subgroupKey: ${subgroupKey}`);
        return chartId;
    }

    // 4. extract segments for later outline and sorting
    const segs = [];
    selectedBars.each(function (d) {
        segs.push({
            node: this,
            data: d, // Store the full data object for flexible sorting
            category: String(d.category),
            subgroup: String(d[subgroupField] ?? d.subgroup),
            value: d.end - d.start,
            originalX: +d3.select(this).attr("x"),
            originalY: +d3.select(this).attr("y"),
            originalWidth: +d3.select(this).attr("width"),
            originalHeight: +d3.select(this).attr("height")
        });
    });

    // 5. compute per-category sums based on the sortField
    const sums = new Map();
    segs.forEach(s => {
        const fieldValue = s.data[sortField] !== undefined ? s.data[sortField] : s.value;
        sums.set(s.category, (sums.get(s.category) || 0) + fieldValue);
    });

    // 6. sort categories based on sums
    const sortedCats = Array.from(sums.entries())
        .sort((a, b) =>
            order === "ascending" ? a[1] - b[1] : b[1] - a[1]
        )
        .map(([cat]) => cat);
    
    // 7. fade out non-subgroup bars (0–500ms)
    allBars.transition().duration(500)
        .attr("opacity", d => {
            if (subgroupField && subgroupKey) {
                return String(d[subgroupField] ?? d.subgroup) === subgroupKey ? 1 : 0.2;
            }
            return 1;
        });

    if (orientation === "horizontal") {
        // horizontal bars: categories on Y axis
        const yScale = d3.scaleBand()
            .domain(sortedCats)
            .range([margin.top, height - margin.bottom])
            .padding(0.1);

        // 8. slide & re-anchor selected bars (500–1500ms)
        selectedBars.transition().delay(500).duration(1000)
            .attr("y", d => yScale(String(d.category)))
            .attr("x", margin.left)
            .attr("width", d => {
                const xScale = d3.scaleLinear()
                    .domain([0, d3.max(Array.from(sums.values()))])
                    .range([0, width - margin.left - margin.right]);
                return xScale(d.end - d.start);
            })
            .attr("height", yScale.bandwidth());

        // 9. update Y axis
        svg.select(".y-axis")
            .transition().duration(800)
            .call(d3.axisLeft(yScale));
        svg.selectAll(".y-axis g.tick")
            .transition().duration(800)
            .attr("transform", d => `translate(0,${yScale(d)})`);

    } else {
        // vertical bars: categories on X axis
        const xScale = d3.scaleBand()
            .domain(sortedCats)
            .range([margin.left, width - margin.right])
            .padding(0.1);

        // 8. slide & re-anchor selected bars (500–1500ms)
        selectedBars.transition().delay(500).duration(1000)
            .attr("x", d => xScale(String(d.category)))
            .attr("width", xScale.bandwidth())
            .attr("y", d => {
                const seg = segs.find(s => s.data === d);
                return height - margin.bottom - seg.originalHeight;
            })
            .attr("height", d => {
                const seg = segs.find(s => s.data === d);
                return seg.originalHeight;
            });

        // 9. update X axis
        svg.select(".x-axis")
            .transition().duration(800)
            .call(d3.axisBottom(xScale))
            .selectAll("text").attr("y", 10);
        svg.selectAll(".x-axis g.tick")
            .transition().duration(800)
            .attr("transform", d => `translate(${xScale(d)},0)`);
    }

    // 10. highlight top-N segments outlines after animation
    if (limit != null) {
        const hl = "#ffeb3b", halo = "#ffffff", pad = 2;
        const topCats = sortedCats.slice(0, limit);
        setTimeout(() => {
            const sortedSegs = segs.filter(s => topCats.includes(s.category));
            
            sortedSegs.forEach(s => {
                let x, y, barWidth, barHeight;
                // Get the current position and size of the bar after the animation
                const currentBarNode = d3.select(s.node);
                if (currentBarNode.empty() || currentBarNode.node() === null) return;
                x = +currentBarNode.attr("x");
                y = +currentBarNode.attr("y");
                barWidth = +currentBarNode.attr("width");
                barHeight = +currentBarNode.attr("height");

                // white halo
                const haloRect = svg.append("rect")
                    .attr("class", "sort-outline")
                    .attr("x", x - pad).attr("y", y - pad)
                    .attr("width", barWidth + pad * 2)
                    .attr("height", barHeight + pad * 2)
                    .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4);
                
                haloRect.raise();
                haloRect.attr("opacity", 0)
                    .transition().duration(400).attr("opacity", 1);
                    
                // yellow outline
                const outlineRect = svg.append("rect")
                    .attr("class", "sort-outline")
                    .attr("x", x - pad).attr("y", y - pad)
                    .attr("width", barWidth + pad * 2)
                    .attr("height", barHeight + pad * 2)
                    .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3);
                
                outlineRect.raise();
                outlineRect.attr("opacity", 0)
                    .transition().duration(400).attr("opacity", 1);
            });
        }, 1500);
    }

    return chartId;
}