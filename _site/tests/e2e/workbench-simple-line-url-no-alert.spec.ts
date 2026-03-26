import { expect, test } from '@playwright/test'

test('워크벤치: simple line (layered + data.url) 렌더 시 불필요한 실패 알림이 뜨지 않는다', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'Simple line chart for 2jromeq5u9lloh1s.csv',
    data: { url: 'ChartQA/data/csv/line/simple/2jromeq5u9lloh1s.csv' },
    width: 600,
    height: 400,
    layer: [
      {
        mark: { type: 'line', point: false, tooltip: true },
        encoding: {
          x: { field: 'Year', type: 'ordinal', axis: { title: 'Year', labelAngle: 0 } },
          y: { field: 'Audience_Millions', type: 'quantitative', axis: { title: 'Audience_Millions' } },
        },
      },
      {
        mark: { type: 'point', filled: true, size: 80, tooltip: true },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Audience_Millions', type: 'quantitative' },
          tooltip: [
            { field: 'Year', type: 'ordinal', title: 'Year' },
            { field: 'Audience_Millions', type: 'quantitative', title: 'Audience_Millions' },
          ],
        },
      },
    ],
    config: { view: { stroke: 'transparent' }, axis: { domainWidth: 1 } },
  }

  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(JSON.stringify(spec, null, 2))
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()

  expect(dialogs.filter((m) => m.toLowerCase().includes('failed to render'))).toHaveLength(0)
  expect(dialogs.filter((m) => m.toLowerCase().includes('invalid json'))).toHaveLength(0)
})

