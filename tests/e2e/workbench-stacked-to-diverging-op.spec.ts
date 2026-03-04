import { expect, test } from '@playwright/test'

test('워크벤치: draw stacked-to-diverging op가 centered(diverging) stacked bar spec을 만든다', async ({ page }) => {
  const stackedSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E stacked-to-diverging conversion fixture',
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
        action: 'stacked-to-diverging',
        chartId: null,
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

  const lastSpec = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const candidates: any[] = [host, ...(host ? Array.from(host.querySelectorAll('*')) : [])]
    for (const el of candidates) {
      const spec = (el as any).__lastVegaLiteSpec
      if (spec && spec.encoding && spec.encoding.y) return spec
    }
    return null
  })

  expect(lastSpec).toBeTruthy()
  expect(lastSpec.encoding.y.stack).toBe('center')
  const domain = lastSpec.encoding.y.scale?.domain
  expect(Array.isArray(domain)).toBe(true)
  expect(domain).toHaveLength(2)
  expect(Number(domain[0])).toBeLessThan(0)
  expect(Number(domain[1])).toBeGreaterThan(0)
  expect(Number(domain[0])).toBeCloseTo(-Number(domain[1]))
})
