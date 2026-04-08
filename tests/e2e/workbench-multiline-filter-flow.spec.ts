import { expect, test, type Page } from '@playwright/test'

const chartHost = '[data-testid="chart-host"]'
test.setTimeout(120_000)

const MULTILINE_FILTER_REDRAW_SPEC = JSON.stringify(
  {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'E2E multi-line filter redraw flow fixture',
    data: {
      values: [
        { Year: '2006', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 63 },
        { Year: '2007', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 61 },
        { Year: '2008', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 50 },
        { Year: '2009', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 59 },
        { Year: '2010', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 66 },
        { Year: '2011', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 85 },
        { Year: '2012', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 72 },
        { Year: '2013', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 69 },
        { Year: '2014', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 66 },
        { Year: '2015', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 68 },
        { Year: '2016', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 72 },
        { Year: '2017', Opinion_Type: 'Favorable view of US', Percentage_of_Respondents: 57 },
        { Year: '2006', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 32 },
        { Year: '2007', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 35 },
        { Year: '2008', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 25 },
        { Year: '2009', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 85 },
        { Year: '2010', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 76 },
        { Year: '2011', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 81 },
        { Year: '2012', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 74 },
        { Year: '2013', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 70 },
        { Year: '2014', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 60 },
        { Year: '2015', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 66 },
        { Year: '2016', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 78 },
        { Year: '2017', Opinion_Type: 'Confidence in US President', Percentage_of_Respondents: 24 },
      ],
    },
    mark: 'line',
    encoding: {
      x: { field: 'Year', type: 'ordinal', sort: null },
      y: { field: 'Percentage_of_Respondents', type: 'quantitative' },
      color: { field: 'Opinion_Type', type: 'nominal' },
    },
  },
  null,
  2,
)

function multilineFilterPayload() {
  return {
    ops: [
      {
        op: 'filter',
        id: 'n1',
        meta: {
          nodeId: 'n1',
          inputs: [],
          sentenceIndex: 1,
          view: { phase: 1 },
          source: 'recursive_step=1;taskId=o1',
        },
        field: 'Year',
        operator: 'between',
        value: ['2015', '2017'],
      },
    ],
    ops2: [
      {
        op: 'average',
        id: 'n2',
        meta: {
          nodeId: 'n2',
          inputs: ['n1'],
          sentenceIndex: 2,
          view: { phase: 2 },
          source: 'recursive_step=2;taskId=o2',
        },
        field: 'Percentage_of_Respondents',
        group: 'Favorable view of US',
      },
    ],
    draw_plan: {
      ops: [
        { op: 'draw', action: 'clear', meta: { source: 'python-draw-plan', inputs: [] } },
        {
          op: 'draw',
          action: 'highlight',
          meta: { source: 'python-draw-plan', nodeId: 'n1', sentenceIndex: 1, inputs: [] },
          select: { keys: ['2015', '2016', '2017'] },
          style: { color: '#ef4444', opacity: 1 },
        },
      ],
      ops2: [
        {
          op: 'draw',
          action: 'line',
          meta: { source: 'python-draw-plan', nodeId: 'n2', sentenceIndex: 2, inputs: ['n1'] },
          line: {
            mode: 'horizontal-from-y',
            hline: { y: 65.66666666666667 },
            style: { stroke: '#ef4444', strokeWidth: 2, opacity: 1 },
          },
        },
        {
          op: 'draw',
          action: 'text',
          meta: { source: 'python-draw-plan', nodeId: 'n2', sentenceIndex: 2, inputs: ['n1'] },
          text: {
            value: 'average: 65.67',
            mode: 'normalized',
            position: { x: 0.92, y: 0.8037990196078432 },
            style: { color: '#111827', fontSize: 12, fontWeight: 'bold', opacity: 1 },
          },
        },
      ],
    },
    execution_plan: {
      mode: 'sentence-step',
      steps: [
        { id: 's1', sentenceIndex: 1, groupNames: ['ops'], drawGroupNames: ['ops'], parallel: true },
        { id: 's2', sentenceIndex: 2, groupNames: ['ops2'], drawGroupNames: ['ops2'], parallel: true },
      ],
    },
    visual_execution_plan: {
      mode: 'linear-derived-chart-flow',
      steps: [
        {
          id: 's1',
          sentenceIndex: 1,
          groupNames: ['ops'],
          navigationUnit: 'sentence',
          surfacePolicy: 'keep-final-derived-chart',
          substeps: [
            {
              id: 'n1_run',
              kind: 'run-op',
              groupName: 'ops',
              nodeId: 'n1',
              opName: 'filter',
              label: 'run filter',
              visible: true,
              sourceNodeIds: [],
              surface: {
                surfaceType: 'source-chart',
                templateType: 'source-chart',
                keepOnComplete: true,
              },
            },
          ],
        },
        {
          id: 's2',
          sentenceIndex: 2,
          groupNames: ['ops2'],
          navigationUnit: 'sentence',
          surfacePolicy: 'keep-final-derived-chart',
          substeps: [
            {
              id: 'n2_prefilter_group',
              kind: 'prefilter',
              groupName: 'ops2',
              nodeId: 'n2',
              opName: 'average',
              label: 'filter group Favorable view of US',
              visible: true,
              scope: { groups: ['Favorable view of US'], role: 'shared' },
            },
            {
              id: 'n2_surface',
              kind: 'materialize-surface',
              groupName: 'ops2',
              nodeId: 'n2',
              opName: 'average',
              label: 'materialize operand-only-chart',
              visible: true,
              surface: {
                surfaceType: 'derived-chart',
                templateType: 'operand-only-chart',
                sourceNodeIds: ['n1'],
                syntheticLabels: 'semantic',
                layout: 'full-canvas',
              },
            },
            {
              id: 'n2_run',
              kind: 'run-op',
              groupName: 'ops2',
              nodeId: 'n2',
              opName: 'average',
              label: 'run average',
              visible: true,
              sourceNodeIds: ['n1'],
              surface: {
                surfaceType: 'derived-chart',
                templateType: 'operand-only-chart',
                keepOnComplete: true,
              },
            },
          ],
        },
      ],
      reusePolicy: 'result-only',
    },
  }
}

