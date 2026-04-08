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

async function readAxisGapMetrics(page: Page, xField: string) {
  return page.evaluate((targetXField) => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>(`svg[data-x-field="${targetXField}"]`)
    if (!svg) return null
    const svgRect = svg.getBoundingClientRect()
    const xAxisLabel = svg.querySelector<SVGTextElement>('.x-axis-label')
    const yAxisLabel = svg.querySelector<SVGTextElement>('.y-axis-label')
    const xAxes = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis'))
    const yAxes = Array.from(svg.querySelectorAll<SVGGElement>('.y-axis'))
    if (!xAxisLabel || !yAxisLabel || xAxes.length === 0 || yAxes.length === 0) return null
    const xRect = xAxisLabel.getBoundingClientRect()
    const yRect = yAxisLabel.getBoundingClientRect()
    const xAxisBottom = Math.max(...xAxes.map((axis) => axis.getBoundingClientRect().bottom))
    const yAxisLeft = Math.min(...yAxes.map((axis) => axis.getBoundingClientRect().left))
    return {
      xGap: xRect.top - xAxisBottom,
      yGap: yAxisLeft - yRect.right,
      xInside:
        xRect.left >= svgRect.left - 1 &&
        xRect.right <= svgRect.right + 1 &&
        xRect.top >= svgRect.top - 1 &&
        xRect.bottom <= svgRect.bottom + 1,
      yInside:
        yRect.left >= svgRect.left - 1 &&
        yRect.right <= svgRect.right + 1 &&
        yRect.top >= svgRect.top - 1 &&
        yRect.bottom <= svgRect.bottom + 1,
    }
  }, xField)
}

test('레이아웃: simple bar는 축 제목과 tick이 겹치지 않는다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { category: 'Strongly in favour', value: 24 },
        { category: 'Neither in favour nor against', value: 17 },
        { category: 'Strongly against', value: 8 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'category', type: 'nominal' },
      y: { field: 'value', type: 'quantitative' },
    },
  }

  await renderSpec(page, spec, 'category')
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="category"]')
    const xAxisLabel = svg?.querySelector<SVGTextElement>('.x-axis-label')
    const yAxisLabel = svg?.querySelector<SVGTextElement>('.y-axis-label')
    const xAxis = svg?.querySelector<SVGGElement>('.x-axis')
    const yAxis = svg?.querySelector<SVGGElement>('.y-axis')
    if (!svg || !xAxisLabel || !yAxisLabel || !xAxis || !yAxis) return null
    const xTitleRect = xAxisLabel.getBoundingClientRect()
    const yTitleRect = yAxisLabel.getBoundingClientRect()
    const xAxisRect = xAxis.getBoundingClientRect()
    const yAxisRect = yAxis.getBoundingClientRect()
    return {
      xGap: xTitleRect.top - xAxisRect.bottom,
      yGap: yAxisRect.left - yTitleRect.right,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.xGap).toBeGreaterThanOrEqual(8)
  expect(metrics!.yGap).toBeGreaterThanOrEqual(8)
})

