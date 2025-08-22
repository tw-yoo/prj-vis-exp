
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

export async function stackedBarToSimpleBar(chartId, op, data) {
    const { svg, xField, yField, colorField, plot, margins } = getSvgAndSetup(chartId);
    
    let filteredData = [...data];
    if (op.group) {
        filteredData = filteredData.filter(d => d.group === op.group);
    }
    // if (op.key !== undefined && op.satisfy) {
    //     const cmp = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a == b };
    //     const satisfyFn = cmp[op.satisfy];
    //     if (satisfyFn) {
    //         filteredData = filteredData.filter(d => satisfyFn(d[yField], op.key));
    //     }
    // }

    console.log(filteredData)
    const targetIds = new Set(filteredData.map(d => `${d.target}-${d.group}-${d.value}`));
    const chartRects = svg.select(".plot-area").selectAll("rect");
    console.log(targetIds);
    console.log(chartRects);

    const highlightPromises = [];
    chartRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        console.log(d)
        const isTarget = d ? targetIds.has(`${d.key}-${d.subgroup}-${d.value}`) : false;
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
    const fadeOut = chartRects.filter(d => !targetIds.has(`${d.key}-${d.subgroup}-${d.value}`))
        .transition().duration(500).attr("opacity", 0).remove().end();
    transformPromises.push(fadeOut);
    
    const selectedRects = chartRects.filter(d => targetIds.has(`${d.key}-${d.subgroup}-${d.value}`));
    const newYMax = d3.max(filteredData, d => d.value);
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
    
    // let labelText = "Filtered by: ";
    // const conditions = [];
    // if (op.group) conditions.push(`'${op.group}'`);
    // if (op.key !== undefined) conditions.push(`${op.field || yField} ${op.satisfy} ${op.key}`);
    // labelText += conditions.join(" & ");
    //
    // svg.append("text").attr("class", "filter-label")
    //   .attr("x", margins.left).attr("y", margins.top - 10)
    //   .attr("font-size", 14).attr("font-weight", "bold")
    //   .attr("fill", "#007bff").text(labelText);

    return filteredData;
}

export async function stackedBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const t = op?.target;
    let categoryLabel = null;
    if (t && typeof t === 'object') {
        if (t.category != null) categoryLabel = String(t.category);
        else if (orientation === 'vertical' && t.x != null) categoryLabel = String(t.x);
        else if (orientation === 'horizontal' && t.y != null) categoryLabel = String(t.y);
        else if (t.index != null) {
            const order = Array.from(new Set(data.map(dv => String(dv.target))));
            categoryLabel = order[t.index] != null ? String(order[t.index]) : null;
        }
    } else if (t != null) {
        categoryLabel = String(t);
        // Accept id form like "cat__sg" and extract category
        if (categoryLabel.includes('__')) categoryLabel = categoryLabel.split('__')[0];
    }

    if (!categoryLabel) {
        console.warn('stackedBarRetrieveValue: missing target category');
        return [];
    }

    const wantGroup = op?.group != null ? String(op.group) : null;

    // Build set of pairs `${category}-${subgroup}` to highlight
    const targetPairs = new Set();
    if (wantGroup) {
        targetPairs.add(`${categoryLabel}-${wantGroup}`);
    } else {
        const sgs = Array.from(new Set(data
            .filter(dv => String(dv.target) === categoryLabel)
            .map(dv => String(dv.group))));
        sgs.forEach(sg => targetPairs.add(`${categoryLabel}-${sg}`));
    }

    // 2) Apply highlights to rects
    const allRects = g.selectAll('rect');
    const promises = [];
    allRects.each(function() {
        const rect = d3.select(this);
        const rd = rect.datum(); // { key: category, subgroup, value, ... }
        const isHit = rd && targetPairs.has(`${String(rd.key)}-${String(rd.subgroup)}`);
        const p = rect.transition().duration(350)
            .attr('opacity', isHit ? 1 : 0.25)
            .attr('stroke', isHit ? 'black' : 'none')
            .attr('stroke-width', isHit ? 1 : 0)
            .end();
        promises.push(p);
    });
    await Promise.all(promises);

    // 3) Add value tag annotation (sum for whole bar, or segment value for single subgroup)
    const matched = wantGroup
        ? data.filter(dv => String(dv.target) === categoryLabel && String(dv.group) === wantGroup)
        : data.filter(dv => String(dv.target) === categoryLabel);
    console.log(matched);

    if (matched.length > 0) {
        const value = wantGroup
            ? (matched[0]?.value ?? 0)
            : matched.reduce((acc, dv) => acc + (+dv.value || 0), 0);

        const nodes = [];
        allRects.each(function() {
            const rd = d3.select(this).datum();
            if (rd && targetPairs.has(`${String(rd.key)}-${String(rd.subgroup)}`)) nodes.push(this);
        });
        if (nodes.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(n => {
                const b = n.getBBox();
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
            });

            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const labelX = orientation === 'vertical' ? cx : maxX + 6;
            const labelY = orientation === 'vertical' ? Math.max(10, minY - 6) : cy;

            g.append('text')
                .attr('class', 'value-tag annotation')
                .attr('x', labelX)
                .attr('y', labelY)
                .attr('text-anchor', orientation === 'vertical' ? 'middle' : 'start')
                .attr('font-size', 12)
                .attr('font-weight', 'bold')
                .attr('fill', '#e03131')
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(value))
                .attr('opacity', 0)
                .transition().duration(200).attr('opacity', 1);
        }
    }

    return matched;
}

export async function stackedBarFilter(chartId, op, data, isLast = false) {
    const { g, xField } = getSvgAndSetup(chartId);
    const allRects = g.selectAll("rect");

    let passedData = [];
    let passedKeys = new Set();

    if (op.g) {
        passedData = data.filter(d => d.weather === op.g);
        passedKeys = new Set(passedData.map(d => `${d.month}-${d.weather}`));

    } else if (op.y && op.y.satisfy) { 
        const totals = d3.rollup(data, v => d3.sum(v, d => d.count), d => d.target);
        const cmp = { ">": (a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b };
        const satisfyFn = cmp[op.y.satisfy];
        const key = op.y.key;
        
        const passedMonths = new Set();
        for (const [month, total] of totals) {
            if (satisfyFn(total, key)) { passedMonths.add(String(month)); }
        }
        passedData = data.filter(d => passedMonths.has(String(d.target)));
        passedKeys = new Set(passedData.map(d => `${d.target}-${d.group}-${d.value}`));

    } else if (op.x) { // by x
        const targetX = String(op.x);
        passedData = data.filter(d => String(d.target) === targetX);
        passedKeys = new Set(passedData.map(d => `${d.target}-${d.group}-${d.value}`));
    }
    
    await allRects.transition().duration(800)
        .attr("opacity", d => passedKeys.has(`${d.key}-${d.subgroup}-${d.value}`) ? 1.0 : 0.2)
        .end();

    return passedData;
}

export async function stackedBarFindExtremum(chartId, op, data, isLast = false) {}

export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {}

export async function stackedBarCompare(chartId, op, data, isLast = false) {}

export async function stackedBarSort(chartId, op, data, isLast = false) {await stackedBarToSimpleBar(chartId, op, data);}

export async function stackedBarSum(chartId, op, data, isLast = false) {}

export async function stackedBarAverage(chartId, op, data, isLast = false) {}

export async function stackedBarDiff(chartId, op, data, isLast = false) {}

export async function stackedBarNth(chartId, op, data, isLast = false) {}

export async function stackedBarCount(chartId, op, data, isLast = false) {}

