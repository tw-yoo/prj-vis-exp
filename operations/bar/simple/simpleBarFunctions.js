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
// 기존 import 아래에 추가
import { OP_COLORS } from "../../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";

// Helper functions (unchanged)
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function selectAllMarks(g) { return g.selectAll('rect'); }
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
function markKeepInput(arr) {
    if (!Array.isArray(arr)) return arr;
    if (!Object.prototype.hasOwnProperty.call(arr, '__keepInput')) {
        Object.defineProperty(arr, '__keepInput', {
            value: true,
            enumerable: false,
            configurable: true
        });
    }
    return arr;
}
export function getSvgAndSetup(chartId) {
    const svgNode = getPrimarySvgElement(chartId);
    const svg = svgNode ? d3.select(svgNode) : d3.select(null);
    const orientation = svgNode?.getAttribute("data-orientation") || "vertical";
    const xField = svgNode?.getAttribute("data-x-field");
    const yField = svgNode?.getAttribute("data-y-field");
    const margins = { left: +(svgNode?.getAttribute("data-m-left") || 0), top: +(svgNode?.getAttribute("data-m-top") || 0) };
    const plot = { w: +(svgNode?.getAttribute("data-plot-w") || 0), h: +(svgNode?.getAttribute("data-plot-h") || 0) };
    // Prefer the dedicated plot-area group; fall back to the first <g>
    let g = svg.select(".plot-area");
    if (g.empty()) g = svg.select("g");
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

// Helper to signal completion of an operation's animation
function signalOpDone(chartId, opName) {
  document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId, op: opName } }));
}


export async function simpleBarRetrieveValue(chartId, op, data, isLast = false) {
    const { svg, g, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const hlColor = OP_COLORS.RETRIEVE_VALUE;
    const selected = retrieveValue(data, op, isLast) || [];
    const bars = selectAllMarks(g);
    // For `last`, each datum carries a stable synthetic id (e.g., ops_0). Prefer that for DOM matching.
    const selectedKeys = selected.map(d => {
        return isLast ? String(d?.id ?? d?.target ?? getBarKeyFromDatum(d))
                      : getBarKeyFromDatum(d);
    });
    const target = bars.filter(function () {
        const nodeKey = getBarKeyFromNode(this); // checks data-id, data-key, data-target in order
        return selectedKeys.includes(String(nodeKey));
    });
    if (target.empty()) {
        console.warn("RetrieveValue: target bar(s) not found for key(s):", op?.target);
        // Removed: await bars.transition().duration(300).attr("fill", "#69b3a2").attr("opacity", 1);
        return markKeepInput(selected);
    }
    target.interrupt();
    target.attr("fill", hlColor).attr("opacity", 1);
    const animPromises = [];
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
        const targetBars = selected;
        const sel = svg.selectAll('.retrieve-line').data(targetBars, d => d.id || d.target);
        sel.exit().remove();
        const entered = sel.enter().append('line')
          .attr('class', 'retrieve-line annotation')
          // Start at the BAR CENTER (absolute coords)
          .attr('x1', d => margins.left + xScale(d.target) + xScale.bandwidth() / 2)
          .attr('x2', d => margins.left + xScale(d.target) + xScale.bandwidth() / 2)
          .attr('y1', d => margins.top + yScale(d.value))
          .attr('y2', d => margins.top + yScale(d.value))
          .attr('stroke', hlColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0);
        animPromises.push(
          entered.transition().duration(400)
            // Grow LEFT to the y-axis
            .attr('x2', margins.left)
            .attr('opacity', 1)
            .end()
        );
    } else {
        const lines = g.selectAll('.retrieve-line').data(targetBars, d => d.id || d.target);
        const entered = lines.enter().append('line')
          .attr('class', 'retrieve-line')
          // Start as a zero-length segment anchored at the target bar's center (y-axis)
          .attr('x1', d => xScale(d.value))
          .attr('x2', d => xScale(d.value))
          .attr('y1', d => yScale(d.target) + yScale.bandwidth() / 2)
          .attr('y2', d => yScale(d.target) + yScale.bandwidth() / 2)
          .attr('stroke', hlColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0);
        lines.exit().remove();
        animPromises.push(
          entered.transition().duration(400)
            // Reveal toward the TOP edge of the plot (g-local coordinates)
            .attr('y2', 0)
            .attr('opacity', 1)
            .end()
        );
    }
    target.each(function () {
        const bar = this;
        const val = getMarkValue(bar);
        const { x, y } = getCenter(bar, orientation, margins);
        const p = svg.append("text").attr("class", "annotation")
          .attr("x", x).attr("y", y)
          .attr("text-anchor", "middle")
          .attr("font-size", 12)
          .attr("fill", hlColor)
          .attr("stroke", "white")
          .attr("stroke-width", 3)
          .attr("paint-order", "stroke")
          .text(String(val))
          .attr("opacity", 0)
          .transition().duration(400).attr("opacity", 1)
          .end();
        animPromises.push(p);
    });
    await Promise.all(animPromises);
    await delay(30);
    document.dispatchEvent(new CustomEvent('ops:animation-complete', { detail: { chartId, op: 'retrieveValue' } }));
    if (isLast) {
      const first = selected[0];
      const lastResult = first ? [new DatumValue(first.category, first.measure, first.target, first.group, first.value, first.id)] : [];
      return markKeepInput(lastResult);
    }
    return markKeepInput(selected);
}

