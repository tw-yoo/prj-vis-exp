import * as d3 from 'd3'
import { clearAnnotations, DEFAULT_ANNOTATION_SELECTORS } from '../../common/d3Helpers.ts'
import { resolveAnnotationKeyForDrawOp } from '../../draw/annotationKey.ts'
import { runGenericDraw } from '../../draw/genericDraw.ts'
import type { DrawOp } from '../../draw/types.ts'
import { DrawAction } from '../../draw/types.ts'
import { MIN_DRAW_DURATION_MS } from '../../draw/animationPolicy.ts'
import { DataAttributes, SvgAttributes } from '../../interfaces'
import { buildExecutionPhases } from '../common/timeline'

// Chart draw handlers already implement text/rect/line; generic fallback duplicates annotations.
const ACTIONS_REQUIRING_GENERIC = new Set<DrawAction>()
const STRUCTURAL_ACTIONS = new Set<DrawAction>([
  DrawAction.Clear,
  DrawAction.Filter,
  DrawAction.Sort,
  DrawAction.Split,
  DrawAction.Unsplit,
  DrawAction.Sum,
])
const CLEAR_ANNOTATIONS_BEFORE_ACTIONS = new Set<DrawAction>([
  DrawAction.Filter,
  DrawAction.StackedFilterGroups,
  DrawAction.GroupedFilterGroups,
])
const ANNOTATION_FADE_OUT_MS = 180
const ALL_CHART_SCOPE = '__all__'

type HandlerLike = {
  run: (op: DrawOp) => void | Promise<void>
}

type ReconcileState = {
  redundantOps: Set<DrawOp>
  keepKeysByScope: Map<string, Set<string>>
}

export type RunDrawPlanOptions<H extends HandlerLike> = {
  container: HTMLElement
  handler: H
  drawPlan: DrawOp[]
  clearBefore?: boolean
  svgSelector?: string
}

function chartScopeKey(chartId?: string) {
  return chartId ? `chart:${chartId}` : ALL_CHART_SCOPE
}

function addScopedKey(store: Map<string, Set<string>>, chartId: string | undefined, key: string) {
  const scope = chartScopeKey(chartId)
  const bucket = store.get(scope)
  if (bucket) {
    bucket.add(key)
    return
  }
  store.set(scope, new Set([key]))
}

function collectExistingAnnotationKeys(container: HTMLElement) {
  const out = new Map<string, Set<string>>()
  const nodes = Array.from(container.querySelectorAll<SVGElement>(`[${DataAttributes.AnnotationKey}]`))
  nodes.forEach((node) => {
    const rawKey = node.getAttribute(DataAttributes.AnnotationKey)
    if (!rawKey) return
    const key = rawKey.trim()
    if (!key) return
    const chartIdRaw = node.getAttribute(DataAttributes.ChartId)
    const chartId = chartIdRaw && chartIdRaw.trim().length > 0 ? chartIdRaw.trim() : undefined
    addScopedKey(out, chartId, key)
  })
  return out
}

function cloneScopedKeys(source: Map<string, Set<string>>) {
  const out = new Map<string, Set<string>>()
  source.forEach((values, scope) => {
    out.set(scope, new Set(values))
  })
  return out
}

function hasScopedKey(store: Map<string, Set<string>>, chartId: string | undefined, key: string) {
  if (chartId) {
    return Boolean(store.get(chartScopeKey(chartId))?.has(key) || store.get(ALL_CHART_SCOPE)?.has(key))
  }
  for (const values of store.values()) {
    if (values.has(key)) return true
  }
  return false
}

function collectKeepKeysForScope(store: Map<string, Set<string>>, chartId: string | undefined) {
  if (!chartId) {
    const all = new Set<string>()
    store.forEach((values) => {
      values.forEach((value) => all.add(value))
    })
    return all
  }
  const scoped = new Set<string>()
  const local = store.get(chartScopeKey(chartId))
  if (local) local.forEach((value) => scoped.add(value))
  const global = store.get(ALL_CHART_SCOPE)
  if (global) global.forEach((value) => scoped.add(value))
  return scoped
}

function buildReconcileState(container: HTMLElement, drawOps: DrawOp[]): ReconcileState {
  const existing = collectExistingAnnotationKeys(container)
  const known = cloneScopedKeys(existing)
  const redundantOps = new Set<DrawOp>()
  const keepKeysByScope = new Map<string, Set<string>>()

  drawOps.forEach((op) => {
    const key = resolveAnnotationKeyForDrawOp(op)
    if (!key) return
    if (hasScopedKey(known, op.chartId, key)) {
      redundantOps.add(op)
      addScopedKey(keepKeysByScope, op.chartId, key)
      return
    }
    addScopedKey(known, op.chartId, key)
  })

  return { redundantOps, keepKeysByScope }
}

