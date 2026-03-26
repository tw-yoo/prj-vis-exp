import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const drawFilePath = path.join(root, 'src/operation/build/authoring/draw.ts')
const dataFilePath = path.join(root, 'src/operation/build/authoring/data.ts')
const supportPath = path.join(root, 'src/rendering/draw/supportMatrix.ts')
const outputPath = path.join(root, 'guide/draw/DRAW_AUTHORING_DSL.md')

const CHART_COLUMNS = [
  { key: 'SIMPLE_BAR', label: 'Simple Bar' },
  { key: 'STACKED_BAR', label: 'Stacked Bar' },
  { key: 'GROUPED_BAR', label: 'Grouped Bar' },
  { key: 'SIMPLE_LINE', label: 'Simple Line' },
  { key: 'MULTI_LINE', label: 'Multi Line' },
]

const DSL_TO_DRAW_ACTION = {
  highlight: 'highlight',
  dim: 'dim',
  clear: 'clear',
  sleep: 'sleep',
  line: 'line',
  rect: 'rect',
  text: 'text',
  barSegment: 'bar-segment',
  filter: 'filter',
  sort: 'sort',
  split: 'split',
  unsplit: 'unsplit',
  lineTrace: 'line-trace',
  lineToBar: 'line-to-bar',
  sum: 'sum',
  stackedToGrouped: 'stacked-to-grouped',
  groupedToStacked: 'grouped-to-stacked',
  stackedFilterGroups: 'stacked-filter-groups',
  groupedFilterGroups: 'grouped-filter-groups',
}

function parseRuntimeMatrix(sourceText) {
  const matrixMatch = sourceText.match(/export const RUNTIME_DRAW_SUPPORT_MATRIX:[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  if (!matrixMatch) throw new Error('RUNTIME_DRAW_SUPPORT_MATRIX parse failed')
  const matrixBody = matrixMatch[1]
  const rows = new Map()
  const actionRegex = /\[DrawAction\.(\w+)\]:\s*withSupported\(\{([\s\S]*?)\}\),/g
  let actionMatch
  while ((actionMatch = actionRegex.exec(matrixBody))) {
    const actionName = actionMatch[1]
    const overrides = actionMatch[2]
    const statusByChart = Object.fromEntries(CHART_COLUMNS.map((column) => [column.key, 'unsupported']))
    const chartRegex = /\[ChartType\.(\w+)\]:\s*'([^']+)'/g
    let chartMatch
    while ((chartMatch = chartRegex.exec(overrides))) {
      statusByChart[chartMatch[1]] = chartMatch[2]
    }
    rows.set(actionName, statusByChart)
  }
  return rows
}

function toSymbol(status) {
  if (status === 'supported') return '✅'
  if (status === 'partial') return '⚠️'
  return '❌'
}

function toDrawActionName(actionValue) {
  return actionValue
    .split('-')
    .map((chunk, index) => (index === 0 ? chunk : `${chunk[0].toUpperCase()}${chunk.slice(1)}`))
    .join('')
}

function createProgramFromTsconfig() {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.app.json')
  if (!configPath) throw new Error('tsconfig.app.json not found')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(String(configFile.error.messageText))
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))
  if (parsed.errors && parsed.errors.length > 0) {
    throw new Error(String(parsed.errors[0].messageText))
  }
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}

function findVariableDeclaration(sourceFile, variableName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue
      if (decl.name.text === variableName) return decl
    }
  }
  return null
}

