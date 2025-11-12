
import {DatumValue, BoolValue, IntervalValue} from "../../../object/valueType.js";
import {
    retrieveValue as dataRetrieveValue,
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
    determineRange as dataDetermineRange,
    lagDiff as dataLagDiff
} from "../../operationFunctions.js";
// simple-bar 연출 재사용 (group 분기 시)
import {
    simpleBarFilter,
    simpleBarSort,
    simpleBarSum,
    simpleBarAverage,
    simpleBarFindExtremum,
    simpleBarDetermineRange,
    simpleBarDiff,
    simpleBarCompare,
    simpleBarCompareBool,
    simpleBarLagDiff,
    simpleBarNth,
    simpleBarCount,
    simpleBarRetrieveValue
} from "../simple/simpleBarFunctions.js";
import { OP_COLORS } from "../../../object/colorPalette.js";
import { getPrimarySvgElement } from "../../operationUtil.js";
import { normalizeLagDiffResults } from "../../common/lagDiffHelpers.js";


// ---------- 공통 셋업 ----------
export function getSvgAndSetup(chartId) {
    const svgNode = getPrimarySvgElement(chartId);
    const svg = svgNode ? d3.select(svgNode) : d3.select(null);
    const g = svg.select(".plot-area");
    const margins = { left: +(svgNode?.getAttribute("data-m-left") || 0), top: +(svgNode?.getAttribute("data-m-top") || 0) };
    const plot = { w: +(svgNode?.getAttribute("data-plot-w") || 0), h: +(svgNode?.getAttribute("data-plot-h") || 0) };
    const xField = svgNode?.getAttribute("data-x-field");
    const yField = svgNode?.getAttribute("data-y-field");
    const facetField = svgNode?.getAttribute("data-facet-field");
    const colorField = svgNode?.getAttribute("data-color-field");
    return { svg, g, margins, plot, xField, yField, facetField, colorField };
}

export function clearAllAnnotations(svg) {
    svg.selectAll(
        ".annotation, .filter-label, .compare-label, .range-line, .extremum-label, .value-tag, .threshold-line, .threshold-label"
    ).remove();
}

// groupedBarFunctions.js 상단에 추가/수정
function isSimplifiedData(data) {
    if (!Array.isArray(data) || data.length === 0) return false;
    
    // 🔥 수정: simple bar는 모든 데이터가 같은 group 값을 가짐
    const groups = new Set(data.map(d => String(d.group)).filter(Boolean));
    
    // group이 1개만 있고, 모든 row에 target이 있으면 simplified
    return groups.size === 1 && data.every(d => d.target != null);
}

export const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Helper to coordinate operation ordering by waiting for filtering attr to clear
async function waitForAttrClear(svg, attr = 'data-filtering', timeout = 1000, interval = 50) {
    const start = Date.now();
    while (svg && svg.attr && svg.attr(attr)) {
        if (Date.now() - start > timeout) {
            console.warn(`waitForAttrClear timeout after ${timeout}ms`);
            break;
        }
        await delay(interval);
    }
}

const cmpMap = { ">":(a,b)=>a>b, ">=":(a,b)=>a>=b, "<":(a,b)=>a<b, "<=":(a,b)=>a<=b, "==":(a,b)=>a==b, "eq":(a,b)=>a==b, "!=":(a,b)=>a!=b };
function toNum(v){ const n=+v; return Number.isNaN(n) ? null : n; }
function fmtNum(v){ return (v!=null && isFinite(v)) ? (+v).toLocaleString() : String(v); }
function cssEscape(x){ try{ return CSS.escape(String(x)); } catch { return String(x).replace(/[^\w-]/g,'_'); } }
function idOf(row, facetField, xField) { return `${row[facetField]}-${row[xField]}`; }
function idOfDatum(d) { return `${d.facet}-${d.key}`; }
function getDatumCategoryKey(d, fallback='') {
    if (!d) return String(fallback);
    return String(d.key ?? d.target ?? d.category ?? d.id ?? fallback);
}
function asDatumValues(list, opts = {}) {
    const {
        categoryField = 'target',
        measureField = 'value',
        groupField = 'group',
        idPrefix = 'dv'
    } = opts;
    return (list || []).map((item, idx) => {
        if (item instanceof DatumValue) {
            if (!item.id) item.id = `${idPrefix}_${idx}`;
            return item;
        }
        const target = item?.target ?? item?.[categoryField];
        const value = Number(item?.value ?? item?.[measureField] ?? 0);
        const group = item?.group ?? item?.[groupField] ?? null;
        const category = item?.category ?? categoryField;
        const measure = item?.measure ?? measureField;
        const id = item?.id ?? `${idPrefix}_${idx}`;
        return new DatumValue(category, measure, target, group, value, id);
    });
}


function readGroupX(node) {
    const p = node?.parentNode;
    if (!p) return 0;
    const t = p.getAttribute && p.getAttribute("transform");
    if (!t) return 0;
    const m = /translate\(([-\d.]+)/.exec(t);
    return m ? +m[1] : 0;
}

// Estimate the typical width of a facet group (average of existing facet-group bboxes)
function widthOfFacet(g) {
    const groups = g.selectAll('[class^="facet-group-"]');
    if (groups.empty()) return 0;
    let total = 0, count = 0;
    groups.each(function() {
        try {
            const bb = this.getBBox();
            if (bb && isFinite(bb.width)) { total += bb.width; count++; }
        } catch (_) { /* ignore */ }
    });
    return count ? (total / count) : 0;
}

// Helper to reset all bars to visible and no stroke, before animation
function resetBarsVisible(g) {
    const bars = g.selectAll('rect');
    if (bars.empty()) return;
    bars.interrupt();
    bars.attr('opacity', 1).attr('stroke', 'none');
}

function describeFilter(op) {
    if (!op || !op.field) return "Filter";

    if (op.operator === 'in' || op.operator === 'not-in') {
        const arr = Array.isArray(op.value) ? op.value : [op.value];
        const symbol = op.operator === 'in' ? '∈' : '∉';
        return `Filter: ${op.field} ${symbol} {${arr.join(',')}}`;
    }
    return `Filter: ${op.field} ${op.operator} ${op.value}`;
}

function absCenter(svg, node) {
    const margins = { left:+svg.attr("data-m-left")||0, top:+svg.attr("data-m-top")||0 };
    const r = node.getBBox();
    const groupX = readGroupX(node);
    return { x: margins.left + groupX + r.x + r.width/2, y: margins.top + r.y };
}
function findRectByTuple(g, t={}) {
    const { facet, x, key } = t;
    let sel = g.selectAll("rect");
    if (facet!=null) sel = sel.filter(d => d && String(d.facet)===String(facet));
    const wantKey = x ?? key;
    if (wantKey!=null) sel = sel.filter(d => d && String(d.key)===String(wantKey));
    return sel.empty() ? null : sel.node();
}

function drawYThresholdsOnce(svg, margins, plot, yScale, yField, conditions) {
    const yConds = (conditions || []).filter(c =>
        c.field === yField && (['>', '>=', '<', '<='].includes(c.operator))
    );

    svg.selectAll(".threshold-line, .threshold-label").remove();

    yConds.forEach(c => {
        const yVal = +c.value;
        if (isNaN(yVal)) return;

        const yPix = margins.top + yScale(yVal);
        svg.append("line")
            .attr("class", "threshold-line")
            .attr("x1", margins.left).attr("x2", margins.left + plot.w)
            .attr("y1", yPix).attr("y2", yPix)
            .attr("stroke", "#0d6efd").attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
        svg.append("text")
            .attr("class", "threshold-label")
            .attr("x", margins.left + plot.w + 6).attr("y", yPix)
            .attr("dominant-baseline", "middle").attr("fill", "#0d6efd")
            .attr("font-size", 12).attr("font-weight", "bold")
            .text(`${c.operator} ${fmtNum(yVal)}`);
    });
}

export async function groupedBarToSimpleByTarget(chartId, targetFacet, data) {
    const { svg, g, margins, plot, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    // 🔥 삭제: await waitForAttrClear(svg);
    resetBarsVisible(g);

    const facet = String(targetFacet);
    const subset = Array.isArray(data) ? data.filter(d => String(d.target) === facet) : [];
    if (subset.length === 0) {
        console.warn('groupedBarToSimpleByTarget: no data for facet', facet);
        return [];
    }

    const DUR_FADE = 400;
    const DUR_GEOM = 600;
    const EASE = d3.easeCubicOut;

    // 1) Fade out & remove other facet groups
    const selGroup = g.select(`.facet-group-${cssEscape(facet)}`);
    const otherGroups = g.selectAll('[class^="facet-group-"]').filter(function() { return this !== selGroup.node(); });
    const fadeP = otherGroups.transition().duration(DUR_FADE).ease(EASE).attr('opacity', 0).end()
        .then(() => { otherGroups.remove(); });

    // 2) Normalize datum of bars in the selected facet so they look like a simple bar: target := series key
    const keys = [...new Set(subset.map(d => String(d.group)))]
        .filter(k => k != null);
    const yMax = d3.max(subset, d => +d.value) || 0;
    const x1 = d3.scaleBand().domain(keys).range([0, plot.w]).padding(0.2);
    const y  = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const bars = selGroup.selectAll('rect').filter(d => d && String(d.facet) === facet);
    bars.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        const k = String(d.key); // series key
        // Normalize to simple bar schema: category => series key
        const norm = { ...d, target: k, group: k, key: k, value: +d.value, id: `${facet}-${k}` };
        rect.datum(norm).attr('data-target', k).attr('data-group', k).attr('data-id', norm.id);
    });

    // 3) Animate: center the facet group at x=0 and lay bars across the whole plot width
    const moveGroupP = selGroup.transition().duration(DUR_GEOM).ease(EASE)
        .attr('transform', 'translate(0,0)')
        .end();

    const geomP = bars.transition().duration(DUR_GEOM).ease(EASE)
        .attr('x', d => x1(String(d.key)))
        .attr('width', x1.bandwidth())
        .attr('y', d => y(+d.value))
        .attr('height', d => (plot.h - y(+d.value)))
        .end();

    // 4) Update bottom axis to the series keys (simple bar x-domain) and show selected target label
    const axisP = g.select('.x-axis-bottom-line')
        .transition().duration(DUR_GEOM).ease(EASE)
        .call(d3.axisBottom(x1).tickSizeOuter(0))
        .end();

    // show which facet(target) is selected (e.g., age: 30)
    svg.selectAll('.target-caption').remove();
    svg.append('text')
        .attr('class', 'annotation target-caption')
        .attr('x', margins.left)
        .attr('y', margins.top - 16)
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', '#666')
        .text(`${facetField || 'target'}: ${facet}`);

    await Promise.all([fadeP, moveGroupP, geomP, axisP]);
    await selGroup.selectAll('rect')
        .transition().duration(200)
        .attr('opacity', 1)
        .end();
    return subset;
}


