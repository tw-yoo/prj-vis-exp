import { DatumValue } from "../../object/valueType.js";

export function extractLastText(textSpec = {}) {
    if (!textSpec) return '';
    if (typeof textSpec === 'string') return textSpec;
    if (typeof textSpec.last === 'string') return textSpec.last;
    if (textSpec.text && typeof textSpec.text.last === 'string') return textSpec.text.last;
    return '';
}

export function ensurePercentDiffAggregate(opsSpec, textSpec) {
    if (!opsSpec || !Array.isArray(opsSpec.last)) return;
    const lastText = extractLastText(textSpec);
    if (!lastText || !/percent|%/i.test(lastText)) return;
    const wantsOneDecimal = /one\s+decimal|1\s+decimal/i.test(lastText);
    opsSpec.last.forEach(op => {
        if (op && op.op === 'diff' && !op.aggregate) {
            op.aggregate = 'percentage_of_total';
            if (op.precision == null && wantsOneDecimal) {
                op.precision = 1;
            }
        }
    });
}

export function buildCompareDatasetFromCache(cachedResults, fallbackCategory = 'category', fallbackMeasure = 'value') {
    const datumResults = cachedResults.filter(d => d instanceof DatumValue);
    if (datumResults.length === 0) return null;

    const categories = new Set();
    const measures = new Set();
    const sanitized = datumResults.map(d => {
        const categoryName = (typeof d.category === 'string') ? d.category.trim() : '';
        if (categoryName) categories.add(categoryName);
        const measureName = (typeof d.measure === 'string') ? d.measure.trim() : '';
        if (measureName) measures.add(measureName);
        return d;
    });

    const firstCategory = categories.size > 0 ? categories.values().next().value : '';
    const firstMeasure = measures.size > 0 ? measures.values().next().value : '';
    const canonicalCategory = (categories.size === 1 && firstCategory) ? firstCategory : fallbackCategory;
    const canonicalMeasure = (measures.size === 1 && firstMeasure) ? firstMeasure : fallbackMeasure;

    const axisLabelOverrides = {};
    if (!(categories.size === 1 && firstCategory)) {
        axisLabelOverrides.x = null;
    }
    if (!(measures.size === 1 && firstMeasure)) {
        axisLabelOverrides.y = null;
    }

    const compareData = sanitized.map((datum, idx) => {
        const hasCustomName = typeof datum?.name === 'string' && datum.name.trim().length > 0;
        const baseLabel = hasCustomName
            ? datum.name.trim()
            : (() => {
                if (datum && datum.target != null) {
                    const t = String(datum.target).trim();
                    if (t.length > 0) return t;
                }
                return `Result ${idx + 1}`;
            })();
        const groupLabel = (!hasCustomName && datum.group != null) ? ` · ${String(datum.group)}` : '';
        const normalizedId = (typeof datum?.id === 'string') ? datum.id.trim() : '';
        const stableId = (normalizedId.length > 0)
            ? normalizedId
            : `last_${idx}`;
        const idHint = hasCustomName ? '' : (stableId.includes('_') ? ` (${stableId.split('_')[0]})` : '');
        const targetLabel = `${baseLabel}${groupLabel}${idHint}`;
        const dv = new DatumValue(
            canonicalCategory,
            canonicalMeasure,
            targetLabel,
            datum.group ?? null,
            datum.value,
            stableId
        );
        dv.name = baseLabel;
        const lookup = datum?.lookupId ?? stableId;
        if (lookup != null) {
            dv.lookupId = String(lookup);
        }
        return dv;
    });

    const specOpts = {};
    if (Object.keys(axisLabelOverrides).length > 0) {
        specOpts.axisLabels = axisLabelOverrides;
    }

    return { compareData, specOpts };
}