export async function simpleBarFilter(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const matchColor = OP_COLORS.FILTER_MATCH;
    let filteredData = [];
    let labelText = "";

    const toNumber = v => (v == null ? NaN : +v);
    const getDatumValue = d => {
        if (d && d.value !== undefined) return +d.value;
        if (yField && d && d[yField] !== undefined) return +d[yField];
        if (xField && d && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const effectiveOp = { ...op };
    if (data.length > 0) {
        const sample = data[0];
        if (op.field === sample.measure) {
            effectiveOp.field = 'value';
        } else if (op.field === sample.category) {
            effectiveOp.field = 'target';
        }
    }

    filteredData = dataFilter(data, effectiveOp, xField, yField, isLast);

    const sampleDatum = data[0] || {};
    const measureFieldName = sampleDatum.measure || yField;
    const categoryFieldName = sampleDatum.category || xField;
    const isMeasureField = effectiveOp.field === 'value' || effectiveOp.field === yField || effectiveOp.field === measureFieldName;
    const isCategoryField = effectiveOp.field === 'target' || effectiveOp.field === xField || effectiveOp.field === categoryFieldName;

    const drawMeasureThreshold = async (rawVal) => {
        const v = toNumber(rawVal);
        if (!Number.isFinite(v)) return;
        const maxV = d3.max(data, getDatumValue) || 0;
        const yScaleFull = d3.scaleLinear().domain([0, maxV]).nice().range([plot.h, 0]);
        const domain = yScaleFull.domain();
        const clamped = Math.max(domain[0], Math.min(domain[domain.length - 1], v));
        const yPos = yScaleFull(clamped);
        const line = svg.append("line").attr("class", "threshold-line")
            .attr("x1", margins.left).attr("y1", margins.top + yPos)
            .attr("x2", margins.left).attr("y2", margins.top + yPos)
            .attr("stroke", OP_COLORS.FILTER_THRESHOLD).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

        await line.transition().duration(800).attr("x2", margins.left + plot.w).end();

        svg.append("text").attr("class", "threshold-label")
            .attr("x", margins.left + plot.w - 5).attr("y", margins.top + yPos - 5)
            .attr("text-anchor", "end")
            .attr("fill", OP_COLORS.FILTER_THRESHOLD).attr("font-size", 12).attr("font-weight", "bold").text(v);
    };

    const drawCategoryThreshold = async (rawVal) => {
        const domainTargets = data.map(d => String(d.target));
        if (domainTargets.length === 0) return;

        const bandScale = (orientation === 'vertical')
            ? d3.scaleBand().domain(domainTargets).range([0, plot.w]).padding(0.2)
            : d3.scaleBand().domain(domainTargets).range([0, plot.h]).padding(0.2);

        const strVal = String(rawVal);
        const numericVal = Number(rawVal);
        let targetLabel = null;
        const numericDomain = domainTargets.map((label, idx) => ({
            label,
            idx,
            num: Number(label)
        }));

        if (domainTargets.includes(strVal)) {
            targetLabel = strVal;
        } else if (Number.isFinite(numericVal)) {
            const usable = numericDomain.filter(entry => Number.isFinite(entry.num));
            if (usable.length) {
                const sorted = usable.sort((a, b) => a.num - b.num);
                if (op.operator === '>' || op.operator === '>=') {
                    const found = sorted.find(entry => op.operator === '>' ? entry.num > numericVal : entry.num >= numericVal);
                    targetLabel = found ? found.label : sorted[sorted.length - 1].label;
                } else if (op.operator === '<' || op.operator === '<=') {
                    const found = sorted.find(entry => entry.num >= numericVal);
                    if (!found) {
                        targetLabel = sorted[sorted.length - 1].label;
                    } else {
                        const idx = domainTargets.indexOf(found.label);
                        const priorIdx = (op.operator === '<=') ? idx : idx - 1;
                        targetLabel = domainTargets[Math.max(0, priorIdx)];
                    }
                } else if (op.operator === '==' || op.operator === 'eq') {
                    const found = sorted.find(entry => entry.num === numericVal);
                    targetLabel = (found ? found.label : sorted[0].label);
                }
            }
        }

        if (!targetLabel) {
            targetLabel = domainTargets[0];
        }

        const bandPos = bandScale(targetLabel);
        if (bandPos == null) return;

        if (orientation === 'vertical') {
            const xPos = margins.left + bandPos + bandScale.bandwidth() / 2;
            const line = svg.append("line").attr("class", "threshold-line")
                .attr("x1", xPos).attr("y1", margins.top + plot.h)
                .attr("x2", xPos).attr("y2", margins.top + plot.h)
                .attr("stroke", OP_COLORS.FILTER_THRESHOLD).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

            await line.transition().duration(650).attr("y1", margins.top).end();
        } else {
            const yPos = margins.top + bandPos + bandScale.bandwidth() / 2;
            const line = svg.append("line").attr("class", "threshold-line")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos)
                .attr("stroke", OP_COLORS.FILTER_THRESHOLD).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

            await line.transition().duration(650).attr("x2", margins.left + plot.w).end();
        }
    };

    // if (op.operator === 'in' || op.operator === 'not-in') {
    //     const arr = Array.isArray(op.value) ? op.value : [op.value];
    //     labelText = `Filter: ${op.field} ${op.operator} [${arr.join(', ')}]`;
    // } else {
    //     labelText = `Filter: ${op.field} ${op.operator} ${op.value}`;
    // }

    const numericOps = new Set(['>','>=','<','<=','==','eq']);
    if (numericOps.has(op.operator) && Number.isFinite(toNumber(op.value)) && isMeasureField) {
        await drawMeasureThreshold(op.value);
        await delay(200);
    } else if (numericOps.has(op.operator) && isCategoryField) {
        await drawCategoryThreshold(op.value);
        await delay(150);
    }

    if (!filteredData || filteredData.length === 0) {
        console.warn("Filter resulted in empty data.");
        g.selectAll("rect").transition().duration(500).attr("opacity", 0).remove();
        if (isLast) {
            signalOpDone(chartId, 'filter');
            return [new DatumValue('filter', 'count', 'result', null, 0, 'last_filter')];
        }
        signalOpDone(chartId, 'filter');
        return [];
    }

    const categoryKey = filteredData[0]?.category || xField;
    const plainRows = filteredData.map(d => ({ [categoryKey]: d.target, value: d.value, group: d.group }));

    const bars = selectAllMarks(g).data(plainRows, d => String(d[categoryKey]));

    await Promise.all([
        bars.transition().duration(800).attr("fill", matchColor).end(),
        bars.exit().transition().duration(800).attr("opacity", 0).remove().end()
    ]);

    await delay(250);

    const xScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d.target)).range([0, plot.w]).padding(0.2);

    await Promise.all([
        bars.transition().duration(800)
            .attr("x", d => xScaleFiltered(d[categoryKey]))
            .attr("width", xScaleFiltered.bandwidth())
            .end(),
        g.select(".x-axis").transition().duration(800)
            .call(d3.axisBottom(xScaleFiltered))
            .end()
    ]);

    bars.each(function(d) {
        const bar = d3.select(this);
        const yMax = d3.max(data, datum => +datum.value) || 0;
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

        g.append("text").attr("class", "annotation value-tag")
            .attr("x", +bar.attr("x") + bar.attr("width") / 2)
            .attr("y", yScale(d.value) - 5)
            .attr("text-anchor", "middle")
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", "black")
            .text(d.value);
    });

    svg.append("text").attr("class", "filter-label")
        .attr("x", margins.left).attr("y", margins.top - 8)
        .attr("font-size", 12).attr("fill", matchColor).attr("font-weight", "bold")
        .text(labelText);

    await delay(30);
    signalOpDone(chartId, 'filter');
    return isLast
      ? [new DatumValue('filter', 'count', 'result', null, Array.isArray(filteredData) ? filteredData.length : 0, 'last_filter')]
      : filteredData;
}