test('레이아웃: simple bar의 x축 tick은 bar 중심과 정렬되고 짧은 label은 수평 유지한다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { country: 'USA', rating: 53 },
        { country: 'JPN', rating: 42 },
        { country: 'FRA', rating: 56 },
        { country: 'DEU', rating: 61 },
        { country: 'GBR', rating: 75 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'country', type: 'nominal' },
      y: { field: 'rating', type: 'quantitative' },
    },
  }

  await renderSpec(page, spec, 'country')
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="country"]')
    if (!svg) return null
    const bars = Array.from(svg.querySelectorAll<SVGRectElement>('rect.main-bar'))
    const ticks = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis .tick'))
    const tickTexts = Array.from(svg.querySelectorAll<SVGTextElement>('.x-axis .tick text'))
    const parseTranslateX = (transform: string | null) => {
      const match = /translate\(([-\d.]+),([-\d.]+)\)/.exec(transform ?? '')
      return match ? Number(match[1]) : NaN
    }
    return {
      axisRotation: Number(svg.getAttribute('data-axis-rotation') ?? '0'),
      anchors: tickTexts.map((node) => node.getAttribute('text-anchor') ?? ''),
      centers: bars.map((bar, index) => {
        const tickX = parseTranslateX(ticks[index]?.getAttribute('transform') ?? null)
        const barCenter = Number(bar.getAttribute('x') ?? '0') + Number(bar.getAttribute('width') ?? '0') / 2
        return Math.abs(tickX - barCenter)
      }),
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.axisRotation).toBe(0)
  metrics!.anchors.forEach((anchor) => {
    expect(anchor).toBe('middle')
  })
  metrics!.centers.forEach((delta) => {
    expect(delta).toBeLessThan(0.5)
  })
})

test('레이아웃: grouped bar는 짧은 x축 label일 때 axis title을 축 가까이에 둔다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { year: '2019', company: 'Google', value: 12.2 },
        { year: '2019', company: 'Microsoft', value: 11.2 },
        { year: '2020', company: 'Google', value: 13.0 },
        { year: '2020', company: 'Microsoft', value: 11.5 },
        { year: '2021', company: 'Google', value: 14.3 },
        { year: '2021', company: 'Microsoft', value: 13.8 },
        { year: '2022', company: 'Google', value: 14.3 },
        { year: '2022', company: 'Microsoft', value: 13.0 },
        { year: '2023', company: 'Google', value: 17.2 },
        { year: '2023', company: 'Microsoft', value: 15.4 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'year', type: 'nominal', title: 'Year' },
      xOffset: { field: 'company', type: 'nominal' },
      y: { field: 'value', type: 'quantitative' },
      color: { field: 'company', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'year')
  const metrics = await readAxisGapMetrics(page, 'year')

  expect(metrics).not.toBeNull()
  expect(metrics!.xInside).toBe(true)
  expect(metrics!.xGap).toBeGreaterThanOrEqual(8)
  expect(metrics!.xGap).toBeLessThanOrEqual(24)
})

