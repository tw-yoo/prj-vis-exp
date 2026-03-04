import { expect, test } from '@playwright/test'

test('워크벤치: 유효한 simple line spec은 Invalid JSON 알림 없이 렌더링된다', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })

  // Includes an intentionally invalid temporal value. Vega-Lite will still render the valid row,
  // and the Workbench must not misreport this as "Invalid JSON".
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E simple line valid json no alert',
    data: {
      values: [
        { date: '2020-01-01', value: 1 },
        { date: 'NOT_A_DATE', value: 2 },
      ],
    },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'date', type: 'temporal' },
      y: { field: 'value', type: 'quantitative' },
    },
    config: { view: { stroke: 'transparent' } },
  }

  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(JSON.stringify(spec, null, 2))
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()

  expect(dialogs.filter((m) => m.toLowerCase().includes('invalid json'))).toHaveLength(0)
})

