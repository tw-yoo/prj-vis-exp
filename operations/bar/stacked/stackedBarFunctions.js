import {
    simpleBarAverage, simpleBarFilter, simpleBarFindExtremum, simpleBarSort, simpleBarDiff, simpleBarNth,
    simpleBarCount
} from "../simple/simpleBarFunctions.js";
import {IntervalValue} from "../../../object/valueType.js";

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

    const targetIds = new Set(filteredData.map(d => `${d.target}-${d.group}-${d.value}`));
    const chartRects = svg.select(".plot-area").selectAll("rect");

    const highlightPromises = [];
    chartRects.each(function() {
        const rect = d3.select(this);
        const d = rect.datum();
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
    const { svg, g, orientation, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);

    // Case A: subgroup requested → convert to simple bar then reuse simpleBarFilter
    if (op?.group != null) {
        const filteredData = await stackedBarToSimpleBar(chartId, op, data);
        // Normalize existing rect datum so simpleBarFilter's key function (categoryKey) matches
        const categoryKey = filteredData[0]?.category || xField; // fallback to xField
        const gSel = d3.select(`#${chartId}`).select("svg").select(".plot-area");
        gSel.selectAll("rect").each(function() {
          const sel = d3.select(this);
          const old = sel.datum() || {};
          const id = sel.attr("data-id");
          if (id != null && old[categoryKey] === undefined) {
            old[categoryKey] = id; // make old datum compatible with upcoming data-join
            sel.datum(old);
          }
        });
        return await simpleBarFilter(chartId, op, filteredData, isLast);
    }

    // Helper: comparison operators
    const cmp = {
        ">": (a,b)=> a > b,
        ">=": (a,b)=> a >= b,
        "<": (a,b)=> a < b,
        "<=": (a,b)=> a <= b,
        "==": (a,b)=> a === b
    };

    // Compute stack totals per category
    const sumsByCat = d3.rollup(
        Array.isArray(data) ? data : [],
        vs => d3.sum(vs, dv => +dv.value || 0),
        dv => String(dv.target)
    );
    const entries = Array.from(sumsByCat, ([key, sum]) => ({ key, sum }));

    // Case B: numeric threshold on stack totals (no group)
    const hasNumericFilter = op && op.operator && (op.value !== undefined || Array.isArray(op.value));
    if (hasNumericFilter) {
        let keepCats = new Set();
        if (op.operator === 'in' && Array.isArray(op.value)) {
            op.value.forEach(v => keepCats.add(String(v)));
        } else if (cmp[op.operator]) {
            const keyVal = Number.isFinite(+op.value) ? +op.value : op.value;
            entries.forEach(e => { if (cmp[op.operator](+e.sum, keyVal)) keepCats.add(String(e.key)); });
        }

        if (keepCats.size === 0) {
            console.warn('stackedBarFilter: no categories matched filter');
            // Fade all bars
            await g.selectAll('rect').transition().duration(500).attr('opacity', 0.2).end();
            return [];
        }

        // Visual highlight: all segments in kept categories
        const allRects = g.selectAll('rect');
        const promises = [];
        allRects.each(function() {
            const sel = d3.select(this);
            const rd = sel.datum(); // { key, subgroup, value }
            const hit = rd && keepCats.has(String(rd.key));
            promises.push(sel.transition().duration(600)
                .attr('opacity', hit ? 1 : 0.2)
                .attr('stroke', hit ? 'black' : 'none')
                .attr('stroke-width', hit ? 1 : 0)
                .end());
        });
        await Promise.all(promises);

        // Draw threshold line (vertical chart only) based on totals
        const maxTotal = d3.max(entries, e => e.sum) || 0;
        if (orientation === 'vertical' && Number.isFinite(+op.value) && (op.operator in cmp)) {
            const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
            const yPos = margins.top + yScale(+op.value);
            svg.append('line').attr('class', 'threshold-line')
                .attr('x1', margins.left).attr('y1', yPos)
                .attr('x2', margins.left).attr('y2', yPos)
                .attr('stroke', 'blue').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 5')
                .transition().duration(600).attr('x2', margins.left + plot.w);
            svg.append('text').attr('class', 'filter-label')
                .attr('x', margins.left + plot.w + 6).attr('y', yPos)
                .attr('dominant-baseline', 'middle')
                .attr('fill', 'blue').attr('font-weight', 'bold')
                .text(`${op.operator} ${op.value}`)
                .attr('opacity', 0).transition().duration(300).attr('opacity', 1);
        }

        // Return DatumValue[] for kept categories (all segments so 후속 op 체인 유지)
        const out = data.filter(dv => keepCats.has(String(dv.target)));
        return out;
    }

    // Case C: label-based selection (category in list)
    if (Array.isArray(op?.target) && op.target.length > 0) {
        const keep = new Set(op.target.map(String));
        const allRects = g.selectAll('rect');
        const promises = [];
        allRects.each(function() {
            const sel = d3.select(this);
            const rd = sel.datum();
            const hit = rd && keep.has(String(rd.key));
            promises.push(sel.transition().duration(600)
                .attr('opacity', hit ? 1 : 0.2)
                .attr('stroke', hit ? 'black' : 'none')
                .attr('stroke-width', hit ? 1 : 0)
                .end());
        });
        await Promise.all(promises);
        return data.filter(dv => keep.has(String(dv.target)));
    }

    // Default: no-op, return original
    return data;
}

export async function stackedBarFindExtremum(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn('stackedBarFindExtremum: empty data');
        return [];
    }

    const which = (op?.which === 'min') ? 'min' : 'max';
    const tiesMode = (op?.ties === 'all') ? 'all' : 'first';
    const scope = op?.scope || (op?.group != null ? 'perGroup' : 'overall');
    const hlColor = '#a65dfb';
    const baseOpacity = 0.25;

    const allRects = g.selectAll('rect');

    const highlightRects = async (predicate) => {
        const ps = [];
        allRects.each(function() {
            const sel = d3.select(this);
            const rd = sel.datum(); // { key, subgroup, value }
            const hit = predicate(rd);
            ps.push(sel.transition().duration(500)
                .attr('opacity', hit ? 1 : baseOpacity)
                .attr('stroke', hit ? 'black' : 'none')
                .attr('stroke-width', hit ? 1 : 0)
                .end());
        });
        await Promise.all(ps);
    };

    const toReturn = (winners) => {
        // winners: array of {key, subgroup}
        const set = new Set(winners.map(w => `${w.key}__${w.subgroup ?? ''}`));
        return data.filter(dv => set.has(`${String(dv.target)}__${String(dv.group ?? '')}`));
    };

    // --- Scope: perGroup (fixed subgroup, compare categories) ---
    if (scope === 'perGroup') {
        const groupKey = String(op?.group ?? '');
        if (!groupKey) { console.warn('FindExtremum(perGroup): missing group'); return []; }
        const subset = data.filter(dv => String(dv.group) === groupKey);
        if (subset.length === 0) { console.warn('FindExtremum(perGroup): no data for group', groupKey); return []; }
        const values = subset.map(d => +d.value).filter(Number.isFinite);
        const targetVal = (which === 'min') ? d3.min(values) : d3.max(values);
        if (!Number.isFinite(targetVal)) return [];

        const hits = subset.filter(d => +d.value === targetVal);
        const winners = (tiesMode === 'all') ? hits : [hits[0]];

        await highlightRects(rd => rd && String(rd.subgroup) === groupKey && winners.some(w => String(w.target) === String(rd.key)));

        // Label each winning segment
        winners.forEach(w => {
            const nodes = [];
            allRects.each(function() {
                const rd = d3.select(this).datum();
                if (rd && String(rd.key) === String(w.target) && String(rd.subgroup) === groupKey) nodes.push(this);
            });
            if (nodes.length) {
                const b = nodes[0].getBBox();
                const cx = margins.left + (orientation === 'vertical' ? b.x + b.width / 2 : b.x + b.width + 6);
                const cy = margins.top + (orientation === 'vertical' ? Math.max(10, b.y - 6) : b.y + b.height / 2);
                svg.append('text').attr('class', 'annotation')
                    .attr('x', cx).attr('y', cy)
                    .attr('text-anchor', orientation === 'vertical' ? 'middle' : 'start')
                    .attr('font-size', 12).attr('font-weight', 'bold')
                    .attr('fill', hlColor)
                    .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
                    .text(`${which === 'min' ? 'Min' : 'Max'}: ${w.value}`)
                    .attr('opacity', 0)
                    .transition().duration(300).attr('opacity', 1);
            }
        });
        return toReturn(winners.map(w => ({ key: String(w.target), subgroup: groupKey })));
    }

    // --- Scope: perCategory (fixed category, compare subgroups) ---
    if (scope === 'perCategory') {
        const category = String(op?.category ?? op?.target ?? '');
        if (!category) { console.warn('FindExtremum(perCategory): missing category'); return []; }
        const subset = data.filter(dv => String(dv.target) === category);
        if (subset.length === 0) { console.warn('FindExtremum(perCategory): no data for category', category); return []; }
        const values = subset.map(d => +d.value).filter(Number.isFinite);
        const targetVal = (which === 'min') ? d3.min(values) : d3.max(values);
        if (!Number.isFinite(targetVal)) return [];
        const hits = subset.filter(d => +d.value === targetVal);
        const winners = (tiesMode === 'all') ? hits : [hits[0]];

        await highlightRects(rd => rd && String(rd.key) === category && winners.some(w => String(w.group) === String(rd.subgroup)));

        winners.forEach(w => {
            const nodes = [];
            allRects.each(function() {
                const rd = d3.select(this).datum();
                if (rd && String(rd.key) === category && String(rd.subgroup) === String(w.group)) nodes.push(this);
            });
            if (nodes.length) {
                const b = nodes[0].getBBox();
                const cx = margins.left + (orientation === 'vertical' ? b.x + b.width / 2 : b.x + b.width + 6);
                const cy = margins.top + (orientation === 'vertical' ? Math.max(10, b.y - 6) : b.y + b.height / 2);
                svg.append('text').attr('class', 'annotation')
                    .attr('x', cx).attr('y', cy)
                    .attr('text-anchor', orientation === 'vertical' ? 'middle' : 'start')
                    .attr('font-size', 12).attr('font-weight', 'bold')
                    .attr('fill', hlColor)
                    .attr('stroke', 'white').attr('stroke-width', 3).attr('paint-order', 'stroke')
                    .text(`${which === 'min' ? 'Min' : 'Max'}: ${w.value}`)
                    .attr('opacity', 0)
                    .transition().duration(300).attr('opacity', 1);
            }
        });
        return toReturn(winners.map(w => ({ key: category, subgroup: String(w.group) })));
    }

    // --- Scope: overall (compare stack totals per category) ---
    const sumsByCat = d3.rollup(
        data,
        vs => d3.sum(vs, d => +d.value || 0),
        d => String(d.target)
    );
    const entries = Array.from(sumsByCat, ([key, sum]) => ({ key, sum }));
    if (!entries.length) return [];
    const bestVal = (which === 'min') ? d3.min(entries, e => e.sum) : d3.max(entries, e => e.sum);
    const winners = (tiesMode === 'all') ? entries.filter(e => e.sum === bestVal) : [entries.find(e => e.sum === bestVal)];

    await highlightRects(rd => rd && winners.some(w => String(w.key) === String(rd.key)));

    // Draw guide at the winning total (only for vertical for simplicity)
    const maxTotal = d3.max(entries, e => e.sum) || 0;
    if (orientation === 'vertical' && Number.isFinite(bestVal)) {
        const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);
        winners.forEach(w => {
            const yPos = margins.top + yScale(w.sum);
            const line = svg.append('line').attr('class', 'annotation')
                .attr('x1', margins.left).attr('y1', yPos)
                .attr('x2', margins.left).attr('y2', yPos)
                .attr('stroke', hlColor).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
            line.transition().duration(500).attr('x2', margins.left + plot.w);
            svg.append('text').attr('class', 'annotation')
                .attr('x', margins.left + plot.w + 6).attr('y', yPos)
                .attr('dominant-baseline', 'middle')
                .attr('fill', hlColor).attr('font-weight', 'bold')
                .text(`${which === 'min' ? 'Min' : 'Max'} total (${w.key}): ${w.sum}`)
                .attr('opacity', 0)
                .transition().duration(300).attr('opacity', 1);
        });
    }

    return toReturn(winners.map(w => ({ key: String(w.key), subgroup: null })));
}

