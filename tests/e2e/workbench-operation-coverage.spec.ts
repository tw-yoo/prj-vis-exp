import { expect, test, type Page } from '@playwright/test'
import {
  FACET_GROUPED_BAR_PAIRDIFF_SPEC,
  GROUPED_BAR_SPEC,
  MULTI_LINE_SPEC,
  SIMPLE_BAR_SPEC,
  SIMPLE_LINE_SPEC,
  STACKED_BAR_SPEC,
} from './fixtures/specs'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
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

async function explanationText(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
      .join(' '),
  )
}

async function annotationTexts(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTextElement>('svg .annotation-layer .text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0),
  )
}

async function comparisonAnnotationPolicy(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg')
    const width = svg?.getBoundingClientRect().width ?? 0
    const plotLeft = Number(svg?.getAttribute('data-m-left') ?? '0')
    const plotWidth = Number(svg?.getAttribute('data-plot-w') ?? '0')
    const lines = Array.from(document.querySelectorAll<SVGLineElement>('svg .annotation.line-annotation'))
      .map((node) => {
        const x1 = Number(node.getAttribute('x1'))
        const x2 = Number(node.getAttribute('x2'))
        const y1 = Number(node.getAttribute('y1'))
        const y2 = Number(node.getAttribute('y2'))
        const stroke = (node.getAttribute('stroke') ?? '').toLowerCase()
        return { x1, x2, y1, y2, stroke }
      })
      .filter((entry) => [entry.x1, entry.x2, entry.y1, entry.y2].every(Number.isFinite))
    const redLines = lines.filter((entry) => entry.stroke === '#ef4444')
    const longHorizontals = redLines.filter(
      (entry) => Math.abs(entry.y1 - entry.y2) < 0.5 && Math.abs(entry.x2 - entry.x1) > width * 0.4,
    )
    const verticals = redLines.filter(
      (entry) => Math.abs(entry.x1 - entry.x2) < 0.5 && Math.abs(entry.y1 - entry.y2) > 0.5,
    )
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg .annotation-layer .text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    return {
      redLineCount: redLines.length,
      longHorizontalCount: longHorizontals.length,
      verticalCount: verticals.length,
      texts,
      horizontalStartsInsidePlot: longHorizontals.every((entry) => entry.x1 >= plotLeft - 1),
      horizontalEndsInsidePlot:
        !Number.isFinite(plotWidth) || plotWidth <= 0
          ? true
          : longHorizontals.every((entry) => entry.x2 <= plotLeft + plotWidth + 1),
    }
  })
}

test('simple bar retrieveValue(target array) and filter(between) both animate with concrete results', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'retrieveValue',
      field: 'rating',
      target: ['USA', 'KOR'],
      precision: 2,
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect.poll(() => explanationText(page)).toBe('The values of USA and KOR are 12 and 18.')
  await expect.poll(() => annotationTexts(page)).toContain('12')
  await expect.poll(() => annotationTexts(page)).toContain('18')

  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'filter',
      field: 'rating',
      operator: 'between',
      value: [10, 15],
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect.poll(() => explanationText(page)).toBe('The chart shows values between 10 and 15.')
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
          .filter((node) => {
            const display = node.style.display
            const opacity = Number(node.getAttribute('opacity') ?? '1')
            return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0)
          })
          .map((node) => String(node.getAttribute('data-target') ?? ''))
          .filter((value) => value.length > 0),
      ),
    )
    .toEqual(['USA', 'ESP'])
})

