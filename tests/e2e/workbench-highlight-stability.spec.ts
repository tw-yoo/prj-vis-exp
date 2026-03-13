import { expect, test, type Page } from '@playwright/test'
import { GROUPED_BAR_SPEC, MULTI_LINE_SPEC, SIMPLE_BAR_SPEC, SIMPLE_LINE_SPEC, STACKED_BAR_SPEC } from './fixtures/specs'

const chartHost = '[data-testid="chart-host"]'

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

async function runJsonOps(page: Page, ops: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify({ ops: [ops] }, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await runButton.click()
  const startButton = page.getByRole('button', { name: 'Start' })
  await expect(startButton).toBeVisible({ timeout: 10_000 })
  await startButton.click()
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
}

async function rememberTargetNode(page: Page, selector: string) {
  const state = await page.evaluate(({ hostSelector, nodeSelector }) => {
    const host = document.querySelector(hostSelector)
    if (!host) return { found: false, count: 0 }
    const node = host.querySelector(nodeSelector)
    ;(window as unknown as { __e2eTargetNode?: Element }).__e2eTargetNode = node ?? undefined
    return {
      found: Boolean(node),
      count: host.querySelectorAll('svg [data-target]').length,
    }
  }, { hostSelector: chartHost, nodeSelector: selector })
  expect(state.found).toBeTruthy()
  return state
}

async function readTargetNodeState(page: Page, selector: string) {
  return page.evaluate(({ hostSelector, nodeSelector }) => {
    const host = document.querySelector(hostSelector)
    if (!host) {
      return { exists: false, sameNode: false, count: 0, fill: '', opacity: NaN }
    }
    const node = host.querySelector(nodeSelector) as SVGElement | null
    const before = (window as unknown as { __e2eTargetNode?: Element }).__e2eTargetNode
    const fill = node ? (node.getAttribute('fill') || window.getComputedStyle(node).fill || '') : ''
    const opacity = node ? Number(node.getAttribute('opacity') ?? window.getComputedStyle(node).opacity) : NaN
    return {
      exists: Boolean(node),
      sameNode: Boolean(node && before && node === before),
      count: host.querySelectorAll('svg [data-target]').length,
      fill,
      opacity,
    }
  }, { hostSelector: chartHost, nodeSelector: selector })
}

async function discoverDataMark(page: Page) {
  const discovered = await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    if (!host) return null
    const candidates = Array.from(
      host.querySelectorAll<SVGElement>('svg rect[data-target], svg circle[data-target], svg path[data-target]'),
    ).filter((node) => !node.classList.contains('annotation') && !node.classList.contains('background'))
    const preferred = candidates.find((node) => node.tagName.toLowerCase() === 'rect')
      || candidates.find((node) => node.tagName.toLowerCase() === 'circle')
      || candidates[0]
    if (!preferred) return null
    return {
      tag: preferred.tagName.toLowerCase() as 'rect' | 'circle' | 'path',
      target: preferred.getAttribute('data-target') ?? '',
      series: preferred.getAttribute('data-series') ?? '',
    }
  }, chartHost)
  expect(discovered).toBeTruthy()
  return discovered!
}

test('JSON highlight keeps existing simple-bar node identity (no recreate)', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  const selector = `${chartHost} svg rect.main-bar[data-target="USA"]`
  const before = await rememberTargetNode(page, selector)

  await runJsonOps(page, {
    op: 'draw',
    action: 'highlight',
    select: { mark: 'rect', keys: ['USA'] },
    style: { color: '#ef4444' },
  })

  await expect
    .poll(async () => {
      const after = await readTargetNodeState(page, selector)
      return String(after.fill).toLowerCase().replace(/\s+/g, '')
    })
    .toMatch(/ef4444|239,68,68/)

  const after = await readTargetNodeState(page, selector)
  expect(after.exists).toBeTruthy()
  expect(after.sameNode).toBeTruthy()
  expect(after.count).toBe(before.count)
})