test('레이아웃: simple bar는 긴 category label이 있어도 모든 x tick을 유지한다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { Country: 'Japan', Damage: 359.66 },
        { Country: 'China', Damage: 110.3 },
        { Country: 'Italy', Damage: 49.28 },
        { Country: 'United States', Damage: 41.74 },
        { Country: 'Chile', Damage: 35.51 },
        { Country: 'New Zealand', Damage: 24.79 },
        { Country: 'Turkey', Damage: 24.69 },
        { Country: 'Soviet Union', Damage: 16.87 },
        { Country: 'Taiwan (China)', Damage: 15.13 },
        { Country: 'Iran Islan Rep', Damage: 11.83 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'Country', type: 'nominal' },
      y: { field: 'Damage', type: 'quantitative' },
    },
  }

  await renderSpec(page, spec, 'Country')
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="Country"]')
    if (!svg) return null
    const allTicks = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis .tick'))
    const bars = Array.from(svg.querySelectorAll<SVGRectElement>('rect.main-bar'))
    const visibleTicks = allTicks.filter((tick) => {
      const style = tick.getAttribute('style') ?? ''
      return !style.includes('display: none')
    })
    const hiddenTicks = allTicks.length - visibleTicks.length
    let totalOverlap = 0
    const visibleRects = visibleTicks
      .map((tick) => tick.querySelector<SVGTextElement>('text'))
      .filter((node): node is SVGTextElement => node instanceof SVGTextElement)
      .map((node) => node.getBoundingClientRect())
    for (let i = 0; i < visibleRects.length - 1; i += 1) {
      const current = visibleRects[i]
      const next = visibleRects[i + 1]
      const overlapX = current.right - next.left
      const overlapY = Math.min(current.bottom, next.bottom) - Math.max(current.top, next.top)
      if (overlapX > 0 && overlapY > 1) totalOverlap += overlapX
    }
    const referencePointDelta = visibleTicks.map((tick) => {
      const label = tick.querySelector<SVGTextElement>('text')
      const line = tick.querySelector<SVGLineElement>('line')
      if (!label || !line) return Number.NaN
      const referenceX = Number(label.getAttribute('data-rotation-reference-x') ?? 'NaN')
      const referenceY = Number(label.getAttribute('data-rotation-reference-y') ?? 'NaN')
      const matrix = label.getScreenCTM()
      if (!Number.isFinite(referenceX) || !Number.isFinite(referenceY) || !matrix) return Number.NaN
      const point = new DOMPoint(referenceX, referenceY).matrixTransform(matrix)
      const lineRect = line.getBoundingClientRect()
      const tickX = (lineRect.left + lineRect.right) / 2
      return Math.abs(point.x - tickX)
    })
    const barCenterDelta = visibleTicks.map((tick, index) => {
      const line = tick.querySelector<SVGLineElement>('line')
      const bar = bars[index]
      if (!line || !bar) return Number.NaN
      const lineRect = line.getBoundingClientRect()
      const tickX = (lineRect.left + lineRect.right) / 2
      const barRect = bar.getBoundingClientRect()
      const barCenter = (barRect.left + barRect.right) / 2
      return Math.abs(tickX - barCenter)
    })
    return {
      densityStep: Number(svg.getAttribute('data-tick-density-step') ?? '0'),
      axisRotation: Number(svg.getAttribute('data-axis-rotation') ?? '0'),
      visibleTickCount: visibleTicks.length,
      totalTickCount: allTicks.length,
      hiddenTicks,
      totalOverlap,
      referencePointDelta,
      barCenterDelta,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.densityStep).toBe(1)
  expect(metrics!.axisRotation).toBeGreaterThanOrEqual(0)
  expect(metrics!.totalTickCount).toBe(10)
  expect(metrics!.visibleTickCount).toBe(10)
  expect(metrics!.hiddenTicks).toBe(0)
  expect(metrics!.totalOverlap).toBeLessThanOrEqual(1)
  metrics!.referencePointDelta.forEach((delta) => {
    expect(delta).toBeLessThan(1.5)
  })
  metrics!.barCenterDelta.forEach((delta) => {
    expect(delta).toBeLessThan(0.5)
  })
})

