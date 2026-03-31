import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

test('demo page renders the chart, question, and step list', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByTestId('demo-chart-host')).toBeVisible()
  await expect(page.getByTestId('demo-question-text')).toContainText('How many countries have a rating above the overall average?')
  await expect(page.getByTestId('demo-description-text')).toContainText('`average`')
  await expect(page.getByTestId('demo-sentence-list')).toBeVisible()
  await expect(page.getByTestId('demo-sentence-item-0')).toBeVisible()
  await expect(page.getByTestId('demo-status')).toContainText('Loaded')
})

test('clicking a step runs the cumulative sequence and updates active state', async ({ page }) => {
  await page.goto('/demo')

  const item = page.getByTestId('demo-sentence-item-0')
  await expect(item).toBeVisible()
  await item.click()

  await expect(item).toHaveClass(/is-active/)
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 1')
})

test('switching to a split question shows four explanation steps', async ({ page }) => {
  await page.goto('/demo')

  await page.getByTestId('demo-question-item-2').click()

  await expect(page.getByTestId('demo-question-text')).toContainText(
    'If the chart is split into Nordic countries and English-speaking countries',
  )
  await expect(page.getByTestId('demo-sentence-item-3')).toBeVisible()
})

test('every demo question runs through its last step without errors', async ({ page }) => {
  await page.goto('/demo')

  for (let chartIndex = 0; chartIndex < 5; chartIndex += 1) {
    await page.getByTestId(`demo-chart-tab-${chartIndex}`).click()

    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      await page.getByTestId(`demo-question-item-${questionIndex}`).click()

      const stepButtons = await page.locator('[data-testid^="demo-sentence-item-"]').all()
      await stepButtons[stepButtons.length - 1].click()

      await expect(page.getByTestId('demo-status')).toContainText('Executed step')
      await expect(page.getByTestId('demo-error')).toHaveCount(0)
    }
  }
})
