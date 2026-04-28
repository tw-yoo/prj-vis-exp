import type { ChartTypeValue } from '../domain/chart'
import { OperationOp } from '../domain/operation/types'
import type { PrimitiveCall } from '../rendering/primitives'
import type { SalienceLevel } from '../rendering/primitives/markSalience'
import type { SyntheticMark } from './syntheticMark'

export type StepPhase = 'scope-reduction' | 'transformation' | 'annotation'
export type ChartContextRef = { chartId?: string | null; surfaceId?: string | null; chartType?: ChartTypeValue | null }
export type MarkId = string

export type TensionFrameConfig = {
  salienceStrategy: 'dim' | 'remove' | 'grayscale'
  annotationStrategy: 'in-place' | 'derive-chart'
  arrowPlacement: 'right-edge' | 'inline'
  densityMode: 'all' | 'derive-chart' | 'selective'
  rescaleAfterIsolation: boolean
}

export interface VisualizationFrame {
  id: string
  phase: StepPhase
  chartContext: ChartContextRef
  marks: {
    salience: Map<MarkId, SalienceLevel>
    overlays: SyntheticMark[]
  }
  primitives: PrimitiveCall[]
  axes: {
    x: { title: string | null; domain?: unknown[] }
    y: { title: string | null; domain?: [number, number] }
  }
  config: TensionFrameConfig
  derivedFrom: { opNodeId: string; role: 'compute' | 'context' }[]
}

export const DEFAULT_FRAME_CONFIG: TensionFrameConfig = {
  salienceStrategy: 'dim',
  annotationStrategy: 'in-place',
  arrowPlacement: 'right-edge',
  densityMode: 'all',
  rescaleAfterIsolation: false,
}

export function createVisualizationFrame(args: {
  id: string
  phase?: StepPhase
  chartContext?: ChartContextRef
  config?: Partial<TensionFrameConfig>
}): VisualizationFrame {
  return {
    id: args.id,
    phase: args.phase ?? 'annotation',
    chartContext: args.chartContext ?? {},
    marks: {
      salience: new Map(),
      overlays: [],
    },
    primitives: [],
    axes: {
      x: { title: null },
      y: { title: null },
    },
    config: { ...DEFAULT_FRAME_CONFIG, ...(args.config ?? {}) },
    derivedFrom: [],
  }
}

export function createFrameAfterOperation(op: { op?: string; meta?: Record<string, unknown> } | null | undefined, index: number): VisualizationFrame {
  const opName = String(op?.op ?? 'operation')
  const nodeId = typeof op?.meta?.nodeId === 'string' || typeof op?.meta?.nodeId === 'number'
    ? String(op.meta.nodeId)
    : `op_${index}`
  const frame = createVisualizationFrame({
    id: `frame_after_${nodeId}`,
    phase: inferPhase(opName),
  })
  frame.derivedFrom.push({ opNodeId: nodeId, role: 'compute' })
  return frame
}

export function addPrimitive(frame: VisualizationFrame, call: PrimitiveCall): VisualizationFrame {
  if (!frame.primitives.some((primitive) => primitive.semanticKey === call.semanticKey)) {
    frame.primitives.push(call)
  }
  return frame
}

function inferPhase(opName: string): StepPhase {
  if (opName === OperationOp.Filter || opName === OperationOp.RetrieveValue || opName === OperationOp.SetOp) {
    return 'scope-reduction'
  }
  if (opName === OperationOp.Draw) return 'transformation'
  return 'annotation'
}
