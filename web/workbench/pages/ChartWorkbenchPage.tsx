import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type React from 'react'
import '../../App.css'
// import barSimpleSpecRaw from '../../../data/test/spec/line_simple.json?raw'
import barSimpleSpecRaw from '../../../data/test/spec/bar_simple_ver.json?raw'
// import barSimpleSpecRaw from '../../../ChartQa/data/vlSpec/bar/simple/0o12tngadmjjux2n.json?raw' // Simple bar1
// import barSimpleSpecRaw from '../../../ChartQa/data/vlSpec/bar/stacked/10t8o5vhethzeod1.json?raw' // Stacked bar1
// import barSimpleSpecRaw from '../../../ChartQa/data/vlSpec/bar/grouped/0prhtod4tli879nh.json?raw' // Grouped bar1
// import barSimpleSpecRaw from '../../../ChartQa/data/vlSpec/line/simple/10gtgmmgh599jnr7.json?raw' // Simple line1
// import barSimpleSpecRaw from '../../../ChartQa/data/vlSpec/bar/simple/0w88bu7qm4ilsqmh.json?raw' // Simple bar 2
// ChartQA/data/vlSpec/bar/simple/0o12tngadmjjux2n.json
// ../ChartQA/data/vlSpec/bar/grouped/0gacqohbzj07n25s.json?raw
import lineSimpleSpecRaw from '../../../data/test/spec/line_simple.json?raw'
import {
  assertDrawCapabilityForOp,
  BarDrawHandler,
  ChartType,
  clearAnnotations,
  collectOpsBuilderOptionSources,
  collectSeriesAggregates,
  collectTargetSeriesValues,
  createBarSegmentOp,
  createDimOp,
  createDrawInteractionController,
  createEmptyInteractionSession,
  createFilterOp,
  createGroupedCompareMacroOps,
  createGroupedToStackedOp,
  createGroupedToSimpleOp,
  createHighlightOp,
  createLineOp,
  createLineTraceOp,
  createMultiLineToGroupedOp,
  createMultiLineToStackedOp,
  createRectOp,
  createSeriesFilterOp,
  createSplitOp,
  createStackedCompositionLabelOps,
  createStackedToGroupedOp,
  createStackedToSimpleOp,
  createTextOp,
  createUnsplitOp,
  DrawAction,
  DrawInteractionTools,
  DrawRectModes,
  DrawTextModes,
  getChartType,
  getEmptyOptionSources,
  getRuntimeDrawSupportDecision,
  GroupedBarDrawHandler,
  interactionSessionReducer,
  MultiLineDrawHandler,
  OperationOp,
  ops,
  runGenericDraw,
  runOpsPlan,
  runTimeline,
  serializeSessionToDslPlanSource,
  serializeSessionToJson,
  serializeSessionToOperationSpec,
  SimpleLineDrawHandler,
  StackedBarDrawHandler,
  TimelineStepKind,
  draw,
  type ChartTypeValue,
  type DrawInteractionControllerState,
  type BarSegmentCommit,
  type DrawLineSpec,
  type DrawInteractionHit,
  type DrawInteractionTool,
  type DrawOp,
  type DrawRectSpec,
  type NormalizedPoint,
  type OperationSpec,
  type PointerClientPoint,
  type SeriesFilterMode,
  type TimelineStep,
  type VegaLiteSpec,
} from '../../../src/api/legacy'
import * as d3 from 'd3'
import {
  materializeExecutionGroups,
  normalizeExecutionPlan,
  normalizeVisualExecutionPlan,
  summarizeExecutionPlan,
  summarizeVisualExecutionPlan,
  type ExecutionPlan,
  type VisualExecutionPlan,
} from '../../../src/api/nlp-ops'
import {
  runVisualExecutionPlan,
  type VisualSentencePlaybackResult,
  type VisualSurfaceState,
} from '../../../src/api/visual-execution-player'
import { STRUCTURAL_DRAW_ACTIONS } from '../../../src/operation/run/drawActionPolicy'
import { browserEngine } from '../../engine/createBrowserEngine'
import OpsBuilder from '../opsBuilder/OpsBuilder'
import DrawTimelinePanel from '../components/DrawTimelinePanel'
import { createSceneCaptureWriter } from '../scenes/sceneCapture'
import { fetchLatestPythonDrawPlan } from '../services/pythonDrawPlan'

const vlSpecPlaceholder = barSimpleSpecRaw
// const vlSpecPlaceholder = lineSimpleSpecRaw

const EXPORT_SCALE = 3
// Workbench: always use our chart-type-specific renderers (D3-first) instead of raw vega-embed.
const renderChartDispatch = browserEngine.renderChart
const runChartOps = browserEngine.runChartOps
const parseToOperationSpec = browserEngine.parseToOperationSpec
const compileOpsPlan = browserEngine.compileOpsPlan
const runPythonPlan = browserEngine.runPythonPlan
const OPS_PLAN_MODULES = import.meta.glob('../../../data/expert/**/*.ts')
const DRAW_TOOL_OPTIONS: Array<{ value: DrawInteractionTool; label: string }> = [
  { value: DrawInteractionTools.None, label: 'None' },
  { value: DrawInteractionTools.Highlight, label: 'Highlight' },
  { value: DrawInteractionTools.Dim, label: 'Dim' },
  { value: DrawInteractionTools.Text, label: 'Text' },
  { value: DrawInteractionTools.Rect, label: 'Rect' },
  { value: DrawInteractionTools.Line, label: 'Line' },
  { value: DrawInteractionTools.LineTrace, label: 'Line Trace' },
  { value: DrawInteractionTools.Filter, label: 'Filter' },
  { value: DrawInteractionTools.Split, label: 'Split' },
  { value: DrawInteractionTools.SeriesFilter, label: 'Series Filter' },
  { value: DrawInteractionTools.Convert, label: 'Convert' },
  { value: DrawInteractionTools.BarSegment, label: 'Bar Segment' },
]

const DRAW_TOOL_ACTION_MAP: Partial<Record<DrawInteractionTool, DrawAction>> = {
  [DrawInteractionTools.Highlight]: DrawAction.Highlight,
  [DrawInteractionTools.Dim]: DrawAction.Dim,
  [DrawInteractionTools.Text]: DrawAction.Text,
  [DrawInteractionTools.Rect]: DrawAction.Rect,
  [DrawInteractionTools.Line]: DrawAction.Line,
  [DrawInteractionTools.LineTrace]: DrawAction.LineTrace,
  [DrawInteractionTools.Filter]: DrawAction.Filter,
  [DrawInteractionTools.Split]: DrawAction.Split,
  [DrawInteractionTools.BarSegment]: DrawAction.BarSegment,
}

const cloneOperationForRecord = (operation: OperationSpec): OperationSpec => {
  try {
    return structuredClone(operation)
  } catch {
    return JSON.parse(JSON.stringify(operation)) as OperationSpec
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isOperationSpecValue = (value: unknown): value is OperationSpec =>
  isPlainObject(value) && typeof value.op === 'string'

const isOperationSpecArray = (value: unknown): value is OperationSpec[] =>
  Array.isArray(value) && value.every((entry) => isOperationSpecValue(entry))

const orderedGroupNames = (groupNames: string[]) => {
  const unique = Array.from(new Set(groupNames))
  const out: string[] = []
  if (unique.includes('ops')) out.push('ops')
  unique
    .filter((name) => /^ops\d+$/.test(name))
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
    .forEach((name) => {
      if (!out.includes(name)) out.push(name)
    })
  unique
    .filter((name) => name !== 'ops' && name !== 'last' && !/^ops\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      if (!out.includes(name)) out.push(name)
    })
  if (unique.includes('last')) out.push('last')
  unique.forEach((name) => {
    if (!out.includes(name)) out.push(name)
  })
  return out
}

const normalizeOpsGroupsForWorkbench = (opsSpec: unknown): Array<{ name: string; ops: OperationSpec[] }> => {
  if (!opsSpec) return []
  if (isOperationSpecArray(opsSpec)) return [{ name: 'ops', ops: opsSpec }]
  if (isOperationSpecValue(opsSpec)) return [{ name: 'ops', ops: [opsSpec] }]
  if (!isPlainObject(opsSpec)) return []

  const source = opsSpec
  const groups: Record<string, OperationSpec[]> = {}
  if (isOperationSpecArray(source.ops)) {
    groups.ops = source.ops
  }

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'ops') return
    if (isOperationSpecArray(value)) {
      groups[key] = value
    }
  })

  if (!Object.keys(groups).length && isOperationSpecValue(source)) {
    groups.ops = [source]
  }

  return orderedGroupNames(Object.keys(groups)).map((name) => ({
    name,
    ops: groups[name] ?? [],
  }))
}

type OpsJsonExecutionSource = 'visual_plan' | 'draw_plan' | 'ops'

type ParsedOpsJsonInput = {
  groups: OperationSpec[][]
  groupNames: string[]
  executionSource: OpsJsonExecutionSource
  executionMode: 'group' | 'sentence-step'
  opsSpecGroupMap: Record<string, OperationSpec[]>
  drawPlanGroupMap?: Record<string, OperationSpec[]>
  executionPlan?: ExecutionPlan
  visualExecutionPlan?: VisualExecutionPlan
  warnings: string[]
}

const toGroupMap = (groups: Array<{ name: string; ops: OperationSpec[] }>) => {
  const out: Record<string, OperationSpec[]> = {}
  groups.forEach((group) => {
    out[group.name] = group.ops
  })
  if (!Array.isArray(out.ops)) out.ops = []
  return out
}

const normalizeRowForCompile = (value: unknown): Record<string, unknown> | null => {
  if (!isPlainObject(value)) return null
  const out: Record<string, unknown> = {}
  Object.entries(value).forEach(([key, entry]) => {
    if (entry === null || entry === undefined) {
      out[key] = null
      return
    }
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      out[key] = entry
      return
    }
    out[key] = String(entry)
  })
  return out
}

const loadDataRowsForCompile = async (spec: VegaLiteSpec): Promise<Record<string, unknown>[]> => {
  const record = spec as unknown as Record<string, unknown>
  const data = isPlainObject(record.data) ? (record.data as Record<string, unknown>) : null
  const values = data?.values
  if (Array.isArray(values)) {
    return values.map((entry) => normalizeRowForCompile(entry)).filter((entry): entry is Record<string, unknown> => !!entry)
  }

  const url = typeof data?.url === 'string' ? data.url.trim() : ''
  if (!url) return []
  const response = await fetch(url, { method: 'GET' })
  if (!response.ok) return []
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('application/json') || url.toLowerCase().endsWith('.json')) {
    const payload = await response.json()
    if (Array.isArray(payload)) {
      return payload.map((entry) => normalizeRowForCompile(entry)).filter((entry): entry is Record<string, unknown> => !!entry)
    }
    if (isPlainObject(payload) && Array.isArray(payload.values)) {
      return payload.values
        .map((entry) => normalizeRowForCompile(entry))
        .filter((entry): entry is Record<string, unknown> => !!entry)
    }
    return []
  }

  const text = await response.text()
  const lowerUrl = url.toLowerCase()
  const parsed =
    lowerUrl.endsWith('.tsv') || contentType.includes('text/tab-separated-values') ? d3.tsvParse(text) : d3.csvParse(text)
  return parsed.map((entry) => normalizeRowForCompile(entry)).filter((entry): entry is Record<string, unknown> => !!entry)
}

const withInteractionMeta = (operation: OperationSpec): OperationSpec => ({
  ...operation,
  meta: {
    ...((operation as { meta?: Record<string, unknown> }).meta ?? {}),
    source: 'interaction',
  },
})

const isExecutableDrawOp = (operation: OperationSpec): operation is DrawOp =>
  operation.op === OperationOp.Draw && typeof (operation as DrawOp).action === 'string'

const isDrawOnlyGroup = (operations: OperationSpec[]) => {
  const executable = operations.filter((operation) => operation.op !== OperationOp.Sleep)
  if (!executable.length) return false
  return executable.every((operation) => isExecutableDrawOp(operation))
}

const isDrawDebugEnabled = () => {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { __WORKBENCH_DRAW_DEBUG__?: boolean }).__WORKBENCH_DRAW_DEBUG__)
}

function countMainBarsFromNodes(nodes: NodeList | Node[]) {
  let count = 0
  Array.from(nodes).forEach((node) => {
    if (!(node instanceof Element)) return
    if (node.matches('rect.main-bar')) count += 1
    count += node.querySelectorAll('rect.main-bar').length
  })
  return count
}

function createMainBarMutationTrace(container: HTMLElement, operationLabel: string) {
  if (!isDrawDebugEnabled()) return null
  const svg = container.querySelector('svg')
  if (!svg) return null

  const events: Array<{ type: 'added' | 'removed'; count: number; stack?: string }> = []
  let added = 0
  let removed = 0
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type !== 'childList') return
      const addedCount = countMainBarsFromNodes(mutation.addedNodes)
      if (addedCount > 0) {
        added += addedCount
        events.push({ type: 'added', count: addedCount, stack: new Error().stack })
      }
      const removedCount = countMainBarsFromNodes(mutation.removedNodes)
      if (removedCount > 0) {
        removed += removedCount
        events.push({ type: 'removed', count: removedCount, stack: new Error().stack })
      }
    })
  })
  observer.observe(svg, { childList: true, subtree: true })

  return {
    stop: () => {
      observer.disconnect()
      if (added === 0 && removed === 0) return
      console.warn('[draw:main-bar-recreated]', {
        operationLabel,
        added,
        removed,
        events: events.slice(0, 10),
      })
    },
  }
}

