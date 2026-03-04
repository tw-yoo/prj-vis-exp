import { expect, test, type Page } from '@playwright/test'
import {
  GROUPED_BAR_SPEC,
  MULTI_LINE_SPEC,
  SIMPLE_BAR_SPEC,
  SIMPLE_LINE_SPEC,
  STACKED_BAR_SPEC,
} from './fixtures/specs'

const chartHost = '[data-testid="chart-host"]'

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

async function firstMark(page: Page) {
  const candidates = [
    `${chartHost} svg rect.main-bar`,
    `${chartHost} svg [role="graphics-symbol"][data-target]`,
    `${chartHost} svg rect[data-target]:not(.background)`,
    `${chartHost} svg circle[data-target]:not(.background)`,
    `${chartHost} svg path[data-target]:not(.background)`,
  ]
  await expect
    .poll(async () => {
      for (const selector of candidates) {
        if ((await page.locator(selector).count()) > 0) return 1
      }
      return 0
    })
    .toBe(1)
  for (const selector of candidates) {
    const locator = page.locator(selector)
    if ((await locator.count()) > 0) {
      return locator.first()
    }
  }
  throw new Error('No drawable mark found in chart host.')
}

async function dispatchClick(locator: ReturnType<Page['locator']>) {
  await locator.first().dispatchEvent('click')
}

async function splitMarkerCounts(page: Page, idA = 'A', idB = 'B') {
  const countA = await page.locator(`${chartHost} svg [data-chart-id="${idA}"]`).count()
  const countB = await page.locator(`${chartHost} svg [data-chart-id="${idB}"]`).count()
  return { countA, countB }
}

async function countVisibleBars(page: Page) {
  const selector = [
    `${chartHost} svg rect.main-bar`,
    `${chartHost} svg [role="graphics-symbol"][aria-roledescription="bar"][data-target]:not(.background)`,
  ].join(', ')
  return page.locator(selector).evaluateAll((nodes) => {
    return nodes.filter((node) => {
      const style = window.getComputedStyle(node as Element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }).length
  })
}

async function getRenderEpoch(page: Page) {
  const raw = await page.locator(chartHost).first().getAttribute('data-render-epoch')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

async function visibleSeries(page: Page) {
  return page.locator(`${chartHost} svg [data-series][data-target]`).evaluateAll((nodes) => {
    const values = new Set<string>()
    nodes.forEach((node) => {
      const style = window.getComputedStyle(node as Element)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return
      const series = (node as Element).getAttribute('data-series')
      if (!series) return
      values.add(series)
    })
    return Array.from(values)
  })
}

async function maxDistinctXPerTarget(page: Page) {
  return page.locator(`${chartHost} svg rect[data-target][data-series]`).evaluateAll((nodes) => {
    const map = new Map<string, Set<string>>()
    nodes.forEach((node) => {
      const el = node as SVGRectElement
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return
      const target = el.getAttribute('data-target') ?? ''
      if (!target) return
      const x = el.getAttribute('x') ?? ''
      if (!map.has(target)) map.set(target, new Set<string>())
      map.get(target)!.add(x)
    })
    return Math.max(0, ...Array.from(map.values()).map((set) => set.size))
  })
}

async function dragOnSvg(
  page: Page,
  from: { xRatio: number; yRatio: number },
  to: { xRatio: number; yRatio: number },
) {
  const svg = page.locator(`${chartHost} svg`).first()
  const box = await svg.boundingBox()
  if (!box) throw new Error('Chart svg bounding box not available.')
  const startX = box.x + box.width * from.xRatio
  const startY = box.y + box.height * from.yRatio
  const endX = box.x + box.width * to.xRatio
  const endY = box.y + box.height * to.yRatio
  await svg.evaluate(
    (node, payload) => {
      const dispatch = (target: EventTarget, type: string, x: number, y: number, buttons: number) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'mouse',
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons,
            clientX: x,
            clientY: y,
          }),
        )
      }
      dispatch(node, 'pointerdown', payload.startX, payload.startY, 1)
      for (let step = 1; step <= 6; step += 1) {
        const t = step / 6
        dispatch(
          window,
          'pointermove',
          payload.startX + (payload.endX - payload.startX) * t,
          payload.startY + (payload.endY - payload.startY) * t,
          1,
        )
      }
      dispatch(window, 'pointerup', payload.endX, payload.endY, 0)
    },
    { startX, startY, endX, endY },
  )
}

