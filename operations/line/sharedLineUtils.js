import { OP_COLORS } from "../../../object/colorPalette.js";

const fmtISO = d3.timeFormat("%Y-%m-%d");

export function parseDateWithGranularity(v) {
    if (v instanceof Date) return { date: v };
    if (typeof v === "number" && String(v).length === 4) return { date: new Date(v, 0, 1) };
    if (typeof v === "string") {
        if (/^\d{4}$/.test(v)) return { date: new Date(+v, 0, 1) };
        const d = new Date(v);
        if (!isNaN(+d)) return { date: d };
    }
    return { date: null };
}

export function toPointIdCandidates(key) {
    const { date } = parseDateWithGranularity(key);
    if (date) {
        return [fmtISO(date), String(key)];
    }
    return [String(key)];
}

export function findDatumByKey(data, key) {
    if (!Array.isArray(data) || key == null) return null;

    const keyCandidates = [];
    const pushKey = (val) => {
        if (val == null) return;
        const str = String(val).trim();
        if (str.length > 0) keyCandidates.push(str);
    };

    if (typeof key === 'object') {
        pushKey(key.id);
        pushKey(key.target);
        pushKey(key.category);
    }
    pushKey(key);

    if (keyCandidates.length === 0) return null;

    for (const candidate of keyCandidates) {
        const byId = data.find(d => d && d.id != null && String(d.id).trim() === candidate);
        if (byId) return byId;
    }

    const primaryKey = keyCandidates[0];
    const isYearOnly = /^\d{4}$/.test(primaryKey);

    const CANDIDATE_FIELDS = ['target', 'year', 'date', 'x', 'time', 'timestamp'];

    return data.find(d => {
        if (!d) return false;
        for (const f of CANDIDATE_FIELDS) {
            if (d[f] != null) {
                const v = String(d[f]).trim();
                if (v === primaryKey) return true;
                if (isYearOnly && v.slice(0, 4) === primaryKey) return true;
            }
        }
        for (const [, val] of Object.entries(d)) {
            if (val == null) continue;
            const v = String(val).trim();
            if (v === primaryKey) return true;
            if (isYearOnly && v.length >= 4 && v.slice(0, 4) === primaryKey) return true;
        }
        return false;
    });
}

export function selectPointByTarget(points, target) {
    if (!points) return d3.select(null);
    const candidates = toPointIdCandidates(target);
    let selection = d3.select(null);
    for (const id of candidates) {
        const sel = points.filter(function () {
            return d3.select(this).attr("data-id") === id;
        });
        if (!sel.empty()) {
            selection = sel;
            break;
        }
    }
    return selection;
}

export function getNodeHighlightInfo(node) {
    if (!node) return null;
    const sel = d3.select(node);
    const tag = String(node.tagName || "").toLowerCase();
    const parseNumber = (attr) => {
        const raw = sel.attr(attr);
        const num = Number(raw);
        return Number.isFinite(num) ? num : NaN;
    };
    const valueAttr = sel.attr("data-value");
    const value = Number.isFinite(Number(valueAttr)) ? Number(valueAttr) : NaN;

    if (tag === "rect") {
        const x = parseNumber("x") || 0;
        const width = parseNumber("width") || 0;
        const y = parseNumber("y") || 0;
        return { cx: x + width / 2, cy: y, value: Number.isFinite(value) ? value : NaN };
    }

    const cx = parseNumber("cx");
    const cy = parseNumber("cy");
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { cx, cy, value: Number.isFinite(value) ? value : NaN };
}

export function computeFallbackPointForDatum(datum, data, plot) {
    const arr = Array.isArray(data) ? data : (data ? [data] : []);
    if (!datum || arr.length === 0) return null;

    const parsedTargets = arr.map((d) => parseDateWithGranularity(d?.target).date);
    const temporalHits = parsedTargets.filter(Boolean).length;
    const isTemporal = temporalHits === arr.length && temporalHits > 0;

    let xScale;
    if (isTemporal) {
        const domain = d3.extent(parsedTargets);
        if (!domain[0] || !domain[1]) return null;
        xScale = d3.scaleTime().domain(domain).range([0, plot.w]);
    } else {
        const domain = arr.map((d) => String(d?.target ?? ""));
        xScale = d3.scalePoint().domain(domain).range([0, plot.w]);
    }

    const yValues = arr.map((d) => Number(d?.value)).filter(Number.isFinite);
    const yMax = d3.max(yValues);
    const yMin = d3.min(yValues);
    const yScale = d3.scaleLinear()
        .domain([
            yMin > 0 ? 0 : (Number.isFinite(yMin) ? yMin : 0),
            Number.isFinite(yMax) ? yMax : 0
        ])
        .nice()
        .range([plot.h, 0]);

    let cx;
    if (isTemporal) {
        const parsed = parseDateWithGranularity(datum.target).date;
        if (!parsed) return null;
        cx = xScale(parsed);
    } else {
        cx = xScale(String(datum.target));
    }
    const cy = yScale(Number(datum.value));
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { cx, cy, value: Number(datum.value) };
}

export function createVirtualBadge(svg, margins, plot, datum, color, slotIndex = 0) {
    const baseX = margins.left + plot.w + 30;
    const baseY = margins.top + 28 + slotIndex * 30;
    const group = svg.append('g').attr('class', 'annotation virtual-point');

    group.append('circle')
        .attr('cx', baseX)
        .attr('cy', baseY)
        .attr('r', 0)
        .attr('fill', color || OP_COLORS.DIFF_LINE)
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('opacity', 0.15)
        .transition().duration(250)
        .attr('r', 9)
        .attr('opacity', 0.85);

    const label = String(datum?.target ?? `Result ${slotIndex + 1}`);
    group.append('text')
        .attr('x', baseX + 14)
        .attr('y', baseY - 4)
        .attr('fill', color || OP_COLORS.DIFF_LINE)
        .attr('font-weight', 'bold')
        .attr('font-size', 12)
        .text(label);

    const valueText = Number.isFinite(Number(datum?.value))
        ? Number(datum.value).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : String(datum?.value ?? '');
    group.append('text')
        .attr('x', baseX + 14)
        .attr('y', baseY + 12)
        .attr('fill', color || OP_COLORS.DIFF_LINE)
        .attr('font-size', 12)
        .text(valueText);

    return { cx: baseX, cy: baseY, kind: 'virtual' };
}

export { fmtISO };
