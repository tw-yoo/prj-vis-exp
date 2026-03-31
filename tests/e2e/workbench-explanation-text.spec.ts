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

async function installExplanationHistoryObserver(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __explanationTextHistory__?: string[] }).__explanationTextHistory__ = []
    const readText = () => {
      const svgText = Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
        .map((node) => (node.textContent ?? '').trim())
        .filter((value) => value.length > 0)
        .join(' ')
      const overlayText = Array.from(document.querySelectorAll<HTMLElement>('.chart-sentence-summary-text'))
        .map((node) => (node.textContent ?? '').trim())
        .filter((value) => value.length > 0)
        .join(' ')
      return [svgText, overlayText].filter((value) => value.length > 0).join(' | ')
    }
    const pushCurrent = () => {
      const text = readText()
      if (!text) return
      const store = (window as unknown as { __explanationTextHistory__: string[] }).__explanationTextHistory__
      if (store[store.length - 1] !== text) store.push(text)
    }
    pushCurrent()
    const observer = new MutationObserver(() => {
      pushCurrent()
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    ;(window as unknown as { __explanationTextObserver__?: MutationObserver }).__explanationTextObserver__ = observer
  })
}

async function installExplanationTimingObserver(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __explanationTimingEvents__?: string[] }).__explanationTimingEvents__ = []
    const record = (prefix: string, value: string) => {
      const normalized = value.trim()
      if (!normalized) return
      const entry = `${prefix}:${normalized}`
      const store = (window as unknown as { __explanationTimingEvents__: string[] }).__explanationTimingEvents__
      if (store[store.length - 1] !== entry) store.push(entry)
    }
    const snapshot = () => {
      const explanation = Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
        .map((node) => (node.textContent ?? '').trim())
        .filter((value) => value.length > 0)
        .join(' ')
      const annotation = Array.from(document.querySelectorAll<SVGTextElement>('svg .annotation-layer .text-annotation'))
        .map((node) => (node.textContent ?? '').trim())
        .filter((value) => value.length > 0)
        .join(' | ')
      if (explanation) record('explanation', explanation)
      if (annotation) record('annotation', annotation)
    }
    snapshot()
    const observer = new MutationObserver(() => {
      snapshot()
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    ;(window as unknown as { __explanationTimingObserver__?: MutationObserver }).__explanationTimingObserver__ = observer
  })
}

async function readExplanationHistory(page: Page) {
  return page.evaluate(() => {
    return (window as unknown as { __explanationTextHistory__?: string[] }).__explanationTextHistory__ ?? []
  })
}

async function readExplanationTimingEvents(page: Page) {
  return page.evaluate(() => {
    return (window as unknown as { __explanationTimingEvents__?: string[] }).__explanationTimingEvents__ ?? []
  })
}

async function readExplanationLayoutMeta(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg')
    if (!(svg instanceof SVGSVGElement)) return null
    const read = (attr: string) => {
      const value = Number(svg.getAttribute(attr))
      return Number.isFinite(value) ? value : null
    }
    return {
      marginTop: read('data-m-top'),
      explanationTop: read('data-explanation-top'),
      explanationHeight: read('data-explanation-height'),
      explanationBottom: read('data-explanation-bottom'),
      annotationTopClearance: read('data-annotation-top-clearance'),
    }
  })
}

async function readExplanationAnnotationBounds(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg')
    if (!(svg instanceof SVGSVGElement)) return null
    const background = svg.querySelector<SVGRectElement>('.chart-explanation-bg')
    const annotations = Array.from(svg.querySelectorAll<SVGTextElement>('.annotation-layer .text-annotation'))
    const explanationBottom = background ? background.getBoundingClientRect().bottom : null
    const annotationMinY = annotations.length
      ? Math.min(...annotations.map((node) => node.getBoundingClientRect().top))
      : null
    return { explanationBottom, annotationMinY }
  })
}

