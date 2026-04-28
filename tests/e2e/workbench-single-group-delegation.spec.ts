import { expect, test, type Page } from '@playwright/test'
import { GROUPED_BAR_SPEC, MULTI_LINE_SPEC, STACKED_BAR_SPEC } from './fixtures/specs'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

const STACKED_NUMERIC_MONTH_SPEC = JSON.stringify(
  {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E stacked bar fixture with numeric-like month labels',
    data: {
      values: [
        { month: '1', weather: 'rain', count: 35 },
        { month: '1', weather: 'sun', count: 33 },
        { month: '2', weather: 'rain', count: 40 },
        { month: '2', weather: 'sun', count: 30 },
        { month: '10', weather: 'rain', count: 20 },
        { month: '10', weather: 'sun', count: 45 },
        { month: '12', weather: 'rain', count: 23 },
        { month: '12', weather: 'sun', count: 40 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'month', type: 'nominal', sort: null },
      y: { field: 'count', type: 'quantitative' },
      color: { field: 'weather', type: 'nominal' },
    },
  },
  null,
  2,
)

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

async function captureRenderIdentity(page: Page) {
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="chart-host"] svg')
    ;(window as Window & { __delegationRenderIdentity?: { svg: Element | null; epoch: string | null } }).__delegationRenderIdentity = {
      svg,
      epoch: svg?.getAttribute('data-render-epoch') ?? null,
    }
  })
}

async function runSingleOpsGroup(page: Page, ops: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify({ ops }, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
  const startButton = page.getByRole('button', { name: 'Start' })
  await expect(startButton).toBeVisible({ timeout: 30_000 })
  await expect(startButton).toBeEnabled({ timeout: 30_000 })
  await startButton.click()
  await expect(startButton).toBeHidden({ timeout: 30_000 })
}

async function runSingleOpsGroupAllowInstant(page: Page, ops: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify({ ops }, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
  const startButton = page.getByRole('button', { name: 'Start' })
  const startAppeared = await startButton.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)
  if (!startAppeared) return
  await expect(startButton).toBeEnabled({ timeout: 30_000 })
  await startButton.click()
  await expect(startButton).toBeHidden({ timeout: 30_000 })
}

async function explanationText(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
      .join(' '),
  )
}

test('stacked findExtremum(group string)은 simple bar 위임 후 라벨이 과다 반복되지 않는다', async ({ page }) => {
  await renderSpec(page, STACKED_BAR_SPEC)
  await captureRenderIdentity(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'findExtremum',
      field: 'count',
      which: 'max',
      group: 'rain',
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const identity = (window as Window & { __delegationRenderIdentity?: { svg: Element | null; epoch: string | null } })
      .__delegationRenderIdentity
    const chartType = host?.__chartRuntimeState?.chartType ?? null
    const barCount = document.querySelectorAll('svg rect.main-bar').length
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    return {
      chartType,
      barCount,
      sameSvg: identity?.svg === document.querySelector('[data-testid="chart-host"] svg'),
      sameEpoch:
        identity?.epoch === document.querySelector('[data-testid="chart-host"] svg')?.getAttribute('data-render-epoch'),
      text6Count: texts.filter((value) => value === '6').length,
      textCount: texts.length,
    }
  })

  expect(snapshot.chartType).toBe('Simple bar chart')
  expect(snapshot.barCount).toBe(3)
  expect(snapshot.sameSvg).toBe(true)
  expect(snapshot.sameEpoch).toBe(true)
  expect(snapshot.text6Count).toBe(1)
  expect(snapshot.textCount).toBe(1)
})

test('grouped findExtremum(group 단일 리스트)은 simple bar 위임으로 처리된다', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  await captureRenderIdentity(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'findExtremum',
      field: 'value',
      which: 'max',
      group: ['Surgical'],
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const identity = (window as Window & { __delegationRenderIdentity?: { svg: Element | null; epoch: string | null } })
      .__delegationRenderIdentity
    const chartType = host?.__chartRuntimeState?.chartType ?? null
    const barCount = document.querySelectorAll('svg rect.main-bar').length
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    return {
      chartType,
      barCount,
      sameSvg: identity?.svg === document.querySelector('[data-testid="chart-host"] svg'),
      sameEpoch:
        identity?.epoch === document.querySelector('[data-testid="chart-host"] svg')?.getAttribute('data-render-epoch'),
      text120Count: texts.filter((value) => value === '120').length,
    }
  })

  expect(snapshot.chartType).toBe('Simple bar chart')
  expect(snapshot.barCount).toBe(3)
  expect(snapshot.sameSvg).toBe(true)
  expect(snapshot.sameEpoch).toBe(true)
  expect(snapshot.text120Count).toBe(1)
})

