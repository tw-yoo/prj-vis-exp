import { DatumValue } from "../object/valueType.js";

const runtimeResults = new Map();

export function resetRuntimeResults() {
    runtimeResults.clear();
}

function cloneDatumValue(datum) {
    const clone = new DatumValue(
        datum.category ?? "category",
        datum.measure ?? "value",
        datum.target,
        datum.group ?? null,
        datum.value,
        datum.id ?? null
    );
    if (datum.lookupId != null) {
        clone.lookupId = String(datum.lookupId);
    } else if (datum.id != null) {
        clone.lookupId = String(datum.id);
    }
    if (datum.name != null) {
        clone.name = datum.name;
    }
    return clone;
}

function toRuntimeDatum(entry, key, idx) {
    if (!entry || typeof entry !== "object") return null;

    if (entry instanceof DatumValue) {
        const clone = cloneDatumValue(entry);
        const id = entry.id != null ? String(entry.id) : String(key);
        clone.id = id;
        clone.lookupId = entry.lookupId != null ? String(entry.lookupId) : id;
        return clone;
    }

    const id = entry.id != null ? String(entry.id) : String(key);
    const category = typeof entry.category === "string" && entry.category.trim().length > 0
        ? entry.category
        : (typeof entry.category === "string" ? entry.category : "category");
    const measure = typeof entry.measure === "string" && entry.measure.trim().length > 0
        ? entry.measure
        : (typeof entry.measure === "string" ? entry.measure : "value");
    const target =
        entry.target != null
            ? String(entry.target)
            : entry.lookupId != null
                ? String(entry.lookupId)
                : id;
    const group = entry.group != null ? entry.group : (entry.series != null ? entry.series : null);

    const rawValue = entry.value ?? entry[measure] ?? entry.amount ?? entry.y ?? entry.x;
    const numericValue = Number(rawValue);
    const value = Number.isFinite(numericValue) ? numericValue : rawValue;
    if (!Number.isFinite(Number(value))) return null;

    const datum = new DatumValue(category, measure, target, group, Number(value), id);
    datum.lookupId = entry.lookupId != null ? String(entry.lookupId) : id;
    if (entry.name != null) {
        datum.name = entry.name;
    }
    return datum;
}

export function storeRuntimeResult(key, result) {
    if (key == null) return;
    const id = String(key);
    if (result == null) {
        runtimeResults.delete(id);
        return;
    }
    const arr = Array.isArray(result) ? result : [result];
    const normalized = arr
        .map((entry, idx) => toRuntimeDatum(entry, id, idx))
        .filter(Boolean);
    if (normalized.length === 0) {
        runtimeResults.delete(id);
        return;
    }
    runtimeResults.set(id, normalized);
}

export function getRuntimeResultsById(key) {
    if (key == null) return [];
    const id = String(key);
    const stored = runtimeResults.get(id);
    if (!stored || stored.length === 0) return [];
    return stored.map(cloneDatumValue);
}

export function makeRuntimeKey(opKey, index) {
    const base = opKey != null ? String(opKey) : "step";
    const suffix = Number.isFinite(index) ? Number(index) : 0;
    return `${base}_${suffix}`;
}