export async function groupedBarToSimpleByGroup(chartId, groupName, data) {
    const { svg, g } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    // 🔥 삭제: await waitForAttrClear(svg);
    resetBarsVisible(g);

    const series = String(groupName);
    const subset = Array.isArray(data) ? data.filter(d => String(d.group) === series) : [];
    if (subset.length === 0) {
        console.warn('groupedBarToSimpleByGroup: no data for group', series);
        return [];
    }

    const DUR_FADE = 500;
    const DUR_GEOM = 800;
    const EASE = d3.easeCubicOut;

    // 1) Fade out & remove other series bars
    const allRects = g.selectAll('rect');
    const keepRects = allRects.filter(d => d && String(d.key) === series);
    const dropRects = allRects.filter(d => !(d && String(d.key) === series));

    const fadeP = dropRects.transition().duration(DUR_FADE).ease(EASE).attr('opacity', 0).end()
        .then(() => { dropRects.remove(); });

    // 2) Normalize datum: category => facet value
    keepRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
        const cat = String(d.facet);
        const norm = { ...d, target: cat, value: +d.value, group: series, id: `${cat}-${series}` };
        rect.datum(norm)
            .attr('data-target', cat)
            .attr('data-group', series)
            .attr('data-id', norm.id);
    });

    // 3) Geometry: center the remaining bar within each facet group
    const facetW = widthOfFacet(g) || 0;
    const barW = keepRects.size() > 0 ? (+keepRects.node().getAttribute('width') || 0) : 0;
    const newX = Math.max(0, (facetW - barW) / 2);

    const geomP = keepRects.transition().duration(DUR_GEOM).ease(EASE)
        .attr('x', newX)
        .end();

    await Promise.all([fadeP, geomP]);
    await keepRects.transition().duration(200)
        .attr('opacity', 1)
        .end();
    return subset;
}

export async function groupedBarRetrieveValue(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarRetrieveValue(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    // 1. 찾으려는 데이터 조각(datum) 식별
    const filterOp = { target: op.target };
    if (op.group != null) filterOp.group = op.group;

    const selectedData = dataRetrieveValue(data, filterOp);
    if (!selectedData || selectedData.length === 0) {
        console.warn('RetrieveValue: Target not found for op:', op);
        return [];
    }
    const targetIds = new Set(selectedData.map(d => `${String(d.target)}::${String(d.group ?? '')}`));

    // 2. DOM에서 해당 막대 찾기
    const allRects = g.selectAll("rect");
    const targetRects = allRects.filter(function(d){
        const datum = d || d3.select(this).datum();
        const target = String(datum?.facet ?? datum?.target ?? this.getAttribute('data-target') ?? '');
        const group  = String(datum?.group ?? datum?.key ?? this.getAttribute('data-group') ?? '');
        return targetIds.has(`${target}::${group}`);
    });
    const otherRects = allRects.filter(function() {
        return !targetRects.nodes().includes(this);
    });

    if (targetRects.empty()) {
        console.warn('RetrieveValue: Target DOM element not found for', op);
        return selectedData;
    }

    // 3. 다른 막대는 흐리게, 대상 막대는 강조 (빠른 애니메이션)
    const hlColor = OP_COLORS.RETRIEVE_VALUE;
    await Promise.all([
        otherRects.transition().duration(300).attr("opacity", 0.2).end(),
        targetRects.transition().duration(300).attr("opacity", 1).attr("stroke", hlColor).attr("stroke-width", 2).end()
    ]);

    // 4. 수평선 가이드와 라벨 추가 (라인 transition 완료까지 대기)
    const yMax = d3.max(data, d => +d.value) || 0;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const anims = [];

    targetRects.each(function() {
        const d = d3.select(this).datum();
        const value = d ? d.value : null;
        if (value == null) return;

        const pos = absCenter(svg, this);
        const yPos = margins.top + yScale(value);

        const lineP = svg.append("line")
            .attr("class", "annotation retrieve-line")
            .attr("x1", margins.left).attr("y1", yPos)
            .attr("x2", margins.left).attr("y2", yPos)
            .attr("stroke", hlColor).attr("stroke-width", 2).attr("stroke-dasharray", "5 5")
            .transition().duration(450)
            .attr("x2", pos.x)
            .end();

        anims.push(lineP);

        svg.append("text")
            .attr("class", "annotation value-tag")
            .attr("x", pos.x)
            .attr("y", pos.y - 8)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .attr("font-weight", "bold")
            .attr("fill", hlColor)
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(fmtNum(value));
    });

    // 라인 그려지기 완료 보장
    await Promise.all(anims);

    return asDatumValues(selectedData, {
        categoryField: 'target',
        measureField: yField || 'value',
        idPrefix: 'retrieve'
    });
}

export async function groupedBarFilter(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarFilter(chartId, op, data, true);
    }
    const { svg, g, margins, plot, xField, yField, facetField } = getSvgAndSetup(chartId);
    await waitForAttrClear(svg);
    resetBarsVisible(g);
    svg.attr('data-filtering', '1');

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('groupedBarFilter: no data for group', subgroup);
            svg.attr('data-filtering', null);
            return [];
        }

        await groupedBarToSimpleByGroup(chartId, subgroup, data);

        const numericOps = new Set(['>', '>=', '<', '<=']);
        const yMaxAll = d3.max(subset, d => d.value) || 0;
        const yScale = d3.scaleLinear().domain([0, yMaxAll]).nice().range([plot.h, 0]);
        if (numericOps.has(op.operator)) {
            svg.selectAll('.threshold-line, .threshold-label').remove();
            const yVal = +op.value;
            const yPix = margins.top + yScale(yVal);
            const thLine = svg.append('line')
                .attr('class', 'threshold-line')
                .attr('x1', margins.left).attr('x2', margins.left)
                .attr('y1', yPix).attr('y2', yPix)
                .attr('stroke', OP_COLORS.FILTER_THRESHOLD).attr('stroke-width', 2).attr('stroke-dasharray', '5 5');
            const thText = svg.append('text')
                .attr('class', 'threshold-label')
                .attr('x', margins.left + plot.w + 6).attr('y', yPix)
                .attr('dominant-baseline', 'middle').attr('fill', OP_COLORS.FILTER_THRESHOLD)
                .attr('font-size', 12).attr('font-weight', 'bold')
                .attr('opacity', 0)
                .text(`${op.operator} ${fmtNum(yVal)}`);
            await thLine.transition().duration(1200).ease(d3.easeCubicInOut)
                .attr('x2', margins.left + plot.w).end();
            await thText.transition().duration(500).attr('opacity', 1).end();
        }

        const cmp = cmpMap[op.operator];
        let filteredSubset = subset.slice();
        if (cmp) {
            filteredSubset = subset.filter(d => cmp(+d.value, +op.value));
        } else if (op.operator === 'in' || op.operator === 'not-in') {
            const set = new Set((Array.isArray(op.value) ? op.value : [op.value]).map(String));
            const keep = (v) => set.has(String(v));
            filteredSubset = (op.operator === 'in') ? subset.filter(d => keep(d.target)) : subset.filter(d => !keep(d.target));
        } else if (op.operator === 'contains') {
            const needles = (Array.isArray(op.value) ? op.value : [op.value]).map(v => String(v).toLowerCase());
            filteredSubset = subset.filter(d => needles.some(n => String(d.target).toLowerCase().includes(n)));
        }

        if (filteredSubset.length === 0) {
            console.warn('groupedBarFilter[group]: empty after filter', op);
            svg.append('text').attr('class', 'filter-label')
                .attr('x', margins.left).attr('y', margins.top - 10)
                .attr('font-size', 12).attr('font-weight', 'bold')
                .attr('fill', OP_COLORS.FILTER_THRESHOLD)
                .text('No data matches the filter.');
            svg.attr('data-filtering', null);
            return [];
        }

        const allowed = new Set(filteredSubset.map(d => `${String(d.target)}-${subgroup}`));
        const bars = g.selectAll('rect');
        const keepSel = bars.filter(function(d) {
            const t = (d && d.target != null) ? String(d.target) : this.getAttribute('data-target');
            const gval = (d && d.group  != null) ? String(d.group)  : this.getAttribute('data-group');
            return allowed.has(`${t}-${subgroup}`) || allowed.has(`${t}-${gval}`);
        });
        const keepNodes = new Set(keepSel.nodes());
        const dropSel = bars.filter(function() { return !keepNodes.has(this); });

        const keptTargets = [...new Set(filteredSubset.map(d => String(d.target)))];
        const allFacetGroups = g.selectAll('[class^="facet-group-"]');
        const dropGroups = allFacetGroups.filter(function() {
            const cls = this.getAttribute('class') || '';
            const fv = cls.replace(/^facet-group-/, '');
            return !keptTargets.includes(String(fv));
        });

        await Promise.all([
            dropSel.transition().duration(1200).ease(d3.easeCubicInOut).attr('opacity', 0).remove().end(),
            dropGroups.transition().duration(1200).ease(d3.easeCubicInOut).attr('opacity', 0).remove().end()
        ]);

        const x0 = d3.scaleBand().domain(keptTargets).range([0, plot.w]).paddingInner(0.2);

        const moveFacetPromises = [];
        keptTargets.forEach(fv => {
            const groupSel = g.select(`.facet-group-${cssEscape(String(fv))}`);
            if (!groupSel.empty()) {
                moveFacetPromises.push(
                    groupSel.transition().duration(900).ease(d3.easeCubicInOut)
                        .attr('transform', `translate(${x0(fv)},0)`).end()
                );
            }
        });

        const barW = Math.max(1, x0.bandwidth() * 0.6);
        const geomP = keepSel.transition().duration(900).ease(d3.easeCubicInOut)
            .attr('x', (d) => (x0.bandwidth() - barW) / 2)
            .attr('width', barW)
            .attr('y', d => yScale(+d.value))
            .attr('height', d => plot.h - yScale(+d.value))
            .end();

        const xAxisP = g.select('.x-axis-bottom-line').transition().duration(900)
            .call(d3.axisBottom(x0).tickSizeOuter(0)).end();
        const yAxisP = g.select('.y-axis').transition().duration(900)
            .call(d3.axisLeft(yScale)).end();

        await Promise.all([...moveFacetPromises, geomP, xAxisP, yAxisP]);

        svg.attr('data-filtering', null);
        return asDatumValues(filteredSubset, { categoryField: facetField || 'target', measureField: yField || 'value', idPrefix: 'filter' });
    }

    clearAllAnnotations(svg);

    const matchColor = OP_COLORS.FILTER_MATCH;
    let filteredData = [];
    const numericOps = new Set(['>', '>=', '<', '<=']);

    if (op.field === yField && numericOps.has(op.operator)) {
        const inGroup = (d) => (op.group == null) ? true : (String(d.group) === String(op.group));
        const sumsByFacet = d3.rollup(
            data.filter(inGroup),
            v => d3.sum(v, d => d.value),
            d => d.target
        );
        const facetsToKeep = new Set();
        const cmp = cmpMap[op.operator];
        if (cmp) {
            sumsByFacet.forEach((sum, facet) => {
                if (cmp(sum, op.value)) facetsToKeep.add(facet);
            });
        }
        filteredData = data.filter(d => facetsToKeep.has(d.target) && inGroup(d));
    } else {
        const effectiveOp = { ...op };
        if (data.length > 0) {
            const sample = data[0];
            if (op.field === sample.category) effectiveOp.field = 'target';
            else if (op.field === xField)     effectiveOp.field = 'group';
        }
        filteredData = dataFilter(data, effectiveOp);
    }

    if (numericOps.has(op.operator)) {
        const fullYScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.value)])
            .nice().range([plot.h, 0]);

        svg.selectAll('.threshold-line, .threshold-label').remove();
        const yVal = +op.value;
        const yPix = margins.top + fullYScale(yVal);

        const thLine = svg.append('line')
            .attr('class', 'threshold-line')
            .attr('x1', margins.left).attr('x2', margins.left)
            .attr('y1', yPix).attr('y2', yPix)
            .attr('stroke', OP_COLORS.FILTER_THRESHOLD).attr('stroke-width', 2).attr('stroke-dasharray', '5 5');

        const thText = svg.append('text')
            .attr('class', 'threshold-label')
            .attr('x', margins.left + plot.w + 6).attr('y', yPix)
            .attr('dominant-baseline', 'middle').attr('fill', OP_COLORS.FILTER_THRESHOLD)
            .attr('font-size', 12).attr('font-weight', 'bold')
            .attr('opacity', 0)
            .text(`${op.operator} ${fmtNum(yVal)}`);

        await thLine.transition().duration(1200).ease(d3.easeCubicInOut)
            .attr('x2', margins.left + plot.w).end();
        await thText.transition().duration(500).attr('opacity', 1).end();
    }

    if (filteredData.length === 0) {
        await g.selectAll('rect').transition().duration(400).attr('opacity', 0).remove().end();
        await svg.append('text').attr('class', 'filter-label')
            .attr('x', margins.left).attr('y', margins.top - 10)
            .text('No data matches the filter.');
        svg.attr('data-filtering', null);
        return [];
    }

    const allowedIds = new Set(filteredData.map(d => `${d.target}-${d.group}`));
    const keepSel = g.selectAll('rect').filter(d => allowedIds.has(`${d.facet}-${d.key}`));
    const dropSel = g.selectAll('rect').filter(d => !allowedIds.has(`${d.facet}-${d.key}`));

    const keptFacets = [...new Set(filteredData.map(d => d.target))];
    const keptKeys   = [...new Set(filteredData.map(d => d.group))];

    const allFacetGroups = g.selectAll('[class^="facet-group-"]');
    const dropGroups = allFacetGroups.filter(function() {
        const cls = this.getAttribute('class') || '';
        const fv = cls.replace(/^facet-group-/, '');
        return !keptFacets.includes(String(fv));
    });

    await Promise.all([
        dropSel.transition().duration(1200).ease(d3.easeCubicInOut).attr('opacity', 0).remove().end(),
        dropGroups.transition().duration(1200).ease(d3.easeCubicInOut).attr('opacity', 0).remove().end()
    ]);

    const yMax = d3.max(filteredData, d => d.value) || 1;
    const x0 = d3.scaleBand().domain(keptFacets).range([0, plot.w]).paddingInner(0.2);
    const x1 = d3.scaleBand().domain(keptKeys).range([0, x0.bandwidth()]).padding(0.05);
    const y  = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    const moveFacetPromises = [];
    keptFacets.forEach(fv => {
        const groupSel = g.select(`.facet-group-${cssEscape(String(fv))}`);
        if (!groupSel.empty()) {
            moveFacetPromises.push(
                groupSel.transition().duration(900).ease(d3.easeCubicInOut)
                    .attr('transform', `translate(${x0(fv)},0)`).end()
            );
        }
    });

    const geomP = keepSel.transition().duration(900).ease(d3.easeCubicInOut)
        .attr('x', d => x1(d.key))
        .attr('width', x1.bandwidth())
        .attr('y', d => y(d.value))
        .attr('height', d => plot.h - y(d.value))
        .end();

    const yAxisP = g.select('.y-axis').transition().duration(900).call(d3.axisLeft(y)).end();
    const xAxisP = g.select('.x-axis-bottom-line').transition().duration(900).call(d3.axisBottom(x0).tickSizeOuter(0)).end();

    await Promise.all([...moveFacetPromises, geomP, yAxisP, xAxisP]);

    const labelText = (() => {
        if (op.operator === 'in' || op.operator === 'not-in') {
            const arr = Array.isArray(op.value) ? op.value : [op.value];
            return `Filter: ${op.field} ${op.operator} [${arr.join(', ')}]`;
        }
        return `Filter: ${op.field} ${op.operator} ${op.value}`;
    })();

    svg.append('text').attr('class', 'filter-label')
        .attr('x', margins.left).attr('y', margins.top - 10)
        .attr('font-size', 12).attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.FILTER_THRESHOLD)
        .text(labelText);

    svg.attr('data-filtering', null);
    return asDatumValues(filteredData, { categoryField: facetField || 'target', measureField: yField || 'value', idPrefix: 'filter' });
}

