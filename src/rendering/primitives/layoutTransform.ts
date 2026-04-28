export interface RescaleAxisParams {
  axis: 'x' | 'y'
  newDomain: [number, number]
  withTransition: boolean
  recordPrev: boolean
}

export interface ShadeRangeParams {
  xRange: [number, number]
}

export interface RepositionMarksParams {
  semanticKey: string
}

/** F6 reversible layout-transform descriptors consumed by frame planning. */
export function rescaleAxis(params: RescaleAxisParams) {
  return params
}

export function shadeRange(params: ShadeRangeParams) {
  return params
}

export function repositionMarks(params: RepositionMarksParams) {
  return params
}
