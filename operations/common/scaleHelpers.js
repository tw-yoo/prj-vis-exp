const AXIS_ATTRS = {
    x: { min: 'data-x-domain-min', max: 'data-x-domain-max' },
    y: { min: 'data-y-domain-min', max: 'data-y-domain-max' }
};

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function fromDomainValue(value) {
    if (value == null) return '';
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : '';
}

export function storeAxisDomain(svgNode, axis, domain) {
    if (!svgNode || !axis || !Array.isArray(domain) || domain.length < 2) return;
    const attrs = AXIS_ATTRS[axis];
    if (!attrs) return;
    const [minValue, maxValue] = domain;
    try {
        svgNode.setAttribute(attrs.min, fromDomainValue(minValue));
        svgNode.setAttribute(attrs.max, fromDomainValue(maxValue));
    } catch (_) {
        // no-op: SVG node may be detached (e.g., during reset); ignore safely
    }
}

export function readAxisDomain(svgNode, axis) {
    if (!svgNode || !axis) return null;
    const attrs = AXIS_ATTRS[axis];
    if (!attrs) return null;
    const rawMin = svgNode.getAttribute?.(attrs.min);
    const rawMax = svgNode.getAttribute?.(attrs.max);
    const min = toFiniteNumber(rawMin);
    const max = toFiniteNumber(rawMax);
    if (min == null || max == null) return null;
    if (min === max) {
        const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
        return [min - pad, max + pad];
    }
    return [min, max];
}

export function resolveLinearDomain(svgNode, axis, fallbackDomain) {
    const stored = readAxisDomain(svgNode, axis);
    if (stored) return stored;
    if (Array.isArray(fallbackDomain) && fallbackDomain.length >= 2) return fallbackDomain;
    return null;
}
