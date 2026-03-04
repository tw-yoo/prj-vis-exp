import { expect, test, type Page } from '@playwright/test'
import { GROUPED_BAR_GENDER_ORDER_BASE_SPEC, GROUPED_BAR_GENDER_ORDER_FILTERED_SPEC } from './fixtures/specs'

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator('[data-testid="chart-host"] svg')).toBeVisible()
}

function normalizeColor(value: string) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, '')
}

async function collectGroupToColorMap(page: Page, groupField: string, valueField: string) {
  return page.evaluate(({ groupField, valueField }) => {
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
      const rawValue = datum?.[valueField]
      const numeric = Number(rawValue)
      if (!Number.isFinite(numeric)) continue

      const style = window.getComputedStyle(node)
      const value = node.getAttribute('fill') || style.fill || node.getAttribute('stroke') || style.stroke || ''
      const key = String(group)
      if (!out[key] && value && value !== 'none') out[key] = value
    }
    return out
  }, { groupField, valueField })
}

test('워크벤치: grouped bar transform.filter 후에도 Gender 색 매핑을 유지한다 (Male/Female order swap 방지)', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_GENDER_ORDER_BASE_SPEC)
  const baseMap = await collectGroupToColorMap(page, 'Gender', 'value')
  expect(baseMap.Male).toBeTruthy()
  expect(baseMap.Female).toBeTruthy()

  await renderSpec(page, GROUPED_BAR_GENDER_ORDER_FILTERED_SPEC)
  const filteredMap = await collectGroupToColorMap(page, 'Gender', 'value')
  expect(filteredMap.Male).toBeTruthy()
  expect(filteredMap.Female).toBeTruthy()

  expect(normalizeColor(filteredMap.Male)).toBe(normalizeColor(baseMap.Male))
  expect(normalizeColor(filteredMap.Female)).toBe(normalizeColor(baseMap.Female))
})
