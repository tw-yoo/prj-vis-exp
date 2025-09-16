import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";
import {
    retrieveValue,
    filter as dataFilter,
    findExtremum as dataFindExtremum,
    sort as dataSort,
    sum as dataSum,
    average as dataAverage,
    diff as dataDiff,
    nth as dataNth,
    compare as dataCompare,
    compareBool as dataCompareBool,
    count as dataCount
} from "../../operationFunctions.js";

function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }

function selectAllMarks(g) {
    return g.selectAll('rect');
}

function getMarkValue(node) {
    if (!node) return null;
    const sel = d3.select(node);
    const vAttr = sel.attr('data-value');
    if (vAttr != null && vAttr !== '') {
        const n = +vAttr; return Number.isNaN(n) ? null : n;
    }
    const d = sel.datum ? sel.datum() : null;
    if (d && typeof d === 'object') {
        if (d.value != null && Number.isFinite(+d.value)) return +d.value;
        if (d.y != null && Number.isFinite(+d.y)) return +d.y;
        if (d.x != null && Number.isFinite(+d.x)) return +d.x;
    }
    return null;
}

function getBarKeyFromDatum(d) {
    if (!d) return '';
    return String(d.target ?? d.id ?? d.key ?? d.label ?? '');
}
function getBarKeyFromNode(node) {
    const sel = d3.select(node);
    return String(sel.attr('data-id') ?? sel.attr('data-key') ?? sel.attr('data-target') ?? '');
}
function selectBarByKey(g, key) {
    const want = String(key);
    return g.selectAll('rect').filter(function () { return getBarKeyFromNode(this) === want; });
}
function selectBarsExcept(g, keys) {
    const set = new Set((keys || []).map(k => String(k)));
    return g.selectAll('rect').filter(function () { return !set.has(getBarKeyFromNode(this)); });
}

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
    const { svg, g, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const hlColor = "#ff6961";
    const baseColor = "#69b3a2";

    const selected = retrieveValue(data, op, isLast) || [];
    const selectedTargets = selected.map(d => getBarKeyFromDatum(d));

    const bars = selectAllMarks(g);
    const target = bars.filter(function () {
        return selectedTargets.includes(getBarKeyFromNode(this));
    });
    // [수정] otherBars 변수는 더 이상 사용되지 않습니다.
    // const otherBars = selectBarsExcept(g, selectedTargets); 

    if (target.empty()) {
        console.warn("RetrieveValue: target bar(s) not found for key(s):", op?.target);
        bars.transition().duration(300).attr("fill", baseColor).attr("opacity", 1);
        return selected;
    }

    // [수정] otherBars를 흐리게 만드는 코드를 제거하고, target에 대한 애니메이션만 남깁니다.
    await target.transition().duration(600).attr("fill", hlColor).attr("opacity", 1).end();

    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    } else {
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
    }

    const targetBars = selected;
    if (orientation === 'vertical') {
        const lines = g.selectAll('.retrieve-line').data(targetBars, d => d.id || d.target);
        lines.enter()
            .append('line')
            .attr('class', 'retrieve-line')
            .attr('x1', d => xScale(d.target) + xScale.bandwidth() / 2)
            .attr('x2', 0)
            .attr('y1', d => yScale(d.value))
            .attr('y2', d => yScale(d.value))
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        lines.exit().remove();
    } else {
        const lines = g.selectAll('.retrieve-line').data(targetBars, d => d.id || d.target);
        lines.enter()
            .append('line')
            .attr('class', 'retrieve-line')
            .attr('y1', d => yScale(d.target) + yScale.bandwidth() / 2)
            .attr('y2', 0)
            .attr('x1', d => xScale(d.value))
            .attr('x2', d => xScale(d.value))
            .attr('stroke', 'red')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        lines.exit().remove();
    }

    target.each(function () {
        const bar = this;
        const val = getMarkValue(bar);
        const { x, y } = getCenter(bar, orientation, margins);
        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y).attr("text-anchor", "middle")
            .attr("font-size", 12).attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(String(val))
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    });

    return selected;
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
        const allowed = new Set(sortOrder.map(String));
        filteredData = data.filter(d => allowed.has(String(d.target)));
        labelText = `Filter: ${xField} in [${sortOrder.join(', ')}]`;
    } else {
        filteredData = dataFilter(data, op, xField, yField, isLast);

        // Build an informative label based on the operator
        if (op.operator === 'in' || op.operator === 'not-in') {
            const arr = Array.isArray(op.value) ? op.value : [op.value];
            labelText = `Filter: ${op.field} ${op.operator} [${arr.join(', ')}]`;
        } else if (op.operator === 'contains') {
            const arr = Array.isArray(op.value) ? op.value : [op.value];
            labelText = arr.length === 1
                ? `Filter: ${op.field} contains "${arr[0]}"`
                : `Filter: ${op.field} contains any of [${arr.join(', ')}]`;
        } else {
            labelText = `Filter: ${op.field} ${op.operator} ${op.value}`;
            const numericOps = new Set(['>','>=','<','<=','==','eq']);
            const key = toNumber(op.value);
            if (numericOps.has(op.operator) && Number.isFinite(key)) {
                drawThreshold(key);
            }
        }
    }

    if (!filteredData || filteredData.length === 0) {
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

    const bars = selectAllMarks(g).data(plainRows, d => String(d[categoryKey]));

    await Promise.all([
        bars.exit().transition().duration(800)
            .attr("opacity", 0).attr("height", 0).attr("y", plot.h).remove().end(),
        bars.transition().duration(800)
            .attr("x", d => xScaleFiltered(d[categoryKey]))
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
    const { svg, g, xField, yField, margins, orientation, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn("simpleBarFindExtremum: No data to process.");
        return [];
    }

    const selected = dataFindExtremum(data, op, xField, yField, isLast);
    if (!selected) {
        console.warn("simpleBarFindExtremum: Could not compute extremum.");
        return [];
    }

    const hlColor = "#a65dfb";
    const selId = String(selected.target);
    const selVal = +(
        selected.value !== undefined ? selected.value :
        (selected[yField] !== undefined ? selected[yField] : selected[xField])
    );

    const bars = selectAllMarks(g);
    const targetBar = selectBarByKey(g, selId);

    if (targetBar.empty()) {
        console.warn("simpleBarFindExtremum: target bar not found for id:", selId);
        return [selected];
    }

    await targetBar.transition().duration(600).attr("fill", hlColor).end();

    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand().domain(data.map(d => String(d.target))).range([0, plot.w]).padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    } else {
        yScale = d3.scaleBand().domain(data.map(d => String(d.target))).range([0, plot.h]).padding(0.2);
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
    }

    if (Number.isFinite(selVal)) {
        if (orientation === 'vertical') {
            const yPos = margins.top + yScale(selVal);
            const line = svg.append("line").attr("class", "annotation")
                .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos);
            await line.transition().duration(400).attr("x2", margins.left + plot.w).end();
        } else {
            const xPos = margins.left + xScale(selVal);
            const line = svg.append("line").attr("class", "annotation")
                .attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4")
                .attr("x1", xPos).attr("y1", margins.top)
                .attr("x2", xPos).attr("y2", margins.top);
            await line.transition().duration(400).attr("y2", margins.top + plot.h).end();
        }
    }

    const node = targetBar.node();
    if (node) {
        const { x, y } = getCenter(node, orientation, margins);
        const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${selVal}`;
        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(labelText)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1);
    }

    return [selected];
}

export async function simpleBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = "#0d6efd";
    const valueField = op.field || (orientation === 'vertical' ? yField : xField);

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

    const findBars = (val) => selectAllMarks(g).filter(d => {
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
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return null;

    const winner = dataCompare(data, op, xField, yField, isLast);

    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const bars = selectAllMarks(g);
    const barA = selectBarByKey(g, keyA);
    const barB = selectBarByKey(g, keyB);
    const others = selectBarsExcept(g, [keyA, keyB]);

    const colorWin = "#8a2be2";
    const colorLose = "#c0c0c0";
    const colorNeutral = "#69b3a2";

    if (barA.empty() || barB.empty()) {
        console.warn("simpleBarCompare: target bars not found for", keyA, keyB);
        return winner;
    }

    if (winner) {
        const winId = String(winner.target);
        const winBar = winId === keyA ? barA : barB;
        const loseBar = winId === keyA ? barB : barA;

        await Promise.all([
            others.transition().duration(500).attr("opacity", 0.2).end(),
            winBar.transition().duration(600).attr("fill", colorWin).attr("opacity", 1).end(),
            loseBar.transition().duration(600).attr("fill", colorLose).attr("opacity", 0.6).end()
        ]).catch(() => {});

        // 가이드 라인 (승자 값 위치)
        const winVal = +winner.value;
        if (Number.isFinite(winVal)) {
            if (orientation === "vertical") {
                const yMax = d3.max(data, d => +d.value) || 0;
                const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
                const yPos = margins.top + yScale(winVal);
                const line = svg.append("line").attr("class", "annotation")
                    .attr("x1", margins.left).attr("y1", yPos)
                    .attr("x2", margins.left).attr("y2", yPos)
                    .attr("stroke", colorWin).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
                await line.transition().duration(400).attr("x2", margins.left + plot.w).end();
            } else {
                const xMax = d3.max(data, d => +d.value) || 0;
                const xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
                const xPos = margins.left + xScale(winVal);
                const line = svg.append("line").attr("class", "annotation")
                    .attr("x1", xPos).attr("y1", margins.top)
                    .attr("x2", xPos).attr("y2", margins.top)
                    .attr("stroke", colorWin).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
                await line.transition().duration(400).attr("y2", margins.top + plot.h).end();
            }
        }

        const node = (winId === keyA ? barA : barB).node();
        if (node) {
            const { x, y } = getCenter(node, orientation, margins);
            svg.append("text").attr("class", "annotation")
                .attr("x", x).attr("y", y)
                .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
                .attr("fill", colorWin)
                .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
                .text(`Winner: ${winId} (${winner.value})`)
                .attr("opacity", 0)
                .transition().duration(400).attr("opacity", 1);
        }
    } else {
        await Promise.all([
            others.transition().duration(500).attr("opacity", 0.2).end(),
            barA.transition().duration(600).attr("fill", colorNeutral).attr("opacity", 1).end(),
            barB.transition().duration(600).attr("fill", colorNeutral).attr("opacity", 1).end()
        ]).catch(() => {});

        svg.append("text").attr("class", "annotation")
            .attr("x", margins.left)
            .attr("y", margins.top - 10)
            .attr("font-size", 14).attr("font-weight", "bold")
            .attr("fill", "#333")
            .text("Tie or not comparable");
    }

    const opLabel = op?.which ? `which=${op.which}` : (op?.operator ? `op=${op.operator}` : "compare");
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 28)
        .attr("font-size", 12).attr("fill", "#666")
        .text(`Compare: ${keyA} vs ${keyB} (${opLabel})`);

    return winner;
}

export async function simpleBarCompareBool(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return null;

    const verdict = dataCompareBool(data, op, xField, yField, isLast);

    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const bars = selectAllMarks(g);
    const barA = selectBarByKey(g, keyA);
    const barB = selectBarByKey(g, keyB);
    const others = selectBarsExcept(g, [keyA, keyB]);

    if (barA.empty() || barB.empty()) {
        console.warn("simpleBarCompareBool: target bars not found for", keyA, keyB);
        return verdict;
    }

    const trueColor  = "#2ca02c";
    const falseColor = "#d62728";
    const neutral    = "#c0c0c0";

    const isTrue = verdict ? !!verdict.bool : null;

    if (isTrue === null) {
        await Promise.all([
            others.transition().duration(500).attr("opacity", 0.2).end(),
            barA.transition().duration(600).attr("fill", neutral).end(),
            barB.transition().duration(600).attr("fill", neutral).end()
        ]).catch(() => {});
    } else if (isTrue) {
        await Promise.all([
            others.transition().duration(500).attr("opacity", 0.2).end(),
            barA.transition().duration(600).attr("fill", trueColor).end(),
            barB.transition().duration(600).attr("fill", trueColor).end()
        ]).catch(() => {});
    } else {
        await Promise.all([
            others.transition().duration(500).attr("opacity", 0.2).end(),
            barA.transition().duration(600).attr("fill", falseColor).end(),
            barB.transition().duration(600).attr("fill", falseColor).end()
        ]).catch(() => {});
    }

    const opSymbol = op?.operator || (op?.which ? (op.which === "max" ? ">" : "<") : ">");
    const header = `${keyA} ${opSymbol} ${keyB} ?`;
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 28)
        .attr("font-size", 12).attr("fill", "#666")
        .text(header);

    const answer = (isTrue === null) ? "unknown" : String(isTrue);
    svg.append("text").attr("class", "annotation")
        .attr("x", margins.left)
        .attr("y", margins.top - 10)
        .attr("font-size", 14).attr("font-weight", "bold")
        .attr("fill", isTrue ? trueColor : (isTrue === false ? falseColor : "#333"))
        .text(answer);

    return verdict;
}

export async function simpleBarSort(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) return data;

    const orderAsc = (op?.order ?? 'asc') === 'asc';

    const categoryName = data[0]?.category || (orientation === 'vertical' ? xField : yField);
    const measureName  = data[0]?.measure  || (orientation === 'vertical' ? yField : xField);

    const getCategoryIdFromData = (d) => {
        if (!d) return '';
        if (d.target !== undefined) return String(d.target);
        if (categoryName && d[categoryName] !== undefined) return String(d[categoryName]);
        if (xField && d[xField] !== undefined) return String(d[xField]);
        return '';
    };

    const sortedData = dataSort(data, op, xField, yField, isLast);
    const sortedIds = sortedData.map(getCategoryIdFromData);

    if (orientation === 'vertical') {
        const xScale = d3.scaleBand().domain(sortedIds).range([0, plot.w]).padding(0.2);

        const bars = selectAllMarks(g);
        const transitions = [];

        transitions.push(
            bars.transition().duration(1000)
                .attr('x', function() { return xScale(getBarKeyFromNode(this)); })
                .attr('width', xScale.bandwidth())
                .end()
        );

        transitions.push(
            g.select('.x-axis').transition().duration(1000)
                .call(d3.axisBottom(xScale))
                .end()
        );

        await Promise.all(transitions);
    } else {
        const yScale = d3.scaleBand().domain(sortedIds).range([0, plot.h]).padding(0.2);

        const bars = selectAllMarks(g);
        const transitions = [];

        transitions.push(
            bars.transition().duration(1000)
                .attr('y', function() { return yScale(getBarKeyFromNode(this)); })
                .attr('height', yScale.bandwidth())
                .end()
        );

        transitions.push(
            g.select('.y-axis').transition().duration(1000)
                .call(d3.axisLeft(yScale))
                .end()
        );

        await Promise.all(transitions);
    }

    const orderText = orderAsc ? 'Ascending' : 'Descending';
    const isLabelField = (
        op.field === 'label' || op.field === 'target' || (categoryName && op.field === categoryName) || (orientation === 'vertical' ? op.field === xField : op.field === yField)
    );
    const label = isLabelField ? (categoryName || 'label') : (measureName || 'value');
    const labelText = `Sorted by ${label} (${orderText})`;
    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14).attr('font-weight', 'bold')
        .attr('fill', '#6f42c1').text(labelText);

    return sortedData;
}

export async function simpleBarSum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataSum(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarSum: unable to compute sum');
        return null;
    }
    const totalSum = +result.value;

    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);

    const yAxisTransition = svg.select('.y-axis').transition().duration(1000)
        .call(d3.axisLeft(newYScale))
        .end();

    const bars = selectAllMarks(g);
    const barWidth = +bars.attr('width');
    const targetX = plot.w / 2 - barWidth / 2;ㅁ

    let runningTotal = 0;
    const stackPromises = [];

    bars.each(function() {
        const rect = d3.select(this);
        const raw = getMarkValue(this);
        const value = Number.isFinite(+raw) ? +raw : 0;
        const t = rect.transition().duration(1200)
            .attr('x', targetX)
            .attr('y', newYScale(runningTotal + value))
            .attr('height', plot.h - newYScale(value))
            .end();
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    await delay(200);

    const finalY = newYScale(totalSum);

    svg.append('line').attr('class', 'annotation value-line')
        .attr('x1', margins.left)
        .attr('y1', margins.top + finalY)
        .attr('x2', margins.left + plot.w)
        .attr('y2', margins.top + finalY)
        .attr('stroke', 'red')
        .attr('stroke-width', 2);

    svg.append('text').attr('class', 'annotation value-tag')
        .attr('x', margins.left + plot.w - 10)
        .attr('y', margins.top + finalY - 10)
        .attr('fill', 'red')
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'end')
        .text(`Sum: ${totalSum.toLocaleString()}`);

    return result;
}

export async function simpleBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataAverage(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarAverage: unable to compute average');
        return null;
    }

    const avg = +result.value;
    const numeric = data.map(d => +d.value).filter(v => !Number.isNaN(v));

    if (orientation === 'vertical') {
        const yMax = d3.max(numeric) || 0;
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = margins.top + yScale(avg);

        const line = svg.append('line').attr('class', 'annotation avg-line')
            .attr('x1', margins.left).attr('x2', margins.left)
            .attr('y1', yPos).attr('y2', yPos)
            .attr('stroke', 'red').attr('stroke-width', 2).attr('stroke-dasharray', '5 5');
        await line.transition().duration(800).attr('x2', margins.left + plot.w).end();

        svg.append('text').attr('class', 'annotation avg-label')
            .attr('x', margins.left + plot.w + 6)
            .attr('y', yPos)
            .attr('dominant-baseline', 'middle')
            .attr('fill', 'red').attr('font-weight', 'bold')
            .text(`Avg: ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
            .attr('opacity', 0)
            .transition().duration(400).attr('opacity', 1);
    } else {
        const xMax = d3.max(numeric) || 0;
        const xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        const xPos = margins.left + xScale(avg);

        const line = svg.append('line').attr('class', 'annotation avg-line')
            .attr('x1', xPos).attr('x2', xPos)
            .attr('y1', margins.top).attr('y2', margins.top)
            .attr('stroke', 'red').attr('stroke-width', 2).attr('stroke-dasharray', '5 5');
        await line.transition().duration(800).attr('y2', margins.top + plot.h).end();

        svg.append('text').attr('class', 'annotation avg-label')
            .attr('x', xPos)
            .attr('y', margins.top - 8)
            .attr('text-anchor', 'middle')
            .attr('fill', 'red').attr('font-weight', 'bold')
            .text(`Avg: ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
            .attr('opacity', 0)
            .transition().duration(400).attr('opacity', 1);
    }

    return result;
}

export async function simpleBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataDiff(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarDiff: unable to compute diff', op);
        return null;
    }

    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const barA_sel = selectBarByKey(g, keyA);
    const barB_sel = selectBarByKey(g, keyB);

    if (barA_sel.empty() || barB_sel.empty()) {
        console.warn('simpleBarDiff: One or both targets not found.');
        return result;
    }

    const valueA = Number(getMarkValue(barA_sel.node()) ?? NaN);
    const valueB = Number(getMarkValue(barB_sel.node()) ?? NaN);
    const diffValAbs = Math.abs(+result.value);

    const otherBars = selectBarsExcept(g, [keyA, keyB]);

    const colorTaller = '#ffeb3b';
    const colorShorter = '#2196f3';
    const colorSubtract = '#f44336';

    const yMax = d3.max(data, d => +d.value) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const tallerBar = valueA >= valueB ? barA_sel : barB_sel;
    const shorterBar = valueA < valueB ? barA_sel : barB_sel;

    await Promise.all([
        otherBars.transition().duration(500).attr('opacity', 0.2).end(),
        tallerBar.transition().duration(500).attr('fill', colorTaller).end(),
        shorterBar.transition().duration(500).attr('fill', colorShorter).end()
    ]).catch(() => {});
    await delay(500);

    shorterBar.raise();
    await shorterBar.transition().duration(800).attr('x', tallerBar.attr('x')).end();
    await delay(500);

    const shorterValue = Math.min(valueA, valueB);
    const subtractionRect = g.append('rect')
        .attr('x', tallerBar.attr('x'))
        .attr('y', yScale(shorterValue))
        .attr('width', tallerBar.attr('width'))
        .attr('height', plot.h - yScale(shorterValue))
        .attr('fill', colorSubtract)
        .attr('opacity', 0);

    await subtractionRect.transition().duration(400).attr('opacity', 0.7).end();
    await delay(600);

    await Promise.all([
        subtractionRect.transition().duration(600).attr('opacity', 0).remove().end(),
        shorterBar.transition().duration(600).attr('opacity', 0).remove().end(),
        tallerBar.transition().duration(800)
            .attr('y', yScale(diffValAbs))
            .attr('height', plot.h - yScale(diffValAbs))
            .end()
    ]).catch(() => {});

    const finalX = +tallerBar.attr('x') + (+tallerBar.attr('width') / 2);
    const finalY = +tallerBar.attr('y');

    g.append('text').attr('class', 'annotation')
        .attr('x', finalX)
        .attr('y', finalY - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#333')
        .attr('font-weight', 'bold')
        .attr('stroke', 'white')
        .attr('stroke-width', 3.5)
        .attr('paint-order', 'stroke')
        .text(`Difference: ${Math.abs(+result.value).toLocaleString()}`)
        .attr('opacity', 0)
        .transition().delay(200).duration(400).attr('opacity', 1);

    return result;
}

export async function simpleBarNth(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const selected = dataNth(data, op, xField, yField, isLast);
    if (!selected) {
        console.warn('simpleBarNth: selection failed');
        return null;
    }

    const pickedId = String(selected.target);
    const hlColor = '#20c997';
    const baseColor = '#69b3a2';

    const bars = selectAllMarks(g);
    const targetBar = selectBarByKey(g, pickedId);
    const otherBars = selectBarsExcept(g, [pickedId]);

    await Promise.all([
        targetBar.transition().duration(600).attr('fill', hlColor).end(),
        otherBars.transition().duration(600).attr('fill', baseColor).attr('opacity', 0.3).end()
    ]);

    const val = getMarkValue(targetBar.node());
    const { x, y } = getCenter(targetBar.node(), orientation, margins);
    svg.append('text').attr('class', 'annotation')
        .attr('x', x).attr('y', y).attr('text-anchor', 'middle')
        .attr('font-size', 12).attr('fill', hlColor)
        .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
        .text(String(val));

    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth: ${String(op?.from || 'left')} ${String(op?.n || 1)}`);

    return selected;
}

export async function simpleBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataCount(data, op, xField, yField, isLast);
    const totalCount = result ? Number(result.value) : 0;

    const bars = selectAllMarks(g);

    if (bars.empty()) {
        svg.append('text')
            .attr('class', 'annotation')
            .attr('x', margins.left)
            .attr('y', margins.top - 10)
            .attr('font-size', 14)
            .attr('font-weight', 'bold')
            .attr('fill', '#20c997')
            .text(`Count: ${totalCount}`);
        return result ? [result] : [];
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
        const valueRaw = getMarkValue(node);
        const value = Number.isFinite(+valueRaw) ? +valueRaw : NaN;
        return { node, x, y, w, h, value };
    });

    let ordered;
    if (orientation === 'vertical') {
        ordered = items.slice().sort((a, b) => a.x - b.x);
    } else {
        ordered = items.slice().sort((a, b) => a.value - b.value);
    }

    const n = Math.min(totalCount, ordered.length);

    for (let i = 0; i < n; i++) {
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

    return result ? [result] : [];
}