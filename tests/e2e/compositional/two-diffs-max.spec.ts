import { expect, test } from '@playwright/test'
import { ChartType } from '../../../src/domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../src/domain/operation/types'
import { buildTreeFromList } from '../../../src/operation-next/operationTree'
import { planFrames } from '../../../src/operation-next/visualizationPlanner'

const row = (target: string, value: number): DatumValue => ({
  category: 'label',
  measure: 'value',
  semanticMeasure: 'value',
  target,
  group: null,
  value,
  id: target,
})

test('plans two sibling diffs and highlights the larger result', () => {
  const ops: OperationSpec[] = [
    { op: OperationOp.Diff, targetA: 'A', targetB: 'B', meta: { nodeId: 'n1' } },
    { op: OperationOp.Diff, targetA: 'C', targetB: 'D', meta: { nodeId: 'n2' } },
    { op: OperationOp.FindExtremum, which: 'max', meta: { nodeId: 'n3', inputs: ['n1', 'n2'] } },
  ]
  const tree = buildTreeFromList(ops)
  const frames = planFrames(
    tree,
    new Map([
      ['n1', [row('__diff_ab__', 10)]],
      ['n2', [row('__diff_cd__', 4)]],
      ['n3', [row('__diff_ab__', 10)]],
    ]),
    ChartType.SIMPLE_BAR,
  )

  const diffPrimitives = frames.flatMap((frame) => frame.primitives).filter((primitive) => primitive.semanticKey.startsWith('f2:diff'))
  const maxHighlight = frames.flatMap((frame) => frame.primitives).find((primitive) => primitive.semanticKey.startsWith('f3:salience'))

  expect(tree[2].inputs.map((input) => input.nodeId)).toEqual(['n1', 'n2'])
  expect(diffPrimitives).toHaveLength(2)
  expect(maxHighlight?.semanticKey).toContain('__diff_ab__')
})
