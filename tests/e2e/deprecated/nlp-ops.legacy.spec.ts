import { expect, test } from '@playwright/test'
import { convertLambdaToOpsSpec } from '../../../src/deprecated/nlp_ts_pipeline/application/services/lambdaToOpsSpec'
import { resolveChartContext } from '../../../src/deprecated/nlp_ts_pipeline/application/services/chartContextResolver'
import { parseToOperationSpec } from '../../../src/api/nlp-ops'
import type { GenerateLambdaResponse } from '../../../src/deprecated/nlp_ts_pipeline/domain/nlp'

const STACKED_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  data: {
    values: [
      { month: '1', weather: 'sun', count: 10 },
      { month: '1', weather: 'rain', count: 4 },
      { month: '2', weather: 'sun', count: 8 },
      { month: '2', weather: 'rain', count: 6 },
      { month: '3', weather: 'sun', count: 12 },
      { month: '3', weather: 'rain', count: 3 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'month', type: 'nominal' },
    y: { field: 'count', type: 'quantitative' },
    color: { field: 'weather', type: 'nominal' },
  },
} as const

test('lambda -> ops 변환은 멀티 그룹과 참조 키를 생성한다', async () => {
  const context = resolveChartContext(STACKED_SPEC as any)
  const converted = convertLambdaToOpsSpec(
    [
      { step: 1, operation: 'FILTER', condition: 'month in [1,2,3]', output_variable: 'ops_0' },
      { step: 2, operation: 'FILTER', condition: 'weather == sun', output_variable: 'ops_1' },
      { step: 3, operation: 'AGG_SUM', output_variable: 'ops_2' },
      { step: 4, operation: 'FILTER', condition: 'weather == rain', output_variable: 'ops2_0' },
      { step: 5, operation: 'AGG_SUM', output_variable: 'ops2_1' },
      { step: 6, operation: 'MATH_DIFF', input_variable: 'ops_2,ops2_1', output_variable: 'last_0' },
    ],
    context,
  )

  expect(converted.warnings).toEqual([])
  expect(converted.opsSpec.ops).toHaveLength(3)
  expect(converted.opsSpec.ops2).toHaveLength(2)
  expect(converted.opsSpec.last).toHaveLength(1)

  const diff = converted.opsSpec.last[0]
  expect(diff.op).toBe('diff')
  expect(diff.targetA).toBe('ops_2')
  expect(diff.targetB).toBe('ops2_1')
})

test('lambda -> ops 변환은 핵심 연산 기본 매핑을 수행한다', async () => {
  const context = resolveChartContext(STACKED_SPEC as any)
  const converted = convertLambdaToOpsSpec(
    [
      { step: 1, operation: 'ARGMAX' },
      { step: 2, operation: 'AGG_AVG' },
      { step: 3, operation: 'COUNT' },
      { step: 4, operation: 'SORT', order: 'desc' },
    ],
    context,
  )

  expect(converted.opsSpec.ops[0].op).toBe('findExtremum')
  expect(converted.opsSpec.ops[1].op).toBe('average')
  expect(converted.opsSpec.ops[2].op).toBe('count')
  expect(converted.opsSpec.ops[3].op).toBe('sort')
  expect(converted.warnings).toEqual([])
})

test('parseToOperationSpec API는 nlp 응답을 trace와 함께 opsSpec으로 변환한다', async () => {
  const mockLambda: GenerateLambdaResponse = {
    resolved_text: 'find max then sum',
    lambda_expression: [
      { step: 1, operation: 'ARGMAX', output_variable: 'ops_0' },
      { step: 2, operation: 'AGG_SUM', output_variable: 'ops_1' },
    ],
    ops_spec: {
      ops: [{ op: 'count', field: 'month' } as any],
    },
    syntax_features: [
      {
        sentence_index: 1,
        text: 'find max then sum',
        root_action: 'find',
      },
    ],
    mark_terms: ['bar'],
    visual_terms: ['longest'],
    rewrite_trace: [
      { step: 'mark_detection', before: 'find max then sum', after: 'find max then sum' },
    ],
    warnings: [],
  }

  const response = await parseToOperationSpec({
    text: 'find max then sum',
    spec: STACKED_SPEC as any,
    endpoint: 'http://unused.local',
    fetcher: async () =>
      new Response(JSON.stringify(mockLambda), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  })

  expect(response.resolvedText).toBe('find max then sum')
  expect(response.opsSpec.ops).toHaveLength(1)
  expect(response.opsSpec.ops[0].op).toBe('count')
  expect(response.trace.mark_terms).toEqual(['bar'])
})
