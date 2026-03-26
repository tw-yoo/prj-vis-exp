import * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../../domain/operation/types'
import { OperationOp } from '../../domain/operation/types'
import { normalizeOpsList, type OpsSpecInput } from '../../domain/operation/opsSpec'
import { buildExecutionPhases } from '../../rendering/ops/common/timeline'
import { executeDataOperation, type AutoDrawPlanContext } from '../services/executeDataOperation'
import { STANDARD_DATA_OP_HANDLERS } from '../../rendering/ops/common/dataHandlers'
import { isDrawOp } from '../services/operationPipeline'
import { DrawAction, type DrawOp } from '../../rendering/draw/types'
import { DataAttributes } from '../../rendering/interfaces'
import type { D3Selection } from '../../rendering/common/d3Helpers'
import { runtimeKeyFor } from '../../rendering/ops/common/runtime'
import { getRuntimeResultsById, resetRuntimeResults, storeRuntimeResult } from '../../operation/run/dataOps'
import { REMOUNT_ALLOWED_DRAW_ACTIONS, STRUCTURAL_DRAW_ACTIONS } from '../../operation/run/drawActionPolicy'

export type ChartHandler = { run: (op: DrawOp) => void | Promise<void> }
export type OperationCompletedEvent = {
  operation: OperationSpec
  operationIndex: number
}

export type RunChartOperationsConfig<Spec> = {
  container: HTMLElement
  spec: Spec
  opsSpec: OpsSpecInput
  render: (container: HTMLElement, spec: Spec) => Promise<unknown>
  initialRenderMode?: 'always' | 'reuse-existing'
  postRender?: (container: HTMLElement, spec: Spec) => Promise<void>
  getWorkingData: (container: HTMLElement, spec: Spec) => DatumValue[]
  createHandler: (container: HTMLElement) => ChartHandler
  handleDrawOp?: (container: HTMLElement, handler: ChartHandler, drawOp: DrawOp) => void
  runDrawPlan?: (drawPlan: DrawOp[], handler: ChartHandler) => Promise<void>
  clearAnnotations?: (context: { container: HTMLElement; svg: D3Selection }) => void
  getSvg?: (container: HTMLElement) => D3Selection
  autoDrawPlans?: Record<string, (result: DatumValue[], op: OperationSpec, context: AutoDrawPlanContext) => unknown[] | null>
  getOperationInput?: (operation: OperationSpec, currentWorking: DatumValue[]) => DatumValue[]
  handleOperationResult?: (
    operation: OperationSpec,
    result: DatumValue[],
    currentWorking: DatumValue[],
  ) => Promise<DatumValue[]> | DatumValue[]
  onOperationCompleted?: (event: OperationCompletedEvent) => Promise<void> | void
  runtimeScope?: string
  resetRuntime?: boolean
}

const defaultGetSvg = (container: HTMLElement): D3Selection => d3.select(container).select('svg') as D3Selection

const STRICT_NON_SPLIT_NO_REMOUNT = false
type RenderIdentity = {
  svg: SVGSVGElement | null
  epoch: number
}

function getRenderIdentity(container: HTMLElement): RenderIdentity {
  const svg = container.querySelector('svg')
  const epochRaw = container.getAttribute(DataAttributes.RenderEpoch)
  const epoch = Number(epochRaw)
  return {
    svg: svg instanceof SVGSVGElement ? svg : null,
    epoch: Number.isFinite(epoch) ? epoch : 0,
  }
}

function isDrawDebugEnabled() {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { __WORKBENCH_DRAW_DEBUG__?: boolean }).__WORKBENCH_DRAW_DEBUG__)
}

function assertNoRemountForDrawOps(
  container: HTMLElement,
  before: RenderIdentity,
  drawOps: DrawOp[],
  sourceLabel: string,
) {
  if (!drawOps.length) return
  const requiresNoRemount = drawOps.some((drawOp) => !REMOUNT_ALLOWED_DRAW_ACTIONS.has(drawOp.action))
  if (!requiresNoRemount) return
  const after = getRenderIdentity(container)
  const remounted =
    (before.svg && after.svg && before.svg !== after.svg) || after.epoch !== before.epoch
  if (!remounted) return
  const message = `[non-split/no-remount] unexpected remount after ${sourceLabel}`
  if (STRICT_NON_SPLIT_NO_REMOUNT) {
    throw new Error(message)
  }
  console.warn(message, {
    sourceLabel,
    beforeEpoch: before.epoch,
    afterEpoch: after.epoch,
    actions: drawOps.map((drawOp) => drawOp.action),
  })
}

function operationLogContext(operation: OperationSpec, index: number) {
  const opId =
    typeof (operation as { id?: unknown }).id === 'string' ? ((operation as { id?: string }).id ?? null) : null
  const nodeId = typeof operation.meta?.nodeId === 'string' ? operation.meta.nodeId : null
  const inputs = Array.isArray(operation.meta?.inputs) ? operation.meta.inputs : []
  return {
    index,
    op: operation.op ?? null,
    id: opId,
    nodeId,
    chartId: operation.chartId ?? null,
    inputs,
  }
}