async function renderSpec(page: Page, spec: string) {
  await page.goto('/')
  await page.getByTestId('vl-spec-input').fill(spec)
  await page.getByTestId('render-chart-button').click()
  await expect(page.locator(`${chartHost} svg`).first()).toBeVisible()
}

async function runEnvelope(page: Page, payload: unknown) {
  await page.getByRole('button', { name: 'JSON Ops' }).click()
  await page.getByTestId('ops-json-input').fill(JSON.stringify(payload, null, 2))
  const runButton = page.getByRole('button', { name: 'Run Operations' })
  await expect(runButton).toBeEnabled({ timeout: 30_000 })
  await runButton.click()
  await expect(page.getByTestId('ops-json-status')).toContainText('Execution source: visual_plan')
}

async function clickAdvance(page: Page) {
  const startButton = page.getByRole('button', { name: 'Start' })
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click()
    return
  }
  const nextButton = page.getByRole('button', { name: 'Next' })
  if (await nextButton.isVisible().catch(() => false)) {
    await nextButton.click()
  }
}

async function readChartSnapshot(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="chart-host"] svg') as SVGSVGElement | null
    if (!svg) return null
    const visibleTicks = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis .tick'))
      .filter((tick) => {
        const display = (tick as SVGGElement).style.display
        const opacity = Number(tick.getAttribute('opacity') ?? '1')
        return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0.5)
      })
      .map((tick) => tick.textContent?.trim() ?? '')
      .filter((value) => value.length > 0)
    const visiblePoints = Array.from(svg.querySelectorAll<SVGCircleElement>('circle[data-target][data-series]')).filter((node) => {
      const display = node.style.display
      const opacity = Number(node.getAttribute('opacity') ?? '1')
      return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0.5)
    })
    const visiblePaths = Array.from(svg.querySelectorAll<SVGPathElement>('path[data-series]')).filter((node) => {
      const display = node.style.display
      const opacity = Number(node.getAttribute('opacity') ?? '1')
      return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0.5)
    })
    return {
      renderEpoch: Number(svg.getAttribute('data-render-epoch') ?? '0'),
      plotWidth: Number(svg.getAttribute('data-plot-w') ?? '0'),
      visibleTicks,
      visibleSeries: visiblePaths.map((node) => node.getAttribute('data-series') ?? ''),
      visiblePathCount: visiblePaths.length,
      visiblePointCount: visiblePoints.length,
      pathNumberCounts: visiblePaths.map((node) => (node.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []).length),
      pathStrokeWidths: visiblePaths.map((node) => Number(node.getAttribute('stroke-width') ?? '0')),
      pathStrokes: visiblePaths.map((node) => (node.getAttribute('stroke') ?? '').toLowerCase()),
      pointRadii: visiblePoints.map((node) => Number(node.getAttribute('r') ?? '0')),
      pointFills: visiblePoints.map((node) => (node.getAttribute('fill') ?? '').toLowerCase()),
      pointTargets: visiblePoints.map((node) => node.getAttribute('data-target') ?? ''),
      firstPointCx: visiblePoints.length > 0 ? Number(visiblePoints[0]?.getAttribute('cx') ?? '0') : null,
      minPointCx: visiblePoints.reduce((min, node) => Math.min(min, Number(node.getAttribute('cx') ?? '0')), Number.POSITIVE_INFINITY),
      maxPointCx: visiblePoints.reduce((max, node) => Math.max(max, Number(node.getAttribute('cx') ?? '0')), Number.NEGATIVE_INFINITY),
      hasAverageLabel: Array.from(svg.querySelectorAll<SVGTextElement>('text'))
        .map((node) => (node.textContent ?? '').trim())
        .some((value) => value === 'average: 65.67'),
      redLongPathCount: visiblePaths.filter((node) => {
        const stroke = (node.getAttribute('stroke') ?? '').toLowerCase()
        if (stroke !== '#ef4444') return false
        const numberCount = (node.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []).length
        return numberCount > 6
      }).length,
      redVisiblePathCount: visiblePaths.filter((node) => (node.getAttribute('stroke') ?? '').toLowerCase() === '#ef4444').length,
      redVisiblePointCount: visiblePoints.filter((node) => (node.getAttribute('fill') ?? '').toLowerCase() === '#ef4444').length,
    }
  })
}

