import { expect, test, type Page } from '@playwright/test'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

async function ensureSpecInputVisible(page: Page) {
  const input = page.getByTestId('vl-spec-input')
  if ((await input.count()) === 0) {
    await page.getByRole('button', { name: 'Expand' }).first().click()
  }
  await expect(input).toBeVisible({ timeout: 60_000 })
}

async function renderSpec(page: Page, spec: unknown) {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(JSON.stringify(spec, null, 2))
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

async function loadOps(page: Page, opsSpec: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify(opsSpec, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
}

async function clickStep(page: Page, label: 'Start' | 'Next') {
  const button = page.getByRole('button', { name: label })
  await expect(button).toBeVisible({ timeout: 30_000 })
  await expect(button).toBeEnabled({ timeout: 30_000 })
  await button.click()
}

test('simple bar spec keeps both findExtremum labels near their bars', async ({ page }) => {
  await renderSpec(page, {
    mark: 'bar',
    data: {
      values: [
        { Year: '2010', 'Number of victims': 8 },
        { Year: '2011', 'Number of victims': 12 },
        { Year: '2012', 'Number of victims': 7 },
        { Year: '2013', 'Number of victims': 15 },
        { Year: '2014', 'Number of victims': 20 },
        { Year: '2015', 'Number of victims': 10 },
        { Year: '2016', 'Number of victims': 9 },
        { Year: '2017', 'Number of victims': 13 },
        { Year: '2018', 'Number of victims': 3 },
        { Year: '2019', 'Number of victims': 11 },
      ],
    },
    encoding: {
      x: { field: 'Year', type: 'nominal', sort: null },
      y: { field: 'Number of victims', type: 'quantitative' },
    },
  })

  await loadOps(page, {
    ops: [
      {
        op: 'filter',
        id: 'n1',
        meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        field: 'Year',
        operator: 'between',
        value: ['2010', '2019'],
        xKindHint: 'temporal',
      },
    ],
    ops2: [
      {
        op: 'findExtremum',
        id: 'n2',
        meta: { nodeId: 'n2', inputs: ['n1'], sentenceIndex: 2 },
        field: 'Number of victims',
        which: 'max',
      },
      {
        op: 'findExtremum',
        id: 'n3',
        meta: { nodeId: 'n3', inputs: ['n1'], sentenceIndex: 2 },
        field: 'Number of victims',
        which: 'min',
      },
    ],
    ops3: [
      {
        op: 'diff',
        id: 'n4',
        meta: { nodeId: 'n4', inputs: ['n2', 'n3'], sentenceIndex: 3 },
        field: 'Number of victims',
        targetA: 'ref:n2',
        targetB: 'ref:n3',
        signed: true,
      },
    ],
  })

  await clickStep(page, 'Start')
  await expect(page.locator('.chart-sentence-summary-overlay')).toHaveCount(1)
  await clickStep(page, 'Next')

  await expect(page.locator('svg text.operation-next-extremum')).toHaveCount(2)
  const placement = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll<SVGTextElement>('svg text.operation-next-extremum')).map((node) => {
      const box = node.getBBox()
      return {
        text: (node.textContent ?? '').trim(),
        cx: box.x + box.width / 2,
        y: box.y,
      }
    })
    const bars = Array.from(document.querySelectorAll<SVGRectElement>('svg rect.main-bar')).map((node) => ({
      target: node.getAttribute('data-target'),
      cx: Number(node.getAttribute('x')) + Number(node.getAttribute('width')) / 2 + Number(document.querySelector('svg')?.getAttribute('data-m-left') ?? 0),
      top: Number(node.getAttribute('y')) + Number(document.querySelector('svg')?.getAttribute('data-m-top') ?? 0),
      width: Number(node.getAttribute('width')),
    }))
    return labels.map((label) => {
      const bar = bars.find((entry) => (label.text === '20' ? entry.target === '2014' : entry.target === '2018'))
      return {
        ...label,
        barCx: bar?.cx ?? null,
        barTop: bar?.top ?? null,
        barWidth: bar?.width ?? null,
      }
    })
  })

  expect(placement.map((entry) => entry.text).sort()).toEqual(['20', '3'])
  for (const entry of placement) {
    expect(entry.barCx).not.toBeNull()
    expect(Math.abs(entry.cx - Number(entry.barCx))).toBeLessThan(Number(entry.barWidth) / 2 + 48)
    expect(entry.y).toBeLessThan(Number(entry.barTop) + 18)
  }
})

