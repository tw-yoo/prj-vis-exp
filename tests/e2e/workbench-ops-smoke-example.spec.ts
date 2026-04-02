import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { STACKED_BAR_SPEC } from './fixtures/specs'
import { resetRuntimeResults, resolveFilterRefThreshold, storeRuntimeResult } from '../../src/domain/operation/dataOps'

const chartHost = '[data-testid="chart-host"]'

type CsvRow = Record<string, string>

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some((value) => value.length > 0)) rows.push(row)

  if (!rows.length) return []
  const header = rows[0]
  return rows.slice(1).map((values) => {
    const out: CsvRow = {}
    header.forEach((key, index) => {
      out[key] = values[index] ?? ''
    })
    return out
  })
}

function loadGroupedSpec() {
  const specPath = path.resolve(process.cwd(), 'data/test/spec/bar_grouped_ver.json')
  return fs.readFileSync(specPath, 'utf-8')
}

function loadSimpleBarSpec() {
  const specPath = path.resolve(process.cwd(), 'data/test/spec/bar_simple_ver.json')
  return fs.readFileSync(specPath, 'utf-8')
}

function loadSimpleBarRatings() {
  const csvPath = path.resolve(process.cwd(), 'data/test/data/bar_simple_ver.csv')
  return parseCsv(fs.readFileSync(csvPath, 'utf-8'))
    .map((row) => Number(row.rating))
    .filter(Number.isFinite)
}

function loadExampleOpsSpecs(limit = 4) {
  const csvPath = path.resolve(process.cwd(), 'nlp_server/example.csv')
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf-8'))
  return rows
    .map((row) => row.spec_json)
    .filter((raw) => {
      if (!raw) return false
      try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object'
      } catch {
        return false
      }
    })
    .slice(0, limit)
}

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

test('resolveFilterRefThreshold resolves single/multi/missing refs', () => {
  resetRuntimeResults()
  storeRuntimeResult('n_single', [{ category: 'value', measure: 'value', target: '__avg__', group: null, value: 10 }])
  expect(resolveFilterRefThreshold('ref:n_single')).toBe(10)

  storeRuntimeResult('n_multi', [
    { category: 'value', measure: 'value', target: 'a', group: null, value: 10 },
    { category: 'value', measure: 'value', target: 'b', group: null, value: 20 },
  ])
  expect(resolveFilterRefThreshold('ref:n_multi')).toBe(30)
  expect(resolveFilterRefThreshold('ref:n_multi', 'avg')).toBe(15)

  expect(resolveFilterRefThreshold('ref:n_missing')).toBeNull()
})

test('example.csv ops spec smoke on grouped fixture', async ({ page }) => {
  const fatalLogs: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Run Operations failed')) fatalLogs.push(text)
  })

  const groupedSpec = loadGroupedSpec()
  const examples = loadExampleOpsSpecs(4)
  expect(examples.length).toBeGreaterThan(0)

  await renderSpec(page, groupedSpec)
  await page.getByRole('button', { name: 'JSON Ops' }).click()

  for (const opsSpec of examples) {
    await page.getByTestId('ops-json-input').fill(opsSpec)
    const runButton = page.getByRole('button', { name: 'Run Operations' })
    await runButton.click()
    await expect(runButton).toBeEnabled({ timeout: 30_000 })
    await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  }

  expect(fatalLogs).toHaveLength(0)
})

test('stacked bar group-only filter runs in-place without unsupported draw action', async ({ page }) => {
  const fatalLogs: string[] = []
  const unsupportedLogs: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('[ops:data-op] execution failed')) fatalLogs.push(text)
    if (text.includes('Unsupported draw action') && text.includes('stacked-to-simple')) unsupportedLogs.push(text)
  })

  await renderSpec(page, STACKED_BAR_SPEC)
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(
    JSON.stringify(
      {
        ops: [
          {
            op: 'filter',
            id: 'n1',
            meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
            group: 'sun',
          },
        ],
      },
      null,
      2,
    ),
  )

  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await runButton.click()
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  expect(fatalLogs).toHaveLength(0)
  expect(unsupportedLogs).toHaveLength(0)

  const visibleSeries = await page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('svg [data-series]')) as SVGGraphicsElement[]
    const visible = marks.filter((mark) => {
      if ((mark as SVGElement).style.display === 'none') return false
      const opacity = Number((mark as SVGElement).getAttribute('opacity') ?? '1')
      return Number.isFinite(opacity) ? opacity > 0 : true
    })
    return Array.from(new Set(visible.map((mark) => String((mark as SVGElement).getAttribute('data-series') ?? ''))))
      .filter((value) => value.length > 0)
      .sort()
  })
  expect(visibleSeries.length).toBeGreaterThan(0)
  expect(visibleSeries).toContain('sun')
})

test('simple bar retrieveValue refs feed diff via meta.inputs without targetA/targetB', async ({ page }) => {
  const failedLogs: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (!text.includes('[ops:data-op] execution failed')) return
    failedLogs.push(text)
  })

  await renderSpec(page, loadSimpleBarSpec())
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(
    JSON.stringify(
      {
        ops: [
          {
            op: 'retrieveValue',
            id: 'n1',
            meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1, view: { phase: 1, parallelGroup: 'p1' } },
            field: 'Year',
            target: '2016',
          },
          {
            op: 'retrieveValue',
            id: 'n2',
            meta: { nodeId: 'n2', inputs: [], sentenceIndex: 1, view: { phase: 1, parallelGroup: 'p1' } },
            field: 'Year',
            target: '2017',
          },
          {
            op: 'diff',
            id: 'n3',
            meta: { nodeId: 'n3', inputs: ['n1', 'n2'], sentenceIndex: 1, view: { phase: 2, parallelGroup: 'p2' } },
            field: 'Production in billion heads',
            targetA: 'ref:n1',
            targetB: 'ref:n2',
            signed: false,
          },
        ],
      },
      null,
      2,
    ),
  )

  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await runButton.click()
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  expect(failedLogs).toHaveLength(0)
})

