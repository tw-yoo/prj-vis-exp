import { DatumValue } from "../../object/valueType.js";

function toTrimmedString(value) {
    if (value == null) return '';
    const str = String(value).trim();
    return str.length > 0 ? str : '';
}

function formatNumericHint(value) {
    if (value == null) return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    if (Number.isInteger(num)) {
        return num.toLocaleString();
    }
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function humanizeKey(value) {
    const trimmed = toTrimmedString(value);
    if (!trimmed) return '';
    const normalized = trimmed.replace(/[_\s]+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function deriveSourceHint(datum, fallbackId) {
    if (!datum) return humanizeKey(fallbackId);
    const rawId = toTrimmedString(datum.id);
    if (rawId) {
        const lastUnderscore = rawId.lastIndexOf('_');
        const base = lastUnderscore > 0 ? rawId.slice(0, lastUnderscore) : rawId;
        const humanized = humanizeKey(base);
        if (humanized) return humanized;
    }
    const lookup = toTrimmedString(datum.lookupId);
    if (lookup) {
        const humanizedLookup = humanizeKey(lookup);
        if (humanizedLookup) return humanizedLookup;
    }
    const target = toTrimmedString(datum.target);
    if (target) return target;
    return humanizeKey(fallbackId);
}

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

    const labelBlueprints = sanitized.map((datum, idx) => {
        const hasCustomName = typeof datum?.name === 'string' && datum.name.trim().length > 0;
        const baseLabel = hasCustomName
            ? datum.name.trim()
            : (() => {
                const targetLabel = toTrimmedString(datum?.target);
                return targetLabel || `Result ${idx + 1}`;
            })();
        const groupKey = toTrimmedString(datum?.group);
        const groupLabel = (!hasCustomName && groupKey) ? ` · ${groupKey}` : '';
        const normalizedId = toTrimmedString(datum?.id);
        const stableId = normalizedId || `last_${idx}`;
        const labelKey = `${baseLabel}||${groupKey}`;
        return { hasCustomName, baseLabel, groupLabel, stableId, labelKey };
    });

    const labelCounts = new Map();
    labelBlueprints.forEach(({ labelKey }) => {
        labelCounts.set(labelKey, (labelCounts.get(labelKey) || 0) + 1);
    });

    const compareData = sanitized.map((datum, idx) => {
        const blueprint = labelBlueprints[idx];
        const { hasCustomName, baseLabel, groupLabel, stableId, labelKey } = blueprint;
        const idHint = hasCustomName ? '' : (stableId.includes('_') ? ` (${stableId.split('_')[0]})` : '');
        const baseWithGroup = `${baseLabel}${groupLabel}${idHint}`;
        const needsDisambiguation = (labelCounts.get(labelKey) ?? 0) > 1;

        let targetLabel = baseWithGroup;
        if (needsDisambiguation) {
            const suffixParts = [];
            const numericHint = formatNumericHint(datum?.value);
            if (numericHint) suffixParts.push(numericHint);
            const idLabel = humanizeKey(stableId);
            const sourceHint = deriveSourceHint(datum, stableId);
            if (sourceHint && (!idLabel || !idLabel.toLowerCase().includes(sourceHint.toLowerCase()))) {
                suffixParts.push(sourceHint);
            }
            if (idLabel) suffixParts.push(idLabel);
            const uniqueSuffix = Array.from(new Set(suffixParts.filter(Boolean)));
            if (uniqueSuffix.length === 0) {
                uniqueSuffix.push(humanizeKey(stableId) || stableId);
            }
            targetLabel = `${baseWithGroup} — ${uniqueSuffix.join(' · ')}`;
        }

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
