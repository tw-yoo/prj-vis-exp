import { expect, test, type Page } from '@playwright/test'
import {
  GROUPED_BAR_HIGHLIGHT_YMAX_SPEC,
  LINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC,
  MULTILINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC,
  SIMPLE_BAR_SPEC,
  SIMPLE_BAR_V3_HIGHLIGHT_YDOMAIN_SPEC,
  STACKED_BAR_HIGHLIGHT_YMAX_SPEC,
} from './fixtures/specs'

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
}

async function expectHasRedMark(page: Page) {
  const hasRed = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector('svg')
    if (!svg) return false

    const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '')
    const isRed = (value: string) => {
      const v = normalize(value)
      return v === '#ff0000' || v === 'rgb(255,0,0)' || v === 'rgba(255,0,0,1)'
    }

    for (const node of Array.from(svg.querySelectorAll<SVGElement>('*'))) {
      const attrFill = node.getAttribute('fill') || ''
      const attrStroke = node.getAttribute('stroke') || ''
      if (attrFill && isRed(attrFill)) return true
      if (attrStroke && isRed(attrStroke)) return true

      const style = window.getComputedStyle(node)
      const fill = style?.fill || ''
      const stroke = style?.stroke || ''
      if (fill && isRed(fill)) return true
      if (stroke && isRed(stroke)) return true
    }

    return false
  })

  expect(hasRed).toBeTruthy()
}

test('워크벤치: v3 spec도 그대로 렌더링하고 (highlight + y domain)', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_V3_HIGHLIGHT_YDOMAIN_SPEC)
  await expectHasRedMark(page)

  const specMeta = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    const spec = host?.__lastVegaLiteSpec
    return {
      schema: spec?.$schema,
      yScale: spec?.encoding?.y?.scale,
    }
  })

  expect(specMeta.schema).toContain('/v3')
  expect(specMeta.yScale?.domain).toEqual([0, 20])
})

test('워크벤치: simple bar 기본 색은 #69b3a2를 사용한다', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)

  const fill = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]')
    const svg = host?.querySelector('svg')
    if (!svg) return null

    const node =
      svg.querySelector<SVGElement>('[data-target][role="graphics-symbol"]') ??
      svg.querySelector<SVGElement>('[data-target]') ??
      null
    if (!node) return null

    const style = window.getComputedStyle(node)
    return (style.fill || node.getAttribute('fill') || '').trim()
  })

  expect(fill).toBeTruthy()
  const normalized = String(fill).toLowerCase().replace(/\s+/g, '')
  expect(
    normalized === '#69b3a2' ||
      normalized === 'rgb(105,179,162)' ||
      normalized === 'rgba(105,179,162,1)',
  ).toBeTruthy()
})

test('워크벤치: stacked bar (color condition) + y domainMax를 보존한다', async ({ page }) => {
  await renderSpec(page, STACKED_BAR_HIGHLIGHT_YMAX_SPEC)
  await expectHasRedMark(page)

  const yScale = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    return host?.__lastVegaLiteSpec?.encoding?.y?.scale
  })
  expect(yScale?.domainMax).toBe(20)
})

test('워크벤치: grouped bar (color condition) + y domainMax를 보존한다', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_HIGHLIGHT_YMAX_SPEC)
  await expectHasRedMark(page)

  const yScale = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    return host?.__lastVegaLiteSpec?.encoding?.y?.scale
  })
  expect(yScale?.domainMax).toBe(200)
})

test('워크벤치: layered line (point highlight) + y domainMax를 보존한다', async ({ page }) => {
  await renderSpec(page, LINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC)
  await expectHasRedMark(page)

  const yScale = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    return host?.__lastVegaLiteSpec?.encoding?.y?.scale
  })
  expect(yScale?.domainMax).toBe(20)
})

test('워크벤치: layered multi-line (point highlight) + y domainMax를 보존한다', async ({ page }) => {
  await renderSpec(page, MULTILINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC)
  await expectHasRedMark(page)

  const yScale = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="chart-host"]') as any
    return host?.__lastVegaLiteSpec?.encoding?.y?.scale
  })
  expect(yScale?.domainMax).toBe(20)
})
