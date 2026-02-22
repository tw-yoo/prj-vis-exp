import { ChartType, getChartType, type VegaLiteSpec } from '../../domain/chart'
import { renderVegaLiteChart } from '../../rendering/chartRenderer.ts'
import { assertDrawCapabilities } from '../../rendering/draw/capabilityGuard.ts'
import { normalizeSpec } from '../../domain/chart/normalizeSpec'
import { type OpsSpecInput } from '../../domain/operation/opsSpec'
import { runSimpleBarOps } from './simpleBarOps.ts'
import { runStackedBarOps } from './stackedBarOps.ts'
import { runGroupedBarOps } from './groupedBarOps.ts'
import { runSimpleLineOps } from './simpleLineOps.ts'
import { runMultipleLineOps } from './multipleLineOps.ts'
import type { SimpleBarSpec } from '../../rendering/bar/simpleBarRenderer.ts'
import type { StackedSpec } from '../../rendering/bar/stackedBarRenderer.ts'
import type { GroupedSpec } from '../../rendering/bar/groupedBarRenderer.ts'
import type { LineSpec } from '../../rendering/line/simpleLineRenderer.ts'
import type { MultiLineSpec } from '../../rendering/line/multipleLineRenderer.ts'

export async function runChartOps(container: HTMLElement, spec: VegaLiteSpec, opsSpec: OpsSpecInput) {
  const chartType = getChartType(spec)
  const normalized = normalizeSpec(spec)
  assertDrawCapabilities(chartType, opsSpec)

  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return runSimpleBarOps(container, normalized as SimpleBarSpec, opsSpec)
    case ChartType.STACKED_BAR:
      return runStackedBarOps(container, normalized as StackedSpec, opsSpec)
    case ChartType.GROUPED_BAR:
      return runGroupedBarOps(container, normalized as GroupedSpec, opsSpec)
    case ChartType.SIMPLE_LINE:
      return runSimpleLineOps(container, normalized as LineSpec, opsSpec)
    case ChartType.MULTI_LINE:
      return runMultipleLineOps(container, normalized as MultiLineSpec, opsSpec)
    default:
      console.warn('runChartOps: unknown chart type, running plain render then no-op ops')
      await renderVegaLiteChart(container, normalized)
      return normalized
  }
}
