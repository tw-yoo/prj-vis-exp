import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

const chartContainer = '#chartContainer'
const explanation = '#explanationArea'

async function visibleSvgCount(page: import('@playwright/test').Page) {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector)
    if (!host) return 0
    return Array.from(host.querySelectorAll<SVGSVGElement>('svg')).filter((svg) => {
      const style = window.getComputedStyle(svg)
      const box = svg.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
    }).length
  }, chartContainer)
}

test('evaluation viewer loads the first chart and runs operation-spec steps', async ({ page }) => {
  await page.goto('/evaluation')

  await expect(page).toHaveURL(/\/evaluation\/e1\/?\?page=1$/)
  await expect(page.locator('#chartCounter')).toContainText('Page 1 / 6')
  await expect(page.locator('#chartId')).toContainText('e1_q1')
  await expect(page.locator('#questionText')).toContainText('Which year range is used')
  await expect(page.locator('#descriptionText')).toContainText('Initial evaluation fixture')
  await expect(page.locator(`${chartContainer} svg`)).toBeVisible()
  await expect(page.locator(`${explanation} .sentence`)).toHaveCount(2)
  await expect(page.locator('#surveyArea .survey-question')).toHaveCount(1)
  await expect(page.locator('#surveyArea')).toContainText('Based on the explanation, is the answer correct?')
  await expect(page.locator('#surveyArea input[type="radio"]')).toHaveCount(2)

  await page.locator(`${explanation} .sentence`).nth(0).click()
  await expect(page.locator(`${explanation} .sentence`).nth(0)).toHaveClass(/sentence--selected/)
  await expect(page.locator(`${chartContainer} svg text.operation-next-filter`)).toBeVisible()

  await page.locator(`${explanation} .sentence`).nth(1).click()
  await expect(page.locator(`${explanation} .sentence`).nth(0)).toHaveClass(/sentence--completed/)
  await expect(page.locator(`${explanation} .sentence`).nth(1)).toHaveClass(/sentence--selected/)
  const averageLine = page.locator(`${chartContainer} svg line.operation-next-average`)
  await expect(averageLine).toHaveCount(1)
  await expect(averageLine).toHaveAttribute('data-operation-result-ref', 'n2')
  await expect.poll(() => visibleSvgCount(page)).toBeGreaterThanOrEqual(1)
})

test('evaluation viewer keeps the chart fixed while survey page changes', async ({ page }) => {
  await page.goto('/evaluation/e1?page=1')

  await page.locator(`${explanation} .sentence`).first().click()
  await expect(page.locator(`${chartContainer} svg text.operation-next-filter`)).toBeVisible()

  await page.locator('#nextBtn').click()
  await expect(page).toHaveURL(/\/evaluation\/e1\/?\?page=2$/)
  await expect(page.locator('#chartId')).toContainText('e1_q1')
  await expect(page.locator(`${explanation} .sentence`)).toHaveCount(2)
  await expect(page.locator(`${chartContainer} svg text.operation-next-filter`)).toBeVisible()
  await expect(page.locator('#surveyArea .survey-question')).toHaveCount(3)
  await expect(page.locator('#surveyArea')).toContainText('This system made the reasoning process easy to understand.')
  await expect(page.locator('#surveyArea')).toContainText('This system clearly showed how the answer was derived from the chart.')
  await expect(page.locator('#surveyArea')).toContainText('I trust this system when judging whether an answer is correct.')
  await expect(page.locator('#surveyArea input[type="radio"]')).toHaveCount(21)
})

test('evaluation viewer navigation syncs URL and chart content', async ({ page }) => {
  await page.goto('/evaluation')

  await page.locator('#nextBtn').click()
  await expect(page).toHaveURL(/\/evaluation\/e1\/?\?page=2$/)
  await expect(page.locator('#chartCounter')).toContainText('Page 2 / 6')
  await expect(page.locator('#chartId')).toContainText('e1_q1')
  await expect(page.locator('#questionText')).toContainText('Which year range is used')
  await expect(page.locator(`${explanation} .sentence`)).toHaveCount(2)

  await page.locator('#nextBtn').click()
  await expect(page).toHaveURL(/\/evaluation\/e1\/?\?page=3$/)
  await expect(page.locator('#chartCounter')).toContainText('Page 3 / 6')
  await expect(page.locator('#chartId')).toContainText('e1_q2')
  await expect(page.locator('#questionText')).toContainText('maximum and minimum')
  await expect(page.locator(`${explanation} .sentence`)).toHaveCount(3)

  await page.locator('#prevBtn').click()
  await expect(page).toHaveURL(/\/evaluation\/e1\/?\?page=2$/)
  await expect(page.locator('#chartId')).toContainText('e1_q1')
})

test('evaluation viewer reports invalid opsSpec without blanking the chart', async ({ page }) => {
  await page.goto('/evaluation/e1?page=5')

  await expect(page.locator('#chartId')).toContainText('e1_bad')
  await expect(page.locator(`${chartContainer} svg`)).toBeVisible()
  await expect(page.locator(`${chartContainer} svg rect.main-bar`)).not.toHaveCount(0)

  await page.locator(`${explanation} .sentence`).first().click()
  await expect(page.locator(`${explanation} .sentence`).first()).toHaveClass(/sentence--error/)
  await expect(page.locator('#statusArea')).toHaveClass(/status--error/)
  await expect(page.locator('#statusArea')).toContainText('Invalid operation spec')
  await expect.poll(() => visibleSvgCount(page)).toBeGreaterThanOrEqual(1)
})
