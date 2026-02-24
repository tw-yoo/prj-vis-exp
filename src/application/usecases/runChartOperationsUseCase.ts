import * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../../domain/operation/types'
import { OperationOp } from '../../domain/operation/types'
import { normalizeOpsList, type OpsSpecInput } from '../../domain/operation/opsSpec'
import { executeDataOperation, type AutoDrawPlanContext } from '../services/executeDataOperation'
import { STANDARD_DATA_OP_HANDLERS } from '../../rendering/ops/common/dataHandlers'
import { runSleepOp } from '../../rendering/ops/common/sleepOp'
import { isDrawOp } from '../services/operationPipeline'
import { DrawAction, type DrawOp } from '../../rendering/draw/types'
import type { D3Selection } from '../../rendering/common/d3Helpers'
import { runtimeKeyFor } from '../../rendering/ops/common/runtime'
import { resetRuntimeResults, storeRuntimeResult } from '../../operation/run/dataOps'

export type ChartHandler = { run: (op: DrawOp) => void }
export type OperationCompletedEvent = {
  operation: OperationSpec
  operationIndex: number
}

export type RunChartOperationsConfig<Spec> = {
  container: HTMLElement
  spec: Spec
  opsSpec: OpsSpecInput
  render: (container: HTMLElement, spec: Spec) => Promise<unknown>
  postRender?: (container: HTMLElement, spec: Spec) => Promise<void>
  getWorkingData: (container: HTMLElement, spec: Spec) => DatumValue[]
  createHandler: (container: HTMLElement) => ChartHandler
  handleDrawOp?: (container: HTMLElement, handler: ChartHandler, drawOp: DrawOp) => void
  splitHandler?: (
    container: HTMLElement,
    spec: Spec,
    handler: ChartHandler,
    drawOp: DrawOp,
  ) => Promise<boolean>
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

export async function runChartOperationsUseCase<Spec>(config: RunChartOperationsConfig<Spec>) {
  const {
    container,
    spec,
    opsSpec,
    render,
    postRender,
    getWorkingData,
    createHandler,
    handleDrawOp,
    splitHandler,
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

  await render(container, spec)
  if (postRender) {
    await postRender(container, spec)
  }

  const baseData = getWorkingData(container, spec)
  const opsArray = normalizeOpsList(opsSpec)
  let working: DatumValue[] = baseData
  let handler = createHandler(container)

  const svg = (getSvg ?? defaultGetSvg)(container)
  clearAnnotations?.({ container, svg })

  for (let index = 0; index < opsArray.length; index += 1) {
    const operation = opsArray[index]

    if (operation.op === OperationOp.Sleep) {
      await runSleepOp(operation)
      continue
    }

    if (isDrawOp(operation)) {
      const drawOp = operation as DrawOp
      if (drawOp.action === DrawAction.Sleep) {
        await runSleepOp(drawOp)
        continue
      }
      if (splitHandler && (await splitHandler(container, spec, handler, drawOp))) {
        handler = createHandler(container)
        await notifyOperationCompleted(operation, index)
        continue
      }
      if (handleDrawOp) {
        await handleDrawOp(container, handler, drawOp)
        await notifyOperationCompleted(operation, index)
        continue
      }
      handler.run(drawOp)
      await notifyOperationCompleted(operation, index)
      continue
    }

    const operationInput = deriveOperationInput(operation, working)
    const executed = executeDataOperation(operationInput, operation, STANDARD_DATA_OP_HANDLERS, autoDrawPlans, {
      container,
      prevWorking: operationInput,
    })
    if (!executed) {
      console.warn(`Unsupported operation: ${operation.op}`)
      continue
    }

    working = await commitOperationResult(operation, executed.result, working)
    const scopedRuntimeKey = `${runtimeScope}_${index}`
    storeRuntimeResult(runtimeKeyFor(operation, index), executed.result)
    storeRuntimeResult(scopedRuntimeKey, executed.result)
    if (runDrawPlan && executed.drawPlan) {
      await runDrawPlan(executed.drawPlan as DrawOp[], handler)
    }
    await notifyOperationCompleted(operation, index)
  }

  return working
}
