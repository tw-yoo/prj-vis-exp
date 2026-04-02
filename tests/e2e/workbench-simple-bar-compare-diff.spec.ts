import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

function loadSimpleBarSpec() {
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
  await expect(startButton).toBeVisible({ timeout: 30_000 })
  await expect(startButton).toBeEnabled({ timeout: 30_000 })
  await startButton.click()
  await expect(startButton).toBeHidden({ timeout: 30_000 })
}

async function ensureSpecInputVisible(page: Page) {
  const input = page.getByTestId('vl-spec-input')
  if ((await input.count()) === 0) {
    await page.getByRole('button', { name: 'Expand' }).first().click()
  }
  await expect(input).toBeVisible({ timeout: 60_000 })
}

test('simple bar compare draws two comparison hlines, a right bracket, and delta text', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { op: 'compare', field: 'rating', targetA: 'USA', targetB: 'JPN' },
  ])

  const lineStats = await page.evaluate(() => {
    const svg = document.querySelector('svg')
    const width = svg?.getBoundingClientRect().width ?? 0
    const lines = Array.from(document.querySelectorAll('svg line.annotation.line-annotation'))
      .map((line) => {
        const x1 = Number(line.getAttribute('x1'))
        const x2 = Number(line.getAttribute('x2'))
        const y1 = Number(line.getAttribute('y1'))
        const y2 = Number(line.getAttribute('y2'))
        const stroke = (line.getAttribute('stroke') || '').toLowerCase()
        return { x1, x2, y1, y2, stroke }
      })
      .filter((entry) => [entry.x1, entry.x2, entry.y1, entry.y2].every(Number.isFinite))
    const horizontals = lines.filter(
      (entry) => Math.abs(entry.y1 - entry.y2) < 0.5 && Math.abs(entry.x2 - entry.x1) > width * 0.4,
    )
    const verticals = lines.filter((entry) => Math.abs(entry.x1 - entry.x2) < 0.5 && Math.abs(entry.y1 - entry.y2) > 0.5)
    const topHorizontalY = horizontals.length ? Math.min(...horizontals.map((entry) => entry.y1)) : null
    return { horizontalCount: horizontals.length, verticalCount: verticals.length, topHorizontalY }
  })

  expect(lineStats.horizontalCount).toBe(2)
  expect(lineStats.verticalCount).toBeGreaterThanOrEqual(1)

  const textStats = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => ({
        text: (node.textContent ?? '').trim(),
        y: Number(node.getAttribute('y')),
      }))
      .filter((entry) => entry.text.length > 0 && Number.isFinite(entry.y))
    return {
      texts: texts.map((entry) => entry.text),
      topY: texts.length ? Math.min(...texts.map((entry) => entry.y)) : null,
    }
  })

  expect(textStats.texts).toContain('53')
  expect(textStats.texts).toContain('42')
  expect(textStats.texts.some((text) => text.includes('Difference:'))).toBeTruthy()
  expect(textStats.topY).not.toBeNull()
  expect(lineStats.topHorizontalY).not.toBeNull()
  if (lineStats.topHorizontalY != null && textStats.topY != null) {
    expect(textStats.topY).toBeLessThan(lineStats.topHorizontalY)
  }
})

test('simple bar diff(signed) restores rail-style comparison annotations with delta text', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { op: 'diff', field: 'rating', targetA: 'USA', targetB: 'JPN', signed: true },
  ])

  const lineStats = await page.evaluate(() => {
    const svg = document.querySelector('svg')
    const width = svg?.getBoundingClientRect().width ?? 0
    const lines = Array.from(document.querySelectorAll('svg line.annotation.line-annotation'))
      .filter((line) => (line.getAttribute('stroke') || '').toLowerCase() === '#ef4444')
      .map((line) => {
        const x1 = Number(line.getAttribute('x1'))
        const x2 = Number(line.getAttribute('x2'))
        const y1 = Number(line.getAttribute('y1'))
        const y2 = Number(line.getAttribute('y2'))
        return { x1, x2, y1, y2 }
      })
      .filter((entry) => [entry.x1, entry.x2, entry.y1, entry.y2].every(Number.isFinite))
    const horizontals = lines.filter(
      (entry) => Math.abs(entry.y1 - entry.y2) < 0.5 && Math.abs(entry.x2 - entry.x1) > width * 0.4,
    )
    const verticals = lines.filter((entry) => Math.abs(entry.x1 - entry.x2) < 0.5 && Math.abs(entry.y1 - entry.y2) > 0.5)
    return { horizontalCount: horizontals.length, verticalCount: verticals.length }
  })

  expect(lineStats.horizontalCount).toBe(2)
  expect(lineStats.verticalCount).toBeGreaterThanOrEqual(1)

  const textStats = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((entry) => entry.length > 0)
    return {
      texts,
    }
  })

  expect(textStats.texts).toContain('53')
  expect(textStats.texts).toContain('42')
  expect(textStats.texts.some((text) => text.includes('Difference:'))).toBeTruthy()
})

