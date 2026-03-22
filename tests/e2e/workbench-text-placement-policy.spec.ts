import { expect, test, type Page } from '@playwright/test'
import { GROUPED_BAR_SPEC, SIMPLE_BAR_SPEC, STACKED_BAR_SPEC } from './fixtures/specs'

const chartHost = '[data-testid="chart-host"]'

async function ensureSpecInputVisible(page: Page) {
  const input = page.getByTestId('vl-spec-input')
  if ((await input.count()) === 0) {
    await page.getByRole('button', { name: 'Expand' }).first().click()
  }
  await expect(input).toBeVisible({ timeout: 60_000 })
}

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await ensureSpecInputVisible(page)
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

async function runSingleOpsGroup(page: Page, ops: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify({ ops }, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
  const startButton = page.getByRole('button', { name: 'Start' })
  const hasVisibleStart = await startButton
    .isVisible({ timeout: 2000 })
    .then((value) => value)
    .catch(() => false)
  if (hasVisibleStart) {
    await expect(startButton).toBeEnabled({ timeout: 30_000 })
    await startButton.click()
    await expect(startButton).toBeHidden({ timeout: 30_000 })
    return
  }
  const inlineRunButton = page.getByRole('button', { name: 'Run' }).last()
  const hasInlineRun = await inlineRunButton
    .isVisible({ timeout: 2000 })
    .then((value) => value)
    .catch(() => false)
  if (hasInlineRun) {
    await expect(inlineRunButton).toBeEnabled({ timeout: 30_000 })
    await inlineRunButton.click()
  }
  await page.waitForTimeout(1200)
}

test('anchor numeric text falls back inside bars and applies contrast colors', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, [
    { op: 'draw', action: 'highlight', select: { keys: ['USA'] }, style: { color: '#111827' } },
    { op: 'draw', action: 'highlight', select: { keys: ['ESP'] }, style: { color: '#fef9c3' } },
    {
      op: 'draw',
      action: 'rect',
      rect: {
        mode: 'normalized',
        position: { x: 0.5, y: 0.5 },
        size: { width: 1, height: 1 },
        style: { fill: '#cbd5e1', opacity: 0.18 },
      },
    },
    { op: 'draw', action: 'text', select: { keys: ['USA'] }, text: { mode: 'anchor', value: '12' } },
    { op: 'draw', action: 'text', select: { keys: ['ESP'] }, text: { mode: 'anchor', value: '15' } },
  ])

  const placement = await page.evaluate(() => {
    const findText = (label: string) =>
      Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation')).find(
        (node) => (node.textContent ?? '').trim() === label,
      )
    const findBar = (target: string) =>
      document.querySelector<SVGGraphicsElement>(
        `svg rect[data-target="${target}"], svg path[data-target="${target}"]`,
      )

    const usaText = findText('12')
    const espText = findText('15')
    const usaBar = findBar('USA')
    const espBar = findBar('ESP')
    if (!usaText || !espText || !usaBar || !espBar) {
      return null
    }

    const inside = (textNode: SVGTextElement, barNode: SVGGraphicsElement) => {
      const textRect = textNode.getBoundingClientRect()
      const barRect = barNode.getBoundingClientRect()
      const cx = textRect.left + textRect.width / 2
      const cy = textRect.top + textRect.height / 2
      return cx >= barRect.left && cx <= barRect.right && cy >= barRect.top && cy <= barRect.bottom
    }

    return {
      usaInside: inside(usaText, usaBar),
      espInside: inside(espText, espBar),
      usaFill: (usaText.getAttribute('fill') ?? '').toLowerCase(),
      espFill: (espText.getAttribute('fill') ?? '').toLowerCase(),
      leaderCount: document.querySelectorAll('svg line.text-leader-line').length,
    }
  })

  expect(placement).not.toBeNull()
  expect(placement?.usaInside).toBeTruthy()
  expect(placement?.espInside).toBeTruthy()
  expect(placement?.usaFill).toBe('#f9fafb')
  expect(placement?.espFill).toBe('#111827')
  expect(placement?.leaderCount).toBe(0)
})

