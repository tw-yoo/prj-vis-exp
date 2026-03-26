import { expect, test, type Page } from '@playwright/test'
import { MULTILINE_LAYER_NO_TOP_ENCODING_SPEC } from './fixtures/specs'

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
}

test('워크벤치: multi-line(layer encoding) -> stacked bar 변환이 크래시 없이 동작한다', async ({ page }) => {
  await renderSpec(page, MULTILINE_LAYER_NO_TOP_ENCODING_SPEC)

  await page.getByTestId('draw-tool-convert').click()
  await page.getByTestId('draw-convert-multiline-stacked').click()

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const host = document.querySelector('[data-testid="chart-host"]') as any
        const spec = host?.__lastVegaLiteSpec
        const markType = typeof spec?.mark === 'string' ? spec.mark : spec?.mark?.type
        const stack = spec?.encoding?.y?.stack ?? null
        return { markType, stack }
      })
    })
    .toEqual({ markType: 'bar', stack: 'zero' })
})

