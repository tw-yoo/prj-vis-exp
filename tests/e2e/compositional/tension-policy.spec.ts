import { expect, test } from '@playwright/test'
import { ChartType } from '../../../src/domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../../src/domain/operation/types'
import { buildTreeFromList } from '../../../src/operation-next/operationTree'
import { DEFAULT_POLICY, type TensionPolicy } from '../../../src/operation-next/tensionPolicy'
import { planFrames } from '../../../src/operation-next/visualizationPlanner'

const resultRow: DatumValue = {
  category: 'label',
  measure: 'value',
  semanticMeasure: 'value',
  target: 'A',
  group: null,
  value: 8,
  id: 'A',
}

test('fills every frame config from default policy', () => {
  const ops: OperationSpec[] = [
    { op: OperationOp.Average, field: 'value', meta: { nodeId: 'n1' } },
    { op: OperationOp.PairDiff, groupA: 'A', groupB: 'B', by: 'target', meta: { nodeId: 'n2' } },
  ]
  const frames = planFrames(buildTreeFromList(ops), new Map([['n1', [resultRow]], ['n2', [resultRow]]]), ChartType.MULTI_LINE)

  expect(frames.every((frame) => frame.config.annotationStrategy === DEFAULT_POLICY.annotationStrategy.default)).toBe(true)
  expect(frames.every((frame) => frame.config.rescaleAfterIsolation === DEFAULT_POLICY.rescaleAfterIsolation.default)).toBe(true)
  expect(frames.find((frame) => frame.derivedFrom.some((entry) => entry.opNodeId === 'n2'))?.config.arrowPlacement).toBe('inline')
})

test('applies explicit policy overrides to salience and rescale config', () => {
  const policy: TensionPolicy = {
    ...DEFAULT_POLICY,
    salienceStrategy: { default: 'remove' },
    rescaleAfterIsolation: { default: false, reversible: true },
  }
  const ops: OperationSpec[] = [
    { op: OperationOp.FindExtremum, which: 'max', meta: { nodeId: 'n1' } },
  ]
  const frames = planFrames(buildTreeFromList(ops), new Map([['n1', [resultRow]]]), ChartType.SIMPLE_BAR, policy)
  const saliencePrimitive = frames.flatMap((frame) => frame.primitives).find((primitive) => primitive.semanticKey.startsWith('f3:salience'))

  expect(frames[0].config.salienceStrategy).toBe('remove')
  expect(frames[0].config.rescaleAfterIsolation).toBe(false)
  expect((saliencePrimitive?.params as { level?: unknown } | undefined)?.level).toBe('remove')
})