export async function groupedBarFindExtremum(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarFindExtremum(chartId, op, data, true);
    }
        if (isSimplifiedData(data)) {
        console.log('Data is already simplified, delegating to simpleBarFindExtremum');
        return await simpleBarFindExtremum(chartId, op, data, false);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    await waitForAttrClear(svg);
    resetBarsVisible(g);
    svg.attr('data-filtering', '1');

    let workingData = data;
    if (op && op.group != null && op.group !== '') {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('FindExtremum: no data for group', subgroup);
            svg.attr('data-filtering', null);
            return [];
        }
        await groupedBarToSimpleByGroup(chartId, subgroup, data);
        workingData = subset;
    }

    const targetDatum = dataFindExtremum(workingData, op, facetField, yField);
    clearAllAnnotations(svg);
    const hlColor = OP_COLORS.EXTREMUM;

    await g.selectAll("rect")
        .transition().duration(300)
        .attr("opacity", 1)
        .attr("stroke", "none")
        .end();

    if (!targetDatum) {
        console.warn("FindExtremum: Could not find target datum for:", op);
        svg.attr('data-filtering', null);
        return [];
    }

    const targetNode = findRectByTuple(g, { facet: targetDatum.target, key: targetDatum.group });
    if (!targetNode) {
        console.warn("FindExtremum: Target DOM element not found for datum:", targetDatum);
        svg.attr('data-filtering', null);
        return [targetDatum];
    }

    const extremumValue = targetDatum.value;
    const targetRect = d3.select(targetNode);
    const otherRects = g.selectAll("rect").filter(function() { return this !== targetNode; });

    await Promise.all([
        otherRects.transition().duration(800).attr("opacity", 0.2).end(),
        targetRect.transition().duration(800).attr("opacity", 1).attr("fill", hlColor).end()
    ]);

    const yMax = d3.max(data, d => d.value);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const yPos = margins.top + y(extremumValue);

    const lineP = svg.append("line").attr("class", "annotation")
        .attr("x1", margins.left).attr("y1", yPos)
        .attr("x2", margins.left).attr("y2", yPos)
        .attr("stroke", hlColor).attr("stroke-dasharray", "5 5")
        .transition().duration(1000)
        .attr("x2", margins.left + plot.w)
        .end();

    const textP = svg.append("text").attr("class", "annotation")
        .attr("x", margins.left + plot.w - 8).attr("y", yPos - 8)
        .attr("text-anchor", "end").attr("fill", hlColor).attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(`${op.which || 'max'}: ${fmtNum(extremumValue)}`)
        .attr("opacity", 0).transition().delay(300).duration(700).attr("opacity", 1)
        .end();

    await Promise.all([lineP, textP]);

    svg.attr('data-filtering', null);
    return asDatumValues([targetDatum], { categoryField: facetField || 'target', measureField: yField || 'value', idPrefix: 'extremum' });
}

