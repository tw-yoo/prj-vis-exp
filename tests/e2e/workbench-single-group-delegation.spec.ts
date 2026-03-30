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
