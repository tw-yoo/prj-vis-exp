import { expect, test, type Page } from '@playwright/test'
import {
  EXPERT_CALCULATE_FIELD_COLOR_SPEC,
  EXPERT_GROUPED_BAR_FILTER_HIGHLIGHT_YDOMAIN_SPEC,
  EXPERT_MULTILINE_LAYERED_FILTER_HIGHLIGHT_POINTS_SPEC,
  EXPERT_SIMPLE_BAR_PATCHED_SPEC,
  EXPERT_STACKED_BAR_FILTER_HIGHLIGHT_YMAX_SPEC,
} from './fixtures/specs'

async function renderSpec(page: Page, spec: string) {
  const logs: Array<{ type: string; text: string }> = []
  page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }))

  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  const readVisibilityMeta = async () =>
    page.evaluate(() => {
      const host = document.querySelector('[data-testid="chart-host"]') as HTMLElement | null
      if (!host) return { svgVisible: 0, canvasVisible: 0, hostRect: null, firstSvg: null, embedOptions: null }
      const visible = (el: Element) => {
        const style = window.getComputedStyle(el as HTMLElement)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        const rect = (el as HTMLElement).getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }
      const svgs = Array.from(host.querySelectorAll('svg'))
      const canvases = Array.from(host.querySelectorAll('canvas'))
      const svgVisible = svgs.filter((el) => visible(el)).length
      const canvasVisible = canvases.filter((el) => visible(el)).length
      const firstSvg = svgs[0]
      const firstSvgRect = firstSvg ? firstSvg.getBoundingClientRect() : null
      const result = (host as any).__lastVegaEmbedResult
      const view = result?.view
      const signal = (name: string) => {
        try {
          return typeof view?.signal === 'function' ? view.signal(name) : undefined
        } catch {
          return undefined
        }
      }
      return {
        svgVisible,
        canvasVisible,
        hostRect: host.getBoundingClientRect(),
        firstSvg: firstSvg
          ? {
              widthAttr: firstSvg.getAttribute('width'),
              heightAttr: firstSvg.getAttribute('height'),
              display: window.getComputedStyle(firstSvg).display,
              visibility: window.getComputedStyle(firstSvg).visibility,
              rect: firstSvgRect,
            }
          : null,
        embedOptions: (host as any).__lastVegaEmbedOptions ?? null,
        finalSpecMeta: {
          width: (host as any).__lastVegaLiteSpec?.width,
          height: (host as any).__lastVegaLiteSpec?.height,
          padding: (host as any).__lastVegaLiteSpec?.padding,
          autosize: (host as any).__lastVegaLiteSpec?.autosize,
        },
        viewSignals: {
          width: signal('width'),
          height: signal('height'),
          child_width: signal('child_width'),
          child_height: signal('child_height'),
          column_domain: signal('column_domain'),
        },
      }
    })

  let visibilityMeta = await readVisibilityMeta()
  for (let i = 0; i < 40; i += 1) {
    if (visibilityMeta.svgVisible + visibilityMeta.canvasVisible > 0) break
    await page.waitForTimeout(250)
    visibilityMeta = await readVisibilityMeta()
  }
  expect(
    visibilityMeta.svgVisible + visibilityMeta.canvasVisible,
    `Chart host stayed hidden: ${JSON.stringify(visibilityMeta, null, 2)}`,
  ).toBeGreaterThan(0)

  // Hard-fail on the common "empty/invalid data" symptom and runtime errors.
  const bad = logs.filter((m) => {
    if (m.type === 'error') return true
    const text = m.text || ''
    if (text.includes('WARN Infinite extent')) return true
    if (text.includes('Infinite extent for field')) return true
    return false
  })
  expect(bad, `Console had errors/warnings: ${JSON.stringify(bad, null, 2)}`).toHaveLength(0)
}

async function expectDesignDefaultsIntact(page: Page) {
  const meta = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const spec = host?.__lastVegaLiteSpec
    const svg = document.querySelector('[data-testid="chart-host"] svg')
    const axisPath = svg?.querySelector('.role-axis path') as SVGElement | null
    return {
      hasPadding: !!spec?.padding,
      viewStroke: spec?.config?.view?.stroke,
      axisLabelFontSize: spec?.config?.axis?.labelFontSize,
      axisStroke: axisPath?.getAttribute('stroke') || '',
    }
  })

  expect(meta.hasPadding).toBeTruthy()
  expect(meta.viewStroke).toBe('transparent')
  expect(meta.axisLabelFontSize).toBe(11)
  // Axis contrast post-processing should make axis stroke black.
  if (meta.axisStroke) {
    expect(meta.axisStroke).toBe('#000000')
  }
}

