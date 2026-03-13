import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

function loadSimpleBarSpec() {
  const specPath = path.resolve(process.cwd(), 'data/test/spec/bar_simple_ver.json')
  return fs.readFileSync(specPath, 'utf-8')
}

async function ensureSpecInputVisible(page: Page) {
  const input = page.getByTestId('vl-spec-input')
  if ((await input.count()) === 0) {
    await page.getByRole('button', { name: 'Expand' }).first().click()
  }
  await expect(input).toBeVisible({ timeout: 60_000 })
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

test('simple bar sum stacks existing bars into sum column without recoloring marks', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  const beforeFills = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg rect.main-bar'))
      .map((node) => (node.getAttribute('fill') || '').trim().toLowerCase())
      .filter((fill) => fill.length > 0),
  )
  const beforeTotal = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg rect.main-bar'))
      .map((node) => Number(node.getAttribute('data-value')))
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0),
  )

  await runSingleOpsGroup(page, [{ op: 'sum', field: 'rating' }])

  const after = await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
      .filter((node) => {
        const display = node.style.display
        const opacity = Number(node.getAttribute('opacity') ?? '1')
        return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0)
      })
    const sumBars = bars.filter((node) => (node.getAttribute('data-target') || '').trim() === 'Sum')
    const fills = bars
      .map((node) => (node.getAttribute('fill') || '').trim().toLowerCase())
      .filter((fill) => fill.length > 0)
    return { visibleBarCount: bars.length, sumBarCount: sumBars.length, fills }
  })

  expect(after.visibleBarCount).toBeGreaterThan(1)
  expect(after.sumBarCount).toBeGreaterThan(1)
  expect(after.fills).toEqual(beforeFills)
  const expected = Number.isFinite(beforeTotal) ? String(Number(beforeTotal.toFixed(2))).replace(/\.0+$/, '') : ''
  if (expected) {
    await expect(page.locator('svg text.sum-value-annotation').first()).toContainText(expected)
  }
})

test('simple bar scale draws red lines/arrows only', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [{ op: 'scale', field: 'rating', target: 'USA', factor: 1.1 }])

  const annotationLineStrokes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg .annotation.line-annotation'))
      .map((node) => (node.getAttribute('stroke') || '').trim().toLowerCase())
      .filter((stroke) => stroke.length > 0),
  )
  expect(annotationLineStrokes.length).toBeGreaterThan(0)
  expect(annotationLineStrokes.every((stroke) => stroke === '#ef4444')).toBeTruthy()
  await expect(page.locator('svg text.annotation.text-annotation', { hasText: 'scale:' }).first()).toBeVisible()
  await expect(page.locator('svg text.annotation.text-annotation', { hasText: '53' }).first()).toBeVisible()
})
