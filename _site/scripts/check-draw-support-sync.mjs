import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const supportPath = path.join(root, 'src/rendering/draw/supportMatrix.ts')
const registryPath = path.join(root, 'src/operation/build/builder-core/registry.ts')
const drawTypesPath = path.join(root, 'src/rendering/draw/types.ts')

const CHART_KEYS = ['SIMPLE_BAR', 'STACKED_BAR', 'GROUPED_BAR', 'SIMPLE_LINE', 'MULTI_LINE']

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function parseDrawActionNameToValue(source) {
  const objectMatch = source.match(/export const DrawAction = \{([\s\S]*?)\} as const/)
  if (!objectMatch) {
    throw new Error('Unable to parse DrawAction object from draw/types.ts')
  }
  const body = objectMatch[1]
  const map = new Map()
  const lineRegex = /(\w+):\s*'([^']+)'/g
  let match
  while ((match = lineRegex.exec(body))) {
    map.set(match[1], match[2])
  }
  return map
}

function parseRuntimeAllowedCharts(source, nameToValue) {
  const matrixMatch = source.match(/export const RUNTIME_DRAW_SUPPORT_MATRIX:[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  if (!matrixMatch) {
    throw new Error('Unable to parse RUNTIME_DRAW_SUPPORT_MATRIX from supportMatrix.ts')
  }
  const body = matrixMatch[1]
  const actionRegex = /\[DrawAction\.(\w+)\]:\s*withSupported\(\{([\s\S]*?)\}\),/g
  const result = new Map()
  let actionMatch
  while ((actionMatch = actionRegex.exec(body))) {
    const actionName = actionMatch[1]
    const actionValue = nameToValue.get(actionName)
    if (!actionValue) continue
    const overrides = actionMatch[2]
    const supported = new Set()
    const chartRegex = /\[ChartType\.(\w+)\]:\s*'([^']+)'/g
    let chartMatch
    while ((chartMatch = chartRegex.exec(overrides))) {
      const chartKey = chartMatch[1]
      const status = chartMatch[2]
      if (status === 'supported' || status === 'partial') {
        supported.add(chartKey)
      }
    }
    result.set(actionValue, supported)
  }
  return result
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
    if (depth === 0) {
      return source.slice(arrayStart, i + 1)
    }
  }
  return null
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
      if (ch === stringQuote && prev !== '\\') {
        inString = false
      }
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

function parseRegistryAllowedCharts(source, runtimeMap, nameToValue) {
  const arrayBlock = extractArrayBlock(source, 'const drawActions: ActionSchema[] =')
  if (!arrayBlock) {
    throw new Error('Unable to parse drawActions array from registry.ts')
  }

  const entries = new Map()
  const objects = extractTopLevelObjects(arrayBlock)
  for (const objectBody of objects) {
    const valueMatch = objectBody.match(/value:\s*'([^']+)'/)
    if (!valueMatch) continue
    const value = valueMatch[1]
    const derivedMatch = objectBody.match(/allowedCharts:\s*runtimeAllowedCharts\(DrawAction\.(\w+)\)/)
    if (derivedMatch) {
      const actionName = derivedMatch[1]
      const actionValue = nameToValue.get(actionName) ?? value
      entries.set(value, new Set(runtimeMap.get(actionValue) ?? []))
      continue
    }
    const allowedMatch = objectBody.match(/allowedCharts:\s*\[([\s\S]*?)\]/)
    if (!allowedMatch) {
      entries.set(value, new Set(CHART_KEYS))
      continue
    }
    const chartSet = new Set()
    const chartRegex = /ChartType\.(\w+)/g
    let chartMatch
    while ((chartMatch = chartRegex.exec(allowedMatch[1]))) {
      chartSet.add(chartMatch[1])
    }
    entries.set(value, chartSet)
  }
  return entries
}

function toSortedList(set) {
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function compareSets(a, b) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

const drawTypesSource = read(drawTypesPath)
const supportSource = read(supportPath)
const registrySource = read(registryPath)
const actionNameToValue = parseDrawActionNameToValue(drawTypesSource)
const runtimeMap = parseRuntimeAllowedCharts(supportSource, actionNameToValue)
const registryMap = parseRegistryAllowedCharts(registrySource, runtimeMap, actionNameToValue)

const mismatches = []
for (const [actionValue, runtimeCharts] of runtimeMap.entries()) {
  const uiCharts = registryMap.get(actionValue)
  if (!uiCharts) {
    if (runtimeCharts.size === 0) continue
    mismatches.push({
      action: actionValue,
      runtime: toSortedList(runtimeCharts),
      ui: '(missing in registry)',
    })
    continue
  }
  if (!compareSets(runtimeCharts, uiCharts)) {
    mismatches.push({
      action: actionValue,
      runtime: toSortedList(runtimeCharts),
      ui: toSortedList(uiCharts),
    })
  }
}

if (mismatches.length) {
  console.error('[draw-support-sync] Runtime/UI mismatch found:')
  mismatches.forEach((entry) => {
    console.error(`- action=${entry.action}`)
    console.error(`  runtime: ${JSON.stringify(entry.runtime)}`)
    console.error(`  ui:      ${JSON.stringify(entry.ui)}`)
  })
  process.exit(1)
}

console.log('[draw-support-sync] Runtime support matrix and OpsBuilder registry are in sync.')
