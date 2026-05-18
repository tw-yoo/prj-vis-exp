import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

type CsvCase = {
  row: number
  id: string
  chartType: string
  runnerType: 'simple-bar' | 'simple-line' | 'multi-line' | 'grouped-bar'
  opsSpec: Record<string, unknown[]>
  specPath: string
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function parsePythonLiteralObject(raw: string) {
  return JSON.parse(
    raw
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/'/g, '"'),
  )
}

function walkJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkJsonFiles(fullPath)
    return entry.name.endsWith('.json') ? [fullPath] : []
  })
}

function loadCsvCases(): CsvCase[] {
  const root = process.cwd()
  const csvPath = path.join(root, 'docs/operation-rules/selected_supported_compositional_questions.csv')
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const header = rows[0] ?? []
  const idIndex = header.indexOf('id')
  const chartTypeIndex = header.indexOf('chart_type')
  const specIndex = header.indexOf('spec')
  const vlSpecFiles = walkJsonFiles(path.join(root, 'ChartQA/data/vlSpec'))

  return rows.slice(1).map((row, index) => {
    const id = row[idIndex]
    const specPath = vlSpecFiles.find((file) => path.basename(file) === `${id}.json`)
    if (!specPath) throw new Error(`No Vega-Lite spec JSON found for CSV row ${index + 2}: ${id}`)
    const normalizedSpecPath = specPath.split(path.sep).join('/')
    const runnerType = normalizedSpecPath.includes('/line/multiple/') ? 'multi-line'
      : normalizedSpecPath.includes('/line/simple/') ? 'simple-line'
        : normalizedSpecPath.includes('/bar/simple/') ? 'simple-bar'
          : 'grouped-bar'
    return {
      row: index + 2,
      id,
      chartType: row[chartTypeIndex],
      runnerType,
      opsSpec: parsePythonLiteralObject(row[specIndex]) as Record<string, unknown[]>,
      specPath,
    }
  })
}

function patchSpecDataUrls<T>(spec: T): T {
  const normalize = (rawUrl: unknown) => {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl
    if (rawUrl.startsWith('/')) return rawUrl
    if (rawUrl.startsWith('ChartQA/')) return `/${rawUrl}`
    if (rawUrl.startsWith('data/test/')) return `/${rawUrl}`
    if (rawUrl.startsWith('data/')) return `/ChartQA/${rawUrl}`
    return rawUrl
  }
  const clone = structuredClone(spec) as Record<string, unknown>
  const patchData = (obj: Record<string, unknown>) => {
    const data = obj.data as { url?: unknown } | undefined
    if (data && typeof data.url === 'string') obj.data = { ...data, url: normalize(data.url) }
  }
  patchData(clone)
  if (Array.isArray(clone.layer)) {
    clone.layer = clone.layer.map((layer) => {
      const next = { ...(layer as Record<string, unknown>) }
      patchData(next)
      return next
    })
  }
  return clone as T
}

const csvCases = loadCsvCases()