test('multiple line findExtremum(group 단일 리스트)은 simple line 위임으로 처리된다', async ({ page }) => {
  await renderSpec(page, MULTI_LINE_SPEC)
  await captureRenderIdentity(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'findExtremum',
      field: 'value',
      which: 'max',
      group: ['A'],
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const identity = (window as Window & { __delegationRenderIdentity?: { svg: Element | null; epoch: string | null } })
      .__delegationRenderIdentity
    const chartType = host?.__chartRuntimeState?.chartType ?? null
    const hasSeriesAttr = document.querySelectorAll('svg [data-series]').length > 0
    return {
      chartType,
      hasSeriesAttr,
      sameSvg: identity?.svg === document.querySelector('[data-testid="chart-host"] svg'),
      sameEpoch:
        identity?.epoch ===
        document.querySelector('[data-testid="chart-host"] svg')?.getAttribute('data-render-epoch'),
    }
  })

  expect(snapshot.chartType).toBe('Simple line chart')
  expect(snapshot.hasSeriesAttr).toBe(false)
  expect(snapshot.sameSvg).toBe(true)
  expect(snapshot.sameEpoch).toBe(true)
})

test('stacked findExtremum(group=rain)에서 숫자 target 오매칭 없이 단일 라벨만 표시된다', async ({ page }) => {
  await renderSpec(page, STACKED_NUMERIC_MONTH_SPEC)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'findExtremum',
      field: 'count',
      which: 'max',
      group: 'rain',
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const chartType = host?.__chartRuntimeState?.chartType ?? null
    const bars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
    const highlighted = bars.filter((bar) => (bar.getAttribute('fill') ?? '').toLowerCase() === '#ef4444').length
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    return {
      chartType,
      highlighted,
      text40Count: texts.filter((value) => value === '40').length,
      textCount: texts.length,
    }
  })

  expect(snapshot.chartType).toBe('Simple bar chart')
  expect(snapshot.highlighted).toBe(1)
  expect(snapshot.text40Count).toBe(1)
  expect(snapshot.textCount).toBe(1)
})

test('stacked/grouped 단일 group 위임 후 retrieveValue/filter/diff/average/nth/scale가 simple bar 경로에서 유지된다', async ({ page }) => {
  const cases: Array<{
    label: string
    spec: string
    ops: unknown[]
    explanation: string
    visibleBars?: number
    preserveSvgIdentity?: boolean
  }> = [
    {
      label: 'stacked retrieveValue',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'retrieveValue', field: 'count', group: 'rain', target: 'Feb', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The value of Feb is 6.',
    },
    {
      label: 'stacked filter',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'filter', field: 'count', group: 'rain', operator: 'between', value: [4, 6], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The chart shows values between 4 and 6.',
      visibleBars: 2,
    },
    {
      label: 'stacked diff',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'diff', field: 'count', group: 'rain', targetA: 'Jan', targetB: 'Feb', signed: false, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The difference between Jan and Feb is 2.',
      visibleBars: 2,
      preserveSvgIdentity: false,
    },
    {
      label: 'stacked compareBool',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'compareBool', field: 'count', targetA: { target: 'Jan', series: 'rain' }, targetB: { target: 'Feb', series: 'rain' }, operator: '<=', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'Jan is less than or equal to Feb.',
      visibleBars: 2,
      preserveSvgIdentity: false,
    },
    {
      label: 'stacked average',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'average', field: 'count', group: 'rain', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The average of rain is 4.33.',
    },
    {
      label: 'stacked nth',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'nth', group: 'rain', n: 1, from: 'right', orderField: 'value', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The 1st value from right is 6.',
    },
    {
      label: 'stacked scale',
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'scale', field: 'count', group: 'rain', target: 'Jan', factor: 2, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The value of Jan scaled by 2 is 8.',
    },
    {
      label: 'grouped retrieveValue',
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'retrieveValue', field: 'value', group: ['Surgical'], target: 'USA', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The value of USA is 120.',
    },
    {
      label: 'grouped filter',
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'filter', field: 'value', group: ['Surgical'], operator: 'between', value: [100, 120], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The chart shows values between 100 and 120.',
      visibleBars: 2,
    },
    {
      label: 'grouped average',
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'average', field: 'value', group: ['Surgical'], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The average of Surgical is 103.33.',
    },
    {
      label: 'grouped diffByValue',
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'diffByValue', field: 'value', group: 'Surgical', value: 100, signed: true, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: "Each value's difference from 100 is shown.",
      visibleBars: 2,
      preserveSvgIdentity: false,
    },
    {
      label: 'grouped nth',
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'nth', group: ['Surgical'], n: 1, from: 'right', orderField: 'value', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The 1st value from right is 120.',
    },
    {
      label: 'grouped scale',
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'scale', field: 'value', group: ['Surgical'], target: 'KOR', factor: 2, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The value of KOR scaled by 2 is 200.',
    },
  ]

  for (const testCase of cases) {
    await renderSpec(page, testCase.spec)
    await captureRenderIdentity(page)
    await runSingleOpsGroupAllowInstant(page, testCase.ops)
    await expect.poll(() => explanationText(page), { message: testCase.label }).toBe(testCase.explanation)
    const snapshot = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="chart-host"]') as any
      const identity = (window as Window & { __delegationRenderIdentity?: { svg: Element | null; epoch: string | null } })
        .__delegationRenderIdentity
      const visibleBars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
        .filter((node) => {
          const display = node.style.display
          const opacity = Number(node.getAttribute('opacity') ?? '1')
          return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0)
        }).length
      return {
        chartType: host?.__chartRuntimeState?.chartType ?? null,
        sameSvg: identity?.svg === document.querySelector('[data-testid="chart-host"] svg'),
        sameEpoch:
          identity?.epoch === document.querySelector('[data-testid="chart-host"] svg')?.getAttribute('data-render-epoch'),
        visibleBars,
      }
    })
    expect(snapshot.chartType).toBe('Simple bar chart')
    if (testCase.preserveSvgIdentity !== false) {
      expect(snapshot.sameSvg).toBe(true)
      expect(snapshot.sameEpoch).toBe(true)
    }
    if (typeof testCase.visibleBars === 'number') {
      expect(snapshot.visibleBars).toBe(testCase.visibleBars)
    }
  }
})