export async function stackedBarDetermineRange(chartId, op, data, isLast = false) {
    const { svg, g, orientation, xField, yField, colorField, margins, plot } = getSvgAndSetup(chartId);
    clearAllAnnotations(svg);

    if (!Array.isArray(data) || data.length === 0) {
        console.warn('stackedBarDetermineRange: empty data');
        return [];
    }

    // Create real IntervalValue instances (class is already imported at top)
    const makeInterval = (category, min, max) => new IntervalValue(category, min, max);

    // Case 1) Specific subgroup: compute range across categories for that subgroup
    if (op?.group != null) {
        const subgroup = String(op.group);
        const subset = data.filter(dv => String(dv.group) === subgroup);
        if (subset.length === 0) {
            console.warn('stackedBarDetermineRange: no data for group', subgroup);
            return [];
        }

        // Optional: reuse simple bar visuals for clearer range lines
        try {
            const toSimple = await stackedBarToSimpleBar(chartId, { ...op, group: subgroup }, subset);
            // Delegate visuals to simpleBarDetermineRange
            // field: op.field or yField
            // Import here to avoid circular import issues
            const { simpleBarDetermineRange } = await import("../simple/simpleBarFunctions.js");
            await simpleBarDetermineRange(chartId, { field: op.field || yField }, toSimple, isLast);
        } catch (e) {
            // Fallback silently if visuals fail; we still return values.
            console.debug('simpleBarDetermineRange delegation skipped:', e);
        }

        const vals = subset.map(d => +d.value).filter(Number.isFinite);
        const minV = d3.min(vals);
        const maxV = d3.max(vals);
        return [ makeInterval(subgroup, minV ?? 0, maxV ?? 0) ];
    }

    // Case 2) No subgroup: per-category range of segment values within each bar
    // Build by category
    const byCat = d3.group(data, dv => String(dv.target));

    // Highlight per-category min & max segments
    const allRects = g.selectAll('rect');
    const promises = [];

    const intervals = [];
    for (const [cat, arr] of byCat.entries()) {
        const vals = arr.map(d => +d.value).filter(Number.isFinite);
        if (vals.length === 0) continue;
        const minV = d3.min(vals);
        const maxV = d3.max(vals);
        intervals.push(makeInterval(cat, minV, maxV));

        // Emphasize the segments that correspond to min/max within this category
        allRects.each(function() {
            const sel = d3.select(this);
            const rd = sel.datum(); // { key, subgroup, value }
            if (!rd) return;
            const isCat = String(rd.key) === cat;
            const isMin = isCat && (+rd.value === +minV);
            const isMax = isCat && (+rd.value === +maxV);
            if (isMin || isMax) {
                promises.push(sel.transition().duration(450)
                    .attr('opacity', 1)
                    .attr('stroke', isMax ? '#0d6efd' : '#6c757d')
                    .attr('stroke-width', 1.5)
                    .end());
            } else if (isCat) {
                promises.push(sel.transition().duration(450)
                    .attr('opacity', 0.35)
                    .attr('stroke', 'none')
                    .attr('stroke-width', 0)
                    .end());
            }
        });
    }

    await Promise.all(promises);

    // Optional: top label summarizing the operation
    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', '#0d6efd')
        .text('Range per bar (min/max of segments)');

    // Return IntervalValue-like objects; upstream expects IntervalValue
    return intervals;
}