export async function groupedBarDetermineRange(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarDetermineRange(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);

    let workingData = data;
    const hasGroup = op.group != null && op.group !== '';
    if (hasGroup) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('DetermineRange: No data for group', subgroup);
            return null;
        }
        await groupedBarToSimpleByGroup(chartId, subgroup, data);
        workingData = subset;
        resetBarsVisible(g);
    }

    const values = workingData.map(d => d.value);
    const minV = d3.min(values);
    const maxV = d3.max(values);
    const result = new IntervalValue(hasGroup ? op.group : facetField, minV, maxV);

    const yMaxGlobal = d3.max(data, r => r.value);
    const y = d3.scaleLinear().domain([0, yMaxGlobal]).nice().range([plot.h, 0]);
    const hlColor = OP_COLORS.RANGE;
    const DIM = 0.3;  // 🔥 추가: 흐리게 할 opacity
    const HI = 1.0;   // 🔥 추가: 강조할 opacity

    const animationPromises = [];

    // 🔥 simpleBar와 동일: min/max 막대 찾기
    const findBars = (val) => g.selectAll('rect').filter(d => {
        if (!d) return false;
        return +d.value === val;
    });

    const minBars = findBars(minV);
    const maxBars = findBars(maxV);

    // 🔥 추가: 다른 막대들 찾기
    const otherBars = g.selectAll('rect').filter(d => {
        if (!d) return false;
        return d.value !== minV && d.value !== maxV;
    });

    // 🔥 추가: 다른 막대들 흐리게 (700ms)
    animationPromises.push(
        otherBars.transition().duration(700).attr('opacity', DIM).end()
    );

    // 🔥 simpleBar와 동일: 막대 색상 변경 + 강조 (600ms → 700ms로 통일)
    animationPromises.push(
        minBars.transition().duration(700).attr('opacity', HI).attr('stroke', hlColor).attr('stroke-width', 2).end()
    );
    animationPromises.push(
        maxBars.transition().duration(700).attr('opacity', HI).attr('stroke', hlColor).attr('stroke-width', 2).end()
    );

    // 🔥 simpleBar와 동일: 수평선 그리기 (800ms)
    [
        { value: minV, label: "Min", bars: minBars },
        { value: maxV, label: "Max", bars: maxBars }
    ].forEach(item => {
        if (item.value === undefined) return;
        const yPos = margins.top + y(item.value);
        
        const line = svg.append("line").attr("class", "annotation range-line")
            .attr("x1", margins.left).attr("x2", margins.left)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", hlColor)
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5 5");

        animationPromises.push(
            line.transition().duration(800).attr("x2", margins.left + plot.w).end()
        );

        // 🔥 simpleBar와 동일: 각 막대에 라벨 추가 (400ms delay, 400ms duration)
        item.bars.each(function() {
            const { x, y } = absCenter(svg, this);
            
            const text = svg.append("text").attr("class", "annotation")
                .attr("x", x).attr("y", y)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("font-weight", "bold")
                .attr("fill", hlColor)
                .attr("stroke", "white")
                .attr("stroke-width", 3)
                .attr("paint-order", "stroke")
                .text(`${item.label}: ${fmtNum(item.value)}`)
                .attr("opacity", 0);

            animationPromises.push(
                text.transition().delay(400).duration(400).attr("opacity", 1).end()
            );
        });
    });

    // 🔥 모든 애니메이션 대기
    await Promise.all(animationPromises);

    return result;
}

export async function groupedBarCompare(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarCompare(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);
    svg.attr('data-filtering', '1');

    const isObjA = op && typeof op.targetA === 'object' && op.targetA !== null;
    const isObjB = op && typeof op.targetB === 'object' && op.targetB !== null;

    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;

    const drawAnnotation = (node, value, color) => {
        const pos = absCenter(svg, node);
        const y = pos.y;
        const p1 = svg.append("line")
            .attr("class", "annotation compare-hline")
            .attr("x1", margins.left).attr("y1", y)
            .attr("x2", margins.left).attr("y2", y)
            .attr("stroke", color).attr("stroke-dasharray", "5 5")
            .transition().duration(450)
            .attr("x2", margins.left + plot.w)
            .end();
        const p2 = svg.append("text")
            .attr("class", "annotation compare-value")
            .attr("x", pos.x).attr("y", y - 8)
            .attr("text-anchor", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(value))
            .attr("opacity", 0)
            .transition().duration(350).attr("opacity", 1)
            .end();
        return [p1, p2];
    };

    if (!isObjA && !isObjB && op && op.group != null && op.group !== '') {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('groupedBarCompare[group]: no data for group', subgroup);
            svg.attr('data-filtering', null);
            return [];
        }

        await groupedBarToSimpleByGroup(chartId, subgroup, data);

        const AFacet = String(op.targetA);
        const BFacet = String(op.targetB);

        const nodeA = findRectByTuple(g, { facet: AFacet, key: subgroup });
        const nodeB = findRectByTuple(g, { facet: BFacet, key: subgroup });

        if (!nodeA || !nodeB) {
            console.warn('groupedBarCompare[group]: One or both DOM elements not found', { AFacet, BFacet, subgroup });
            svg.attr('data-filtering', null);
            return [];
        }

        const datumA = d3.select(nodeA).datum();
        const datumB = d3.select(nodeB).datum();

        const otherBars = g.selectAll('rect').filter(function() { return this !== nodeA && this !== nodeB; });
        await Promise.all([
            otherBars.transition().duration(500).attr('opacity', 0.2).end(),
            d3.select(nodeA).transition().duration(500).attr('opacity', 1).attr('stroke', colorA).attr('stroke-width', 2).end(),
            d3.select(nodeB).transition().duration(500).attr('opacity', 1).attr('stroke', colorB).attr('stroke-width', 2).end(),
        ]);

        const ann = [];
        ann.push(...drawAnnotation(nodeA, datumA.value, colorA));
        ann.push(...drawAnnotation(nodeB, datumB.value, colorB));
        await Promise.all(ann);

        const wantMax = (op.which || 'max') === 'max';
        const winnerFacet = (wantMax ? (datumA.value >= datumB.value) : (datumA.value <= datumB.value)) ? AFacet : BFacet;
        const winnerValue = winnerFacet === AFacet ? datumA.value : datumB.value;

        const summary = `${wantMax ? 'Max' : 'Min'} within ${subgroup}: ${winnerFacet} (${fmtNum(winnerValue)})`;
        svg.append('text').attr('class', 'annotation compare-summary')
            .attr('x', margins.left).attr('y', margins.top - 28)
            .attr('font-size', 12).attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text(summary);

        const winnerDatum = new DatumValue(
            facetField, yField, winnerFacet, subgroup, winnerValue, `${winnerFacet}-${subgroup}`
        );

        svg.attr('data-filtering', null);
        return [winnerDatum];
    }

    if (isObjA && isObjB && ('category' in op.targetA) && ('series' in op.targetA) && ('category' in op.targetB) && ('series' in op.targetB)) {
        const opForCompare = {
            targetA: { target: op.targetA.category, group: op.targetA.series },
            targetB: { target: op.targetB.category, group: op.targetB.series },
            operator: op.operator,
            which: op.which
        };
        const winner = dataCompare(data, opForCompare);

        const nodeA = findRectByTuple(g, { facet: op.targetA.category, key: op.targetA.series });
        const nodeB = findRectByTuple(g, { facet: op.targetB.category, key: op.targetB.series });

        if (!nodeA || !nodeB) {
            console.warn("groupedBarCompare: One or both DOM elements not found", op);
            svg.attr('data-filtering', null);
            return winner ? [winner] : [];
        }

        const datumA = d3.select(nodeA).datum();
        const datumB = d3.select(nodeB).datum();
        const otherBars = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });

        await Promise.all([
            otherBars.transition().duration(500).attr("opacity", 0.2).end(),
            d3.select(nodeA).transition().duration(500).attr("opacity", 1).attr("stroke", colorA).attr("stroke-width", 2).end(),
            d3.select(nodeB).transition().duration(500).attr("opacity", 1).attr("stroke", colorB).attr("stroke-width", 2).end(),
        ]);

        const ann = [];
        ann.push(...drawAnnotation(nodeA, datumA.value, colorA));
        ann.push(...drawAnnotation(nodeB, datumB.value, colorB));
        await Promise.all(ann);

        let summary;
        if (winner) {
            const winnerLabel = `${winner.target}(${winner.group})`;
            summary = `${op.which === 'min' ? 'Min' : 'Max'}: ${winnerLabel} (${fmtNum(winner.value)})`;
        } else {
            const labelA = `${op.targetA.category}(${op.targetA.series})`;
            const labelB = `${op.targetB.category}(${op.targetB.series})`;
            summary = `${labelA}: ${fmtNum(datumA.value)} vs ${labelB}: ${fmtNum(datumB.value)} (Tie)`;
        }

        svg.append("text").attr("class", "annotation compare-summary")
            .attr("x", margins.left).attr("y", margins.top - 28)
            .attr("font-size", 12).attr("font-weight", "bold")
            .attr("fill", "#333")
            .text(summary);

        svg.attr('data-filtering', null);
        return winner ? [winner] : [];
    }

    const AFacet = String(op.targetA);
    const BFacet = String(op.targetB);

    const sumByFacet = d3.rollup(
        data,
        v => d3.sum(v, d => +d.value),
        d => String(d.target)
    );

    const sumA = sumByFacet.get(AFacet);
    const sumB = sumByFacet.get(BFacet);

    if (sumA == null || sumB == null) {
        console.warn('compare(facet-level): one or both facets not found', { AFacet, BFacet, sums: [sumA, sumB] });
        svg.attr('data-filtering', null);
        return [];
    }

    const wantMax = (op.which || 'max') === 'max';
    const winnerFacet = (wantMax ? (sumA >= sumB) : (sumA <= sumB)) ? AFacet : BFacet;
    const winnerSum = winnerFacet === AFacet ? sumA : sumB;

    const bars = g.selectAll('rect');
    const barsA = bars.filter(d => d && String(d.facet) === AFacet);
    const barsB = bars.filter(d => d && String(d.facet) === BFacet);
    const others = bars.filter(function() {
        const d = d3.select(this).datum();
        const f = d && d.facet != null ? String(d.facet) : null;
        return f !== AFacet && f !== BFacet;
    });

    await Promise.all([
        others.transition().duration(500).attr('opacity', 0.2).end(),
        barsA.transition().duration(500).attr('opacity', 1).attr('stroke', colorA).attr('stroke-width', 2).end(),
        barsB.transition().duration(500).attr('opacity', 1).attr('stroke', colorB).attr('stroke-width', 2).end(),
    ]);

    const ann = [];
    barsA.each(function() { const d = d3.select(this).datum(); ann.push(...drawAnnotation(this, d.value, colorA)); });
    barsB.each(function() { const d = d3.select(this).datum(); ann.push(...drawAnnotation(this, d.value, colorB)); });
    await Promise.all(ann);

    const summary = `${wantMax ? 'Max' : 'Min'}: ${winnerFacet} (A=${fmtNum(sumA)} vs B=${fmtNum(sumB)})`;
    svg.append("text").attr("class", "annotation compare-summary")
        .attr("x", margins.left).attr("y", margins.top - 28)
        .attr("font-size", 12).attr("font-weight", "bold")
        .attr("fill", "#333")
        .text(summary);

    const winnerDatum = new DatumValue(
        facetField, yField, winnerFacet, null, winnerSum, `${winnerFacet}-sum`
    );
    svg.attr('data-filtering', null);
    return [winnerDatum];
}