test('expert util: simple bar (highlight + y scale) 렌더링/디자인 유지', async ({ page }) => {
  await renderSpec(page, EXPERT_SIMPLE_BAR_PATCHED_SPEC)
  await expectDesignDefaultsIntact(page)

  const yScale = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    return host?.__lastVegaLiteSpec?.encoding?.y?.scale
  })
  expect(yScale?.domainMax).toBe(30)
})

test('expert util: stacked bar (filter + highlight + y scale) 렌더링/색 안정화/디자인 유지', async ({ page }) => {
  await renderSpec(page, EXPERT_STACKED_BAR_FILTER_HIGHLIGHT_YMAX_SPEC)
  await expectDesignDefaultsIntact(page)

  const info = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const spec = host?.__lastVegaLiteSpec
    return {
      yScale: spec?.encoding?.y?.scale,
      colorScale: spec?.encoding?.color?.scale,
      legendValues: spec?.encoding?.color?.legend?.values,
    }
  })
  expect(info.yScale?.domainMax).toBe(30)
  expect(info.colorScale?.domain).toEqual(['g2', 'g3'])
  expect(info.colorScale?.range?.length).toBe(2)
  expect(info.legendValues).toEqual(['g2', 'g3'])
})

test('expert util: grouped bar (filter + highlight + y domain) 렌더링/색 안정화/디자인 유지', async ({ page }) => {
  await renderSpec(page, EXPERT_GROUPED_BAR_FILTER_HIGHLIGHT_YDOMAIN_SPEC)
  await expectDesignDefaultsIntact(page)

  const info = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const spec = host?.__lastVegaLiteSpec
    return {
      yScale: spec?.encoding?.y?.scale,
      colorScale: spec?.encoding?.color?.scale,
      legendValues: spec?.encoding?.color?.legend?.values,
    }
  })
  expect(info.yScale?.domain).toEqual([0, 30])
  expect(info.colorScale?.domain).toEqual(['g2', 'g3'])
  expect(info.legendValues).toEqual(['g2', 'g3'])
})

test('expert util: multi-line layered (filter + highlight points) 렌더링/색 안정화/디자인 유지', async ({ page }) => {
  await renderSpec(page, EXPERT_MULTILINE_LAYERED_FILTER_HIGHLIGHT_POINTS_SPEC)
  await expectDesignDefaultsIntact(page)

  const layerColorScales = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const spec = host?.__lastVegaLiteSpec
    return (spec?.layer ?? []).map((layer: any) => layer?.encoding?.color?.scale).filter(Boolean)
  })
  expect(layerColorScales.length).toBeGreaterThanOrEqual(1)
  // At least one layer should have a present-domain scale injected.
  expect(layerColorScales.some((s: any) => Array.isArray(s.domain) && s.domain.join(',') === 'g2,g3')).toBeTruthy()
})

test('expert util-adjacent: explicit color scale(domain/range) is not overridden', async ({ page }) => {
  await renderSpec(page, EXPERT_CALCULATE_FIELD_COLOR_SPEC)
  await expectDesignDefaultsIntact(page)

  const colorScale = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    return host?.__lastVegaLiteSpec?.encoding?.color?.scale
  })
  expect(colorScale?.domain).toEqual(['normal', 'highlight'])
  expect(colorScale?.range).toEqual(['#60a5fa', '#ff0000'])
})

test('v3 grouped data.url(ChartQA/...) spec renders without empty chart', async ({ page }) => {
  const userLikeSpec = JSON.stringify(
    {
      $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
      description: 'Grouped bar chart for 0gacqohbzj07n25s.csv',
      data: { url: 'ChartQA/data/csv/bar/grouped/0gacqohbzj07n25s.csv' },
      mark: 'bar',
      encoding: {
        column: { field: 'Country', type: 'ordinal', header: {} },
        y: { field: 'Number of procedures', type: 'quantitative', axis: { grid: false } },
        x: { field: 'Procedure Type', type: 'nominal', axis: { title: '' } },
        color: { field: 'Procedure Type', type: 'nominal' },
      },
      config: { view: { stroke: 'transparent' }, axis: { domainWidth: 1 } },
    },
    null,
    2,
  )

  await renderSpec(page, userLikeSpec)
  await expectDesignDefaultsIntact(page)

  const markCount = await page.locator('[data-testid="chart-host"] svg rect, [data-testid="chart-host"] svg path').count()
  expect(markCount).toBeGreaterThan(0)
})
