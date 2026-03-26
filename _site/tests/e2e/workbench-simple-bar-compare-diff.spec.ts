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
  const inlineRunButton = page.getByRole('button', { name: 'Run' }).last()
  const hasInlineRun = await inlineRunButton
    .isVisible({ timeout: 2000 })
    .then((value) => value)
    .catch(() => false)
  if (hasInlineRun) {
    await expect(inlineRunButton).toBeEnabled({ timeout: 30_000 })
    await inlineRunButton.click()
  }
  await page.waitForTimeout(1200)
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
  expect(textStats.topY).not.toBeNull()
  expect(lineStats.topHorizontalY).not.toBeNull()
  if (lineStats.topHorizontalY != null && textStats.topY != null) {
    expect(textStats.topY).toBeLessThan(lineStats.topHorizontalY)
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

  const textStats = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => ({
        text: (node.textContent ?? '').trim(),
        y: Number(node.getAttribute('y')),
      }))
      .filter((entry) => entry.text.length > 0 && Number.isFinite(entry.y))
    return {
      count: texts.length,
      topY: texts.length ? Math.min(...texts.map((entry) => entry.y)) : null,
    }
  })

  expect(textStats.count).toBeGreaterThan(0)
  expect(lineStats.topHorizontalY).not.toBeNull()
  if (lineStats.topHorizontalY != null && textStats.topY != null) {
    expect(textStats.topY).toBeLessThan(lineStats.topHorizontalY)
  }
})