test('a new run clears transient average annotations before rendering the next result', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'average', field: 'rating', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
  ])

  await expect(page.locator('[data-annotation-slot="aggregate-line:__root__:average"]')).toHaveCount(1)
  await expect(page.locator('[data-annotation-slot="aggregate-text:__root__:average"]')).toHaveCount(1)

  await runSingleOpsGroup(page, [
    {
      id: 'n2',
      op: 'filter',
      field: 'rating',
      operator: '>',
      value: 60,
      meta: { nodeId: 'n2', inputs: [], sentenceIndex: 1 },
    },
  ])

  await expect(page.locator('[data-annotation-slot="aggregate-line:__root__:average"]')).toHaveCount(0)
  await expect(page.locator('[data-annotation-slot="aggregate-text:__root__:average"]')).toHaveCount(0)
})

test('simple bar diff replaces duplicate semantic value labels instead of stacking them', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { id: 'n1', op: 'findExtremum', field: 'rating', which: 'max', meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 } },
    { id: 'n2', op: 'findExtremum', field: 'rating', which: 'min', meta: { nodeId: 'n2', inputs: [], sentenceIndex: 1 } },
    {
      id: 'n3',
      op: 'diff',
      field: 'rating',
      targetA: 'ref:n1',
      targetB: 'ref:n2',
      meta: { nodeId: 'n3', inputs: ['n1', 'n2'], sentenceIndex: 1 },
    },
  ])

  await expect(page.locator('[data-annotation-slot="value-label:__root__:NLD:__all__"]')).toHaveCount(1)
  await expect(page.locator('[data-annotation-slot="value-label:__root__:PRT:__all__"]')).toHaveCount(1)
})

test('simple bar compareBool keeps boolean explanation and restores rail-style diff annotations', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { op: 'compareBool', field: 'rating', targetA: 'USA', targetB: 'JPN', operator: '>=' },
  ])

  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0)
          .join(' '),
      ),
    )
    .toBe('USA is greater than or equal to JPN.')

  const stats = await page.evaluate(() => {
    const svg = document.querySelector('svg')
    const width = svg?.getBoundingClientRect().width ?? 0
    const lines = Array.from(document.querySelectorAll('svg line.annotation.line-annotation'))
      .filter((line) => (line.getAttribute('stroke') || '').toLowerCase() === '#ef4444')
      .map((line) => {
        const x1 = Number(line.getAttribute('x1'))
        const x2 = Number(line.getAttribute('x2'))
        const y1 = Number(line.getAttribute('y1'))
        const y2 = Number(line.getAttribute('y2'))
        return { x1, x2, y1, y2 }
      })
      .filter((entry) => [entry.x1, entry.x2, entry.y1, entry.y2].every(Number.isFinite))
    const longHorizontals = lines.filter(
      (entry) => Math.abs(entry.y1 - entry.y2) < 0.5 && Math.abs(entry.x2 - entry.x1) > width * 0.4,
    )
    const verticals = lines.filter((entry) => Math.abs(entry.x1 - entry.x2) < 0.5 && Math.abs(entry.y1 - entry.y2) > 0.5)
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((text) => text.length > 0)
    return { longHorizontals: longHorizontals.length, verticals: verticals.length, texts }
  })

  expect(stats.longHorizontals).toBe(2)
  expect(stats.verticals).toBeGreaterThanOrEqual(1)
  expect(stats.texts.some((text) => text.includes('Difference:'))).toBeTruthy()
  expect(stats.texts).not.toContain('0')
  expect(stats.texts).not.toContain('1')
})