test('leader line is added only when displacement passes threshold', async ({ page }) => {
  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, [
    {
      op: 'draw',
      action: 'rect',
      rect: {
        mode: 'normalized',
        position: { x: 0.5, y: 0.5 },
        size: { width: 0.6, height: 0.6 },
        style: { fill: '#e5e7eb', opacity: 0.35 },
      },
    },
    {
      op: 'draw',
      action: 'text',
      text: { mode: 'normalized', position: { x: 0.5, y: 0.5 }, value: 'leader-test' },
    },
  ])
  await expect.poll(async () => await page.locator('svg line.text-leader-line').count()).toBeGreaterThan(0)

  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, [
    {
      op: 'draw',
      action: 'text',
      text: { mode: 'normalized', position: { x: 0.92, y: 0.92 }, value: 'no-leader' },
    },
  ])
  await expect(page.locator('svg line.text-leader-line')).toHaveCount(0)
})

test('grouped/stacked sum labels still render with shared placement policy', async ({ page }) => {
  for (const spec of [GROUPED_BAR_SPEC, STACKED_BAR_SPEC]) {
    await renderSpec(page, spec)
    await runSingleOpsGroup(page, [
      {
        op: 'draw',
        action: 'rect',
        rect: {
          mode: 'normalized',
          position: { x: 0.5, y: 0.88 },
          size: { width: 1, height: 0.34 },
          style: { fill: '#dbeafe', opacity: 0.22 },
        },
      },
      { op: 'draw', action: 'sum', sum: { label: 'Total' } },
    ])
    await expect(page.locator('svg text.sum-value-annotation').first()).toBeVisible()
  }
})

test('split chart placement respects chartId scope for collision obstacles', async ({ page }) => {
  const baseOps = [
    {
      op: 'draw',
      action: 'split',
      split: {
        by: 'x',
        groups: { left: ['USA', 'JPN', 'FRA'], right: ['DEU', 'GBR', 'CAN'] },
        restTo: 'right',
        orientation: 'horizontal',
      },
    },
    {
      op: 'draw',
      action: 'text',
      chartId: 'left',
      select: { keys: ['USA'] },
      text: { mode: 'anchor', value: 'scope-check' },
    },
  ]

  const readLeftTextPosition = async () => {
    return page.evaluate(() => {
      const text = Array.from(document.querySelectorAll<SVGTextElement>('svg text.annotation.text-annotation')).find(
        (node) => (node.textContent ?? '').trim() === 'scope-check',
      )
      if (!text) return null
      const svgs = Array.from(document.querySelectorAll<SVGSVGElement>('svg'))
      const textSvg = text.ownerSVGElement
      const svgIndex = textSvg ? svgs.indexOf(textSvg) : -1
      return {
        x: Number(text.getAttribute('x')),
        y: Number(text.getAttribute('y')),
        svgIndex,
      }
    })
  }

  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, baseOps)
  const baseline = await readLeftTextPosition()
  expect(baseline).not.toBeNull()
  expect((baseline?.svgIndex ?? -1) >= 0).toBeTruthy()

  await renderSpec(page, SIMPLE_BAR_SPEC)
  await runSingleOpsGroup(page, [
    ...baseOps,
    {
      op: 'draw',
      action: 'rect',
      chartId: 'right',
      rect: {
        mode: 'normalized',
        position: { x: 0.5, y: 0.9 },
        size: { width: 1, height: 0.34 },
        style: { fill: '#e5e7eb', opacity: 0.35 },
      },
    },
  ])
  const withRightObstacle = await readLeftTextPosition()
  expect(withRightObstacle).not.toBeNull()
  expect((withRightObstacle?.svgIndex ?? -1) >= 0).toBeTruthy()
  if (baseline && withRightObstacle) {
    const dx = Math.abs(withRightObstacle.x - baseline.x)
    const dy = Math.abs(withRightObstacle.y - baseline.y)
    expect(withRightObstacle.svgIndex).toBe(baseline.svgIndex)
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(4)
  }
})
