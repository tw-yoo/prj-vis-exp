import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

async function expectSurfaceSvg(page: Parameters<typeof test>[0]['page'], surfaceId: string) {
  const surface = page.locator(`[data-surface-id="${surfaceId}"]`)
  await expect(surface).toBeVisible()
  await expect(surface.locator('svg')).toHaveCount(1)
  await expect(surface.locator('svg').first()).toBeVisible()
}

test('demo page renders the chart, question, and step list', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByTestId('demo-chart-host')).toBeVisible()
  await expect(page.getByTestId('demo-question-text')).toContainText('How many countries have a rating above the overall average?')
  await expect(page.getByTestId('demo-description-text')).toContainText('`average`')
  await expect(page.getByTestId('demo-sentence-list')).toBeVisible()
  await expect(page.getByTestId('demo-sentence-item-0')).toBeVisible()
  await expect(page.getByTestId('demo-status')).toContainText('Loaded')
})

test('clicking a step runs only the next unlocked step and updates active state', async ({ page }) => {
  await page.goto('/demo')

  const step1 = page.getByTestId('demo-sentence-item-0')
  const step2 = page.getByTestId('demo-sentence-item-1')
  const step3 = page.getByTestId('demo-sentence-item-2')
  await expect(step1).toBeVisible()
  await expect(step1).toBeEnabled()
  await expect(step2).toBeDisabled()
  await expect(step3).toBeDisabled()
  await step1.click()

  await expect(step1).toHaveClass(/is-active/)
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 1')
  await expect(step2).toBeEnabled()
  await expect(step3).toBeDisabled()
})

test('starting the next demo step clears transient average annotations from the previous step', async ({ page }) => {
  await page.goto('/demo')

  const averageLine = page.locator('[data-annotation-slot="aggregate-line:__root__:average"]')
  const averageText = page.locator('[data-annotation-slot="aggregate-text:__root__:average"]')

  await page.getByTestId('demo-sentence-item-0').click()
  await expect(averageLine).toHaveCount(1)
  await expect(averageText).toHaveCount(1)

  await page.getByTestId('demo-sentence-item-1').click()
  await expect(averageLine).toHaveCount(0)
  await expect(averageText).toHaveCount(0)
})

test('simple bar q1 step 2 explanation resolves the average ref to a concrete value', async ({ page }) => {
  await page.goto('/demo')

  await page.getByTestId('demo-sentence-item-0').click()
  await page.getByTestId('demo-sentence-item-1').click()

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGTSpanElement>('svg .chart-explanation-text tspan'))
          .map((node) => (node.textContent ?? '').trim())
          .filter((value) => value.length > 0)
          .join(' '),
      ),
    )
    .toBe('The chart shows values above 56.45.')

  await expect(page.locator('svg .chart-explanation-text')).not.toContainText('ref:sb_q1_avg')
  await expect(page.locator('svg .chart-explanation-text')).not.toContainText('ref:')
})

test('simple bar q2 keeps split surfaces visible through the final diff step', async ({ page }) => {
  await page.goto('/demo')

  await page.getByTestId('demo-question-item-1').click()
  await page.getByTestId('demo-sentence-item-0').click()
  await expectSurfaceSvg(page, 'nordic')
  await expectSurfaceSvg(page, 'english')
  await page.getByTestId('demo-sentence-item-1').click()
  await page.getByTestId('demo-sentence-item-2').click()
  await page.getByTestId('demo-sentence-item-3').click()

  await expectSurfaceSvg(page, 'nordic')
  await expectSurfaceSvg(page, 'english')
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 4')
  await expect(page.getByTestId('demo-error')).toHaveCount(0)
})

test('switching to a split question shows four explanation steps', async ({ page }) => {
  await page.goto('/demo')

  await page.getByTestId('demo-question-item-1').click()
  await expect(page.getByTestId('demo-question-text')).toContainText(
    'If the chart is split into Nordic countries and English-speaking countries, what is the difference between the average ratings of the two panels?',
  )
  await expect(page.getByTestId('demo-sentence-item-3')).toBeVisible()

  await page.getByTestId('demo-question-item-2').click()

  await expect(page.getByTestId('demo-question-text')).toContainText(
    'If the chart is split into Nordic countries and English-speaking countries',
  )
  await expect(page.getByTestId('demo-sentence-item-3')).toBeVisible()
})

