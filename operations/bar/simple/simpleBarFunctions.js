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
    count as dataCount,
    lagDiff as dataLagDiff
} from "../../operationFunctions.js";
// 기존 import 아래에 추가
import { OP_COLORS } from "../../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";
import { normalizeLagDiffResults } from "../../common/lagDiffHelpers.js";

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
    const valueAttr = Number(bar.getAttribute("data-value"));
    const isNegative = Number.isFinite(valueAttr) && valueAttr < 0;
    if (orientation === "horizontal") {
        if (isNegative) {
            return { x: x0 - 6 + margins.left, y: y0 + h / 2 + margins.top };
        }
        return { x: x0 + w + 6 + margins.left, y: y0 + h / 2 + margins.top };
    } else {
        if (isNegative) {
            return { x: x0 + w / 2 + margins.left, y: y0 + h + 14 + margins.top };
        }
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

    // (A-1) 수량 기준 필터 (가로 점선) - 이 로직은 변경 없습니다.
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

        await line.transition().duration(400).attr("x2", margins.left + plot.w).end();
    };

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

    // [수정됨] 이 두 변수는 if/else 양쪽에서 사용하므로 위로 이동합니다.
    const categoryKey = filteredData[0]?.category || xField;
    const plainRows = filteredData.map(d => ({
        [categoryKey]: d.target,
        target: d.target,
        value: d.value,
        group: d.group,
        category: d.category ?? categoryKey,
        measure: d.measure ?? yField ?? 'value'
    }));

    const numericOps = new Set(['>','>=','<','<=','==','eq']);
    const isNumericMeasureFilter = numericOps.has(op.operator) && Number.isFinite(toNumber(op.value)) && isMeasureField;

    if (isNumericMeasureFilter) {
        // --- A-1: 수량 기준 필터 (가로 점선 + 기존 애니메이션) ---
        await drawMeasureThreshold(op.value);
        
        // 데이터 바인딩
        const filteredBars = selectAllMarks(g).data(plainRows, d => String(d[categoryKey]));

        // [원본 애니메이션] 막대가 바로 사라지고 재정렬됩니다.
        await Promise.all([
            filteredBars.transition().duration(400)
                .attr("opacity", 1)
                .end(),
            filteredBars.exit().transition().duration(400)
                .attr("opacity", 0)
                .remove()
                .end()
        ]);

        const xScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d.target)).range([0, plot.w]).padding(0.2);

        await Promise.all([
            filteredBars.transition().duration(400)
                .attr("x", d => xScaleFiltered(d[categoryKey]))
                .attr("width", xScaleFiltered.bandwidth())
                .end(),
            g.select(".x-axis").transition().duration(400)
                .call(d3.axisBottom(xScaleFiltered))
                .end()
        ]);

    } else {
        // --- A-2: 항목(연도 등) 기준 필터 (새 '흐리게 하기' 애니메이션) ---
        
        // [수정됨] 1단계: '제외될 막대'만 찾아서 흐리게 만듭니다.
        
        // 1-1. 현재 화면의 모든 막대를 선택합니다. (데이터 바인딩 *전*)
        const allBars = selectAllMarks(g);
        
        // 1-2. '유지될' 데이터의 키(예: '2021', '2022') 목록을 Set으로 만듭니다.
        const keptTargets = new Set(plainRows.map(d => String(d[categoryKey])));
        
        // 1-3. 모든 막대(allBars)를 필터링하여,
        //      현재 막대의 데이터(d)가 '유지될 키' 목록에 없는(!keptTargets.has(...)) 것들만 선택합니다.
        const barsToDim = allBars.filter(d => {
            if (!d) return false;
            return !keptTargets.has(String(d[categoryKey]));
        });

        // 1-4. 이렇게 '골라낸 막대들'(barsToDim)만 흐리게 만듭니다.
        //      '남을 막대'는 아예 건드리지 않으므로 '깜빡임'이나 '여백'이 발생하지 않습니다.
        await barsToDim.transition().duration(400)
            .attr("opacity", 0.2)
            .end();

        // [수정됨] 2단계: 잠시 대기
        await delay(700);

        // [수정됨] 3단계: 이제서야 데이터를 바인딩하고 재정렬/제거합니다.
        
        // 3-1. *이제* '유지될 데이터'(plainRows)를 바인딩합니다.
        //      allBars 셀렉션에 바인딩하면, D3가 알아서 update/exit을 구분합니다.
        const filteredBars = allBars.data(plainRows, d => String(d[categoryKey]));
        
        // 3-2. 새 X축 스케일을 정의합니다.
        const xScaleFiltered = d3.scaleBand().domain(filteredData.map(d => d.target)).range([0, plot.w]).padding(0.2);

        // 3-3. '남을 막대'(update)는 새 위치로 옮기고, '흐려진 막대'(exit)는 마저 제거합니다.
        await Promise.all([
            // '남을 막대'들을 새 위치로 이동
            filteredBars.transition().duration(400)
                .attr("x", d => xScaleFiltered(d[categoryKey]))
                .attr("width", xScaleFiltered.bandwidth())
                .end(),
            
            // '흐려진 막대'들(opacity 0.2)을 0으로 만들며 제거
            filteredBars.exit().transition().duration(300)
                .attr("opacity", 0) 
                .remove()
                .end(),

            // X축(x-axis)을 새 스케일로 업데이트
            g.select(".x-axis").transition().duration(400)
                .call(d3.axisBottom(xScaleFiltered))
                .end()
        ]);
        
        // [수정됨] 값 태그 추가는 '남은 막대'(filteredBars)에만 적용해야 하므로
        // if/else 블록 안으로 이동시킵니다.
        filteredBars.each(function(d) {
            const bar = d3.select(this);
            const yMax = d3.max(data, datum => +datum.value) || 0;
            const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

            g.append("text").attr("class", "annotation value-tag")
                .attr("x", +bar.attr("x") + +bar.attr("width") / 2)
                .attr("y", yScale(d.value) - 5)
                .attr("text-anchor", "middle")
                .attr("font-size", 12).attr("font-weight", "bold")
                .attr("fill", "black")
                .text(d.value);
        });
    }

    // [수정됨] 값 태그 추가 로직이 if/else 안으로 이동했으므로,
    // (A-1) 수량 필터 쪽에도 값 태그 로직을 추가해줍니다.
    if (isNumericMeasureFilter) {
        // 'filteredBars' 변수는 if (isNumericMeasureFilter) 블록 내에서
        // 재정의되었으므로, 여기서 사용 가능합니다.
        const filteredBars = selectAllMarks(g).data(plainRows, d => String(d[categoryKey]));
        
        filteredBars.each(function(d) {
            const bar = d3.select(this);
            const yMax = d3.max(data, datum => +datum.value) || 0;
            const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

            g.append("text").attr("class", "annotation value-tag")
                .attr("x", +bar.attr("x") + +bar.attr("width") / 2)
                .attr("y", yScale(d.value) - 5)
                .attr("text-anchor", "middle")
                .attr("font-size", 12).attr("font-weight", "bold")
                .attr("fill", "black")
                .text(d.value);
        });
    }


    // 마무리
    await delay(1000);
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
        const foundByLookup = data.find(d => d?.lookupId != null && String(d.lookupId) === k);
        if (foundByLookup) {
            return String(foundByLookup.id ?? foundByLookup.lookupId);
        }
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
            const line = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
            animationPromises.push(
                line.transition().duration(400).attr("x2", margins.left + plot.w).end()
            );
        } else {
            const xPos = margins.left + xScale(t.value);
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

    if (isPercentOfTotal) {
        const percentLabel = Number.isFinite(result.value)
            ? `${result.value.toFixed(1)}%`
            : '—';
        svg.append('text')
            .attr('class', 'annotation diff-percent-summary')
            .attr('x', margins.left + plot.w / 2)
            .attr('y', Math.max(24, margins.top - 6))
            .attr('text-anchor', 'middle')
            .attr('font-size', 16)
            .attr('font-weight', 'bold')
            .attr('fill', OP_COLORS.DIFF_LINE)
            .text(`Percent of total = ${percentLabel}`);
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
        const foundByLookup = data.find(d => d?.lookupId != null && String(d.lookupId) === k);
        if (foundByLookup) {
            return String(foundByLookup.id ?? foundByLookup.lookupId);
        }
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

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;
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
            const line = svg.append("line").attr("class", "annotation")
                .attr("x1", margins.left).attr("y1", yPos)
                .attr("x2", margins.left).attr("y2", yPos)
                .attr("stroke", t.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
            animationPromises.push(
                line.transition().duration(400).attr("x2", margins.left + plot.w).end()
            );
        } else {
            const xPos = margins.left + xScale(t.value);
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

    const aggregateMode = typeof op?.aggregate === 'string'
        ? op.aggregate.toLowerCase()
        : null;
    const isPercentOfTotal = aggregateMode === 'percentage_of_total' || aggregateMode === 'percent_of_total';
    const isRatioMode = String(op?.mode || '').toLowerCase() === 'ratio';
    const isPercentMode = isPercentOfTotal || op?.percent === true || isRatioMode;

    const diffValue = isPercentMode ? result.value : Math.abs(result.value);

    const diffDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, diffValue, result.id
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
    let guidePositions = [];

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

    const expectedGuideCount = targets.length;
    if (guidePositions.length < expectedGuideCount) {
        const fallbackPositions = [];
        const resolveNumericValue = (key) => {
            const datum = data.find(d => {
                const datumKey = d?.id != null ? String(d.id) : String(d?.target ?? '');
                return datumKey === key;
            });
            const v = Number(datum?.value);
            return Number.isFinite(v) ? v : null;
        };
        const resolvedKeys = [visKeyA, visKeyB];
        resolvedKeys.forEach((resolvedKey) => {
            if (!resolvedKey) return;
            const numericValue = resolveNumericValue(resolvedKey);
            if (!Number.isFinite(numericValue)) return;
            if (orientation === "vertical") {
                fallbackPositions.push(margins.top + yScale(numericValue));
            } else {
                fallbackPositions.push(margins.left + xScale(numericValue));
            }
        });
        if (fallbackPositions.length === expectedGuideCount) {
            guidePositions = fallbackPositions;
        }
    }

    const diffMagnitude = Number.isFinite(result?.value)
        ? (isPercentMode ? result.value : Math.abs(result.value))
        : (Number.isFinite(valueA) && Number.isFinite(valueB) ? Math.abs(valueA - valueB) : null);

    if (!isPercentMode) {
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
    }

    await Promise.all(animationPromises).catch(() => {});
    await delay(30);
    signalOpDone(chartId, 'diff');
    return [diffDatum];
}

const formatLagDiffValue = (value) => {
    if (!Number.isFinite(value) || value === 0) return '0';
    const magnitude = Math.abs(value);
    const base = fmtNum(magnitude);
    return value > 0 ? `+${base}` : `-${base}`;
};

const formatLagDiffLabel = (datum) => {
    const head = datum.prevTarget ? `${datum.prevTarget} -> ${datum.target}` : datum.target;
    return `${head}: ${formatLagDiffValue(datum.value)}`;
};

function computeLagDiffDomain(values) {
    const minVal = d3.min(values.filter(Number.isFinite));
    const maxVal = d3.max(values.filter(Number.isFinite));
    let domainMin = Math.min(0, Number.isFinite(minVal) ? minVal : 0);
    let domainMax = Math.max(0, Number.isFinite(maxVal) ? maxVal : 0);
    if (domainMin === domainMax) {
        domainMax = domainMin === 0 ? 1 : domainMin + Math.abs(domainMin) * 0.5;
    }
    if (!Number.isFinite(domainMin)) domainMin = 0;
    if (!Number.isFinite(domainMax)) domainMax = 1;
    if (domainMax <= domainMin) domainMax = domainMin + 1;
    return [domainMin, domainMax];
}

async function renderLagDiffState(ctx, diffData) {
    const { svg, g, orientation, margins, plot } = ctx;
    const categories = diffData.map(d => String(d.target));
    const values = diffData.map(d => Number(d.value) || 0);
    const [domainMin, domainMax] = computeLagDiffDomain(values);

    if (orientation === 'horizontal') {
        const yScale = d3.scaleBand().domain(categories).range([0, plot.h]).padding(0.2);
        const xScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([0, plot.w]);
        const zeroX = xScale(0);

        const bars = g.selectAll('rect').classed('main-bar', true).data(diffData, d => d.target);
        const exiting = bars.exit();
        if (!exiting.empty()) {
            await exiting.transition().duration(200).attr('opacity', 0).remove().end().catch(() => {});
        }

        const entered = bars.enter().append('rect')
            .attr('class', 'main-bar')
            .attr('y', d => yScale(d.target))
            .attr('height', yScale.bandwidth())
            .attr('x', zeroX)
            .attr('width', 0)
            .attr('opacity', 0.05);

        await entered.merge(bars)
            .attr('data-target', d => d.target)
            .attr('data-id', d => d.id ?? d.target)
            .attr('data-value', d => d.value)
            .transition().duration(500)
            .attr('y', d => yScale(d.target))
            .attr('height', yScale.bandwidth())
            .attr('x', d => (d.value >= 0 ? zeroX : xScale(d.value)))
            .attr('width', d => {
                const span = Math.abs(xScale(d.value) - zeroX);
                return span < 2 ? 2 : span;
            })
            .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
            .attr('opacity', 0.95)
            .end().catch(() => {});

        const xAxis = g.select('.x-axis');
        if (!xAxis.empty()) {
            xAxis.call(d3.axisBottom(xScale).ticks(5));
        }
        const yAxis = g.select('.y-axis');
        if (!yAxis.empty()) {
            yAxis.call(d3.axisLeft(yScale));
        }

        svg.selectAll('.lagdiff-zero-line').remove();
        svg.append('line')
            .attr('class', 'annotation lagdiff-zero-line')
            .attr('x1', margins.left + zeroX)
            .attr('x2', margins.left + zeroX)
            .attr('y1', margins.top)
            .attr('y2', margins.top + plot.h)
            .attr('stroke', '#666')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 4');

        const labels = svg.selectAll('.lagdiff-label').data(diffData, d => d.id || d.target);
        labels.exit().remove();
        labels.enter().append('text').attr('class', 'annotation lagdiff-label')
            .merge(labels)
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .attr('text-anchor', d => d.value >= 0 ? 'start' : 'end')
            .attr('x', d => {
                const valueX = xScale(d.value);
                const offset = 10;
                return margins.left + valueX + (d.value >= 0 ? offset : -offset);
            })
            .attr('y', d => margins.top + yScale(d.target) + yScale.bandwidth() / 2 + 4)
            .text(formatLagDiffLabel);
        return;
    }

    // vertical orientation
    const xScale = d3.scaleBand().domain(categories).range([0, plot.w]).padding(0.2);
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plot.h, 0]);
    const zeroY = yScale(0);

    const bars = g.selectAll('rect').classed('main-bar', true).data(diffData, d => d.target);
    const exiting = bars.exit();
    if (!exiting.empty()) {
        await exiting.transition().duration(200).attr('opacity', 0).attr('height', 0).remove().end().catch(() => {});
    }

    const entered = bars.enter().append('rect')
        .attr('class', 'main-bar')
        .attr('x', d => xScale(d.target))
        .attr('width', xScale.bandwidth())
        .attr('y', zeroY)
        .attr('height', 0)
        .attr('opacity', 0.05);

    await entered.merge(bars)
        .attr('data-target', d => d.target)
        .attr('data-id', d => d.id ?? d.target)
        .attr('data-value', d => d.value)
        .transition().duration(500)
        .attr('x', d => xScale(d.target))
        .attr('width', xScale.bandwidth())
        .attr('y', d => (d.value >= 0 ? yScale(d.value) : zeroY))
        .attr('height', d => {
            const span = Math.abs(yScale(d.value) - zeroY);
            return span < 2 ? 2 : span;
        })
        .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
        .attr('opacity', 0.95)
        .end().catch(() => {});

    const xAxis = g.select('.x-axis');
    if (!xAxis.empty()) {
        xAxis.call(d3.axisBottom(xScale));
        xAxis.selectAll('text').attr('transform', 'rotate(-45)').style('text-anchor', 'end');
    }
    const yAxis = g.select('.y-axis');
    if (!yAxis.empty()) {
        yAxis.call(d3.axisLeft(yScale).ticks(5));
    }

    svg.selectAll('.lagdiff-zero-line').remove();
    svg.append('line')
        .attr('class', 'annotation lagdiff-zero-line')
        .attr('x1', margins.left)
        .attr('x2', margins.left + plot.w)
        .attr('y1', margins.top + zeroY)
        .attr('y2', margins.top + zeroY)
        .attr('stroke', '#666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4');

    const labels = svg.selectAll('.lagdiff-label').data(diffData, d => d.id || d.target);
    labels.exit().remove();
    labels.enter().append('text').attr('class', 'annotation lagdiff-label')
        .merge(labels)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .attr('x', d => margins.left + xScale(d.target) + xScale.bandwidth() / 2)
        .attr('y', d => {
            const base = d.value >= 0 ? yScale(d.value) - 8 : Math.max(yScale(d.value), zeroY) + 16;
            return margins.top + base;
        })
        .text(formatLagDiffLabel);
}