export async function simpleBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, orientation, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'findExtremum');
        return [];
    }
    const selected = dataFindExtremum(data, op, xField, yField, isLast);
    if (!selected) {
        signalOpDone(chartId, 'findExtremum');
        return [];
    }
    const hlColor = OP_COLORS.EXTREMUM;
    const selId = String(selected.target);
    const selVal = +(selected.value !== undefined ? selected.value : (selected[yField] !== undefined ? selected[yField] : selected[xField]));
    const bars = selectAllMarks(g);
    const targetBar = selectBarByKey(g, selId);
    if (targetBar.empty()) {
        signalOpDone(chartId, 'findExtremum');
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
            const line = svg.append("line").attr("class", "annotation").attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4").attr("x1", margins.left).attr("y1", yPos).attr("x2", margins.left).attr("y2", yPos);
            await line.transition().duration(400).attr("x2", margins.left + plot.w).end();
        } else {
            const xPos = margins.left + xScale(selVal);
            const line = svg.append("line").attr("class", "annotation").attr("stroke", hlColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4").attr("x1", xPos).attr("y1", margins.top).attr("x2", xPos).attr("y2", margins.top);
            await line.transition().duration(400).attr("y2", margins.top + plot.h).end();
        }
    }
    const node = targetBar.node();
    const anim = [];
    if (node) {
        const { x, y } = getCenter(node, orientation, margins);
        const labelText = `${op?.which === 'min' ? 'Min' : 'Max'}: ${selVal}`;
        const tp = svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle")
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", hlColor)
            .attr("stroke", "white").attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(labelText)
            .attr("opacity", 0)
            .transition().duration(400).attr("opacity", 1)
            .end();
        anim.push(tp);
    }
    await Promise.all(anim);
    await delay(30);
    signalOpDone(chartId, 'findExtremum');
    if (isLast) {
        return [new DatumValue(selected.category, selected.measure, selected.target, selected.group, selected.value, selected.id)];
    }
    return [selected];
}

