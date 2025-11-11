/**
 * lineChartOperationFunctions.js
 * ------------------------------------------------------------
 * Pure data operation functions shared by simple & multiple line charts.
 * - No rendering / DOM side-effects.
 * - Each function accepts (data: DatumValue[], op: OperationSpec).
 * - `group` in op is optional. When present, it is a concrete series label value (e.g., "MSFT").
 *
 * DatumValue shape (normalized at ingestion time):
 * {
 *   category: string,   // label field name (e.g., 'date', 'country')
 *   measure:  string,   // measure field name (e.g., 'value', 'rating')
 *   target:   string,   // label value (e.g., '2024-01-01', 'KOR')
 *   group:    string|null, // subgroup label value (e.g., 'MSFT', 'AMZN') for multiple-series; null for single-line
 *   value:    number,   // numeric value
 *   id?:      string
 * }
 *
 * Supported operations follow instruction.md (§3).
 * The semantics of `group` match the spec: it selects a specific series by its label value (NOT a field name).
 */

// ---------------------------
// Utilities
// ---------------------------

import {BoolValue} from "../object/valueType.js";

const ROUND_PRECISION = 2;
const ROUND_FACTOR = 10 ** ROUND_PRECISION;
function roundNumeric(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return value;
    return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

function toTrimmedString(value, fallback = "") {
    if (value == null) return fallback;
    const str = String(value).trim();
    return str.length ? str : fallback;
}

function formatFieldLabel(field, fallback = "value") {
    return toTrimmedString(field, fallback) || fallback;
}

function formatGroupSuffix(group) {
    const label = toTrimmedString(group, "");
    return label ? ` (${label})` : "";
}

function formatTargetLabel(selector) {
    if (selector == null) return "";
    if (typeof selector === "string" || typeof selector === "number") return String(selector);
    if (typeof selector === "object") {
        if (selector.category && selector.series) return `${selector.category}/${selector.series}`;
        if (selector.category) return String(selector.category);
        if (selector.target) return String(selector.target);
        if (selector.id) return String(selector.id);
    }
    return "";
}

function formatResultName(kind, field, opts = {}) {
    const baseField = formatFieldLabel(field);
    const groupPart = formatGroupSuffix(opts.group);
    const detailPart = toTrimmedString(opts.detail, "");
    const detailSuffix = detailPart ? ` — ${detailPart}` : "";
    return `${kind} of ${baseField}${groupPart}${detailSuffix}`;
}

/** Defensive clone to avoid mutating the caller's array */
function cloneData(data) {
    return Array.isArray(data) ? data.slice() : [];
}

/** Slice by group label value if provided (string or truthy), otherwise passthrough */
function sliceByGroup(data, group) {
    if (group === undefined || group === null || group === "") return data;
    return data.filter((d) => d.group === group);
}

/**
 * Build a predicate for filtering by field.
 * For label/category fields: match by d.category === field.
 * For measure fields: match by d.measure === field  OR (field === 'value').
 * If field is omitted/unknown, passthrough.
 */
function predicateByField(field, kind /* 'category'|'measure'|undefined */) {
    if (!field) return () => true;
    if (kind === "measure") {
        if (field === "value") return () => true;
        return (d) => d.measure === field;
    }
    if (kind === "category") {
        if (field === "target") return () => true; // default label alias
        return (d) => d.category === field;
    }
    // Fallback: accept either
    return (d) =>
        d.measure === field ||
        d.category === field ||
        field === "value" ||
        field === "target";
}

/** Guess whether a field is category-like or measure-like from the data */
function inferFieldKind(data, field) {
    if (!field) return undefined;
    const hasMeasure = data.some((d) => d.measure === field || field === "value");
    const hasCategory = data.some((d) => d.category === field || field === "target");
    if (hasMeasure && !hasCategory) return "measure";
    if (hasCategory && !hasMeasure) return "category";
    // ambiguous: prefer undefined; caller may still constrain with predicateByField
    return undefined;
}

/** Comparison helpers */
const cmpNumAsc = (a, b) => a - b;
const cmpNumDesc = (a, b) => b - a;
const cmpStrAsc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpStrDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/** Operator evaluation for filter/compareBool */
function evalOperator(operator, left, right) {
    switch (operator) {
        case ">":
            return left > right;
        case ">=":
            return left >= right;
        case "<":
            return left < right;
        case "<=":
            return left <= right;
        case "==":
        case "eq":
            return left === right;
        case "!=":
            return left !== right;
        case "in":
            return Array.isArray(right) && right.includes(left);
        case "not-in":
            return Array.isArray(right) && !right.includes(left);
        case "contains":
            return (typeof left === "string") &&
            (typeof right === "string" || Array.isArray(right))
                ? Array.isArray(right)
                    ? right.every((tok) => left.includes(tok))
                    : left.includes(right)
                : false;
        default:
            throw new Error(`Unsupported operator: ${operator}`);
    }
}

/** Aggregation helpers */
function aggregate(values, agg /* 'sum'|'avg'|'min'|'max'|undefined */) {
    if (!Array.isArray(values) || values.length === 0) return NaN;
    switch (agg) {
        case "sum":
            return values.reduce((s, v) => s + v, 0);
        case "avg":
            return values.reduce((s, v) => s + v, 0) / values.length;
        case "min":
            return Math.min(...values);
        case "max":
            return Math.max(...values);
        case undefined:
        default:
            // No aggregation requested: if multiple, use identity on single; else deterministic choice: take last
            return values.length === 1 ? values[0] : values[values.length - 1];
    }
}

/** Normalize `targetA`/`targetB` form (string or {category, series}) */
function normalizeTargetInput(target, opGroup) {
    if (target && typeof target === "object") {
        return { category: target.category, series: target.series ?? opGroup ?? undefined };
    }
    return { category: target, series: opGroup ?? undefined };
}

function parseComparableValue(raw) {
    if (raw instanceof Date) {
        const ts = +raw;
        if (!Number.isNaN(ts)) return ts;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
    }
    const str = String(raw ?? "").trim();
    if (str === "") return null;
    const date = new Date(str);
    if (!Number.isNaN(+date)) return +date;
    const num = Number(str);
    if (Number.isFinite(num)) return num;
    return str;
}

function compareComparableValues(a, b) {
    const aNull = a === null || a === undefined;
    const bNull = b === null || b === undefined;
    if (aNull && bNull) return 0;
    if (aNull) return -1;
    if (bNull) return 1;
    if (typeof a === "number" && typeof b === "number") {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }
    const aStr = String(a);
    const bStr = String(b);
    if (aStr < bStr) return -1;
    if (aStr > bStr) return 1;
    return 0;
}

/** Select slice for a (category, series) target within optional measure field constraint */
function sliceForTarget(data, opField, targetIn, opGroup) {
    const { category, series } = normalizeTargetInput(targetIn, opGroup);
    let slice = data;
    if (series !== undefined) slice = sliceByGroup(slice, series);
    // Constrain to requested measure if opField looks like measure
    const kind = inferFieldKind(data, opField);
    if (kind === "measure") {
        slice = slice.filter((d) => (opField === "value" ? true : d.measure === opField));
    }
    // Match category value (label)
    const byTarget = slice.filter((d) => d.target === String(category));
    if (byTarget.length > 0 || category == null) {
        return byTarget;
    }

    const targetId = String(category);
    const byId = slice.filter((d) => d && String(d.id) === targetId);
    if (byId.length > 0) {
        return byId;
    }
    return byTarget;
}

/** Factory for a single numeric DatumValue result */
function makeScalarDatum(measureName, group, categoryName, targetLabel, numericValue, name = null) {
    return [
        {
            category: categoryName ?? "result",
            measure: measureName ?? "value",
            target: targetLabel ?? "__result__",
            group: group ?? null,
            value: roundNumeric(Number(numericValue)),
            name: name ?? (targetLabel ?? "__result__"),
        },
    ];
}

// ---------------------------
// Operations
// ---------------------------

/** 3.1 retrieveValue */
export function retrieveValue(data, op) {
    const arr = cloneData(data);
    const { field, target, group } = op;
    const kind = inferFieldKind(arr, field) || "category";
    const byGroup = sliceByGroup(arr, group);
    const byField = byGroup.filter(predicateByField(field, kind));
    return byField.filter(
        (d) =>{
            return String(d.target) === String(target)
        }
    );
}

/** 3.2 filter */
export function filterData(data, op) {
    const arr = cloneData(data);
    const { field, operator, value, group } = op;
    const byGroup = sliceByGroup(arr, group);
    const kind = inferFieldKind(byGroup, field);
    const inField = byGroup.filter(predicateByField(field, kind));

    if (operator === "between") {
        const [start, end] = Array.isArray(value) ? value : [];
        if (start === undefined || end === undefined) {
            throw new Error('filter: "between" requires [start, end]');
        }
        // Apply to label (category) domain — inclusive
        return inField.filter((d) => {
            const t = d.target;
            const ts = Date.parse(t),
                s = Date.parse(start),
                e = Date.parse(end);
            if (!Number.isNaN(ts) && !Number.isNaN(s) && !Number.isNaN(e)) {
                return ts >= s && ts <= e;
            }
            // fallback to string compare
            return t >= String(start) && t <= String(end);
        });
    }

    // Numeric vs categorical dispatch
    if (kind === "measure") {
        return inField.filter((d) => evalOperator(operator, d.value, value));
    }
    // category
    return inField.filter((d) => evalOperator(operator, d.target, value));
}

/** 3.3 compare — returns the winning datum (array of one) */
export function compareOp(data, op) {
    const arr = cloneData(data);
    const { field, targetA, targetB, groupA, groupB, aggregate: agg, which = "max" } = op;
    const gA = groupA ?? op.group; // backward-compat: fall back to single `group` if provided
    const gB = groupB ?? op.group;
    const sA = sliceForTarget(arr, field, targetA, gA);
    const sB = sliceForTarget(arr, field, targetB, gB);
    if (sA.length === 0 || sB.length === 0) {
        throw new Error("compare: targetA/targetB not found in data slice");
    }
    const vA = aggregate(sA.map((d) => d.value), agg);
    const vB = aggregate(sB.map((d) => d.value), agg);
    const pickA = which === "max" ? vA >= vB : vA <= vB;
    const chosen = pickA ? sA[sA.length - 1] : sB[sB.length - 1];
    return [chosen];
}

/** 3.4 compareBool — returns BoolValue object */
export function compareBoolOp(data, op) {
    const arr = cloneData(data);
    const { field, targetA, targetB, groupA, groupB, operator } = op;
    const gA = groupA ?? op.group; // backward-compat
    const gB = groupB ?? op.group;
    const sA = sliceForTarget(arr, field, targetA, gA);
    const sB = sliceForTarget(arr, field, targetB, gB);
    if (sA.length === 0 || sB.length === 0) {
        throw new Error("compareBool: targetA/targetB not found in data slice");
    }
    // If multiple per target, compare deterministic aggregate-last
    const vA = aggregate(sA.map((d) => d.value));
    const vB = aggregate(sB.map((d) => d.value));
    const boolResult = evalOperator(operator, vA, vB);
    return new BoolValue(field || "value", boolResult);
}

/** 3.5 findExtremum */
export function findExtremum(data, op) {
    const arr = cloneData(data);
    const { field, which, group } = op;
    const byGroup = sliceByGroup(arr, group);
    const kind = inferFieldKind(byGroup, field) || "category";
    const section = byGroup.filter(predicateByField(field, kind));
    if (section.length === 0) return [];
    const normalized = section
        .map((datum) => ({
            datum,
            value: kind === "measure" ? datum.value : parseComparableValue(datum.target),
        }))
        .filter((entry) => entry.value !== null && entry.value !== undefined);
    if (normalized.length === 0) return [];
    const sorted = normalized
        .slice()
        .sort((a, b) => compareComparableValues(a.value, b.value));
    const pickMax = which !== "min";
    const chosen = pickMax ? sorted[sorted.length - 1] : sorted[0];
    return [chosen.datum];
}

/** 3.6 sort */
export function sortData(data, op) {
    const arr = cloneData(data);
    const { field, order = "asc", group } = op;
    const byGroup = sliceByGroup(arr, group);
    const kind = inferFieldKind(byGroup, field);
    const inField = byGroup.filter(predicateByField(field, kind));
    const others = byGroup.filter((d) => !inField.includes(d)); // sort only the slice; keep others after

    const sorted = inField.slice().sort((a, b) => {
        if (kind === "measure") {
            return order === "asc" ? cmpNumAsc(a.value, b.value) : cmpNumDesc(a.value, b.value);
        }
        // category lexical sort on target
        return order === "asc" ? cmpStrAsc(a.target, b.target) : cmpStrDesc(a.target, b.target);
    });

    return sorted.concat(others);
}

/** 3.7 determineRange — returns {category: <field>, min, max} */
export function determineRange(data, op) {
    const arr = cloneData(data);
    const { field, group } = op;
    const byGroup = sliceByGroup(arr, group);
    const kind = inferFieldKind(byGroup, field) || "measure";
    const inField = byGroup.filter(predicateByField(field, kind));
    if (inField.length === 0) return { category: field || "value", min: NaN, max: NaN };

    if (kind === "measure") {
        const vals = inField.map((d) => d.value);
        return {
            category: field || "value",
            min: roundNumeric(Math.min(...vals)),
            max: roundNumeric(Math.max(...vals))
        };
    }
    // category range: try date range, else lexicographic ordinal range as indices
    const targets = inField.map((d) => d.target);
    const parsed = targets.map((t) => Date.parse(t));
    if (parsed.every((ts) => !Number.isNaN(ts))) {
        return {
            category: field || "target",
            min: roundNumeric(Math.min(...parsed)),
            max: roundNumeric(Math.max(...parsed))
        };
    }
    // ordinal index range
    const uniq = Array.from(new Set(targets)).sort(cmpStrAsc);
    return {
        category: field || "target",
        min: roundNumeric(0),
        max: roundNumeric(Math.max(0, uniq.length - 1))
    };
}

/** 3.8 count — returns a single numeric DatumValue */
export function countData(data, op) {
    const arr = cloneData(data);
    const { group } = op;
    const byGroup = sliceByGroup(arr, group);
    const fieldLabel = op?.field || "target";
    const name = formatResultName("Count", fieldLabel, { group });
    return makeScalarDatum("value", group ?? null, "count", "__count__", byGroup.length, name);
}

/** 3.9 sum — returns a single numeric DatumValue */
export function sumData(data, op) {
    const arr = cloneData(data);
    const { field, group } = op;
    const byGroup = sliceByGroup(arr, group).filter(predicateByField(field, "measure"));
    const s = byGroup.reduce((acc, d) => acc + d.value, 0);
    const fieldLabel = field || "value";
    const name = formatResultName("Sum", fieldLabel, { group });
    return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, "__sum__", s, name);
}

