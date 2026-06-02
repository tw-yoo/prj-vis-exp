import { ChartType, type ChartSpec, type ChartTypeValue } from '../../../domain/chart'
import type { DatumValue } from '../../../domain/operation/types'
import {
  renderSimpleBarChart,
  setSimpleBarStoredData,
  type SimpleBarSpec,
} from '../../../rendering/bar/simpleBarRenderer'
import { storeRuntimeChartState } from '../../../rendering/utils/runtimeChartState'
import { storeDerivedChartState } from '../../../rendering/utils/derivedChartState'
import { detachInstance } from '../../../rendering-new/chartInstance'
import { buildSimpleBarFromGroup } from '../../../operation-next/runners/barGroupShared'

export { buildSimpleBarFromGroup }

/**
 * Group-scoped average on a grouped/stacked chart converts the chart to a
 * simple bar showing only that group's bars, then draws the average line on the
 * simple bar. This is the applier-side conversion: it renders the narrowed
 * simple-bar into the host and — crucially — signals the chart-type swap through
 * `storeDerivedChartState`, the ONLY channel the spec-only dispatcher +
 * `consumeDerivedChartState` orchestrators (ReviewPage / workbench / eval) read.
 *
 * The legacy `runGroupedBarAverageOperation` did this swap but signalled it only
 * via `storeRuntimeChartState`, which the new dispatcher ignores — so the next
 * op rebuilt the original grouped chart and the converted simple-bar + average
 * vanished. This is the load-bearing fix (R1). Mirrors the proven pattern in
 * `appliers/simpleLine/sort.ts`.
 *
 * @returns the converted `SimpleBarSpec` (so the caller can draw on the new
 *   simple-bar SVG), or `null` when the group has no rows to show.
 */
export async function convertGroupToSimpleBarSurface(
  host: HTMLElement,
  source: { type: ChartTypeValue; spec: ChartSpec },
  groupStr: string,
  workingData: DatumValue[],
): Promise<SimpleBarSpec | null> {
  const simpleSpec = buildSimpleBarFromGroup(source, groupStr, workingData)
  if (!simpleSpec) return null

  const rows = ((simpleSpec.data as { values?: unknown[] } | undefined)?.values ?? []) as Parameters<
    typeof setSimpleBarStoredData
  >[1]

  // Seed the simple-bar stored data so subsequent simple-bar runs see the
  // narrowed group rows (not the original grouped dataset), then render.
  setSimpleBarStoredData(host, rows)
  await renderSimpleBarChart(host, simpleSpec)

  // `storeRuntimeChartState` is inert for the new dispatcher (kept for any
  // residual legacy reader); `storeDerivedChartState` is the active routing
  // channel; `detachInstance` lets the next group's
  // `ensureSimpleBarChartInstance` rebuild cleanly. Same sequence as sort.ts.
  storeRuntimeChartState(host, { chartType: ChartType.SIMPLE_BAR, spec: simpleSpec, renderer: 'd3' })
  storeDerivedChartState(host, ChartType.SIMPLE_BAR, simpleSpec)
  detachInstance(host)

  return simpleSpec
}
