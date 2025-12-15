/**
 * Shared data operation helpers (formatting/label utilities)
 * Used by both bar and line operation functions to avoid duplication.
 */

const ROUND_PRECISION = 2;
const ROUND_FACTOR = 10 ** ROUND_PRECISION;

export function roundNumeric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

export function toTrimmedString(value, fallback = "") {
  if (value == null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

export function formatFieldLabel(field, fallback = "value") {
  const label = toTrimmedString(field, fallback);
  return label || fallback;
}

export function formatGroupSuffix(group) {
  const label = toTrimmedString(group, "");
  return label ? ` (${label})` : "";
}

export function formatTargetLabel(selector) {
  if (Array.isArray(selector)) {
    const labels = selector
      .map(entry => formatTargetLabel(entry))
      .filter(label => typeof label === "string" && label.length > 0);
    if (labels.length === 0) return "Multiple targets";
    return labels.join(" + ");
  }
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

export function formatResultName(kind, field, opts = {}) {
  const baseField = formatFieldLabel(field);
  const groupPart = formatGroupSuffix(opts.group);
  const detailPart = toTrimmedString(opts.detail, "");
  const detailSuffix = detailPart ? ` — ${detailPart}` : "";
  return `${kind} of ${baseField}${groupPart}${detailSuffix}`;
}