test('레이아웃: facet grouped bar는 panel title과 gap을 안정적으로 유지한다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: { url: 'data/test/data/bar_x_order_grouped.csv' },
    mark: 'bar',
    encoding: {
      column: { field: 'ResponseCategory', type: 'nominal', header: { title: 'ResponseCategory' } },
      x: { field: 'Region', type: 'nominal' },
      y: { field: 'SharePercentage', type: 'quantitative' },
      color: { field: 'Region', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'Region')
  const panelMetrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="Region"]')
    if (!svg) return null
    const titles = Array.from(svg.querySelectorAll<SVGTextElement>('.panel-title'))
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
    const parseTranslateX = (transform: string | null) => {
      const match = /translate\(([-\d.]+),([-\d.]+)\)/.exec(transform ?? '')
      return match ? Number(match[1]) : NaN
    }
    const panels = Array.from(svg.querySelectorAll<SVGGElement>('[data-chart-panel="true"]'))
      .map((panel) => ({
        x: parseTranslateX(panel.getAttribute('transform')),
        width: Number(panel.getAttribute('data-panel-plot-w') ?? '0'),
      }))
      .filter((panel) => Number.isFinite(panel.x) && Number.isFinite(panel.width))
      .sort((a, b) => a.x - b.x)
    const gaps = panels.slice(1).map((panel, index) => panel.x - (panels[index].x + panels[index].width))
    const legendLabels = Array.from(svg.querySelectorAll<SVGTextElement>('text'))
      .filter((node) =>
        ['England & Wales', 'Scotland'].includes(
          (node.textContent ?? '').trim(),
        ),
      )
      .filter((node) => node.closest('[data-chart-panel="true"]') == null)
    const hiddenTicks = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis .tick')).filter((tick) =>
      (tick.getAttribute('style') ?? '').includes('display: none'),
    ).length
    const tickTextRects = Array.from(svg.querySelectorAll<SVGTextElement>('[data-chart-panel="true"] .x-axis .tick text')).map((node) =>
      node.getBoundingClientRect(),
    )
    let totalOverlap = 0
    for (let i = 0; i < tickTextRects.length - 1; i += 1) {
      const current = tickTextRects[i]
      const next = tickTextRects[i + 1]
      const overlapX = current.right - next.left
      const overlapY = Math.min(current.bottom, next.bottom) - Math.max(current.top, next.top)
      if (overlapX > 0 && overlapY > 1) totalOverlap += overlapX
    }
    return {
      titleCount: titles.length,
      gaps,
      axisRotation: Number(svg.getAttribute('data-axis-rotation') ?? '0'),
      legendCount: legendLabels.length,
      densityStep: Number(svg.getAttribute('data-tick-density-step') ?? '0'),
      hiddenTicks,
      totalOverlap,
    }
  })

  expect(panelMetrics).not.toBeNull()
  expect(panelMetrics!.titleCount).toBe(5)
  expect(panelMetrics!.gaps.length).toBeGreaterThan(0)
  expect(panelMetrics!.axisRotation).toBeLessThanOrEqual(90)
  expect(panelMetrics!.legendCount).toBeGreaterThanOrEqual(2)
  expect(panelMetrics!.densityStep).toBe(1)
  expect(panelMetrics!.hiddenTicks).toBe(0)
  expect(panelMetrics!.totalOverlap).toBeLessThanOrEqual(1)
  panelMetrics!.gaps.forEach((gap) => {
    expect(gap).toBeGreaterThanOrEqual(12)
  })
})

test('레이아웃: 긴 facet grouped label은 큰 axis font에서도 회전으로 겹침을 피한다', async ({ page }) => {
  const values = [2009, 2010, 2011, 2012, 2013].flatMap((year) => [
    { Year: String(year), Region: 'North America', Value: 8 + (year - 2009) * 0.5 },
    { Year: String(year), Region: 'Europe, Middle East and Africa', Value: 10 + (year - 2009) * 0.7 },
    { Year: String(year), Region: 'Asia Pacific', Value: 4 + (year - 2009) * 0.2 },
    { Year: String(year), Region: 'Latin America', Value: 1 + (year - 2009) * 0.05 },
  ])
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: { values },
    mark: 'bar',
    encoding: {
      column: { field: 'Year', type: 'ordinal' },
      x: { field: 'Region', type: 'nominal' },
      y: { field: 'Value', type: 'quantitative' },
      color: { field: 'Region', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'Region')
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="Region"]')
    if (!svg) return null
    const panels = Array.from(svg.querySelectorAll<SVGGElement>('[data-chart-panel="true"]'))
    let totalOverlap = 0
    panels.forEach((panel) => {
      const rects = Array.from(panel.querySelectorAll<SVGTextElement>('.x-axis .tick text')).map((node) =>
        node.getBoundingClientRect(),
      )
      for (let i = 0; i < rects.length - 1; i += 1) {
        const current = rects[i]
        const next = rects[i + 1]
        const overlapX = current.right - next.left
        const overlapY = Math.min(current.bottom, next.bottom) - Math.max(current.top, next.top)
        if (overlapX > 0 && overlapY > 1) totalOverlap += overlapX
      }
    })
    return {
      axisRotation: Number(svg.getAttribute('data-axis-rotation') ?? '0'),
      densityStep: Number(svg.getAttribute('data-tick-density-step') ?? '0'),
      totalOverlap,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.axisRotation).toBeLessThanOrEqual(90)
  expect(metrics!.densityStep).toBe(1)
  expect(metrics!.totalOverlap).toBeLessThanOrEqual(1)
})