function collectRowsFromType(checker, type, prefix, locationFallback) {
  const rows = []
  const props = type.getProperties()
  for (const prop of props) {
    const propName = prop.getName()
    const location = prop.valueDeclaration ?? prop.declarations?.[0] ?? locationFallback
    const propType = checker.getTypeOfSymbolAtLocation(prop, location)
    const callSignatures = propType.getCallSignatures()

    if (callSignatures.length > 0) {
      // Use the first overload; authoring APIs keep builder-first overload first.
      const sigText = checker.signatureToString(callSignatures[0])
      rows.push({
        name: `${prefix}${propName}`,
        signature: `\`${propName}${sigText}\``,
        comment: '',
      })
      continue
    }

    const nestedProps = propType.getProperties()
    if (nestedProps.length > 0) {
      rows.push(...collectRowsFromType(checker, propType, `${prefix}${propName}.`, location))
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

function collectRowsFromTypeChecker() {
  const program = createProgramFromTsconfig()
  const checker = program.getTypeChecker()

  const drawSource = program.getSourceFile(path.resolve(drawFilePath))
  const dataSource = program.getSourceFile(path.resolve(dataFilePath))
  if (!drawSource) throw new Error('draw.ts not found in program')
  if (!dataSource) throw new Error('data.ts not found in program')

  const drawDecl = findVariableDeclaration(drawSource, 'draw')
  const drawActionsDecl = findVariableDeclaration(drawSource, 'drawActions')
  const dataActionsDecl = findVariableDeclaration(dataSource, 'dataActions')
  if (!drawDecl || !drawActionsDecl || !dataActionsDecl) {
    throw new Error('Failed to locate draw/data authoring objects.')
  }

  const drawType = checker.getTypeAtLocation(drawDecl.name)
  const drawActionsType = checker.getTypeAtLocation(drawActionsDecl.name)
  const dataActionsType = checker.getTypeAtLocation(dataActionsDecl.name)

  return {
    drawHelperRows: collectRowsFromType(checker, drawType, 'draw.', drawDecl.name),
    drawActionRows: collectRowsFromType(checker, drawActionsType, 'ops.draw.', drawActionsDecl.name),
    dataActionRows: collectRowsFromType(checker, dataActionsType, 'ops.data.', dataActionsDecl.name),
    source: 'typescript-typechecker',
  }
}

const supportSourceText = fs.readFileSync(supportPath, 'utf8')
const runtimeMatrix = parseRuntimeMatrix(supportSourceText)

const { drawHelperRows, drawActionRows, dataActionRows, source: signatureSource } = collectRowsFromTypeChecker()

const supportRows = drawActionRows.map((row) => {
  const dslName = row.name.replace('ops.draw.', '')
  const actionValue = DSL_TO_DRAW_ACTION[dslName]
  const runtimeName = actionValue ? toDrawActionName(actionValue) : null
  const runtimeStatus = runtimeName ? runtimeMatrix.get(runtimeName) : null
  return {
    action: row.name,
    runtimeStatus,
  }
})

const generatedAt = new Date().toISOString()

const lines = [
  '# Draw/Data Authoring DSL',
  '',
  `Generated at: \`${generatedAt}\``,
  `Signature source: \`${signatureSource}\``,
  '',
  'Source:',
  '- `src/operation/build/authoring/draw.ts`',
  '- `src/operation/build/authoring/data.ts`',
  '- `src/rendering/draw/supportMatrix.ts`',
  '',
  '## Core Rules',
  '- Authoring code should use positional DSL functions.',
  '- Avoid object-literal calls like `drawOps.*({ ... })` and `dataOps.*({ ... })`.',
  '- Use helper builders (`draw.*`) for nested spec composition.',
  '',
  '## ops.draw API',
  '',
  '| API | Signature | Description |',
  '| --- | --- | --- |',
  ...drawActionRows.map((row) => `| \`${row.name}\` | ${row.signature} | ${row.comment || '-'} |`),
  '',
  '## draw Helper API',
  '',
  '| Helper | Signature | Description |',
  '| --- | --- | --- |',
  ...drawHelperRows.map((row) => `| \`${row.name}\` | ${row.signature} | ${row.comment || '-'} |`),
  '',
  '## ops.data API',
  '',
  '| API | Signature | Description |',
  '| --- | --- | --- |',
  ...dataActionRows.map((row) => `| \`${row.name}\` | ${row.signature} | ${row.comment || '-'} |`),
  '',
  '## Draw Support By Chart (Runtime)',
  '',
  `| ops.draw | ${CHART_COLUMNS.map((column) => column.label).join(' | ')} |`,
  `| --- | ${CHART_COLUMNS.map(() => '---').join(' | ')} |`,
  ...supportRows.map((row) => {
    if (!row.runtimeStatus) {
      return `| \`${row.action}\` | ${CHART_COLUMNS.map(() => '❌').join(' | ')} |`
    }
    const cells = CHART_COLUMNS.map((column) => toSymbol(row.runtimeStatus[column.key]))
    return `| \`${row.action}\` | ${cells.join(' | ')} |`
  }),
  '',
  '## Examples',
  '',
  '```ts',
  "import { draw, ops, values } from 'src/operation/build/authoring'",
  '',
  "const line = draw.lineSpec.horizontalFromY(42, draw.style.line('#2563eb', 2, 0.9))",
  "const split = draw.splitSpec.two('asia', values('KOR', 'JPN'), 'europe', values('DEU', 'FRA'))",
  '',
  'const opsGroup = [',
  "  ops.draw.line('A', line)",
  "  ops.draw.filter('A', draw.filterSpec.y('gte', 42))",
  "  ops.draw.split(undefined, split)",
  "  ops.data.filterByComparison('>=', 100, 'Value')",
  "  ops.data.average('Value')",
  ']',
  '```',
]

fs.writeFileSync(outputPath, lines.join('\n'))
console.log(`Wrote ${outputPath}`)