test('selected supported compositional questions create annotation artifacts per operation', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')

  for (const csvCase of csvCases) {
    const opTotal = Object.values(csvCase.opsSpec).reduce((sum, ops) => sum + (Array.isArray(ops) ? ops.length : 0), 0)
    if (opTotal === 0) {
      expect(csvCase.opsSpec, `row ${csvCase.row} ${csvCase.id} should be explicitly render-only`).toEqual({})
      continue
    }

    const spec = patchSpecDataUrls(JSON.parse(fs.readFileSync(csvCase.specPath, 'utf8')))
    const result = await page.evaluate(
      async ({ spec, opsSpec, runnerType }) => {
        document.body.innerHTML = '<div id="chart-under-test" style="width: 820px; height: 600px; margin: 24px;"></div>'
        const container = document.querySelector<HTMLElement>('#chart-under-test')
        if (!container) throw new Error('chart test container missing')
        const { renderChart } = await import('/src/api/rendering.ts')
        const { runChartOps } = await import('/src/api/operation-run.ts')

        const operationClass = (op: string | null) => {
          const prefix =
            runnerType === 'simple-bar' ? 'operation-next' :
              runnerType === 'simple-line' ? 'operation-next-line' :
                runnerType === 'multi-line' ? 'operation-next-multiple-line' :
                  'operation-next-grouped-bar'
          const suffixByOp: Record<string, string> = {
            filter: 'filter',
            average: 'average',
            diff: 'diff',
            diffByValue: 'diff-by-value',
            findExtremum: 'extremum',
            pairDiff: 'pair-diff',
            lagDiff: 'lag-diff',
            retrieveValue: 'retrieve-value',
          }
          const suffix = op == null ? null : suffixByOp[op]
          return suffix ? `${prefix}-${suffix}` : null
        }

        const annotationCount = (className: string) =>
          document.querySelectorAll(`svg .annotation-layer .${className}`).length

        const svgSize = () => {
          const svg = container.querySelector('svg')
          if (!(svg instanceof SVGSVGElement)) return null
          const rect = svg.getBoundingClientRect()
          return {
            svg,
            key: JSON.stringify({
              viewBox: svg.getAttribute('viewBox') ?? '',
              width: svg.getAttribute('width') ?? '',
              height: svg.getAttribute('height') ?? '',
              plotW: svg.getAttribute('data-plot-w') ?? '',
              plotH: svg.getAttribute('data-plot-h') ?? '',
              marginLeft: svg.getAttribute('data-m-left') ?? '',
              marginTop: svg.getAttribute('data-m-top') ?? '',
              rectW: Number(rect.width.toFixed(3)),
              rectH: Number(rect.height.toFixed(3)),
            }),
          }
        }

        const textOverflows = () => {
          const svg = container.querySelector('svg')
          if (!(svg instanceof SVGSVGElement)) return []
          const viewBox = svg.viewBox.baseVal
          const right = viewBox.x + viewBox.width
          const bottom = viewBox.y + viewBox.height
          return Array.from(svg.querySelectorAll<SVGTextElement>('text.text-annotation')).filter((node) => {
            const box = node.getBBox()
            const tolerance = 4
            return box.x < viewBox.x - tolerance ||
              box.y < viewBox.y - tolerance ||
              box.x + box.width > right + tolerance ||
              box.y + box.height > bottom + tolerance
          }).map((node) => node.textContent ?? '')
        }

        await renderChart(container, spec)
        const before = svgSize()
        if (!before) throw new Error('render produced no svg')
        const missing: Array<{ operationIndex: number; op: string | null; expectedClass: string | null }> = []

        await runChartOps(container, spec, opsSpec, {
          onOperationCompleted: ({ operation, operationIndex }) => {
            const op = typeof operation?.op === 'string' ? operation.op : null
            const expectedClass = operationClass(op)
            const isAllowedTransform = op === 'draw' || Boolean(operation?.action)
            if (!expectedClass && isAllowedTransform) return
            if (!expectedClass || annotationCount(expectedClass) === 0) {
              missing.push({ operationIndex, op, expectedClass })
            }
          },
        })

        const after = svgSize()
        return {
          missing,
          sameSvg: before.svg === after?.svg,
          sameSize: before.key === after?.key,
          textOverflows: textOverflows(),
        }
      },
      { spec, opsSpec: csvCase.opsSpec, runnerType: csvCase.runnerType },
    )

    expect(result.missing, `row ${csvCase.row} ${csvCase.id} missing annotation artifacts`).toEqual([])
    expect(result.sameSvg, `row ${csvCase.row} ${csvCase.id} remounted SVG`).toBe(true)
    expect(result.sameSize, `row ${csvCase.row} ${csvCase.id} changed SVG size`).toBe(true)
    expect(result.textOverflows, `row ${csvCase.row} ${csvCase.id} has overflowing annotation text`).toEqual([])
  }
})