test('average operation renders rule-based explanation text inside the svg', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await installExplanationHistoryObserver(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'average',
      field: 'rating',
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    .toContain('The average is 13.5.')

  const lines = await page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0),
  )

  expect(lines[0]).toBe('The average is 13.5.')
  expect(lines.length).toBe(1)

  await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
  await expect(page.locator('.chart-sentence-summary-text')).toBeHidden()
  const history = await readExplanationHistory(page)
  expect(history.some((value) => value.includes('Calculating the average'))).toBe(false)
})

test('retrieveValue group renders exactly one explanation text', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await installExplanationHistoryObserver(page)
  await installExplanationTimingObserver(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'retrieveValue',
      field: 'rating',
      target: 'USA',
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    .toContain('The value of USA is 12.')

  await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
  await expect(page.locator('.chart-sentence-summary-text')).toBeHidden()
  const history = await readExplanationHistory(page)
  expect(history.some((value) => value.includes('Looking up the value'))).toBe(false)
  const timing = await readExplanationTimingEvents(page)
  const explanationIndex = timing.findIndex((entry) => entry === 'explanation:The value of USA is 12.')
  const annotationIndex = timing.findIndex((entry) => entry.includes('annotation:12'))
  expect(explanationIndex).toBeGreaterThanOrEqual(0)
  expect(annotationIndex).toBeGreaterThanOrEqual(0)
  expect(explanationIndex).toBeLessThan(annotationIndex)
})

test('retrieveValue with multiple targets renders one concise explanation text', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await installExplanationHistoryObserver(page)
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

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    .toContain('The values of USA and KOR are 12 and 18.')

  await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
  await expect(page.locator('.chart-sentence-summary-text')).toBeHidden()
})

test('multi-op group explanation renders one sink-centered text', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await installExplanationHistoryObserver(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'retrieveValue',
      field: 'rating',
      target: 'KOR',
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
    {
      id: 'n2',
      op: 'retrieveValue',
      field: 'rating',
      target: 'USA',
      meta: { nodeId: 'n2', inputs: [], sentenceIndex: 2 },
    },
    {
      id: 'n3',
      op: 'diff',
      field: 'rating',
      meta: { nodeId: 'n3', inputs: ['n1', 'n2'], sentenceIndex: 3 },
    },
  ])

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    .toContain('The difference between KOR and USA is 6.')

  const lines = await page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0),
  )

  expect(lines[0]).toBe('The difference between KOR and USA is 6.')
  expect(lines.length).toBeLessThanOrEqual(2)
  await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
  await expect(page.locator('.chart-sentence-summary-text')).toBeHidden()
})

test('filter and sort do not render transient initial explanation text', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await installExplanationHistoryObserver(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'filter',
      field: 'country',
      include: ['USA'],
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
  await expect(page.locator('.chart-sentence-summary-text')).toBeHidden()
  let history = await readExplanationHistory(page)
  expect(history.some((value) => value.includes('Filtering the chart'))).toBe(false)
  expect(history).toContain('The chart shows USA only.')

  await renderSpec(page, SIMPLE_BAR_SPEC)
  await installExplanationHistoryObserver(page)
  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'sort',
      field: 'rating',
      order: 'desc',
      meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
  await expect(page.locator('.chart-sentence-summary-text')).toBeHidden()
  history = await readExplanationHistory(page)
  expect(history.some((value) => value.includes('Sorting the chart'))).toBe(false)
  expect(history).toContain('The chart is sorted in descending order.')
})

