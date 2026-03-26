import type { ChartTypeValue } from '../chart'
import type { VegaLiteSpec } from '../chart'
import type { DatumValue } from '../operation/types'
import type { SurfaceRuntimeContext } from './surfaceRuntimeContext'

/**
 * ChartSurfaceInstance: 완전히 독립된 차트 렌더링 단위.
 *
 * 기존 "한 SVG 안의 panel 두 개" 방식과 달리,
 * 각 surface는 자신만의 hostElement, spec, data, runtimeContext를 가진다.
 * Split 시에는 두 surface instance가 생성되어 각각 독립 렌더링된다.
 */
export interface ChartSurfaceInstance {
  /** surface의 고유 id (예: 'root', 'A', 'B', 'merge-1') */
  id: string
  /** 이 surface가 렌더링되는 전용 host handle (browser runtime에서는 DOM host object) */
  hostElement: unknown
  /** 현재 chart의 Vega-Lite spec */
  spec: VegaLiteSpec
  /** 현재 chart 타입 (SIMPLE_BAR, MULTI_LINE 등) */
  chartType: ChartTypeValue
  /** 이 surface의 원본 데이터 (split 전 전체 or 해당 domain) */
  data: DatumValue[]
  /** 독립적인 op 실행 환경 */
  runtimeContext: SurfaceRuntimeContext
  /** renderer가 자유롭게 사용하는 상태 (optional) */
  rendererState?: unknown
}
