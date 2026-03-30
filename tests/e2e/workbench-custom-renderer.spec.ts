import { expect, test, type Page } from '@playwright/test'
import { SIMPLE_BAR_SPEC } from './fixtures/specs'

async function ensureSpecPanelOpen(page: Page) {
  const specInput = page.getByTestId('vl-spec-input')
  const inputVisible = await specInput.isVisible().catch(() => false)
  if (inputVisible) return
  const expandButton = page.getByRole('button', { name: 'Expand' }).first()
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click()
  }
}

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await ensureSpecPanelOpen(page)
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    if (!host) return false
    return host.querySelectorAll('svg rect.main-bar').length > 0
  })
}

test('워크벤치: simple bar는 커스텀 D3 렌더러로 렌더링한다', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await expect(page.locator('[data-testid="chart-host"] svg rect.main-bar')).toHaveCount(4)
})