export async function stackedBarCompare(chartId, op, data, isLast = false) {}

export async function stackedBarSort(chartId, op, data, isLast = false) {
    const { xField, yField } = getSvgAndSetup(chartId);

    // 1) Convert stacked → simple (group이 있으면 해당 subgroup만 남김)
    const filteredData = await stackedBarToSimpleBar(chartId, op, data);
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
        console.warn('stackedBarSort: no data after conversion');
        return [];
    }

    // 2) Normalize rect datum so simpleBarSort can compute keys correctly
    //    simpleBarSort.getCategoryId는 d.target 또는 d[categoryName]/xField를 참조
    const categoryKey = filteredData[0]?.category || xField;
    const measureKey  = filteredData[0]?.measure  || yField;

    const gSel = d3.select(`#${chartId}`).select('svg').select('.plot-area');
    gSel.selectAll('rect').each(function () {
        const sel = d3.select(this);
        const old = sel.datum() || {};
        const id  = sel.attr('data-id');     // simple bar 렌더러가 설정
        const val = sel.attr('data-value');  // numeric value

        if (id != null) {
            if (old[categoryKey] === undefined) old[categoryKey] = id;
            if (old.target === undefined)       old.target = id; // simpleBarSort의 fallback
        }
        if (val != null && old.value === undefined) {
            const num = +val;
            if (Number.isFinite(num)) old.value = num;
            if (measureKey && old[measureKey] === undefined) old[measureKey] = old.value;
        }
        sel.datum(old);
    });

    // 3) Delegate with the converted data (중요: filteredData를 넘겨야 함)
    return await simpleBarSort(chartId, op, filteredData, isLast);
}

