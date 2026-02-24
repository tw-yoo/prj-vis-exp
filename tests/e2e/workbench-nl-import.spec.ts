import { expect, test } from '@playwright/test'
import { SIMPLE_BAR_SPEC } from './fixtures/specs'

test('NL 입력을 opsSpec으로 변환해 OpsBuilder에 반영한다', async ({ page }) => {
  await page.route('**/generate_grammar', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ops1: {
          ops: [
            { op: 'filter', field: 'country', include: ['USA'] },
            { op: 'sum', field: 'rating' },
          ],
          ops2: [{ op: 'sum', field: 'rating' }],
          ops3: [{ op: 'diff', targetA: 'ops_1', targetB: 'ops2_0' }],
        },
        warnings: ['Ambiguous target resolved with chart defaults.'],
      }),
    })
  })

  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(SIMPLE_BAR_SPEC)
  await page.getByTestId('render-chart-button').click()

  await page.getByTestId('nl-input').fill('sum rating for usa and compare')
  await page.getByTestId('nl-convert-button').click()

  await expect(page.getByTestId('nl-status')).toContainText('Converted opsSpec was applied to OpsBuilder.')
  await expect(page.getByTestId('nl-resolved-text')).toContainText('sum rating for usa and compare')
  await expect(page.getByTestId('nl-warning-list')).toContainText('Ambiguous target resolved with chart defaults.')

  await expect(page.locator('.ops-group input[value="ops"]')).toBeVisible()
  await expect(page.locator('.ops-group input[value="ops2"]')).toBeVisible()
  await expect(page.locator('.ops-group input[value="ops3"]')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)
})
