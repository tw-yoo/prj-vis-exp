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
    layer: [
      {
        mark: {
          type: 'line',
          point: false,
        },
        encoding: {
          x: {
            field: 'Year',
            type: 'ordinal',
            axis: {
              title: 'Year',
              labelAngle: 0,
            },
          },
          y: {
            field: 'Percentage_of_Respondents',
            type: 'quantitative',
            axis: {
              title: 'Percentage_of_Respondents',
            },
          },
          color: {
            field: 'Opinion_Type',
            type: 'nominal',
            legend: {
              title: 'Opinion_Type',
            },
          },
        },
      },
      {
        mark: {
          type: 'point',
          filled: true,
          size: 80,
        },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Percentage_of_Respondents', type: 'quantitative' },
          color: { field: 'Opinion_Type', type: 'nominal' },
        },
      },
    ],
    config: {
      view: {
        stroke: 'transparent',
      },
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
            value: 'Average: 65.67',
            mode: 'normalized',
            position: { x: 0.92, y: 0.5284 },
            style: { color: '#111827', fontSize: 14, fontWeight: 'bold', opacity: 1 },
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

async function advancePlayback(page: Page) {
  const startButton = page.getByRole('button', { name: 'Start' })
  if (
    (await startButton.isVisible().catch(() => false)) &&
    (await startButton.isEnabled().catch(() => false))
  ) {
    await startButton.click()
    return true
  }
  const nextButton = page.getByRole('button', { name: 'Next' })
  if (
    (await nextButton.isVisible().catch(() => false)) &&
    (await nextButton.isEnabled().catch(() => false))
  ) {
    await nextButton.click()
    return true
  }
  return false
}

async function readChartSnapshot(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="chart-host"] svg') as SVGSVGElement | null
    if (!svg) return null
    const visibleTicks = Array.from(svg.querySelectorAll<SVGGElement>('.x-axis .tick'))
      .filter((tick) => {
        const display = tick.style.display
        const opacity = Number(tick.getAttribute('opacity') ?? '1')
        return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0.5)
      })
      .map((tick) => tick.textContent?.trim() ?? '')
      .filter((value) => value.length > 0)
    const visiblePoints = Array.from(svg.querySelectorAll<SVGCircleElement>('circle[data-target]')).filter((node) => {
      const display = node.style.display
      const opacity = Number(node.getAttribute('opacity') ?? '1')
      return display !== 'none' && (!Number.isFinite(opacity) || opacity > 0.5)
    })
    const visiblePaths = Array.from(svg.querySelectorAll<SVGPathElement>('path')).filter((node) => {
      const display = node.style.display
      const opacity = Number(node.getAttribute('opacity') ?? '1')
      if (display === 'none' || (Number.isFinite(opacity) && opacity <= 0.5)) return false
      if (node.classList.contains('domain')) return false
      if (node.classList.contains('annotation')) return false
      if (node.closest('.chart-explanation-layer')) return false
      if (node.closest('.color-legend')) return false
      const stroke = (node.getAttribute('stroke') ?? '').trim().toLowerCase()
      if (!stroke || stroke === 'none' || stroke === 'currentcolor') return false
      const d = (node.getAttribute('d') ?? '').trim()
      return /[ML]/.test(d)
    })
    const legendLabels = Array.from(svg.querySelectorAll<SVGTextElement>('.color-legend text'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter((value) => value.length > 0)
    const dataSeriesLabels = visiblePaths
      .map((node) => node.getAttribute('data-series') ?? '')
      .filter((value) => value.trim().length > 0)
    const averageRule =
      svg.querySelector<SVGLineElement>('[data-annotation-slot="aggregate-line:__root__:average"]') ??
      Array.from(svg.querySelectorAll<SVGLineElement>('line.annotation.line-annotation')).find((node) => {
        if (node.classList.contains('text-leader-line')) return false
        const stroke = (node.getAttribute('stroke') ?? '').trim().toLowerCase()
        return stroke === '#ef4444'
      }) ??
      null
    const averageText =
      svg.querySelector<SVGTextElement>('[data-annotation-slot="aggregate-text:__root__:average"]') ??
      Array.from(svg.querySelectorAll<SVGTextElement>('text.annotation.text-annotation')).find(
        (node) => node.textContent?.trim() === 'Average: 65.67',
      ) ??
      Array.from(svg.querySelectorAll<SVGTextElement>('text')).find(
        (node) => node.textContent?.trim() === 'Average: 65.67',
      ) ??
      null
    const legendTitle = svg.querySelector<SVGTextElement>('.color-legend text')
    return {
      renderEpoch: Number(svg.getAttribute('data-render-epoch') ?? '0'),
      xField: svg.getAttribute('data-x-field') ?? '',
      yField: svg.getAttribute('data-y-field') ?? '',
      groupLabel: svg.getAttribute('data-group-label') ?? '',
      colorField: svg.getAttribute('data-color-field') ?? '',
      legendTitle: legendTitle?.textContent?.trim() ?? '',
      visibleTicks,
      visibleSeries: dataSeriesLabels.length > 0 ? dataSeriesLabels : legendLabels.slice(1),
      visiblePathCount: visiblePaths.length,
      visiblePointCount: visiblePoints.length,
      pathStrokeWidths: visiblePaths.map((node) => Number(node.getAttribute('stroke-width') ?? '0')),
      pointRadii: visiblePoints.map((node) => Number(node.getAttribute('r') ?? '0')),
      averageLineY: averageRule ? Number(averageRule.getAttribute('y1') ?? 'NaN') : null,
      averageTextY: averageText ? Number(averageText.getAttribute('y') ?? 'NaN') : null,
      averageTextValue: averageText?.textContent?.trim() ?? '',
      averageLeaderCount: svg.querySelectorAll('.text-leader-line').length,
      averageRuleCount: averageRule ? 1 : 0,
      averageTextCount: averageText ? 1 : 0,
      hasAverageLabel: Array.from(svg.querySelectorAll<SVGTextElement>('text')).some(
        (node) => node.textContent?.trim() === 'Average: 65.67',
      ),
    }
  })
}