function createLiveDrawHandler(container: HTMLElement, chartType: ChartTypeValue | null) {
  switch (chartType) {
    case ChartType.SIMPLE_BAR:
      return new BarDrawHandler(container)
    case ChartType.GROUPED_BAR:
      return new GroupedBarDrawHandler(container)
    case ChartType.STACKED_BAR:
      return new StackedBarDrawHandler(container)
    case ChartType.SIMPLE_LINE:
      return new SimpleLineDrawHandler(container)
    case ChartType.MULTI_LINE:
      return new MultiLineDrawHandler(container)
    default:
      return null
  }
}

function shouldUseGenericDraw(op: DrawOp) {
  if (op.action === DrawAction.Line) {
    return !!op.line?.position && !op.line?.mode
  }
  if (op.action === DrawAction.Rect) {
    const mode = op.rect?.mode
    return mode === DrawRectModes.Normalized || (!!op.rect?.position && !!op.rect?.size)
  }
  if (op.action === DrawAction.Text) {
    const mode = op.text?.mode
    return mode === DrawTextModes.Normalized || (!!op.text?.position && !op.select)
  }
  return false
}

const resolveNextChartTypeFromDrawOps = (current: ChartTypeValue | null, operations: OperationSpec[]): ChartTypeValue | null => {
  let next = current
  operations.forEach((operation) => {
    if (operation.op !== OperationOp.Draw) return
    const action = (operation as DrawOp).action
    if (action === DrawAction.GroupedToStacked) next = ChartType.STACKED_BAR
    else if (action === DrawAction.StackedToGrouped) next = ChartType.GROUPED_BAR
    else if (action === DrawAction.GroupedToSimple) next = ChartType.SIMPLE_BAR
    else if (action === DrawAction.StackedToSimple) next = ChartType.SIMPLE_BAR
    else if (action === DrawAction.LineToBar) next = ChartType.SIMPLE_BAR
  })
  return next
}

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Canvas export produced no data'))
      }
    }, type)
  })

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = (event) => {
      const type = typeof event === 'string' ? event : event?.type ?? 'error'
      reject(new Error(`Failed to load exported image (${type})`))
    }
    image.src = src
  })

const getSvgDimensions = (svg: SVGSVGElement) => {
  const rect = svg.getBoundingClientRect()
  const widthAttr = svg.getAttribute('width')
  const heightAttr = svg.getAttribute('height')
  const attrWidth = widthAttr ? parseFloat(widthAttr) : NaN
  const attrHeight = heightAttr ? parseFloat(heightAttr) : NaN
  return {
    width: rect.width || (Number.isFinite(attrWidth) ? attrWidth : 0) || 1,
    height: rect.height || (Number.isFinite(attrHeight) ? attrHeight : 0) || 1,
  }
}

