/**
 * Shared annotation cleanup helper.
 * The default selector set is a superset of all annotation classes used across bar/line ops.
 */

export const DEFAULT_ANNOTATION_SELECTORS = [
  ".annotation",
  ".filter-label",
  ".sort-label",
  ".value-tag",
  ".range-line",
  ".value-line",
  ".threshold-line",
  ".threshold-label",
  ".compare-label",
  ".extremum-highlight",
  ".extremum-label"
];

export function clearAnnotations(svg, extraSelectors = []) {
  if (!svg || typeof svg.selectAll !== "function") return;
  const selectors = [...DEFAULT_ANNOTATION_SELECTORS, ...extraSelectors].filter(Boolean);
  if (!selectors.length) return;
  svg.selectAll(selectors.join(", ")).remove();
}
