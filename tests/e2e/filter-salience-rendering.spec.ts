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

const SIMPLE_LINE_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  data: {
    values: [
      { year: '2018', score: 10 },
      { year: '2019', score: 16 },
      { year: '2020', score: 12 },
      { year: '2021', score: 20 },
    ],
  },
  mark: 'line',
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'score', type: 'quantitative' },
  },
}

const MULTI_LINE_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  data: {
    values: [
      { year: '2018', series: 'A', value: 10 },
      { year: '2019', series: 'A', value: 18 },
      { year: '2020', series: 'A', value: 12 },
      { year: '2018', series: 'B', value: 8 },
      { year: '2019', series: 'B', value: 11 },
      { year: '2020', series: 'B', value: 9 },
    ],
  },
  mark: 'line',
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative' },
    color: { field: 'series', type: 'nominal' },
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
    const svg = container.querySelector('svg')
    const rect = svg?.getBoundingClientRect()
    ;(window as Window & { __filterSalienceRenderIdentity?: { svg: Element | null; epoch: string | null; size: unknown } }).__filterSalienceRenderIdentity = {
      svg,
      epoch: svg?.getAttribute('data-render-epoch') ?? null,
      size: svg
        ? {
            viewBox: svg.getAttribute('viewBox') ?? '',
            width: svg.getAttribute('width') ?? '',
            height: svg.getAttribute('height') ?? '',
            plotW: svg.getAttribute('data-plot-w') ?? '',
            plotH: svg.getAttribute('data-plot-h') ?? '',
            marginLeft: svg.getAttribute('data-m-left') ?? '',
            marginTop: svg.getAttribute('data-m-top') ?? '',
            rectW: rect ? Number(rect.width.toFixed(3)) : 0,
            rectH: rect ? Number(rect.height.toFixed(3)) : 0,
          }
        : null,
    }
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

async function visibleBarTargets(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
      .filter((node) => {
        const style = window.getComputedStyle(node)
        const opacity = Number(style.opacity)
        return style.display !== 'none' && style.visibility !== 'hidden' && (!Number.isFinite(opacity) || opacity > 0)
      })
      .map((node) => node.getAttribute('data-target') ?? '')
      .filter(Boolean),
  )
}

async function xTickLabels(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTextElement>('svg .x-axis .tick text'))
      .filter((node) => {
        const tick = node.closest('.tick')
        const style = tick ? window.getComputedStyle(tick) : window.getComputedStyle(node)
        const opacity = Number(style.opacity)
        return style.display !== 'none' && style.visibility !== 'hidden' && (!Number.isFinite(opacity) || opacity > 0)
      })
      .map((node) => (node.textContent ?? '').trim())
      .filter(Boolean),
  )
}

async function renderIdentity(page: Page) {
  return page.evaluate(() => {
    const identity = (window as Window & { __filterSalienceRenderIdentity?: { svg: Element | null; epoch: string | null; size: unknown } })
      .__filterSalienceRenderIdentity
    const currentSvg = document.querySelector('svg')
    const rect = currentSvg?.getBoundingClientRect()
    const currentSize = currentSvg
      ? {
          viewBox: currentSvg.getAttribute('viewBox') ?? '',
          width: currentSvg.getAttribute('width') ?? '',
          height: currentSvg.getAttribute('height') ?? '',
          plotW: currentSvg.getAttribute('data-plot-w') ?? '',
          plotH: currentSvg.getAttribute('data-plot-h') ?? '',
          marginLeft: currentSvg.getAttribute('data-m-left') ?? '',
          marginTop: currentSvg.getAttribute('data-m-top') ?? '',
          rectW: rect ? Number(rect.width.toFixed(3)) : 0,
          rectH: rect ? Number(rect.height.toFixed(3)) : 0,
        }
      : null
    return {
      sameSvg: identity?.svg === currentSvg,
      sameEpoch: identity?.epoch === currentSvg?.getAttribute('data-render-epoch'),
      sameSize: JSON.stringify(identity?.size ?? null) === JSON.stringify(currentSize),
      beforeSize: identity?.size ?? null,
      afterSize: currentSize,
    }
  })
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

  await expect.poll(() => visibleBarTargets(page)).toEqual(['USA', 'KOR'])
  const bars = await barSnapshot(page)
  expect(bars.find((bar) => bar.target === 'FRA')?.opacity).toBe(0)
  expect(bars.find((bar) => bar.target === 'ESP')?.opacity).toBe(0)
  await expect.poll(() => xTickLabels(page)).toEqual(['USA', 'KOR'])
  await expect.poll(() => annotationLabels(page)).toContain('Filtered: USA, KOR')
  await expect.poll(() => annotationLabels(page)).toContain('Avg (filtered): 15')
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })

  await runAgainOnExistingChart(page, SIMPLE_BAR_SPEC, [
    { id: 'n3', op: 'retrieveValue', field: 'rating', target: 'ESP', meta: { nodeId: 'n3', inputs: [] } },
  ])
  await expect.poll(async () => (await barSnapshot(page)).map((bar) => bar.target)).toEqual(['USA', 'KOR', 'FRA', 'ESP'])
})