export async function simpleBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const hlColor = OP_COLORS.RANGE;
    const valueField = op.field || (orientation === 'vertical' ? yField : xField);

    const categoryAxisName = orientation === 'vertical' ? xField : yField;
    const values = data.map(d => {
        return d.value !== undefined ? +d.value : +d[valueField];
    }).filter(v => !isNaN(v));

    if (values.length === 0) {
        console.warn("DetermineRange: No valid data to determine range.");
        signalOpDone(chartId, 'determineRange');
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
        { value: minV, label: "Min", bars: minBars },
        { value: maxV, label: "Max", bars: maxBars }
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

        item.bars.each(function() {
            const { x, y } = getCenter(this, orientation, margins);
            const text = svg.append("text").attr("class", "annotation")
                .attr("x", x).attr("y", y)
                .attr("text-anchor", "middle")
                .attr("font-size", 12).attr("font-weight", "bold")
                .attr("fill", hlColor)
                .attr("stroke", "white").attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(`${item.label}: ${item.value}`)
                .attr("opacity", 0);

            animationPromises.push(
                text.transition().delay(400).duration(400).attr("opacity", 1).end()
            );
        });
    });

    // if (minV !== undefined && maxV !== undefined) {
    //     const rangeText = `Range: ${minV} ~ ${maxV}`;
    //     const topLabel = svg.append("text").attr("class", "annotation")
    //         .attr("x", margins.left).attr("y", margins.top - 10)
    //         .attr("font-size", 14).attr("font-weight", "bold")
    //         .attr("fill", hlColor).text(rangeText)
    //         .attr("opacity", 0);
    //
    //     animationPromises.push(
    //         topLabel.transition().duration(600).attr("opacity", 1).end()
    //     );
    // }

    await Promise.all(animationPromises);
    await delay(30);
    signalOpDone(chartId, 'determineRange');
    const intervalResult = new IntervalValue(categoryAxisName, minV, maxV);
    return isLast ? intervalResult : intervalResult;
}