test('multiple line 단일 group 위임 후 retrieveValue/filter/diff/compareBool/average/nth/scale가 기대 surface 경로를 유지한다', async ({ page }) => {
  const cases: Array<{
    ops: unknown[]
    explanation: string
    expectedChartType?: string
    expectReuseExisting?: boolean
  }> = [
    {
      ops: [{ id: 'n1', op: 'retrieveValue', field: 'value', group: 'A', target: '2019', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The value of 2019 is 12.',
    },
    {
      ops: [{ id: 'n1', op: 'filter', field: 'value', group: 'A', operator: 'between', value: [11, 12], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The chart shows values between 11 and 12.',
      expectedChartType: 'Simple bar chart',
      expectReuseExisting: false,
    },
    {
      ops: [{ id: 'n1', op: 'diff', field: 'value', group: 'A', targetA: '2018', targetB: '2020', signed: false, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The difference between 2018 and 2020 is 1.',
    },
    {
      ops: [{ id: 'n1', op: 'compareBool', field: 'value', group: 'A', targetA: '2018', targetB: '2020', operator: '<', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: '2018 is less than 2020.',
    },
    {
      ops: [{ id: 'n1', op: 'average', field: 'value', group: 'A', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The average of A is 11.',
    },
    {
      ops: [{ id: 'n1', op: 'nth', group: 'A', n: 1, from: 'right', orderField: 'value', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The 1st value from right is 12.',
    },
    {
      ops: [{ id: 'n1', op: 'scale', field: 'value', group: 'A', target: '2018', factor: 2, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The value of 2018 scaled by 2 is 20.',
    },
  ]

  for (const testCase of cases) {
    await renderSpec(page, MULTI_LINE_SPEC)
    await captureRenderIdentity(page)
    await runSingleOpsGroupAllowInstant(page, testCase.ops)
    await expect.poll(() => explanationText(page)).toBe(testCase.explanation)
    const snapshot = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="chart-host"]') as any
      const identity = (window as Window & { __delegationRenderIdentity?: { svg: Element | null; epoch: string | null } })
        .__delegationRenderIdentity
      return {
        chartType: host?.__chartRuntimeState?.chartType ?? null,
        sameSvg: identity?.svg === document.querySelector('[data-testid="chart-host"] svg'),
        sameEpoch:
          identity?.epoch === document.querySelector('[data-testid="chart-host"] svg')?.getAttribute('data-render-epoch'),
        hasSeriesAttr: document.querySelectorAll('svg [data-series]').length > 0,
      }
    })
    expect(snapshot.chartType).toBe(testCase.expectedChartType ?? 'Simple line chart')
    if (testCase.expectReuseExisting === false) {
      expect(snapshot.sameSvg).toBe(false)
    } else {
      expect(snapshot.sameSvg).toBe(true)
      expect(snapshot.sameEpoch).toBe(true)
    }
    expect(snapshot.hasSeriesAttr).toBe(false)
  }
})

test('stacked 단일 group lagDiff는 simple bar surface에서 n-1개의 화살표와 텍스트를 동시에 만든다', async ({ page }) => {
  await renderSpec(page, STACKED_BAR_SPEC)
  await captureRenderIdentity(page)
  await runSingleOpsGroupAllowInstant(page, [
    { id: 'n1', op: 'lagDiff', field: 'count', group: 'rain', orderField: 'month', order: 'asc', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])

  await expect.poll(() => explanationText(page)).toBe('The lag differences are shown across adjacent month values.')
  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const lineCount = document.querySelectorAll('svg .annotation.line-annotation').length
    const textCount = document.querySelectorAll('svg .annotation-layer .text-annotation').length
    const visibleBars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
      .filter((node) => {
        const display = node.style.display
        const opacity = Number(node.getAttribute('opacity') ?? '1')
        return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0)
      }).length
    return {
      chartType: host?.__chartRuntimeState?.chartType ?? null,
      lineCount,
      textCount,
      visibleBars,
    }
  })

  expect(snapshot.chartType).toBe('Simple bar chart')
  expect(snapshot.visibleBars).toBe(3)
  expect(snapshot.lineCount).toBeGreaterThanOrEqual(2)
  expect(snapshot.textCount).toBeGreaterThanOrEqual(2)
})
