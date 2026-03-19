import type { ChartTypeValue } from '../domain/chart'
import type { VegaLiteSpec } from '../domain/chart'
import type { DatumValue } from '../domain/operation/types'
import type { ChartSurfaceInstance } from '../domain/surface/chartSurfaceInstance'
import type { SurfaceLayout } from '../domain/surface/surfaceLayout'
import { createSurfaceRuntimeContext } from '../domain/surface/surfaceRuntimeContext'
import { getActiveSurfaces } from '../domain/surface/surfaceLayout'

/**
 * SurfaceManager: 완전 분리된 multi-surface layout 관리자.
 *
 * 기존 "한 SVG 안의 panel 두 개 (chartId scoping)" 방식에서 벗어나,
 * 진짜로 분리된 hostElement + SVG + renderer context를 가진 surface 인스턴스들을
 * 관리하는 런타임 계층이다.
 *
 * 핵심 사용 흐름:
 * 1. workbench에서 `new SurfaceManager(rootContainer)` 생성
 * 2. 초기 chart 렌더링 전 `createSurface('root', spec, chartType, data)` 호출
 * 3. split draw op 감지 시 `splitSurface(...)` 호출 → 두 host element 자동 배치
 * 4. 각 branch op는 해당 surface의 hostElement를 container로 사용
 * 5. merge op 시 `mergeSurfaces(...)` 호출 → single layout으로 복귀
 */
export class SurfaceManager {
  private readonly rootContainer: HTMLElement
  private surfaces = new Map<string, ChartSurfaceInstance>()
  private layout: SurfaceLayout | null = null

  /**
   * SurfaceManager → hostElement 역방향 조회용 WeakMap.
   * renderer가 "이 container가 어떤 surface인가"를 알 수 있도록 한다.
   */
  private static readonly hostToSurface = new WeakMap<HTMLElement, ChartSurfaceInstance>()

  constructor(rootContainer: HTMLElement) {
    this.rootContainer = rootContainer
  }

  // ─── surface lookup ───────────────────────────────────────────────────────

  getSurface(id: string): ChartSurfaceInstance | null {
    return this.surfaces.get(id) ?? null
  }

  getLayout(): SurfaceLayout | null {
    return this.layout
  }

  getActiveSurfaces(): ChartSurfaceInstance[] {
    if (!this.layout) return []
    return getActiveSurfaces(this.layout)
  }

  /** hostElement로 surface를 역방향 조회 (renderer 내부에서 사용) */
  static getSurfaceByHost(host: HTMLElement): ChartSurfaceInstance | null {
    return SurfaceManager.hostToSurface.get(host) ?? null
  }

  private asHostElement(surface: ChartSurfaceInstance): HTMLElement {
    return surface.hostElement as HTMLElement
  }

  // ─── surface 생성/제거 ────────────────────────────────────────────────────

  /**
   * 단일 surface 생성 및 single layout 초기화.
   * workbench 세션 시작 시 또는 reset 시 호출한다.
   */
  createRootSurface(spec: VegaLiteSpec, chartType: ChartTypeValue, data: DatumValue[]): ChartSurfaceInstance {
    // 기존 layout 정리
    this.cleanupAll()

    const host = this.ensureRootHost()
    const surface = this.buildSurface('root', host, spec, chartType, data)
    this.surfaces.set('root', surface)
    this.layout = { type: 'single', surface }
    this.applyLayoutStyles()
    return surface
  }

  /**
   * layout 유지하면서 특정 surface의 spec/chartType을 업데이트.
   * derived chart state 변경 시 사용.
   */
  updateSurface(id: string, updates: Partial<Pick<ChartSurfaceInstance, 'spec' | 'chartType' | 'data'>>): void {
    const surface = this.surfaces.get(id)
    if (!surface) return
    if (updates.spec !== undefined) (surface as { spec: VegaLiteSpec }).spec = updates.spec
    if (updates.chartType !== undefined) (surface as { chartType: ChartTypeValue }).chartType = updates.chartType
    if (updates.data !== undefined) (surface as { data: DatumValue[] }).data = updates.data
  }