test('draw-only JSON ops do not auto-render when chart svg is missing', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    if (host) host.innerHTML = ''
  }, chartHost)
  page.once('dialog', (dialog) => void dialog.accept())

  await runJsonOps(page, {
    op: 'draw',
    action: 'highlight',
    select: { mark: 'rect', keys: ['USA'] },
    style: { color: '#ef4444' },
  })

  await expect(page.getByText('Render Chart first for draw-only operations.')).toBeVisible()
  await expect(page.locator(`${chartHost} svg`)).toHaveCount(0)
})

test('interaction highlight keeps existing node identity', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  const selector = `${chartHost} svg rect.main-bar[data-target="USA"]`
  await rememberTargetNode(page, selector)

  await page.getByTestId('draw-tool-highlight').click()
  await page.locator(selector).click()

  await expect
    .poll(async () => {
      const after = await readTargetNodeState(page, selector)
      return String(after.fill).toLowerCase().replace(/\s+/g, '')
    })
    .toMatch(/ef4444|239,68,68/)

  const after = await readTargetNodeState(page, selector)
  expect(after.exists).toBeTruthy()
  expect(after.sameNode).toBeTruthy()
})

test('color-change highlight does not increase data-mark count across chart types', async ({ page }) => {
  const cases = [SIMPLE_BAR_SPEC, STACKED_BAR_SPEC, GROUPED_BAR_SPEC, SIMPLE_LINE_SPEC, MULTI_LINE_SPEC]

  for (const spec of cases) {
    await renderSpec(page, spec)
    const mark = await discoverDataMark(page)
    const selector = `${chartHost} svg ${mark.tag}[data-target="${mark.target}"]${mark.series ? `[data-series="${mark.series}"]` : ''}`
    const before = await rememberTargetNode(page, selector)
    await runJsonOps(page, {
      op: 'draw',
      action: 'highlight',
      select: { mark: mark.tag, keys: [mark.target] },
      style: { color: '#ef4444' },
    })
    const after = await readTargetNodeState(page, selector)
    expect(after.exists).toBeTruthy()
    expect(after.sameNode).toBeTruthy()
    expect(after.count).toBe(before.count)
  }
})

test('dim does not recreate data marks across chart types', async ({ page }) => {
  const cases = [SIMPLE_BAR_SPEC, STACKED_BAR_SPEC, GROUPED_BAR_SPEC, SIMPLE_LINE_SPEC, MULTI_LINE_SPEC]

  for (const spec of cases) {
    await renderSpec(page, spec)
    const mark = await discoverDataMark(page)
    const selector = `${chartHost} svg ${mark.tag}[data-target="${mark.target}"]${mark.series ? `[data-series="${mark.series}"]` : ''}`
    const before = await rememberTargetNode(page, selector)
    await runJsonOps(page, {
      op: 'draw',
      action: 'dim',
      select: { mark: mark.tag, keys: [mark.target] },
      style: { opacity: 0.25 },
    })
    const after = await readTargetNodeState(page, selector)
    expect(after.exists).toBeTruthy()
    expect(after.sameNode).toBeTruthy()
    expect(after.count).toBe(before.count)
  }
})

