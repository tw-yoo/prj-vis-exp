import {DatumValue} from "../../../object/valueType.js";

export function getSvgAndSetup(chartId) {
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

export function clearAllAnnotations(svg) {
    svg.selectAll(".annotation, .filter-label, .sort-label, .value-tag, .range-line, .value-line, .threshold-line, .threshold-label, .compare-label").remove();
}

export function getCenter(bar, orientation, margins) {
    const x0 = +bar.getAttribute("x"), y0 = +bar.getAttribute("y"),
          w = +bar.getAttribute("width"), h = +bar.getAttribute("height");
    if (orientation === "horizontal") {
        return { x: x0 + w + 4 + margins.left, y: y0 + h / 2 + margins.top };
    } else {
        return { x: x0 + w / 2 + margins.left, y: y0 - 6 + margins.top };
    }
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function simpleBarRetrieveValue(chartId, op, data) {
    const { svg, g, xField, yField, orientation, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const targetId = String(op.target);
    const hlColor = "#ff6961";
    const baseColor = "#69b3a2";

    const target = g.selectAll("rect").filter(function() {
        return d3.select(this).attr("data-id") === targetId;
    });

    if (target.empty()) {
        console.warn("RetrieveValue: target bar not found for key:", op.target);
        g.selectAll("rect").transition().duration(300).attr("fill", baseColor).attr("opacity", 1);
        return null;
    }

    const otherBars = g.selectAll("rect").filter(function() {
        return d3.select(this).attr("data-id") !== targetId;
    });

    await Promise.all([
        target.transition().duration(600)
            .attr("fill", hlColor).attr("opacity", 1).end(),
        otherBars.transition().duration(600)
            .attr("fill", baseColor).attr("opacity", 0.3).end()
    ]);

    const bar = target.node();
    const val = bar.getAttribute("data-value");

    const barX = +bar.getAttribute("x"), barY = +bar.getAttribute("y"),
        barW = +bar.getAttribute("width"), barH = +bar.getAttribute("height");

    const lineY = margins.top + (orientation === 'vertical' ? barY : barY + barH / 2);
    const finalX2 = margins.left + (orientation === 'vertical' ? barX + barW / 2 : barW);

    const line = svg.append("line").attr("class", "annotation")
        .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4")
        .attr("x1", margins.left).attr("y1", lineY)
        .attr("x2", margins.left).attr("y2", lineY);

    await line.transition().duration(400).attr("x2", finalX2).end();

    const { x, y } = getCenter(bar, orientation, margins);
    svg.append("text").attr("class", "annotation")
        .attr("x", x).attr("y", y).attr("text-anchor", "middle")
        .attr("font-size", 12).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(val)
        .attr("opacity", 0)
        .transition().duration(400).attr("opacity", 1);


    const itemFromList = Array.isArray(data)
        ? data.find(d => d && String(d.target) === op.target)
        : undefined;
    if (itemFromList instanceof DatumValue) {
        return itemFromList;
    }
    return null
}

export async function simpleBarFilter(chartId, op, data) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const matchColor = "#ffa500";
    let filteredData;
    let labelText = "";

    const sortOrderStr = svg.attr("data-x-sort-order");
    const sortOrder = sortOrderStr ? sortOrderStr.split(',') : [];

    if (op.field === xField && (op.from || op.to) && sortOrder.length > 0) {

        const fromIndex = op.from ? sortOrder.indexOf(op.from) : 0;
        const toIndex = op.to ? sortOrder.indexOf(op.to) : sortOrder.length - 1;

        if (fromIndex === -1 || toIndex === -1) {
            console.warn("Invalid 'from' or 'to' value in sortOrder:", op);
            return data;
        }

        const allowedCategories = new Set(sortOrder.slice(fromIndex, toIndex + 1));
        filteredData = data.filter(d => allowedCategories.has(d.target));
        
        labelText = `Filter: ${xField} in [${sortOrder.slice(fromIndex, toIndex + 1).join(', ')}]`;

    } else {
        const filterField = op.field;
        const satisfyMap = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, "==": (a, b) => a === b };
        const satisfy = satisfyMap[op.operator] || (() => true);
        const filterKey = isNaN(+op.value) ? op.value : +op.value;
        
        filteredData = data.filter(d => {
            const value = isNaN(+d.value) ? d.value : +d.value;
            return satisfy(value, filterKey);
        });

        labelText = `Filter: ${filterField} ${op.operator} ${op.value}`;

        if (filterField === yField && !isNaN(filterKey)) {
            const yScaleFull = d3.scaleLinear().domain([0, d3.max(data, d => +d[yField]) || 0]).nice().range([plot.h, 0]);
            const yPos = yScaleFull(filterKey);
            svg.append("line").attr("class", "threshold-line")
                .attr("x1", margins.left).attr("y1", margins.top + yPos)
                .attr("x2", margins.left + plot.w).attr("y2", margins.top + yPos)
                .attr("stroke", "blue").attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
            svg.append("text").attr("class", "threshold-label")
                .attr("x", margins.left + plot.w + 5).attr("y", margins.top + yPos)
                .attr("dominant-baseline", "middle")
                .attr("fill", "blue").attr("font-size", 12).attr("font-weight", "bold")
                .text(filterKey);
        }
    }

    if (filteredData.length === 0) {
        console.warn("Filter resulted in empty data.");
        g.selectAll("rect").transition().duration(500).attr("opacity", 0).remove();
        return [];
    }

    const xScaleFiltered = d3.scaleBand()
        .domain(filteredData.map(d => d.target))
        .range([0, plot.w])
        .padding(0.2);

    const categoryKey = filteredData[0]?.category || xField;
    const measureKey  = filteredData[0]?.measure  || yField;
    const plainRows = filteredData.map(d => ({
        [categoryKey]: d.target,
        [measureKey]:  d.value,
        group: d.group
    }));
    const keyFunction = d => String(d[categoryKey]);
    const bars = g.selectAll("rect").data(plainRows, keyFunction);

    const updatePromises = [];

    updatePromises.push(bars.exit().transition().duration(800)
        .attr("opacity", 0).attr("height", 0).attr("y", plot.h).remove().end());
    
    updatePromises.push(bars.transition().duration(800)
        .attr("x", d => xScaleFiltered(d[categoryKey]))
        .attr("width", xScaleFiltered.bandwidth())
        .attr("fill", matchColor).end());

    updatePromises.push(g.select(".x-axis").transition().duration(800)
        .call(d3.axisBottom(xScaleFiltered)).end());

    await Promise.all(updatePromises);

    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 8)
        .attr("font-size", 12).attr("fill", matchColor).attr("font-weight", "bold")
        .text(labelText);

    return filteredData;
}

