import { DatumValue } from "../../object/valueType.js";

export function normalizeLagDiffResults(diffs, fallbackCategory = "target", fallbackMeasure = "value") {
    if (!Array.isArray(diffs) || diffs.length === 0) return [];

    return diffs.map((diff = {}, idx) => {
        const category = typeof diff.category === "string" && diff.category.length > 0
            ? diff.category
            : fallbackCategory;
        const measure = typeof diff.measure === "string" && diff.measure.length > 0
            ? diff.measure
            : fallbackMeasure;
        const targetLabel = diff.target != null ? String(diff.target) : `step_${idx + 1}`;
        const groupValue = diff.group ?? null;
        const value = Number.isFinite(Number(diff.value)) ? Number(diff.value) : 0;
        const stableId = diff.id != null ? String(diff.id) : `${targetLabel}_lagdiff_${idx}`;

        const datum = new DatumValue(category, measure, targetLabel, groupValue, value, stableId);
        datum.lookupId = stableId;
        if (diff.prevTarget != null) {
            datum.prevTarget = diff.prevTarget;
        }
        return datum;
    });
}