  // ─── split / merge ────────────────────────────────────────────────────────

  /**
   * 현재 single surface를 두 개로 분리한다.
   * 각 surface는 자신의 hostElement, spec, data를 독립적으로 가진다.
   *
   * @param orientation - 'horizontal': 좌/우 분리 | 'vertical': 상/하 분리
   * @param dataA - surface A의 데이터 (없으면 현재 working 전체 사용)
   * @param dataB - surface B의 데이터 (없으면 현재 working 전체 사용)
   */
  splitSurface(
    orientation: 'horizontal' | 'vertical' = 'horizontal',
    options?: {
      idA?: string
      idB?: string
      specA?: VegaLiteSpec
      specB?: VegaLiteSpec
      dataA?: DatumValue[]
      dataB?: DatumValue[]
    },
  ): { surfaceA: ChartSurfaceInstance; surfaceB: ChartSurfaceInstance } {
    if (!this.layout || this.layout.type !== 'single') {
      throw new Error('SurfaceManager.splitSurface: can only split from single layout')
    }

    const source = this.layout.surface
    const idA = options?.idA ?? 'A'
    const idB = options?.idB ?? 'B'

    // root host의 기존 SVG 숨기기 (host 자체는 flex container로 유지)
    const existingSvg = this.asHostElement(source).querySelector<SVGElement>('svg')
    if (existingSvg) existingSvg.style.display = 'none'

    const hostA = this.createSplitHost(idA)
    const hostB = this.createSplitHost(idB)

    const surfaceA = this.buildSurface(
      idA,
      hostA,
      options?.specA ?? source.spec,
      source.chartType,
      options?.dataA ?? [...source.data],
    )
    const surfaceB = this.buildSurface(
      idB,
      hostB,
      options?.specB ?? source.spec,
      source.chartType,
      options?.dataB ?? [...source.data],
    )

    this.surfaces.set(idA, surfaceA)
    this.surfaces.set(idB, surfaceB)

    const layoutType = orientation === 'horizontal' ? 'split-horizontal' : 'split-vertical'
    this.layout = { type: layoutType, surfaces: [surfaceA, surfaceB], gap: 16 }
    this.applyLayoutStyles()

    return { surfaceA, surfaceB }
  }

  /**
   * split된 두 surface를 하나로 합쳐서 single layout으로 복귀.
   * merge 결과 spec/data를 받아서 새로운 root surface를 만든다.
   */
  mergeSurfaces(
    surfaceAId: string,
    surfaceBId: string,
    mergedSpec: VegaLiteSpec,
    mergedChartType: ChartTypeValue,
    mergedData: DatumValue[],
  ): ChartSurfaceInstance {
    const surfaceA = this.surfaces.get(surfaceAId)
    const surfaceB = this.surfaces.get(surfaceBId)

    // split host들 제거
    if (surfaceA) {
      this.asHostElement(surfaceA).remove()
      this.surfaces.delete(surfaceAId)
      SurfaceManager.hostToSurface.delete(this.asHostElement(surfaceA))
    }
    if (surfaceB) {
      this.asHostElement(surfaceB).remove()
      this.surfaces.delete(surfaceBId)
      SurfaceManager.hostToSurface.delete(this.asHostElement(surfaceB))
    }

    // root host 복원 (hidden SVG 다시 표시)
    const rootHost = this.ensureRootHost()
    const hiddenSvg = rootHost.querySelector<SVGElement>('svg')
    if (hiddenSvg) hiddenSvg.style.display = ''

    const mergedSurface = this.buildSurface('root', rootHost, mergedSpec, mergedChartType, mergedData)
    this.surfaces.set('root', mergedSurface)
    this.layout = { type: 'single', surface: mergedSurface }
    this.applyLayoutStyles()

    return mergedSurface
  }

