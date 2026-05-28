/**
 * Mark-key composition helpers.
 *
 * Each chart's base renderer stamps `DataAttributes.MarkKey` on every main
 * data mark (`rect.main-bar`, point `circle`, etc.) so subsequent op-driven
 * transitions can use the key as a stable identity in `.data(items, keyFn).join()`
 * calls.
 *
 * The composition rules below match the convention used by
 * `barMarkKey` in `operation-new/appliers/barGroup/_shared.ts` so applier-side
 * scope sets line up with what the renderer's rects carry. Keeping the
 * composition in one place avoids drift between renderer and applier code.
 */

/** Identity for simple bar / simple line: target alone uniquely identifies the mark. */
export function composeSimpleMarkKey(target: string | number): string {
  return String(target)
}

/** Identity for stacked bar segments: `${target}|${series}`. */
export function composeStackedMarkKey(target: string | number, series: string | number | null | undefined): string {
  const seriesPart = series == null ? '' : String(series)
  return `${String(target)}|${seriesPart}`
}

/**
 * Identity for grouped bar segments: `${panel}|${target}|${series}`. The
 * panel field is the facet/sub-chart identifier; for single-panel grouped
 * charts pass `'root'` (the convention used elsewhere in the engine).
 */
export function composeGroupedMarkKey(
  panel: string,
  target: string | number,
  series: string | number | null | undefined,
): string {
  const seriesPart = series == null ? '' : String(series)
  return `${panel}|${String(target)}|${seriesPart}`
}

/** Identity for multi-line points: `${series}|${target}`. The series leads so
 * a per-series transition can iterate by series cheaply. */
export function composeMultiLineMarkKey(series: string | number, target: string | number): string {
  return `${String(series)}|${String(target)}`
}