export async function simpleBarCompare(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'compare');
        return [];
    }

    const winner = dataCompare(data, op, xField, yField, isLast);
    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const resolveKey = (k) => {
        if (!isLast || !Array.isArray(data)) return k;
        const foundById = data.find(d => String(d?.id) === k);
        if (foundById) return String(foundById.id);
        const foundByTarget = data.find(d => String(d?.target) === k);
        return foundByTarget ? String(foundByTarget.target) : k;
    };
    const visKeyA = resolveKey(keyA);
    const visKeyB = resolveKey(keyB);

    const barA = selectBarByKey(g, visKeyA);
    const barB = selectBarByKey(g, visKeyB);

    if (barA.empty() || barB.empty()) {
        console.warn("simpleBarCompare: target bars not found for", keyA, keyB);
        signalOpDone(chartId, 'compare');
        return winner ? [winner] : [];
    }

    const valueA = getMarkValue(barA.node());
    const valueB = getMarkValue(barB.node());

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
    const animationPromises = [];

    animationPromises.push(
        await barA.transition().duration(600).attr("fill", colorA).end()
    );
    animationPromises.push(
        await barB.transition().duration(600).attr("fill", colorB).end()
    );

    let xScale, yScale;
    if (orientation === "vertical") {
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
    }

    const targets = [
        { bar: barA, key: keyA, value: valueA, color: colorA },
        { bar: barB, key: keyB, value: valueB, color: colorB }
    ];
    const diffValue = (Number.isFinite(valueA) && Number.isFinite(valueB)) ? Math.abs(valueA - valueB) : null;

    targets.forEach(t => {
        if (!Number.isFinite(t.value)) return;

        if (orientation === "vertical") {
            const yPos = margins.top + yScale(t.value);
            svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left + plot.w).attr("y2", yPos)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
        } else {
            const xPos = margins.left + xScale(t.value);
            svg.append("line").attr("class", "annotation")
                .attr("x1", xPos).attr("y1", margins.top)
                .attr("x2", xPos).attr("y2", margins.top + plot.h)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
        }

        const { x, y } = getCenter(t.bar.node(), orientation, margins);
        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", t.color)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(t.value);
    });

    if (orientation === "vertical" && Number.isFinite(diffValue)) {
        const yA = margins.top + yScale(valueA);
        const yB = margins.top + yScale(valueB);
        if (Number.isFinite(yA) && Number.isFinite(yB)) {
            const minY = Math.min(yA, yB);
            const maxY = Math.max(yA, yB);
            const diffX = margins.left + plot.w - 8;
            const bridge = svg.append("line").attr("class", "annotation diff-line")
                .attr("x1", diffX).attr("x2", diffX)
                .attr("y1", minY).attr("y2", minY)
                .attr("stroke", OP_COLORS.DIFF_LINE)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5 5");
            animationPromises.push(
                bridge.transition().duration(400).attr("y2", maxY).end()
            );

            const labelY = (minY + maxY) / 2;
            const diffLabel = svg.append("text").attr("class", "annotation diff-label")
                .attr("x", diffX - 6)
                .attr("y", labelY)
                .attr("text-anchor", "end")
                .attr("font-size", 12)
                .attr("font-weight", "bold")
                .attr("fill", OP_COLORS.DIFF_LINE)
                .attr("stroke", "white")
                .attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(`Diff: ${diffValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                .attr("opacity", 0);
            animationPromises.push(
                diffLabel.transition().duration(400).attr("opacity", 1).end()
            );
        }
    }

    if (orientation === "horizontal" && Number.isFinite(diffValue)) {
        const xA = margins.left + xScale(valueA);
        const xB = margins.left + xScale(valueB);
        if (Number.isFinite(xA) && Number.isFinite(xB)) {
            const minX = Math.min(xA, xB);
            const maxX = Math.max(xA, xB);
            const diffY = margins.top + plot.h - 8;
            const bridge = svg.append("line").attr("class", "annotation diff-line")
                .attr("x1", minX).attr("x2", minX)
                .attr("y1", diffY).attr("y2", diffY)
                .attr("stroke", OP_COLORS.DIFF_LINE)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5 5");
            animationPromises.push(
                bridge.transition().duration(400).attr("x2", maxX).end()
            );

            const labelX = (minX + maxX) / 2;
            const diffLabel = svg.append("text").attr("class", "annotation diff-label")
                .attr("x", labelX)
                .attr("y", diffY + 16)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("font-weight", "bold")
                .attr("fill", OP_COLORS.DIFF_LINE)
                .attr("stroke", "white")
                .attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(`Diff: ${diffValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                .attr("opacity", 0);
            animationPromises.push(
                diffLabel.transition().duration(400).attr("opacity", 1).end()
            );
        }
    }

    await Promise.all(animationPromises).catch(() => {});
    await delay(30);
    signalOpDone(chartId, 'compare');
    return winner ? [winner] : [];
}

export async function simpleBarCompareBool(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        signalOpDone(chartId, 'compareBool');
        return null;
    }

    const verdict = dataCompareBool(data, op, xField, yField, isLast);
    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const resolveKey = (k) => {
        if (!isLast || !Array.isArray(data)) return k;
        const foundById = data.find(d => String(d?.id) === k);
        if (foundById) return String(foundById.id);
        const foundByTarget = data.find(d => String(d?.target) === k);
        return foundByTarget ? String(foundByTarget.target) : k;
    };
    const visKeyA = resolveKey(keyA);
    const visKeyB = resolveKey(keyB);

    const barA = selectBarByKey(g, visKeyA);
    const barB = selectBarByKey(g, visKeyB);

    if (barA.empty() || barB.empty()) {
        console.warn("simpleBarCompareBool: target bars not found for", keyA, keyB);
        signalOpDone(chartId, 'compareBool');
        return verdict;
    }

    const valueA = getMarkValue(barA.node());
    const valueB = getMarkValue(barB.node());

    const isTrue = verdict ? !!verdict.bool : null;

    const colorA = isTrue ? OP_COLORS.TRUE : OP_COLORS.FALSE;
    const colorB = colorA;
    const animationPromises = [];

    animationPromises.push(
        barA.transition().duration(600).attr("fill", colorA).end()
    );
    animationPromises.push(
        barB.transition().duration(600).attr("fill", colorB).end()
    );

    let xScale, yScale;
    if (orientation === "vertical") {
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
    }

    const targets = [
        { bar: barA, key: keyA, value: valueA, color: colorA },
        { bar: barB, key: keyB, value: valueB, color: colorB }
    ];

    targets.forEach(t => {
        if (!Number.isFinite(t.value)) return;

        if (orientation === "vertical") {
            const yPos = margins.top + yScale(t.value);
            svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left + plot.w).attr("y2", yPos)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
        } else {
            const xPos = margins.left + xScale(t.value);
            svg.append("line").attr("class", "annotation")
                .attr("x1", xPos).attr("y1", margins.top)
                .attr("x2", xPos).attr("y2", margins.top + plot.h)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
        }

        const { x, y } = getCenter(t.bar.node(), orientation, margins);
        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", t.color)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(t.value);
    });

    await Promise.all(animationPromises).catch(() => {});
    await delay(30);
    signalOpDone(chartId, 'compareBool');
    return verdict;
}