  /**
   * 모든 surface를 제거하고 초기 상태로 되돌린다.
   * workbench 세션 재시작 시 호출한다.
   */
  cleanupAll(): void {
    for (const surface of this.surfaces.values()) {
      if (surface.id !== 'root') {
        this.asHostElement(surface).remove()
      }
      SurfaceManager.hostToSurface.delete(this.asHostElement(surface))
    }
    this.surfaces.clear()
    this.layout = null
    this.rootContainer.classList.remove('surface-layout--split')
    // root host display 복원
    const rootHost = this.rootContainer.querySelector<HTMLElement>('[data-surface-id="root"]')
    if (rootHost) rootHost.style.display = ''
  }

  // ─── internal helpers ─────────────────────────────────────────────────────

  private buildSurface(
    id: string,
    host: HTMLElement,
    spec: VegaLiteSpec,
    chartType: ChartTypeValue,
    data: DatumValue[],
  ): ChartSurfaceInstance {
    const runtimeContext = createSurfaceRuntimeContext(id, data)
    const surface: ChartSurfaceInstance = {
      id,
      hostElement: host,
      spec,
      chartType,
      data,
      runtimeContext,
    }
    SurfaceManager.hostToSurface.set(host, surface)
    return surface
  }

  /**
   * rootContainer 내에 id="root" host element를 찾거나 생성한다.
   * 처음에는 rootContainer 자체를 host로 사용한다.
   */
  private ensureRootHost(): HTMLElement {
    // 이미 data-surface-id="root"인 자식이 있으면 그것을 사용
    let host = this.rootContainer.querySelector<HTMLElement>('[data-surface-id="root"]')
    if (host) return host

    // rootContainer에 아무 chart도 없는 경우: rootContainer 자체를 root host로 래핑
    // 단, rootContainer 안에 다른 surface-host가 없을 때만 직접 사용
    const existingHosts = this.rootContainer.querySelectorAll('[data-surface-id]')
    if (existingHosts.length === 0) {
      // rootContainer 직접 사용 (기존 렌더링과 호환)
      this.rootContainer.setAttribute('data-surface-id', 'root')
      return this.rootContainer
    }

    // 이미 다른 host들이 있는 경우: 새로 생성
    host = document.createElement('div')
    host.setAttribute('data-surface-id', 'root')
    host.className = 'surface-host surface-host--root'
    this.rootContainer.appendChild(host)
    return host
  }

  /**
   * split용 새 host element를 rootContainer에 추가한다.
   */
  private createSplitHost(id: string): HTMLElement {
    const host = document.createElement('div')
    host.setAttribute('data-surface-id', id)
    host.className = `surface-host surface-host--split surface-host--${id.toLowerCase()}`
    this.rootContainer.appendChild(host)
    return host
  }

  /**
   * 현재 layout에 맞게 CSS 스타일을 적용한다.
   * rootContainer의 flex layout을 조정한다.
   */
  private applyLayoutStyles(): void {
    if (!this.layout) return

    if (this.layout.type === 'single') {
      this.rootContainer.classList.remove('surface-layout--split')
      this.rootContainer.style.display = ''
      this.rootContainer.style.flexDirection = ''
      this.rootContainer.style.gap = ''
      return
    }

    this.rootContainer.classList.add('surface-layout--split')
    const gap = this.layout.gap ?? 16
    this.rootContainer.style.display = 'flex'
    this.rootContainer.style.gap = `${gap}px`

    if (this.layout.type === 'split-horizontal') {
      this.rootContainer.style.flexDirection = 'row'
      // 각 surface host가 동등한 너비를 갖도록
      this.layout.surfaces.forEach((surface) => {
        const host = this.asHostElement(surface)
        host.style.flex = '1 1 0'
        host.style.minWidth = '0'
      })
    } else {
      // split-vertical
      this.rootContainer.style.flexDirection = 'column'
      this.layout.surfaces.forEach((surface) => {
        const host = this.asHostElement(surface)
        host.style.flex = '1 1 0'
        host.style.minHeight = '0'
      })
    }
  }
}