/** 3.10 average — returns a single numeric DatumValue */
export function averageData(data, op) {
    const arr = cloneData(data);
    const { field, group } = op;
    const byGroup = sliceByGroup(arr, group).filter(predicateByField(field, "measure"));
    const fieldLabel = field || "value";
    const name = formatResultName("Average", fieldLabel, { group });
    if (byGroup.length === 0)
        return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, "__avg__", NaN, name);
    const avg = byGroup.reduce((acc, d) => acc + d.value, 0) / byGroup.length;
    return makeScalarDatum(fieldLabel, group ?? null, fieldLabel, "__avg__", avg, name);
}

/** 3.11 diff — returns a single numeric DatumValue (signed if op.signed) */
export function diffData(data, op) {
    const arr = cloneData(data);
    const { field, targetA, targetB, groupA, groupB, aggregate: agg, signed = true } = op;
    const gA = groupA ?? op.group; // backward-compat
    const gB = groupB ?? op.group;
    const sA = sliceForTarget(arr, field, targetA, gA);
    const sB = sliceForTarget(arr, field, targetB, gB);
    if (sA.length === 0 || sB.length === 0) {
        throw new Error("diff: targetA/targetB not found in data slice");
    }
    const vA = aggregate(sA.map((d) => d.value), agg);
    const vB = aggregate(sB.map((d) => d.value), agg);
    const d = signed ? vA - vB : Math.abs(vA - vB);
    const fieldLabel = field || "value";
    const labelA = formatTargetLabel(targetA);
    const labelB = formatTargetLabel(targetB);
    const detail = [labelA, labelB].filter(Boolean).join(" vs ");
    const name = formatResultName("Diff", fieldLabel, { group: op.group ?? null, detail });
    return makeScalarDatum(fieldLabel, op.group ?? null, fieldLabel, "__diff__", d, name);
}