export async function groupedBarCompareBool(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarCompareBool(chartId, op, data, true);
    }
    const { svg, g, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const opForCompare = {
        targetA: (typeof op.targetA === 'object') ? { target: op.targetA.category, group: op.targetA.series } : { target: String(op.targetA), group: op.group || null },
        targetB: (typeof op.targetB === 'object') ? { target: op.targetB.category, group: op.targetB.series } : { target: String(op.targetB), group: op.group || null },
        operator: op.operator
    };
    const compareResult = dataCompareBool(data, opForCompare);
    if (compareResult === null) {
        console.warn("groupedBarCompareBool: Comparison failed", op);
        return null;
    }
    const result = compareResult.bool;

    const nodeA = findRectByTuple(g, { facet: opForCompare.targetA.target, key: opForCompare.targetA.group });
    const nodeB = findRectByTuple(g, { facet: opForCompare.targetB.target, key: opForCompare.targetB.group });

    if (!nodeA || !nodeB) {
        console.warn("groupedBarCompareBool: One or both DOM elements not found", op);
        return compareResult;
    }

    const datumA = d3.select(nodeA).datum();
    const datumB = d3.select(nodeB).datum();
    const otherBars = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });
    const colorA = OP_COLORS.COMPARE_A;
    const colorB = OP_COLORS.COMPARE_B;

    await Promise.all([
        otherBars.transition().duration(300).attr("opacity", 0.2).end(),
        d3.select(nodeA).transition().duration(300).attr("opacity", 1).attr("stroke", colorA).attr("stroke-width", 2).end(),
        d3.select(nodeB).transition().duration(300).attr("opacity", 1).attr("stroke", colorB).attr("stroke-width", 2).end()
    ]);

    const drawAnnotation = (node, value, color) => {
        const pos = absCenter(svg, node);
        const y = pos.y;
        const p1 = svg.append("line")
            .attr("class", "annotation compare-hline")
            .attr("x1", margins.left).attr("y1", y)
            .attr("x2", margins.left).attr("y2", y)
            .attr("stroke", color).attr("stroke-dasharray", "5 5")
            .transition().duration(450)
            .attr("x2", margins.left + plot.w)
            .end();
        const p2 = svg.append("text")
            .attr("class", "annotation compare-value")
            .attr("x", pos.x).attr("y", y - 8)
            .attr("text-anchor", "middle")
            .attr("fill", color).attr("font-weight", "bold")
            .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
            .text(fmtNum(value))
            .attr("opacity", 0)
            .transition().duration(350).attr("opacity", 1)
            .end();
        return [p1, p2];
    };

    const ann = [];
    ann.push(...drawAnnotation(nodeA, datumA.value, colorA));
    ann.push(...drawAnnotation(nodeB, datumB.value, colorB));
    await Promise.all(ann);

    const symbol = { '>': ' > ', '>=': ' >= ', '<': ' < ', '<=': ' <= ', '==': ' == ', '!=': ' != ' }[op.operator] || ` ${op.operator} `;
    const summary = `${fmtNum(datumA.value)}${symbol}${fmtNum(datumB.value)} → ${result}`;

    svg.append("text").attr("class", "annotation compare-summary")
        .attr("x", margins.left + plot.w / 2).attr("y", margins.top - 10)
        .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", "bold")
        .attr("fill", result ? OP_COLORS.TRUE : OP_COLORS.FALSE)
        .text(summary);

    const boolLabel = op.field || compareResult?.category || 'value';
    const boolDatum = new BoolValue(boolLabel, result, compareResult?.id ?? null);
    return [boolDatum];
}

export async function groupedBarSort(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarSort(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);

    // 🔥 group이 있으면: simple bar로 변환 후 직접 정렬
    if (op && op.group != null && op.group !== '') {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        
        if (subset.length === 0) {
            console.warn('groupedBarSort: no data for group', subgroup);
            return [];
        }
        
        // Simple bar로 변환
        await groupedBarToSimpleByGroup(chartId, subgroup, data);
        
        // 🔥 추가: 모든 facet group의 transform을 0으로 초기화
        const allFacetGroups = g.selectAll('[class^="facet-group-"]');
        allFacetGroups.each(function() {
            const groupSel = d3.select(this);
            const currentTransform = groupSel.attr('transform');
            
            // 현재 transform에서 x 오프셋 추출
            const match = /translate\(([-\d.]+)/.exec(currentTransform);
            const offsetX = match ? +match[1] : 0;
            
            // 각 막대의 x를 절대 좌표로 변환
            groupSel.selectAll('rect').each(function() {
                const rect = d3.select(this);
                const currentX = +rect.attr('x') || 0;
                rect.attr('x', offsetX + currentX);
            });
            
            // group의 transform을 0으로
            groupSel.attr('transform', 'translate(0,0)');
        });
        
        // 정렬
        const orderAsc = (op?.order ?? 'asc') === 'asc';
        const sortedSubset = subset.slice().sort((a, b) => {
            const valA = +a.value;
            const valB = +b.value;
            return orderAsc ? (valA - valB) : (valB - valA);
        });
        
        // 정렬된 target 순서
        const sortedTargets = sortedSubset.map(d => String(d.target));
        
        // 새로운 x 스케일
        const xScale = d3.scaleBand()
            .domain(sortedTargets)
            .range([0, plot.w])
            .padding(0.2);
        
        // 막대들 찾기
        const bars = g.selectAll('rect');
        
        // 막대 위치 애니메이션
        const barTransition = bars.transition().duration(1000)
            .attr('x', function() {
                const rect = d3.select(this);
                const datum = rect.datum();
                const target = datum?.target || rect.attr('data-target');
                return xScale(String(target));
            })
            .attr('width', xScale.bandwidth())
            .end();
        
        // x축 업데이트
        const xAxisTransition = g.select('.x-axis-bottom-line')
            .transition().duration(1000)
            .call(d3.axisBottom(xScale).tickSizeOuter(0))
            .end();
        
        await Promise.all([barTransition, xAxisTransition]);
        
        return sortedSubset;
    }

    // group이 없으면: facet 레벨 정렬
    const sumByFacet = d3.rollup(
        data,
        v => d3.sum(v, d => +d.value),
        d => String(d.target)
    );

    const sortedFacets = Array.from(sumByFacet.entries())
        .sort((a, b) => {
            const orderAsc = (op?.order ?? 'asc') === 'asc';
            return orderAsc ? (a[1] - b[1]) : (b[1] - a[1]);
        })
        .map(entry => entry[0]);

    const x0 = d3.scaleBand()
        .domain(sortedFacets)
        .range([0, plot.w])
        .paddingInner(0.2);

    const moveFacetPromises = [];
    const allFacetGroups = g.selectAll('[class^="facet-group-"]');
    
    allFacetGroups.each(function() {
        const groupNode = this;
        const className = groupNode.getAttribute('class') || '';
        const facetValue = className.replace('facet-group-', '').trim();
        
        if (sortedFacets.includes(facetValue)) {
            const newX = x0(facetValue);
            const groupSel = d3.select(groupNode);
            moveFacetPromises.push(
                groupSel.transition().duration(1000).ease(d3.easeCubicInOut)
                    .attr('transform', `translate(${newX},0)`)
                    .end()
            );
        }
    });

    const xAxisP = g.select('.x-axis-bottom-line')
        .transition().duration(1000)
        .call(d3.axisBottom(x0).tickSizeOuter(0))
        .end();

    await Promise.all([...moveFacetPromises, xAxisP]);

    const sortedData = [];
    sortedFacets.forEach(facet => {
        const facetData = data.filter(d => String(d.target) === facet);
        sortedData.push(...facetData);
    });

    return sortedData;
}

export async function groupedBarSum(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarSum(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('groupedBarSum: no data for group', subgroup);
            return [];
        }
        
        await groupedBarToSimpleByGroup(chartId, subgroup, data);

        // 🔥 모든 facet group의 transform을 0으로 초기화
        const allFacetGroups = g.selectAll('[class^="facet-group-"]');
        allFacetGroups.each(function() {
            const groupSel = d3.select(this);
            const currentTransform = groupSel.attr('transform');
            const match = /translate\(([-\d.]+)/.exec(currentTransform);
            const offsetX = match ? +match[1] : 0;
            
            groupSel.selectAll('rect').each(function() {
                const rect = d3.select(this);
                const currentX = +rect.attr('x') || 0;
                rect.attr('x', offsetX + currentX);
            });
            
            groupSel.attr('transform', 'translate(0,0)');
        });

        // 🔥 y축 클래스 확인 및 통일
        if (svg.select('.y-axis').empty()) {
            const cand = svg.select('.y-axis-left-line');
            if (!cand.empty()) cand.classed('y-axis', true);
        }

        const op2 = { ...op };
        delete op2.group;

        const result = dataSum(subset, op2, facetField, yField);
        if (!result) {
            console.warn('groupedBarSum[group]: dataSum returned empty for', subgroup);
            return [];
        }

        const sumDatum = new DatumValue(
            result.category, result.measure, result.target,
            result.group, result.value, result.id
        );

        const totalSum = +sumDatum.value;
        if (!Number.isFinite(totalSum)) {
            return [sumDatum];
        }

        // 🔥 새로운 y 스케일
        const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);
        
        // y축 업데이트
        const yAxisTransition = svg.select('.y-axis')
            .transition().duration(1000)
            .call(d3.axisLeft(newYScale))
            .end();

        // 🔥 모든 막대를 쌓기
        const bars = g.selectAll('rect');
        const barWidth = bars.size() > 0 ? +(bars.node().getAttribute('width') || 0) : 20;
        const targetX = plot.w / 2 - barWidth / 2;
        
        let runningTotal = 0;
        const stackPromises = [];

        bars.each(function() {
            const rect = d3.select(this);
            const d = rect.datum();
            const value = (d && Number.isFinite(+d.value)) ? +d.value : 0;
            
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

        // 🔥 최종 합계 라인과 라벨
        const finalY = newYScale(totalSum);
        svg.append('line').attr('class', 'annotation value-line')
            .attr('x1', margins.left).attr('y1', margins.top + finalY)
            .attr('x2', margins.left + plot.w).attr('y2', margins.top + finalY)
            .attr('stroke', OP_COLORS.SUM).attr('stroke-width', 2).attr('stroke-dasharray', '5 5');

        svg.append('text').attr('class', 'annotation value-tag')
            .attr('x', margins.left + plot.w / 2).attr('y', margins.top + finalY - 8)
            .attr('text-anchor', 'middle').attr('font-size', 12)
            .attr('fill', OP_COLORS.SUM).attr('font-weight', 'bold')
            .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
            .text(`Sum: ${fmtNum(totalSum)}`);

        return [sumDatum];
    }

    // 🔥 group이 없을 때 (전체 sum)
    const result = dataSum(data, op, facetField, yField);
    if (!result) {
        console.warn("Sum could not be calculated.");
        return [];
    }

    const sumDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, result.value, result.id
    );
    const totalSum = sumDatum.value;

    if (totalSum === 0) {
        console.warn("Sum is 0 or could not be calculated.");
        return [sumDatum];
    }

    const allRects = g.selectAll("rect");
    const color = OP_COLORS.SUM;

    const originalStates = [];
    allRects.each(function() {
        originalStates.push({
            node: this,
            datum: d3.select(this).datum(),
            groupX: readGroupX(this),
        });
    });

    const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);

    const yAxisTransition = svg.select(".y-axis").transition().duration(1200)
        .call(d3.axisLeft(newYScale))
        .end();

    let runningTotal = 0;
    const stackPromises = [];
    const barWidth = allRects.size() > 0 ? +allRects.node().getAttribute('width') : 20;
    const targetX = plot.w / 2 - barWidth / 2;

    originalStates.forEach(state => {
        const value = state.datum.value;
        const newX = targetX - state.groupX;
        const t = d3.select(state.node)
            .transition().duration(1500).ease(d3.easeCubicInOut)
            .attr("x", newX)
            .attr("width", barWidth)
            .attr("y", newYScale(runningTotal + value))
            .attr("height", newYScale(0) - newYScale(value))
            .end();
        stackPromises.push(t);
        runningTotal += value;
    });

    await Promise.all([yAxisTransition, ...stackPromises]);
    await delay(300);

    const yPos = margins.top + newYScale(totalSum);
    svg.append("line").attr("class", "annotation sum-line")
        .attr("x1", margins.left).attr("x2", margins.left + plot.w)
        .attr("y1", yPos).attr("y2", yPos).attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

    svg.append("text").attr("class", "annotation sum-label")
        .attr("x", margins.left + plot.w / 2).attr("y", yPos - 8)
        .attr("text-anchor", "middle").attr("fill", color).attr("font-weight", "bold").attr("font-size", 12)
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(`Sum: ${fmtNum(totalSum)}`);

    return [sumDatum];
}