test('simple bar explanation templates stay concise for nth/findExtremum/scale/compare/average/compareBool', async ({ page }) => {
  const cases: Array<{ ops: unknown[]; expected: string; lineAnnotations?: boolean }> = [
    {
      ops: [{ id: 'n1', op: 'nth', n: 1, from: 'right', orderField: 'country', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The 1st value from right is 12.',
    },
    {
      ops: [{ id: 'n1', op: 'findExtremum', field: 'rating', which: 'max', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The maximum rating value is 18.',
    },
    {
      ops: [{ id: 'n1', op: 'scale', field: 'rating', target: 'USA', factor: 2, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The value of USA scaled by 2 is 24.',
    },
    {
      ops: [{ id: 'n1', op: 'compare', field: 'rating', which: 'max', targetA: 'USA', targetB: 'KOR', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The maximum value between USA and KOR is 18.',
      lineAnnotations: true,
    },
    {
      ops: [{ id: 'n1', op: 'average', field: 'rating', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The average is 13.5.',
    },
    {
      ops: [{ id: 'n1', op: 'compareBool', field: 'rating', operator: '>', targetA: 'KOR', targetB: 'USA', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'KOR is greater than USA.',
      lineAnnotations: true,
    },
  ]

  for (const testCase of cases) {
    await renderSpec(page, SIMPLE_BAR_SPEC)
    await runSingleOpsGroup(page, testCase.ops)
    await expect.poll(() => explanationText(page)).toBe(testCase.expected)
    if (testCase.lineAnnotations) {
      await expect
        .poll(async () =>
          page.evaluate(() => document.querySelectorAll('svg .annotation.line-annotation').length),
        )
        .toBeGreaterThan(0)
    }
  }
})

test('grouped/stacked/line builders emit visible annotations for average, retrieveValue, and scale', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'average', field: 'value', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])
  await expect.poll(() => annotationTexts(page)).toContain('average: 123.33')

  await renderSpec(page, STACKED_BAR_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'average', field: 'count', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])
  await expect.poll(() => annotationTexts(page)).toContain('average: 7.17')
  await renderSpec(page, STACKED_BAR_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'average', field: 'count', group: 'rain', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])
  await expect.poll(() => explanationText(page)).toBe('The average of rain is 4.33.')

  await renderSpec(page, SIMPLE_LINE_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'retrieveValue', field: 'value', target: '2021', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])
  await expect.poll(() => annotationTexts(page)).toContain('14')
  await expect
    .poll(async () =>
      page.evaluate(() => document.querySelectorAll('svg .annotation.line-annotation').length),
    )
    .toBeGreaterThanOrEqual(2)

  await renderSpec(page, SIMPLE_LINE_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'findExtremum', field: 'value', which: 'max', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])
  await expect.poll(() => annotationTexts(page)).toContain('14')
  await expect
    .poll(async () =>
      page.evaluate(() => document.querySelectorAll('svg .annotation.line-annotation').length),
    )
    .toBeGreaterThanOrEqual(2)

  await renderSpec(page, MULTI_LINE_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'scale', field: 'value', target: '2020', group: 'B', factor: 2, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])
  await expect.poll(() => annotationTexts(page)).toContain('scale ×2: 26')
})

test('diff and compareBool restore rail-style comparison annotations across chart types', async ({ page }) => {
  const cases: Array<{ spec: string; ops: unknown[]; explanation: string }> = [
    {
      spec: SIMPLE_BAR_SPEC,
      ops: [{ id: 'n1', op: 'diff', field: 'rating', targetA: 'USA', targetB: 'KOR', signed: false, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The difference between USA and KOR is 6.',
    },
    {
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'diff', field: 'value', targetA: 'KOR', groupA: 'Surgical', targetB: 'USA', groupB: 'Surgical', signed: false, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The difference between KOR and USA is 20.',
    },
    {
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'compareBool', field: 'count', targetA: 'Jan', groupA: 'sun', targetB: 'Feb', groupB: 'sun', operator: '>=', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'Jan is greater than or equal to Feb.',
    },
    {
      spec: SIMPLE_LINE_SPEC,
      ops: [{ id: 'n1', op: 'diff', field: 'value', targetA: '2018', targetB: '2021', signed: false, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The difference between 2018 and 2021 is 4.',
    },
    {
      spec: MULTI_LINE_SPEC,
      ops: [{ id: 'n1', op: 'compareBool', field: 'value', targetA: '2020', groupA: 'A', targetB: '2020', groupB: 'B', operator: '<=', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: '2020 is less than or equal to 2020.',
    },
  ]

  for (const testCase of cases) {
    await renderSpec(page, testCase.spec)
    await runSingleOpsGroup(page, testCase.ops)
    await expect.poll(() => explanationText(page)).toBe(testCase.explanation)
    const policy = await comparisonAnnotationPolicy(page)
    expect(policy.longHorizontalCount).toBe(2)
    expect(policy.verticalCount).toBeGreaterThanOrEqual(1)
    expect(policy.texts.some((text) => text.includes('Difference:'))).toBeTruthy()
    expect(policy.texts.some((text) => text === '0' || text === '1')).toBeFalsy()
    expect(policy.horizontalStartsInsidePlot).toBeTruthy()
    expect(policy.horizontalEndsInsidePlot).toBeTruthy()
  }
})

test('simple line filter transitions to simple bar before executing bar filter semantics', async ({ page }) => {
  await renderSpec(page, SIMPLE_LINE_SPEC)
  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'filter', field: 'value', operator: '>=', value: 12, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])

  await expect.poll(() => explanationText(page)).toBe('The chart shows values at least 12.')
  await expect
    .poll(async () =>
      page.evaluate(() => (document.querySelector('[data-testid="chart-host"]') as any)?.__chartRuntimeState?.chartType ?? null),
    )
    .toBe('Simple bar chart')
  await expect
    .poll(async () =>
      page.evaluate(() => document.querySelectorAll('svg rect.main-bar').length),
    )
    .toBeGreaterThan(0)
})

test('stacked bar filter(group list) keeps only the requested series', async ({ page }) => {
  const stackedThreeSeriesSpec = JSON.stringify(
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      description: 'E2E stacked bar multi-group filter fixture',
      data: {
        values: [
          { month: 'Jan', weather: 'sun', count: 10 },
          { month: 'Jan', weather: 'rain', count: 4 },
          { month: 'Jan', weather: 'snow', count: 2 },
          { month: 'Feb', weather: 'sun', count: 8 },
          { month: 'Feb', weather: 'rain', count: 6 },
          { month: 'Feb', weather: 'snow', count: 1 },
          { month: 'Mar', weather: 'sun', count: 12 },
          { month: 'Mar', weather: 'rain', count: 3 },
          { month: 'Mar', weather: 'snow', count: 5 },
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

  await renderSpec(page, stackedThreeSeriesSpec)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'filter',
      field: 'count',
      group: ['sun', 'rain'],
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const bars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
        const visibleBars = bars.filter((bar) => {
          const display = bar.style.display
          const opacity = Number(bar.getAttribute('opacity') ?? '1')
          return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0)
        })
        const visibleSeries = Array.from(
          new Set(
            visibleBars
              .map((bar) => (bar.getAttribute('data-series') ?? '').trim())
              .filter((value) => value.length > 0),
          ),
        ).sort()
        return visibleSeries
      }),
    )
    .toEqual(['rain', 'sun'])
})

test('pairDiff and lagDiff render supported comparison annotations across charts', async ({ page }) => {
  const pairDiffCases: Array<{ spec: string; ops: unknown[]; explanation: string }> = [
    {
      spec: GROUPED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'pairDiff', field: 'value', by: 'target', groupA: 'NonSurgical', groupB: 'Surgical', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The pairwise differences between NonSurgical and Surgical are shown for each target.',
    },
    {
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'pairDiff', field: 'count', by: 'target', groupA: 'sun', groupB: 'rain', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The pairwise differences between sun and rain are shown for each target.',
    },
    {
      spec: MULTI_LINE_SPEC,
      ops: [{ id: 'n1', op: 'pairDiff', field: 'value', by: 'target', groupA: 'A', groupB: 'B', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The pairwise differences between A and B are shown for each target.',
    },
  ]

  for (const testCase of pairDiffCases) {
    await renderSpec(page, testCase.spec)
    await runSingleOpsGroup(page, testCase.ops)
    await expect.poll(() => explanationText(page)).toBe(testCase.explanation)
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelectorAll('svg .annotation.line-annotation').length),
      )
      .toBeGreaterThan(0)
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelectorAll('svg .annotation-layer .text-annotation').length),
      )
      .toBeGreaterThan(0)
    if (testCase.spec === STACKED_BAR_SPEC) {
      await expect
        .poll(async () =>
          page.evaluate(() => (document.querySelector('[data-testid="chart-host"]') as any)?.__chartRuntimeState?.chartType ?? null),
        )
        .toBe('Grouped bar chart')
    }
  }

  const lagDiffCases: Array<{ spec: string; ops: unknown[]; explanation: string }> = [
    {
      spec: SIMPLE_LINE_SPEC,
      ops: [{ id: 'n1', op: 'lagDiff', field: 'value', orderField: 'year', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The lag differences are shown across adjacent year values.',
    },
    {
      spec: MULTI_LINE_SPEC,
      ops: [{ id: 'n1', op: 'lagDiff', field: 'value', orderField: 'year', group: 'A', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      explanation: 'The lag differences are shown across adjacent year values.',
    },
  ]

  for (const testCase of lagDiffCases) {
    await renderSpec(page, testCase.spec)
    await runSingleOpsGroup(page, testCase.ops)
    await expect.poll(() => explanationText(page)).toBe(testCase.explanation)
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelectorAll('svg .annotation.line-annotation').length),
      )
      .toBeGreaterThan(0)
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelectorAll('svg .annotation-layer .text-annotation').length),
      )
      .toBeGreaterThan(0)
  }
})

test('facet grouped bar pairDiff renders panel-local diff annotations for each facet', async ({ page }) => {
  await renderSpec(page, FACET_GROUPED_BAR_PAIRDIFF_SPEC)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'pairDiff',
      keyField: 'Company',
      groupA: '2023',
      groupB: '2019',
      field: 'Total GHG Emissions (Million tCO2e)',
      seriesField: 'Year',
      signed: true,
      precision: 1,
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect.poll(() => explanationText(page)).toBe(
    'The pairwise differences between 2023 and 2019 are shown for each Company.',
  )

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(
          new Set(
            Array.from(document.querySelectorAll<SVGElement>('svg .annotation.line-annotation[data-chart-id]'))
              .map((node) => node.getAttribute('data-chart-id'))
              .filter((value): value is string => typeof value === 'string' && value.length > 0),
          ),
        ).sort(),
      ),
    )
    .toEqual(['Amazon', 'Google', 'Meta', 'Microsoft'])

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const svg = document.querySelector('svg')
        if (!(svg instanceof SVGSVGElement)) return false
        const svgRect = svg.getBoundingClientRect()
        const viewBox = svg.viewBox?.baseVal
        const scaleX = viewBox && svgRect.width > 0 ? viewBox.width / svgRect.width : 1
        const rails = Array.from(
          document.querySelectorAll<SVGLineElement>(
            'svg .annotation.line-annotation[data-annotation-slot^="comparison-rail:"][data-chart-id]',
          ),
        )
        if (!rails.length) return false
        return rails.every((line) => {
          const chartId = line.getAttribute('data-chart-id')
          if (!chartId) return false
          const panel = document.querySelector<SVGGElement>(
            `g[data-chart-id="${chartId}"][data-chart-panel="true"]`,
          )
          if (!panel) return false
          const plotX = Number(panel.getAttribute('data-panel-plot-x') ?? '0')
          const plotW = Number(panel.getAttribute('data-panel-plot-w') ?? '0')
          if (!Number.isFinite(plotX) || !Number.isFinite(plotW) || !(plotW > 0)) return false
          const isPanelLocal = line.parentElement?.parentElement === panel
          const panelRect = panel.getBoundingClientRect()
          const left = isPanelLocal
            ? plotX
            : (viewBox?.x ?? 0) + (panelRect.left - svgRect.left) * scaleX + plotX
          const right = left + plotW
          const x1 = Number(line.getAttribute('x1'))
          const x2 = Number(line.getAttribute('x2'))
          if (!Number.isFinite(x1) || !Number.isFinite(x2)) return false
          return x1 >= left - 1.5 && x1 <= right + 1.5 && x2 >= left - 1.5 && x2 <= right + 1.5
        })
      }),
    )
    .toBe(true)

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(
          Array.from(
            document.querySelectorAll<SVGElement>(
              'svg .annotation.text-annotation[data-annotation-slot^="comparison-summary:"]',
            ),
          ).map((node) => {
            const chartScope = node.closest('[data-chart-id]')
            return `${chartScope?.getAttribute('data-chart-id') ?? ''}:${(node.textContent ?? '').trim()}`
          }),
        ).sort(),
      ),
    )
    .toEqual([
      'Amazon:Difference: 16.8',
      'Google:Difference: 5',
      'Meta:Difference: 5.6',
      'Microsoft:Difference: 4.2',
    ].sort())

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const comparisonSelectors = [
          '[data-annotation-slot^="comparison-rail:"]',
          '[data-annotation-slot^="comparison-bracket:"]',
          '[data-annotation-slot^="comparison-summary:"]',
          '.text-leader-line[data-annotation-slot^="comparison-summary:"]',
        ].join(', ')
        const nodes = Array.from(document.querySelectorAll<SVGElement>(`svg ${comparisonSelectors}`))
        if (!nodes.length) return false
        return nodes.every((node) => {
          const opacity = Number(node.getAttribute('opacity') ?? '1')
          return Number.isFinite(opacity) && Math.abs(opacity - 1) < 0.001
        })
      }),
    )
    .toBe(true)

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const overlapArea = (a: DOMRect, b: DOMRect) => {
          const x1 = Math.max(a.left, b.left)
          const y1 = Math.max(a.top, b.top)
          const x2 = Math.min(a.right, b.right)
          const y2 = Math.min(a.bottom, b.bottom)
          return Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
        }
        const summaryTexts = Array.from(
          document.querySelectorAll<SVGTextElement>('svg .annotation.text-annotation[data-annotation-slot^="comparison-summary:"]'),
        )
        if (!summaryTexts.length) return false
        const otherTexts = Array.from(document.querySelectorAll<SVGTextElement>('svg text'))
        return summaryTexts.every((summary) => {
          const summaryRect = summary.getBoundingClientRect()
          return otherTexts.every((other) => {
            if (other === summary) return true
            const text = (other.textContent ?? '').trim()
            if (!text) return true
            return overlapArea(summaryRect, other.getBoundingClientRect()) < 1
          })
        })
      }),
    )
    .toBe(true)

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const amazonSummary = document.querySelector<SVGTextElement>(
          'svg .annotation.text-annotation[data-annotation-slot="comparison-summary:Amazon"]',
        )
        const amazonPanel = document.querySelector<SVGGElement>('g[data-chart-id="Amazon"][data-chart-panel="true"]')
        const metaPanel = document.querySelector<SVGGElement>('g[data-chart-id="Meta"][data-chart-panel="true"]')
        if (!amazonSummary || !amazonPanel || !metaPanel) return false
        const summaryRect = amazonSummary.getBoundingClientRect()
        const amazonRect = amazonPanel.getBoundingClientRect()
        const metaRect = metaPanel.getBoundingClientRect()
        const summaryCenterX = summaryRect.left + summaryRect.width / 2
        const summaryCenterY = summaryRect.top + summaryRect.height / 2
        const insideAmazonOrRightGutter =
          summaryCenterX >= amazonRect.left - 1 &&
          summaryCenterX <= amazonRect.right + 120 &&
          summaryCenterY >= amazonRect.top - 1 &&
          summaryCenterY <= amazonRect.bottom + 1
        const overlapsMeta =
          Math.max(0, Math.min(summaryRect.right, metaRect.right) - Math.max(summaryRect.left, metaRect.left)) *
            Math.max(0, Math.min(summaryRect.bottom, metaRect.bottom) - Math.max(summaryRect.top, metaRect.top)) >
          0
        return insideAmazonOrRightGutter && !overlapsMeta
      }),
    )
    .toBe(true)
})