export async function stackedBarSum(chartId, op, data, isLast = false) {
    // 필요 없을수도?
}

export async function stackedBarAverage(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);

    if (op.group) {
        // 1) Convert stacked → simple (group이 있으면 해당 subgroup만 남김)
        const filteredData = await stackedBarToSimpleBar(chartId, op, data);
        if (!Array.isArray(filteredData) || filteredData.length === 0) {
            console.warn('stackedBarAverage: no data after conversion');
            return [];
        }

        // 2) Normalize rect datum so simpleBarAverage can read category/value
        const categoryKey = filteredData[0]?.category || xField;
        const measureKey  = filteredData[0]?.measure  || yField;
        const gSel = d3.select(`#${chartId}`).select('svg').select('.plot-area');
        gSel.selectAll('rect').each(function () {
            const sel = d3.select(this);
            const old = sel.datum() || {};
            const id  = sel.attr('data-id');
            const val = sel.attr('data-value');
            if (id != null) {
                if (old[categoryKey] === undefined) old[categoryKey] = id;
                if (old.target === undefined)       old.target = id;
            }
            if (val != null && old.value === undefined) {
                const num = +val; if (Number.isFinite(num)) old.value = num;
                if (measureKey && old[measureKey] === undefined) old[measureKey] = old.value;
            }
            sel.datum(old);
        });

        return await simpleBarAverage(chartId, op, filteredData, isLast);
    } else {
        // 2) Per-bar average: for each category(bar), take mean of its segment values
        if (!Array.isArray(data) || data.length === 0) return [];

        // Group by category (target)
        const byCat = d3.group(data, dv => String(dv.target));

        // Build totals per category for proper stacked scale
        const totals = Array.from(byCat, ([key, arr]) => ({
            key,
            total: d3.sum(arr, d => +d.value || 0),
            avg: d3.mean(arr, d => +d.value || 0)
        }));
        if (totals.length === 0) return [];

        const maxTotal = d3.max(totals, d => d.total) || 0;

        if (orientation === 'vertical') {
            const yScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([plot.h, 0]);

            // For each category, draw a small horizontal tick across its bar width at y=avg
            const allRects = g.selectAll('rect');
            const promises = [];

            totals.forEach(({ key, avg }) => {
                // find all rects in this category to compute combined width range
                const nodes = [];
                allRects.each(function() {
                    const rd = d3.select(this).datum();
                    if (rd && String(rd.key) === String(key)) nodes.push(this);
                });
                if (nodes.length === 0) return;
                // bar horizontal extent
                let minX = Infinity, maxX = -Infinity;
                nodes.forEach(n => { const b = n.getBBox(); minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.width); });

                const yPos = margins.top + yScale(avg);
                const x1 = margins.left + minX;
                const x2 = margins.left + maxX;

                const line = svg.append('line')
                    .attr('class', 'annotation avg-line')
                    .attr('x1', x1).attr('y1', yPos)
                    .attr('x2', x1).attr('y2', yPos)
                    .attr('stroke', 'red').attr('stroke-width', 2).attr('stroke-dasharray', '5 5');
                promises.push(line.transition().duration(600).attr('x2', x2).end());

                const label = svg.append('text')
                    .attr('class', 'annotation avg-label')
                    .attr('x', x2 + 6).attr('y', yPos)
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', 'red').attr('font-weight', 'bold')
                    .text(`Avg: ${Number.isFinite(avg) ? avg.toFixed(2) : '–'}`)
                    .attr('opacity', 0);
                promises.push(label.transition().duration(300).attr('opacity', 1).end());
            });

            await Promise.all(promises);
        } else {
            // horizontal stacked bars
            const xScale = d3.scaleLinear().domain([0, maxTotal]).nice().range([0, plot.w]);

            const allRects = g.selectAll('rect');
            const promises = [];

            totals.forEach(({ key, avg }) => {
                const nodes = [];
                allRects.each(function() {
                    const rd = d3.select(this).datum();
                    if (rd && String(rd.key) === String(key)) nodes.push(this);
                });
                if (nodes.length === 0) return;

                // bar vertical extent
                let minY = Infinity, maxY = -Infinity;
                nodes.forEach(n => { const b = n.getBBox(); minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.height); });

                const xPos = margins.left + xScale(avg);
                const y1 = margins.top + minY;
                const y2 = margins.top + maxY;

                const line = svg.append('line')
                    .attr('class', 'annotation avg-line')
                    .attr('x1', xPos).attr('y1', y1)
                    .attr('x2', xPos).attr('y2', y1)
                    .attr('stroke', 'red').attr('stroke-width', 2).attr('stroke-dasharray', '5 5');
                promises.push(line.transition().duration(600).attr('y2', y2).end());

                const label = svg.append('text')
                    .attr('class', 'annotation avg-label')
                    .attr('x', xPos).attr('y', y1 - 6)
                    .attr('text-anchor', 'middle')
                    .attr('fill', 'red').attr('font-weight', 'bold')
                    .text(`Avg: ${Number.isFinite(avg) ? avg.toFixed(2) : '–'}`)
                    .attr('opacity', 0);
                promises.push(label.transition().duration(300).attr('opacity', 1).end());
            });

            await Promise.all(promises);
        }

        return data;
    }
}