test('stacked bar group averages execute as split simple bars and bridge the final diff', async ({ page }) => {
  await renderSpec(page, {
    mark: 'bar',
    data: {
      values: [
        { Season: '2015/16', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1090 },
        { Season: '2015/16', Revenue_Type: 'Matchday', Revenue_Million_Euros: 622 },
        { Season: '2015/16', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 1927 },
        { Season: '2016/17', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1168 },
        { Season: '2016/17', Revenue_Type: 'Matchday', Revenue_Million_Euros: 620 },
        { Season: '2016/17', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 2768 },
        { Season: '2017/18', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1305 },
        { Season: '2017/18', Revenue_Type: 'Matchday', Revenue_Million_Euros: 670 },
        { Season: '2017/18', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 2844 },
        { Season: '2018/19', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1592 },
        { Season: '2018/19', Revenue_Type: 'Matchday', Revenue_Million_Euros: 763 },
        { Season: '2018/19', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 3406 },
        { Season: '2019/20', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1731 },
        { Season: '2019/20', Revenue_Type: 'Matchday', Revenue_Million_Euros: 614 },
        { Season: '2019/20', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 2457 },
        { Season: '2020/21', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1508 },
        { Season: '2020/21', Revenue_Type: 'Matchday', Revenue_Million_Euros: 391 },
        { Season: '2020/21', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 4133 },
      ],
    },
    encoding: {
      x: { field: 'Season', type: 'nominal', sort: null },
      y: { field: 'Revenue_Million_Euros', type: 'quantitative' },
      color: { field: 'Revenue_Type', type: 'nominal' },
    },
  })

  await loadOps(page, {
    ops: [
      {
        op: 'average',
        id: 'n1',
        meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        field: 'Revenue_Million_Euros',
        group: 'Commercial',
      },
      {
        op: 'average',
        id: 'n2',
        meta: { nodeId: 'n2', inputs: [], sentenceIndex: 1 },
        field: 'Revenue_Million_Euros',
        group: 'Matchday',
      },
    ],
    ops3: [
      {
        op: 'diff',
        id: 'n3',
        meta: { nodeId: 'n3', inputs: ['n1', 'n2'], sentenceIndex: 3 },
        field: 'Revenue_Million_Euros',
        targetA: 'ref:n1',
        targetB: 'ref:n2',
        signed: true,
      },
    ],
  })

  await clickStep(page, 'Start')
  await expect.poll(() =>
    page.evaluate((hostSelector) => {
      const host = document.querySelector(hostSelector)
      if (!host) return 0
      return Array.from(host.querySelectorAll<SVGSVGElement>('svg')).filter((svg) => {
        const style = window.getComputedStyle(svg)
        const box = svg.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      }).length
    }, chartHost),
  ).toBeGreaterThanOrEqual(2)
  await expect(page.locator(`${chartHost} [data-surface-id="n1_surface"] svg`)).toBeVisible()
  await expect(page.locator(`${chartHost} [data-surface-id="n2_surface"] svg`)).toBeVisible()
  await expect(page.locator(`${chartHost} [data-surface-id="n1_surface"] svg rect.main-bar[data-series]`)).toHaveCount(0)
  await expect(page.locator(`${chartHost} [data-surface-id="n2_surface"] svg rect.main-bar[data-series]`)).toHaveCount(0)
  await expect(page.locator(`${chartHost} [data-surface-id="n1_surface"] svg line[data-operation-result-ref="n1"]`)).toHaveCount(1)
  await expect(page.locator(`${chartHost} [data-surface-id="n2_surface"] svg line[data-operation-result-ref="n2"]`)).toHaveCount(1)

  await clickStep(page, 'Next')
  await expect.poll(() =>
    page.evaluate((hostSelector) => {
      const host = document.querySelector(hostSelector)
      if (!host) return 0
      return Array.from(host.querySelectorAll<SVGSVGElement>('svg')).filter((svg) => {
        const style = window.getComputedStyle(svg)
        const box = svg.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      }).length
    }, chartHost),
  ).toBeGreaterThanOrEqual(2)
  await expect(page.locator(`${chartHost} svg.operation-next-split-diff-overlay`)).toHaveCount(1)
  await expect(page.locator(`${chartHost} .operation-next-split-diff.difference-label`)).toContainText('Difference:')
})

