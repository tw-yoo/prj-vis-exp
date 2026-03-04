import { expect, test } from '@playwright/test'

test('워크벤치: draw stacked-to-grouped op가 실제로 grouped bar로 변환한다', async ({ page }) => {
  const stackedSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E stacked-to-grouped conversion fixture',
    data: {
      values: [
        { Year: '2016', Country_Region: 'China', Revenue_Million_USD: 100 },
        { Year: '2016', Country_Region: 'Japan', Revenue_Million_USD: 30 },
        { Year: '2017', Country_Region: 'China', Revenue_Million_USD: 90 },
        { Year: '2017', Country_Region: 'Japan', Revenue_Million_USD: 40 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'Year', type: 'nominal', sort: null },
      y: { field: 'Revenue_Million_USD', type: 'quantitative' },
      color: { field: 'Country_Region', type: 'nominal' },
    },
    config: { view: { stroke: 'transparent' } },
  }

  const ops = {
    ops: [
      {
        op: 'draw',
        action: 'stacked-to-grouped',
        chartId: null,
        stackGroup: { swapAxes: null, xField: 'Year', colorField: 'Country_Region' },
      },
    ],
  }

  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(JSON.stringify(stackedSpec, null, 2))
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()

  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify(ops, null, 2))
  await page.getByRole('button', { name: 'Run Operations' }).click()
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
  await expect(page.locator('[data-testid="chart-host"] [data-target][data-series]')).toHaveCount(4)

  const lastSpecHasOffset = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const candidates: any[] = [host, ...(host ? Array.from(host.querySelectorAll('*')) : [])]
    for (const el of candidates) {
      const spec = (el as any).__lastVegaLiteSpec
      if (spec && spec.encoding) {
        return !!spec.encoding.xOffset && spec.encoding.y && spec.encoding.y.stack === null
      }
    }
    return false
  })
  expect(lastSpecHasOffset).toBe(true)

  const yearToXCount = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector('svg')
    if (!svg) return {}

    const out: Record<string, Set<string>> = {}
    const svgBox = svg.getBoundingClientRect()

    const nodes = Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-target][data-series]'))
    for (const node of nodes) {
      if (node.closest('[role="legend"]')) continue
      const target = node.getAttribute('data-target')
      const series = node.getAttribute('data-series')
      if (!target || !series) continue
      const box = node.getBoundingClientRect()
      const relLeft = Math.round((box.left - svgBox.left) * 10) / 10
      const x = String(relLeft)
      if (!out[target]) out[target] = new Set()
      out[target]!.add(x)
    }

    const simplified: Record<string, number> = {}
    Object.entries(out).forEach(([k, set]) => {
      simplified[k] = set.size
    })
    return simplified
  })

  // In a grouped bar chart with 2 series per year, we should see >1 distinct x positions per year.
  expect(yearToXCount['2016']).toBeGreaterThan(1)
  expect(yearToXCount['2017']).toBeGreaterThan(1)
})