export async function simpleBarSort(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    if (!Array.isArray(data) || data.length === 0) { signalOpDone(chartId, 'sort'); return data; }
    const orderAsc = (op?.order ?? 'asc') === 'asc';
    const categoryName = data[0]?.category || (orientation === 'vertical' ? xField : yField);
    const measureName = data[0]?.measure || (orientation === 'vertical' ? yField : xField);
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
        transitions.push(bars.transition().duration(1000).attr('x', function() { return xScale(getBarKeyFromNode(this)); }).attr('width', xScale.bandwidth()).end());
        transitions.push(g.select('.x-axis').transition().duration(1000).call(d3.axisBottom(xScale)).end());
        await Promise.all(transitions);
        await delay(30);
        signalOpDone(chartId, 'sort');
    } else {
        const yScale = d3.scaleBand().domain(sortedIds).range([0, plot.h]).padding(0.2);
        const bars = selectAllMarks(g);
        const transitions = [];
        transitions.push(bars.transition().duration(1000).attr('y', function() { return yScale(getBarKeyFromNode(this)); }).attr('height', yScale.bandwidth()).end());
        transitions.push(g.select('.y-axis').transition().duration(1000).call(d3.axisLeft(yScale)).end());
        await Promise.all(transitions);
        await delay(30);
        signalOpDone(chartId, 'sort');
    }

    if (isLast) {
        const first = sortedData && sortedData[0];
        if (!first) return [];
        return [new DatumValue(first.category, first.measure, first.target, first.group, first.value, first.id)];
    }
    return sortedData;
}

export async function simpleBarSum(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataSum(data, op, xField, yField, isLast);
    if (!result) {
        signalOpDone(chartId, 'sum');
        return [];
    }

    const totalSum = +result.value;
    if (!Number.isFinite(totalSum)) {
        const errorDatum = new DatumValue(result.category, result.measure, result.target, result.group, result.value, result.id);
        signalOpDone(chartId, 'sum');
        return [errorDatum];
    }

    const sumDatum = new DatumValue(
        result.category,
        result.measure,
        result.target,
        result.group,
        result.value,
        result.id
    );

    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);
    const yAxisTransition = svg.select('.y-axis').transition().duration(1000).call(d3.axisLeft(newYScale)).end();
    const bars = selectAllMarks(g);
    const barWidth = +bars.attr('width');
    const targetX = plot.w / 2 - barWidth / 2;
    let runningTotal = 0;
    const stackPromises = [];

    bars.each(function() {
        const rect = d3.select(this);
        const raw = getMarkValue(this);
        const value = Number.isFinite(+raw) ? +raw : 0;
        const t = rect.transition().duration(1200).attr('x', targetX).attr('y', newYScale(runningTotal + value)).attr('height', plot.h - newYScale(value)).end();
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    await delay(200);

    const finalY = newYScale(totalSum);

    svg.append('line').attr('class', 'annotation value-line')
        .attr('x1', margins.left).attr('y1', margins.top + finalY)
        .attr('x2', margins.left + plot.w).attr('y2', margins.top + finalY)
        .attr('stroke', OP_COLORS.SUM)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 5');

    const centerX = margins.left + plot.w / 2;
    const centerY = margins.top + finalY - 10;
    const textAnchor = 'middle';

    svg.append('text').attr('class', 'annotation value-tag')
        .attr('x', centerX)
        .attr('y', centerY)
        .attr('text-anchor', textAnchor)
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.SUM)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(`Sum: ${totalSum.toLocaleString()}`)
        .attr('opacity', 0)
        .transition()
        .duration(400)
        .attr('opacity', 1);

    await delay(30);
    signalOpDone(chartId, 'sum');
    return isLast ? [sumDatum] : [sumDatum];
}

