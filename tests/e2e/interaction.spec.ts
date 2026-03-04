import { expect, test, type Page } from '@playwright/test'
import { SIMPLE_BAR_SPEC } from './fixtures/specs'

const chartHost = '[data-testid="chart-host"]'

async function renderSimpleBarFixture(page: Page) {
  await page.getByTestId('vl-spec-input').fill(SIMPLE_BAR_SPEC)
  await page.getByTestId('render-chart-button').click()
}

async function getBarMarks(page: Page) {
  const mainBars = page.locator(`${chartHost} svg rect.main-bar`)
  if ((await mainBars.count()) > 0) {
    return mainBars
  }
  const symbolBars = page.locator(
    `${chartHost} svg [role="graphics-symbol"][aria-roledescription="bar"][data-target]:not(.background)`,
  )
  if ((await symbolBars.count()) > 0) {
    return symbolBars
  }
  return page.locator(`${chartHost} svg rect[data-target]:not(.background), ${chartHost} svg path[data-target]:not(.background)`)
}

async function waitForChartReady(page: Page) {
  await page.goto('/')
  await renderSimpleBarFixture(page)
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  await expect
    .poll(async () => {
      const bars = await getBarMarks(page)
      return bars.count()
    })
    .toBeGreaterThan(1)
}

async function dragOnChart(
  page: Page,
  from: { xRatio: number; yRatio: number },
  to: { xRatio: number; yRatio: number },
) {
  const svg = page.locator(`${chartHost} svg`).first()
  const box = await svg.boundingBox()
  if (!box) throw new Error('Chart svg bounding box not available.')

  const startX = box.x + box.width * from.xRatio
  const startY = box.y + box.height * from.yRatio
  const endX = box.x + box.width * to.xRatio
  const endY = box.y + box.height * to.yRatio

  await svg.evaluate(
    (node, payload) => {
      const dispatch = (target: EventTarget, type: string, x: number, y: number, buttons: number) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'mouse',
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons,
            clientX: x,
            clientY: y,
          }),
        )
      }

      dispatch(node, 'pointerdown', payload.startX, payload.startY, 1)
      for (let step = 1; step <= 6; step += 1) {
        const t = step / 6
        const x = payload.startX + (payload.endX - payload.startX) * t
        const y = payload.startY + (payload.endY - payload.startY) * t
        dispatch(window, 'pointermove', x, y, 1)
      }
      dispatch(window, 'pointerup', payload.endX, payload.endY, 0)
    },
    { startX, startY, endX, endY },
  )
}

test('TC1 highlight 클릭', async ({ page }) => {
  await waitForChartReady(page)
  await page.getByTestId('draw-tool-highlight').click()

  const bars = await getBarMarks(page)
  const firstBar = bars.first()
  await firstBar.click()
  const fill = await firstBar.getAttribute('fill')
  expect(fill).toBeTruthy()
  expect(fill ?? '').toMatch(/ef4444|239,\s*68,\s*68/i)
})

test('TC2 dim 클릭', async ({ page }) => {
  await waitForChartReady(page)
  await page.getByTestId('draw-tool-dim').click()

  const bars = await getBarMarks(page)
  await bars.nth(0).click()
  await expect
    .poll(async () => {
      const value = await bars.nth(1).evaluate((el) => window.getComputedStyle(el as Element).opacity)
      return Number(value)
    })
    .toBeLessThan(1)
})

test('TC3 text 클릭 입력', async ({ page }) => {
  await waitForChartReady(page)
  await page.getByTestId('draw-tool-text').click()

  const svg = page.locator(`${chartHost} svg`).first()
  await svg.click({ position: { x: 240, y: 120 } })
  const input = page.getByTestId('draw-text-overlay-input')
  await expect(input).toBeVisible()
  await input.fill('E2E note')
  await input.press('Enter')

  await expect(page.locator(`${chartHost} svg text.annotation`, { hasText: 'E2E note' })).toBeVisible()
})

test('TC4 rect 드래그 생성', async ({ page }) => {
  await waitForChartReady(page)
  await page.getByTestId('draw-tool-rect').click()
  await dragOnChart(page, { xRatio: 0.3, yRatio: 0.35 }, { xRatio: 0.55, yRatio: 0.62 })
  await expect(page.locator(`${chartHost} svg rect.annotation`)).toHaveCount(1)
})

test('TC5 line 드래그 + 툴 전환', async ({ page }) => {
  await waitForChartReady(page)
  await page.getByTestId('draw-tool-line').click()
  await dragOnChart(page, { xRatio: 0.25, yRatio: 0.7 }, { xRatio: 0.75, yRatio: 0.35 })
  await expect(page.locator(`${chartHost} svg line.annotation`)).toHaveCount(1)

  await page.getByTestId('draw-tool-dim').click()
  await expect(page.getByTestId('draw-tool-dim')).toHaveClass(/is-active/)
})

test('TC6 ESC 취소(드래그/텍스트)', async ({ page }) => {
  await waitForChartReady(page)
  await page.getByTestId('draw-tool-rect').click()

  const beforeCount = await page.locator(`${chartHost} svg rect.annotation`).count()
  const svg = page.locator(`${chartHost} svg`).first()
  const box = await svg.boundingBox()
  if (!box) throw new Error('Chart svg bounding box not available.')

  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 8 })
  await page.keyboard.press('Escape')
  await page.mouse.up()

  const afterDragCount = await page.locator(`${chartHost} svg rect.annotation`).count()
  expect(afterDragCount).toBe(beforeCount)

  await page.getByTestId('draw-tool-text').click()
  await svg.click({ position: { x: 200, y: 110 } })
  const input = page.getByTestId('draw-text-overlay-input')
  await expect(input).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
})