test('multiple line filter redraw keeps compact x layout and preserves derived average flow', async ({ page }) => {
  await renderSpec(page, MULTILINE_FILTER_REDRAW_SPEC)
  await runEnvelope(page, multilineFilterPayload())

  await page.getByRole('button', { name: 'Start' }).click()

  await expect
    .poll(async () => {
      const snapshot = await readChartSnapshot(page)
      if (!snapshot) return null
      return {
        plotWidth: snapshot.plotWidth,
        visibleTicks: snapshot.visibleTicks,
        visiblePathCount: snapshot.visiblePathCount,
        pathNumberCounts: snapshot.pathNumberCounts,
        redLongPathCount: snapshot.redLongPathCount,
        redVisiblePathCount: snapshot.redVisiblePathCount,
        redVisiblePointCount: snapshot.redVisiblePointCount,
        maxPointInside: Number.isFinite(snapshot.maxPointCx) && snapshot.maxPointCx <= snapshot.plotWidth + 1,
      }
    })
    .toMatchObject({
      plotWidth: 510,
      visibleTicks: ['2015', '2016', '2017'],
      visiblePathCount: 2,
      pathNumberCounts: [6, 6],
      redLongPathCount: 0,
      redVisiblePathCount: 0,
      redVisiblePointCount: 0,
      maxPointInside: true,
    })

  const filterSnapshot = await readChartSnapshot(page)

  for (let step = 0; step < 4; step += 1) {
    const snapshot = await readChartSnapshot(page)
    if (snapshot?.hasAverageLabel) break
    await clickAdvance(page)
  }

  await expect
    .poll(async () => {
      const snapshot = await readChartSnapshot(page)
      if (!snapshot?.hasAverageLabel) return []
      return Array.from(new Set([
        ...snapshot.visibleSeries,
        ...(snapshot.hasAverageLabel ? ['average: 65.67'] : []),
      ]))
    })
    .toContain('average: 65.67')

  const averageSnapshot = await readChartSnapshot(page)
  expect(averageSnapshot).not.toBeNull()
  expect(filterSnapshot).not.toBeNull()
  if (!averageSnapshot || !filterSnapshot) {
    throw new Error('chart snapshot is unavailable')
  }
  expect(averageSnapshot.visibleTicks).toEqual(['2015', '2016', '2017'])
  expect(averageSnapshot.visibleSeries).toEqual(['Favorable view of US'])
  expect(averageSnapshot.visiblePathCount).toBe(1)
  expect(averageSnapshot.visiblePointCount).toBe(3)
  expect(averageSnapshot.pathStrokeWidths).toEqual(
    filterSnapshot.pathStrokeWidths.slice(0, averageSnapshot.pathStrokeWidths.length),
  )
  expect(averageSnapshot.pointRadii).toEqual(new Array(3).fill(filterSnapshot.pointRadii[0] ?? 0))
  expect(averageSnapshot.minPointCx).toBeFinite()
  expect(filterSnapshot.minPointCx).toBeFinite()
  expect(Math.abs(averageSnapshot.minPointCx - filterSnapshot.minPointCx)).toBeLessThanOrEqual(1)
})
