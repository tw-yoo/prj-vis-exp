import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const supportPath = path.join(root, 'src/rendering/draw/supportMatrix.ts')
const registryPath = path.join(root, 'src/operation/build/builder-core/registry.ts')
const drawTypesPath = path.join(root, 'src/rendering/draw/types.ts')
const outputPath = path.join(root, 'guide/draw/DRAW_SUPPORT_MATRIX.md')

const CHART_COLUMNS = [
  { key: 'SIMPLE_BAR', label: 'Simple Bar' },
  { key: 'STACKED_BAR', label: 'Stacked Bar' },
  { key: 'GROUPED_BAR', label: 'Grouped Bar' },
  { key: 'SIMPLE_LINE', label: 'Simple Line' },
  { key: 'MULTI_LINE', label: 'Multi Line' },
]

const toSymbol = (status) => {
  if (status === 'supported') return '✅'
  if (status === 'partial') return '⚠️'
  return '❌'
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function parseDrawActionOrder(drawTypesSource) {
  const objectMatch = drawTypesSource.match(/export const DrawAction = \{([\s\S]*?)\} as const/)
  if (!objectMatch) throw new Error('DrawAction object parse failed')
  const lines = objectMatch[1]
  const entries = []
  const lineRegex = /(\w+):\s*'([^']+)'/g
  let match
  while ((match = lineRegex.exec(lines))) {
    entries.push({ name: match[1], value: match[2] })
  }
  return entries
}

function extractTopLevelObjects(arrayBlock) {
  const objects = []
  let depth = 0
  let start = -1
  let inString = false
  let stringQuote = ''
  for (let i = 0; i < arrayBlock.length; i += 1) {
    const ch = arrayBlock[i]
    const prev = i > 0 ? arrayBlock[i - 1] : ''
    if (inString) {
      if (ch === stringQuote && prev !== '\\') inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringQuote = ch
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(arrayBlock.slice(start, i + 1))
        start = -1
      }
    }
  }
  return objects
}

function parseRuntimeMatrix(source, actionOrder) {
  const matrixMatch = source.match(/export const RUNTIME_DRAW_SUPPORT_MATRIX:[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  if (!matrixMatch) throw new Error('RUNTIME_DRAW_SUPPORT_MATRIX parse failed')
  const matrixBody = matrixMatch[1]
  const byAction = new Map()

  actionOrder.forEach(({ name, value }) => {
    const blockRegex = new RegExp(`\\[DrawAction\\.${name}\\]:\\s*withSupported\\(\\{([\\s\\S]*?)\\}\\),`)
    const blockMatch = matrixBody.match(blockRegex)
    const row = Object.fromEntries(CHART_COLUMNS.map((column) => [column.key, 'unsupported']))
    if (blockMatch) {
      const block = blockMatch[1]
      const chartRegex = /\[ChartType\.(\w+)\]:\s*'([^']+)'/g
      let chartMatch
      while ((chartMatch = chartRegex.exec(block))) {
        row[chartMatch[1]] = chartMatch[2]
      }
    }
    byAction.set(value, row)
  })
  return byAction
}

function extractArrayBlock(source, declarationPrefix) {
  const start = source.indexOf(declarationPrefix)
  if (start < 0) return null
  const assignIndex = source.indexOf('=', start)
  if (assignIndex < 0) return null
  const arrayStart = source.indexOf('[', assignIndex)
  if (arrayStart < 0) return null
  let depth = 0
  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '[') depth += 1
    if (ch === ']') depth -= 1
    if (depth === 0) return source.slice(arrayStart, i + 1)
  }
  return null
}

function parseUiMatrix(source, actionOrder, runtimeRows, actionNameToValue) {
  const arrayBlock = extractArrayBlock(source, 'const drawActions: ActionSchema[] =')
  if (!arrayBlock) throw new Error('drawActions array parse failed')

  const byAction = new Map()
  actionOrder.forEach(({ value }) => {
    byAction.set(
      value,
      Object.fromEntries(CHART_COLUMNS.map((column) => [column.key, 'hidden'])),
    )
  })

  const objects = extractTopLevelObjects(arrayBlock)
  for (const objectBody of objects) {
    const valueMatch = objectBody.match(/value:\s*'([^']+)'/)
    if (!valueMatch) continue
    const actionValue = valueMatch[1]
    if (!byAction.has(actionValue)) continue
    const row = byAction.get(actionValue)
    const derivedMatch = objectBody.match(/allowedCharts:\s*runtimeAllowedCharts\(DrawAction\.(\w+)\)/)
    if (derivedMatch) {
      const runtimeActionValue = actionNameToValue.get(derivedMatch[1]) ?? actionValue
      const runtimeRow = runtimeRows.get(runtimeActionValue)
      CHART_COLUMNS.forEach((column) => {
        row[column.key] = runtimeRow?.[column.key] === 'unsupported' ? 'hidden' : 'visible'
      })
      continue
    }
    const allowedMatch = objectBody.match(/allowedCharts:\s*\[([\s\S]*?)\]/)
    if (!allowedMatch) {
      CHART_COLUMNS.forEach((column) => {
        row[column.key] = 'visible'
      })
      continue
    }
    const allowedCharts = new Set()
    const chartRegex = /ChartType\.(\w+)/g
    let chartMatch
    while ((chartMatch = chartRegex.exec(allowedMatch[1]))) {
      allowedCharts.add(chartMatch[1])
    }
    CHART_COLUMNS.forEach((column) => {
      row[column.key] = allowedCharts.has(column.key) ? 'visible' : 'hidden'
    })
  }

  return byAction
}

function buildTable(title, actionOrder, rows, symbolOf) {
  const lines = []
  lines.push(`## ${title}`)
  lines.push('')
  lines.push(`| Draw Action | ${CHART_COLUMNS.map((column) => column.label).join(' | ')} |`)
  lines.push(`| --- | ${CHART_COLUMNS.map(() => '---').join(' | ')} |`)
  actionOrder.forEach(({ value }) => {
    const row = rows.get(value)
    const cells = CHART_COLUMNS.map((column) => symbolOf(row[column.key]))
    lines.push(`| ${value} | ${cells.join(' | ')} |`)
  })
  lines.push('')
  return lines
}

const drawTypesSource = read(drawTypesPath)
const supportSource = read(supportPath)
const registrySource = read(registryPath)
const actionOrder = parseDrawActionOrder(drawTypesSource)
const actionNameToValue = new Map(actionOrder.map((entry) => [entry.name, entry.value]))
const runtimeRows = parseRuntimeMatrix(supportSource, actionOrder)
const uiRows = parseUiMatrix(registrySource, actionOrder, runtimeRows, actionNameToValue)

const content = [
  '# Draw Support Matrix',
  '',
  '기준 파일:',
  '- Runtime: `src/rendering/draw/supportMatrix.ts`',
  '- OpsBuilder UI: `src/operation/build/builder-core/registry.ts`',
  '',
  '표기:',
  '- `✅` supported/visible',
  '- `⚠️` partial',
  '- `❌` unsupported/hidden',
  '',
  ...buildTable('Runtime Matrix', actionOrder, runtimeRows, toSymbol),
  ...buildTable('OpsBuilder UI Matrix', actionOrder, uiRows, (value) => (value === 'visible' ? '✅' : '❌')),
]

fs.writeFileSync(outputPath, content.join('\n'))
console.log(`Wrote ${outputPath}`)