export async function simpleBarFindExtremum(chartId, op, data) {
    const { svg, g, xField, yField, margins, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!data || data.length === 0) {
        console.warn("findExtremum: No data to process.");
        return data;
    }
    
    const hlColor = "#a65dfb";
    const valueField = op.field || (orientation === 'vertical' ? yField : xField);

    const extremumValue = op.type === 'min' 
        ? d3.min(data, d => +d[valueField]) 
        : d3.max(data, d => +d[valueField]);
    
    const target = g.selectAll("rect")
        .filter(d => {
            if (!d) return false;
            const barValue = d.value !== undefined ? d.value : d[valueField];
            return +barValue === extremumValue;
        });

    if (target.empty()) {
        console.warn("findExtremum: target bar not found for value:", extremumValue);
        return data;
    }

    await target.transition().duration(600)
        .attr("fill", hlColor)
        .end();

    const node = target.nodes()[0];
    if (node) {
        const barX = +node.getAttribute("x"), barY = +node.getAttribute("y"),
              barW = +node.getAttribute("width"), barH = +node.getAttribute("height");
        
        const lineY = margins.top + (orientation === 'vertical' ? barY : barY + barH / 2);
        const finalX2 = margins.left + (orientation === 'vertical' ? barX + barW / 2 : barW);

        const line = svg.append("line").attr("class", "annotation")
            .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4")
            .attr("x1", margins.left).attr("y1", lineY)
            .attr("x2", margins.left).attr("y2", lineY);

        await line.transition().duration(400).attr("x2", finalX2).end();

        const { x, y } = getCenter(node, orientation, margins);
        const labelText = `${op.type === "min" ? "Min" : "Max"}: ${extremumValue}`;

        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(labelText)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    }
    
    return data;
}

