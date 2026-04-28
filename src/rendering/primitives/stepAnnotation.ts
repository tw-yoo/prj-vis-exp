export interface LShapeStepParams {
  xN: number
  yN: number
  xN1: number
  yN1: number
  direction: 'increase' | 'decrease'
}

export interface StepArrowParams {
  barN: string
  barN1: string
  direction: 'increase' | 'decrease'
}

/** F7a sequential direction-encoding descriptors for OP6 step annotations. */
export function drawLShapeStep(params: LShapeStepParams) {
  return params
}

export function drawStepArrow(params: StepArrowParams) {
  return params
}