test('simple-bar dim with multi keys (mark omitted) updates opacity in-place without recreate', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  const selectorAny = `${chartHost} svg rect.main-bar[data-target]`
  const before = await rememberTargetNode(page, selectorAny)
  const snapshot = await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    if (!host) return null
    const bars = Array.from(host.querySelectorAll<SVGRectElement>('svg rect.main-bar[data-target]'))
    const selected = bars.slice(0, 2)
    const other = bars.find((bar) => bar !== selected[0] && bar !== selected[1])
    if (selected.length < 2 || !other) return null
    const selectedKeys = selected
      .map((bar) => bar.getAttribute('data-target') ?? '')
      .filter((value) => value.length > 0)
    if (selectedKeys.length < 2) return null
    ;(window as unknown as { __e2eDimSelA?: Element; __e2eDimSelB?: Element; __e2eDimOther?: Element }).__e2eDimSelA = selected[0]
    ;(window as unknown as { __e2eDimSelA?: Element; __e2eDimSelB?: Element; __e2eDimOther?: Element }).__e2eDimSelB = selected[1]
    ;(window as unknown as { __e2eDimSelA?: Element; __e2eDimSelB?: Element; __e2eDimOther?: Element }).__e2eDimOther = other
    return {
      selectedKeys,
      selectedA: selectedKeys[0],
      selectedB: selectedKeys[1],
      otherTarget: other.getAttribute('data-target') ?? '',
    }
  }, chartHost)
  expect(snapshot).toBeTruthy()

  await runJsonOps(page, {
    op: 'draw',
    action: 'dim',
    select: { keys: snapshot!.selectedKeys },
    style: { opacity: 0.2 },
  })

  const dimState = await page.evaluate(({ hostSelector, selectedA, selectedB, otherTarget }) => {
    const host = document.querySelector(hostSelector)
    if (!host) return null
    const win = window as unknown as { __e2eDimSelA?: Element; __e2eDimSelB?: Element; __e2eDimOther?: Element }
    const selA = host.querySelector(`svg rect.main-bar[data-target="${selectedA}"]`)
    const selB = host.querySelector(`svg rect.main-bar[data-target="${selectedB}"]`)
    const other = host.querySelector(`svg rect.main-bar[data-target="${otherTarget}"]`)
    const readOpacity = (node: Element | null) =>
      node ? Number((node as SVGElement).getAttribute('opacity') ?? window.getComputedStyle(node).opacity) : NaN
    return {
      count: host.querySelectorAll('svg [data-target]').length,
      sameSelA: Boolean(selA && win.__e2eDimSelA && selA === win.__e2eDimSelA),
      sameSelB: Boolean(selB && win.__e2eDimSelB && selB === win.__e2eDimSelB),
      sameOther: Boolean(other && win.__e2eDimOther && other === win.__e2eDimOther),
      opacitySelA: readOpacity(selA),
      opacitySelB: readOpacity(selB),
      opacityOther: readOpacity(other),
    }
  }, { hostSelector: chartHost, selectedA: snapshot!.selectedA, selectedB: snapshot!.selectedB, otherTarget: snapshot!.otherTarget })
  expect(dimState).toBeTruthy()
  expect(dimState!.count).toBe(before.count)
  expect(dimState!.sameSelA).toBeTruthy()
  expect(dimState!.sameSelB).toBeTruthy()
  expect(dimState!.sameOther).toBeTruthy()
  expect(dimState!.opacitySelA).toBeGreaterThan(0.95)
  expect(dimState!.opacitySelB).toBeGreaterThan(0.95)
  expect(dimState!.opacityOther).toBeGreaterThan(0.15)
  expect(dimState!.opacityOther).toBeLessThan(0.25)
})

test('simple-bar JSON draw line with normalized position renders line annotation', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runJsonOps(page, {
    op: 'draw',
    action: 'line',
    line: {
      position: {
        start: { x: 0.2, y: 0.3 },
        end: { x: 0.8, y: 0.7 },
      },
      style: { stroke: '#2563eb', strokeWidth: 2, opacity: 1 },
    },
  })
  await expect(page.locator(`${chartHost} svg line.line-annotation`)).toHaveCount(1)
})

test('simple-bar JSON draw line supports horizontal-from-y alias mode token', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runJsonOps(page, {
    op: 'draw',
    action: 'line',
    line: {
      mode: 'horizontal-from-y',
      hline: { y: 60 },
      style: { stroke: '#2563eb', strokeWidth: 2, opacity: 1 },
    },
  })
  await expect(page.locator(`${chartHost} svg line.line-annotation`)).toHaveCount(1)
})

test('simple-bar split with explicit first/second groups excludes non-selected remainder', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runJsonOps(page, {
    op: 'draw',
    action: 'split',
    split: {
      by: 'x',
      groups: {
        'first-half': ['USA', 'FRA'],
        'second-half': ['ESP'],
      },
      orientation: 'horizontal',
    },
  })

  const splitTargets = await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    if (!host) return null
    const readTargets = (chartId: string) =>
      Array.from(host.querySelectorAll<SVGRectElement>(`svg [data-chart-id="${chartId}"] rect.main-bar[data-target]`))
        .map((node) => node.getAttribute('data-target') ?? '')
        .filter((value) => value.length > 0)
    return {
      first: readTargets('first-half'),
      second: readTargets('second-half'),
    }
  }, chartHost)

  expect(splitTargets).toBeTruthy()
  expect(splitTargets!.first).toEqual(['USA', 'FRA'])
  expect(splitTargets!.second).toEqual(['ESP'])
})

