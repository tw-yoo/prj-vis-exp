import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";

// 이 헬퍼 함수들을 simpleBarFunctions.js 파일 상단에 추가해주세요.
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }

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

export async function simpleBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const hlColor = "#ff6961";
    const baseColor = "#69b3a2";

    const targets = Array.isArray(op.target) ? op.target : [op.target];
    const target = g.selectAll("rect").filter(function() {
        return targets.includes(d3.select(this).attr("data-id"));
    });
    const otherBars = g.selectAll("rect").filter(function() {
        return !targets.includes(d3.select(this).attr("data-id"));
    });

    if (target.empty()) {
        console.warn("RetrieveValue: target bar(s) not found for key(s):", op.target);
        g.selectAll("rect").transition().duration(300).attr("fill", baseColor).attr("opacity", 1);
        return null;
    }

    await Promise.all([
        target.transition().duration(600)
            .attr("fill", hlColor).attr("opacity", 1).end(),
        otherBars.transition().duration(600)
            .attr("fill", baseColor).attr("opacity", 0.3).end()
    ]);

    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand()
            .domain(data.map(d => d.target))
            .range([0, plot.w])
            .padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    } else {
        yScale = d3.scaleBand()
            .domain(data.map(d => d.target))
            .range([0, plot.h])
            .padding(0.2);
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
    }

    const targetBars = data.filter(d => targets.includes(d.target));

    if (targetBars.length === 0) {
        console.warn('simpleBarRetrieve: no matching bars found');
        return data;
    }

    if (orientation === 'vertical') {
        const lines = g.selectAll('.retrieve-line')
            .data(targetBars, d => d.id || d.target);

        lines.enter()
            .append('line')
            .attr('class', 'retrieve-line')
            .attr('x1', d => xScale(d.target) + xScale.bandwidth() / 2)
            .attr('x2', 0)
            .attr('y1', d => yScale(d.value))
            .attr('y2', d => yScale(d.value))
            .attr('stroke', 'red')
            .attr('stroke-width', 2);

        lines.exit().remove();
    } else {
        const lines = g.selectAll('.retrieve-line')
            .data(targetBars, d => d.id || d.target);

        lines.enter()
            .append('line')
            .attr('class', 'retrieve-line')
            .attr('y1', d => yScale(d.target) + yScale.bandwidth() / 2)
            .attr('y2', 0)
            .attr('x1', d => xScale(d.value))
            .attr('x2', d => xScale(d.value))
            .attr('stroke', 'red')
            .attr('stroke-width', 2);

        lines.exit().remove();
    }

    target.each(function() {
        const bar = this;
        const val = bar.getAttribute("data-value");
        const { x, y } = getCenter(bar, orientation, margins);
        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y).attr("text-anchor", "middle")
            .attr("font-size", 12).attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(val)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    });

    targetBars.forEach(tb => {
        g.append('text')
            .attr('class', 'annotation retrieve-text')
            .attr('x', xScale(tb.target) + xScale.bandwidth() / 2)
            .attr('y', yScale(tb.value) - 5)
            .attr('text-anchor', 'middle')
            .attr('fill', 'red')
            .attr('font-weight', 'bold')
            .text(tb.value);
    });

    const itemFromList = Array.isArray(data)
        ? data.find(d => (
            isLast
                ? (d && targets.includes(String(d.id)))
                : (d && targets.includes(String(d.target)))
          ))
        : undefined;
    if (itemFromList instanceof DatumValue) {
        return itemFromList;
    }
    return null;
}