test('categorical simple bar filter-only draws a scope annotation artifact', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'country', include: ['USA', 'KOR'], xKindHint: 'nominal', meta: { nodeId: 'n1', inputs: [] } },
  ])

  await expect.poll(() => annotationLabels(page)).toContain('Filtered: USA, KOR')
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
})

test('categorical simple bar filter feeding extremum keeps a filter annotation artifact', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'country', include: ['USA', 'KOR'], xKindHint: 'nominal', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'findExtremum', field: 'rating', which: 'max', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  await expect.poll(() => annotationLabels(page)).toContain('Filtered: USA, KOR')
  await expect.poll(() => annotationLabels(page)).toContain('18')
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
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
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
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
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
})

test('filter before sort materializes only sorted retained marks', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'filter', field: 'country', include: ['USA', 'KOR', 'FRA'], xKindHint: 'nominal', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'sort', field: 'rating', order: 'descending', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  await expect.poll(() => visibleBarTargets(page)).toEqual(['USA', 'KOR', 'FRA'])
  await expect.poll(() => xTickLabels(page)).toEqual(['USA', 'KOR', 'FRA'])
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
})

test('annotation-only simple bar operations keep svg size stable', async ({ page }) => {
  await renderAndRun(page, SIMPLE_BAR_SPEC, [
    { id: 'n1', op: 'retrieveValue', field: 'rating', target: 'USA', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'average', field: 'rating', meta: { nodeId: 'n2', inputs: [] } },
    { id: 'n3', op: 'diff', field: 'rating', targetA: 'USA', targetB: 'KOR', meta: { nodeId: 'n3', inputs: [] } },
  ])

  await expect.poll(() => annotationLabels(page)).toContain('12')
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
})

test('categorical simple line filter draws a scope annotation artifact', async ({ page }) => {
  await renderAndRun(page, SIMPLE_LINE_SPEC, [
    { id: 'n1', op: 'filter', field: 'year', include: ['2018', '2020'], meta: { nodeId: 'n1', inputs: [] } },
  ])

  await expect.poll(() => annotationLabels(page)).toContain('Filtered: 2018, 2020')
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
})

test('multi-line pairDiff feeding extremum draws an extremum annotation artifact', async ({ page }) => {
  await renderAndRun(page, MULTI_LINE_SPEC, [
    { id: 'n1', op: 'pairDiff', field: 'value', by: 'year', groupA: 'A', groupB: 'B', meta: { nodeId: 'n1', inputs: [] } },
    { id: 'n2', op: 'findExtremum', field: 'value', which: 'max', meta: { nodeId: 'n2', inputs: ['n1'] } },
  ])

  await expect.poll(() => annotationLabels(page)).toContain('Max diff: 7')
  await expect.poll(async () => {
    const identity = await renderIdentity(page)
    return { sameSvg: identity.sameSvg, sameEpoch: identity.sameEpoch, sameSize: identity.sameSize }
  }).toEqual({ sameSvg: true, sameEpoch: true, sameSize: true })
})