export async function stackedBarDiff(chartId, op, data, isLast = false) {}

export async function stackedBarNth(chartId, op, data, isLast = false) {
    const { svg, g, xField, yField, margins, plot, orientation } = getSvgAndSetup(chartId);

    // validate n
    let n = Number(op?.n ?? 0);
    if (!Number.isFinite(n) || n <= 0) {
        console.warn('stackedBarNth: invalid n');
        return [];
    }

    // A) subgroup 지정 → simple bar 위임
    if (op?.group != null) {
        const filteredData = await stackedBarToSimpleBar(chartId, op, data);
        if (!Array.isArray(filteredData) || filteredData.length === 0) {
            console.warn('stackedBarNth: no data after conversion');
            return [];
        }

        // simpleBar 계열이 기대하는 datum 키 정규화
        const categoryKey = filteredData[0]?.category || xField;
        const measureKey  = filteredData[0]?.measure  || yField;
        const gSel = d3.select(`#${chartId}`).select('svg').select('.plot-area');
        gSel.selectAll('rect').each(function () {
            const sel = d3.select(this);
            const old = sel.datum() || {};
            const id  = sel.attr('data-id');
            const val = sel.attr('data-value');
            if (id != null) {
                if (old[categoryKey] === undefined) old[categoryKey] = id;
                if (old.target === undefined)       old.target = id;
            }
            if (val != null && old.value === undefined) {
                const num = +val; if (Number.isFinite(num)) old.value = num;
                if (measureKey && old[measureKey] === undefined) old[measureKey] = old.value;
            }
            sel.datum(old);
        });

        // simpleBarNth로 위임
        return await simpleBarNth(chartId, op, filteredData, isLast);
    }

    // B) subgroup 미지정 → 스택 상태에서 카테고리 단위 N개 선택
    if (!Array.isArray(data) || data.length === 0) {
        console.warn('stackedBarNth: empty data');
        return [];
    }

    // 카테고리별로 rect 묶고 위치 범위 수집
    const byCat = new Map(); // key -> { nodes:[], minX, maxX, minY, maxY }
    g.selectAll('rect').each(function () {
        const rd = d3.select(this).datum(); // { key, subgroup, value }
        if (!rd || rd.key == null) return;
        const k = String(rd.key);
        const b = this.getBBox();
        if (!byCat.has(k)) byCat.set(k, { nodes: [], minX: b.x, maxX: b.x + b.width, minY: b.y, maxY: b.y + b.height });
        const agg = byCat.get(k);
        agg.nodes.push(this);
        agg.minX = Math.min(agg.minX, b.x);
        agg.maxX = Math.max(agg.maxX, b.x + b.width);
        agg.minY = Math.min(agg.minY, b.y);
        agg.maxY = Math.max(agg.maxY, b.y + b.height);
    });

    if (byCat.size === 0) {
        console.warn('stackedBarNth: no rects grouped by category');
        return [];
    }

    // 축 방향에 따른 순서 결정
    let orderedCats;
    if (orientation === 'vertical') {
        orderedCats = Array.from(byCat.entries()).sort((a, b) => a[1].minX - b[1].minX).map(([k]) => k);
    } else {
        // horizontal: 위에서 아래(상→하)
        orderedCats = Array.from(byCat.entries()).sort((a, b) => a[1].minY - b[1].minY).map(([k]) => k);
    }

    // n 한도
    n = Math.min(n, orderedCats.length);
    const from = String(op?.from || 'left').toLowerCase();
    const pickedCats = (from === 'right') ? orderedCats.slice(-n) : orderedCats.slice(0, n);
    const pickedSet = new Set(pickedCats.map(String));

    const hlColor = '#20c997';
    const baseColor = '#69b3a2';

    // 선택 카테고리의 모든 세그먼트를 하이라이트
    const allRects = g.selectAll('rect');
    await Promise.all([
        allRects.filter(function() {
            const rd = d3.select(this).datum();
            return rd && pickedSet.has(String(rd.key));
        }).transition().duration(600).attr('fill', hlColor).attr('opacity', 1).end(),
        allRects.filter(function() {
            const rd = d3.select(this).datum();
            return !rd || !pickedSet.has(String(rd.key));
        }).transition().duration(600).attr('fill', baseColor).attr('opacity', 0.3).end()
    ]);

    // 라벨 추가
    svg.append('text').attr('class', 'annotation')
        .attr('x', margins.left)
        .attr('y', margins.top - 10)
        .attr('font-size', 14)
        .attr('font-weight', 'bold')
        .attr('fill', hlColor)
        .text(`Nth: ${from} ${n}`);

    // 후속 연산 연결을 위해 DatumValue subset 반환
    const selected = data.filter(dv => pickedSet.has(String(dv.target)));
    return selected;
}

export async function stackedBarCount(chartId, op, data, isLast = false) {
    return await simpleBarCount(chartId, op, data, isLast);
}

