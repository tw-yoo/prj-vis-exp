import { expect, test, type Page } from '@playwright/test'

const EXPECTED_RESPONSE_ORDER = [
  'Strongly in favour',
  'Somewhat in favour',
  'Neither in favour nor against',
  'Somewhat against',
  'Strongly against',
]

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
        const field = svg.getAttribute('data-x-field')
        if (field !== targetXField) return false
      }
      return svg.querySelectorAll('rect.main-bar, .panel-title, .x-axis .tick text').length > 0
    })
  }, xField ?? null)
}

async function collectXTicks(page: Page, xField?: string) {
  return page.evaluate((targetXField) => {
    const resolvePrimarySvg = (host: Element | null) => {
      const svgs = host ? Array.from(host.querySelectorAll<SVGSVGElement>('svg')) : []
      const filtered =
        typeof targetXField === 'string' && targetXField.length > 0
          ? svgs.filter((svg) => svg.getAttribute('data-x-field') === targetXField)
          : svgs.filter((svg) => svg.querySelector('.panel-title'))
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

async function collectFacetColumnHeaders(page: Page, xField?: string) {
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

    const headers = Array.from(svg.querySelectorAll<SVGTextElement>('.panel-title'))
      .map((node) => readSvgText(node))
      .filter((value) => value.length > 0)

    const deduped: string[] = []
    headers.forEach((value) => {
      if (!deduped.includes(value)) deduped.push(value)
    })
    return deduped
  }, xField ?? null)
}

test('워크벤치: grouped bar(ordinal/nominal, sort 미지정)는 CSV 입력 순서로 x축이 그려진다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E grouped bar x order fixture',
    data: { url: 'data/test/data/bar_x_order_grouped.csv' },
    mark: 'bar',
    encoding: {
      x: { field: 'ResponseCategory', type: 'nominal' },
      xOffset: { field: 'Region', type: 'nominal' },
      y: { field: 'SharePercentage', type: 'quantitative' },
      color: { field: 'Region', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'ResponseCategory')
  const ticks = await collectXTicks(page, 'ResponseCategory')
  expect(ticks).toEqual(EXPECTED_RESPONSE_ORDER)
})

test('워크벤치: facet column grouped bar(sort 미지정)는 CSV 입력 순서로 panel 좌→우가 그려진다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E grouped bar facet column order fixture',
    data: { url: 'data/test/data/bar_x_order_grouped.csv' },
    mark: 'bar',
    encoding: {
      column: { field: 'ResponseCategory', type: 'nominal', header: { title: 'ResponseCategory' } },
      x: { field: 'Region', type: 'nominal' },
      y: { field: 'SharePercentage', type: 'quantitative' },
      color: { field: 'Region', type: 'nominal' },
    },
  }

  await renderSpec(page, spec)
  const headers = await collectFacetColumnHeaders(page)
  expect(headers).toEqual(EXPECTED_RESPONSE_ORDER)
})

test('워크벤치: facet column explicit sort(descending)는 보존되고 자동 sort:null 주입이 덮어쓰지 않는다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E grouped bar facet explicit descending sort fixture',
    data: { url: 'data/test/data/bar_x_order_grouped.csv' },
    mark: 'bar',
    encoding: {
      column: { field: 'ResponseCategory', type: 'nominal', sort: 'descending', header: { title: 'ResponseCategory' } },
      x: { field: 'Region', type: 'nominal' },
      y: { field: 'SharePercentage', type: 'quantitative' },
      color: { field: 'Region', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'Region')
  const headers = await collectFacetColumnHeaders(page, 'Region')
  const expectedDescending = EXPECTED_RESPONSE_ORDER.slice().sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }),
  )
  expect(headers).toEqual(expectedDescending)
})

test('워크벤치: top-level facet.column(sort 미지정)도 CSV 입력 순서를 유지한다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E top-level facet column order fixture',
    data: { url: 'data/test/data/bar_x_order_grouped.csv' },
    facet: {
      column: { field: 'ResponseCategory', type: 'nominal', header: { title: 'ResponseCategory' } },
    },
    spec: {
      mark: 'bar',
      encoding: {
        x: { field: 'Region', type: 'nominal' },
        y: { field: 'SharePercentage', type: 'quantitative' },
        color: { field: 'Region', type: 'nominal' },
      },
    },
  }

  await renderSpec(page, spec, 'Region')
  const headers = await collectFacetColumnHeaders(page, 'Region')
  expect(headers).toEqual(EXPECTED_RESPONSE_ORDER)
})

test('워크벤치: grouped bar explicit x.sort(descending)는 보존되고 자동 sort:null 주입이 덮어쓰지 않는다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E grouped bar explicit descending sort fixture',
    data: { url: 'data/test/data/bar_x_order_grouped.csv' },
    mark: 'bar',
    encoding: {
      x: { field: 'ResponseCategory', type: 'nominal', sort: 'descending' },
      xOffset: { field: 'Region', type: 'nominal' },
      y: { field: 'SharePercentage', type: 'quantitative' },
      color: { field: 'Region', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'ResponseCategory')
  const ticks = await collectXTicks(page, 'ResponseCategory')
  const expectedDescending = EXPECTED_RESPONSE_ORDER.slice().sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }),
  )
  expect(ticks).toEqual(expectedDescending)
})

test('워크벤치: simple/stacked bar (sort 미지정) 입력 순서 동작은 유지된다', async ({ page }) => {
  const simpleSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E simple bar no sort order fixture',
    data: {
      values: [
        { category: 'B', value: 2 },
        { category: 'A', value: 1 },
        { category: 'C', value: 3 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'category', type: 'nominal' },
      y: { field: 'value', type: 'quantitative' },
    },
  }

  await renderSpec(page, simpleSpec, 'category')
  const simpleTicks = await collectXTicks(page, 'category')
  expect(simpleTicks).toEqual(['B', 'A', 'C'])

  const stackedSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E stacked bar no sort order fixture',
    data: {
      values: [
        { month: 'Mar', weather: 'sun', count: 12 },
        { month: 'Mar', weather: 'rain', count: 3 },
        { month: 'Jan', weather: 'sun', count: 10 },
        { month: 'Jan', weather: 'rain', count: 4 },
        { month: 'Feb', weather: 'sun', count: 8 },
        { month: 'Feb', weather: 'rain', count: 6 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'month', type: 'nominal' },
      y: { field: 'count', type: 'quantitative' },
      color: { field: 'weather', type: 'nominal' },
    },
  }

  await renderSpec(page, stackedSpec, 'month')
  const stackedTicks = await collectXTicks(page, 'month')
  expect(stackedTicks).toEqual(['Mar', 'Jan', 'Feb'])
})
