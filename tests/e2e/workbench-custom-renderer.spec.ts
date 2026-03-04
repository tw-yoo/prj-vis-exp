import { expect, test, type Page } from '@playwright/test'
import { SIMPLE_BAR_SPEC } from './fixtures/specs'

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
}

test('워크벤치: simple bar는 커스텀 D3 렌더러로 렌더링한다', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await expect(page.locator('[data-testid="chart-host"] svg rect.main-bar')).toHaveCount(4)
})