async function advanceUntil<T>(
  page: Page,
  predicate: () => Promise<T | null>,
  maxSteps = 24,
) {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = await predicate()
    if (current != null) return current
    const advanced = await advancePlayback(page)
    if (!advanced) {
      await page.waitForTimeout(150)
    }
  }
  return predicate()
}

test('multiple line average reuses the prefiltered source surface and keeps the average label aligned', async ({ page }) => {
  await renderSpec(page, MULTILINE_FILTER_REDRAW_SPEC)
  await runEnvelope(page, multilineFilterPayload())

  await page.getByRole('button', { name: 'Start' }).click()

  await expect
    .poll(async () => {
      const snapshot = await readChartSnapshot(page)
      if (!snapshot) return null
      return {
        visibleTicks: snapshot.visibleTicks,
        visiblePathCount: snapshot.visiblePathCount,
        visiblePointCount: snapshot.visiblePointCount,
        xField: snapshot.xField,
        yField: snapshot.yField,
      }
    })
    .toMatchObject({
      visibleTicks: ['2015', '2016', '2017'],
      visiblePathCount: 2,
      visiblePointCount: 6,
      xField: 'Year',
      yField: 'Percentage_of_Respondents',
    })

  const filteredSnapshot = await readChartSnapshot(page)
  expect(filteredSnapshot).not.toBeNull()
  if (!filteredSnapshot) throw new Error('filtered snapshot is unavailable')
  const expectedStrokeWidth = filteredSnapshot.pathStrokeWidths[0]
  const expectedPointRadius = filteredSnapshot.pointRadii[0]

  const finalSnapshot = await advanceUntil(page, async () => {
    const snapshot = await readChartSnapshot(page)
    if (!snapshot?.hasAverageLabel) return null
    if (snapshot.visibleSeries.length !== 1) return null
    if (snapshot.visibleSeries[0] !== 'Favorable view of US') return null
    return snapshot
  })

  expect(finalSnapshot).not.toBeNull()
  if (!finalSnapshot) throw new Error('final average snapshot is unavailable')

  expect(finalSnapshot.xField).toBe('Year')
  expect(finalSnapshot.yField).toBe('Percentage_of_Respondents')
  expect(['', 'Opinion_Type']).toContain(finalSnapshot.groupLabel)
  expect(['', 'Opinion_Type']).toContain(finalSnapshot.colorField)
  expect(finalSnapshot.legendTitle).toBe('Opinion_Type')
  expect(finalSnapshot.visibleTicks).toEqual(['2015', '2016', '2017'])
  expect(finalSnapshot.visibleSeries).toEqual(['Favorable view of US'])
  expect(finalSnapshot.visiblePathCount).toBe(1)
  expect(finalSnapshot.visiblePointCount).toBe(3)
  expect(finalSnapshot.pathStrokeWidths).toEqual([expectedStrokeWidth])
  expect(finalSnapshot.pointRadii).toEqual([expectedPointRadius, expectedPointRadius, expectedPointRadius])
  expect(finalSnapshot.averageRuleCount).toBe(1)
  expect(finalSnapshot.averageTextCount).toBe(1)
  expect(finalSnapshot.averageLeaderCount).toBe(0)
  expect(finalSnapshot.averageTextValue).toBe('Average: 65.67')
  expect(finalSnapshot.averageLineY).not.toBeNull()
  expect(finalSnapshot.averageTextY).not.toBeNull()
  expect(Math.abs((finalSnapshot.averageLineY ?? 0) - (finalSnapshot.averageTextY ?? 0))).toBeLessThanOrEqual(16)
})
