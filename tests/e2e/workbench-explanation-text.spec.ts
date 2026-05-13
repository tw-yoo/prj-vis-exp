import fs from 'node:fs'
import path from 'node:path'
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

async function runOpsDirect(page: Page, spec: string, opsSpec: unknown, resetRuntime = true) {
  await page.evaluate(
    async ({ specText, rawOpsSpec, shouldResetRuntime }) => {
      const { browserEngine } = await import('/web/engine/createBrowserEngine.ts')
      const host = document.querySelector('[data-testid="chart-host"]')
      if (!(host instanceof HTMLElement)) {
        throw new Error('Chart host is unavailable.')
      }
      await browserEngine.runChartOps(host, JSON.parse(specText), rawOpsSpec, {
        initialRenderMode: 'reuse-existing',
        resetRuntime: shouldResetRuntime,
      })
    },
    { specText: spec, rawOpsSpec: opsSpec, shouldResetRuntime: resetRuntime },
  )
}

function loadDemoSimpleBarSpec() {
  const specPath = path.resolve(process.cwd(), 'data/test/spec/bar_simple_ver.json')
  return fs.readFileSync(specPath, 'utf-8')
}

async function runSingleOpsGroup(page: Page, ops: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify({ ops }, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
  const startButton = page.getByRole('button', { name: 'Start' })
  const hasVisibleStart = await startButton
    .isVisible({ timeout: 2000 })
    .then((value) => value)
    .catch(() => false)
  if (hasVisibleStart) {
    await expect(startButton).toBeEnabled({ timeout: 30_000 })
    await startButton.click()
    await expect(startButton).toBeHidden({ timeout: 30_000 })
    return
  }
  const firstSentence = page.locator('.chart-sentence-summary-item').first()
  const activeSentence = page.locator('button.chart-sentence-summary-item[data-summary-item-state="active"]').first()
  await expect(activeSentence).toBeEnabled({ timeout: 30_000 })
  await activeSentence.click()
  await expect(firstSentence).toHaveAttribute('data-summary-item-state', /selected|completed/, { timeout: 30_000 })
}

async function loadOpsSession(page: Page, payload: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify(payload, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
  await expect(page.locator('.chart-sentence-summary-list')).toBeVisible({ timeout: 30_000 })
}

const makeHighlightOp = (key: string, color: string) => ({
  op: 'draw',
  action: 'highlight',
  select: { keys: [key] },
  style: { color },
})

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

test('workbench operation groups render clickable sentence text with overrides and defaults', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await loadOpsSession(page, {
    ops: [makeHighlightOp('USA', '#2563eb')],
    ops2: [makeHighlightOp('KOR', '#dc2626')],
    text_chunks: {
      ops: 'Highlight USA.',
      ops2: 'Highlight Korea.',
    },
  })

  await expect(page.locator('.chart-sentence-summary-item')).toHaveText(['Highlight USA.', 'Highlight Korea.'])
  await expect(page.locator('.chart-sentence-summary-item').nth(0)).toHaveAttribute('data-summary-item-state', 'active')
  await expect(page.locator('.chart-sentence-summary-item').nth(1)).toHaveAttribute('data-summary-item-state', 'pending')

  await renderSpec(page, SIMPLE_BAR_SPEC)
  await loadOpsSession(page, {
    ops: [makeHighlightOp('USA', '#2563eb')],
    ops2: [makeHighlightOp('KOR', '#dc2626')],
  })

  await expect(page.locator('.chart-sentence-summary-item')).toHaveText(['operation1', 'operation2'])
})

test('workbench sentence clicks execute sequentially and keep pending groups locked', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await loadOpsSession(page, {
    ops: [makeHighlightOp('USA', '#2563eb')],
    ops2: [makeHighlightOp('KOR', '#dc2626')],
  })

  const items = page.locator('.chart-sentence-summary-item')
  await items.nth(1).click()
  await expect(items.nth(0)).toHaveAttribute('data-summary-item-state', 'active')
  await expect(items.nth(1)).toHaveAttribute('data-summary-item-state', 'pending')

  await items.nth(0).click()
  await expect(items.nth(0)).toHaveAttribute('data-summary-item-state', 'completed', { timeout: 30_000 })
  await expect(items.nth(1)).toHaveAttribute('data-summary-item-state', 'active')

  await items.nth(0).click()
  await expect(items.nth(0)).toHaveAttribute('data-summary-item-state', 'completed', { timeout: 30_000 })
  await expect(items.nth(1)).toHaveAttribute('data-summary-item-state', 'active')
})

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

test('filter explanation resolves scalar ref thresholds to concrete values', async ({ page }) => {
  const spec = loadDemoSimpleBarSpec()
  await renderSpec(page, spec)
  await page.evaluate(async () => {
    const { resetRuntimeResults, storeRuntimeResult } = await import('/src/domain/operation/dataOps.ts')
    resetRuntimeResults()
    storeRuntimeResult('n1', [
      {
        category: 'result',
        measure: 'rating',
        target: '__result__',
        displayTarget: 'average',
        group: null,
        value: 56.45,
        name: 'average',
      },
    ])
  })
  await runOpsDirect(
    page,
    spec,
    {
      ops: [
        {
          id: 'n2',
          op: 'filter',
          field: 'rating',
          operator: '>',
          value: 'ref:n1',
          meta: { nodeId: 'n2', inputs: ['n1'], sentenceIndex: 2 },
        },
      ],
    },
    false,
  )

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0)
          .join(' '),
      ),
    )
    .toBe('The chart shows values above 56.45.')

  await expect(page.locator('svg .chart-explanation-text')).not.toContainText('ref:')
})

test('filter explanation respects aggregate hints when resolving scalar refs', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.evaluate(async () => {
    const { resetRuntimeResults, storeRuntimeResult } = await import('/src/domain/operation/dataOps.ts')
    resetRuntimeResults()
    storeRuntimeResult('n1', [
      {
        category: 'rating',
        measure: 'rating',
        target: 'USA',
        displayTarget: 'USA',
        group: null,
        value: 12,
        name: 'USA',
      },
      {
        category: 'rating',
        measure: 'rating',
        target: 'KOR',
        displayTarget: 'KOR',
        group: null,
        value: 18,
        name: 'KOR',
      },
    ])
  })
  await runOpsDirect(
    page,
    SIMPLE_BAR_SPEC,
    {
      ops: [
        {
          id: 'n2',
          op: 'filter',
          field: 'rating',
          operator: '>=',
          value: 'ref:n1',
          aggregate: 'avg',
          meta: { nodeId: 'n2', inputs: ['n1'], sentenceIndex: 2 },
        },
      ],
    },
    false,
  )

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0)
          .join(' '),
      ),
    )
    .toBe('The chart shows values at least 15.')

  await expect(page.locator('svg .chart-explanation-text')).not.toContainText('ref:')
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