test('simple bar average ref threshold feeds filter without execution failure', async ({ page }) => {
  const failedLogs: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (!text.includes('[ops:data-op] execution failed')) return
    failedLogs.push(text)
  })

  await renderSpec(page, loadSimpleBarSpec())
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(
    JSON.stringify(
      {
        ops: [
          {
            op: 'average',
            id: 'n1',
            meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1, view: { phase: 1 } },
            field: 'rating',
          },
        ],
        ops2: [
          {
            op: 'filter',
            id: 'n2',
            meta: { nodeId: 'n2', inputs: ['n1'], sentenceIndex: 2, view: { phase: 2 } },
            field: 'rating',
            operator: '>',
            value: 'ref:n1',
          },
        ],
      },
      null,
      2,
    ),
  )

  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await runButton.click()
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  expect(failedLogs).toHaveLength(0)
})

test('runChartOps hydrates split-only first group before panel-scoped averages', async ({ page }) => {
  await page.goto('/')

  const result = await page.evaluate(async (specText) => {
    const [{ browserEngine }, { SurfaceManager }, { getChartType }] = await Promise.all([
      import('/web/engine/createBrowserEngine.ts'),
      import('/src/api/surface-manager.ts'),
      import('/src/api/rendering.ts'),
    ])

    const host = document.createElement('div')
    host.style.width = '960px'
    host.style.minHeight = '640px'
    document.body.appendChild(host)

    const spec = JSON.parse(specText)
    await browserEngine.renderChart(host, spec)

    const chartType = getChartType(spec)
    if (!chartType) {
      throw new Error('Unable to infer chart type for split hydration regression.')
    }

    const surfaceManager = new SurfaceManager(host)
    surfaceManager.createRootSurface(spec, chartType, [])

    await browserEngine.runChartOps(
      host,
      spec,
      {
        ops: [
          {
            op: 'draw',
            action: 'split',
            split: {
              by: 'x',
              groups: {
                nordic: ['NOR', 'SWE', 'DNK', 'FIN'],
                english: ['USA', 'GBR', 'CAN', 'AUS', 'IRL'],
              },
              orientation: 'horizontal',
            },
          },
        ],
      },
      {
        surfaceManager,
        initialRenderMode: 'reuse-existing',
        resetRuntime: true,
      },
    )

    const inspectSurface = (surfaceId: string) => {
      const surface = surfaceManager.getSurface(surfaceId)
      const hostElement = surface?.hostElement as HTMLElement | null
      return {
        exists: hostElement != null,
        svgCount: hostElement?.querySelectorAll('svg').length ?? 0,
      }
    }

    const afterSplit = {
      layoutType: surfaceManager.getLayout()?.type ?? 'single',
      nordic: inspectSurface('nordic'),
      english: inspectSurface('english'),
    }

    await browserEngine.runChartOps(
      host,
      spec,
      {
        ops: [
          {
            op: 'average',
            id: 'nordic_avg',
            chartId: 'nordic',
            field: 'rating',
            meta: { nodeId: 'nordic_avg', inputs: [], sentenceIndex: 2 },
          },
        ],
      },
      {
        surfaceManager,
        initialRenderMode: 'reuse-existing',
        resetRuntime: false,
        runtimeScope: 'ops2',
      },
    )

    await browserEngine.runChartOps(
      host,
      spec,
      {
        ops: [
          {
            op: 'average',
            id: 'english_avg',
            chartId: 'english',
            field: 'rating',
            meta: { nodeId: 'english_avg', inputs: [], sentenceIndex: 3 },
          },
        ],
      },
      {
        surfaceManager,
        initialRenderMode: 'reuse-existing',
        resetRuntime: false,
        runtimeScope: 'ops3',
      },
    )

    const afterAverages = {
      layoutType: surfaceManager.getLayout()?.type ?? 'single',
      nordic: inspectSurface('nordic'),
      english: inspectSurface('english'),
      aggregateLineSlots: Array.from(host.querySelectorAll('[data-annotation-slot]'))
        .map((node) => node.getAttribute('data-annotation-slot') ?? '')
        .filter((value) => value.includes('aggregate-line:'))
        .sort(),
      aggregateTextSlots: Array.from(host.querySelectorAll('[data-annotation-slot]'))
        .map((node) => node.getAttribute('data-annotation-slot') ?? '')
        .filter((value) => value.includes('aggregate-text:'))
        .sort(),
    }

    host.remove()
    return { afterSplit, afterAverages }
  }, loadSimpleBarSpec())

  expect(result.afterSplit.layoutType).toBe('split-horizontal')
  expect(result.afterSplit.nordic.exists).toBeTruthy()
  expect(result.afterSplit.english.exists).toBeTruthy()
  expect(result.afterSplit.nordic.svgCount).toBe(1)
  expect(result.afterSplit.english.svgCount).toBe(1)
  expect(result.afterAverages.layoutType).toBe('split-horizontal')
  expect(result.afterAverages.nordic.svgCount).toBe(1)
  expect(result.afterAverages.english.svgCount).toBe(1)
  expect(result.afterAverages.aggregateLineSlots).toHaveLength(2)
  expect(result.afterAverages.aggregateTextSlots).toHaveLength(2)
})