test('레이아웃: stacked bar는 legend를 표시하고 plot 영역과 분리한다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { month: 1, weather: 'drizzle', count: 10 },
        { month: 1, weather: 'fog', count: 38 },
        { month: 1, weather: 'rain', count: 35 },
        { month: 1, weather: 'snow', count: 8 },
        { month: 1, weather: 'sun', count: 33 },
        { month: 2, weather: 'drizzle', count: 4 },
        { month: 2, weather: 'fog', count: 36 },
        { month: 2, weather: 'rain', count: 40 },
        { month: 2, weather: 'snow', count: 3 },
        { month: 2, weather: 'sun', count: 30 },
        { month: 3, weather: 'drizzle', count: 3 },
        { month: 3, weather: 'fog', count: 36 },
        { month: 3, weather: 'rain', count: 37 },
        { month: 3, weather: 'snow', count: 6 },
        { month: 3, weather: 'sun', count: 42 },
      ],
    },
    mark: 'bar',
    encoding: {
      x: { field: 'month', type: 'ordinal' },
      y: { field: 'count', type: 'quantitative', stack: 'zero' },
      color: { field: 'weather', type: 'nominal' },
    },
  }

  await renderSpec(page, spec, 'month')
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="month"]')
    if (!svg) return null
    const plotGroup = svg.querySelector('g')
    if (!plotGroup) return null
    const plotRect = plotGroup.getBoundingClientRect()
    const legendLabels = Array.from(svg.querySelectorAll<SVGTextElement>('text'))
      .filter((node) => ['drizzle', 'fog', 'rain', 'snow', 'sun'].includes((node.textContent ?? '').trim()))
      .filter((node) => node.getBoundingClientRect().left > plotRect.right + 8)
    const hiddenTicks = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis .tick')).filter((tick) =>
      (tick.getAttribute('style') ?? '').includes('display: none'),
    ).length
    return {
      legendCount: legendLabels.length,
      axisRotation: Number(svg.getAttribute('data-axis-rotation') ?? '0'),
      densityStep: Number(svg.getAttribute('data-tick-density-step') ?? '0'),
      hiddenTicks,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.legendCount).toBe(5)
  expect(metrics!.axisRotation).toBe(0)
  expect(metrics!.densityStep).toBe(1)
  expect(metrics!.hiddenTicks).toBe(0)
})

test('레이아웃: multiple line legend는 plot 영역을 침범하지 않는다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { quarter: 'Q1', value: 3, series: 'Series A' },
        { quarter: 'Q2', value: 5, series: 'Series A' },
        { quarter: 'Q3', value: 4, series: 'Series A' },
        { quarter: 'Q1', value: 2, series: 'Series B' },
        { quarter: 'Q2', value: 4, series: 'Series B' },
        { quarter: 'Q3', value: 6, series: 'Series B' },
      ],
    },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'quarter', type: 'ordinal' },
      y: { field: 'value', type: 'quantitative' },
      color: { field: 'series', type: 'nominal', title: 'Series' },
    },
  }

  await renderSpec(page, spec, 'quarter')
  const legendMetrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="quarter"]')
    if (!svg) return null
    const plotGroup = svg.querySelector('g')
    const legendLabels = Array.from(svg.querySelectorAll<SVGTextElement>('text'))
      .filter((node) => ['Series', 'Series A', 'Series B'].includes((node.textContent ?? '').trim()))
    if (!plotGroup || legendLabels.length === 0) return null
    const plotRect = plotGroup.getBoundingClientRect()
    const legendLeft = Math.min(...legendLabels.map((node) => node.getBoundingClientRect().left))
    return { gap: legendLeft - plotRect.right }
  })

  expect(legendMetrics).not.toBeNull()
  expect(legendMetrics!.gap).toBeGreaterThanOrEqual(8)
})

