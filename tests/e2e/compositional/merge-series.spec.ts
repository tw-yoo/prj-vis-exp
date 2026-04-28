import { expect, test } from '@playwright/test'
import { ChartType } from '../../../src/domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../src/domain/operation/types'
import { buildTreeFromList } from '../../../src/operation-next/operationTree'
import { planFrames } from '../../../src/operation-next/visualizationPlanner'

const result: DatumValue = {
  category: 'series',
  measure: 'value',
  semanticMeasure: 'sum(value)',
  target: '__sum__',
  group: null,
  value: 12,
}

test('plans merged stack synthetic mark for explicit series sum', () => {
  const ops: OperationSpec[] = [
    { op: OperationOp.Sum, target: ['A', 'B'], field: 'value', meta: { nodeId: 'n1' } },
    { op: OperationOp.Diff, targetA: 'ref:n1', targetB: 'C', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ]
  const frames = planFrames(buildTreeFromList(ops), new Map([['n1', [result]]]), ChartType.GROUPED_BAR)
  const overlays = frames.flatMap((frame) => frame.marks.overlays)

  expect(overlays).toEqual([
    {
      kind: 'mergedStack',
      components: ['A', 'B'],
      semanticMeasure: 'sum(A,B)',
    },
  ])
})
