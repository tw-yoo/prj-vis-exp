/**
 * Shared accessors for marks (bars/points).
 * Keeps per-mark key/value extraction consistent across chart types.
 */

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function getMarkValue(node) {
  if (!node) return null;
  const sel = d3.select(node);
  const vAttr = sel.attr("data-value");
  const attrVal = parseNumber(vAttr);
  if (attrVal != null) return attrVal;

  const d = sel.datum ? sel.datum() : null;
  if (d && typeof d === "object") {
    if (d.value != null && Number.isFinite(+d.value)) return +d.value;
    if (d.y != null && Number.isFinite(+d.y)) return +d.y;
    if (d.x != null && Number.isFinite(+d.x)) return +d.x;
  }
  return null;
}

export function getDatumKey(datum, fallback = "") {
  if (!datum) return String(fallback);
  return String(
    datum.target ??
    datum.id ??
    datum.key ??
    datum.label ??
    fallback
  );
}

export function getMarkKey(node, fallback = "") {
  const sel = d3.select(node);
  return String(
    sel.attr("data-id") ??
    sel.attr("data-key") ??
    sel.attr("data-target") ??
    sel.attr("data-category") ??
    sel.attr("data-name") ??
    fallback
  );
}

export function selectMarks(g, selector = "rect") {
  return g && typeof g.selectAll === "function" ? g.selectAll(selector) : d3.select(null);
}

export function selectByKey(g, key, selector = "rect") {
  const want = String(key);
  return selectMarks(g, selector).filter(function () {
    return getMarkKey(this) === want;
  });
}

export function selectExcept(g, keys, selector = "rect") {
  const set = new Set((keys || []).map(k => String(k)));
  return selectMarks(g, selector).filter(function () {
    return !set.has(getMarkKey(this));
  });
}