test('레이아웃: temporal simple line은 연도 축을 짧게 그리고 axis title이 잘리지 않는다', async ({ page }) => {
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {
      values: [
        { year: '1990-01-01', value: 571.7 },
        { year: '1992-01-01', value: 949.54 },
        { year: '1994-01-01', value: 1174.98 },
        { year: '1996-01-01', value: 1792.14 },
        { year: '1998-01-01', value: 2492.26 },
        { year: '2000-01-01', value: 3009.52 },
        { year: '2002-01-01', value: 3404.66 },
        { year: '2004-01-01', value: 4061.9 },
        { year: '2006-01-01', value: 5009.7 },
        { year: '2008-01-01', value: 7128.11 },
        { year: '2010-01-01', value: 6489 },
        { year: '2012-01-01', value: 7244.7 },
        { year: '2014-01-01', value: 8526.5 },
      ],
    },
    mark: { type: 'line', point: true },
    encoding: {
      x: { field: 'year', type: 'temporal' },
      y: { field: 'value', type: 'quantitative' },
    },
  }

  await renderSpec(page, spec, 'year')
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector<SVGSVGElement>('svg[data-x-field="year"]')
    if (!svg) return null
    const svgRect = svg.getBoundingClientRect()
    const ticks = Array.from(svg.querySelectorAll<SVGTextElement>('.x-axis .tick text'))
      .map((node) => {
        const tspans = Array.from(node.querySelectorAll('tspan'))
        const text = tspans.length > 0 ? tspans.map((tspan) => (tspan.textContent ?? '').trim()).join(' ') : (node.textContent ?? '').trim()
        return text.replace(/\s+/g, ' ').trim()
      })
      .filter((value) => value.length > 0)
    const xAxisLabel = svg.querySelector<SVGTextElement>('.x-axis-label')
    const yAxisLabel = svg.querySelector<SVGTextElement>('.y-axis-label')
    const xAxis = svg.querySelector<SVGGElement>('.x-axis')
    const yAxis = svg.querySelector<SVGGElement>('.y-axis')
    if (!xAxisLabel || !yAxisLabel || !xAxis || !yAxis) return null
    const xRect = xAxisLabel.getBoundingClientRect()
    const yRect = yAxisLabel.getBoundingClientRect()
    const xAxisRect = xAxis.getBoundingClientRect()
    const yAxisRect = yAxis.getBoundingClientRect()
    return {
      ticks,
      xInside:
        xRect.left >= svgRect.left - 1 &&
        xRect.right <= svgRect.right + 1 &&
        xRect.top >= svgRect.top - 1 &&
        xRect.bottom <= svgRect.bottom + 1,
      yInside:
        yRect.left >= svgRect.left - 1 &&
        yRect.right <= svgRect.right + 1 &&
        yRect.top >= svgRect.top - 1 &&
        yRect.bottom <= svgRect.bottom + 1,
      xGap: xRect.top - xAxisRect.bottom,
      yGap: yAxisRect.left - yRect.right,
    }
  })

  expect(metrics).not.toBeNull()
  expect(metrics!.ticks.length).toBeGreaterThan(0)
  metrics!.ticks.forEach((tick) => {
    expect(tick).toMatch(/^\d{4}$/)
  })
  expect(metrics!.xInside).toBe(true)
  expect(metrics!.yInside).toBe(true)
  expect(metrics!.xGap).toBeGreaterThanOrEqual(8)
  expect(metrics!.yGap).toBeGreaterThanOrEqual(8)
})

