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

test('simple bar compare draws red highlights, two hlines, vertical compare line, and top compare text', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { op: 'compare', field: 'rating', targetA: 'USA', targetB: 'JPN' },
  ])

  const lineStats = await page.evaluate(() => {
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
    const horizontals = lines.filter((entry) => Math.abs(entry.y1 - entry.y2) < 0.5)
    const verticals = lines.filter((entry) => Math.abs(entry.x1 - entry.x2) < 0.5 && Math.abs(entry.y1 - entry.y2) > 0.5)
    const topHorizontalY = horizontals.length ? Math.min(...horizontals.map((entry) => entry.y1)) : null
    return { horizontalCount: horizontals.length, verticalCount: verticals.length, topHorizontalY }
  })

  expect(lineStats.horizontalCount).toBeGreaterThanOrEqual(2)
  expect(lineStats.verticalCount).toBeGreaterThanOrEqual(1)

  const compareText = page.locator('svg text.annotation.text-annotation', { hasText: 'compare:' }).first()
  await expect(compareText).toBeVisible()
  await expect(page.locator('svg text.annotation.text-annotation', { hasText: '53' }).first()).toBeVisible()
  await expect(page.locator('svg text.annotation.text-annotation', { hasText: '42' }).first()).toBeVisible()

  const compareY = await compareText.evaluate((node) => Number(node.getAttribute('y')))
  expect(Number.isFinite(compareY)).toBeTruthy()
  expect(lineStats.topHorizontalY).not.toBeNull()
  if (lineStats.topHorizontalY != null) {
    expect(compareY).toBeLessThan(lineStats.topHorizontalY)
  }
})

test('simple bar diff(signed) draws red pair lines, vertical compare line, and top delta text', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    { op: 'diff', field: 'rating', targetA: 'USA', targetB: 'JPN', signed: true },
  ])

  const lineStats = await page.evaluate(() => {
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
    const horizontals = lines.filter((entry) => Math.abs(entry.y1 - entry.y2) < 0.5)
    const verticals = lines.filter((entry) => Math.abs(entry.x1 - entry.x2) < 0.5 && Math.abs(entry.y1 - entry.y2) > 0.5)
    const topHorizontalY = horizontals.length ? Math.min(...horizontals.map((entry) => entry.y1)) : null
    return { horizontalCount: horizontals.length, verticalCount: verticals.length, topHorizontalY }
  })

  expect(lineStats.horizontalCount).toBeGreaterThanOrEqual(2)
  expect(lineStats.verticalCount).toBeGreaterThanOrEqual(1)

  const deltaText = page.locator('svg text.annotation.text-annotation', { hasText: 'Δ:' }).first()
  await expect(deltaText).toBeVisible()

  const deltaY = await deltaText.evaluate((node) => Number(node.getAttribute('y')))
  expect(Number.isFinite(deltaY)).toBeTruthy()
  expect(lineStats.topHorizontalY).not.toBeNull()
  if (lineStats.topHorizontalY != null) {
    expect(deltaY).toBeLessThan(lineStats.topHorizontalY)
  }
})