export async function simpleBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const numeric = Array.isArray(data) ? data.map(d => +d.value).filter(v => !Number.isNaN(v)) : [];

    if (numeric.length === 0) {
        console.warn('simpleBarAverage: Input data is empty or contains no numeric values.');
        signalOpDone(chartId, 'average');
        return [];
    }

    const result = dataAverage(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarAverage: unable to compute average');
        signalOpDone(chartId, 'average');
        return [];
    }

    const avg = +result.value;

    if (!Number.isFinite(avg)) {
        console.error('simpleBarAverage: Average value is not a finite number.', { result });
        const errorDatum = new DatumValue(result.category, result.measure, result.target, result.group, result.value, result.id);
        signalOpDone(chartId, 'average');
        return [errorDatum];
    }

    const averageDatum = new DatumValue(
        result.category,
        result.measure,
        result.target,
        result.group,
        result.value,
        result.id
    );

    if (orientation === 'vertical') {
        const yMax = d3.max(numeric) || 0;
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        const yPos = margins.top + yScale(avg);

        const line = svg.append('line').attr('class', 'annotation avg-line')
            .attr('x1', margins.left).attr('x2', margins.left)
            .attr('y1', yPos).attr('y2', yPos)
            .attr('stroke', OP_COLORS.AVERAGE).attr('stroke-width', 2).attr('stroke-dasharray', '5 5');

        await line.transition().duration(800).attr('x2', margins.left + plot.w).end();

        svg.append('text').attr('class', 'annotation avg-label')
            .attr('x', margins.left + plot.w / 2)
            .attr('y', yPos - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', OP_COLORS.AVERAGE)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
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
            .attr('stroke', OP_COLORS.AVERAGE).attr('stroke-width', 2).attr('stroke-dasharray', '5 5');

        await line.transition().duration(800).attr('y2', margins.top + plot.h).end();

        svg.append('text').attr('class', 'annotation avg-label')
            .attr('x', xPos)
            .attr('y', margins.top + plot.h / 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', OP_COLORS.AVERAGE)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(`Avg: ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
            .attr('opacity', 0)
            .transition().duration(400).attr('opacity', 1);
    }

    await delay(30);
    signalOpDone(chartId, 'average');
    return isLast ? [averageDatum] : [averageDatum];
}

export async function simpleBarDiff(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const result = dataDiff(data, op, xField, yField, isLast);
    if (!result) {
        console.warn('simpleBarDiff: unable to compute diff', op);
        signalOpDone(chartId, 'diff');
        return [];
    }

    const diffDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, Math.abs(result.value), result.id
    );

    const keyA = String(op.targetA);
    const keyB = String(op.targetB);

    const resolveKey = (k) => {
        if (!isLast || !Array.isArray(data)) return k;
        const foundById = data.find(d => String(d?.id) === k);
        if (foundById) return String(foundById.id);
        const foundByTarget = data.find(d => String(d?.target) === k);
        return foundByTarget ? String(foundByTarget.target) : k;
    };
    const visKeyA = resolveKey(keyA);
    const visKeyB = resolveKey(keyB);

    const barA = selectBarByKey(g, visKeyA);
    const barB = selectBarByKey(g, visKeyB);

    if (barA.empty() || barB.empty()) {
        console.warn('simpleBarDiff: One or both targets not found.');
        signalOpDone(chartId, 'diff');
        return [diffDatum];
    }

    const valueA = getMarkValue(barA.node());
    const valueB = getMarkValue(barB.node());

    const colorA = OP_COLORS.DIFF_A;
    const colorB = OP_COLORS.DIFF_B;
    const animationPromises = [];

    animationPromises.push(
        barA.transition().duration(600).attr("fill", colorA).end()
    );
    animationPromises.push(
        barB.transition().duration(600).attr("fill", colorB).end()
    );

    let xScale, yScale;
    if (orientation === "vertical") {
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
    }

    const targets = [
        { bar: barA, key: keyA, value: valueA, color: colorA },
        { bar: barB, key: keyB, value: valueB, color: colorB }
    ];
    const guidePositions = [];

    targets.forEach(t => {
        if (!Number.isFinite(t.value)) return;

        if (orientation === "vertical") {
            const yPos = margins.top + yScale(t.value);
            guidePositions.push(yPos);
            const line = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
            animationPromises.push(
                line.transition().duration(400).attr("x2", margins.left + plot.w).end()
            );
        } else {
            const xPos = margins.left + xScale(t.value);
            guidePositions.push(xPos);
            const line = svg.append("line").attr("class", "annotation")
                .attr("x1", xPos).attr("y1", margins.top)
                .attr("x2", xPos).attr("y2", margins.top)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
            animationPromises.push(
                line.transition().duration(400).attr("y2", margins.top + plot.h).end()
            );
        }

        const { x, y } = getCenter(t.bar.node(), orientation, margins);
        svg.append("text").attr("class", "annotation")
            .attr("x", x).attr("y", y)
            .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", t.color)
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(t.value);
    });

    const diffMagnitude = Number.isFinite(result?.value)
        ? Math.abs(result.value)
        : (Number.isFinite(valueA) && Number.isFinite(valueB) ? Math.abs(valueA - valueB) : null);

    if (orientation === "vertical" && guidePositions.length === 2 && Number.isFinite(diffMagnitude)) {
        const [posA, posB] = guidePositions;
        if (Number.isFinite(posA) && Number.isFinite(posB)) {
            const minY = Math.min(posA, posB);
            const maxY = Math.max(posA, posB);
            const diffX = margins.left + plot.w - 8;
            const bridge = svg.append("line").attr("class", "annotation diff-line")
                .attr("x1", diffX).attr("x2", diffX)
                .attr("y1", minY).attr("y2", minY)
                .attr("stroke", OP_COLORS.DIFF_LINE)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5 5");
            animationPromises.push(
                bridge.transition().duration(400).attr("y2", maxY).end()
            );

            const labelY = (minY + maxY) / 2;
            const diffLabel = svg.append("text").attr("class", "annotation diff-label")
                .attr("x", diffX - 6)
                .attr("y", labelY)
                .attr("text-anchor", "end")
                .attr("font-size", 12)
                .attr("font-weight", "bold")
                .attr("fill", OP_COLORS.DIFF_LINE)
                .attr("stroke", "white")
                .attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(`Diff: ${diffMagnitude.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                .attr("opacity", 0);
            animationPromises.push(
                diffLabel.transition().duration(400).attr("opacity", 1).end()
            );
        }
    }

    if (orientation === "horizontal" && guidePositions.length === 2 && Number.isFinite(diffMagnitude)) {
        const [posA, posB] = guidePositions;
        if (Number.isFinite(posA) && Number.isFinite(posB)) {
            const minX = Math.min(posA, posB);
            const maxX = Math.max(posA, posB);
            const diffY = margins.top + plot.h - 8;
            const bridge = svg.append("line").attr("class", "annotation diff-line")
                .attr("x1", minX).attr("x2", minX)
                .attr("y1", diffY).attr("y2", diffY)
                .attr("stroke", OP_COLORS.DIFF_LINE)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5 5");
            animationPromises.push(
                bridge.transition().duration(400).attr("x2", maxX).end()
            );

            const labelX = (minX + maxX) / 2;
            const diffLabel = svg.append("text").attr("class", "annotation diff-label")
                .attr("x", labelX)
                .attr("y", diffY + 16)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("font-weight", "bold")
                .attr("fill", OP_COLORS.DIFF_LINE)
                .attr("stroke", "white")
                .attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(`Diff: ${diffMagnitude.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                .attr("opacity", 0);
            animationPromises.push(
                diffLabel.transition().duration(400).attr("opacity", 1).end()
            );
        }
    }

    await Promise.all(animationPromises).catch(() => {});
    await delay(30);
    signalOpDone(chartId, 'diff');
    return [diffDatum];
}

export async function simpleBarNth(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const resultArray = dataNth(data, op, xField, yField, isLast);

    if (!resultArray || resultArray.length === 0) {
        console.warn('simpleBarNth: selection failed, dataNth returned empty.');
        signalOpDone(chartId, 'nth');
        return [];
    }

    const selected = resultArray[0];
    const pickedId = String(selected.target);
    const hlColor = OP_COLORS.NTH;

    const targetBar = selectBarByKey(g, pickedId);

    if (targetBar.empty()) {
        console.warn(`simpleBarNth: Target bar with id "${pickedId}" not found in the chart.`);
        signalOpDone(chartId, 'nth');
        return resultArray;
    }

    await targetBar.transition().duration(600).attr('fill', hlColor).end();

    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

        const yPos = margins.top + yScale(selected.value);
        svg.append('line').attr('class', 'annotation')
            .attr('stroke', hlColor).attr('stroke-width', 2).attr('stroke-dasharray', '4,4')
            .attr('x1', margins.left).attr('y1', yPos)
            .attr('x2', margins.left).attr('y2', yPos)
            .transition().duration(500)
            .attr('x2', margins.left + xScale(selected.target) + xScale.bandwidth() / 2);

    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);

        const xPos = margins.left + xScale(selected.value);
        svg.append('line').attr('class', 'annotation')
            .attr('stroke', hlColor).attr('stroke-width', 2).attr('stroke-dasharray', '4,4')
            .attr('x1', xPos).attr('y1', margins.top + plot.h)
            .attr('x2', xPos).attr('y2', margins.top + plot.h)
            .transition().duration(500)
            .attr('y2', margins.top + yScale(selected.target) + yScale.bandwidth() / 2);
    }

    const val = getMarkValue(targetBar.node());
    const { x, y } = getCenter(targetBar.node(), orientation, margins);

    svg.append('text').attr('class', 'annotation')
        .attr('x', x).attr('y', y).attr('text-anchor', 'middle')
        .attr('font-size', 12).attr('fill', hlColor)
        .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
        .text(String(val));

    await delay(30);
    signalOpDone(chartId, 'nth');
    return isLast ? [selected] : resultArray;
}

export async function simpleBarCount(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, orientation, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    const result = dataCount(data, op, xField, yField, isLast);
    const totalCount = result ? Number(result.value) : 0;
    const bars = selectAllMarks(g);
    if (bars.empty()) {
        signalOpDone(chartId, 'count');
        return result ? [result] : [];
    }
    const baseColor = '#69b3a2'; // This color is not in the palette, kept for visual effect.
    const hlColor = OP_COLORS.COUNT;
    await bars.transition().duration(150).attr('fill', baseColor).attr('opacity', 0.3).end();
    const nodes = bars.nodes();
    const items = nodes.map((node) => {
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
        await rect.transition().duration(150).attr('fill', hlColor).attr('opacity', 1).end();
        const { x, y } = getCenter(node, orientation, margins);
        svg.append('text').attr('class', 'annotation count-label').attr('x', x).attr('y', y).attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 'bold').attr('fill', hlColor).attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke').text(String(i + 1)).attr('opacity', 0).transition().duration(125).attr('opacity', 1);
        await delay(60);
    }

    await delay(30);
    signalOpDone(chartId, 'count');
    return isLast ? (result ? [result] : []) : (result ? [result] : []);
}
