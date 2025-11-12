import { DatumValue } from "../../../object/valueType.js";

function toNumberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function coerceDatumValue(datum, idx, opKey, fallbackCategory, fallbackMeasure) {
    const categoryFallback = fallbackCategory ?? "category";
    const measureFallback = fallbackMeasure ?? "value";
    const category = (typeof datum?.category === "string" && datum.category.trim().length > 0)
        ? datum.category
        : categoryFallback;
    const measure = (typeof datum?.measure === "string" && datum.measure.trim().length > 0)
        ? datum.measure
        : measureFallback;
    const target = (datum && datum.target != null)
        ? String(datum.target)
        : (datum && category && datum[category] != null)
            ? String(datum[category])
            : `Result ${idx + 1}`;
    const group = datum?.group ?? null;
    const value = toNumberOrZero(datum?.value ?? datum?.[measure]);
    const stableId = `${opKey}_${idx}`;
    const lookupSource = datum?.lookupId ?? datum?.id ?? datum?.target ?? null;

    const dv = new DatumValue(category, measure, target, group, value, stableId);

    dv.lookupId = lookupSource != null ? String(lookupSource) : stableId;

    if (datum && typeof datum === "object") {
        const protectedKeys = new Set(["category", "measure", "target", "group", "value", "id", "lookupId"]);
        Object.keys(datum).forEach((key) => {
            if (protectedKeys.has(key)) return;
            dv[key] = datum[key];
        });
    }

    return dv;
}

export function normalizeCachedData(currentData, opKey, fallbackCategory, fallbackMeasure) {
    const arr = Array.isArray(currentData)
        ? currentData
        : (currentData != null ? [currentData] : []);
    return arr
        .filter(item => item != null)
        .map((datum, idx) => coerceDatumValue(datum, idx, opKey, fallbackCategory, fallbackMeasure));
}