function resolveDataInputSeed(operation: OperationSpec, phaseWorkingBase: DatumValue[]): DatumValue[] {
  // `filter` uses `meta.inputs` for threshold refs (e.g., value: "ref:n1"), not for replacing the data source.
  // Keep filtering against the current working dataset to avoid collapsing input into scalar dependency rows.
  if (operation.op === OperationOp.Filter) return phaseWorkingBase
  const inputs = (Array.isArray(operation.meta?.inputs) ? operation.meta.inputs : []).filter(
    (depId): depId is string | number => typeof depId === 'string' || typeof depId === 'number',
  )
  if (inputs.length === 0) return phaseWorkingBase
  const merged = inputs.flatMap((depId) => getRuntimeResultsById(depId))
  return merged.length > 0 ? merged : phaseWorkingBase
}

export async function runChartOperationsUseCase<Spec>(config: RunChartOperationsConfig<Spec>) {
  const {
    container,
    spec,
    opsSpec,
    render,
    initialRenderMode = 'always',
    postRender,
    getWorkingData,
    createHandler,
    handleDrawOp,
    runDrawPlan,
    clearAnnotations,
    getSvg,
    autoDrawPlans = {},
    getOperationInput,
    handleOperationResult,
    onOperationCompleted,
    runtimeScope = 'ops',
    resetRuntime = true,
  } = config

  if (resetRuntime) {
    resetRuntimeResults()
  }

  const deriveOperationInput =
    getOperationInput ??
    ((_: OperationSpec, current: DatumValue[]) => {
      return current
    })
  const commitOperationResult =
    handleOperationResult ??
    (async (_: OperationSpec, result: DatumValue[]) => {
      return result
    })
  const notifyOperationCompleted = async (operation: OperationSpec, operationIndex: number) => {
    if (!onOperationCompleted) return
    await onOperationCompleted({ operation, operationIndex })
  }

  const opsArray = normalizeOpsList(opsSpec)
  const executableOps = opsArray.filter((operation) => operation.op !== OperationOp.Sleep)
  const drawOpsInRun = executableOps.filter((operation): operation is DrawOp => isDrawOp(operation))
  const hasDataOps = executableOps.some((operation) => !isDrawOp(operation))
  const isDrawOnlyRun = executableOps.length > 0 && !hasDataOps
  const hasStructuralDrawInRun = drawOpsInRun.some((drawOp) => STRUCTURAL_DRAW_ACTIONS.has(drawOp.action))
  const initialIdentity = getRenderIdentity(container)
  const autoReuseForDrawOnly = initialRenderMode !== 'reuse-existing' && isDrawOnlyRun && !hasStructuralDrawInRun && !!initialIdentity.svg
  const effectiveInitialRenderMode: 'always' | 'reuse-existing' =
    initialRenderMode === 'reuse-existing' || autoReuseForDrawOnly ? 'reuse-existing' : 'always'
  const reuseExistingRender = effectiveInitialRenderMode === 'reuse-existing'
  const drawDebugEnabled = isDrawDebugEnabled()

  const runRender = async (reason: string) => {
    await render(container, spec)
    if (postRender) {
      await postRender(container, spec)
    }
    if (drawDebugEnabled) {
      const after = getRenderIdentity(container)
      console.info('[draw:render]', {
        mode: effectiveInitialRenderMode,
        reason,
        hasSvg: Boolean(after.svg),
        epoch: after.epoch,
      })
    }
  }

  if (drawDebugEnabled) {
    console.info('[draw:render-decision]', {
      requestedMode: initialRenderMode,
      effectiveMode: effectiveInitialRenderMode,
      autoReuseForDrawOnly,
      isDrawOnlyRun,
      hasStructuralDrawInRun,
      hasExistingSvg: Boolean(initialIdentity.svg),
      beforeEpoch: initialIdentity.epoch,
    })
  }

  if (!reuseExistingRender) {
    await runRender('always')
  } else {
    const beforeRender = getRenderIdentity(container)
    if (!beforeRender.svg) {
      await runRender('reuse-existing:no-svg')
    } else if (postRender) {
      await postRender(container, spec)
    }
  }

  let baseData = getWorkingData(container, spec)
  if (reuseExistingRender && hasDataOps && baseData.length === 0) {
    await runRender('reuse-existing:empty-working-data')
    baseData = getWorkingData(container, spec)
  }

  const phases = buildExecutionPhases(opsArray)
  let working: DatumValue[] = baseData
  let handler = createHandler(container)

  if (resetRuntime) {
    const svg = (getSvg ?? defaultGetSvg)(container)
    clearAnnotations?.({ container, svg })
  }

  const logReuseExistingDraw = (drawOp: DrawOp, before: RenderIdentity) => {
    if (!(drawDebugEnabled && reuseExistingRender && isDrawOnlyRun)) return
    const after = getRenderIdentity(container)
    console.info('[draw:reuse-existing]', {
      action: drawOp.action,
      beforeEpoch: before.epoch,
      afterEpoch: after.epoch,
      sameSvg: before.svg === after.svg,
    })
  }

  let globalIndex = 0
  const nextIndex = () => {
    const index = globalIndex
    globalIndex += 1
    return index
  }
  for (const phase of phases) {
    const phaseWorkingBase = working
    const dataOpsInPhase: Array<{ operation: OperationSpec; index: number }> = []
    const drawOpsInPhase: Array<{ operation: OperationSpec; drawOp: DrawOp; index: number }> = []

    for (const operation of phase) {
      if (operation.op === OperationOp.Sleep) continue
      if (isDrawOp(operation)) {
        const drawOp = operation as DrawOp
        if (drawOp.action === DrawAction.Sleep) continue
        drawOpsInPhase.push({ operation, drawOp, index: nextIndex() })
        continue
      }
      dataOpsInPhase.push({ operation, index: nextIndex() })
    }

    // Data ops are executed sequentially for deterministic working-data updates.
    for (const item of dataOpsInPhase) {
      const { operation, index } = item
      const phaseSeed = resolveDataInputSeed(operation, phaseWorkingBase)
      const operationInput = deriveOperationInput(operation, phaseSeed)
      const context = operationLogContext(operation, index)
      let executed: ReturnType<typeof executeDataOperation> | null = null
      try {
        executed = executeDataOperation(operationInput, operation, STANDARD_DATA_OP_HANDLERS, autoDrawPlans, {
          container,
          prevWorking: operationInput,
        })
      } catch (error) {
        console.warn('[ops:data-op] execution failed; skipping operation', {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        })
        continue
      }
      if (!executed) {
        console.warn('[ops:data-op] unsupported operation; skipping operation', context)
        continue
      }

      try {
        working = await commitOperationResult(operation, executed.result, working)
        const scopedRuntimeKey = `${runtimeScope}_${index}`
        storeRuntimeResult(runtimeKeyFor(operation, index), executed.result)
        storeRuntimeResult(scopedRuntimeKey, executed.result)
        const nodeId = typeof operation.meta?.nodeId === 'string' ? operation.meta.nodeId : null
        if (nodeId) {
          storeRuntimeResult(nodeId, executed.result)
        }
        const opId = typeof (operation as { id?: unknown }).id === 'string' ? (operation as { id?: string }).id : null
        if (opId) {
          storeRuntimeResult(opId, executed.result)
        }
        if (runDrawPlan && executed.drawPlan) {
          const drawOps = executed.drawPlan as DrawOp[]
          const before = getRenderIdentity(container)
          await runDrawPlan(drawOps, handler)
          assertNoRemountForDrawOps(container, before, drawOps, `data-op:${operation.op}`)
        }
        await notifyOperationCompleted(operation, index)
      } catch (error) {
        console.warn('[ops:data-op] post-processing failed; skipping operation', {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const runDraw = async (item: { operation: OperationSpec; drawOp: DrawOp; index: number }) => {
      const { operation, drawOp, index } = item
      const before = getRenderIdentity(container)
      if (handleDrawOp) {
        await handleDrawOp(container, handler, drawOp)
        assertNoRemountForDrawOps(container, before, [drawOp], `draw-op:${drawOp.action}`)
        logReuseExistingDraw(drawOp, before)
        const after = getRenderIdentity(container)
        const remounted =
          (before.svg && after.svg && before.svg !== after.svg) || before.epoch !== after.epoch
        if (remounted) {
          handler = createHandler(container)
        }
        await notifyOperationCompleted(operation, index)
        return
      }
      await handler.run(drawOp)
      assertNoRemountForDrawOps(container, before, [drawOp], `draw-op:${drawOp.action}`)
      logReuseExistingDraw(drawOp, before)
      await notifyOperationCompleted(operation, index)
    }

    // Draw ops are parallelized by phase, but structural actions remain sequential barriers.
    let parallelBatch: Array<{ operation: OperationSpec; drawOp: DrawOp; index: number }> = []
    const flushParallelBatch = async () => {
      if (!parallelBatch.length) return
      const batch = parallelBatch
      parallelBatch = []
      await Promise.all(batch.map((item) => runDraw(item)))
    }

    for (const item of drawOpsInPhase) {
      if (STRUCTURAL_DRAW_ACTIONS.has(item.drawOp.action)) {
        await flushParallelBatch()
        await runDraw(item)
        continue
      }
      parallelBatch.push(item)
    }
    await flushParallelBatch()
  }

  return working
}