test('filter explanation text reflects parameters concisely', async ({ page }) => {
  const cases: Array<{ spec: string; ops: unknown[]; expected: string }> = [
    {
      spec: SIMPLE_BAR_SPEC,
      ops: [{ id: 'n1', op: 'filter', field: 'country', include: ['USA', 'JPN'], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The chart shows USA and JPN only.',
    },
    {
      spec: SIMPLE_BAR_SPEC,
      ops: [{ id: 'n1', op: 'filter', field: 'country', exclude: ['USA', 'JPN', 'KOR', 'ESP'], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The chart excludes selected values.',
    },
    {
      spec: SIMPLE_BAR_SPEC,
      ops: [{ id: 'n1', op: 'filter', field: 'rating', operator: '>=', value: 15, meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The chart shows values at least 15.',
    },
    {
      spec: STACKED_BAR_SPEC,
      ops: [{ id: 'n1', op: 'filter', field: 'month', value: ['Jan', 'Feb'], meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } }],
      expected: 'The chart shows Jan and Feb only.',
    },
  ]

  for (const testCase of cases) {
    await renderSpec(page, testCase.spec)
    await runSingleOpsGroup(page, testCase.ops)
    await expect.poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0)
          .join(' '),
      ),
    ).toBe(testCase.expected)
  }
})

test('all chart types publish explanation band layout metadata on the root svg', async ({ page }) => {
  for (const spec of [SIMPLE_BAR_SPEC, GROUPED_BAR_SPEC, STACKED_BAR_SPEC, SIMPLE_LINE_SPEC, MULTI_LINE_SPEC]) {
    await renderSpec(page, spec)
    const meta = await readExplanationLayoutMeta(page)
    expect(meta).not.toBeNull()
    expect(meta?.explanationTop).not.toBeNull()
    expect(meta?.explanationHeight).not.toBeNull()
    expect(meta?.explanationBottom).not.toBeNull()
    expect(meta?.annotationTopClearance).not.toBeNull()
    expect(meta?.marginTop).not.toBeNull()
    expect(meta!.explanationTop!).toBeLessThan(meta!.explanationBottom!)
    expect(meta!.explanationBottom!).toBeLessThan(meta!.annotationTopClearance!)
    expect(meta!.annotationTopClearance!).toBeLessThan(meta!.marginTop!)
  }
})

test('explanation text stays above text annotations across all chart types when annotations are present', async ({
  page,
}) => {
  const cases: Array<{ spec: string; ops: unknown[] }> = [
    {
      spec: SIMPLE_BAR_SPEC,
      ops: [
        {
          id: 'n1',
          op: 'retrieveValue',
          field: 'rating',
          target: 'USA',
          meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        },
      ],
    },
    {
      spec: GROUPED_BAR_SPEC,
      ops: [
        {
          id: 'n1',
          op: 'findExtremum',
          field: 'value',
          which: 'max',
          group: 'Surgical',
          meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        },
      ],
    },
    {
      spec: STACKED_BAR_SPEC,
      ops: [
        {
          id: 'n1',
          op: 'findExtremum',
          field: 'count',
          which: 'max',
          group: 'rain',
          meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        },
      ],
    },
    {
      spec: SIMPLE_LINE_SPEC,
      ops: [
        {
          id: 'n1',
          op: 'retrieveValue',
          field: 'value',
          target: '2021',
          meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        },
      ],
    },
    {
      spec: MULTI_LINE_SPEC,
      ops: [
        {
          id: 'n1',
          op: 'retrieveValue',
          field: 'value',
          target: '2020',
          group: 'A',
          meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        },
      ],
    },
  ]

  for (const testCase of cases) {
    await renderSpec(page, testCase.spec)
    await runSingleOpsGroup(page, testCase.ops)
    await expect(page.locator('svg .chart-explanation-text')).toHaveCount(1)
    const annotationCount = await page.locator('svg .annotation-layer .text-annotation').count()
    if (!annotationCount) continue
    await expect(page.locator('svg .annotation-layer .text-annotation').first()).toBeVisible()
    const bounds = await readExplanationAnnotationBounds(page)
    expect(bounds).not.toBeNull()
    expect(bounds?.explanationBottom).not.toBeNull()
    expect(bounds?.annotationMinY).not.toBeNull()
    expect(bounds!.explanationBottom!).toBeLessThan(bounds!.annotationMinY!)
  }
})
