import { expect, test, type Page } from '@playwright/test'
import { GROUPED_BAR_SPEC, MULTI_LINE_SPEC, SIMPLE_BAR_SPEC, SIMPLE_LINE_SPEC, STACKED_BAR_SPEC } from './fixtures/specs'

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
