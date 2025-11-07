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
    slice = slice.filter((d) => d.target === String(category));
    return slice;
}

/** Factory for a single numeric DatumValue result */
function makeScalarDatum(measureName, group, categoryName, targetLabel, numericValue) {
    return [
        {
            category: categoryName ?? "result",
            measure: measureName ?? "value",
            target: targetLabel ?? "__result__",
            group: group ?? null,
            value: Number(numericValue),
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
    const inMeasure = byGroup.filter(predicateByField(field, "measure"));
    if (inMeasure.length === 0) return [];
    const sorted = inMeasure
        .slice()
        .sort((a, b) =>
            which === "min" ? cmpNumAsc(a.value, b.value) : cmpNumDesc(a.value, b.value)
        );
    return [sorted[0]];
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
        return { category: field || "value", min: Math.min(...vals), max: Math.max(...vals) };
    }
    // category range: try date range, else lexicographic ordinal range as indices
    const targets = inField.map((d) => d.target);
    const parsed = targets.map((t) => Date.parse(t));
    if (parsed.every((ts) => !Number.isNaN(ts))) {
        return { category: field || "target", min: Math.min(...parsed), max: Math.max(...parsed) };
    }
    // ordinal index range
    const uniq = Array.from(new Set(targets)).sort(cmpStrAsc);
    return { category: field || "target", min: 0, max: Math.max(0, uniq.length - 1) };
}

/** 3.8 count — returns a single numeric DatumValue */
export function countData(data, op) {
    const arr = cloneData(data);
    const { group } = op;
    const byGroup = sliceByGroup(arr, group);
    return makeScalarDatum("value", group ?? null, "count", "__count__", byGroup.length);
}

/** 3.9 sum — returns a single numeric DatumValue */
export function sumData(data, op) {
    const arr = cloneData(data);
    const { field, group } = op;
    const byGroup = sliceByGroup(arr, group).filter(predicateByField(field, "measure"));
    const s = byGroup.reduce((acc, d) => acc + d.value, 0);
    return makeScalarDatum(field || "value", group ?? null, field || "value", "__sum__", s);
}

/** 3.10 average — returns a single numeric DatumValue */
export function averageData(data, op) {
    const arr = cloneData(data);
    const { field, group } = op;
    const byGroup = sliceByGroup(arr, group).filter(predicateByField(field, "measure"));
    if (byGroup.length === 0)
        return makeScalarDatum(field || "value", group ?? null, field || "value", "__avg__", NaN);
    const avg = byGroup.reduce((acc, d) => acc + d.value, 0) / byGroup.length;
    return makeScalarDatum(field || "value", group ?? null, field || "value", "__avg__", avg);
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
    return makeScalarDatum(field || "value", op.group ?? null, field || "value", "__diff__", d);
}

/** 3.12 nth — returns the n-th item in current ordering (1-based) */
export function nthData(data, op) {
    const arr = cloneData(data);
    const { n, from = "left", group } = op;
    const byGroup = sliceByGroup(arr, group);
    if (!Number.isFinite(n) || n < 1) throw new Error('nth: "n" must be a positive integer');
    if (byGroup.length === 0) return [];
    const idx = from === "right" ? byGroup.length - n : n - 1;
    if (idx < 0 || idx >= byGroup.length) return [];
    return [byGroup[idx]];
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
    nth: nthData,
};

export default LineChartOps;