test('simple-bar sum ignores provided sum.value and uses current bar total', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runJsonOps(page, {
    op: 'draw',
    action: 'sum',
    sum: {
      value: 1129,
      label: 'sum',
    },
  })

  const sumState = await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    if (!host) return null
    const bars = Array.from(host.querySelectorAll<SVGRectElement>('svg rect.main-bar[data-target]'))
    const visibleBars = bars.filter((bar) => {
      const style = window.getComputedStyle(bar)
      return style.display !== 'none' && Number(style.opacity) > 0
    })
    const sumBar = host.querySelector<SVGRectElement>('svg rect.main-bar[data-target="sum"]')
    const tickText = Array.from(host.querySelectorAll<SVGTextElement>('svg .x-axis .tick text')).map((node) => node.textContent?.trim() ?? '')
    const yTicks = Array.from(host.querySelectorAll<SVGTextElement>('svg .y-axis .tick text'))
      .map((node) => Number(node.textContent?.trim() ?? NaN))
      .filter(Number.isFinite)
    const plotHeight = Number(host.querySelector('svg')?.getAttribute('data-plot-h') ?? NaN)
    const sumY = Number(sumBar?.getAttribute('y') ?? NaN)
    const sumHeight = Number(sumBar?.getAttribute('height') ?? NaN)
    return {
      barCount: bars.length,
      visibleBarCount: visibleBars.length,
      hasSumBar: Boolean(sumBar),
      sumValue: Number(sumBar?.getAttribute('data-value') ?? NaN),
      firstTick: tickText[0] ?? null,
      yTickMax: yTicks.length ? Math.max(...yTicks) : NaN,
      plotHeight,
      sumY,
      sumHeight,
    }
  }, chartHost)

  expect(sumState).toBeTruthy()
  expect(sumState!.barCount).toBe(4)
  expect(sumState!.visibleBarCount).toBe(1)
  expect(sumState!.hasSumBar).toBeTruthy()
  expect(sumState!.sumValue).toBe(54)
  expect(sumState!.firstTick).toBe('sum')
  expect(sumState!.yTickMax).toBeGreaterThan(20)
  expect(sumState!.sumY).toBeGreaterThanOrEqual(-0.5)
  expect(sumState!.sumY + sumState!.sumHeight).toBeLessThanOrEqual(sumState!.plotHeight + 0.5)
})

test('simple-bar sum works with label-only spec (sum.value omitted)', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runJsonOps(page, {
    op: 'draw',
    action: 'sum',
    sum: {
      label: 'sum',
    },
  })

  const sumValue = await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    if (!host) return NaN
    const sumBar = host.querySelector<SVGRectElement>('svg rect.main-bar[data-target="sum"]')
    return Number(sumBar?.getAttribute('data-value') ?? NaN)
  }, chartHost)

  expect(sumValue).toBe(54)
})

test('structural split is still allowed to remount chart', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    ;(window as unknown as { __e2eSvg?: SVGSVGElement | null }).__e2eSvg = host?.querySelector('svg') ?? null
  }, chartHost)

  await runJsonOps(page, {
    op: 'draw',
    action: 'split',
    split: {
      by: 'x',
      groups: { A: ['USA', 'KOR'] },
      restTo: 'B',
      orientation: 'vertical',
    },
  })

  const remountState = await page.evaluate((hostSelector) => {
    const host = document.querySelector(hostSelector)
    const current = host?.querySelector('svg') ?? null
    const before = (window as unknown as { __e2eSvg?: SVGSVGElement | null }).__e2eSvg ?? null
    return {
      hasCurrent: Boolean(current),
      remounted: Boolean(current && before && current !== before),
    }
  }, chartHost)

  expect(remountState.hasCurrent).toBeTruthy()
  expect(remountState.remounted).toBeTruthy()
})
