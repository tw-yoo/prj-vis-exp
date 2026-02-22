import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type React from 'react'
import '../../App.css'
import barSimpleSpecRaw from '../../../data/test/spec/bar_simple_ver.json?raw'
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
  createHighlightOp,
  createLineOp,
  createLineTraceOp,
  createRectOp,
  createSeriesFilterOp,
  createSplitOp,
  createStackedCompositionLabelOps,
  createStackedToGroupedOp,
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
import { browserEngine } from '../../engine/createBrowserEngine'
import OpsBuilder from '../opsBuilder/OpsBuilder'
import DrawTimelinePanel from '../components/DrawTimelinePanel'

const vlSpecPlaceholder = barSimpleSpecRaw
// const vlSpecPlaceholder = lineSimpleSpecRaw

const EXPORT_SCALE = 3
const renderChartDispatch = browserEngine.renderChart
const runChartOps = browserEngine.runChartOps
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

const withInteractionMeta = (operation: OperationSpec): OperationSpec => ({
  ...operation,
  meta: {
    ...((operation as { meta?: Record<string, unknown> }).meta ?? {}),
    source: 'interaction',
  },
})

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

function ChartWorkbenchPage() {
  const [vlSpec, setVlSpec] = useState(vlSpecPlaceholder)
  const [builderGroups, setBuilderGroups] = useState<OperationSpec[][]>([])
  const [opsGroups, setOpsGroups] = useState<OperationSpec[][]>([])
  const [currentOpsIndex, setCurrentOpsIndex] = useState(-1)
  const [opsRunning, setOpsRunning] = useState(false)
  const chartRef = useRef<HTMLDivElement | null>(null)
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
      const actionsRequiringRunner = new Set<DrawAction>([
        DrawAction.Split,
        DrawAction.Unsplit,
        DrawAction.Filter,
        DrawAction.LineToBar,
        DrawAction.StackedToGrouped,
        DrawAction.GroupedToStacked,
        DrawAction.StackedFilterGroups,
        DrawAction.GroupedFilterGroups,
        DrawAction.Sum,
      ])

      if (actionsRequiringRunner.has(action)) {
        const currentSpec = currentSpecRef.current
        if (!currentSpec) {
          console.warn('Skipped draw operation: chart spec is not initialized.', drawOp)
          return
        }
        try {
          await runChartOps(chartRef.current, currentSpec, { ops: [drawOp] })
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
      } else if (action === DrawAction.LineToBar) {
        setChartType(ChartType.SIMPLE_BAR)
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

  const renderChart = useCallback(
    async (specString: string): Promise<ChartTypeValue | null> => {
      try {
        const sanitizedSpec = sanitizeJsonInput(specString)
        const parsed = JSON.parse(sanitizedSpec) as VegaLiteSpec
        if (!chartRef.current) {
          alert('Chart container is not ready.')
          return null
        }
        await renderChartDispatch(chartRef.current, parsed)
        currentSpecRef.current = parsed
        setPendingTextPlacement(null)
        const inferred = getChartType(parsed as VegaLiteSpec)
        setChartType(inferred)
        setOptionSources(collectOpsBuilderOptionSources({ container: chartRef.current, spec: parsed as VegaLiteSpec }))
        return inferred
      } catch (error) {
        console.error('Failed to parse Vega-Lite spec', error)
        alert('Invalid JSON')
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
    const resolvedKey = resolvePlanModuleKey(planPath)
    if (!resolvedKey) {
      setPlanError('Plan file not found.')
      return
    }
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    setPlanLoading(true)
    try {
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
  }

  const handleRunOperations = () => {
    setPendingTextPlacement(null)
    if (chartRef.current) {
      const svg = d3.select(chartRef.current).select('svg')
      if (!svg.empty()) clearAnnotations(svg)
    }
    setPendingRunOps(true)
    setOpsValidationTick((value) => value + 1)
  }

  const runOpsGroup = async (groupIndex: number) => {
    if (!chartRef.current) return
    const opsArray = opsGroups[groupIndex] ?? []
    if (!opsArray.length) return
    const specString = vlSpec.trim() === '' ? vlSpecPlaceholder : vlSpec
    await renderChart(specString)
    const sanitizedVlSpec = sanitizeJsonInput(specString)
    let parsedVlSpec: VegaLiteSpec

    try {
      parsedVlSpec = JSON.parse(sanitizedVlSpec) as VegaLiteSpec
    } catch (error) {
      console.error('Failed to parse Vega-Lite spec for operations', error)
      alert('Invalid Vega-Lite JSON')
      return
    }

    if (Object.keys(opsErrors).length > 0) {
      alert('Fix operation errors before running.')
      return
    }

    try {
      setOpsRunning(true)
      await runChartOps(chartRef.current, parsedVlSpec, { ops: opsArray })
    } catch (error) {
      console.error('Run Operations failed', error)
      alert('Failed to run operations. Check the console for details.')
    } finally {
      setOpsRunning(false)
    }
  }

  const handleStartOps = async () => {
    await runOpsGroup(0)
    setCurrentOpsIndex(0)
  }

  const handleNextOps = async () => {
    const nextIndex = currentOpsIndex + 1
    if (nextIndex >= opsGroups.length) return
    await runOpsGroup(nextIndex)
    setCurrentOpsIndex(nextIndex)
  }

  const handlePrevOps = async () => {
    const prevIndex = currentOpsIndex - 1
    if (prevIndex < 0) return
    await runOpsGroup(prevIndex)
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
    enqueueOpsBuilderRecordCommands(serialized.ops)
    setTimelineStatusText(`Queued ${serialized.ops.length} op(s) for OpsBuilder append.`)
  }, [enqueueOpsBuilderRecordCommands, interactionSession])

  useEffect(() => {
    void renderChart(vlSpecPlaceholder)
  }, [renderChart])

  useEffect(() => {
    if (!pendingRunOps || lastValidatedTick !== opsValidationTick) return
    if (!planGroups && Object.keys(opsErrors).length > 0) {
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
    setOpsGroups(nextGroups)
    setCurrentOpsIndex(-1)
    setPendingRunOps(false)
  }, [pendingRunOps, opsErrors, builderGroups, planGroups, lastValidatedTick, opsValidationTick])

  return (
    <div className="app-shell">
      <div className="layout-body">
        <section className="card ops-card">
          <div className="card-header">
            <label className="card-title" htmlFor="vl-spec">
              Vega-Lite Spec
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
          <textarea
            id="vl-spec"
            data-testid="vl-spec-input"
            placeholder={vlSpecPlaceholder}
            value={vlSpec}
            onChange={(event) => setVlSpec(event.target.value)}
          />
        </section>

        <section className="card ops-card">
          <div className="card-header">
            <div className="card-title">Operations</div>
            {planGroups ? <div className="plan-badge">Plan mode</div> : null}
          </div>
          <div className="plan-loader">
            <label className="plan-label" htmlFor="ops-plan-path">
              OpsPlan
            </label>
            <input
              id="ops-plan-path"
              className="plan-input"
              list="ops-plan-options"
              placeholder="data/expert/e1/1_bar_simple_a_0o12tngadmjjux2n.ts"
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
          {planError ? <div className="plan-error">{planError}</div> : null}
          <OpsBuilder
            chartType={chartType}
            onExportChange={handleOpsExportChange}
            optionSources={optionSources}
            validationTick={opsValidationTick}
            recordCommand={recordQueue[0] ?? null}
            onRecordHandled={handleRecordHandled}
          />
          <div className="ops-runbar">
            <button
              type="button"
              className="pill-btn"
              onClick={handleRunOperations}
              disabled={opsRunning || (!planGroups && Object.keys(opsErrors).length > 0)}
            >
              Run Operations
            </button>
          </div>
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
                  disabled={opsRunning || (!planGroups && Object.keys(opsErrors).length > 0)}
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
                  disabled={opsRunning || Object.keys(opsErrors).length > 0}
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
                  disabled={opsRunning || Object.keys(opsErrors).length > 0}
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
