import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const chartHost = '[data-testid="chart-host"]'
const SPECS_DIR = path.join(__dirname, '..', '..', 'data', 'test_case_specs')
const VL_SPECS = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, '_vl_specs.json'), 'utf8')) as Record<string, string>

const CHART_IDS = [
  'avwb8xstxx1lmfpk',
  '273wm22z47ptlhzz',
  '7iy5s09teyeaybzy',
  '21klhgimadx4zsi9',
  '77xb5ug5lhfmkb74',
  '7mw5410egrxfi2oy',
  '90tonvacpe7zniv9',
  'ae2xp7bacbbs0kmx',
  '1g95in84ywix6pcf',
  '1hv85ef35tbvldiq',
]

async function clickStepIfAvailable(page: Page, label: 'Start' | 'Next', timeout = 5000): Promise<boolean> {
  const button = page.getByRole('button', { name: label })
  try {
    await expect(button).toBeVisible({ timeout })
    await expect(button).toBeEnabled({ timeout })
  } catch {
    return false
  }
  await button.click()
  return true
}

async function renderAndRun(page: Page, vlSpec: string, opsSpec: object) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(vlSpec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify(opsSpec, null, 2))
  const runBtn = page.getByRole('button', { name: 'Run Operations' })
  await expect(runBtn).toBeEnabled({ timeout: 30_000 })
  await runBtn.click()
  // Click Start, then repeatedly advance via Next until no more groups remain
  const started = await clickStepIfAvailable(page, 'Start', 30_000)
  if (!started) {
    // Operations may have nothing runnable — bail with what we have
    await page.waitForTimeout(500)
    return
  }
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(700)
    const advanced = await clickStepIfAvailable(page, 'Next', 4000)
    if (!advanced) break
  }
  await page.waitForTimeout(1000)
}

async function captureAnnotationState(page: Page) {
  return await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="chart-host"] svg, .chart-host svg') as SVGSVGElement | null
    if (!svg) return { error: 'no svg', layer: false }
    const layer = svg.querySelector('.operation-next-annotation-layer')
    return {
      layer: !!layer,
      layerLines: layer?.querySelectorAll('line').length ?? 0,
      layerTexts: layer?.querySelectorAll('text').length ?? 0,
      layerRects: layer?.querySelectorAll('rect').length ?? 0,
      layerCircles: layer?.querySelectorAll('circle').length ?? 0,
      annotationSlots: Array.from(svg.querySelectorAll('[data-annotation-slot]'))
        .map((n) => n.getAttribute('data-annotation-slot')),
      layerHtml: layer?.innerHTML?.slice(0, 2000) ?? '',
    }
  })
}

for (const chartId of CHART_IDS) {
  test(`spec ${chartId} renders annotations without errors`, async ({ page }) => {
    const vlSpec = VL_SPECS[chartId]
    const opsSpec = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, `${chartId}.json`), 'utf8'))
    expect(vlSpec).toBeTruthy()
    expect(opsSpec).toBeTruthy()

    const fatalLogs: string[] = []
    const opLogs: string[] = []
    page.on('console', (message) => {
      const text = message.text()
      if (/\[ops:data-op\] execution failed|\[operation-next\].*error|Run Operations failed/i.test(text)) {
        fatalLogs.push(text)
      }
      if (/\[operation-next\]/.test(text)) opLogs.push(text)
    })

    await renderAndRun(page, vlSpec, opsSpec)

    const state = await captureAnnotationState(page)
    console.log(`\n=== ${chartId} ===`)
    console.log('annotation layer:', state.layer)
    console.log('counts:', { lines: state.layerLines, texts: state.layerTexts, rects: state.layerRects, circles: state.layerCircles })
    console.log('slots:', state.annotationSlots)
    console.log('opLogs:', opLogs.slice(-10))
    if (fatalLogs.length) console.log('FATAL:', fatalLogs)

    expect(fatalLogs, `Fatal errors for ${chartId}`).toHaveLength(0)
    // Annotation layer should exist (operations actually rendered something)
    expect(state.layer, `annotation layer missing for ${chartId}`).toBe(true)
    // At least one annotation primitive (line/text/rect/circle) should be present
    const totalPrimitives = state.layerLines + state.layerTexts + state.layerRects + state.layerCircles
    expect(totalPrimitives, `no annotation primitives for ${chartId}`).toBeGreaterThan(0)
  })
}