test('split questions keep split layout across steps and restore earlier snapshots', async ({ page }) => {
  await page.goto('/demo')

  await page.getByTestId('demo-question-item-1').click()

  const simpleStep1 = page.getByTestId('demo-sentence-item-0')
  const simpleStep2 = page.getByTestId('demo-sentence-item-1')
  const simpleStep3 = page.getByTestId('demo-sentence-item-2')
  const simpleStep4 = page.getByTestId('demo-sentence-item-3')
  await simpleStep1.click()
  await expectSurfaceSvg(page, 'nordic')
  await expectSurfaceSvg(page, 'english')
  await expect(simpleStep2).toBeEnabled()
  await expect(simpleStep4).toBeDisabled()

  await simpleStep2.click()
  await expectSurfaceSvg(page, 'nordic')
  await expectSurfaceSvg(page, 'english')
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 2')

  await simpleStep1.click()
  await expect(page.getByTestId('demo-status')).toContainText('Restored step 1')
  await expect(simpleStep2).toBeEnabled()
  await expect(simpleStep4).toBeDisabled()

  await page.getByTestId('demo-chart-tab-1').click()
  await page.getByTestId('demo-question-item-1').click()

  const stackedStep1 = page.getByTestId('demo-sentence-item-0')
  const stackedStep2 = page.getByTestId('demo-sentence-item-1')
  const stackedStep3 = page.getByTestId('demo-sentence-item-2')
  const stackedStep4 = page.getByTestId('demo-sentence-item-3')
  await stackedStep1.click()
  await expectSurfaceSvg(page, 'early')
  await expectSurfaceSvg(page, 'late')
  await expect(stackedStep2).toBeEnabled()
  await expect(stackedStep4).toBeDisabled()

  await stackedStep2.click()
  await expectSurfaceSvg(page, 'early')
  await expectSurfaceSvg(page, 'late')
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 2')

  await stackedStep1.click()
  await expect(page.getByTestId('demo-status')).toContainText('Restored step 1')
  await expect(stackedStep2).toBeEnabled()
  await expect(stackedStep4).toBeDisabled()

  await page.getByTestId('demo-chart-tab-2').click()
  await page.getByTestId('demo-question-item-2').click()

  const groupedStep1 = page.getByTestId('demo-sentence-item-0')
  const groupedStep2 = page.getByTestId('demo-sentence-item-1')
  const groupedStep3 = page.getByTestId('demo-sentence-item-2')
  await groupedStep1.click()
  await expectSurfaceSvg(page, 'mature')
  await expectSurfaceSvg(page, 'growth')
  await expect(groupedStep2).toBeEnabled()
  await expect(groupedStep3).toBeDisabled()

  await groupedStep2.click()
  await expectSurfaceSvg(page, 'mature')
  await expectSurfaceSvg(page, 'growth')
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 2')

  await groupedStep1.click()
  await expect(page.getByTestId('demo-status')).toContainText('Restored step 1')
  await expect(groupedStep2).toBeEnabled()
  await expect(groupedStep3).toBeDisabled()

  await page.getByTestId('demo-chart-tab-4').click()
  await page.getByTestId('demo-question-item-2').click()

  const multiStep1 = page.getByTestId('demo-sentence-item-0')
  const multiStep2 = page.getByTestId('demo-sentence-item-1')
  const multiStep3 = page.getByTestId('demo-sentence-item-2')
  await multiStep1.click()
  await expectSurfaceSvg(page, 'firstHalf2000')
  await expectSurfaceSvg(page, 'secondHalf2000')
  await expect(multiStep2).toBeEnabled()
  await expect(multiStep3).toBeDisabled()

  await multiStep2.click()
  await expectSurfaceSvg(page, 'firstHalf2000')
  await expectSurfaceSvg(page, 'secondHalf2000')
  await expect(page.getByTestId('demo-status')).toContainText('Executed step 2')

  await multiStep1.click()
  await expect(page.getByTestId('demo-status')).toContainText('Restored step 1')
  await expect(multiStep2).toBeEnabled()
  await expect(multiStep3).toBeDisabled()
})

test('switching charts or questions resets the demo playback session', async ({ page }) => {
  await page.goto('/demo')

  await page.getByTestId('demo-sentence-item-0').click()
  await expect(page.getByTestId('demo-sentence-item-1')).toBeEnabled()

  await page.getByTestId('demo-question-item-1').click()
  await expect(page.getByTestId('demo-sentence-item-0')).toBeEnabled()
  await expect(page.getByTestId('demo-sentence-item-1')).toBeDisabled()
  await expect(page.getByTestId('demo-status')).toContainText('Loaded')

  await page.getByTestId('demo-chart-tab-1').click()
  await expect(page.getByTestId('demo-sentence-item-0')).toBeEnabled()
  await expect(page.getByTestId('demo-sentence-item-1')).toBeDisabled()
  await expect(page.getByTestId('demo-status')).toContainText('Loaded')
})

test('every demo question runs through its last step without errors', async ({ page }) => {
  await page.goto('/demo')

  for (let chartIndex = 0; chartIndex < 5; chartIndex += 1) {
    await page.getByTestId(`demo-chart-tab-${chartIndex}`).click()

    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      await page.getByTestId(`demo-question-item-${questionIndex}`).click()

      const stepButtons = await page.locator('[data-testid^="demo-sentence-item-"]').all()
      for (let stepIndex = 0; stepIndex < stepButtons.length; stepIndex += 1) {
        await page.getByTestId(`demo-sentence-item-${stepIndex}`).click()
      }

      await expect(page.getByTestId('demo-status')).toContainText('Executed step')
      await expect(page.getByTestId('demo-error')).toHaveCount(0)
    }
  }
})