export async function simpleBarFilter(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const matchColor = "#ffa500";
    let filteredData = [];
    let labelText = "";

    const sortOrderStr = svg.attr("data-x-sort-order") || "";
    const sortOrder = sortOrderStr.split(',').filter(Boolean);

    const toNumber = v => (v == null ? NaN : +v);
    const getDatumValue = d => {
        if (d && d.value !== undefined) return +d.value;
        if (yField && d && d[yField] !== undefined) return +d[yField];
        if (xField && d && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const drawThreshold = (rawVal) => {
        const v = toNumber(rawVal);
        if (!Number.isFinite(v)) return;
        const maxV = d3.max(data, getDatumValue) || 0;
        const yScaleFull = d3.scaleLinear().domain([0, maxV]).nice().range([plot.h, 0]);
        const yPos = yScaleFull(v);
        svg.append("line").attr("class", "threshold-line")
            .attr("x1", margins.left).attr("y1", margins.top + yPos)
            .attr("x2", margins.left).attr("y2", margins.top + yPos)
            .attr("stroke", "blue").attr("stroke-width", 2).attr("stroke-dasharray", "5 5")
            .transition().duration(800).attr("x2", margins.left + plot.w);
        svg.append("text").attr("class", "threshold-label")
            .attr("x", margins.left + plot.w + 5).attr("y", margins.top + yPos)
            .attr("dominant-baseline", "middle")
            .attr("fill", "blue").attr("font-size", 12).attr("font-weight", "bold")
            .text(v);
    };

    if (op.field === xField && sortOrder.length > 0) {
        const allowed = new Set(sortOrder);
        filteredData = data.filter(d => allowed.has(d.target));
        labelText = `Filter: ${xField} in [${sortOrder.join(', ')}]`;
    } else {
        const map = { ">": (a,b) => a > b, ">=": (a,b) => a >= b, "<": (a,b) => a < b, "<=": (a,b) => a <= b, "==": (a,b) => a === b };
        const satisfy = map[op.operator] || (() => true);
        const key = Number.isFinite(+op.value) ? +op.value : op.value;

        filteredData = data.filter(d => {
            const v = Number.isFinite(+d.value) ? +d.value : d.value;
            return satisfy(v, key);
        });

        labelText = `Filter: ${op.field} ${op.operator} ${op.value}`;
        drawThreshold(key);
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

    const bars = g.selectAll("rect").data(plainRows, d => String(d[categoryKey]));

    await Promise.all([
        bars.exit().transition().duration(800)
            .attr("opacity", 0).attr("height", 0).attr("y", plot.h).remove().end(),
        bars.transition().duration(800)
            .attr("x", d => { return xScaleFiltered(d[categoryKey])})
            .attr("width", xScaleFiltered.bandwidth())
            .attr("fill", matchColor).end(),

        g.select(".x-axis").transition().duration(800)
            .call(d3.axisBottom(xScaleFiltered)).end()
    ]);

    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 8)
        .attr("font-size", 12).attr("fill", matchColor).attr("font-weight", "bold")
        .text(labelText);

    return filteredData;
}

export async function simpleBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn("findExtremum: No data to process.");
        return data;
    }

    const hlColor = "#a65dfb";

    const valueAxisField = (orientation === 'vertical') ? yField : xField;
    const measureName = data[0]?.measure;

    const getVal = (d) => {
        if (!d) return NaN;
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (d[valueAxisField] !== undefined) return +d[valueAxisField];
        return NaN;
    };

    const numericValues = data.map(getVal).filter(v => !Number.isNaN(v));
    const extremumValue = (op?.which === 'min')
        ? d3.min(numericValues)
        : d3.max(numericValues);

    if (extremumValue == null || Number.isNaN(extremumValue)) {
        console.warn("findExtremum: Could not compute extremum value.");
        return data;
    }

    const target = g.selectAll("rect")
        .filter(d => +getVal(d) === +extremumValue);

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
        const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${extremumValue}`;

        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(labelText)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    }

    const targetValue = op.which === 'min'
        ? d3.min(data, d => +d.value)
        : d3.max(data, d => +d.value)
    const returnDatumValue = data.find(d => +d.value === targetValue)

    returnDatumValue.target = `${op.which} (${returnDatumValue.target})`;

    return returnDatumValue;
}

// simpleBarFunctions.js 파일의 다른 코드는 그대로 두고, 이 함수만 교체하세요.

export async function simpleBarDetermineRange(chartId, op, data, isLast = false) {
    // getSvgAndSetup에서 orientation, xField, yField를 가져옵니다.
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = "#0d6efd";
    // op.field는 범위를 계산할 '수치' 필드를 가리킵니다.
    const valueField = op.field || (orientation === 'vertical' ? yField : xField);

    // [수정] 차트 방향에 따라 '카테고리' 축의 필드명을 결정합니다.
    const categoryAxisName = orientation === 'vertical' ? xField : yField;

    const values = data.map(d => {
        return d.value !== undefined ? +d.value : +d[valueField];
    }).filter(v => !isNaN(v));

    if (values.length === 0) {
        console.warn("DetermineRange: No valid data to determine range.");
        return null;
    }

    const minV = d3.min(values);
    const maxV = d3.max(values);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(values) || 0])
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

    return new IntervalValue(categoryAxisName, minV, maxV);
}

export async function simpleBarCompare(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const categoryName = data?.[0]?.category || (orientation === 'vertical' ? xField : yField);
    const measureName  = data?.[0]?.measure  || (orientation === 'vertical' ? yField : xField);

    const getId = (d) => {
        if (!d) return undefined;
        if (d[categoryName] !== undefined) return String(d[categoryName]);
        return undefined;
    };

    const finder = (selector) => (d) => String(getId(d)) === String(selector);

    let targetAValue;
    let targetBValue;

    if (isLast) {
        const targetAData = data.find(d => d.id === op.targetA);
        const targetBData = data.find(d => d.id === op.targetB);

        targetAValue = targetAData.target;
        targetBValue = targetBData.target;
    } else {
        targetAValue = op.targetA;
        targetBValue = op.targetB;
    }


    const leftBar  = g.selectAll('rect').filter(finder(targetAValue))
    const rightBar = g.selectAll('rect').filter(finder(targetBValue))

    if (leftBar.empty() || rightBar.empty()) {
        console.warn('simpleBarCompare: one or both targets not found', targetAValue, targetBValue);
        return new BoolValue('', false);
    }

    const valueAxisField = (orientation === 'vertical') ? yField : xField;
    const getVal = (d) => {
        if (!d) return NaN;
        if (op.field === 'value') return +d.value;
        if (d.measure && op.field === d.measure) return +d.value;
        if (measureName && op.field === measureName) return +(+d.value ?? +d[measureName]);
        if (op.field === valueAxisField) return +(+d.value ?? +d[valueAxisField]);
        if (op.field in (d || {})) return +d[op.field];
        return +d.value;
    };

    const lv = leftBar.datum()[measureName];
    const rv = rightBar.datum()[measureName];

    const cmp = {
        'gt': (a,b) => a > b, '>': (a,b) => a > b,
        'gte': (a,b) => a >= b, '>=': (a,b) => a >= b,
        'lt': (a,b) => a < b, '<': (a,b) => a < b,
        'lte': (a,b) => a <= b, '<=': (a,b) => a <= b,
        'eq': (a,b) => a === b, '==': (a,b) => a === b
    };
    const ok = cmp[op.operator] ? cmp[op.operator](lv, rv) : false;

    const leftColor = '#ffb74d', rightColor = '#64b5f6';

    await Promise.all([
        leftBar.transition().duration(600).attr('fill', leftColor).attr('stroke', 'black').end(),
        rightBar.transition().duration(600).attr('fill', rightColor).attr('stroke', 'black').end()
    ]);

    const addCompareAnnotation = (bar, value, color) => {
        const node = bar.node(), bbox = node.getBBox();
        const lineY = margins.top + bbox.y;
        svg.append('line').attr('class', 'annotation')
            .attr('x1', margins.left).attr('y1', lineY)
            .attr('x2', margins.left + bbox.x + bbox.width / 2).attr('y2', lineY)
            .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
        svg.append('text').attr('class', 'annotation')
            .attr('x', margins.left + bbox.x + bbox.width / 2)
            .attr('y', margins.top + bbox.y - 5)
            .attr('text-anchor', 'middle').attr('fill', color)
            .attr('font-weight', 'bold').text(value);
    };

    addCompareAnnotation(leftBar, lv, leftColor);
    addCompareAnnotation(rightBar, rv, rightColor);

    const symbol = { 'gt': '>', '>': '>', 'gte': '≥', '>=': '≥', 'lt': '<', '<': '<', 'lte': '≤', '<=': '≤', 'eq': '=', '==': '=' }[op.operator];
    svg.append('text').attr('class', 'compare-label')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', ok ? 'green' : 'red').text(`${targetAValue} ${symbol} ${targetBValue} → ${ok}`);

    return new BoolValue('', !!ok);
}

export async function simpleBarSort(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return data;

    const orderAsc = (op?.order ?? 'asc') === 'asc';

    const categoryName = data[0]?.category || (orientation === 'vertical' ? xField : yField);
    const measureName  = data[0]?.measure  || (orientation === 'vertical' ? yField : xField);

    const getCategoryId = (d) => {
        if (!d) return '';
        if (d.target !== undefined) return String(d.target);
        if (categoryName && d[categoryName] !== undefined) return String(d[categoryName]);
        if (xField && d[xField] !== undefined) return String(d[xField]);
        return '';
    };
    const getNumeric = (d) => {
        if (!d) return NaN;
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const isLabelField =
        op.field === 'label' ||
        op.field === 'target' ||
        (categoryName && op.field === categoryName) ||
        (orientation === 'vertical' ? op.field === xField : op.field === yField);

    const comparator = (a, b) => {
        if (isLabelField) {
            const sa = getCategoryId(a);
            const sb = getCategoryId(b);
            const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
            return orderAsc ? cmp : -cmp;
        } else {
            const va = getNumeric(a);
            const vb = getNumeric(b);
            const cmp = (va - vb);
            return orderAsc ? cmp : -cmp;
        }
    };

    const sortedData = [...data].sort(comparator);

    if (orientation === 'vertical') {
        const xScale = d3.scaleBand()
            .domain(sortedData.map(d => getCategoryId(d)))
            .range([0, plot.w])
            .padding(0.2);

        const bars = g.selectAll("rect");
        const transitions = [];

        transitions.push(
            bars.transition().duration(1000)
                .attr("x", d => xScale(getCategoryId(d)))
                .attr("width", xScale.bandwidth())
                .end()
        );

        transitions.push(
            g.select(".x-axis").transition().duration(1000)
                .call(d3.axisBottom(xScale))
                .end()
        );

        await Promise.all(transitions);
    } else {
        const yScale = d3.scaleBand()
            .domain(sortedData.map(d => getCategoryId(d)))
            .range([0, plot.h])
            .padding(0.2);

        const bars = g.selectAll("rect");
        const transitions = [];

        transitions.push(
            bars.transition().duration(1000)
                .attr("y", d => yScale(getCategoryId(d)))
                .attr("height", yScale.bandwidth())
                .end()
        );

        transitions.push(
            g.select(".y-axis").transition().duration(1000)
                .call(d3.axisLeft(yScale))
                .end()
        );

        await Promise.all(transitions);
    }

    const orderText = orderAsc ? 'Ascending' : 'Descending';
    const label = isLabelField ? (categoryName || 'label') : (measureName || 'value');
    const labelText = `Sorted by ${label} (${orderText})`;
    svg.append("text")
        .attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", "#6f42c1").text(labelText);

    return sortedData;
}

export async function simpleBarSum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const totalSum = d3.sum(data, d => d.value);

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

    bars.each(function(d, i, nodes) {
        const value = d[data[i].measure];
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

    const categoryAxisName = orientation === 'vertical' ? xField : yField;
    const measureAxisName = orientation === 'vertical' ? yField : xField;

    return new DatumValue(categoryAxisName, measureAxisName, 'Sum', null, totalSum, null);
}

export async function simpleBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn("simpleBarAverage: empty data");
        return data;
    }

    const numeric = data.map(d => +d.value).filter(v => !Number.isNaN(v));
    if (!numeric.length) {
        console.warn("simpleBarAverage: no numeric values in data");
        return data;
    }
    const avg = d3.mean(numeric);

    const fmt = (v) => Number.isInteger(v) ? String(v) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

    if (orientation === 'vertical') {
        const yMax = d3.max(numeric) || 0;
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = margins.top + yScale(avg);

        const line = svg.append("line").attr("class", "annotation avg-line")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        await line.transition().duration(800).attr("x2", margins.left + plot.w).end();

        svg.append("text").attr("class", "annotation avg-label")
            .attr("x", margins.left + plot.w + 6)
            .attr("y", yPos)
            .attr("dominant-baseline", "middle")
            .attr("fill", "red").attr("font-weight", "bold")
            .text(`Avg: ${fmt(avg)}`)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    } else {
        const xMax = d3.max(numeric) || 0;
        const xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        const xPos = margins.left + xScale(avg);

        const line = svg.append("line").attr("class", "annotation avg-line")
            .attr("x1", xPos).attr("x2", xPos)
            .attr("y1", margins.top).attr("y2", margins.top)
            .attr("stroke", "red").attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        await line.transition().duration(800).attr("y2", margins.top + plot.h).end();

        svg.append("text").attr("class", "annotation avg-label")
            .attr("x", xPos)
            .attr("y", margins.top - 8)
            .attr("text-anchor", "middle")
            .attr("fill", "red").attr("font-weight", "bold")
            .text(`Avg: ${fmt(avg)}`)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    }

    const categoryAxisName = orientation === 'vertical' ? xField : yField;
    const measureAxisName = orientation === 'vertical' ? yField : xField;

    return new DatumValue(categoryAxisName, measureAxisName, 'Average', null, avg, null);
}

export async function simpleBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const datumA = data.find(d => d.target === op.targetA);
    const datumB = data.find(d => d.target === op.targetB);

    if (!datumA || !datumB) {
        console.warn("Diff: One or both targets not found.", op);
        return null;
    }

    const valueA = datumA.value;
    const valueB = datumB.value;
    const diff = Math.abs(valueA - valueB);
    const shorterValue = Math.min(valueA, valueB);

    const barA_sel = g.selectAll("rect").filter(d => (d.target || d[xField]) === op.targetA);
    const barB_sel = g.selectAll("rect").filter(d => (d.target || d[xField]) === op.targetB);
    
    const tallerBar = valueA >= valueB ? barA_sel : barB_sel;
    const shorterBar = valueA < valueB ? barA_sel : barB_sel;

    const otherBars = g.selectAll("rect").filter(d => (d.target || d[xField]) !== op.targetA && (d.target || d[xField]) !== op.targetB);
    
    const colorTaller = "#ffeb3b"; // 더 큰 막대: 노란색
    const colorShorter = "#2196f3"; // 더 작은 막대: 파란색
    const colorSubtract = "#f44336"; // 차감 효과: 빨간색
    
    const yMax = d3.max(data, d => d.value);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    await Promise.all([
        otherBars.transition().duration(500).attr("opacity", 0.2).end(),
        tallerBar.transition().duration(500).attr("fill", colorTaller).end(),
        shorterBar.transition().duration(500).attr("fill", colorShorter).end()
    ]).catch(err => console.log("Animation interrupted"));
    await delay(500);

    shorterBar.raise();
    await shorterBar.transition().duration(800).attr("x", tallerBar.attr("x")).end();
    await delay(500);

    const subtractionRect = g.append("rect")
        .attr("x", tallerBar.attr("x"))
        .attr("y", yScale(shorterValue))
        .attr("width", tallerBar.attr("width"))
        .attr("height", plot.h - yScale(shorterValue))
        .attr("fill", colorSubtract)
        .attr("opacity", 0);
    
    await subtractionRect.transition().duration(400).attr("opacity", 0.7).end();
    await delay(600);
    
    await Promise.all([
        subtractionRect.transition().duration(600).attr("opacity", 0).remove().end(),
        shorterBar.transition().duration(600).attr("opacity", 0).remove().end(),
        tallerBar.transition().duration(800)
            .attr("y", yScale(diff))
            .attr("height", plot.h - yScale(diff))
            .end()
    ]).catch(err => console.log("Animation interrupted"));
    
    const finalX = +tallerBar.attr("x") + (+tallerBar.attr("width") / 2);
    const finalY = +tallerBar.attr("y");

    g.append("text").attr("class", "annotation")
        .attr("x", finalX)
        .attr("y", finalY - 8)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .attr("font-weight", "bold")
        .attr("stroke", "white")
        .attr("stroke-width", 3.5)
        .attr("paint-order", "stroke")
        .text(`Difference: ${fmtNum(diff)}`)
        .attr("opacity", 0)
        .transition().delay(200).duration(400).attr("opacity", 1);

    const categoryAxisName = orientation === 'vertical' ? xField : yField;
    const measureAxisName = orientation === 'vertical' ? yField : xField;

    return new DatumValue(categoryAxisName, measureAxisName, `Diff(${op.targetA}, ${op.targetB})`, null, diff, null);
}

export async function simpleBarNth(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn('simpleBarNth: empty data');
        return null;
    }

    const bars = g.selectAll('rect');
    const nodeList = bars.nodes();
    const total = nodeList.length;

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();

    if (!Number.isFinite(n) || n <= 0 || n > total) {
        console.warn(`simpleBarNth: n is out of bounds. n=${n}, total=${total}`);
        return null;
    }

    const items = nodeList.map((node) => {
        const sel = d3.select(node);
        const x = +node.getAttribute('x') || 0;
        const y = +node.getAttribute('y') || 0;
        const id = sel.attr('data-id');
        const valueAttr = sel.attr('data-value');
        const value = valueAttr != null ? +valueAttr : NaN;
        return { node, x, y, id, value };
    });

    let ordered;
    if (orientation === 'vertical') {
        ordered = items.slice().sort((a, b) => a.x - b.x);
    } else {
        ordered = items.slice().sort((a, b) => a.y - b.y);
    }

    const targetIndex = from === 'right' ? total - n : n - 1;
    const pickedItem = ordered[targetIndex];
    if (!pickedItem) {
        console.warn(`simpleBarNth: Could not find the ${n}-th item from the ${from}.`);
        return null;
    }

    const pickedId = pickedItem.id;
    const hlColor = '#20c997';
    const baseColor = '#69b3a2';

    const targetBar = bars.filter(function() { return d3.select(this).attr('data-id') === pickedId; });
    const otherBars = bars.filter(function() { return d3.select(this).attr('data-id') !== pickedId; });

    await Promise.all([
        targetBar.transition().duration(600).attr('fill', hlColor).end(),
        otherBars.transition().duration(600).attr('fill', baseColor).attr('opacity', 0.3).end()
    ]);

    const val = targetBar.attr("data-value");
    const { x, y } = getCenter(targetBar.node(), orientation, margins);
    svg.append("text").attr("class", "annotation")
        .attr("x", x).attr("y", y).attr("text-anchor", "middle")
        .attr("font-size", 12).attr("fill", hlColor)
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(val);

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth: ${from} ${n}`);

    const targetDatum = data.find(d => d.target === pickedId);

    return targetDatum || null;
}

