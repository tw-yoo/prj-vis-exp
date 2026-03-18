import type { DatumValue } from '../operation/types'
import type { VegaLiteSpec } from '../chart'

/**
 * SurfaceRuntimeContext: 각 chart surface의 독립 실행 환경.
 * chartScopedWorkingSet 기반 구조와 달리, surface 단위로 완전히 분리된 working set과
 * operand namespace를 관리한다.
 */
export interface SurfaceRuntimeContext {
  /** 이 context를 소유하는 surface의 id */
  surfaceId: string
  /** 현재 working data set. op 실행 결과로 업데이트된다. */
  working: DatumValue[]
  /** op 실행 결과로 생성된 operand들 (nodeId → result) */
  operandRegistry: Map<string, unknown>
  /** 이 surface에서 파생된 spec들 (derivedChartState 대체용) */
  specStore: Map<string, VegaLiteSpec>
}

export function createSurfaceRuntimeContext(surfaceId: string, data: DatumValue[]): SurfaceRuntimeContext {
  return {
    surfaceId,
    working: [...data],
    operandRegistry: new Map(),
    specStore: new Map(),
  }
}
