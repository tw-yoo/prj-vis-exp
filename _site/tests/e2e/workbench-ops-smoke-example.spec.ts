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
