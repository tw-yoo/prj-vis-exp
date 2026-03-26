import { expect, test, type Page } from '@playwright/test'

const EXPECTED_QUARTER_ORDER = ['Q1 2019', 'Q2 2019', 'Q3 2019', 'Q4 2019', 'Q1 2020', 'Q2 2020', 'Q3 2020', 'Q4 2020']

async function renderSpec(page: Page, spec: Record<string, unknown>) {
  await page.goto('/')
  const specInput = page.getByTestId('vl-spec-input')
  const inputVisible = await specInput.isVisible().catch(() => false)
  if (!inputVisible) {
    const expandButton = page.getByRole('button', { name: 'Expand' }).first()
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click()
    }
  }
  await page.getByTestId('vl-spec-input').fill(JSON.stringify(spec, null, 2))
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
}

async function collectXTicks(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector('svg')
    if (!svg) return []

    const fromCustomAxis = Array.from(svg.querySelectorAll<SVGTextElement>('.x-axis .tick text'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    if (fromCustomAxis.length > 0) return fromCustomAxis

    const axisGroups = Array.from(svg.querySelectorAll<SVGGElement>('.role-axis')).filter((group) => {
      const label = (group.getAttribute('aria-label') ?? '').toLowerCase()
      return label.includes('x-axis') || label.includes('x axis')
    })
    const out: string[] = []
    axisGroups.forEach((group) => {
      const texts = Array.from(group.querySelectorAll<SVGTextElement>('.role-axis-label text, text.role-axis-label'))
      texts.forEach((node) => {
        const value = (node.textContent ?? '').trim()
        if (!value) return
        if (!out.includes(value)) out.push(value)
      })
    })
    return out
  })
}

test('워크벤치: simple line(ordinal, sort 미지정)은 CSV 입력 순서로 x축이 그려진다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E simple line x order fixture',
    data: { url: 'data/test/data/line_x_order_simple.csv' },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'Quarter', type: 'ordinal' },
      y: { field: 'Unemployment rate (%)', type: 'quantitative' },
    },
  }

  await renderSpec(page, spec)
  const ticks = await collectXTicks(page)
  expect(ticks).toEqual(EXPECTED_QUARTER_ORDER)
})

test('워크벤치: multiple line(ordinal, sort 미지정)은 CSV 입력 순서로 x축이 그려진다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E multiple line x order fixture',
    data: { url: 'data/test/data/line_x_order_multiple.csv' },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'Quarter', type: 'ordinal' },
      y: { field: 'Value', type: 'quantitative' },
      color: { field: 'Series', type: 'nominal' },
    },
  }

  await renderSpec(page, spec)
  const ticks = await collectXTicks(page)
  expect(ticks).toEqual(EXPECTED_QUARTER_ORDER)
})

test('워크벤치: explicit x.sort(descending)는 보존되고 자동 sort:null 주입이 덮어쓰지 않는다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E line x explicit descending sort fixture',
    data: { url: 'data/test/data/line_x_order_simple.csv' },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'Quarter', type: 'ordinal', sort: 'descending' },
      y: { field: 'Unemployment rate (%)', type: 'quantitative' },
    },
  }

  await renderSpec(page, spec)
  const ticks = await collectXTicks(page)
  const expectedDescending = EXPECTED_QUARTER_ORDER.slice().sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }),
  )
  expect(ticks).toEqual(expectedDescending)
})
