import { expect, test, type Page } from '@playwright/test'
import {
  GROUPED_BAR_COLOR_STABILITY_BASE_SPEC,
  GROUPED_BAR_COLOR_STABILITY_FILTERED_SPEC,
  MULTI_LINE_COLOR_STABILITY_BASE_SPEC,
  MULTI_LINE_COLOR_STABILITY_FILTERED_SPEC,
  MULTI_LINE_URL_ORDER_BASE_SPEC,
  MULTI_LINE_URL_ORDER_FILTERED_SPEC,
  STACKED_BAR_COLOR_STABILITY_BASE_SPEC,
  STACKED_BAR_COLOR_STABILITY_FILTERED_SPEC,
} from './fixtures/specs'

async function renderSpec(page: Page, spec: string) {
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
}

function normalizeColor(value: string) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, '')
}

async function collectGroupToColorMap(page: Page, groupField: string, opts: { prefer: 'fill' | 'stroke' }) {
  return page.evaluate(
    ({ groupField, prefer }) => {
      const host = document.querySelector('[data-testid="chart-host"]')
      const svg = host?.querySelector('svg')
      if (!svg) return {}

      const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
      const getDatumRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? (value as any) : {})

      const out: Record<string, string> = {}

      for (const node of Array.from(svg.querySelectorAll<SVGElement>('*'))) {
        const rawData: any = (node as any).__data__
        const owner = getDatumRecord(rawData)
        const embedded = getDatumRecord((owner as any).datum)
        const datum = Object.keys(embedded).length ? embedded : owner
        const group = datum?.[groupField]
        if (group == null) continue

        const style = window.getComputedStyle(node)
        const attrFill = node.getAttribute('fill') || ''
        const attrStroke = node.getAttribute('stroke') || ''
        const fill = style?.fill || ''
        const stroke = style?.stroke || ''

        const value =
          prefer === 'fill'
            ? attrFill || fill || attrStroke || stroke
            : attrStroke || stroke || attrFill || fill

        const key = String(group)
        if (!out[key] && value && value !== 'none') {
          out[key] = value
        }
      }

      return out
    },
    { groupField, prefer: opts.prefer },
  )
}

async function expectSubsetColorsPreserved(
  page: Page,
  baseSpec: string,
  filteredSpec: string,
  groupField: string,
  opts: { prefer: 'fill' | 'stroke'; requiredKeys?: string[] } = { prefer: 'fill' },
) {
  await page.goto('/')
  await renderSpec(page, baseSpec)
  const baseMap = await collectGroupToColorMap(page, groupField, { prefer: opts.prefer })

  expect(Object.keys(baseMap).length).toBeGreaterThanOrEqual(3)

  await renderSpec(page, filteredSpec)
  const filteredMap = await collectGroupToColorMap(page, groupField, { prefer: opts.prefer })

  const keys = opts.requiredKeys ?? ['g2', 'g3']
  keys.forEach((k) => {
    expect(filteredMap[k]).toBeTruthy()
    expect(normalizeColor(filteredMap[k]!)).toBe(normalizeColor(baseMap[k]!))
  })
}

test('워크벤치: stacked bar transform.filter 이후에도 group 색을 유지한다', async ({ page }) => {
  await expectSubsetColorsPreserved(
    page,
    STACKED_BAR_COLOR_STABILITY_BASE_SPEC,
    STACKED_BAR_COLOR_STABILITY_FILTERED_SPEC,
    'group',
  )
})

test('워크벤치: grouped bar transform.filter 이후에도 group 색을 유지한다', async ({ page }) => {
  await expectSubsetColorsPreserved(
    page,
    GROUPED_BAR_COLOR_STABILITY_BASE_SPEC,
    GROUPED_BAR_COLOR_STABILITY_FILTERED_SPEC,
    'group',
  )
})

test('워크벤치: multi-line transform.filter 이후에도 series 색을 유지한다', async ({ page }) => {
  await expectSubsetColorsPreserved(
    page,
    MULTI_LINE_COLOR_STABILITY_BASE_SPEC,
    MULTI_LINE_COLOR_STABILITY_FILTERED_SPEC,
    'series',
    { prefer: 'stroke', requiredKeys: ['g2', 'g3'] },
  )
})

test('워크벤치: multi-line filter_range(temp.csv) 후에도 series 색을 유지한다', async ({ page }) => {
  // Same description, different data identity + filter transform (simulates util.filter_range materialization).
  const base = JSON.parse(MULTI_LINE_COLOR_STABILITY_BASE_SPEC)
  const filtered = JSON.parse(MULTI_LINE_COLOR_STABILITY_FILTERED_SPEC)
  filtered.description = base.description
  filtered.data = { values: (base.data?.values ?? []).slice().reverse() }

  // Remove per-datum highlight so we validate the underlying series→color mapping only.
  ;[base, filtered].forEach((spec) => {
    if (!Array.isArray(spec.layer)) return
    const pointLayer = spec.layer.find((l: any) => (l?.mark?.type ?? l?.mark) === 'point')
    if (!pointLayer || !pointLayer.encoding || !pointLayer.encoding.color) return
    const c = pointLayer.encoding.color
    if (c && typeof c === 'object' && c.field === 'series') {
      pointLayer.encoding.color = { field: 'series', type: 'nominal' }
    }
  })

  await expectSubsetColorsPreserved(page, JSON.stringify(base, null, 2), JSON.stringify(filtered, null, 2), 'series', {
    prefer: 'stroke',
    requiredKeys: ['g2', 'g3'],
  })
})

test('워크벤치: multi-line (CSV url) filter_range 이후에도 series 색을 유지한다', async ({ page }) => {
  await expectSubsetColorsPreserved(
    page,
    MULTI_LINE_URL_ORDER_BASE_SPEC,
    MULTI_LINE_URL_ORDER_FILTERED_SPEC,
    'Country',
    { prefer: 'stroke', requiredKeys: ['Alpha', 'Beta'] },
  )
})
