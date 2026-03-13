import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const chartHost = '[data-testid="chart-host"]'

function loadSimpleBarSpec() {
  const specPath = path.resolve(process.cwd(), 'data/test/spec/bar_simple_ver.json')
  return fs.readFileSync(specPath, 'utf-8')
}

function splitBridgeDrawPlanPayload() {
  return {
    ops: [
      {
        op: 'draw',
        action: 'split',
        split: {
          by: 'x',
          groups: {
            left: ['1999', '2000', '2001'],
            right: ['2010', '2011', '2012'],
          },
          orientation: 'horizontal',
        },
      },
      {
        op: 'draw',
        action: 'line',
        chartId: 'left',
        line: {
          mode: 'hline-y',
          hline: { y: 2.5 },
          style: { stroke: '#ef4444', strokeWidth: 2, opacity: 1 },
        },
      },
    ],
    ops2: [
      {
        op: 'draw',
        action: 'line',
        chartId: 'right',
        line: {
          mode: 'hline-y',
          hline: { y: 3.0 },
          style: { stroke: '#ef4444', strokeWidth: 2, opacity: 1 },
        },
      },
    ],
    ops3: [
      {
        op: 'draw',
        action: 'line',
        line: {
          mode: 'connect-panel-scalar',
          panelScalar: {
            start: { chartId: 'left', value: 2.5, nodeId: 'n2' },
            end: { chartId: 'right', value: 3.0, nodeId: 'n4' },
            orientationHint: 'horizontal',
          },
          style: { stroke: '#ef4444', strokeWidth: 2, opacity: 1 },
        },
      },
    ],
  }
}

test('split panels stay mounted and render connect-panel-scalar bridge on Next flow', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()

  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify(splitBridgeDrawPlanPayload(), null, 2))

  await page.getByRole('button', { name: 'Run Operations' }).click()
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.locator(`${chartHost} [data-chart-id="left"]`).first()).toBeVisible()
  await expect(page.locator(`${chartHost} [data-chart-id="right"]`).first()).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator(`${chartHost} [data-annotation-key*="connect-panel-scalar"]`)).toHaveCount(1)
  await expect(page.locator(`${chartHost} [data-chart-id="left"]`).first()).toBeVisible()
  await expect(page.locator(`${chartHost} [data-chart-id="right"]`).first()).toBeVisible()
})

test('JSON envelope prefers draw_plan execution over top-level ops', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  await page.getByRole('button', { name: 'JSON Ops' }).click()

  await page.getByTestId('ops-json-input').fill(
    JSON.stringify(
      {
        ops: [
          {
            op: 'filter',
            id: 'n1',
            meta: {
              nodeId: 'n1',
              inputs: [],
              sentenceIndex: 1,
              view: { split: 'horizontal', splitGroup: 'sg_n5', panelId: 'left', phase: 1, parallelGroup: 'sg_n5' },
            },
            field: 'Year',
            include: ['1995', '1999'],
          },
        ],
        ops2: [
          {
            op: 'filter',
            id: 'n2',
            meta: {
              nodeId: 'n2',
              inputs: [],
              sentenceIndex: 1,
              view: { split: 'horizontal', splitGroup: 'sg_n5', panelId: 'right', phase: 1, parallelGroup: 'sg_n5' },
            },
            field: 'Year',
            include: ['2010', '2013', '2017'],
          },
        ],
        draw_plan: splitBridgeDrawPlanPayload(),
      },
      null,
      2,
    ),
  )

  await page.getByRole('button', { name: 'Run Operations' }).click()
  await expect(page.getByTestId('ops-json-status')).toContainText('Execution source: draw_plan')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator(`${chartHost} [data-chart-id="left"]`).first()).toBeVisible()
  await expect(page.locator(`${chartHost} [data-chart-id="right"]`).first()).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator(`${chartHost} [data-annotation-key*="connect-panel-scalar"]`)).toHaveCount(1)
})

test('invalid draw_plan falls back to top-level ops and shows split-intent warning', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(loadSimpleBarSpec())
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
  await page.getByRole('button', { name: 'JSON Ops' }).click()

  await page.getByTestId('ops-json-input').fill(
    JSON.stringify(
      {
        ops: [
          {
            op: 'filter',
            id: 'n1',
            meta: {
              nodeId: 'n1',
              inputs: [],
              sentenceIndex: 1,
              view: { split: 'horizontal', splitGroup: 'sg_warn', panelId: 'left', phase: 1, parallelGroup: 'sg_warn' },
            },
            field: 'Year',
            include: ['1995', '1999'],
          },
        ],
        draw_plan: { ops: { not: 'an-array' } },
      },
      null,
      2,
    ),
  )

  await page.getByRole('button', { name: 'Run Operations' }).click()
  await expect(page.getByTestId('ops-json-status')).toContainText('Execution source: ops')
  await expect(page.getByTestId('ops-json-warning-list')).toContainText(
    'draw_plan detected but invalid; falling back to top-level ops groups.',
  )
  await expect(page.getByTestId('ops-json-warning-list')).toContainText(
    'Split intent found in meta.view; use draw_plan for split visual execution.',
  )
})
