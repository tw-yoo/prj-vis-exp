import type { ChartSpec } from '../domain/chart'
import type { RawRow } from '../domain/data'
import { toDatumValuesFromRaw } from '../domain/data'
import type { DatumValue } from '../domain/operation/types'
import { collectReferencedResultIds } from '../operation-next/diffEndpoint'
import { isOperationNextRunOutcome } from '../operation-next/executionState'
import type { OperationRuntimeSnapshot, RunChartOpsOptions } from '../operation-next/runChartOps'
import { resolveEncodingFields } from '../rendering/ops/common/resolveEncodingFields'

export { collectReferencedResultIds, isOperationNextRunOutcome }
export type { OperationRuntimeSnapshot, RunChartOpsOptions }

export function buildDatumValuesForSpec(spec: ChartSpec, rows: RawRow[]): DatumValue[] {
  const resolved = resolveEncodingFields(spec)
  if (!resolved) return []
  return toDatumValuesFromRaw(rows, {
    xField: resolved.xField,
    yField: resolved.yField,
    groupField: resolved.groupField ?? undefined,
  }, {
    panelField: resolved.panelField,
  })
}
