import type { ChartSurfaceInstance } from './chartSurfaceInstance'

/**
 * SurfaceLayout: 현재 화면에 chart surface가 어떻게 배치되는지를 나타낸다.
 *
 * - single: 기본 상태. 하나의 surface만 보인다.
 * - split-horizontal: 두 surface가 좌/우로 나뉜다.
 * - split-vertical: 두 surface가 상/하로 나뉜다.
 */
export type SurfaceLayout =
  | { type: 'single'; surface: ChartSurfaceInstance }
  | {
      type: 'split-horizontal'
      surfaces: [ChartSurfaceInstance, ChartSurfaceInstance]
      /** 두 surface 사이의 gap (px). 기본값: 16 */
      gap?: number
    }
  | {
      type: 'split-vertical'
      surfaces: [ChartSurfaceInstance, ChartSurfaceInstance]
      /** 두 surface 사이의 gap (px). 기본값: 16 */
      gap?: number
    }

/** layout에서 활성 surface 목록을 추출한다 */
export function getActiveSurfaces(layout: SurfaceLayout): ChartSurfaceInstance[] {
  if (layout.type === 'single') return [layout.surface]
  return layout.surfaces
}

/** layout이 split 상태인지 확인 */
export function isSplitLayout(layout: SurfaceLayout): layout is Exclude<SurfaceLayout, { type: 'single' }> {
  return layout.type !== 'single'
}