export async function simpleBarLagDiff(chartId, op, data, isLast = false) {
    const ctx = getSvgAndSetup(chartId);
    clearAllAnnotations(ctx.svg);

    const diffsRaw = dataLagDiff(data, op, null, null, isLast);
    if (!Array.isArray(diffsRaw) || diffsRaw.length === 0) {
        console.warn('[simpleBarLagDiff] no differences computed');
        return [];
    }

    const canonicalCategory = diffsRaw[0]?.category || ctx.xField || 'target';
    const canonicalMeasure = diffsRaw[0]?.measure || ctx.yField || 'value';

    const diffDatumValues = normalizeLagDiffResults(diffsRaw, canonicalCategory, canonicalMeasure);

    await renderLagDiffState(ctx, diffDatumValues);

    const positiveTotal = diffDatumValues
        .map(d => Number(d.value))
        .filter(v => Number.isFinite(v) && v > 0)
        .reduce((sum, v) => sum + v, 0);

    ctx.svg.append('text').attr('class', 'annotation lagdiff-summary')
        .attr('x', ctx.margins.left + 4)
        .attr('y', ctx.margins.top - 12)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.SUM)
        .text(
            Number.isFinite(positiveTotal)
                ? `lagDiff computed ${diffDatumValues.length} changes (sum of positives = ${positiveTotal.toLocaleString()})`
                : `lagDiff computed ${diffDatumValues.length} changes`
        );

    signalOpDone(chartId, 'lagDiff');
    return diffDatumValues;
}

