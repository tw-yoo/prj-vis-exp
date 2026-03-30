import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

function loadStackedSpec() {
  const specPath = path.resolve(process.cwd(), 'data/test/spec/bar_stacked_ver.json')
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

test('stacked retrieveValue는 target bar 전체를 강조하고 합계 라벨을 1회 표시한다', async ({ page }) => {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(loadStackedSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await runSingleOpsGroup(page, [
    {
      id: 'n1',
      op: 'retrieveValue',
      field: 'count',
      target: '1',
      meta: {
        nodeId: 'n1',
        inputs: [],
        sentenceIndex: 1,
      },
    },
  ])

  const summary = await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar'))
    const redBars = bars.filter((bar) => (bar.getAttribute('fill') ?? '').trim().toLowerCase() === '#ef4444')
    const redTargets = Array.from(new Set(redBars.map((bar) => (bar.getAttribute('data-target') ?? '').trim())))
    const redOutsideTarget = redBars.filter((bar) => (bar.getAttribute('data-target') ?? '').trim() !== '1').length
    const annotationTexts = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    return {
      redBarsCount: redBars.length,
      redTargets,
      redOutsideTarget,
      value124Count: annotationTexts.filter((value) => value === '124').length,
      value10Count: annotationTexts.filter((value) => value === '10').length,
      annotationCount: annotationTexts.length,
    }
  })

  expect(summary.redBarsCount).toBeGreaterThan(0)
  expect(summary.redTargets).toEqual(['1'])
  expect(summary.redOutsideTarget).toBe(0)
  expect(summary.value124Count).toBe(1)
  expect(summary.value10Count).toBe(0)
  expect(summary.annotationCount).toBe(1)
})