test('레이아웃: 5개 지원 차트 모두 긴 axis title에서도 축과 겹치지 않는다', async ({ page }) => {
  const cases: Array<{ name: string; xField: string; spec: Record<string, unknown> }> = [
    {
      name: 'simple bar',
      xField: 'category',
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { category: 'A', value: 24 },
            { category: 'B', value: 17 },
            { category: 'C', value: 8 },
          ],
        },
        mark: 'bar',
        encoding: {
          x: { field: 'category', type: 'nominal', title: 'Long category axis title for layout validation' },
          y: { field: 'value', type: 'quantitative', title: 'Long quantitative axis title for layout validation' },
        },
      },
    },
    {
      name: 'stacked bar',
      xField: 'year',
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { year: '2021', group: 'A', value: 12 },
            { year: '2021', group: 'B', value: 9 },
            { year: '2022', group: 'A', value: 15 },
            { year: '2022', group: 'B', value: 11 },
            { year: '2023', group: 'A', value: 13 },
            { year: '2023', group: 'B', value: 10 },
          ],
        },
        mark: 'bar',
        encoding: {
          x: { field: 'year', type: 'nominal', title: 'Long stacked bar category axis title for layout validation' },
          y: { field: 'value', type: 'quantitative', title: 'Long stacked bar measure axis title for layout validation' },
          color: { field: 'group', type: 'nominal' },
        },
      },
    },
    {
      name: 'grouped bar',
      xField: 'region',
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { region: 'East', group: 'A', value: 12 },
            { region: 'East', group: 'B', value: 9 },
            { region: 'West', group: 'A', value: 15 },
            { region: 'West', group: 'B', value: 11 },
            { region: 'South', group: 'A', value: 13 },
            { region: 'South', group: 'B', value: 10 },
          ],
        },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal', title: 'Long grouped bar category axis title for layout validation' },
          xOffset: { field: 'group', type: 'nominal' },
          y: { field: 'value', type: 'quantitative', title: 'Long grouped bar measure axis title for layout validation' },
          color: { field: 'group', type: 'nominal' },
        },
      },
    },
    {
      name: 'simple line',
      xField: 'year',
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { year: '1990-01-01', value: 571.7 },
            { year: '1992-01-01', value: 949.54 },
            { year: '1994-01-01', value: 1174.98 },
            { year: '1996-01-01', value: 1792.14 },
            { year: '1998-01-01', value: 2492.26 },
            { year: '2000-01-01', value: 3009.52 },
          ],
        },
        mark: { type: 'line', point: true },
        encoding: {
          x: { field: 'year', type: 'temporal', title: 'Long temporal axis title for layout validation' },
          y: { field: 'value', type: 'quantitative', title: 'Long line measure axis title for layout validation' },
        },
      },
    },
    {
      name: 'multiple line',
      xField: 'quarter',
      spec: {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
          values: [
            { quarter: 'Q1', value: 3, series: 'Series A' },
            { quarter: 'Q2', value: 5, series: 'Series A' },
            { quarter: 'Q3', value: 4, series: 'Series A' },
            { quarter: 'Q1', value: 2, series: 'Series B' },
            { quarter: 'Q2', value: 4, series: 'Series B' },
            { quarter: 'Q3', value: 6, series: 'Series B' },
          ],
        },
        mark: { type: 'line', point: true },
        encoding: {
          x: { field: 'quarter', type: 'ordinal', title: 'Long ordinal axis title for layout validation' },
          y: { field: 'value', type: 'quantitative', title: 'Long multi-line measure axis title for layout validation' },
          color: { field: 'series', type: 'nominal', title: 'Series' },
        },
      },
    },
  ]

  for (const chartCase of cases) {
    await test.step(chartCase.name, async () => {
      await renderSpec(page, chartCase.spec, chartCase.xField)
      const metrics = await readAxisGapMetrics(page, chartCase.xField)
      expect(metrics).not.toBeNull()
      expect(metrics!.xInside).toBe(true)
      expect(metrics!.yInside).toBe(true)
      expect(metrics!.xGap).toBeGreaterThanOrEqual(8)
      expect(metrics!.yGap).toBeGreaterThanOrEqual(8)
    })
  }
})