test('multiple line pairDiff extremum strengthens the selected arrow and label', async ({ page }) => {
  await renderSpec(page, {
    mark: 'line',
    data: {
      values: [
        { Year: '2020', Metric: 'Price', 'Has a great impact': 10 },
        { Year: '2020', Metric: 'Convenience', 'Has a great impact': 6 },
        { Year: '2021', Metric: 'Price', 'Has a great impact': 8 },
        { Year: '2021', Metric: 'Convenience', 'Has a great impact': 7 },
        { Year: '2022', Metric: 'Price', 'Has a great impact': 15 },
        { Year: '2022', Metric: 'Convenience', 'Has a great impact': 9 },
      ],
    },
    encoding: {
      x: { field: 'Year', type: 'nominal', sort: null },
      y: { field: 'Has a great impact', type: 'quantitative' },
      color: { field: 'Metric', type: 'nominal' },
    },
  })

  await loadOps(page, {
    ops: [
      {
        op: 'pairDiff',
        id: 'n1',
        meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        by: 'Year',
        seriesField: 'Metric',
        field: 'Has a great impact',
        groupA: 'Price',
        groupB: 'Convenience',
        signed: false,
        absolute: true,
      },
    ],
    ops3: [
      {
        op: 'findExtremum',
        id: 'n2',
        meta: { nodeId: 'n2', inputs: ['n1'], sentenceIndex: 3 },
        field: 'Has a great impact',
        which: 'min',
      },
    ],
  })

  await clickStep(page, 'Start')
  await expect(page.locator('svg text.operation-next-multiple-line-pair-diff[data-target="2021"]')).toBeVisible()

  await clickStep(page, 'Next')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const line = document.querySelector<SVGLineElement>('svg line.operation-next-multiple-line-pair-diff[data-target="2021"]:not(.arrow-head)')
        const label = document.querySelector<SVGTextElement>('svg text.operation-next-multiple-line-pair-diff[data-target="2021"]')
        return {
          lineWidth: Number(line?.getAttribute('stroke-width') ?? line?.getAttribute('strokeWidth') ?? 0),
          labelWeight: Number(label?.getAttribute('font-weight') ?? 0),
        }
      }),
    )
    .toEqual({ lineWidth: 4, labelWeight: 800 })

  const strengthened = await page.evaluate(() => {
    const line = document.querySelector<SVGLineElement>('svg line.operation-next-multiple-line-pair-diff[data-target="2021"]:not(.arrow-head)')
    const label = document.querySelector<SVGTextElement>('svg text.operation-next-multiple-line-pair-diff[data-target="2021"]')
    const extremum = document.querySelector<SVGTextElement>('svg text.derived-extremum-label[data-target="2021"]')
    return {
      lineStroke: line?.getAttribute('stroke') ?? '',
      lineWidth: Number(line?.getAttribute('stroke-width') ?? line?.getAttribute('strokeWidth') ?? 0),
      labelFill: label?.getAttribute('fill') ?? '',
      labelWeight: String(label?.getAttribute('font-weight') ?? ''),
      extremumText: extremum?.textContent ?? '',
      extremumSize: Number(extremum?.getAttribute('font-size') ?? 0),
    }
  })

  expect(['#dc2626', 'rgb(220, 38, 38)']).toContain(strengthened.lineStroke.toLowerCase())
  expect(strengthened.lineWidth).toBeGreaterThanOrEqual(4)
  expect(['#dc2626', 'rgb(220, 38, 38)']).toContain(strengthened.labelFill.toLowerCase())
  expect(Number(strengthened.labelWeight)).toBeGreaterThanOrEqual(800)
  expect(strengthened.extremumText).toContain('Min diff:')
  expect(strengthened.extremumSize).toBeGreaterThan(12)
})
