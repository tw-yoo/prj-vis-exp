import { expect, test, type Page } from '@playwright/test'

async function ensureSpecPanelOpen(page: Page) {
  const specInput = page.getByTestId('vl-spec-input')
  const inputVisible = await specInput.isVisible().catch(() => false)
  if (inputVisible) return
  const expandButton = page.getByRole('button', { name: 'Expand' }).first()
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click()
  }
}

async function renderSpec(page: Page, spec: Record<string, unknown>, xField?: string) {
  await page.goto('/')
  await ensureSpecPanelOpen(page)
  await page.getByTestId('vl-spec-input').fill(JSON.stringify(spec, null, 2))
  await page.getByTestId('render-chart-button').click()
  await page.waitForFunction((targetXField) => {
    const host = document.querySelector('[data-testid="chart-host"]')
    if (!host) return false
    const svgs = Array.from(host.querySelectorAll<SVGSVGElement>('svg'))
    return svgs.some((svg) => {
      if (typeof targetXField === 'string' && targetXField.length > 0) {
        if (svg.getAttribute('data-x-field') !== targetXField) return false
      }
      return Number(svg.getAttribute('data-render-epoch') ?? '0') > 0
    })
  }, xField ?? null)
}

async function hoverMark(page: Page, selector: string) {
  const mark = page.locator(selector).first()
  await expect(mark).toBeVisible()
  await mark.hover()
  const tooltip = page.locator('.chart-hover-tooltip')
  await expect(tooltip).toBeVisible()
  return tooltip
}

test('tooltip: simple bar는 x/y만 보여주고 group row는 없다', async ({ page }) => {
  await renderSpec(
    page,
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: [{ country: 'USA', rating: 53 }, { country: 'JPN', rating: 42 }] },
      mark: 'bar',
      encoding: {
        x: { field: 'country', type: 'nominal' },
        y: { field: 'rating', type: 'quantitative' },
      },
    },
    'country',
  )

  const tooltip = await hoverMark(page, 'svg[data-x-field="country"] rect.main-bar')
  await expect(tooltip).toContainText('country')
  await expect(tooltip).toContainText('USA')
  await expect(tooltip).toContainText('rating')
  await expect(tooltip).toContainText('53')
  await expect(tooltip).not.toContainText('weather')
  await expect(tooltip.locator('.chart-hover-tooltip__row')).toHaveCount(2)
})

test('tooltip: stacked bar는 x/y/group을 모두 보여준다', async ({ page }) => {
  await renderSpec(
    page,
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { month: 11, weather: 'rain', count: 25 },
          { month: 11, weather: 'sun', count: 42 },
        ],
      },
      mark: 'bar',
      encoding: {
        x: { field: 'month', type: 'ordinal' },
        y: { field: 'count', type: 'quantitative', stack: 'zero' },
        color: { field: 'weather', type: 'nominal' },
      },
    },
    'month',
  )

  const tooltip = await hoverMark(page, 'svg[data-x-field="month"] rect.main-bar[data-series="rain"]')
  await expect(tooltip).toContainText('month')
  await expect(tooltip).toContainText('11')
  await expect(tooltip).toContainText('count')
  await expect(tooltip).toContainText('25')
  await expect(tooltip).toContainText('weather')
  await expect(tooltip).toContainText('rain')
  await expect(tooltip.locator('.chart-hover-tooltip__row')).toHaveCount(3)
})

test('tooltip: grouped bar는 group row를 포함한다', async ({ page }) => {
  await renderSpec(
    page,
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { month: 'Jan', weather: 'rain', count: 12 },
          { month: 'Jan', weather: 'sun', count: 20 },
          { month: 'Feb', weather: 'rain', count: 8 },
          { month: 'Feb', weather: 'sun', count: 18 },
        ],
      },
      mark: 'bar',
      encoding: {
        x: { field: 'month', type: 'nominal' },
        xOffset: { field: 'weather', type: 'nominal' },
        y: { field: 'count', type: 'quantitative' },
        color: { field: 'weather', type: 'nominal' },
      },
    },
    'month',
  )

  const tooltip = await hoverMark(page, 'svg[data-x-field="month"] rect.main-bar[data-series="rain"]')
  await expect(tooltip).toContainText('month')
  await expect(tooltip).toContainText('Jan')
  await expect(tooltip).toContainText('count')
  await expect(tooltip).toContainText('12')
  await expect(tooltip).toContainText('weather')
  await expect(tooltip).toContainText('rain')
  await expect(tooltip.locator('.chart-hover-tooltip__row')).toHaveCount(3)
})

test('tooltip: simple line은 point hover 시 x/y만 보여준다', async ({ page }) => {
  await renderSpec(
    page,
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: [{ year: '2020', value: 10 }, { year: '2021', value: 14 }] },
      mark: { type: 'line', point: true },
      encoding: {
        x: { field: 'year', type: 'ordinal' },
        y: { field: 'value', type: 'quantitative' },
      },
    },
    'year',
  )

  const tooltip = await hoverMark(page, 'svg[data-x-field="year"] circle[data-x-value][data-y-value]')
  await expect(tooltip).toContainText('year')
  await expect(tooltip).toContainText('2020')
  await expect(tooltip).toContainText('value')
  await expect(tooltip).toContainText('10')
  await expect(tooltip.locator('.chart-hover-tooltip__row')).toHaveCount(2)
})

test('tooltip: multiple line은 point hover 시 x/y/group을 모두 보여준다', async ({ page }) => {
  await renderSpec(
    page,
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { quarter: 'Q1', value: 3, series: 'Series A' },
          { quarter: 'Q2', value: 5, series: 'Series A' },
          { quarter: 'Q1', value: 2, series: 'Series B' },
          { quarter: 'Q2', value: 4, series: 'Series B' },
        ],
      },
      mark: { type: 'line', point: true },
      encoding: {
        x: { field: 'quarter', type: 'ordinal' },
        y: { field: 'value', type: 'quantitative' },
        color: { field: 'series', type: 'nominal' },
      },
    },
    'quarter',
  )

  const tooltip = await hoverMark(page, 'svg[data-x-field="quarter"] circle[data-group-value="Series A"]')
  await expect(tooltip).toContainText('quarter')
  await expect(tooltip).toContainText('Q1')
  await expect(tooltip).toContainText('value')
  await expect(tooltip).toContainText('3')
  await expect(tooltip).toContainText('series')
  await expect(tooltip).toContainText('Series A')
  await expect(tooltip.locator('.chart-hover-tooltip__row')).toHaveCount(3)
})