test('TC7 line-trace (simple line)', async ({ page }) => {
  await renderSpec(page, SIMPLE_LINE_SPEC)
  await page.getByTestId('draw-tool-line-trace').click()
  const marks = page.locator(`${chartHost} svg [role="graphics-symbol"][data-target]`)
  await expect(marks.first()).toBeVisible()
  const keyValues = await marks.evaluateAll((nodes) => {
    return nodes
      .map((node) => node.getAttribute('data-target') ?? '')
      .filter((value, index, self) => value.length > 0 && self.indexOf(value) === index)
  })
  expect(keyValues.length).toBeGreaterThanOrEqual(2)
  const firstKey = keyValues[0]
  const secondKey = keyValues[1]
  await dispatchClick(page.locator(`${chartHost} svg [role="graphics-symbol"][data-target="${firstKey}"]`))
  await dispatchClick(page.locator(`${chartHost} svg [role="graphics-symbol"][data-target="${secondKey}"]`))
  await expect(page.locator(`${chartHost} svg path.line-annotation`)).toHaveCount(1)
})

test('TC8 split/unsplit (simple bar)', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  const epochBeforeSplit = await getRenderEpoch(page)
  await page.getByTestId('draw-tool-split').click()
  await dispatchClick(await firstMark(page))
  await page.getByRole('button', { name: 'Apply Split' }).click()
  const epochAfterSplit = await getRenderEpoch(page)
  expect(epochAfterSplit).toBeGreaterThan(epochBeforeSplit)
  await expect.poll(async () => (await splitMarkerCounts(page)).countA).toBeGreaterThan(0)
  await expect.poll(async () => (await splitMarkerCounts(page)).countB).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Unsplit' }).click()
  await expect(page.locator(`${chartHost} svg [data-chart-id="A"]`)).toHaveCount(0)
})

test('TC9 filter include (simple bar)', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.getByTestId('draw-tool-filter').click()
  await dispatchClick(await firstMark(page))
  await expect.poll(async () => countVisibleBars(page)).toBe(1)
})

test('TC10 record mode append + source badge', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.getByTestId('draw-record-toggle').click()
  await page.getByTestId('draw-tool-highlight').click()
  await dispatchClick(await firstMark(page))
  await expect(page.locator('.draw-timeline-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Append To OpsBuilder' }).click()
  await expect(page.locator('.ops-block')).toHaveCount(1)
  await expect(page.locator('.ops-source-pill', { hasText: 'interaction' })).toHaveCount(1)
})

test('TC11 bar-segment drag (simple bar)', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.getByTestId('draw-tool-bar-segment').click()
  await dragOnSvg(page, { xRatio: 0.25, yRatio: 0.75 }, { xRatio: 0.8, yRatio: 0.35 })
  await expect.poll(async () => await page.locator(`${chartHost} svg .bar-segment-annotation`).count()).toBeGreaterThan(0)
})

test('TC12 tool gating: line-trace disabled on multi-line', async ({ page }) => {
  await renderSpec(page, MULTI_LINE_SPEC)
  await expect(page.getByTestId('draw-tool-line-trace')).toBeDisabled()
})

test('TC13 split (stacked bar)', async ({ page }) => {
  await renderSpec(page, STACKED_BAR_SPEC)
  await page.getByTestId('draw-tool-split').click()
  await dispatchClick(await firstMark(page))
  await page.getByRole('button', { name: 'Apply Split' }).click()
  await expect.poll(async () => (await splitMarkerCounts(page)).countA).toBeGreaterThan(0)
  await expect.poll(async () => (await splitMarkerCounts(page)).countB).toBeGreaterThan(0)
})

test('TC14 filter include (grouped bar)', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  const before = await countVisibleBars(page)
  await page.getByTestId('draw-tool-filter').click()
  await dispatchClick(await firstMark(page))
  await expect.poll(async () => countVisibleBars(page)).toBeGreaterThan(0)
  await expect.poll(async () => countVisibleBars(page)).toBeLessThan(before)
})

test('TC15 split (grouped bar)', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  await page.getByTestId('draw-tool-split').click()
  await dispatchClick(await firstMark(page))
  await page.getByRole('button', { name: 'Apply Split' }).click()
  await expect.poll(async () => (await splitMarkerCounts(page)).countA).toBeGreaterThan(0)
  await expect.poll(async () => (await splitMarkerCounts(page)).countB).toBeGreaterThan(0)
})

test('TC16 split (simple line)', async ({ page }) => {
  await renderSpec(page, SIMPLE_LINE_SPEC)
  await page.getByTestId('draw-tool-split').click()
  await dispatchClick(await firstMark(page))
  await page.getByRole('button', { name: 'Apply Split' }).click()
  await expect.poll(async () => (await splitMarkerCounts(page)).countA).toBeGreaterThan(0)
  await expect.poll(async () => (await splitMarkerCounts(page)).countB).toBeGreaterThan(0)
})

