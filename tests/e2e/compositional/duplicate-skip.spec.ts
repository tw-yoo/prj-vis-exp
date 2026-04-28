import { expect, test } from '@playwright/test'
import { ChartType } from '../../../src/domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../src/domain/operation/types'
import { buildTreeFromList } from '../../../src/operation-next/operationTree'
import { planFrames } from '../../../src/operation-next/visualizationPlanner'

const maxRow: DatumValue = {
  category: 'label',
  measure: 'value',
  semanticMeasure: 'value',
  target: 'A',
  group: null,
  value: 10,
  id: 'A',
}

test('skips duplicate salience primitive for extrema followed by retrieve value', () => {
  const ops: OperationSpec[] = [
    { op: OperationOp.FindExtremum, which: 'max', meta: { nodeId: 'n1' } },
    { op: OperationOp.RetrieveValue, target: 'A', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ]
  const frames = planFrames(
    buildTreeFromList(ops),
    new Map([
      ['n1', [maxRow]],
      ['n2', [maxRow]],
    ]),
    ChartType.SIMPLE_BAR,
  )
  const salienceKeys = frames
    .flatMap((frame) => frame.primitives)
    .filter((primitive) => primitive.semanticKey.startsWith('f3:salience'))
    .map((primitive) => primitive.semanticKey)

  expect(salienceKeys).toHaveLength(1)
  expect(salienceKeys[0]).toContain('A')
})
