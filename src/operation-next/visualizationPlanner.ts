import { ChartType, type ChartTypeValue } from '../domain/chart'
import { OperationOp, type DataOpResult } from '../domain/operation/types'
import {
  chartTransformSemanticKey,
  differenceArrowSemanticKey,
  markSalienceSemanticKey,
  referenceLineSemanticKey,
  selectTransformation,
  type ChartTransformParams,
  type DifferenceArrowParams,
  type ReferenceLineParams,
} from '../rendering/primitives'
import { createVisualizationFrame, type VisualizationFrame } from './visualizationFrame'
import type { OperationNode } from './operationTree'
import { DEFAULT_POLICY, resolveFrameConfig, type TensionPolicy } from './tensionPolicy'

/** Builds declarative visualization frames from an operation dependency tree. */
export function planFrames(
  tree: OperationNode[],
  results: Map<string, DataOpResult>,
  chartType: ChartTypeValue,
  policy: TensionPolicy = DEFAULT_POLICY,
): VisualizationFrame[] {
  const frames: VisualizationFrame[] = []
  const emittedPrimitiveKeys = new Set<string>()

  tree.forEach((node) => {
    const transform = selectTransformation(chartType, node.op.op)
    if (transform) {
      const transformFrame = createVisualizationFrame({
        id: `frame_transform_before_${node.id}`,
        phase: 'transformation',
        chartContext: { chartType },
        config: resolveFrameConfig(policy, node, chartType),
      })
      const params: ChartTransformParams = {
        from: chartType,
        to: transformedChartType(chartType, transform),
        withTransition: true,
      }
      pushPrimitive(transformFrame, emittedPrimitiveKeys, {
        semanticKey: chartTransformSemanticKey(params),
        params,
      })
      transformFrame.derivedFrom.push({ opNodeId: node.id, role: 'context' })
      frames.push(transformFrame)
    }

    const frame = createVisualizationFrame({
      id: `frame_after_${node.id}`,
      phase: phaseForNode(node),
      chartContext: { chartType },
      config: resolveFrameConfig(policy, node, chartType),
    })
    frame.derivedFrom.push({ opNodeId: node.id, role: 'compute' })

    const rows = results.get(node.id) ?? []
    const firstValue = Number(rows[0]?.value)
    if (shouldPrependReference(node)) {
      const params: ReferenceLineParams = {
        y: Number.isFinite(firstValue) ? firstValue : 0,
        scope: { kind: 'full' },
        style: 'solid',
        label: rows[0]?.name ? { text: String(rows[0].name), align: 'end' } : undefined,
      }
      pushPrimitive(frame, emittedPrimitiveKeys, {
        semanticKey: referenceLineSemanticKey(params),
        params,
      })
    }

    if (node.category === 'binary') {
      const params: DifferenceArrowParams = {
        y1: 0,
        y2: Number.isFinite(firstValue) ? firstValue : 0,
        placement: frame.config.arrowPlacement,
        arrowHead: 'double',
        label: { text: rows[0]?.name ?? 'difference', position: 'mid' },
      }
      pushPrimitive(frame, emittedPrimitiveKeys, {
        semanticKey: differenceArrowSemanticKey(params),
        params,
      })
    }

    if (node.op.op === OperationOp.RetrieveValue || node.op.op === OperationOp.FindExtremum) {
      const keys = rows.map((row) => row.id ?? row.lookupId ?? row.target).filter((value): value is string => typeof value === 'string')
      if (keys.length > 0) {
        const params = {
          selection: { kind: 'datumKeys' as const, keys },
          level: frame.config.salienceStrategy,
          reversible: true,
        }
        pushPrimitive(frame, emittedPrimitiveKeys, {
          semanticKey: markSalienceSemanticKey(params),
          params,
        })
      }
    }

    maybeAddSyntheticMergedStack(frame, node)
    frames.push(frame)
  })

  return frames
}

function pushPrimitive(
  frame: VisualizationFrame,
  emittedKeys: Set<string>,
  primitive: VisualizationFrame['primitives'][number],
) {
  if (emittedKeys.has(primitive.semanticKey)) return
  emittedKeys.add(primitive.semanticKey)
  frame.primitives.push(primitive)
}

function phaseForNode(node: OperationNode): VisualizationFrame['phase'] {
  if (node.category === 'passthrough' || node.category === 'set-op') return 'scope-reduction'
  if (node.category === 'meta') return 'transformation'
  return 'annotation'
}

function shouldPrependReference(node: OperationNode) {
  return node.category === 'aggregate' || node.category === 'binary' || node.op.op === OperationOp.FindExtremum
}

function maybeAddSyntheticMergedStack(frame: VisualizationFrame, node: OperationNode) {
  if (node.op.op !== OperationOp.Sum || !Array.isArray(node.op.target) || node.op.target.length < 2) return
  frame.marks.overlays.push({
    kind: 'mergedStack',
    components: node.op.target.map((target) => String(typeof target === 'object' ? target.target ?? target.category ?? target.id : target)),
    semanticMeasure: `sum(${node.op.target.map(String).join(',')})`,
  })
}

function transformedChartType(chartType: ChartTypeValue, transform: string): ChartTypeValue {
  if (transform === 'stacked-to-grouped') return ChartType.GROUPED_BAR
  if (transform === 'grouped-to-simple' || transform === 'stacked-to-simple') return ChartType.SIMPLE_BAR
  if (transform === 'line-to-bar') return ChartType.SIMPLE_BAR
  return chartType
}