export async function groupedBarAverage(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarAverage(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('groupedBarAverage: no data for group', subgroup);
            return [];
        }
        await groupedBarToSimpleByGroup(chartId, subgroup, data);
        const op2 = { ...op, field: 'value' };
        delete op2.group;
        return await simpleBarAverage(chartId, op2, subset, false);
    }

    const result = dataAverage(data, op, facetField, yField);
    if (!result) {
        console.warn('groupedBarAverage: Could not compute average.');
        return [];
    }

    const avgDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, result.value, result.id
    );
    const avgValue = avgDatum.value;
    const color = OP_COLORS.AVERAGE;

    const yMax = d3.max(data, d => d.value);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
    const yPos = margins.top + yScale(avgValue);

    const line = svg.append("line").attr("class", "annotation avg-line")
        .attr("x1", margins.left).attr("x2", margins.left)
        .attr("y1", yPos).attr("y2", yPos)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");

    await line.transition().duration(1200)
        .attr("x2", margins.left + plot.w)
        .end();

    const labelP = svg.append("text").attr("class", "annotation avg-label")
        .attr("x", margins.left + plot.w / 2)
        .attr("y", yPos - 8)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("fill", color)
        .attr("font-weight", "bold")
        .attr("stroke", "white").attr("stroke-width", 3).attr("paint-order", "stroke")
        .text(`Avg: ${fmtNum(avgValue)}`)
        .attr("opacity", 0)
        .transition().duration(700)
        .attr("opacity", 1)
        .end();

    await labelP;
    return [avgDatum];
}

export async function groupedBarNth(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarNth(chartId, op, data, true);
    }
    
    // 🔥 서수 변환 함수
    const getOrdinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);

    // 🔥 n을 배열로 처리 (단일 값이면 배열로 변환)
    const nValues = Array.isArray(op.n) ? op.n : [op.n ?? 1];
    const from = String(op?.from || 'left').toLowerCase();
    const hlColor = OP_COLORS.NTH;

    // 🔥 group이 있으면 simple bar로 변환 후 처리
    if (op && op.group != null && op.group !== '') {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        
        if (subset.length === 0) {
            console.warn('groupedBarNth: no data for group', subgroup);
            return [];
        }
        
        await groupedBarToSimpleByGroup(chartId, subgroup, data);
        
        // transform 초기화
        const allFacetGroups = g.selectAll('[class^="facet-group-"]');
        allFacetGroups.each(function() {
            const groupSel = d3.select(this);
            const currentTransform = groupSel.attr('transform');
            const match = /translate\(([-\d.]+)/.exec(currentTransform);
            const offsetX = match ? +match[1] : 0;
            
            groupSel.selectAll('rect').each(function() {
                const rect = d3.select(this);
                const currentX = +rect.attr('x') || 0;
                rect.attr('x', offsetX + currentX);
            });
            
            groupSel.attr('transform', 'translate(0,0)');
        });
        
        // 막대 정렬 (x 좌표 기준)
        const bars = g.selectAll('rect');
        const items = bars.nodes().map(node => {
            const x = +node.getAttribute('x') || 0;
            const datum = d3.select(node).datum();
            const target = datum?.target || node.getAttribute('data-target');
            const value = datum?.value || 0;
            return { node, x, target, value };
        });
        
        items.sort((a, b) => a.x - b.x);
        
        const seq = from === 'right' ? items.slice().reverse() : items;
        
        // 모든 막대 흐리게
        await bars.transition().duration(250).attr("opacity", 0.2).end();
        
        // y 스케일
        const yMax = d3.max(data, d => d.value);
        const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);
        
        // 🔥 1단계: 카운팅 애니메이션
        const countedBars = [];
        const maxN = Math.max(...nValues);
        const countLimit = Math.min(maxN, seq.length);

        for (let i = 0; i < countLimit; i++) {
            const item = seq[i];
            const sel = d3.select(item.node);
            
            countedBars.push({ 
                index: i + 1, 
                target: item.target, 
                selection: sel, 
                value: item.value,
                node: item.node
            });
            
            await sel.transition().duration(150).attr('opacity', 1).end();

            const { x, y } = absCenter(svg, item.node);
            
            await svg.append('text').attr('class', 'annotation count-label')
                .attr('x', x).attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('font-size', 14)
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1))
                .attr('opacity', 0)
                .transition().duration(150).attr('opacity', 1).end();
            
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
                item.selection.transition().duration(400).attr('fill', hlColor).attr('opacity', 1).end()
            );

            // 수평선
            const yPos = margins.top + yScale(item.value);
            lineTasks.push(
                svg.append('line').attr('class', 'annotation nth-line')
                    .attr('x1', margins.left).attr('y1', yPos)
                    .attr('x2', margins.left).attr('y2', yPos)
                    .attr('stroke', hlColor).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
                    .transition().duration(500).attr('x2', margins.left + plot.w).end()
            );

            // 값 표시 (서수 + 값)
            const { x, y } = absCenter(svg, item.node);
            
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
                    .attr('font-size', 11).attr('font-weight', 'bold').attr('fill', hlColor)
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
                    .attr('font-size', 12).attr('font-weight', 'bold').attr('fill', hlColor)
                    .text(valueText).attr('opacity', 0)
                    .transition().duration(400).attr('opacity', 1).end()
            );
        });

        await Promise.all([...highlightTasks]);
        await Promise.all([...lineTasks]);
        await Promise.all([...labelTasks]);

        const selectedTargets = nValues
            .filter(n => n <= countLimit)
            .map(n => countedBars.find(cb => cb.index === n)?.target)
            .filter(Boolean);
        
        const results = subset.filter(d => selectedTargets.includes(String(d.target)));
        return results;
    }

    // 🔥 group이 없으면: facet 레벨에서 nth 선택
    const facetGroups = [];
    g.selectAll('g').each(function() {
        const cls = (this.getAttribute('class') || '').split(/\s+/);
        const facetToken = cls.find(c => c.indexOf('facet-group-') === 0);
        if (!facetToken) return;
        const facet = facetToken.slice('facet-group-'.length);
        const tx = readGroupX(this) || 0;
        const facetData = data.filter(d => String(d.target) === facet);
        const totalValue = d3.sum(facetData, d => +d.value);
        facetGroups.push({ node: this, facet, x: tx, value: totalValue });
    });

    if (facetGroups.length === 0) {
        console.warn('groupedBarNth: no facet groups found');
        return [];
    }

    facetGroups.sort((a, b) => a.x - b.x);
    const seq = (from === 'right') ? facetGroups.slice().reverse() : facetGroups;

    const allRects = g.selectAll('rect');
    
    // 모든 막대 흐리게
    await allRects.transition().duration(250).attr('opacity', 0.2).end();
    
    // y 스케일
    const yMax = d3.max(data, d => d.value);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

    // 🔥 1단계: 카운팅 애니메이션
    const countedFacets = [];
    const maxN = Math.max(...nValues);
    const countLimit = Math.min(maxN, seq.length);

    for (let i = 0; i < countLimit; i++) {
        const facetItem = seq[i];
        const facetSelector = `.facet-group-${cssEscape(String(facetItem.facet))}`;
        const pickedGroup = g.select(facetSelector);
        const pickedRects = pickedGroup.selectAll('rect');
        
        countedFacets.push({
            index: i + 1,
            facet: facetItem.facet,
            selection: pickedRects,
            value: facetItem.value,
            group: pickedGroup
        });
        
        await pickedRects.transition().duration(150).attr('opacity', 1).end();

        // 각 막대에 카운트 표시
        pickedRects.each(function() {
            const { x, y } = absCenter(svg, this);
            svg.append('text').attr('class', 'annotation count-label')
                .attr('x', x).attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('font-size', 14)
                .attr('font-weight', 'bold')
                .attr('fill', hlColor)
                .attr('stroke', 'white')
                .attr('stroke-width', 3)
                .attr('paint-order', 'stroke')
                .text(String(i + 1))
                .attr('opacity', 0)
                .transition().duration(150).attr('opacity', 1);
        });
        
        await delay(100);
    }

    // 🔥 2단계: 선택되지 않은 것들 페이드아웃
    const selectedIndices = new Set(nValues.filter(n => n <= countLimit));
    const finals = [];
    
    countedFacets.forEach((item) => {
        if (!selectedIndices.has(item.index)) {
            finals.push(item.selection.transition().duration(300).attr('opacity', 0.2).end());
        }
    });
    finals.push(svg.selectAll('.count-label').transition().duration(300).attr('opacity', 0).remove().end());
    await Promise.all(finals);

   // 🔥 3단계: 선택된 것들 강조 + 수평선 + 서수/값 표시
