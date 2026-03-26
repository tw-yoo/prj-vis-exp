import type { DatumValue, OperationSpec } from '../../domain/operation/types'

export type ChartSurfaceRef = {
  kind: 'dom'
  handle: unknown
}

export type RunChartOpsResult = {
  finalWorkingData: DatumValue[]
}

export interface ChartRenderPort<Spec = unknown> {
  render(surface: ChartSurfaceRef, spec: Spec): Promise<void>
}

export interface DrawExecutionPort {
  createHandler(surface: ChartSurfaceRef): { run: (op: OperationSpec) => void | Promise<void> }
  runDrawPlan?(
    surface: ChartSurfaceRef,
    drawPlan: OperationSpec[],
    handler: { run: (op: OperationSpec) => void | Promise<void> },
  ): Promise<void>
  clearAnnotations?(surface: ChartSurfaceRef): void
}

export interface ChartStatePort<Spec = unknown> {
  readWorkingData(surface: ChartSurfaceRef, spec: Spec): DatumValue[]
}

export interface RuntimeResultPort {
  reset(): void
  store(key: string, result: DatumValue[]): void
  read(key: string): DatumValue[]
}

export interface ClockPort {
  sleep(ms: number): Promise<void>
}

export interface LoggerPort {
  warn(message: string, context?: unknown): void
}

export type RenderChartCommand<Spec = unknown> = {
  surface: ChartSurfaceRef
  spec: Spec
}

export type RunChartOpsCommand<Spec = unknown> = {
  surface: ChartSurfaceRef
  spec: Spec
  ops: OperationSpec[]
}
