import { expect, test, type Page } from '@playwright/test'

const EXPECTED_QUARTER_ORDER = ['Q1 2019', 'Q2 2019', 'Q3 2019', 'Q4 2019', 'Q1 2020', 'Q2 2020', 'Q3 2020', 'Q4 2020']

async function renderSpec(page: Page, spec: Record<string, unknown>, xField?: string) {
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
  await page.waitForFunction((targetXField) => {
    const host = document.querySelector('[data-testid="chart-host"]')
    if (!host) return false
    const svgs = Array.from(host.querySelectorAll<SVGSVGElement>('svg'))
    return svgs.some((svg) => {
      if (typeof targetXField === 'string' && targetXField.length > 0) {
        const field = svg.getAttribute('data-x-field')
        if (field !== targetXField) return false
      }
      return Number(svg.getAttribute('data-render-epoch') ?? '0') > 0
    })
  }, xField ?? null)
}

async function collectXTicks(page: Page, xField?: string) {
  return page.evaluate((targetXField) => {
    const resolvePrimarySvg = (host: Element | null) => {
      const svgs = host ? Array.from(host.querySelectorAll<SVGSVGElement>('svg')) : []
      const filtered = typeof targetXField === 'string' && targetXField.length > 0
        ? svgs.filter((svg) => svg.getAttribute('data-x-field') === targetXField)
        : svgs
      const targetSvgs = filtered.length > 0 ? filtered : svgs
      return targetSvgs.reduce<SVGSVGElement | null>((best, svg) => {
        const epoch = Number(svg.getAttribute('data-render-epoch') ?? '0')
        const bestEpoch = Number(best?.getAttribute('data-render-epoch') ?? '0')
        return epoch >= bestEpoch ? svg : best
      }, null)
    }
    const readSvgText = (node: SVGTextElement) => {
      const tspans = Array.from(node.querySelectorAll('tspan'))
      if (tspans.length > 0) {
        return tspans
          .map((tspan) => (tspan.textContent ?? '').trim())
          .filter((value) => value.length > 0)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = resolvePrimarySvg(host)
    if (!svg) return []

    return Array.from(svg.querySelectorAll<SVGTextElement>('.x-axis .tick text'))
      .map((node) => readSvgText(node))
      .filter((value) => value.length > 0)
  }, xField ?? null)
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

  await renderSpec(page, spec, 'Quarter')
  const ticks = await collectXTicks(page, 'Quarter')
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

  await renderSpec(page, spec, 'Quarter')
  const ticks = await collectXTicks(page, 'Quarter')
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

  await renderSpec(page, spec, 'Quarter')
  const ticks = await collectXTicks(page, 'Quarter')
  const expectedDescending = EXPECTED_QUARTER_ORDER.slice().sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }),
  )
  expect(ticks).toEqual(expectedDescending)
})