test('TC17 split (multi line)', async ({ page }) => {
  await renderSpec(page, MULTI_LINE_SPEC)
  await page.getByTestId('draw-tool-split').click()
  await dispatchClick(await firstMark(page))
  await page.getByRole('button', { name: 'Apply Split' }).click()
  await expect.poll(async () => (await splitMarkerCounts(page)).countA).toBeGreaterThan(0)
  await expect.poll(async () => (await splitMarkerCounts(page)).countB).toBeGreaterThan(0)
})

test('TC18 source filter/search in OpsBuilder', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.getByTestId('draw-record-toggle').click()
  await page.getByTestId('draw-tool-highlight').click()
  await dispatchClick(await firstMark(page))
  await expect(page.locator('.draw-timeline-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Append To OpsBuilder' }).click()
  await expect(page.locator('.ops-block')).toHaveCount(1)
  await page.selectOption('.ops-toolbar-center select', 'interaction')
  await expect(page.locator('.ops-block')).toHaveCount(1)
  await page.fill('.ops-toolbar-center input[placeholder="Search op/action/source"]', 'highlight')
  await expect(page.locator('.ops-block')).toHaveCount(1)
})

test('TC19 visual-dom snapshot: simple bar highlight', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.getByTestId('draw-tool-highlight').click()
  await dispatchClick(await firstMark(page))
  const fills = await page.locator(`${chartHost} svg rect[data-target], ${chartHost} svg path[data-target]`).evaluateAll((nodes) => {
    return nodes.map((node) => node.getAttribute('fill')).filter((value): value is string => !!value)
  })
  expect(fills).toContain('#ef4444')
})

test('TC20 visual-dom snapshot: grouped split', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  await page.getByTestId('draw-tool-split').click()
  await dispatchClick(await firstMark(page))
  await page.getByRole('button', { name: 'Apply Split' }).click()
  const markup = await page.locator(`${chartHost} svg`).innerHTML()
  expect(markup).toContain('data-chart-id="A"')
  expect(markup).toContain('data-chart-id="B"')
})

test('TC21 series-filter (stacked bar)', async ({ page }) => {
  await renderSpec(page, STACKED_BAR_SPEC)
  await page.getByTestId('draw-tool-series-filter').click()
  await dispatchClick(page.locator(`${chartHost} svg [data-series][data-target]`).first())
  await page.getByTestId('draw-series-apply').click()
  await expect.poll(async () => (await visibleSeries(page)).length).toBe(1)
})

test('TC22 grouped->stacked convert (series tool)', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  await page.getByTestId('draw-tool-series-filter').click()
  await page.getByTestId('draw-series-convert-grouped').click()
  await expect(page.locator(`${chartHost} svg`)).toBeVisible()
  await expect.poll(async () => await page.locator(`${chartHost} svg [data-target][data-series]`).count()).toBeGreaterThan(0)
})

test('TC23 grouped compare macro', async ({ page }) => {
  await renderSpec(page, GROUPED_BAR_SPEC)
  await page.getByTestId('draw-tool-series-filter').click()
  const seriesList = await page.locator(`${chartHost} svg [data-series][data-target]`).evaluateAll((nodes) => {
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const series = (node as Element).getAttribute('data-series')
      if (series) unique.add(series)
    })
    return Array.from(unique)
  })
  expect(seriesList.length).toBeGreaterThanOrEqual(2)
  await dispatchClick(page.locator(`${chartHost} svg [data-series="${seriesList[0]}"][data-target]`).first())
  await dispatchClick(page.locator(`${chartHost} svg [data-series="${seriesList[1]}"][data-target]`).first())
  await page.getByTestId('draw-series-grouped-compare').click()
  await expect.poll(async () => await page.locator(`${chartHost} svg line.annotation`).count()).toBeGreaterThan(1)
  await expect.poll(async () => await page.locator(`${chartHost} svg text.annotation`).count()).toBeGreaterThan(0)
})

test('TC24 stacked composition labels macro', async ({ page }) => {
  await renderSpec(page, STACKED_BAR_SPEC)
  await page.getByTestId('draw-tool-series-filter').click()
  await dispatchClick(page.locator(`${chartHost} svg [data-series][data-target]`).first())
  await page.getByTestId('draw-series-reset').click()
  await page.getByTestId('draw-series-stacked-composition').click()
  await expect.poll(async () => await page.locator(`${chartHost} svg text.annotation`).count()).toBeGreaterThan(0)
})