export async function simpleBarNth(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 🔥 서수 변환 함수
    const getOrdinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const resultArray = dataNth(data, op, xField, yField, isLast);

    if (!resultArray || resultArray.length === 0) {
        console.warn('simpleBarNth: selection failed, dataNth returned empty.');
        signalOpDone(chartId, 'nth');
        return [];
    }

    // 🔥 n을 배열로 처리 (단일 값이면 배열로 변환)
    const nValues = Array.isArray(op.n) ? op.n : [op.n];
    const from = String(op?.from || 'left').toLowerCase();
    const color = OP_COLORS.NTH;

    const all = g.selectAll('rect');
    const cats = data.map(d => String(d.target));
    const seq = from === 'right' ? cats.slice().reverse() : cats;

    // 모든 막대 흐리게
    await all.transition().duration(250).attr("opacity", 0.2).end();

    let xScale, yScale;
    if (orientation === 'vertical') {
        xScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.w]).padding(0.2);
        const yMax = d3.max(data, d => +d.value) || 0;
        yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    } else {
        const xMax = d3.max(data, d => +d.value) || 0;
        xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, plot.w]);
        yScale = d3.scaleBand().domain(data.map(d => d.target)).range([0, plot.h]).padding(0.2);
    }

    // 🔥 1단계: 카운팅 애니메이션
    const countedBars = [];
    const maxN = Math.max(...nValues);
    const countLimit = Math.min(maxN, cats.length);

    for (let i = 0; i < countLimit; i++) {
        const c = seq[i];
        const sel = all.filter(function() { return getBarKeyFromNode(this) === c; });
        const targetData = data.find(d => String(d.target) === c);
        countedBars.push({ 
            index: i + 1, 
            category: c, 
            selection: sel, 
            value: targetData?.value || 0 
        });
        
        await sel.transition().duration(150).attr('opacity', 1).end();

        const nodes = sel.nodes();
        if (nodes.length) {
            const bar = nodes[0];
            const { x, y } = getCenter(bar, orientation, margins);
            
            await svg.append('text').attr('class', 'annotation count-label')
                .attr('x', x)
                .attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('font-size', 14)
                .attr('font-weight', 'bold')
                .attr('fill', color)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1))
                .attr('opacity', 0)
                .transition().duration(150).attr('opacity', 1).end();
        }
        
        await delay(100);
    }

    // 🔥 2단계: 선택되지 않은 것들 페이드아웃
    const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
    const finals = [];
    
    countedBars.forEach((item) => {
        if (!selectedIndices.has(item.index)) {
            finals.push(item.selection.transition().duration(300).attr('opacity', 0.2).end());
        }
    });
    finals.push(svg.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
    await Promise.all(finals);

    // 🔥 3단계: 선택된 것들 강조 + 수평선 + 값 표시 (동시에)
    const highlightTasks = [];
    const lineTasks = [];
    const labelTasks = [];

    nValues.forEach(n => {
        if (n > countLimit) return;
        
        const item = countedBars.find(cb => cb.index === n);
        if (!item) return;

        // 강조
        highlightTasks.push(
            item.selection.transition().duration(400).attr('fill', color).attr('opacity', 1).end()
        );

        // 수평선
        if (orientation === 'vertical') {
            const yPos = margins.top + yScale(item.value);
            lineTasks.push(
                svg.append('line').attr('class', 'annotation nth-line')
                    .attr('x1', margins.left).attr('y1', yPos)
                    .attr('x2', margins.left).attr('y2', yPos)
                    .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
                    .transition().duration(500).attr('x2', margins.left + plot.w).end()
            );
        } else {
            const xPos = margins.left + xScale(item.value);
            lineTasks.push(
                svg.append('line').attr('class', 'annotation nth-line')
                    .attr('x1', xPos).attr('y1', margins.top)
                    .attr('x2', xPos).attr('y2', margins.top)
                    .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
                    .transition().duration(500).attr('y2', margins.top + plot.h).end()
            );
        }

        // 값 표시 (서수 + 값)
        const nodes = item.selection.nodes();
        if (nodes.length) {
            const bar = nodes[0];
            const { x, y } = getCenter(bar, orientation, margins);
            
            // 🔥 서수 배경
            const ordinalText = getOrdinal(n);
            labelTasks.push(
                svg.append('rect').attr('class', 'annotation label-bg')
                    .attr('x', x - 15).attr('y', y - 25)
                    .attr('width', 30).attr('height', 14)
                    .attr('fill', 'white').attr('rx', 3)
                    .attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 0.9).end()
            );
            
            // 서수 표시 (위쪽)
            labelTasks.push(
                svg.append('text').attr('class', 'annotation value-tag')
                    .attr('x', x).attr('y', y - 15).attr('text-anchor', 'middle')
                    .attr('font-size', 11).attr('font-weight', 'bold').attr('fill', color)
                    .text(ordinalText).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
            );
            
            // 🔥 값 배경
            const valueText = fmtNum(item.value);
            const valueWidth = Math.max(30, valueText.length * 7);
            labelTasks.push(
                svg.append('rect').attr('class', 'annotation label-bg')
                    .attr('x', x - valueWidth/2).attr('y', y - 11)
                    .attr('width', valueWidth).attr('height', 14)
                    .attr('fill', 'white').attr('rx', 3)
                    .attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 0.9).end()
            );
            
            // 값 표시 (아래쪽)
            labelTasks.push(
                svg.append('text').attr('class', 'annotation value-tag')
                    .attr('x', x).attr('y', y - 1).attr('text-anchor', 'middle')
                    .attr('font-size', 12).attr('font-weight', 'bold').attr('fill', color)
                    .text(valueText).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
            );
        }
    });

    await Promise.all([...highlightTasks]);
    await Promise.all([...lineTasks]);
    await Promise.all([...labelTasks]);

    await delay(30);
    signalOpDone(chartId, 'nth');
    return Array.isArray(resultArray) ? resultArray : [];
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