async function createPngBlobFromSvg(svg: SVGSVGElement, scale: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const { width, height } = getSvgDimensions(svg)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const serialized = new XMLSerializer().serializeToString(clone)
  const blob = new Blob(['<?xml version="1.0" encoding="utf-8"?>\n', serialized], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const exportWidth = Math.round(image.width * scale) || Math.max(1, Math.round(width * scale))
    const exportHeight = Math.round(image.height * scale) || Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = exportWidth
    canvas.height = exportHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas context not available for export')
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, exportWidth, exportHeight)
    ctx.drawImage(image, 0, 0, exportWidth, exportHeight)
    return canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createPngBlobFromCanvas(canvasEl: HTMLCanvasElement, scale: number) {
  const rect = canvasEl.getBoundingClientRect()
  const baseWidth = canvasEl.width || Math.round(rect.width) || 1
  const baseHeight = canvasEl.height || Math.round(rect.height) || 1
  const exportWidth = Math.round(baseWidth * scale)
  const exportHeight = Math.round(baseHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, exportWidth)
  canvas.height = Math.max(1, exportHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context not available for export')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(canvasEl, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas)
}

async function captureChartAsBlob(container: HTMLElement, scale: number) {
  const svg = container.querySelector('svg')
  if (svg instanceof SVGSVGElement) {
    return createPngBlobFromSvg(svg, scale)
  }

  const canvasEl = container.querySelector('canvas')
  if (canvasEl instanceof HTMLCanvasElement) {
    return createPngBlobFromCanvas(canvasEl, scale)
  }

  throw new Error('No SVG or canvas found inside the chart container')
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const toPlanStem = (value: string) => {
  const trimmed = value.trim().split('?')[0]
  const fileName = trimmed.split('/').filter((token) => token.length > 0).pop() ?? ''
  const stem = fileName.replace(/\.ts$/i, '').replace(/\.tsx$/i, '').replace(/\.py$/i, '')
  return stem.length > 0 ? stem : 'plan'
}

function ChartWorkbenchPage() {
  const [debugLogEmbedSpec, setDebugLogEmbedSpec] = useState(false)
  const [vlSpec, setVlSpec] = useState(vlSpecPlaceholder)
  const [builderGroups, setBuilderGroups] = useState<OperationSpec[][]>([])
  const [opsGroups, setOpsGroups] = useState<OperationSpec[][]>([])
  const [currentOpsIndex, setCurrentOpsIndex] = useState(-1)
  const [opsRunning, setOpsRunning] = useState(false)
  const [nlQuestion, setNlQuestion] = useState('')
  const [nlInput, setNlInput] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [nlError, setNlError] = useState<string | null>(null)
  const [nlWarnings, setNlWarnings] = useState<string[]>([])
  const [nlResolvedText, setNlResolvedText] = useState<string | null>(null)
  const [nlStatus, setNlStatus] = useState<string | null>(null)
  const [nlImportCommand, setNlImportCommand] = useState<{ id: string; jsonText: string } | null>(null)
  const [pythonDrawLoading, setPythonDrawLoading] = useState(false)
  const [pythonDrawStatus, setPythonDrawStatus] = useState<string | null>(null)
  const [pythonDrawError, setPythonDrawError] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)
  const nlImportSequenceRef = useRef(0)
  const currentSpecRef = useRef<VegaLiteSpec | null>(null)
  const [chartType, setChartType] = useState<ChartTypeValue | null>(null)
  const [opsErrors, setOpsErrors] = useState<Record<string, string>>({})
  const [opsValidationTick, setOpsValidationTick] = useState(0)
  const [lastValidatedTick, setLastValidatedTick] = useState(0)
  const [pendingRunOps, setPendingRunOps] = useState(false)
  const [optionSources, setOptionSources] = useState(getEmptyOptionSources)
  const [planPath, setPlanPath] = useState('')
  const [planGroups, setPlanGroups] = useState<OperationSpec[][] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [opsInputMode, setOpsInputMode] = useState<'json' | 'builder'>('json')
  const [opsJsonText, setOpsJsonText] = useState('{\n  "ops": []\n}')
  const [opsJsonError, setOpsJsonError] = useState<string | null>(null)
  const [opsJsonGroupNames, setOpsJsonGroupNames] = useState<string[]>([])
  const [opsJsonExecutionSource, setOpsJsonExecutionSource] = useState<OpsJsonExecutionSource | null>(null)
  const [opsJsonExecutionMode, setOpsJsonExecutionMode] = useState<'group' | 'sentence-step' | null>(null)
  const [opsJsonExecutionPlanSummary, setOpsJsonExecutionPlanSummary] = useState<string[]>([])
  const [opsJsonWarnings, setOpsJsonWarnings] = useState<string[]>([])
  const [opsJsonDrawPlan, setOpsJsonDrawPlan] = useState<Record<string, OperationSpec[]> | null>(null)
  const [opsJsonLogicalOpsSpec, setOpsJsonLogicalOpsSpec] = useState<Record<string, OperationSpec[]> | null>(null)
  const [opsJsonDataRows, setOpsJsonDataRows] = useState<Record<string, unknown>[] | null>(null)
  const [opsJsonExecutionPlanState, setOpsJsonExecutionPlanState] = useState<ExecutionPlan | undefined>(undefined)
  const [opsJsonVisualExecutionPlanState, setOpsJsonVisualExecutionPlanState] = useState<VisualExecutionPlan | undefined>(undefined)
  const [isVlSectionExpanded, setIsVlSectionExpanded] = useState(false)
  const [isNlSectionExpanded, setIsNlSectionExpanded] = useState(false)
  const [isOpsSectionExpanded, setIsOpsSectionExpanded] = useState(true)
  const [loadedPlanResolvedKey, setLoadedPlanResolvedKey] = useState<string | null>(null)
  const [loadedPlanStem, setLoadedPlanStem] = useState<string | null>(null)
  const [captureScenesEnabled, setCaptureScenesEnabled] = useState(false)
  const [captureScenesStatus, setCaptureScenesStatus] = useState<string | null>(null)
  const [captureScenesRunning, setCaptureScenesRunning] = useState(false)
  const opsSessionActiveRef = useRef(false)
  const visualPlaybackSurfaceRef = useRef<VisualSurfaceState>('unknown')
  const [drawRecordEnabled, setDrawRecordEnabled] = useState(false)
  const [recordQueue, setRecordQueue] = useState<Array<{ id: string; op: OperationSpec }>>([])
  const recordSequenceRef = useRef(0)
  const [interactionSession, dispatchInteractionSession] = useReducer(
    interactionSessionReducer,
    undefined,
    createEmptyInteractionSession,
  )
  const [selectedTimelineStepId, setSelectedTimelineStepId] = useState<string | null>(null)
  const [timelineRunning, setTimelineRunning] = useState(false)
  const [timelineStatusText, setTimelineStatusText] = useState<string>('')
  const timelineAbortRef = useRef<AbortController | null>(null)
  const [drawTool, setDrawTool] = useState<DrawInteractionTool>(DrawInteractionTools.None)
  const [drawHighlightColor, setDrawHighlightColor] = useState('#ef4444')
  const [drawDimOpacity, setDrawDimOpacity] = useState(0.25)
  const [drawTextValue, setDrawTextValue] = useState('Note')
  const [drawTextColor, setDrawTextColor] = useState('#111827')
  const [drawTextFontSize, setDrawTextFontSize] = useState(12)
  const [drawRectFill, setDrawRectFill] = useState('rgba(239,68,68,0.12)')
  const [drawRectStroke, setDrawRectStroke] = useState('#ef4444')
  const [drawRectStrokeWidth, setDrawRectStrokeWidth] = useState(1)
  const [drawRectOpacity, setDrawRectOpacity] = useState(1)
  const [drawLineStroke, setDrawLineStroke] = useState('#2563eb')
  const [drawLineStrokeWidth, setDrawLineStrokeWidth] = useState(2)
  const [drawLineOpacity, setDrawLineOpacity] = useState(1)
  const [drawLineArrowStart, setDrawLineArrowStart] = useState(false)
  const [drawLineArrowEnd, setDrawLineArrowEnd] = useState(false)
  const [drawLineTraceStartKey, setDrawLineTraceStartKey] = useState<string | null>(null)
  const [drawSegmentFill, setDrawSegmentFill] = useState('#ef4444')
  const [drawSegmentOpacity, setDrawSegmentOpacity] = useState(0.35)
  const [drawSegmentStroke, setDrawSegmentStroke] = useState('#ef4444')
  const [drawSegmentStrokeWidth, setDrawSegmentStrokeWidth] = useState(1)
  const [drawFilterMode, setDrawFilterMode] = useState<'include' | 'exclude'>('include')
  const [drawFilterInclude, setDrawFilterInclude] = useState<string[]>([])
  const [drawFilterExclude, setDrawFilterExclude] = useState<string[]>([])
  const [drawSeriesFilterMode, setDrawSeriesFilterMode] = useState<SeriesFilterMode>('include')
  const [drawSeriesSelection, setDrawSeriesSelection] = useState<string[]>([])
  const [drawSeriesChartId, setDrawSeriesChartId] = useState<string | undefined>(undefined)
  const [drawFocusedTarget, setDrawFocusedTarget] = useState<string>('')
  const [drawSplitGroupA, setDrawSplitGroupA] = useState<string[]>([])
  const [drawSplitGroupAId, setDrawSplitGroupAId] = useState('A')
  const [drawSplitGroupBId, setDrawSplitGroupBId] = useState('B')
  const [drawSplitOrientation, setDrawSplitOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [pendingTextPlacement, setPendingTextPlacement] = useState<{
    position: NormalizedPoint
    anchor: { x: number; y: number }
  } | null>(null)
  const textInputRef = useRef<HTMLInputElement | null>(null)
  const interactionStateRef = useRef<DrawInteractionControllerState>({
    enabled: true,
    tool: DrawInteractionTools.None,
    highlightColor: '#ef4444',
    dimOpacity: 0.25,
    rectStyle: {
      fill: 'rgba(239,68,68,0.12)',
      stroke: '#ef4444',
      strokeWidth: 1,
      opacity: 1,
    },
    lineStyle: {
      stroke: '#2563eb',
      strokeWidth: 2,
      opacity: 1,
    },
    lineArrow: {
      start: false,
      end: false,
    },
    segmentStyle: {
      fill: '#ef4444',
      opacity: 0.35,
      stroke: '#ef4444',
      strokeWidth: 1,
    },
  })
  const planModuleKeys = useMemo(() => Object.keys(OPS_PLAN_MODULES).sort(), [])
  const planOptions = useMemo(
    () =>
      planModuleKeys
        .map((key) => key.replace(/^\.\//, '').replace(/^\.\.\//, ''))
        .sort(),
    [planModuleKeys],
  )
  const recordEnabled = drawRecordEnabled && !planGroups
  const isBarChartType =
    chartType === ChartType.SIMPLE_BAR || chartType === ChartType.STACKED_BAR || chartType === ChartType.GROUPED_BAR
  const isGroupedOrStacked = chartType === ChartType.STACKED_BAR || chartType === ChartType.GROUPED_BAR
  const hasBuilderValidationErrors = !planGroups && opsInputMode === 'builder' && Object.keys(opsErrors).length > 0
  const isToolSupported = useCallback(
    (tool: DrawInteractionTool) => {
      if (!chartType) return false
      if (tool === DrawInteractionTools.SeriesFilter) {
        return chartType === ChartType.STACKED_BAR || chartType === ChartType.GROUPED_BAR
      }
      const action = DRAW_TOOL_ACTION_MAP[tool]
      if (!action) return true
      const decision = getRuntimeDrawSupportDecision(action, chartType)
      return decision.status !== 'unsupported'
    },
    [chartType],
  )

  useEffect(() => {
    interactionStateRef.current = {
      enabled: !opsRunning && chartType != null,
      tool: drawTool,
      highlightColor: drawHighlightColor,
      dimOpacity: drawDimOpacity,
      rectStyle: {
        fill: drawRectFill,
        stroke: drawRectStroke,
        strokeWidth: drawRectStrokeWidth,
        opacity: drawRectOpacity,
      },
      lineStyle: {
        stroke: drawLineStroke,
        strokeWidth: drawLineStrokeWidth,
        opacity: drawLineOpacity,
      },
      lineArrow: {
        start: drawLineArrowStart,
        end: drawLineArrowEnd,
      },
      segmentStyle: {
        fill: drawSegmentFill,
        opacity: drawSegmentOpacity,
        stroke: drawSegmentStroke,
        strokeWidth: drawSegmentStrokeWidth,
      },
    }
  }, [
    opsRunning,
    chartType,
    drawTool,
    drawHighlightColor,
    drawDimOpacity,
    drawRectFill,
    drawRectStroke,
    drawRectStrokeWidth,
    drawRectOpacity,
    drawLineStroke,
    drawLineStrokeWidth,
    drawLineOpacity,
    drawLineArrowStart,
    drawLineArrowEnd,
    drawSegmentFill,
    drawSegmentOpacity,
    drawSegmentStroke,
    drawSegmentStrokeWidth,
  ])

  useEffect(() => {
    if (drawTool !== DrawInteractionTools.Text) {
      setPendingTextPlacement(null)
    }
    if (drawTool !== DrawInteractionTools.LineTrace) {
      setDrawLineTraceStartKey(null)
    }
  }, [drawTool])

  useEffect(() => {
    if (drawTool === DrawInteractionTools.BarSegment && !isBarChartType) {
      setDrawTool(DrawInteractionTools.None)
      return
    }
    if (drawTool === DrawInteractionTools.SeriesFilter && !isGroupedOrStacked) {
      setDrawTool(DrawInteractionTools.None)
      return
    }
    const action = DRAW_TOOL_ACTION_MAP[drawTool]
    if (!chartType || !action) return
    const decision = getRuntimeDrawSupportDecision(action, chartType)
    if (decision.status === 'unsupported') {
      setDrawTool(DrawInteractionTools.None)
    }
  }, [drawTool, isBarChartType, isGroupedOrStacked, chartType])

  useEffect(() => {
    if (!pendingTextPlacement) return
    textInputRef.current?.focus()
    textInputRef.current?.select()
  }, [pendingTextPlacement])

  useEffect(() => {
    if (!selectedTimelineStepId) return
    const exists = interactionSession.steps.some((step) => step.id === selectedTimelineStepId)
    if (!exists) {
      setSelectedTimelineStepId(null)
    }
  }, [selectedTimelineStepId, interactionSession.steps])

  useEffect(
    () => () => {
      timelineAbortRef.current?.abort()
      timelineAbortRef.current = null
    },
    [],
  )

  useEffect(() => {
    setDrawLineTraceStartKey(null)
    setDrawFilterInclude([])
    setDrawFilterExclude([])
    setDrawSeriesSelection([])
    setDrawSeriesChartId(undefined)
    setDrawFocusedTarget('')
    setDrawSplitGroupA([])
  }, [chartType])

  useEffect(() => {
    if (!chartType) return
    let removed = 0
    const nextSteps = interactionSession.steps.map((step) => {
      if (step.kind !== TimelineStepKind.Draw || !step.enabled) return step
      const decision = getRuntimeDrawSupportDecision(step.op.action, chartType)
      if (decision.status !== 'unsupported') return step
      removed += 1
      return { ...step, enabled: false }
    })
    if (removed > 0) {
      dispatchInteractionSession({
        type: 'replace',
        session: { ...interactionSession, steps: nextSteps },
      })
      console.info(`[Timeline] Disabled ${removed} unsupported step(s) for chartType=${chartType}.`)
    }
  }, [chartType, interactionSession])

  const handleRecordHandled = useCallback((id: string, result: { accepted: boolean; reason?: string }) => {
    setRecordQueue((current) => current.filter((entry) => entry.id !== id))
    if (!result.accepted) {
      console.info(`[Record] Skipped: ${result.reason ?? 'unknown reason'}`)
    }
  }, [])

  const handleNlpImportHandled = useCallback((id: string, result: { accepted: boolean; reason?: string }) => {
    setNlImportCommand((current) => (current?.id === id ? null : current))
    if (!result.accepted) {
      setNlError(result.reason ?? 'Failed to apply converted opsSpec to OpsBuilder.')
      setNlStatus(null)
      return
    }
    setNlStatus('Converted opsSpec was applied to OpsBuilder.')
  }, [])

  const applyDrawOp = useCallback(
    async (
      operation: OperationSpec,
      options?: { recordTool?: DrawInteractionTool; skipRecord?: boolean },
    ) => {
      if (!chartRef.current) return
      const opWithMeta = withInteractionMeta(operation)
      try {
        assertDrawCapabilityForOp(chartType, opWithMeta)
      } catch (error) {
        console.warn('Skipped unsupported draw operation from interaction.', error)
        return
      }

      const drawOp = opWithMeta as DrawOp
      const action = drawOp.action
      if (STRUCTURAL_DRAW_ACTIONS.has(action)) {
        const currentSpec = currentSpecRef.current
        if (!currentSpec) {
          console.warn('Skipped draw operation: chart spec is not initialized.', drawOp)
          return
        }
        try {
          await runChartOps(chartRef.current, currentSpec, { ops: [drawOp] }, { initialRenderMode: 'reuse-existing' })
        } catch (error) {
          console.error('Failed to apply interaction draw operation via runner', error)
          throw error
        }
      } else {
        const handler = createLiveDrawHandler(chartRef.current, chartType)
        if (handler && !shouldUseGenericDraw(drawOp)) {
          handler.run(drawOp)
        } else {
          runGenericDraw(chartRef.current, drawOp)
        }
      }

      if (action === DrawAction.GroupedToStacked) {
        setChartType(ChartType.STACKED_BAR)
      } else if (action === DrawAction.StackedToGrouped) {
        setChartType(ChartType.GROUPED_BAR)
      } else if (action === DrawAction.GroupedToSimple || action === DrawAction.StackedToSimple) {
        setChartType(ChartType.SIMPLE_BAR)
      } else if (action === DrawAction.LineToBar) {
        setChartType(ChartType.SIMPLE_BAR)
      } else if (action === DrawAction.MultiLineToStacked) {
        setChartType(ChartType.STACKED_BAR)
      } else if (action === DrawAction.MultiLineToGrouped) {
        setChartType(ChartType.GROUPED_BAR)
      }
      if (currentSpecRef.current) {
        setOptionSources(
          collectOpsBuilderOptionSources({ container: chartRef.current, spec: currentSpecRef.current }),
        )
      }

      if (!recordEnabled || options?.skipRecord) return
      dispatchInteractionSession({
        type: 'appendDraw',
        op: drawOp,
        sourceTool: options?.recordTool ?? DrawInteractionTools.None,
        chartType,
        label: `${drawOp.action}`,
      })
    },
    [chartType, recordEnabled],
  )

  const handleHighlightPick = useCallback(
    (hit: DrawInteractionHit) => {
      void applyDrawOp(createHighlightOp(hit, interactionStateRef.current.highlightColor), {
        recordTool: DrawInteractionTools.Highlight,
      })
    },
    [applyDrawOp],
  )

  const handleDimPick = useCallback(
    (hit: DrawInteractionHit) => {
      void applyDrawOp(createDimOp(hit, interactionStateRef.current.dimOpacity), {
        recordTool: DrawInteractionTools.Dim,
      })
    },
    [applyDrawOp],
  )

  const handleLineTracePick = useCallback(
    (hit: DrawInteractionHit) => {
      const traceKey = hit.targetKey || hit.key
      if (!drawLineTraceStartKey) {
        setDrawLineTraceStartKey(traceKey)
        return
      }
      if (drawLineTraceStartKey === traceKey) {
        setDrawLineTraceStartKey(null)
        return
      }
      void applyDrawOp(createLineTraceOp(hit.chartId, drawLineTraceStartKey, traceKey), {
        recordTool: DrawInteractionTools.LineTrace,
      })
      setDrawLineTraceStartKey(null)
    },
    [applyDrawOp, drawLineTraceStartKey],
  )

  const handleFilterPick = useCallback(
    (hit: DrawInteractionHit) => {
      const filterKey = hit.targetKey || hit.key
      const nextInclude = new Set(drawFilterInclude)
      const nextExclude = new Set(drawFilterExclude)
      if (drawFilterMode === 'include') {
        if (nextInclude.has(filterKey)) nextInclude.delete(filterKey)
        else nextInclude.add(filterKey)
        nextExclude.delete(filterKey)
      } else {
        if (nextExclude.has(filterKey)) nextExclude.delete(filterKey)
        else nextExclude.add(filterKey)
        nextInclude.delete(filterKey)
      }

      const includeList = Array.from(nextInclude)
      const excludeList = Array.from(nextExclude)
      setDrawFilterInclude(includeList)
      setDrawFilterExclude(excludeList)

      void applyDrawOp(createFilterOp(hit.chartId, includeList, excludeList), {
        recordTool: DrawInteractionTools.Filter,
      })
    },
    [applyDrawOp, drawFilterExclude, drawFilterInclude, drawFilterMode],
  )

  const handleSplitPick = useCallback((hit: DrawInteractionHit) => {
    const splitKey = hit.targetKey || hit.key
    setDrawSplitGroupA((current) => {
      const next = new Set(current)
      if (next.has(splitKey)) next.delete(splitKey)
      else next.add(splitKey)
      return Array.from(next)
    })
  }, [])

  const handleApplySplit = useCallback(() => {
    const groupAId = drawSplitGroupAId.trim() || 'A'
    const groupBId = drawSplitGroupBId.trim() || 'B'
    if (!drawSplitGroupA.length) {
      console.info('[Draw Interaction] Split ignored: group A is empty.')
      return
    }
    void applyDrawOp(createSplitOp(groupAId, drawSplitGroupA, groupBId, drawSplitOrientation), {
      recordTool: DrawInteractionTools.Split,
    })
  }, [applyDrawOp, drawSplitGroupA, drawSplitGroupAId, drawSplitGroupBId, drawSplitOrientation])

  const handleApplyUnsplit = useCallback(() => {
    void applyDrawOp(createUnsplitOp(), { recordTool: DrawInteractionTools.Split })
  }, [applyDrawOp])

  const applySeriesFilterSelection = useCallback(
    async (chartId: string | undefined, series: string[], mode: SeriesFilterMode) => {
      const operation = createSeriesFilterOp(chartType, chartId, series, mode)
      if (!operation) return false
      await applyDrawOp(operation, { recordTool: DrawInteractionTools.SeriesFilter })
      return true
    },
    [applyDrawOp, chartType],
  )

  const handleSeriesFilterPick = useCallback(
    (hit: DrawInteractionHit) => {
      const seriesKey = hit.seriesKey?.trim()
      if (!seriesKey) return
      setDrawFocusedTarget(hit.targetKey || '')
      const resetForChartScope = drawSeriesChartId && drawSeriesChartId !== hit.chartId
      const next = new Set(resetForChartScope ? [] : drawSeriesSelection)
      if (next.has(seriesKey)) next.delete(seriesKey)
      else next.add(seriesKey)
      const nextSelection = Array.from(next)
      setDrawSeriesSelection(nextSelection)
      setDrawSeriesChartId(hit.chartId)
    },
    [drawSeriesChartId, drawSeriesSelection],
  )

  const handleApplySeriesFilter = useCallback(() => {
    const mode: SeriesFilterMode = drawSeriesSelection.length === 0 ? 'reset' : drawSeriesFilterMode
    void applySeriesFilterSelection(drawSeriesChartId, drawSeriesSelection, mode)
  }, [applySeriesFilterSelection, drawSeriesChartId, drawSeriesFilterMode, drawSeriesSelection])

  const handleResetSeriesFilter = useCallback(() => {
    setDrawSeriesSelection([])
    void applySeriesFilterSelection(drawSeriesChartId, [], 'reset')
  }, [applySeriesFilterSelection, drawSeriesChartId])

  const handleConvertGroupedToStacked = useCallback(() => {
    if (chartType !== ChartType.GROUPED_BAR) return
    void applyDrawOp(createGroupedToStackedOp(), { recordTool: DrawInteractionTools.SeriesFilter })
  }, [applyDrawOp, chartType])

  const handleConvertStackedToGrouped = useCallback(() => {
    if (chartType !== ChartType.STACKED_BAR) return
    void applyDrawOp(createStackedToGroupedOp(), { recordTool: DrawInteractionTools.SeriesFilter })
  }, [applyDrawOp, chartType])

  const handleConvertGroupedToSimple = useCallback(() => {
    if (chartType !== ChartType.GROUPED_BAR) return
    if (drawSeriesSelection.length !== 1) return
    void applyDrawOp(createGroupedToSimpleOp(drawSeriesSelection[0]), { recordTool: DrawInteractionTools.SeriesFilter })
  }, [applyDrawOp, chartType, drawSeriesSelection])

  const handleConvertStackedToSimple = useCallback(() => {
    if (chartType !== ChartType.STACKED_BAR) return
    if (drawSeriesSelection.length !== 1) return
    void applyDrawOp(createStackedToSimpleOp(drawSeriesSelection[0]), { recordTool: DrawInteractionTools.SeriesFilter })
  }, [applyDrawOp, chartType, drawSeriesSelection])

  const handleConvertMultiLineToStacked = useCallback(() => {
    if (chartType !== ChartType.MULTI_LINE) return
    void applyDrawOp(createMultiLineToStackedOp(), { recordTool: DrawInteractionTools.Convert })
  }, [applyDrawOp, chartType])

  const handleConvertMultiLineToGrouped = useCallback(() => {
    if (chartType !== ChartType.MULTI_LINE) return
    void applyDrawOp(createMultiLineToGroupedOp(), { recordTool: DrawInteractionTools.Convert })
  }, [applyDrawOp, chartType])

  const handleRunGroupedCompareMacro = useCallback(async () => {
    if (chartType !== ChartType.GROUPED_BAR || !chartRef.current) return
    const selectedSeries = drawSeriesSelection.slice(0, 2)
    if (selectedSeries.length < 2) {
      console.info('[Draw Interaction] Grouped compare macro requires two selected series.')
      return
    }
    const [leftSeries, rightSeries] = selectedSeries
    const stats = collectSeriesAggregates(chartRef.current, { chartId: drawSeriesChartId }).filter((entry) =>
      selectedSeries.includes(entry.series),
    )
    const left = stats.find((entry) => entry.series === leftSeries)
    const right = stats.find((entry) => entry.series === rightSeries)
    if (!left || !right) {
      console.info('[Draw Interaction] Grouped compare macro could not resolve visible series statistics.')
      return
    }
    const macroOps = createGroupedCompareMacroOps({
      chartId: drawSeriesChartId,
      leftSeries,
      rightSeries,
      leftAverage: left.average,
      rightAverage: right.average,
    })
    for (const operation of macroOps) {
      await applyDrawOp(operation, { recordTool: DrawInteractionTools.SeriesFilter })
    }
    setTimelineStatusText(`Applied grouped compare macro: ${leftSeries} vs ${rightSeries}.`)
  }, [applyDrawOp, chartType, drawSeriesChartId, drawSeriesSelection])

  const handleRunStackedCompositionMacro = useCallback(async () => {
    if (chartType !== ChartType.STACKED_BAR || !chartRef.current) return
    const target = drawFocusedTarget.trim()
    if (!target) {
      console.info('[Draw Interaction] Stacked composition macro requires a focused target.')
      return
    }
    const rows = collectTargetSeriesValues(chartRef.current, target, drawSeriesChartId)
    if (!rows.length) {
      console.info('[Draw Interaction] No visible stacked segments found for the focused target.')
      return
    }
    const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values())
    const total = uniqueRows.reduce((sum, row) => sum + Math.abs(row.value), 0)
    if (!Number.isFinite(total) || total <= 0) {
      console.info('[Draw Interaction] Stacked composition macro requires non-zero values.')
      return
    }
    const labels = uniqueRows.map((row) => ({
      id: row.id,
      series: row.series,
      percentage: (Math.abs(row.value) / total) * 100,
    }))
    const macroOps = createStackedCompositionLabelOps(drawSeriesChartId, labels)
    for (const operation of macroOps) {
      await applyDrawOp(operation, { recordTool: DrawInteractionTools.SeriesFilter })
    }
    setTimelineStatusText(`Applied stacked composition labels for target "${target}".`)
  }, [applyDrawOp, chartType, drawFocusedTarget, drawSeriesChartId])

  const handleTextPlacement = useCallback((position: NormalizedPoint, client: PointerClientPoint) => {
    if (!chartRef.current) return
    const hostRect = chartRef.current.getBoundingClientRect()
    setPendingTextPlacement({
      position,
      anchor: {
        x: client.x - hostRect.left,
        y: client.y - hostRect.top,
      },
    })
  }, [])

  const handleRectCommit = useCallback(
    (rectSpec: DrawRectSpec) => {
      void applyDrawOp(createRectOp(rectSpec), { recordTool: DrawInteractionTools.Rect })
    },
    [applyDrawOp],
  )

  const handleLineCommit = useCallback(
    (lineSpec: DrawLineSpec) => {
      void applyDrawOp(createLineOp(lineSpec), { recordTool: DrawInteractionTools.Line })
    },
    [applyDrawOp],
  )

  const handleBarSegmentCommit = useCallback(
    (segment: BarSegmentCommit) => {
      void applyDrawOp(
        createBarSegmentOp(segment, {
          fill: drawSegmentFill,
          opacity: drawSegmentOpacity,
          stroke: drawSegmentStroke,
          strokeWidth: drawSegmentStrokeWidth,
        }),
        { recordTool: DrawInteractionTools.BarSegment },
      )
    },
    [applyDrawOp, drawSegmentFill, drawSegmentOpacity, drawSegmentStroke, drawSegmentStrokeWidth],
  )

  const handleEscapeInteraction = useCallback(() => {
    if (pendingTextPlacement) {
      setPendingTextPlacement(null)
      return
    }
    if (drawLineTraceStartKey) {
      setDrawLineTraceStartKey(null)
      return
    }
    if (!chartRef.current) return
    const svg = d3.select(chartRef.current).select('svg')
    if (!svg.empty()) clearAnnotations(svg)
  }, [pendingTextPlacement, drawLineTraceStartKey])

  const commitPendingText = useCallback(() => {
    if (!pendingTextPlacement) return
    const value = drawTextValue.trim()
    if (!value) {
      setPendingTextPlacement(null)
      return
    }
    void applyDrawOp(
      createTextOp(
        value,
        pendingTextPlacement.position.x,
        pendingTextPlacement.position.y,
        drawTextColor,
        drawTextFontSize,
      ),
      { recordTool: DrawInteractionTools.Text },
    )
    setPendingTextPlacement(null)
  }, [pendingTextPlacement, drawTextValue, drawTextColor, drawTextFontSize, applyDrawOp])

  useEffect(() => {
    if (!chartRef.current) return
    const controller = createDrawInteractionController({
      container: chartRef.current,
      getState: () => interactionStateRef.current,
      onHighlightPick: handleHighlightPick,
      onDimPick: handleDimPick,
      onLineTracePick: handleLineTracePick,
      onFilterPick: handleFilterPick,
      onSplitPick: handleSplitPick,
      onSeriesFilterPick: handleSeriesFilterPick,
      onTextPlace: handleTextPlacement,
      onRectCommit: handleRectCommit,
      onLineCommit: handleLineCommit,
      onBarSegmentCommit: handleBarSegmentCommit,
      onEscape: handleEscapeInteraction,
    })
    return () => controller.dispose()
  }, [
    handleHighlightPick,
    handleDimPick,
    handleLineTracePick,
    handleFilterPick,
    handleSplitPick,
    handleSeriesFilterPick,
    handleTextPlacement,
    handleRectCommit,
    handleLineCommit,
    handleBarSegmentCommit,
    handleEscapeInteraction,
  ])

  const sanitizeJsonInput = (value: string) => {
    if (!value) return value
    let text = value
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    const normalized = text.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    const isBlankLine = (line: string) => line.trim() === ''
    const isMarkerLine = (line: string) => {
      const trimmed = line.trim()
      return trimmed === '---' || trimmed.startsWith('```')
    }

    let start = 0
    let end = lines.length

    const dropLeadingWhitespace = () => {
      while (start < end && isBlankLine(lines[start])) {
        start++
      }
    }
    const dropTrailingWhitespace = () => {
      while (start < end && isBlankLine(lines[end - 1])) {
        end--
      }
    }

    dropLeadingWhitespace()
    while (start < end && isMarkerLine(lines[start])) {
      start++
      dropLeadingWhitespace()
    }
    dropTrailingWhitespace()
    while (start < end && isMarkerLine(lines[end - 1])) {
      end--
      dropTrailingWhitespace()
    }

    return lines.slice(start, end).join('\n')
  }

  const parseOpsJsonInput = useCallback((): ParsedOpsJsonInput => {
    const sanitized = sanitizeJsonInput(opsJsonText).trim()
    if (!sanitized) {
      throw new Error('Ops JSON is empty.')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(sanitized)
    } catch (error) {
      throw new Error(`Invalid Ops JSON: ${error instanceof Error ? error.message : 'JSON parse failed.'}`)
    }

    const topLevelGroups = normalizeOpsGroupsForWorkbench(parsed)
    const topLevelGroupMap = toGroupMap(topLevelGroups)
    const parsedRecord = isPlainObject(parsed) ? parsed : null
    const warnings: string[] = []
    let executionPlan = normalizeExecutionPlan(parsedRecord?.execution_plan)
    let visualExecutionPlan = normalizeVisualExecutionPlan(parsedRecord?.visual_execution_plan)
    let drawPlanGroupMap: Record<string, OperationSpec[]> | undefined

    let selectedGroups = topLevelGroups
    let executionSource: OpsJsonExecutionSource = 'ops'
    let preferDrawGroupNames = false
    let drawPlanGroups: Array<{ name: string; ops: OperationSpec[] }> = []

    if (parsedRecord && Object.prototype.hasOwnProperty.call(parsedRecord, 'draw_plan')) {
      drawPlanGroups = normalizeOpsGroupsForWorkbench(parsedRecord.draw_plan)
      if (drawPlanGroups.length > 0) {
        drawPlanGroupMap = toGroupMap(drawPlanGroups)
      } else if (topLevelGroups.length > 0) {
        warnings.push('draw_plan detected but invalid; falling back to top-level ops groups.')
      } else {
        throw new Error('Ops JSON includes "draw_plan", but it has no executable groups.')
      }
    }

    if (visualExecutionPlan?.steps?.length && topLevelGroups.length > 0) {
      selectedGroups = topLevelGroups
      executionSource = 'visual_plan'
    } else if (drawPlanGroups.length > 0) {
      selectedGroups = drawPlanGroups
      executionSource = 'draw_plan'
      preferDrawGroupNames = true
    } else if (visualExecutionPlan?.steps?.length) {
      warnings.push('visual_execution_plan detected without logical ops groups; falling back to draw_plan/group order.')
    }

    if (!selectedGroups.length) {
      throw new Error('Ops JSON must include at least one executable group (e.g., "ops", "firstStep").')
    }

    if (parsedRecord && Object.prototype.hasOwnProperty.call(parsedRecord, 'execution_plan') && !executionPlan) {
      warnings.push('execution_plan detected but invalid; falling back to group-order execution.')
    }
    if (parsedRecord && Object.prototype.hasOwnProperty.call(parsedRecord, 'visual_execution_plan') && !visualExecutionPlan) {
      warnings.push('visual_execution_plan detected but invalid; execution summary will use execution_plan.')
    }
    const materialized = materializeExecutionGroups({
      opsSpec: toGroupMap(selectedGroups),
      executionPlan,
      visualExecutionPlan,
      preferDrawGroupNames,
    })

    return {
      groups: materialized.groups.map((group) => group.ops),
      groupNames: materialized.groups.map((group) => group.name),
      executionSource,
      executionMode: materialized.mode,
      opsSpecGroupMap: topLevelGroupMap,
      drawPlanGroupMap,
      executionPlan,
      visualExecutionPlan,
      warnings,
    }
  }, [opsJsonText])

  const renderChart = useCallback(
    async (specString: string): Promise<ChartTypeValue | null> => {
      const sanitizedSpec = sanitizeJsonInput(specString)
      let parsed: VegaLiteSpec
      try {
        parsed = JSON.parse(sanitizedSpec) as VegaLiteSpec
      } catch (error) {
        console.error('Failed to parse Vega-Lite spec JSON', error)
        alert('Invalid JSON')
        return null
      }

      if (!chartRef.current) {
        alert('Chart container is not ready.')
        return null
      }

      try {
        await renderChartDispatch(chartRef.current, parsed)
        currentSpecRef.current = parsed
        setPendingTextPlacement(null)
        const inferred = getChartType(parsed as VegaLiteSpec)
        setChartType(inferred)
        setOptionSources(collectOpsBuilderOptionSources({ container: chartRef.current, spec: parsed as VegaLiteSpec }))
        return inferred
      } catch (error) {
        // Rendering can fail even when JSON is valid (e.g., renderer post-processing/tagging errors).
        // Do not mislabel these failures as "Invalid JSON".
        console.error('Failed to render Vega-Lite spec', error)
        alert('Failed to render chart. Check the console for details.')
        return null
      }
    },
    []
  )

  const handleRenderChart = () => {
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    void renderChart(specString)
  }

  const handleOpsExportChange = (groups: OperationSpec[][], errors: Record<string, string>) => {
    setBuilderGroups(groups)
    setOpsErrors(errors)
    setLastValidatedTick(opsValidationTick)
  }

  const resolvePlanModuleKey = (input: string) => {
    const raw = input.trim()
    if (!raw) return null
    const withExt = raw.endsWith('.ts') ? raw : `${raw}.ts`
    const dataPath = withExt.startsWith('data/') ? `../${withExt}` : withExt
    const dotPath = dataPath.startsWith('./') ? dataPath : `./${dataPath}`
    if (dotPath in OPS_PLAN_MODULES) return dotPath
    if (dataPath in OPS_PLAN_MODULES) return dataPath
    if (withExt in OPS_PLAN_MODULES) return withExt
    const bySuffix = planModuleKeys.find((key) => key.endsWith(withExt))
    return bySuffix ?? null
  }

  const handleLoadPlan = async () => {
    if (!chartRef.current) return
    setPlanError(null)
    setCaptureScenesStatus(null)
    setLoadedPlanResolvedKey(null)
    setLoadedPlanStem(null)
    setOpsJsonDrawPlan(null)
    setOpsJsonLogicalOpsSpec(null)
    setOpsJsonDataRows(null)
    setOpsJsonExecutionPlanState(undefined)
    setOpsJsonVisualExecutionPlanState(undefined)
    visualPlaybackSurfaceRef.current = 'unknown'
    setPlanLoading(true)
    try {
      const trimmedPath = planPath.trim()
      if (!trimmedPath) {
        setPlanError('Plan path is empty.')
        return
      }

      if (trimmedPath.toLowerCase().endsWith('.py')) {
        const loaded = await runPythonPlan({ scenarioPath: trimmedPath })
        const normalized = normalizeOpsGroupsForWorkbench(loaded.drawPlan)
        if (!normalized.length) {
          setPlanError('Python scenario returned no executable draw operations.')
          return
        }

        const nextSpec = loaded.vegaLiteSpec
        await renderChartDispatch(chartRef.current, nextSpec)
        currentSpecRef.current = nextSpec
        setVlSpec(JSON.stringify(nextSpec, null, 2))
        setPendingTextPlacement(null)
        setPlanGroups(normalized.map((group) => group.ops))
        setLoadedPlanResolvedKey(loaded.scenarioPath)
        setLoadedPlanStem(toPlanStem(loaded.scenarioPath))
        setCurrentOpsIndex(-1)
        return
      }

      const resolvedKey = resolvePlanModuleKey(trimmedPath)
      if (!resolvedKey) {
        setPlanError('Plan file not found.')
        return
      }

      const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
      const sanitizedSpec = sanitizeJsonInput(specString)
      const parsedSpec = JSON.parse(sanitizedSpec) as VegaLiteSpec
      await renderChartDispatch(chartRef.current, parsedSpec)
      currentSpecRef.current = parsedSpec
      setPendingTextPlacement(null)
      const loader = OPS_PLAN_MODULES[resolvedKey]
      if (!loader) {
        setPlanError('Plan loader not found.')
        return
      }

      const module = (await loader()) as { default?: unknown }
      if (!module?.default) {
        setPlanError('Plan file must export default.')
        return
      }

      const groups = await runOpsPlan(chartRef.current, parsedSpec, module.default as any)
      if (!groups.length) {
        setPlanError('Plan produced no operations.')
        return
      }
      setPlanGroups(groups)
      setLoadedPlanResolvedKey(resolvedKey)
      setLoadedPlanStem(toPlanStem(resolvedKey))
      setCurrentOpsIndex(-1)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plan.'
      setPlanError(message)
    } finally {
      setPlanLoading(false)
    }
  }

  const handleClearPlan = () => {
    setPlanGroups(null)
    setPlanError(null)
    setLoadedPlanResolvedKey(null)
    setLoadedPlanStem(null)
    setCaptureScenesEnabled(false)
    setCaptureScenesStatus(null)
    setOpsJsonDrawPlan(null)
    setOpsJsonLogicalOpsSpec(null)
    setOpsJsonDataRows(null)
    setOpsJsonExecutionPlanState(undefined)
    setOpsJsonVisualExecutionPlanState(undefined)
    visualPlaybackSurfaceRef.current = 'unknown'
  }

  const handleConvertToOpsSpec = async () => {
    const text = nlInput.trim()
    if (!text) {
      setNlError('Natural language input is empty.')
      setNlStatus(null)
      return
    }

    const questionText = nlQuestion.trim() || text

    setNlLoading(true)
    setNlError(null)
    setNlStatus(null)
    setNlWarnings([])

    try {
      const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
      const sanitizedSpec = sanitizeJsonInput(specString)
      const parsedSpec = JSON.parse(sanitizedSpec) as VegaLiteSpec
      const result = await parseToOperationSpec({
        text,
        question: questionText,
        explanation: text,
        spec: parsedSpec,
        container: chartRef.current,
      })
      const nextOpsSpec = result.opsSpec
      if (!nextOpsSpec || !Array.isArray(nextOpsSpec.ops)) {
        throw new Error('Converted opsSpec is invalid: "ops" group is missing.')
      }
      const drawPlanNormalized = result.drawPlan ? normalizeOpsGroupsForWorkbench(result.drawPlan) : []
      const normalizedExecutionPlan = normalizeExecutionPlan(result.executionPlan as unknown)
      const normalizedVisualExecutionPlan = normalizeVisualExecutionPlan(result.visualExecutionPlan as unknown)
      const jsonText = JSON.stringify(nextOpsSpec, null, 2)
      const semanticMaterialized = normalizedVisualExecutionPlan?.steps?.length
        ? materializeExecutionGroups({
            opsSpec: nextOpsSpec,
            executionPlan: normalizedExecutionPlan,
            visualExecutionPlan: normalizedVisualExecutionPlan,
          })
        : null
      const drawMaterialized = result.drawPlan && !semanticMaterialized
        ? materializeExecutionGroups({
            opsSpec: result.drawPlan,
            executionPlan: normalizedExecutionPlan,
            visualExecutionPlan: normalizedVisualExecutionPlan,
            preferDrawGroupNames: true,
          })
        : null
      const groupNames = semanticMaterialized
        ? semanticMaterialized.groups.map((group) => group.name)
        : drawMaterialized
          ? drawMaterialized.groups.map((group) => group.name)
          : drawPlanNormalized.length
          ? drawPlanNormalized.map((group) => group.name)
          : Object.keys(nextOpsSpec)
      const executionSummary =
        summarizeVisualExecutionPlan(normalizedVisualExecutionPlan).length > 0
          ? summarizeVisualExecutionPlan(normalizedVisualExecutionPlan)
          : summarizeExecutionPlan(normalizedExecutionPlan)

      handleClearPlan()
      if (semanticMaterialized) {
        setPlanGroups(semanticMaterialized.groups.map((group) => group.ops))
        setOpsJsonExecutionSource('visual_plan')
        setOpsJsonExecutionMode(semanticMaterialized.mode)
        setOpsJsonExecutionPlanSummary(executionSummary)
      } else if (drawMaterialized) {
        setPlanGroups(drawMaterialized.groups.map((group) => group.ops))
        setOpsJsonExecutionSource('draw_plan')
        setOpsJsonExecutionMode(drawMaterialized.mode)
        setOpsJsonExecutionPlanSummary(executionSummary)
      } else if (drawPlanNormalized.length) {
        setPlanGroups(drawPlanNormalized.map((group) => group.ops))
        setOpsJsonExecutionSource('draw_plan')
        setOpsJsonExecutionMode('group')
        setOpsJsonExecutionPlanSummary(executionSummary)
      } else {
        setOpsJsonExecutionSource('ops')
        setOpsJsonExecutionMode('group')
        setOpsJsonExecutionPlanSummary(executionSummary)
      }
      setOpsJsonDrawPlan(result.drawPlan ? (result.drawPlan as Record<string, OperationSpec[]>) : null)
      setOpsJsonLogicalOpsSpec(nextOpsSpec as Record<string, OperationSpec[]>)
      setOpsJsonDataRows(await loadDataRowsForCompile(parsedSpec))
      setOpsJsonExecutionPlanState(normalizedExecutionPlan)
      setOpsJsonVisualExecutionPlanState(normalizedVisualExecutionPlan)
      visualPlaybackSurfaceRef.current = 'unknown'
      setOpsInputMode('builder')
      setOpsJsonText(jsonText)
      setOpsJsonError(null)
      setOpsJsonGroupNames(groupNames)
      setNlResolvedText(result.resolvedText || text)
      setNlWarnings(result.warnings ?? [])
      if (semanticMaterialized) {
        setNlStatus(
          `Converted ${Object.keys(nextOpsSpec).length} ops group(s), visual plan ${groupNames.length} sentence step(s): ${groupNames.join(', ')}`,
        )
      } else if (drawPlanNormalized.length) {
        setNlStatus(
          `Converted ${Object.keys(nextOpsSpec).length} ops group(s), draw_plan ${groupNames.length} group(s): ${groupNames.join(', ')}`,
        )
      } else {
        setNlStatus(`Converted ${groupNames.length} group(s): ${groupNames.join(', ')}`)
      }

      const importId = `nl-import-${Date.now()}-${nlImportSequenceRef.current++}`
      setNlImportCommand({ id: importId, jsonText })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to convert natural language to opsSpec.'
      setNlError(message)
      setNlResolvedText(null)
      setNlWarnings([])
      setNlImportCommand(null)
      setOpsJsonDrawPlan(null)
      setOpsJsonLogicalOpsSpec(null)
      setOpsJsonDataRows(null)
      setOpsJsonExecutionPlanState(undefined)
      setOpsJsonVisualExecutionPlanState(undefined)
      visualPlaybackSurfaceRef.current = 'unknown'
    } finally {
      setNlLoading(false)
    }
  }

  const handleApplyPythonDrawPlan = async () => {
    if (!chartRef.current) {
      setPythonDrawError('Chart container is not ready.')
      setPythonDrawStatus(null)
      return
    }
    const spec = currentSpecRef.current
    if (!spec) {
      setPythonDrawError('Render chart first before applying Python draw plan.')
      setPythonDrawStatus(null)
      return
    }

    setPythonDrawLoading(true)
    setPythonDrawError(null)
    setPythonDrawStatus(null)
    try {
      const loaded = await fetchLatestPythonDrawPlan()
      await runChartOps(chartRef.current, spec, { ops: loaded.ops }, { initialRenderMode: 'reuse-existing' })

      const nextType = resolveNextChartTypeFromDrawOps(chartType, loaded.ops)
      if (nextType !== chartType) {
        setChartType(nextType)
      }
      setOptionSources(collectOpsBuilderOptionSources({ container: chartRef.current, spec }))
      setPythonDrawStatus(
        `Applied ${loaded.ops.length} draw op(s) from ${loaded.path} (${loaded.groups.length} group(s)).`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply Python draw plan.'
      setPythonDrawError(message)
      setPythonDrawStatus(null)
    } finally {
      setPythonDrawLoading(false)
    }
  }

  const handleRunOperations = async () => {
    opsSessionActiveRef.current = false
    setPendingTextPlacement(null)
    if (chartRef.current) {
      const svg = d3.select(chartRef.current).select('svg')
      if (!svg.empty()) clearAnnotations(svg)
    }
    if (!planGroups && opsInputMode === 'json') {
      try {
        const parsed = parseOpsJsonInput()
        let nextGroups = parsed.groups
        let nextGroupNames = parsed.groupNames
        let nextExecutionSource: OpsJsonExecutionSource = parsed.executionSource
        let nextExecutionMode: 'group' | 'sentence-step' = parsed.executionMode
        let nextExecutionPlan = parsed.executionPlan
        let nextVisualExecutionPlan = parsed.visualExecutionPlan
        let nextDrawPlan: Record<string, OperationSpec[]> | null = parsed.drawPlanGroupMap ?? null
        let nextLogicalOpsSpec: Record<string, OperationSpec[]> | null = parsed.opsSpecGroupMap
        let nextDataRows: Record<string, unknown>[] | null = null
        const nextWarnings = [...parsed.warnings]

        if (parsed.executionSource === 'ops') {
          const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
          const sanitizedVlSpec = sanitizeJsonInput(specString)
          const parsedVlSpec = JSON.parse(sanitizedVlSpec) as VegaLiteSpec
          try {
            const dataRows = await loadDataRowsForCompile(parsedVlSpec)
            nextDataRows = dataRows
            const compiled = await compileOpsPlan({
              spec: parsedVlSpec,
              dataRows,
              opsSpec: parsed.opsSpecGroupMap,
            })
            nextWarnings.push(...(compiled.warnings ?? []))
            const compiledPlan = normalizeExecutionPlan(compiled.executionPlan as unknown)
            const compiledVisualPlan = normalizeVisualExecutionPlan(compiled.visualExecutionPlan as unknown)
            const semanticMaterialized = compiledVisualPlan?.steps?.length
              ? materializeExecutionGroups({
                  opsSpec: compiled.opsSpec,
                  executionPlan: compiledPlan,
                  visualExecutionPlan: compiledVisualPlan,
                })
              : null
            const compiledDrawGroups = compiled.drawPlan ? normalizeOpsGroupsForWorkbench(compiled.drawPlan) : []
            if (semanticMaterialized) {
              nextGroups = semanticMaterialized.groups.map((group) => group.ops)
              nextGroupNames = semanticMaterialized.groups.map((group) => group.name)
              nextExecutionMode = semanticMaterialized.mode
              nextExecutionSource = 'visual_plan'
              nextExecutionPlan = compiledPlan
              nextVisualExecutionPlan = compiledVisualPlan
              nextDrawPlan = compiled.drawPlan ? (compiled.drawPlan as Record<string, OperationSpec[]>) : null
              nextLogicalOpsSpec = compiled.opsSpec as Record<string, OperationSpec[]>
            } else if (compiledDrawGroups.length > 0) {
              const materialized = materializeExecutionGroups({
                opsSpec: compiled.drawPlan,
                executionPlan: compiledPlan,
                visualExecutionPlan: compiledVisualPlan,
                preferDrawGroupNames: true,
              })
              nextGroups = materialized.groups.map((group) => group.ops)
              nextGroupNames = materialized.groups.map((group) => group.name)
              nextExecutionMode = materialized.mode
              nextExecutionSource = 'draw_plan'
              nextExecutionPlan = compiledPlan
              nextVisualExecutionPlan = compiledVisualPlan
              nextDrawPlan = compiled.drawPlan ? (compiled.drawPlan as Record<string, OperationSpec[]>) : null
              nextLogicalOpsSpec = compiled.opsSpec as Record<string, OperationSpec[]>
            } else {
              nextWarnings.push('compile_ops_plan completed, but draw_plan is empty; using top-level ops execution.')
            }
          } catch (compileError) {
            const detail = compileError instanceof Error ? compileError.message : 'compile_ops_plan failed'
            nextWarnings.push(`compile_ops_plan failed; falling back to top-level ops groups. (${detail})`)
          }
        }

        setOpsJsonError(null)
        setOpsJsonGroupNames(nextGroupNames)
        setOpsJsonExecutionSource(nextExecutionSource)
        setOpsJsonExecutionMode(nextExecutionMode)
        const executionSummary =
          summarizeVisualExecutionPlan(nextVisualExecutionPlan).length > 0
            ? summarizeVisualExecutionPlan(nextVisualExecutionPlan)
            : summarizeExecutionPlan(nextExecutionPlan)
        setOpsJsonExecutionPlanSummary(executionSummary)
        setOpsJsonWarnings(nextWarnings)
        setOpsJsonDrawPlan(nextDrawPlan)
        setOpsJsonLogicalOpsSpec(nextLogicalOpsSpec)
        setOpsJsonDataRows(nextDataRows)
        setOpsJsonExecutionPlanState(nextExecutionPlan)
        setOpsJsonVisualExecutionPlanState(nextVisualExecutionPlan)
        visualPlaybackSurfaceRef.current = 'unknown'
        setOpsGroups(nextGroups)
        setCurrentOpsIndex(-1)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse Ops JSON.'
        setOpsJsonError(message)
        setOpsJsonExecutionSource(null)
        setOpsJsonExecutionMode(null)
        setOpsJsonExecutionPlanSummary([])
        setOpsJsonWarnings([])
        setOpsJsonDrawPlan(null)
        setOpsJsonLogicalOpsSpec(null)
        setOpsJsonDataRows(null)
        setOpsJsonExecutionPlanState(undefined)
        setOpsJsonVisualExecutionPlanState(undefined)
        visualPlaybackSurfaceRef.current = 'unknown'
        setOpsGroups([])
        setCurrentOpsIndex(-1)
        alert(message)
      }
      return
    }
    setPendingRunOps(true)
    setOpsValidationTick((value) => value + 1)
  }

  const executeOpsArray = async (
    opsArray: OperationSpec[],
    options?: {
      onOperationCompleted?: (event: { operation: OperationSpec; operationIndex: number }) => Promise<void> | void
      resetRuntime?: boolean
      runtimeScope?: string
      executionSpec?: VegaLiteSpec
    },
  ) => {
    if (!chartRef.current) return
    if (!opsArray.length) return
    setOpsJsonError(null)

    const runtimeScope = options?.runtimeScope ?? 'ops'
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    const sanitizedVlSpec = sanitizeJsonInput(specString)
    let parsedVlSpec: VegaLiteSpec

    try {
      parsedVlSpec = JSON.parse(sanitizedVlSpec) as VegaLiteSpec
    } catch (error) {
      console.error('Failed to parse Vega-Lite spec for operations', error)
      alert('Invalid Vega-Lite JSON')
      return
    }

    const drawOnlyGroup = isDrawOnlyGroup(opsArray)
    const hasSvg = !!chartRef.current.querySelector('svg')
    const currentSpec = currentSpecRef.current
    let executionSpec: VegaLiteSpec = options?.executionSpec ?? parsedVlSpec

    if (drawOnlyGroup) {
      if (!hasSvg || !currentSpec) {
        const message = 'Render Chart first for draw-only operations.'
        setOpsJsonError(message)
        alert(message)
        return
      }
      executionSpec = currentSpec
    } else {
      const hasSameSpec =
        currentSpec != null &&
        (() => {
          try {
            return JSON.stringify(currentSpec) === JSON.stringify(executionSpec)
          } catch {
            return false
          }
        })()
      if (!hasSvg || !hasSameSpec) {
        if (options?.executionSpec) {
          await renderChart(JSON.stringify(options.executionSpec, null, 2))
        } else {
          await renderChart(specString)
        }
      }
      executionSpec = currentSpecRef.current ?? executionSpec
    }

    if (!planGroups && opsInputMode === 'builder' && Object.keys(opsErrors).length > 0) {
      alert('Fix operation errors before running.')
      return
    }

    const opLabel = opsArray
      .filter((operation) => operation.op === OperationOp.Draw)
      .map((operation) => `${(operation as DrawOp).action}`)
      .join(',')
    const enableMutationTrace =
      drawOnlyGroup &&
      opsArray.some((operation) => isExecutableDrawOp(operation) && !STRUCTURAL_DRAW_ACTIONS.has(operation.action)) &&
      opLabel.length > 0
    const mutationTrace = enableMutationTrace ? createMainBarMutationTrace(chartRef.current, opLabel) : null

    try {
      setOpsRunning(true)
      await runChartOps(chartRef.current, executionSpec, { ops: opsArray }, {
        onOperationCompleted: options?.onOperationCompleted,
        runtimeScope,
        resetRuntime: options?.resetRuntime ?? !opsSessionActiveRef.current,
        initialRenderMode: 'reuse-existing',
      })
      opsSessionActiveRef.current = true
    } catch (error) {
      console.error('Run Operations failed', error)
      alert('Failed to run operations. Check the console for details.')
    } finally {
      mutationTrace?.stop()
      setOpsRunning(false)
    }
  }

  const renderSourceChartForVisualPlayback = useCallback(async () => {
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    const rendered = await renderChart(specString)
    if (!rendered) {
      throw new Error('Failed to render source chart for visual playback.')
    }
  }, [renderChart, vlSpec])

  const renderPlaybackChartForVisualPlayback = useCallback(
    async (spec: VegaLiteSpec) => {
      const rendered = await renderChart(JSON.stringify(spec, null, 2))
      if (!rendered) {
        throw new Error('Failed to render playback chart.')
      }
    },
    [renderChart],
  )

  const runVisualSentenceGroup = async (
    groupIndex: number,
    options?: {
      resetRuntime?: boolean
    },
  ): Promise<VisualSentencePlaybackResult | null> => {
    if (!chartRef.current) return null
    if (!opsJsonDrawPlan || !opsJsonVisualExecutionPlanState) return null
    try {
      const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
      const sanitizedVlSpec = sanitizeJsonInput(specString)
      const parsedVlSpec = JSON.parse(sanitizedVlSpec) as VegaLiteSpec

      const result = await runVisualExecutionPlan({
        container: chartRef.current,
        spec: parsedVlSpec,
        dataRows: opsJsonDataRows ?? undefined,
        logicalOpsSpec: opsJsonLogicalOpsSpec ?? undefined,
        drawPlan: opsJsonDrawPlan,
        executionPlan: opsJsonExecutionPlanState,
        visualExecutionPlan: opsJsonVisualExecutionPlanState,
        stepIndex: groupIndex,
        currentSurface: visualPlaybackSurfaceRef.current,
        resetRuntime: options?.resetRuntime ?? !opsSessionActiveRef.current,
        renderSourceChart: renderSourceChartForVisualPlayback,
        renderPlaybackChart: renderPlaybackChartForVisualPlayback,
        runOps: async (ops, runOptions) => {
          await executeOpsArray(ops, runOptions)
        },
      })

      visualPlaybackSurfaceRef.current = result.finalSurface
      opsSessionActiveRef.current = true
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run visual execution plan.'
      console.error('Visual execution plan failed', error)
      setOpsJsonError(message)
      alert(message)
      return null
    }
  }

  const runOpsGroup = async (
    groupIndex: number,
    options?: {
      onOperationCompleted?: (event: { operation: OperationSpec; operationIndex: number }) => Promise<void> | void
      resetRuntime?: boolean
      runtimeScope?: string
    },
  ) => {
    const opsArray = opsGroups[groupIndex] ?? []
    if (!opsArray.length) return
    return executeOpsArray(opsArray, {
      ...options,
      runtimeScope:
        options?.runtimeScope ??
        (opsJsonGroupNames[groupIndex] || (groupIndex === 0 ? 'ops' : `ops${groupIndex + 1}`)),
    })
  }

  const canUseVisualExecutionPlayer =
    opsJsonExecutionSource === 'visual_plan' &&
    !!opsJsonDrawPlan &&
    !!opsJsonVisualExecutionPlanState

  const handleStartOps = async () => {
    if (captureScenesEnabled && planGroups && !canUseVisualExecutionPlayer) {
      if (!chartRef.current) {
        alert('Chart container is not ready.')
        return
      }
      const stem = loadedPlanStem ?? toPlanStem(loadedPlanResolvedKey ?? planPath)
      let sceneIndex = 0
      const writer = createSceneCaptureWriter(triggerDownload)
      setCaptureScenesRunning(true)
      setCaptureScenesStatus('Preparing scene capture...')

      try {
        opsSessionActiveRef.current = false
        await writer.start(stem)
        for (let groupIndex = 0; groupIndex < opsGroups.length; groupIndex += 1) {
          await runOpsGroup(groupIndex, {
            resetRuntime: groupIndex === 0,
            runtimeScope: opsJsonGroupNames[groupIndex] || (groupIndex === 0 ? 'ops' : `ops${groupIndex + 1}`),
            onOperationCompleted: async ({ operation }) => {
              if (!chartRef.current) return
              sceneIndex += 1
              const blob = await captureChartAsBlob(chartRef.current, EXPORT_SCALE)
              await writer.write(sceneIndex, operation, blob)
              setCaptureScenesStatus(`Captured ${sceneIndex} scene(s)...`)
            },
          })
          setCurrentOpsIndex(groupIndex)
        }
        const finished = await writer.finish()
        setCaptureScenesStatus(`Saved ${sceneIndex} scene(s) to ${finished.label}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to capture scenes.'
        setCaptureScenesStatus(`Scene capture failed: ${message}`)
        alert(`Scene capture failed: ${message}`)
      } finally {
        setCaptureScenesRunning(false)
      }
      return
    }

    opsSessionActiveRef.current = false
    visualPlaybackSurfaceRef.current = 'unknown'
    if (canUseVisualExecutionPlayer) {
      await runVisualSentenceGroup(0, { resetRuntime: true })
    } else {
      await runOpsGroup(0, {
        resetRuntime: true,
        runtimeScope: opsJsonGroupNames[0] || 'ops',
      })
    }
    setCurrentOpsIndex(0)
  }

  const handleNextOps = async () => {
    const nextIndex = currentOpsIndex + 1
    if (nextIndex >= opsGroups.length) return
    if (canUseVisualExecutionPlayer) {
      await runVisualSentenceGroup(nextIndex, { resetRuntime: false })
    } else {
      await runOpsGroup(nextIndex, {
        resetRuntime: false,
        runtimeScope: opsJsonGroupNames[nextIndex] || (nextIndex === 0 ? 'ops' : `ops${nextIndex + 1}`),
      })
    }
    setCurrentOpsIndex(nextIndex)
  }

  const handlePrevOps = async () => {
    const prevIndex = currentOpsIndex - 1
    if (prevIndex < 0) return
    opsSessionActiveRef.current = false
    visualPlaybackSurfaceRef.current = 'unknown'
    for (let index = 0; index <= prevIndex; index += 1) {
      if (canUseVisualExecutionPlayer) {
        await runVisualSentenceGroup(index, { resetRuntime: index === 0 })
      } else {
        await runOpsGroup(index, {
          resetRuntime: index === 0,
          runtimeScope: opsJsonGroupNames[index] || (index === 0 ? 'ops' : `ops${index + 1}`),
        })
      }
    }
    setCurrentOpsIndex(prevIndex)
  }

  const handleDownloadChart = useCallback(async () => {
    if (!chartRef.current) {
      alert('Chart container is not ready.')
      return
    }

    try {
      const blob = await captureChartAsBlob(chartRef.current, EXPORT_SCALE)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      triggerDownload(blob, `chart-preview-${timestamp}.png`)
    } catch (error) {
      console.error('Failed to export chart as PNG', error)
      alert('Failed to generate PNG. Check the console for details.')
    }
  }, [])

  const handleClearDrawAnnotations = useCallback(() => {
    setPendingTextPlacement(null)
    if (!chartRef.current) return
    const svg = d3.select(chartRef.current).select('svg')
    if (svg.empty()) return
    clearAnnotations(svg)
  }, [])

  const timelineSteps = interactionSession.steps

  const runTimelineSteps = useCallback(
    async (steps: TimelineStep[]) => {
      if (!steps.length) return
      timelineAbortRef.current?.abort()
      const abortController = new AbortController()
      timelineAbortRef.current = abortController
      setTimelineRunning(true)
      setTimelineStatusText(`Running ${steps.length} step(s)...`)
      try {
        const result = await runTimeline(
          steps,
          async (step) => {
            if (step.kind !== TimelineStepKind.Draw) return
            await applyDrawOp(step.op, { skipRecord: true })
          },
          { signal: abortController.signal },
        )
        if (result.failed.length) {
          setTimelineStatusText(
            `Executed ${result.executed}/${result.total}, failed ${result.failed.length}.`,
          )
          console.warn('[Timeline] step execution failed', result.failed)
        } else {
          setTimelineStatusText(`Executed ${result.executed}/${result.total} step(s).`)
        }
      } finally {
        if (timelineAbortRef.current === abortController) {
          timelineAbortRef.current = null
        }
        setTimelineRunning(false)
      }
    },
    [applyDrawOp],
  )

  const handleRunTimelineAll = useCallback(() => {
    void runTimelineSteps(timelineSteps)
  }, [runTimelineSteps, timelineSteps])

  const handleRunTimelineOne = useCallback(
    (stepId: string) => {
      const step = timelineSteps.find((entry) => entry.id === stepId)
      if (!step) return
      void runTimelineSteps([step])
    },
    [runTimelineSteps, timelineSteps],
  )

  const handleStopTimeline = useCallback(() => {
    timelineAbortRef.current?.abort()
    timelineAbortRef.current = null
    setTimelineRunning(false)
    setTimelineStatusText('Timeline stopped.')
  }, [])

  const enqueueOpsBuilderRecordCommands = useCallback((opsList: OperationSpec[]) => {
    if (!opsList.length) return
    setRecordQueue((current) => [
      ...current,
      ...opsList.map((op, index) => ({
        id: `record-session-${Date.now()}-${recordSequenceRef.current++}-${index}`,
        op: cloneOperationForRecord(op),
      })),
    ])
  }, [])

  const copyText = useCallback(async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
    const temp = document.createElement('textarea')
    temp.value = value
    document.body.appendChild(temp)
    temp.select()
    document.execCommand('copy')
    temp.remove()
  }, [])

  const handleCopyTimelineJson = useCallback(async () => {
    const json = serializeSessionToJson(interactionSession, 2)
    await copyText(json)
    setTimelineStatusText('Copied timeline JSON.')
  }, [interactionSession, copyText])

  const handleCopyTimelineTs = useCallback(async () => {
    const source = serializeSessionToDslPlanSource(interactionSession)
    await copyText(source)
    setTimelineStatusText('Copied timeline TS (DSL).')
  }, [interactionSession, copyText])

  const handleAppendTimelineToOpsBuilder = useCallback(() => {
    const serialized = serializeSessionToOperationSpec(interactionSession)
    setOpsInputMode('builder')
    enqueueOpsBuilderRecordCommands(serialized.ops)
    setTimelineStatusText(`Queued ${serialized.ops.length} op(s) for OpsBuilder append.`)
  }, [enqueueOpsBuilderRecordCommands, interactionSession])

  useEffect(() => {
    void renderChart(vlSpecPlaceholder)
  }, [renderChart])

  useEffect(() => {
    ;(window as any).__WORKBENCH_VEGA_DEBUG__ = {
      ...(typeof (window as any).__WORKBENCH_VEGA_DEBUG__ === 'object' ? (window as any).__WORKBENCH_VEGA_DEBUG__ : {}),
      logEmbedSpec: debugLogEmbedSpec,
    }
  }, [debugLogEmbedSpec])

  useEffect(() => {
    if (!pendingRunOps || lastValidatedTick !== opsValidationTick) return
    if (!planGroups && opsInputMode === 'builder' && Object.keys(opsErrors).length > 0) {
      alert('Fix operation errors before running.')
      setPendingRunOps(false)
      return
    }
    const nextGroups = planGroups ?? builderGroups
    if (!nextGroups.length) {
      alert('No operations found.')
      setOpsGroups([])
      setCurrentOpsIndex(-1)
      setPendingRunOps(false)
      return
    }
    if (!planGroups && opsInputMode === 'builder') {
      setOpsJsonDrawPlan(null)
      setOpsJsonLogicalOpsSpec(null)
      setOpsJsonDataRows(null)
      setOpsJsonExecutionPlanState(undefined)
      setOpsJsonVisualExecutionPlanState(undefined)
      visualPlaybackSurfaceRef.current = 'unknown'
    }
    setOpsGroups(nextGroups)
    setCurrentOpsIndex(-1)
    opsSessionActiveRef.current = false
    setPendingRunOps(false)
  }, [pendingRunOps, opsErrors, builderGroups, planGroups, lastValidatedTick, opsValidationTick, opsInputMode])

  const vlCollapsedSummary = `Vega-Lite 입력 숨김 (${vlSpec.length} chars)`
  const nlCollapsedSummary = `NL 입력 숨김${nlQuestion ? ` · Q: ${nlQuestion}` : ''}`
  const opsCollapsedSummary = `Operations 입력 숨김 · mode=${opsInputMode}${planGroups ? ' · plan=loaded' : ''}`

  return (
    <div className="app-shell">
      <div className="layout-body">
        <section className="card ops-card">
          <div className="card-header">
            <label className="card-title" htmlFor="vl-spec">
              Vega-Lite Spec
            </label>
            <div className="card-actions">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={debugLogEmbedSpec}
                  onChange={(event) => setDebugLogEmbedSpec(event.target.checked)}
                  data-testid="debug-log-embed-spec-toggle"
                />
                Log embed spec
              </label>
              <button
                type="button"
                className="pill-btn"
                onClick={handleRenderChart}
                data-testid="render-chart-button"
              >
                Render Chart
              </button>
            </div>
            <button
              type="button"
              className="pill-btn section-toggle-btn"
              onClick={() => setIsVlSectionExpanded((current) => !current)}
              data-testid="toggle-vl-section"
            >
              {isVlSectionExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {isVlSectionExpanded ? (
            <textarea
              id="vl-spec"
              data-testid="vl-spec-input"
              placeholder={vlSpecPlaceholder}
              value={vlSpec}
              onChange={(event) => setVlSpec(event.target.value)}
            />
          ) : (
            <div className="section-collapsed-line">{vlCollapsedSummary}</div>
          )}
        </section>

        <section className="card ops-card nl-panel" data-testid="nl-panel">
          <div className="card-header">
            <label className="card-title" htmlFor="nl-input">
              Natural Language to OperationSpec
            </label>
            <div className="card-actions">
              <button
                type="button"
                className="pill-btn"
                onClick={() => void handleConvertToOpsSpec()}
                disabled={nlLoading || opsRunning}
                data-testid="nl-convert-button"
              >
                {nlLoading ? 'Converting…' : 'Convert to opsSpec'}
              </button>
              <button
                type="button"
                className="pill-btn"
                onClick={() => void handleApplyPythonDrawPlan()}
                disabled={pythonDrawLoading || nlLoading || opsRunning}
                data-testid="python-draw-apply-button"
              >
                {pythonDrawLoading ? 'Applying Draw…' : 'Apply Python Draw Plan'}
              </button>
              <button
                type="button"
                className="pill-btn section-toggle-btn"
                onClick={() => setIsNlSectionExpanded((current) => !current)}
                data-testid="toggle-nl-section"
              >
                {isNlSectionExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>
          {isNlSectionExpanded ? (
            <>
              <input
                className="nl-question"
                data-testid="nl-question"
                placeholder="Question"
                value={nlQuestion}
                onChange={(event) => setNlQuestion(event.target.value)}
              />
              <textarea
                id="nl-input"
                data-testid="nl-input"
                placeholder="Explanation"
                value={nlInput}
                onChange={(event) => setNlInput(event.target.value)}
              />
              {nlStatus ? (
                <div className="nl-status" data-testid="nl-status">
                  {nlStatus}
                </div>
              ) : null}
              {nlResolvedText ? (
                <div className="nl-resolved" data-testid="nl-resolved-text">
                  Resolved text: {nlResolvedText}
                </div>
              ) : null}
              {nlWarnings.length > 0 ? (
                <ul className="nl-warning-list" data-testid="nl-warning-list">
                  {nlWarnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {nlError ? (
                <div className="nl-error" data-testid="nl-error">
                  {nlError}
                </div>
              ) : null}
              {pythonDrawStatus ? (
                <div className="nl-status" data-testid="python-draw-status">
                  {pythonDrawStatus}
                </div>
              ) : null}
              {pythonDrawError ? (
                <div className="nl-error" data-testid="python-draw-error">
                  {pythonDrawError}
                </div>
              ) : null}
            </>
          ) : (
            <div className="section-collapsed-line">{nlCollapsedSummary}</div>
          )}
        </section>

        <section className="card ops-card">
          <div className="card-header">
            <div className="card-title">Operations</div>
            <div className="card-actions">
              {planGroups ? <div className="plan-badge">Plan mode</div> : null}
              <button
                type="button"
                className="pill-btn section-toggle-btn"
                onClick={() => setIsOpsSectionExpanded((current) => !current)}
                data-testid="toggle-ops-section"
              >
                {isOpsSectionExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>
          {isOpsSectionExpanded ? (
            <>
              <div className="plan-loader">
                <label className="plan-label" htmlFor="ops-plan-path">
                  OpsPlan
                </label>
                <input
                  id="ops-plan-path"
                  className="plan-input"
                  list="ops-plan-options"
                  placeholder="data/expert/e1/sample_python_plan_rain_sun.py or ... .ts"
                  value={planPath}
                  onChange={(event) => setPlanPath(event.target.value)}
                />
                <datalist id="ops-plan-options">
                  {planOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <button type="button" className="pill-btn" onClick={handleLoadPlan} disabled={planLoading}>
                  {planLoading ? 'Loading…' : 'Load'}
                </button>
                <button type="button" className="pill-btn" onClick={handleClearPlan} disabled={!planGroups && !planError}>
                  Clear
                </button>
              </div>
              <div className="plan-capture">
                <label className="plan-capture-label" htmlFor="capture-scenes-toggle">
                  <input
                    id="capture-scenes-toggle"
                    type="checkbox"
                    checked={captureScenesEnabled}
                    onChange={(event) => setCaptureScenesEnabled(event.target.checked)}
                    disabled={!planGroups || captureScenesRunning || opsRunning}
                  />
                  <span>Capture scenes while running plan</span>
                </label>
                {captureScenesStatus ? <div className="plan-capture-status">{captureScenesStatus}</div> : null}
              </div>
              {planError ? <div className="plan-error">{planError}</div> : null}
              <div className="ops-mode-toggle">
                <button
                  type="button"
                  className={`pill-btn ops-mode-btn ${opsInputMode === 'json' ? 'is-active' : ''}`}
                  onClick={() => setOpsInputMode('json')}
                >
                  JSON Ops (Default)
                </button>
                <button
                  type="button"
                  className={`pill-btn ops-mode-btn ${opsInputMode === 'builder' ? 'is-active' : ''}`}
                  onClick={() => setOpsInputMode('builder')}
                >
                  Visual Builder
                </button>
              </div>
              {opsInputMode === 'json' ? (
                <div className="ops-json-editor">
                  <label className="plan-label" htmlFor="ops-spec">
                    OpsSpec JSON
                  </label>
                  <textarea
                    id="ops-spec"
                    data-testid="ops-json-input"
                    value={opsJsonText}
                    onChange={(event) => {
                      setOpsJsonText(event.target.value)
                      setOpsJsonError(null)
                      setOpsJsonExecutionSource(null)
                      setOpsJsonExecutionMode(null)
                      setOpsJsonExecutionPlanSummary([])
                      setOpsJsonWarnings([])
                      setOpsJsonDrawPlan(null)
                      setOpsJsonLogicalOpsSpec(null)
                      setOpsJsonDataRows(null)
                      setOpsJsonExecutionPlanState(undefined)
                      setOpsJsonVisualExecutionPlanState(undefined)
                      visualPlaybackSurfaceRef.current = 'unknown'
                    }}
                  />
                  {opsJsonGroupNames.length > 0 ? (
                    <div className="nl-status">Detected groups: {opsJsonGroupNames.join(', ')}</div>
                  ) : null}
                  {opsJsonExecutionSource ? (
                    <div className="nl-status" data-testid="ops-json-status">
                      Execution source: {opsJsonExecutionSource}
                    </div>
                  ) : null}
                  {opsJsonExecutionMode ? <div className="nl-status">Execution mode: {opsJsonExecutionMode}</div> : null}
                  {opsJsonExecutionPlanSummary.length > 0 ? (
                    <ul className="nl-status-list" data-testid="ops-json-execution-plan">
                      {opsJsonExecutionPlanSummary.map((line, index) => (
                        <li key={`${line}-${index}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {opsJsonWarnings.length > 0 ? (
                    <ul className="nl-warning-list" data-testid="ops-json-warning-list">
                      {opsJsonWarnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  {opsJsonError ? <div className="plan-error">{opsJsonError}</div> : null}
                </div>
              ) : (
                <OpsBuilder
                  chartType={chartType}
                  onExportChange={handleOpsExportChange}
                  optionSources={optionSources}
                  validationTick={opsValidationTick}
                  recordCommand={recordQueue[0] ?? null}
                  onRecordHandled={handleRecordHandled}
                  importCommand={nlImportCommand}
                  onImportHandled={handleNlpImportHandled}
                />
              )}
              <div className="ops-runbar">
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleRunOperations}
                  disabled={captureScenesRunning || opsRunning || hasBuilderValidationErrors}
                >
                  Run Operations
                </button>
              </div>
            </>
          ) : (
            <div className="section-collapsed-line">{opsCollapsedSummary}</div>
          )}
        </section>

        <section className="card">
          <div className="card-header chart-header">
            <div className="card-title">Chart Preview</div>
            <div className="chart-header-center">
              {opsGroups.length > 0 && currentOpsIndex === -1 ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleStartOps}
                  disabled={captureScenesRunning || opsRunning || hasBuilderValidationErrors}
                >
                  Start
                </button>
              ) : null}
            </div>
            <div className="chart-header-right">
              <button type="button" className="pill-btn" onClick={handleDownloadChart}>
                Save as PNG
              </button>
            </div>
          </div>
          <div className="draw-toolbar">
            {DRAW_TOOL_OPTIONS.map((option) => {
              const disabled = opsRunning || chartType == null || !isToolSupported(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`pill-btn draw-tool-btn ${drawTool === option.value ? 'is-active' : ''}`}
                  onClick={() => setDrawTool(option.value)}
                  disabled={disabled}
                  data-testid={`draw-tool-${option.value}`}
                >
                  {option.label}
                </button>
              )
            })}
            <button
              type="button"
              className={`pill-btn draw-tool-btn ${recordEnabled ? 'is-active' : ''}`}
              onClick={() => setDrawRecordEnabled((value) => !value)}
              disabled={opsRunning || chartType == null || !!planGroups}
              data-testid="draw-record-toggle"
            >
              {recordEnabled ? 'Record: ON' : 'Record: OFF'}
            </button>
            <button
              type="button"
              className="pill-btn draw-tool-btn"
              onClick={handleClearDrawAnnotations}
              disabled={opsRunning || chartType == null}
              data-testid="draw-clear-annotations"
            >
              Clear Annotations
            </button>
          </div>

          {drawTool === DrawInteractionTools.Highlight ? (
            <div className="draw-options">
              <label htmlFor="draw-highlight-color">Color</label>
              <input
                id="draw-highlight-color"
                type="color"
                value={drawHighlightColor}
                onChange={(event) => setDrawHighlightColor(event.target.value)}
              />
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Dim ? (
            <div className="draw-options">
              <label htmlFor="draw-dim-opacity">Opacity</label>
              <input
                id="draw-dim-opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={drawDimOpacity}
                onChange={(event) => setDrawDimOpacity(Number(event.target.value))}
              />
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Text ? (
            <div className="draw-options">
              <label htmlFor="draw-text-value">Text</label>
              <input
                id="draw-text-value"
                type="text"
                value={drawTextValue}
                onChange={(event) => setDrawTextValue(event.target.value)}
              />
              <label htmlFor="draw-text-color">Color</label>
              <input
                id="draw-text-color"
                type="color"
                value={drawTextColor}
                onChange={(event) => setDrawTextColor(event.target.value)}
              />
              <label htmlFor="draw-text-size">Size</label>
              <input
                id="draw-text-size"
                type="number"
                min={8}
                max={72}
                step={1}
                value={drawTextFontSize}
                onChange={(event) => setDrawTextFontSize(Number(event.target.value))}
              />
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Rect ? (
            <div className="draw-options">
              <label htmlFor="draw-rect-fill">Fill</label>
              <input
                id="draw-rect-fill"
                type="text"
                value={drawRectFill}
                onChange={(event) => setDrawRectFill(event.target.value)}
              />
              <label htmlFor="draw-rect-stroke">Stroke</label>
              <input
                id="draw-rect-stroke"
                type="text"
                value={drawRectStroke}
                onChange={(event) => setDrawRectStroke(event.target.value)}
              />
              <label htmlFor="draw-rect-width">Stroke Width</label>
              <input
                id="draw-rect-width"
                type="number"
                min={1}
                max={12}
                step={1}
                value={drawRectStrokeWidth}
                onChange={(event) => setDrawRectStrokeWidth(Number(event.target.value))}
              />
              <label htmlFor="draw-rect-opacity">Opacity</label>
              <input
                id="draw-rect-opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={drawRectOpacity}
                onChange={(event) => setDrawRectOpacity(Number(event.target.value))}
              />
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Line ? (
            <div className="draw-options">
              <label htmlFor="draw-line-stroke">Stroke</label>
              <input
                id="draw-line-stroke"
                type="color"
                value={drawLineStroke}
                onChange={(event) => setDrawLineStroke(event.target.value)}
              />
              <label htmlFor="draw-line-width">Width</label>
              <input
                id="draw-line-width"
                type="number"
                min={1}
                max={12}
                step={1}
                value={drawLineStrokeWidth}
                onChange={(event) => setDrawLineStrokeWidth(Number(event.target.value))}
              />
              <label htmlFor="draw-line-opacity">Opacity</label>
              <input
                id="draw-line-opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={drawLineOpacity}
                onChange={(event) => setDrawLineOpacity(Number(event.target.value))}
              />
              <label htmlFor="draw-line-arrow-start">Arrow Start</label>
              <input
                id="draw-line-arrow-start"
                type="checkbox"
                checked={drawLineArrowStart}
                onChange={(event) => setDrawLineArrowStart(event.target.checked)}
              />
              <label htmlFor="draw-line-arrow-end">Arrow End</label>
              <input
                id="draw-line-arrow-end"
                type="checkbox"
                checked={drawLineArrowEnd}
                onChange={(event) => setDrawLineArrowEnd(event.target.checked)}
              />
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.LineTrace ? (
            <div className="draw-options">
              <div>
                Click two points in order to draw trace.
                {drawLineTraceStartKey ? ` Start: ${drawLineTraceStartKey}` : ' Start: (not selected)'}
              </div>
              <button
                type="button"
                className="pill-btn"
                onClick={() => setDrawLineTraceStartKey(null)}
              >
                Reset Start
              </button>
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Filter ? (
            <div className="draw-options">
              <label htmlFor="draw-filter-mode">Mode</label>
              <select
                id="draw-filter-mode"
                className="ops-input"
                value={drawFilterMode}
                onChange={(event) => setDrawFilterMode(event.target.value as 'include' | 'exclude')}
              >
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>
              <div>Include: {drawFilterInclude.length ? drawFilterInclude.join(', ') : '(empty)'}</div>
              <div>Exclude: {drawFilterExclude.length ? drawFilterExclude.join(', ') : '(empty)'}</div>
              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  setDrawFilterInclude([])
                  setDrawFilterExclude([])
                  void applyDrawOp(ops.draw.filter(undefined, draw.filterSpec.xInclude()), {
                    recordTool: DrawInteractionTools.Filter,
                  })
                }}
              >
                Reset Filter Selection
              </button>
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Split ? (
            <div className="draw-options">
              <label htmlFor="draw-split-group-a-id">Group A ID</label>
              <input
                id="draw-split-group-a-id"
                type="text"
                value={drawSplitGroupAId}
                onChange={(event) => setDrawSplitGroupAId(event.target.value)}
              />
              <label htmlFor="draw-split-group-b-id">Group B ID</label>
              <input
                id="draw-split-group-b-id"
                type="text"
                value={drawSplitGroupBId}
                onChange={(event) => setDrawSplitGroupBId(event.target.value)}
              />
              <label htmlFor="draw-split-orientation">Orientation</label>
              <select
                id="draw-split-orientation"
                className="ops-input"
                value={drawSplitOrientation}
                onChange={(event) => setDrawSplitOrientation(event.target.value as 'vertical' | 'horizontal')}
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
              <div>Group A Keys: {drawSplitGroupA.length ? drawSplitGroupA.join(', ') : '(empty)'}</div>
              <button type="button" className="pill-btn" onClick={handleApplySplit}>
                Apply Split
              </button>
              <button type="button" className="pill-btn" onClick={handleApplyUnsplit}>
                Unsplit
              </button>
              <button type="button" className="pill-btn" onClick={() => setDrawSplitGroupA([])}>
                Clear Group A
              </button>
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.SeriesFilter ? (
            <div className="draw-options">
              <label htmlFor="draw-series-filter-mode">Mode</label>
              <select
                id="draw-series-filter-mode"
                className="ops-input"
                value={drawSeriesFilterMode}
                onChange={(event) => setDrawSeriesFilterMode(event.target.value as SeriesFilterMode)}
              >
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>
              <div>Series: {drawSeriesSelection.length ? drawSeriesSelection.join(', ') : '(empty)'}</div>
              <div>Focused target: {drawFocusedTarget || '(not selected)'}</div>
              <button
                type="button"
                className="pill-btn"
                onClick={handleApplySeriesFilter}
                data-testid="draw-series-apply"
              >
                Apply Series Filter
              </button>
              <button
                type="button"
                className="pill-btn"
                onClick={handleResetSeriesFilter}
                data-testid="draw-series-reset"
              >
                Reset Series Filter
              </button>
              {chartType === ChartType.GROUPED_BAR ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleConvertGroupedToStacked}
                  data-testid="draw-series-convert-grouped"
                >
                  Convert to Stacked
                </button>
              ) : null}
              {chartType === ChartType.STACKED_BAR ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleConvertStackedToGrouped}
                  data-testid="draw-series-convert-stacked"
                >
                  Convert to Grouped
                </button>
              ) : null}
              {chartType === ChartType.GROUPED_BAR ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleConvertGroupedToSimple}
                  disabled={drawSeriesSelection.length !== 1}
                  data-testid="draw-series-convert-grouped-simple"
                >
                  Convert to Simple
                </button>
              ) : null}
              {chartType === ChartType.STACKED_BAR ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleConvertStackedToSimple}
                  disabled={drawSeriesSelection.length !== 1}
                  data-testid="draw-series-convert-stacked-simple"
                >
                  Convert to Simple
                </button>
              ) : null}
              {chartType === ChartType.GROUPED_BAR ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={() => {
                    void handleRunGroupedCompareMacro()
                  }}
                  disabled={drawSeriesSelection.length < 2}
                  data-testid="draw-series-grouped-compare"
                >
                  Compare Selected Series
                </button>
              ) : null}
              {chartType === ChartType.STACKED_BAR ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={() => {
                    void handleRunStackedCompositionMacro()
                  }}
                  disabled={!drawFocusedTarget}
                  data-testid="draw-series-stacked-composition"
                >
                  Label Target Composition
                </button>
              ) : null}
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.Convert ? (
            <div className="draw-options">
              {chartType === ChartType.MULTI_LINE ? (
                <>
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={handleConvertMultiLineToStacked}
                    data-testid="draw-convert-multiline-stacked"
                  >
                    Convert to Stacked Bar
                  </button>
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={handleConvertMultiLineToGrouped}
                    data-testid="draw-convert-multiline-grouped"
                  >
                    Convert to Grouped Bar
                  </button>
                </>
              ) : (
                <div className="nl-status">Convert tool is currently available for multi-line charts.</div>
              )}
            </div>
          ) : null}

          {drawTool === DrawInteractionTools.BarSegment ? (
            <div className="draw-options">
              <label htmlFor="draw-segment-fill">Fill</label>
              <input
                id="draw-segment-fill"
                type="color"
                value={drawSegmentFill}
                onChange={(event) => setDrawSegmentFill(event.target.value)}
              />
              <label htmlFor="draw-segment-opacity">Opacity</label>
              <input
                id="draw-segment-opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={drawSegmentOpacity}
                onChange={(event) => setDrawSegmentOpacity(Number(event.target.value))}
              />
              <label htmlFor="draw-segment-stroke">Stroke</label>
              <input
                id="draw-segment-stroke"
                type="text"
                value={drawSegmentStroke}
                onChange={(event) => setDrawSegmentStroke(event.target.value)}
              />
              <label htmlFor="draw-segment-width">Stroke Width</label>
              <input
                id="draw-segment-width"
                type="number"
                min={1}
                max={12}
                step={1}
                value={drawSegmentStrokeWidth}
                onChange={(event) => setDrawSegmentStrokeWidth(Number(event.target.value))}
              />
            </div>
          ) : null}

          <DrawTimelinePanel
            steps={timelineSteps}
            running={timelineRunning}
            selectedStepId={selectedTimelineStepId}
            onSelectStep={setSelectedTimelineStepId}
            onToggleStep={(id) => dispatchInteractionSession({ type: 'toggleStep', id })}
            onRemoveStep={(id) => dispatchInteractionSession({ type: 'removeStep', id })}
            onMoveStep={(id, direction) => dispatchInteractionSession({ type: 'moveStep', id, direction })}
            onRunAll={handleRunTimelineAll}
            onRunOne={handleRunTimelineOne}
            onStop={handleStopTimeline}
            onClear={() => {
              dispatchInteractionSession({ type: 'clear' })
              setSelectedTimelineStepId(null)
              setTimelineStatusText('Timeline cleared.')
            }}
            onInsertSleep={(seconds) =>
              dispatchInteractionSession({
                type: 'appendSleep',
                durationMs: Math.max(0, seconds) * 1000,
                label: `sleep ${seconds}s`,
              })
            }
            onCopyJson={() => {
              void handleCopyTimelineJson()
            }}
            onCopyTs={() => {
              void handleCopyTimelineTs()
            }}
            onAppendToBuilder={handleAppendTimelineToOpsBuilder}
            statusText={timelineStatusText}
          />

          <div className="chart-stage">
            <div className="chart-host" ref={chartRef} data-testid="chart-host" />
            {pendingTextPlacement && drawTool === DrawInteractionTools.Text ? (
              <input
                ref={textInputRef}
                className="draw-text-input-overlay"
                type="text"
                data-testid="draw-text-overlay-input"
                value={drawTextValue}
                style={{
                  left: pendingTextPlacement.anchor.x + 8,
                  top: pendingTextPlacement.anchor.y + 8,
                }}
                onChange={(event) => setDrawTextValue(event.target.value)}
                onBlur={commitPendingText}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitPendingText()
                    return
                  }
                  if (event.key === 'Escape') {
                    setPendingTextPlacement(null)
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ) : null}
          </div>
          {opsGroups.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
              {currentOpsIndex > 0 ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handlePrevOps}
                  disabled={opsRunning || hasBuilderValidationErrors}
                  style={{ marginLeft: 8 }}
                >
                  Prev
                </button>
              ) : null}
              {currentOpsIndex >= 0 && currentOpsIndex < opsGroups.length - 1 ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={handleNextOps}
                  disabled={opsRunning || hasBuilderValidationErrors}
                  style={{ marginLeft: 8 }}
                >
                  Next
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default ChartWorkbenchPage
