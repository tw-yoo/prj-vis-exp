
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


export async function stackedBarRetrieve(chartId, op, fullData) {
    const { svg, g, xField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const allRects = g.selectAll("rect");
    const targetX = op.x;
    const targetG = op.g;

    const hlColor = "#007bff";
    const animationDuration = 600;

    if (targetX != null && targetG != null) {

        const stackRects = allRects.filter(d => d.key == targetX);
        const otherRects = allRects.filter(d => d.key != targetX);
        
        if (stackRects.empty()) {
            console.warn("Retrieve: Target stack not found for", op.x);
            return;
        }

        await otherRects.transition().duration(animationDuration).attr("opacity", 0.2).end();

        await delay(800);

        const targetSegment = stackRects.filter(d => d.subgroup == targetG);
        const otherSegmentsInStack = stackRects.filter(d => d.subgroup != targetG);

        if (targetSegment.empty()) {
            console.warn("Retrieve: Target segment not found for", op);
            return;
        }

        await Promise.all([
            otherSegmentsInStack.transition().duration(animationDuration).attr("opacity", 0.2).end(),
            targetSegment.transition().duration(animationDuration).attr("stroke", hlColor).attr("stroke-width", 2).end()
        ]);


        const d = targetSegment.datum();
        const x = +targetSegment.attr("x") + (+targetSegment.attr("width") / 2);
        const y = +targetSegment.attr("y") + (+targetSegment.attr("height") / 2);

        g.append("text").attr("class", "annotation value-tag")
            .attr("x", x).attr("y", y).attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle").attr("fill", "white").attr("font-weight", "bold")
            .attr("stroke", hlColor).attr("stroke-width", 0.5)
            .text(d.value);

    } else if (targetX != null) {

        const targetRects = allRects.filter(d => d.key == targetX);
        const otherRects = allRects.filter(d => d.key != targetX);

        if (targetRects.empty()) {
            console.warn("Retrieve: Target stack not found for", op.x);
            return;
        }
        
        await Promise.all([
            otherRects.transition().duration(animationDuration).attr("opacity", 0.2).end(),
            targetRects.transition().duration(animationDuration).attr("opacity", 1.0).end()
        ]);

        const total = d3.sum(fullData.filter(d => d[xField] == targetX), d => d.count);
        const topRect = targetRects.filter((d, i, nodes) => i === nodes.length - 1).node();
        
        g.append("text").attr("class", "annotation value-tag")
            .attr("x", +topRect.getAttribute("x") + (+topRect.getAttribute("width") / 2))
            .attr("y", +topRect.getAttribute("y") - 10)
            .attr("text-anchor", "middle").attr("font-weight", "bold")
            .attr("fill", hlColor)
            .text(`Total: ${total}`);
    }
}


export async function stackedBarFilter(chartId, op, currentData, fullData) {
    const { g, xField } = getSvgAndSetup(chartId);
    const allRects = g.selectAll("rect");

    let passedData = [];
    let passedKeys = new Set();

    if (op.g) {
        passedData = currentData.filter(d => d.weather === op.g);
        passedKeys = new Set(passedData.map(d => `${d.month}-${d.weather}`));

    } else if (op.y && op.y.satisfy) { 
        const totals = d3.rollup(currentData, v => d3.sum(v, d => d.count), d => d[xField]);
        const cmp = { ">": (a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b };
        const satisfyFn = cmp[op.y.satisfy];
        const key = op.y.key;
        
        const passedMonths = new Set();
        for (const [month, total] of totals) {
            if (satisfyFn(total, key)) { passedMonths.add(String(month)); }
        }
        passedData = currentData.filter(d => passedMonths.has(String(d[xField])));
        passedKeys = new Set(passedData.map(d => `${d.month}-${d.weather}`));

    } else if (op.x) { // by x
        const targetX = String(op.x);
        passedData = currentData.filter(d => String(d[xField]) === targetX);
        passedKeys = new Set(passedData.map(d => `${d.month}-${d.weather}`));
    }
    
    await allRects.transition().duration(800)
        .attr("opacity", d => passedKeys.has(`${d.key}-${d.subgroup}`) ? 1.0 : 0.2)
        .end();

    return passedData;
}

