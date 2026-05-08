import { expect, test } from '@playwright/test'
import { ChartType, type ChartSpec } from '../../src/domain/chart'
import { OperationOp, type DatumValue, type OperationSpec } from '../../src/domain/operation/types'
import { resolveFilterVisualDecision, resolveXAxisKind } from '../../src/operation-next/filterSaliencePolicy'

function specWithXType(type: string, xField = 'Year'): ChartSpec {
  return {
    mark: 'bar',
    data: { values: [] },
    encoding: {
      x: { field: xField, type },
      y: { field: 'value', type: 'quantitative' },
    },
  }
}

function rows(targets: string[], category = 'Year'): DatumValue[] {
  return targets.map((target, index) => ({
    category,
    measure: 'value',
    target,
    group: null,
    value: index + 1,
  }))
}

test('resolveXAxisKind uses encoding, hints, and year-like nominal values', () => {
  expect(resolveXAxisKind(specWithXType('temporal'), { op: OperationOp.Filter }, rows(['USA']))).toBe('temporal')
  expect(resolveXAxisKind(specWithXType('nominal', 'country'), { op: OperationOp.Filter, xKindHint: 'temporal' }, rows(['2019', '2020'], 'country'))).toBe('temporal')
  expect(resolveXAxisKind(specWithXType('nominal', 'Year'), { op: OperationOp.Filter }, rows(['2019', '2020']))).toBe('temporal')
  expect(resolveXAxisKind(specWithXType('nominal', 'country'), { op: OperationOp.Filter }, rows(['USA', 'KOR'], 'country'))).toBe('nominal')
})

test('resolveFilterVisualDecision separates contiguous temporal remove from non-contiguous dim', () => {
  const originalData = rows(['2018', '2019', '2020', '2021'])
  const filterOp: OperationSpec = {
    id: 'n1',
    op: OperationOp.Filter,
    field: 'Year',
    operator: 'between',
    value: ['2018', '2019'],
    xKindHint: 'temporal',
    meta: { nodeId: 'n1', inputs: [] },
  }
  const averageOp: OperationSpec = {
    id: 'n2',
    op: OperationOp.Average,
    field: 'value',
    meta: { nodeId: 'n2', inputs: ['n1'] },
  }

  expect(resolveFilterVisualDecision({
    spec: specWithXType('nominal', 'Year'),
    chartType: ChartType.SIMPLE_BAR,
    operation: filterOp,
    filteredData: rows(['2018', '2019']),
    originalData,
    groupOps: [filterOp, averageOp],
    operationIndex: 0,
  })).toMatchObject({ mode: 'remove', xKind: 'temporal', isContiguous: true })

  const diffOp: OperationSpec = {
    id: 'n2',
    op: OperationOp.Diff,
    field: 'value',
    targetA: '2018',
    targetB: '2020',
    meta: { nodeId: 'n2', inputs: ['n1'] },
  }

  expect(resolveFilterVisualDecision({
    spec: specWithXType('nominal', 'Year'),
    chartType: ChartType.SIMPLE_BAR,
    operation: filterOp,
    filteredData: rows(['2018', '2020']),
    originalData,
    groupOps: [filterOp, diffOp],
    operationIndex: 0,
  })).toMatchObject({ mode: 'dim', xKind: 'temporal', isContiguous: false })
})

test('resolveFilterVisualDecision honors explicit filter salience override', () => {
  const filterOp: OperationSpec = {
    id: 'n1',
    op: OperationOp.Filter,
    field: 'country',
    include: ['USA'],
    meta: { nodeId: 'n1', inputs: [] },
  }
  const averageOp: OperationSpec = {
    id: 'n2',
    op: OperationOp.Average,
    field: 'value',
    meta: { nodeId: 'n2', inputs: ['n1'] },
  }

  expect(resolveFilterVisualDecision({
    spec: specWithXType('nominal', 'country'),
    chartType: ChartType.SIMPLE_BAR,
    operation: filterOp,
    filteredData: rows(['USA'], 'country'),
    originalData: rows(['USA', 'KOR'], 'country'),
    groupOps: [filterOp, averageOp],
    operationIndex: 0,
    policy: {
      salienceStrategy: { default: 'dim', perOp: { [OperationOp.Filter]: 'dim' } },
      annotationStrategy: { default: 'in-place' },
      arrowPlacement: { default: 'right-edge' },
      densityMode: { default: 'all' },
      rescaleAfterIsolation: { default: true, reversible: true },
    },
  })).toMatchObject({ mode: 'dim', yDomainMode: 'preserve' })
})