/** 3.11b lagDiff — adjacent differences across an ordered sequence */
export function lagDiffData(data, op) {
    const arr = cloneData(data);
    const {
        field,
        orderField,
        order = "asc",
        group,
        absolute = false
    } = op || {};
    const byGroup = sliceByGroup(arr, group);
    if (byGroup.length < 2) return [];

    const measureName = field || byGroup[0]?.measure || "value";
    const categoryName = orderField || byGroup[0]?.category || "target";

    const decorated = byGroup.map((datum) => {
        const orderValue = parseComparableValue(
            orderField ? datum?.[orderField] ?? datum.target : datum.target
        );
        return { datum, orderValue };
    });

    const direction = order === "desc" ? -1 : 1;
    decorated.sort((a, b) => direction * compareComparableValues(a.orderValue, b.orderValue));

    const diffs = [];
    for (let i = 1; i < decorated.length; i++) {
        const curr = decorated[i].datum;
        const prev = decorated[i - 1].datum;
        if (!curr || !prev) continue;
        const diffValue = absolute
            ? Math.abs(Number(curr.value) - Number(prev.value))
            : Number(curr.value) - Number(prev.value);
        if (!Number.isFinite(diffValue)) continue;

        const resultDatum = {
            category: categoryName,
            measure: measureName,
            target: curr.target,
            group: curr.group ?? null,
            value: roundNumeric(diffValue),
            id: curr.id ? `${curr.id}_lagdiff` : undefined,
            prevTarget: prev.target
        };
        const labelPrev = formatTargetLabel(prev.target);
        const labelCurr = formatTargetLabel(curr.target);
        if (labelPrev || labelCurr) {
            resultDatum.name = labelPrev && labelCurr ? `${labelPrev} → ${labelCurr}` : (labelCurr || labelPrev);
        }
        diffs.push(resultDatum);
    }
    return diffs;
}

/** 3.12 nth — returns the n-th item in current ordering (1-based) */
export function nthData(data, op) {
    const arr = cloneData(data);
    const { n, from = "left", group } = op;
    const byGroup = sliceByGroup(arr, group);
    if (byGroup.length === 0) return [];
    const queryIndices = Array.isArray(n) ? n : [n];

    const normalized = queryIndices.map((value) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 1) return null;
        return Math.floor(num);
    }).filter((value) => value !== null);

    if (normalized.length === 0) return [];

    const baseSequence = from === "right" ? [...byGroup].reverse() : byGroup.slice();

    const results = [];
    normalized.forEach((rank) => {
        const idx = rank - 1;
        if (idx >= 0 && idx < baseSequence.length) {
            results.push(baseSequence[idx]);
        }
    });

    return results;
}

// ---------------------------
// Central dispatcher (optional)
// ---------------------------
export const LineChartOps = {
    retrieveValue,
    filter: filterData,
    compare: compareOp,
    compareBool: compareBoolOp,
    findExtremum,
    sort: sortData,
    determineRange,
    count: countData,
    sum: sumData,
    average: averageData,
    diff: diffData,
    lagDiff: lagDiffData,
    nth: nthData,
};

export default LineChartOps;