const highlightTasks = [];
const lineTasks = [];
const labelTasks = [];

nValues.forEach(n => {
    if (n > countLimit) return;
    const item = countedFacets.find(cf => cf.index === n);
    if (!item) return;
    
    // 강조
    highlightTasks.push(
        item.selection.transition().duration(400).attr('fill', hlColor).attr('opacity', 1).end()
    );
    
    // 🔥 각 facet의 막대들에 대해 수평선 그리기
    item.selection.each(function() {
        const bar = this;
        const d = d3.select(bar).datum() || {};
        const barValue = Number.isFinite(+d.value) ? +d.value : 0;
        
        if (barValue > 0) {
            const yPos = margins.top + yScale(barValue);
            const { x } = absCenter(svg, bar);
            
            // 🔥 추가: 수평선 그리기 (각 막대마다)
            lineTasks.push(
                svg.append('line').attr('class', 'annotation nth-line')
                    .attr('x1', margins.left).attr('y1', yPos)
                    .attr('x2', margins.left).attr('y2', yPos)
                    .attr('stroke', hlColor).attr('stroke-width', 2).attr('stroke-dasharray', '5 5')
                    .transition().duration(500).attr('x2', x).end()
            );
        }
    });
    
    // 🔥 각 facet의 첫 번째 막대 위치에 서수/값 표시
    const firstBar = item.selection.node();
    if (!firstBar) return;
    
    const { x, y } = absCenter(svg, firstBar);
    
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
    
    // 서수 표시
    labelTasks.push(
        svg.append('text').attr('class', 'annotation value-tag')
            .attr('x', x).attr('y', y - 15).attr('text-anchor', 'middle')
            .attr('font-size', 11).attr('font-weight', 'bold').attr('fill', hlColor)
            .text(ordinalText).attr('opacity', 0)
            .transition().duration(400).attr('opacity', 1).end()
    );
    
    // 🔥 값 배경 (facet 전체 합계)
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
    
    // 값 표시 (facet 전체 합계)
    labelTasks.push(
        svg.append('text').attr('class', 'annotation value-tag')
            .attr('x', x).attr('y', y - 1).attr('text-anchor', 'middle')
            .attr('font-size', 12).attr('font-weight', 'bold').attr('fill', hlColor)
            .text(valueText).attr('opacity', 0)
            .transition().duration(400).attr('opacity', 1).end()
    );
});

await Promise.all([...highlightTasks]);
await Promise.all([...lineTasks]);
await Promise.all([...labelTasks]);

    const selectedFacets = nValues
        .filter(n => n <= countLimit)
        .map(n => countedFacets.find(cf => cf.index === n)?.facet)
        .filter(Boolean);
    
    const results = data.filter(d => selectedFacets.includes(String(d.target)));
    return results;
}

export async function groupedBarDiff(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarDiff(chartId, op, data, true);
    }
    const { svg, g, margins, plot, yField, facetField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);
    svg.attr('data-filtering', '1');

    const isObjA = typeof op.targetA === 'object' && op.targetA !== null;
    const isObjB = typeof op.targetB === 'object' && op.targetB !== null;

    const colorA = OP_COLORS.DIFF_A;
    const colorB = OP_COLORS.DIFF_B;
    const diffColor = OP_COLORS.DIFF_LINE;

    // 🔥 simpleBar와 동일: diff line 그리기 함수
    const drawDiffLine = (nodeA, nodeB, diffVal) => {
        const bboxA = nodeA.getBBox();
        const bboxB = nodeB.getBBox();
        const groupXA = readGroupX(nodeA);
        const groupXB = readGroupX(nodeB);

        const cxA = margins.left + groupXA + bboxA.x + bboxA.width / 2;
        const cyA = margins.top + bboxA.y;
        const cxB = margins.left + groupXB + bboxB.x + bboxB.width / 2;
        const cyB = margins.top + bboxB.y;

        const midX = (cxA + cxB) / 2;
        const minY = Math.min(cyA, cyB);

        const line = svg.append("line")
            .attr("class", "annotation diff-line")
            .attr("x1", cxA).attr("y1", minY - 10)
            .attr("x2", cxA).attr("y2", minY - 10)
            .attr("stroke", diffColor)
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5 5");

        const lineP = line.transition().duration(400).ease(d3.easeCubicInOut)
            .attr("x2", cxB)
            .end();

        const label = svg.append("text")
            .attr("class", "annotation diff-label")
            .attr("x", midX).attr("y", minY - 14)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .attr("font-weight", "bold")
            .attr("fill", diffColor)
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(`Diff: ${fmtNum(diffVal)}`)
            .attr("opacity", 0);

        const labelP = label.transition().duration(400).attr("opacity", 1).end();

        return Promise.all([lineP, labelP]);
    };

    // 🔥 group이 있을 때
    if (!isObjA && !isObjB && op.group) {
        const subgroup = String(op.group);
        const subset = data.filter(d => String(d.group) === subgroup);
        if (!subset.length) {
            console.warn("groupedBarDiff[group]: no data", subgroup);
            svg.attr('data-filtering', null);
            return [];
        }
        await groupedBarToSimpleByGroup(chartId, subgroup, data);

        const AFacet = String(op.targetA);
        const BFacet = String(op.targetB);

        const opForDiff = { targetA: { target: AFacet, group: subgroup }, targetB: { target: BFacet, group: subgroup } };
        const diffResult = dataDiff(data, opForDiff);
        if (!diffResult) {
            console.warn("groupedBarDiff[group]: dataDiff empty", { opForDiff });
            svg.attr('data-filtering', null);
            return [];
        }

        const nodeA = findRectByTuple(g, { facet: AFacet, key: subgroup });
        const nodeB = findRectByTuple(g, { facet: BFacet, key: subgroup });

        if (nodeA && nodeB) {
            const others = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });
            
            // 🔥 simpleBar와 동일: 600ms 애니메이션
            await Promise.all([
                others.transition().duration(600).attr("opacity", 0.2).end(),
                d3.select(nodeA).transition().duration(600).attr("opacity", 1).attr("fill", colorA).end(),
                d3.select(nodeB).transition().duration(600).attr("opacity", 1).attr("fill", colorB).end()
            ]);

            // 🔥 simpleBar와 동일: 수평선 그리기
            const yMax = d3.max(data, d => d.value);
            const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plot.h, 0]);

            const valueA = d3.select(nodeA).datum()?.value;
            const valueB = d3.select(nodeB).datum()?.value;

            const guidePositions = [];
            const animationPromises = [];

            [
                { node: nodeA, value: valueA, color: colorA },
                { node: nodeB, value: valueB, color: colorB }
            ].forEach(t => {
                if (!Number.isFinite(t.value)) return;

                const yPos = margins.top + yScale(t.value);
                guidePositions.push(yPos);

                const line = svg.append("line").attr("class", "annotation")
                    .attr("x1", margins.left).attr("y1", yPos)
                    .attr("x2", margins.left).attr("y2", yPos)
                    .attr("stroke", t.color)
                    .attr("stroke-width", 1.5)
                    .attr("stroke-dasharray", "4 4");

                animationPromises.push(
                    line.transition().duration(400).attr("x2", margins.left + plot.w).end()
                );

                const { x, y } = absCenter(svg, t.node);
                svg.append("text").attr("class", "annotation")
                    .attr("x", x).attr("y", y)
                    .attr("text-anchor", "middle")
                    .attr("font-size", 12)
                    .attr("font-weight", "bold")
                    .attr("fill", t.color)
                    .attr("stroke", "white")
                    .attr("stroke-width", 3)
                    .attr("paint-order", "stroke")
                    .text(fmtNum(t.value));
            });

            await Promise.all(animationPromises);

            // 🔥 simpleBar와 동일: diff bridge 그리기
            const diffMagnitude = Math.abs(diffResult.value);
            if (guidePositions.length === 2 && Number.isFinite(diffMagnitude)) {
                const [posA, posB] = guidePositions;
                if (Number.isFinite(posA) && Number.isFinite(posB)) {
                    const minY = Math.min(posA, posB);
                    const maxY = Math.max(posA, posB);
                    const diffX = margins.left + plot.w - 8;

                    const bridge = svg.append("line").attr("class", "annotation diff-line")
                        .attr("x1", diffX).attr("x2", diffX)
                        .attr("y1", minY).attr("y2", minY)
                        .attr("stroke", diffColor)
                        .attr("stroke-width", 2)
                        .attr("stroke-dasharray", "5 5");

                    await bridge.transition().duration(400).attr("y2", maxY).end();

                    const labelY = (minY + maxY) / 2;
                    const diffLabel = svg.append("text").attr("class", "annotation diff-label")
                        .attr("x", diffX - 6)
                        .attr("y", labelY)
                        .attr("text-anchor", "end")
                        .attr("font-size", 12)
                        .attr("font-weight", "bold")
                        .attr("fill", diffColor)
                        .attr("stroke", "white")
                        .attr("stroke-width", 3)
                        .attr("paint-order", "stroke")
                        .text(`Diff: ${fmtNum(diffMagnitude)}`)
                        .attr("opacity", 0);

                    await diffLabel.transition().duration(400).attr("opacity", 1).end();
                }
            }
        }

        svg.attr('data-filtering', null);
        return [new DatumValue(diffResult.category, diffResult.measure, diffResult.target, diffResult.group, Math.abs(diffResult.value))];
    }

    // 🔥 targetA, targetB가 객체일 때 (category + series)
    if (isObjA && isObjB && op.targetA.category && op.targetA.series && op.targetB.category && op.targetB.series) {
        const opForDiff = {
            targetA: { target: op.targetA.category, group: op.targetA.series },
            targetB: { target: op.targetB.category, group: op.targetB.series }
        };
        const diffResult = dataDiff(data, opForDiff);
        if (!diffResult) {
            console.warn("groupedBarDiff: diff fail", op);
            svg.attr('data-filtering', null);
            return [];
        }

        const nodeA = findRectByTuple(g, { facet: op.targetA.category, key: op.targetA.series });
        const nodeB = findRectByTuple(g, { facet: op.targetB.category, key: op.targetB.series });

        if (nodeA && nodeB) {
            const others = g.selectAll("rect").filter(function() { return this !== nodeA && this !== nodeB; });
            
            // 🔥 simpleBar와 동일
            await Promise.all([
                others.transition().duration(600).attr("opacity", 0.2).end(),
                d3.select(nodeA).transition().duration(600).attr("opacity", 1).attr("fill", colorA).end(),
                d3.select(nodeB).transition().duration(600).attr("opacity", 1).attr("fill", colorB).end()
            ]);

            await drawDiffLine(nodeA, nodeB, Math.abs(diffResult.value));
        }

        svg.attr('data-filtering', null);
        return [new DatumValue(diffResult.category, diffResult.measure, diffResult.target, diffResult.group, Math.abs(diffResult.value))];
    }

    // 🔥 facet 레벨 diff (group 지정 없음)
    if (!isObjA && !isObjB) {
        const AFacet = String(op.targetA);
        const BFacet = String(op.targetB);
        const inGroup = (d) => (op.group) ? String(d.group) === String(op.group) : true;
        const aVal = d3.sum(data.filter(d => inGroup(d) && String(d.target) === AFacet), d => +d.value);
        const bVal = d3.sum(data.filter(d => inGroup(d) && String(d.target) === BFacet), d => +d.value);
        const diffVal = aVal - bVal;

        svg.attr('data-filtering', null);
        return [new DatumValue(facetField, yField, "Diff", op.group ?? null, Math.abs(diffVal), `${AFacet}-${BFacet}-diff`)];
    }

    console.warn("groupedBarDiff: unsupported targets", op);
    svg.attr('data-filtering', null);
    return [];
}

