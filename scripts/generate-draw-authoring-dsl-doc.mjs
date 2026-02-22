import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const typedocJsonArgIndex = process.argv.findIndex((arg) => arg === '--typedoc-json')
const typedocJsonPath = typedocJsonArgIndex >= 0 && process.argv[typedocJsonArgIndex + 1]
  ? path.resolve(process.argv[typedocJsonArgIndex + 1])
  : path.join(root, '.cache/typedoc-authoring.json')
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

function readSource(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function findObjectLiteral(sourceFile, variableName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName) continue
      if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
        return declaration.initializer
      }
    }
  }
  return null
}

function getParamText(parameter, sourceFile) {
  const name = parameter.name.getText(sourceFile)
  const type = parameter.type ? parameter.type.getText(sourceFile) : 'unknown'
  const optional = !!parameter.questionToken || !!parameter.initializer
  return `${name}${optional ? '?' : ''}: ${type}`
}

function getMethodSignature(name, method, sourceFile) {
  const params = method.parameters.map((param) => getParamText(param, sourceFile)).join(', ')
  const returnType = method.type ? method.type.getText(sourceFile) : 'unknown'
  return `\`${name}(${params}) => ${returnType}\``
}

function collectMethodRows(objectLiteral, sourceFile, prefix) {
  const rows = []
  for (const property of objectLiteral.properties) {
    if (ts.isMethodDeclaration(property) && property.name) {
      const methodName = property.name.getText(sourceFile)
      rows.push({
        name: `${prefix}${methodName}`,
        signature: getMethodSignature(methodName, property, sourceFile),
        comment: '',
      })
      continue
    }
    if (ts.isPropertyAssignment(property) && property.initializer && ts.isObjectLiteralExpression(property.initializer)) {
      const propertyName = property.name.getText(sourceFile)
      rows.push(...collectMethodRows(property.initializer, sourceFile, `${prefix}${propertyName}.`))
    }
  }
  return rows
}

function normalizeText(parts) {
  return (parts ?? [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatTypedocType(type) {
  if (!type || typeof type !== 'object') return 'unknown'
  switch (type.type) {
    case 'intrinsic':
      return type.name ?? 'unknown'
    case 'reference': {
      const args = Array.isArray(type.typeArguments) && type.typeArguments.length > 0
        ? `<${type.typeArguments.map(formatTypedocType).join(', ')}>`
        : ''
      return `${type.name ?? 'unknown'}${args}`
    }
    case 'array':
      return `${formatTypedocType(type.elementType)}[]`
    case 'union':
      return (type.types ?? []).map(formatTypedocType).join(' | ') || 'unknown'
    case 'intersection':
      return (type.types ?? []).map(formatTypedocType).join(' & ') || 'unknown'
    case 'literal':
      return JSON.stringify(type.value)
    case 'tuple':
      return `[${(type.elements ?? []).map(formatTypedocType).join(', ')}]`
    case 'reflection':
      return 'object'
    case 'query':
      return `typeof ${type.queryType?.name ?? 'unknown'}`
    default:
      return type.name ?? 'unknown'
  }
}

function signatureFromTypedoc(sig) {
  const params = (sig.parameters ?? [])
    .map((param) => {
      const optional = param.flags?.isOptional ? '?' : ''
      return `${param.name}${optional}: ${formatTypedocType(param.type)}`
    })
    .join(', ')
  const returnType = formatTypedocType(sig.type)
  return `\`${sig.name}(${params}) => ${returnType}\``
}

function commentFromTypedoc(sig) {
  const summary = normalizeText(sig.comment?.summary)
  if (!summary) return ''
  return summary
}

function getNestedChildren(reflection) {
  if (Array.isArray(reflection.children) && reflection.children.length > 0) return reflection.children
  const declarationChildren = reflection.type?.declaration?.children
  if (Array.isArray(declarationChildren) && declarationChildren.length > 0) return declarationChildren
  return []
}

function collectRowsFromTypedoc(reflection, prefix = '') {
  const rows = []
  for (const child of getNestedChildren(reflection)) {
    if (child.kindString === 'Method' && Array.isArray(child.signatures) && child.signatures.length > 0) {
      const sig = child.signatures[0]
      rows.push({
        name: `${prefix}${child.name}`,
        signature: signatureFromTypedoc(sig),
        comment: commentFromTypedoc(sig),
      })
      continue
    }
    if (child.kindString === 'Property') {
      rows.push(...collectRowsFromTypedoc(child, `${prefix}${child.name}.`))
    }
  }
  return rows
}

function findTypedocVariable(rootNode, variableName) {
  const stack = [rootNode]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.kindString === 'Variable' && node.name === variableName) return node
    const children = getNestedChildren(node)
    for (const child of children) stack.push(child)
  }
  return null
}

function collectRowsFromTypedocJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const drawNode = findTypedocVariable(json, 'draw')
  const drawActionsNode = findTypedocVariable(json, 'drawActions')
  const dataActionsNode = findTypedocVariable(json, 'dataActions')
  if (!drawNode || !drawActionsNode || !dataActionsNode) return null
  return {
    drawHelperRows: collectRowsFromTypedoc(drawNode, 'draw.'),
    drawActionRows: collectRowsFromTypedoc(drawActionsNode, 'ops.draw.'),
    dataActionRows: collectRowsFromTypedoc(dataActionsNode, 'ops.data.'),
    source: `typedoc-json:${path.relative(root, filePath)}`,
  }
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

const drawSource = readSource(drawFilePath)
const dataSource = readSource(dataFilePath)
const supportSourceText = fs.readFileSync(supportPath, 'utf8')

const typedocRows = collectRowsFromTypedocJson(typedocJsonPath)
let drawHelperRows
let drawActionRows
let dataActionRows
let signatureSource

if (typedocRows) {
  drawHelperRows = typedocRows.drawHelperRows
  drawActionRows = typedocRows.drawActionRows
  dataActionRows = typedocRows.dataActionRows
  signatureSource = typedocRows.source
} else {
  const drawObject = findObjectLiteral(drawSource, 'draw')
  const drawActionsObject = findObjectLiteral(drawSource, 'drawActions')
  const dataActionsObject = findObjectLiteral(dataSource, 'dataActions')
  if (!drawObject || !drawActionsObject || !dataActionsObject) {
    throw new Error('Failed to locate draw/data authoring objects.')
  }
  drawHelperRows = collectMethodRows(drawObject, drawSource, 'draw.')
  drawActionRows = collectMethodRows(drawActionsObject, drawSource, 'ops.draw.')
  dataActionRows = collectMethodRows(dataActionsObject, dataSource, 'ops.data.')
  signatureSource = 'typescript-ast-fallback'
}

const runtimeMatrix = parseRuntimeMatrix(supportSourceText)

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
  "  ops.draw.line('A', line),",
  "  ops.draw.filter('A', draw.filterSpec.y('gte', 42)),",
  "  ops.draw.split(undefined, split),",
  "  ops.data.filterByComparison('>=', 100, 'Value'),",
  "  ops.data.average('Value'),",
  ']',
  '```',
]

fs.writeFileSync(outputPath, lines.join('\n'))
console.log(`Wrote ${outputPath}`)
