import { expect, test } from '@playwright/test'

test('워크벤치: layered simple line spec(encoding at layer-level)도 오류 알림 없이 렌더링된다', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E layered simple line no alert',
    data: {
      values: [
        { Year: '2016', Audience_Millions: 10 },
        { Year: '2017', Audience_Millions: 12 },
        { Year: '2018', Audience_Millions: 15 },
      ],
    },
    width: 600,
    height: 320,
    layer: [
      {
        mark: { type: 'line', point: false, tooltip: true },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Audience_Millions', type: 'quantitative' },
        },
      },
      {
        mark: { type: 'point', filled: true, size: 80, tooltip: true },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Audience_Millions', type: 'quantitative' },
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