export async function groupedBarCount(chartId, op, data, isLast = false) {
    if (isLast) {
        return await simpleBarCount(chartId, op, data, true);
    }
    const { svg, g, margins, xField, facetField, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);
    await waitForAttrClear(svg);
    resetBarsVisible(g);

    if (op && op.group != null) {
        const subgroup = String(op.group);
        const subset = Array.isArray(data) ? data.filter(d => String(d.group) === subgroup) : [];
        if (subset.length === 0) {
            console.warn('groupedBarCount: no data for group', subgroup);
            const zero = new DatumValue(null, null, 'Category Count', subgroup, 0, null);
            return [zero];
        }

        await groupedBarToSimpleByGroup(chartId, subgroup, data);

        const op2 = { ...op };
        delete op2.group;
        const result = dataCount(subset, op2, facetField, xField);
        const totalCount = result ? Number(result.value) : 0;

        const bars = g.selectAll('rect');
        if (bars.empty()) {
            console.warn('groupedBarCount[group]: no bars on chart after simple-ize');
            return result ? [new DatumValue(result.category, result.measure, result.target, subgroup, totalCount, result.id)] : [];
        }

        const baseColor = '#69b3a2'; // This color is not in the palette, kept for visual effect.
        const hlColor = OP_COLORS.COUNT;
        await bars.transition().duration(150).attr('fill', baseColor).attr('opacity', 0.3).end();

        const items = bars.nodes().map(node => {
            const localX = +node.getAttribute('x') || 0;
            const globalX = (readGroupX(node) || 0) + localX;
            return { node, globalX };
        }).sort((a, b) => a.globalX - b.globalX);

        const N = Math.min(totalCount, items.length);
        for (let i = 0; i < N; i++) {
            const { node } = items[i];
            const rect = d3.select(node);
            await rect.transition().duration(150).attr('fill', hlColor).attr('opacity', 1).end();
            const { x, y } = absCenter(svg, node);
            svg.append('text')
                .attr('class', 'annotation count-label')
                .attr('x', x).attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('font-size', 12).attr('font-weight', 'bold')
                .attr('fill', hlColor).attr('stroke', 'white')
                .attr('stroke-width', 3).attr('paint-order', 'stroke')
                .text(String(i + 1))
                .attr('opacity', 0)
                .transition().duration(125).attr('opacity', 1);
            await delay(60);
        }

        svg.append('text')
            .attr('class', 'annotation')
            .attr('x', margins.left).attr('y', margins.top - 10)
            .attr('font-size', 12).attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .text(`Count: ${totalCount}`)
            .attr('opacity', 0)
            .transition().duration(200).attr('opacity', 1);

        const countDatum = result ?
            new DatumValue(result.category, result.measure, result.target, subgroup, totalCount, result.id) :
            new DatumValue(null, null, 'Category Count', subgroup, totalCount, null);
        return [countDatum];
    }

    const result = dataCount(data, op, facetField, xField);
    if (!result) {
        console.warn('groupedBarCount: could not compute count');
        return [];
    }

    const countDatum = new DatumValue(
        result.category, result.measure, result.target,
        result.group, result.value, result.id
    );
    const totalCount = countDatum.value;

    if (totalCount === 0) {
        console.warn('groupedBarCount: empty data');
        return [countDatum];
    }

    const bars = g.selectAll('rect');
    if (bars.empty()) {
        console.warn('groupedBarCount: no bars on chart');
        return [countDatum];
    }

    const hlColor = OP_COLORS.COUNT;
    await bars.transition().duration(150).attr('opacity', 0.3).end();

    const nodes = bars.nodes();
    const items = nodes.map(node => {
        const groupX = readGroupX(node);
        const barX = +node.getAttribute('x') || 0;
        return { node, globalX: groupX + barX };
    });
    items.sort((a, b) => a.globalX - b.globalX);

    const N = Math.min(totalCount, items.length);
    for (let i = 0; i < N; i++) {
        const { node } = items[i];
        await d3.select(node).transition().duration(120)
            .attr('fill', hlColor)
            .attr('opacity', 1)
            .end();

        const { x, y } = absCenter(svg, node);
        svg.append('text')
            .attr('class', 'annotation count-label')
            .attr('x', x)
            .attr('y', y - 6)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('fill', hlColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 3)
            .attr('paint-order', 'stroke')
            .text(String(i + 1))
            .attr('opacity', 0)
            .transition().duration(120).attr('opacity', 1);

        await delay(60);
    }

    svg.append('text')
        .attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Count: ${totalCount}`)
        .attr('opacity', 0)
        .transition().duration(200).attr('opacity', 1);

    return [countDatum];
}

export async function groupedBarLagDiff(chartId, op, data, isLast = false) {
    if (isSimplifiedData(data)) {
        return await simpleBarLagDiff(chartId, op, data, isLast);
    }
    const { svg, xField, yField } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    const diffsRaw = dataLagDiff(data, op, null, null, isLast);
    if (!Array.isArray(diffsRaw) || diffsRaw.length === 0) {
        console.warn('[groupedBarLagDiff] no differences computed');
        return [];
    }
    const diffs = normalizeLagDiffResults(diffsRaw, xField || 'target', yField || 'value');

    const positiveTotal = diffs
        .map(d => Number(d.value))
        .filter(v => Number.isFinite(v) && v > 0)
        .reduce((sum, v) => sum + v, 0);

    svg.append('text').attr('class', 'annotation lagdiff-summary')
        .attr('x', 16)
        .attr('y', 20)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', OP_COLORS.SUM)
        .text(
            Number.isFinite(positiveTotal)
                ? `lagDiff computed ${diffs.length} changes · positives sum ${positiveTotal.toLocaleString()}`
                : `lagDiff computed ${diffs.length} changes`
        );

    return diffs;
}
