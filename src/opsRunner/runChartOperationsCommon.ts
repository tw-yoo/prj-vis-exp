// @ts-nocheck
import * as d3 from 'd3'
import type { DatumValue, OperationSpec } from '../types'
import { OperationOp } from '../types'
import { normalizeOpsList } from '../renderer/ops/common/opsSpec.ts'
import { executeDataOperation } from '../renderer/ops/common/executeDataOp.ts'
import { STANDARD_DATA_OP_HANDLERS } from '../renderer/ops/common/dataHandlers.ts'
import { runSleepOp } from '../renderer/ops/common/sleepOp.ts'
import { isDrawOp, type DrawOp } from '../renderer/ops/operationPipeline.ts'
import { runGenericDraw } from '../renderer/draw/genericDraw.ts'
import type { D3Selection } from '../renderer/common/d3Helpers.ts'
export type ChartHandler = { run: (op: DrawOp) => void }

export type RunChartOperationsConfig<Spec> = {
  container: HTMLElement
  spec: Spec
  opsSpec: OperationSpec | OperationSpec[]
  render: (container: HTMLElement, spec: Spec) => Promise<void>
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
  autoDrawPlans?: Record<string, (result: DatumValue[], op: OperationSpec) => any[] | null>
}

const defaultGetSvg = (container: HTMLElement): D3Selection => d3.select(container).select('svg') as D3Selection

export async function runChartOperationsCommon<Spec>(config: RunChartOperationsConfig<Spec>) {
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
  } = config

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
      if (splitHandler && (await splitHandler(container, spec, handler, drawOp))) {
        handler = createHandler(container)
        continue
      }
      if (handleDrawOp) {
        handleDrawOp(container, handler, drawOp)
        continue
      }
      handler.run(drawOp)
      runGenericDraw(container, drawOp)
      continue
    }

    const executed =
      executeDataOperation(working, operation, STANDARD_DATA_OP_HANDLERS, autoDrawPlans)
    if (!executed) {
      console.warn(`Unsupported operation: ${operation.op}`)
      continue
    }

    working = executed.result
    if (runDrawPlan && executed.drawPlan) {
      await runDrawPlan(executed.drawPlan as DrawOp[], handler)
    }
  }

  return working
}
