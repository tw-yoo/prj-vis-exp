import type * as d3 from 'd3'
import type { ChartContext } from '../rendering/common/d3Helpers'
import {
  chartTransformPrimitive,
  differenceArrowPrimitive,
  markSaliencePrimitive,
  referenceLinePrimitive,
  textAnnotationPrimitive,
  type PrimitiveCall,
  type PrimitiveImpl,
} from '../rendering/primitives'
import type { VisualizationFrame } from './visualizationFrame'

type PrimitiveRegistry = Record<string, PrimitiveImpl<unknown>>

const PRIMITIVES: PrimitiveRegistry = {
  f1: referenceLinePrimitive as PrimitiveImpl<unknown>,
  f2: differenceArrowPrimitive as PrimitiveImpl<unknown>,
  f3: markSaliencePrimitive as PrimitiveImpl<unknown>,
  f4: chartTransformPrimitive as PrimitiveImpl<unknown>,
  f5: textAnnotationPrimitive as PrimitiveImpl<unknown>,
}

/** Renders declarative frame transitions by diffing primitive semantic keys. */
export async function renderFrameTransition(
  prev: VisualizationFrame | null,
  next: VisualizationFrame,
  ctx: ChartContext,
): Promise<void> {
  const svg = ctx.svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>
  const prevPrimitives = new Map((prev?.primitives ?? []).map((primitive) => [primitive.semanticKey, primitive]))
  const nextPrimitives = new Map(next.primitives.map((primitive) => [primitive.semanticKey, primitive]))
  const removals: Promise<void>[] = []
  const applications: Promise<void>[] = []

  for (const [semanticKey, primitive] of prevPrimitives) {
    if (nextPrimitives.has(semanticKey)) continue
    const impl = primitiveImpl(primitive)
    if (impl) removals.push(impl.remove(svg, semanticKey))
  }

  for (const [semanticKey, primitive] of nextPrimitives) {
    const impl = primitiveImpl(primitive)
    if (!impl) continue
    const previous = prevPrimitives.get(semanticKey)
    if (!previous) {
      applications.push(impl.apply(svg, primitive.params, ctx, true))
      continue
    }
    const status = impl.diff(previous.params, primitive.params)
    if (status === 'identical') continue
    if (status === 'replaced') {
      removals.push(impl.remove(svg, semanticKey))
      applications.push(impl.apply(svg, primitive.params, ctx, true))
      continue
    }
    applications.push(impl.apply(svg, primitive.params, ctx, true))
  }

  await Promise.all(removals)
  await Promise.all(applications)
  applyAxisTitles(prev, next, ctx)
}

function primitiveImpl(call: PrimitiveCall): PrimitiveImpl<unknown> | null {
  const family = call.semanticKey.split(':', 1)[0]
  return PRIMITIVES[family] ?? null
}

function applyAxisTitles(prev: VisualizationFrame | null, next: VisualizationFrame, ctx: ChartContext) {
  const svg = ctx.svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>
  if (prev?.axes.x.title !== next.axes.x.title && next.axes.x.title != null) {
    svg.select<SVGTextElement>('.x-axis-label').text(next.axes.x.title)
  }
  if (prev?.axes.y.title !== next.axes.y.title && next.axes.y.title != null) {
    svg.select<SVGTextElement>('.y-axis-label').text(next.axes.y.title)
  }
}