export async function simpleBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn('simpleBarCount: empty data');
        return data;
    }

    const bars = g.selectAll('rect');
    if (bars.empty()) {
        console.warn('simpleBarCount: no bars on chart');
        return data;
    }

    const baseColor = '#69b3a2';
    const hlColor = '#20c997';

    await bars.transition().duration(150).attr('fill', baseColor).attr('opacity', 0.3).end();

    const nodes = bars.nodes();
    const items = nodes.map((node) => {
        const sel = d3.select(node);
        const x = +node.getAttribute('x') || 0;
        const y = +node.getAttribute('y') || 0;
        const w = +node.getAttribute('width') || 0;
        const h = +node.getAttribute('height') || 0;
        const valueAttr = sel.attr('data-value');
        const value = valueAttr != null ? +valueAttr : NaN;
        return { node, x, y, w, h, value };
    });

    let ordered;
    if (orientation === 'vertical') {
        ordered = items.slice().sort((a, b) => a.x - b.x);
    } else {
        ordered = items.slice().sort((a, b) => a.value - b.value);
    }
    
    const totalCount = ordered.length;

    for (let i = 0; i < totalCount; i++) {
        const { node } = ordered[i];
        const rect = d3.select(node);

        await rect.transition().duration(150)
            .attr('fill', hlColor)
            .attr('opacity', 1)
            .end();

        const { x, y } = getCenter(node, orientation, margins);
        svg.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(String(i + 1))
            .attr('opacity', 0)
            .transition().duration(125).attr('opacity', 1);

        await delay(60);
    }

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount}`)
        .attr('opacity', 0)
        .transition().duration(200).attr('opacity', 1);

    const categoryAxisName = orientation === 'vertical' ? xField : yField;
    const measureAxisName = orientation === 'vertical' ? yField : xField;

    return new DatumValue(categoryAxisName, measureAxisName, 'Count', null, totalCount, null);
}