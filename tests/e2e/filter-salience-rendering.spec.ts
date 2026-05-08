import { expect, test, type Page } from '@playwright/test'

const SIMPLE_BAR_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  data: {
    values: [
      { country: 'USA', rating: 12 },
      { country: 'KOR', rating: 18 },
      { country: 'FRA', rating: 9 },
      { country: 'ESP', rating: 15 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'country', type: 'nominal', sort: null },
    y: { field: 'rating', type: 'quantitative' },
  },
}

const TEMPORAL_BAR_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  data: {
    values: [
      { Year: '2018', value: 10 },
      { Year: '2019', value: 16 },
      { Year: '2020', value: 12 },
      { Year: '2021', value: 20 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'Year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative' },
  },
}

async function renderAndRun(page: Page, spec: unknown, ops: unknown[]) {
  await page.goto('/')
  await page.evaluate(async ({ spec, ops }) => {
    document.body.innerHTML = '<div id="chart-under-test" style="width: 720px; height: 520px;"></div>'
    const container = document.querySelector<HTMLElement>('#chart-under-test')
    if (!container) throw new Error('chart test container missing')
    const renderingPath = '/src/api/rendering.ts'
    const operationPath = '/src/api/operation-run.ts'
    const { renderChart } = await import(renderingPath)
    const { runChartOps } = await import(operationPath)
    await renderChart(container, spec)
    await runChartOps(container, spec, { ops })
  }, { spec, ops })
}

async function runAgainOnExistingChart(page: Page, spec: unknown, ops: unknown[]) {
  await page.evaluate(async ({ spec, ops }) => {
    const container = document.querySelector<HTMLElement>('#chart-under-test')
    if (!container) throw new Error('chart test container missing')
    const operationPath = '/src/api/operation-run.ts'
    const { runChartOps } = await import(operationPath)
    await runChartOps(container, spec, { ops })
  }, { spec, ops })
}

async function barSnapshot(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar')).map((node) => {
      const computedOpacity = Number(window.getComputedStyle(node).opacity)
      const attrOpacity = Number(node.getAttribute('opacity') ?? '1')
      return {
        target: node.getAttribute('data-target') ?? '',
        opacity: Number.isFinite(computedOpacity) ? computedOpacity : attrOpacity,
      }
    }),
  )
}

async function xTickLabels(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTextElement>('svg .x-axis .tick text'))
      .map((node) => (node.textContent ?? '').trim())
      .filter(Boolean),
  )
}

async function annotationLabels(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTextElement>('svg .annotation-layer .text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter(Boolean),
  )
}

test('nominal include feeding average materializes retained subset', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'country', include: ['USA', 'KOR'], xKindHint: 'nominal', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'average', field: 'rating', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  await expect.poll(() => barSnapshot(page)).toEqual([
    { target: 'USA', opacity: 1 },
    { target: 'KOR', opacity: 1 },
  ])
  await expect.poll(() => xTickLabels(page)).toEqual(['USA', 'KOR'])
  await expect.poll(() => annotationLabels(page)).toContain('Avg (filtered): 15')

  await runAgainOnExistingChart(page, SIMPLE_BAR_SPEC, [
    { id: 'n3', op: 'retrieveValue', field: 'rating', target: 'ESP', meta: { nodeId: 'n3', inputs: [] } },
  ])
  await expect.poll(async () => (await barSnapshot(page)).map((bar) => bar.target)).toEqual(['USA', 'KOR', 'FRA', 'ESP'])
})

test('measure threshold feeding average preserves full chart and dims out-of-scope bars', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'rating', operator: '>=', value: 12, meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'average', field: 'rating', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  const bars = await barSnapshot(page)
  expect(bars.map((bar) => bar.target)).toEqual(['USA', 'KOR', 'FRA', 'ESP'])
  expect(bars.find((bar) => bar.target === 'FRA')?.opacity).toBeLessThan(1)
  expect(bars.filter((bar) => bar.target !== 'FRA').every((bar) => bar.opacity === 1)).toBe(true)
  await expect.poll(() => annotationLabels(page)).toContain('Avg (filtered): 15')
})

test('non-contiguous temporal filter feeding diff keeps ordered context', async ({ page }) => {
  await renderAndRun(page, TEMPORAL_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'Year', include: ['2018', '2020'], xKindHint: 'temporal', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'diff', field: 'value', targetA: '2018', targetB: '2020', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  const bars = await barSnapshot(page)
  expect(bars.map((bar) => bar.target)).toEqual(['2018', '2019', '2020', '2021'])
  expect(bars.find((bar) => bar.target === '2019')?.opacity).toBeLessThan(1)
  expect(bars.find((bar) => bar.target === '2021')?.opacity).toBeLessThan(1)
})

test('filter before sort materializes only sorted retained marks', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'country', include: ['USA', 'KOR', 'FRA'], xKindHint: 'nominal', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'sort', field: 'rating', order: 'descending', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  await expect.poll(async () => (await barSnapshot(page)).map((bar) => bar.target)).toEqual(['USA', 'KOR', 'FRA'])
  await expect.poll(() => xTickLabels(page)).toEqual(['USA', 'KOR', 'FRA'])
})