export async function simpleBarDetermineRange(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = "#0d6efd";
    const valueField = op.field || (orientation === 'vertical' ? yField : xField);

    const values = data.map(d => {
        return d.value !== undefined ? +d.value : +d[valueField];
    });
    const minV = d3.min(values);
    const maxV = d3.max(values);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => (d.value !== undefined ? +d.value : +d[valueField])) || 0])
        .nice()
        .range([plot.h, 0]);

    const animationPromises = [];

    const findBars = (val) => g.selectAll("rect").filter(d => {
        if (!d) return false;
        const barValue = d.value !== undefined ? d.value : d[valueField];
        return +barValue === val;
    });

    const minBars = findBars(minV);
    const maxBars = findBars(maxV);

    animationPromises.push(
        minBars.transition().duration(600).attr("fill", hlColor).end()
    );
    animationPromises.push(
        maxBars.transition().duration(600).attr("fill", hlColor).end()
    );

    [
        { value: minV, label: "Min" },
        { value: maxV, label: "Max" }
    ].forEach(item => {
        if (item.value === undefined) return;
        const yPos = margins.top + yScale(item.value);
        const line = svg.append("line").attr("class", "annotation")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-dasharray", "4 4");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        const text = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left - 20).attr("y", yPos)
            .attr("text-anchor", "end").attr("dominant-baseline", "middle")
            .attr("fill", hlColor).attr("font-weight", "bold")
            .text(`${item.label}: ${item.value}`)
            .attr("opacity", 0);

        animationPromises.push(
            text.transition().delay(400).duration(400).attr("opacity", 1).end()
        );
    });

    if (minV !== undefined && maxV !== undefined) {
        const rangeText = `Range: ${minV} ~ ${maxV}`;
        const topLabel = svg.append("text").attr("class", "annotation")
            .attr("x", margins.left).attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", hlColor).text(rangeText)
            .attr("opacity", 0);

        animationPromises.push(
            topLabel.transition().duration(600).attr("opacity", 1).end()
        );
    }

    await Promise.all(animationPromises);

    return data;
}

export async function simpleBarCompare(chartId, op, data) {
    const { svg, g, xField, yField, margins } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const keyField = op.keyField || xField;
    const finder = (keyToFind) => (d) => {
        if (!d) return false;
        const id = d.key || d[keyField];
        return String(id) === String(keyToFind);
    };

    const leftBar = g.selectAll("rect").filter(finder(op.left));
    const rightBar = g.selectAll("rect").filter(finder(op.right));

    if (leftBar.empty() || rightBar.empty()) {
        return data;
    }

    const valueField = op.field || yField;
    const lv = leftBar.datum().value !== undefined ? leftBar.datum().value : leftBar.datum()[valueField];
    const rv = rightBar.datum().value !== undefined ? rightBar.datum().value : rightBar.datum()[valueField];

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

    return data;
}

export async function simpleBarSort(chartId, op, data) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sortField = op.field || yField;
    
    const sortedData = [...data].sort((a, b) => {
        const valA = a.value !== undefined ? a.value : a[sortField];
        const valB = b.value !== undefined ? b.value : b[sortField];
        return op.order === "ascending" ? valA - valB : valB - valA;
    });

    const newXScale = d3.scaleBand()
        .domain(sortedData.map(d => d.key || d[xField]))
        .range([0, plot.w])
        .padding(0.2);

    const keyFunction = d => d.key || d[xField];
    const transitions = [];
    
    transitions.push(
        g.selectAll("rect").data(sortedData, keyFunction)
            .transition().duration(1000)
            .attr("x", d => newXScale(d.key || d[xField]))
            .attr("width", newXScale.bandwidth())
            .end()
    );

    transitions.push(
        g.select(".x-axis").transition().duration(1000)
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
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", "#6f42c1").text(labelText);

    return sortedData;
}

export async function simpleBarSum(chartId, op, currentData) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const sumField = op.field || yField;
    const totalSum = d3.sum(currentData, d => d[sumField]);

    const newYScale = d3.scaleLinear()
        .domain([0, totalSum]).nice()
        .range([plot.h, 0]);

    const yAxisTransition = svg.select(".y-axis").transition().duration(1000)
        .call(d3.axisLeft(newYScale))
        .end();

    const bars = g.selectAll("rect");
    const barWidth = +bars.attr("width");
    const targetX = plot.w / 2 - barWidth / 2; 

    let runningTotal = 0;
    const stackPromises = [];

    bars.each(function(d) {
        const value = d[sumField];
        const rect = d3.select(this);
        
        const t = rect.transition().duration(1200)
            .attr("x", targetX)
            .attr("y", newYScale(runningTotal + value))
            .attr("height", plot.h - newYScale(value))
            .end();
        
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    await delay(200);

    const finalY = newYScale(totalSum);

    svg.append("line").attr("class", "annotation value-line")
        .attr("x1", margins.left)
        .attr("y1", margins.top + finalY)
        .attr("x2", margins.left + plot.w)
        .attr("y2", margins.top + finalY)
        .attr("stroke", "red")
        .attr("stroke-width", 2);

    svg.append("text").attr("class", "annotation value-tag")
        .attr("x", margins.left + plot.w - 10) 
        .attr("y", margins.top + finalY - 10) 
        .attr("fill", "red")
        .attr("font-weight", "bold")
        .attr("text-anchor", "end") 
        .text(`Sum: ${totalSum.toLocaleString()}`);
    return currentData; 
}