function isInChartScope(node: Element, chartId: string | undefined) {
  if (!chartId) return true
  const nodeChartId = node.getAttribute(DataAttributes.ChartId)
  if (!nodeChartId) return false
  return nodeChartId === chartId
}

function fadeOutAnnotationsBeforeStructuralDraw(container: HTMLElement, op: DrawOp, state: ReconcileState) {
  if (!CLEAR_ANNOTATIONS_BEFORE_ACTIONS.has(op.action)) return Promise.resolve()

  const selectors = DEFAULT_ANNOTATION_SELECTORS.join(', ')
  const keepKeys = collectKeepKeysForScope(state.keepKeysByScope, op.chartId)
  const svgs = d3.select(container).selectAll<SVGSVGElement, unknown>('svg')
  const tasks: Array<Promise<void>> = []

  svgs.each(function () {
    const svg = d3.select(this as SVGSVGElement)
    const annotations = svg.selectAll<SVGElement, unknown>(selectors).filter(function () {
      const node = this as Element
      if (!isInChartScope(node, op.chartId)) return false
      const key = node.getAttribute(DataAttributes.AnnotationKey)
      if (!key) return true
      return !keepKeys.has(key)
    })
    if (annotations.empty()) return

    const task = annotations
      .interrupt()
      .transition()
      .duration(ANNOTATION_FADE_OUT_MS)
      .attr(SvgAttributes.Opacity, 0)
      .remove()
      .end()
      .then(() => undefined)
      .catch(() => {
        annotations.remove()
      })
    tasks.push(task)
  })

  return Promise.all(tasks).then(() => undefined)
}

function buildDrawPlanPhases(drawPlan: DrawOp[]): DrawOp[][] {
  const hasNodeId = drawPlan.some((op) => !!op.meta?.nodeId || typeof (op as { id?: unknown }).id === 'string')
  const hasInputs = drawPlan.some((op) => Array.isArray(op.meta?.inputs) && (op.meta?.inputs?.length ?? 0) > 0)
  if (!hasNodeId || !hasInputs) {
    return drawPlan.map((op) => [op])
  }

  const normalized: DrawOp[] = drawPlan.map((op, index) => {
    if (op.meta?.nodeId || typeof (op as { id?: unknown }).id === 'string') return op
    return { ...op, id: `draw_${index}` }
  })
  const topoPhases = buildExecutionPhases(normalized as any) as DrawOp[][]
  const out: DrawOp[][] = []
  topoPhases.forEach((phase) => {
    if (phase.length <= 1) {
      out.push(phase)
      return
    }
    let buffer: DrawOp[] = []
    const flush = () => {
      if (!buffer.length) return
      out.push(buffer)
      buffer = []
    }
    phase.forEach((op) => {
      if (STRUCTURAL_ACTIONS.has(op.action)) {
        flush()
        out.push([op])
        return
      }
      buffer.push(op)
    })
    flush()
  })
  return out
}

export async function runDrawPlan<H extends HandlerLike>(options: RunDrawPlanOptions<H>) {
  const { container, drawPlan, handler, clearBefore, svgSelector } = options
  if (!handler || !drawPlan || drawPlan.length === 0) return

  if (clearBefore) {
    const svgTarget = svgSelector ? d3.select(container).select(svgSelector) : d3.select(container).select('svg')
    if (!svgTarget.empty()) {
      clearAnnotations(svgTarget)
    }
  }

  const phases = buildDrawPlanPhases(drawPlan)
  const executionOrder = phases.flatMap((phase) => phase)
  const reconcileState = buildReconcileState(container, executionOrder)
  for (const phase of phases) {
    await Promise.all(
      phase.map(async (op) => {
        const startedAt = Date.now()
        if (!reconcileState.redundantOps.has(op)) {
          const annotationFade = fadeOutAnnotationsBeforeStructuralDraw(container, op, reconcileState)
          await Promise.all([handler.run(op), annotationFade])
          if (ACTIONS_REQUIRING_GENERIC.has(op.action ?? ('' as DrawAction))) {
            runGenericDraw(container, op as DrawOp)
          }
        }
        const elapsed = Date.now() - startedAt
        if (elapsed < MIN_DRAW_DURATION_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_DRAW_DURATION_MS - elapsed))
        }
      }),
    )
  }
}
