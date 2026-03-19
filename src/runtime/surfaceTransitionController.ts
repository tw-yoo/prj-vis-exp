type SurfaceTransitionBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type SurfaceShellBounds = SurfaceTransitionBounds
export type SourceRect = SurfaceTransitionBounds
export type FinalHostRect = SurfaceTransitionBounds
export type FitRect = SurfaceTransitionBounds

export type SurfaceBoundsSnapshot = {
  host: HTMLElement
  bounds: SurfaceShellBounds
}

export type SplitRevealPhase = 'hold' | 'fan-out' | 'reveal'

export type MultiSurfaceLayoutTarget = {
  orientation: 'horizontal' | 'vertical'
  surfaceIds: string[]
}

export type SurfaceTransitionPlan = {
  kind: 'split'
  source: SurfaceBoundsSnapshot
  targets: SurfaceBoundsSnapshot[]
  layout: MultiSurfaceLayoutTarget
}

export type SplitCloneFlight = {
  targetId: string
  sourceRect: SourceRect
  finalHostRect: FinalHostRect
  fitRect: FitRect
}

type SurfaceTransitionControllerOptions = {
  stageElement: HTMLElement
}

type SplitTransitionArgs = {
  sourceHost: HTMLElement
  sourceSnapshot?: SurfaceBoundsSnapshot
  targetHosts: HTMLElement[]
  layout: MultiSurfaceLayoutTarget
  durationMs?: number
  staggerMs?: number
}

type MergeTransitionArgs = {
  sourceHosts?: HTMLElement[]
  sourceSnapshots?: SurfaceBoundsSnapshot[]
  targetHost: HTMLElement
  layout: MultiSurfaceLayoutTarget
  durationMs?: number
  staggerMs?: number
}

const DEFAULT_SPLIT_DURATION_MS = 520
const DEFAULT_STAGGER_MS = 64
const SURFACE_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const SOURCE_FADE_START = 0.72
const TARGET_REVEAL_START = 0.84
const CLONE_FADE_START = 0.88

function waitForAnimation(animation: Animation | null | undefined): Promise<void> {
  if (!animation) return Promise.resolve()
  return animation.finished.then(() => undefined).catch(() => undefined)
}

function getRelativeBounds(host: HTMLElement, stageElement: HTMLElement): SurfaceShellBounds | null {
  const hostRect = host.getBoundingClientRect()
  const stageRect = stageElement.getBoundingClientRect()
  if (hostRect.width <= 0 || hostRect.height <= 0) return null
  return {
    left: hostRect.left - stageRect.left,
    top: hostRect.top - stageRect.top,
    width: hostRect.width,
    height: hostRect.height,
  }
}

function cloneHostSvg(host: HTMLElement): SVGSVGElement | null {
  const svg = host.querySelector('svg')
  if (!(svg instanceof SVGSVGElement)) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('preserveAspectRatio', clone.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet')
  const { width, height } = svg.getBoundingClientRect()
  if (width > 0) clone.setAttribute('width', String(width))
  if (height > 0) clone.setAttribute('height', String(height))
  clone.style.display = 'block'
  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.overflow = 'visible'
  clone.style.background = 'transparent'
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  return clone
}

function setTargetHostHidden(host: HTMLElement) {
  host.style.opacity = '0'
  host.style.willChange = 'opacity'
}

function clearTargetHostHidden(host: HTMLElement) {
  host.style.opacity = '1'
  host.style.willChange = ''
}

function computeFitRect(source: SourceRect, finalHostRect: FinalHostRect): FitRect {
  const sourceAspect = source.width / source.height
  const targetAspect = finalHostRect.width / finalHostRect.height
  if (!Number.isFinite(sourceAspect) || sourceAspect <= 0 || !Number.isFinite(targetAspect) || targetAspect <= 0) {
    return { ...finalHostRect }
  }

  if (targetAspect >= sourceAspect) {
    const height = finalHostRect.height
    const width = height * sourceAspect
    return {
      left: finalHostRect.left + (finalHostRect.width - width) / 2,
      top: finalHostRect.top,
      width,
      height,
    }
  }

  const width = finalHostRect.width
  const height = width / sourceAspect
  return {
    left: finalHostRect.left,
    top: finalHostRect.top + (finalHostRect.height - height) / 2,
    width,
    height,
  }
}

function buildSplitCloneFlight(args: {
  sourceRect: SourceRect
  finalHostRect: FinalHostRect
  targetId: string
}): SplitCloneFlight {
  return {
    targetId: args.targetId,
    sourceRect: args.sourceRect,
    finalHostRect: args.finalHostRect,
    fitRect: computeFitRect(args.sourceRect, args.finalHostRect),
  }
}

export class SurfaceTransitionController {
  private readonly stageElement: HTMLElement
  private readonly overlayElement: HTMLDivElement

  constructor(options: SurfaceTransitionControllerOptions) {
    this.stageElement = options.stageElement
    this.overlayElement = this.ensureOverlayElement()
  }

  async animateSplit(args: SplitTransitionArgs): Promise<void> {
    const sourceSnapshot = args.sourceSnapshot ?? this.captureSnapshot(args.sourceHost)
    if (!sourceSnapshot) return

    const targetSnapshots = args.targetHosts
      .map((host) => this.captureBounds(host))
      .filter((snapshot): snapshot is SurfaceBoundsSnapshot => snapshot != null)
    if (!targetSnapshots.length) return

    const sourceShell = this.createSourceShell(sourceSnapshot)
    const flights = targetSnapshots.map((targetSnapshot, index) =>
      buildSplitCloneFlight({
        sourceRect: sourceSnapshot.bounds,
        finalHostRect: targetSnapshot.bounds,
        targetId: args.layout.surfaceIds[index] ?? `surface-${index}`,
      }),
    )
    const cloneShells = flights
      .map((flight) => this.createCloneShell(sourceSnapshot, flight))
      .filter((shell): shell is HTMLDivElement => shell != null)
    const durationMs = args.durationMs ?? DEFAULT_SPLIT_DURATION_MS
    const staggerMs = args.staggerMs ?? DEFAULT_STAGGER_MS

    args.targetHosts.forEach((host) => setTargetHostHidden(host))

    const targetAnimations = args.targetHosts.map((host, index) => {
      const animation = host.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: TARGET_REVEAL_START },
          { opacity: 1, offset: 1 },
        ],
        {
          duration: durationMs,
          delay: index * staggerMs,
          easing: SURFACE_TRANSITION_EASING,
          fill: 'forwards',
        },
      )
      return waitForAnimation(animation).then(() => {
        clearTargetHostHidden(host)
      })
    })

    const cloneAnimations = cloneShells.map((shell, index) => {
      const flight = flights[index]
      const animation = shell.animate(
        [
          {
            left: `${flight.sourceRect.left}px`,
            top: `${flight.sourceRect.top}px`,
            width: `${flight.sourceRect.width}px`,
            height: `${flight.sourceRect.height}px`,
            opacity: index === 0 ? 1 : 0.92,
            offset: 0,
          },
          {
            left: `${flight.fitRect.left}px`,
            top: `${flight.fitRect.top}px`,
            width: `${flight.fitRect.width}px`,
            height: `${flight.fitRect.height}px`,
            opacity: 1,
            offset: TARGET_REVEAL_START,
          },
          {
            left: `${flight.finalHostRect.left}px`,
            top: `${flight.finalHostRect.top}px`,
            width: `${flight.finalHostRect.width}px`,
            height: `${flight.finalHostRect.height}px`,
            opacity: 0,
            offset: 1,
          },
        ],
        {
          duration: durationMs,
          delay: index * staggerMs,
          easing: SURFACE_TRANSITION_EASING,
          fill: 'forwards',
        },
      )
      return waitForAnimation(animation).then(() => {
        shell.remove()
      })
    })

    const sourceFade =
      sourceShell?.animate(
        [
          { opacity: 1, transform: 'translate(0px, 0px) scale(1)', offset: 0 },
          { opacity: 1, transform: 'translate(0px, 0px) scale(1)', offset: SOURCE_FADE_START },
          { opacity: 0, transform: 'translate(0px, 0px) scale(1)', offset: 1 },
        ],
        {
          duration: durationMs + Math.max(0, targetSnapshots.length - 1) * staggerMs,
          easing: SURFACE_TRANSITION_EASING,
          fill: 'forwards',
        },
      ) ?? null

    await Promise.all([...cloneAnimations, ...targetAnimations, waitForAnimation(sourceFade)])

    if (sourceShell) sourceShell.remove()
    this.cleanupOverlayIfEmpty()
  }

  async animateMerge(_args: MergeTransitionArgs): Promise<void> {
    // merge는 의도적으로 애니메이션을 넣지 않는다.
  }

  private captureSnapshot(host: HTMLElement): SurfaceBoundsSnapshot | null {
    const bounds = getRelativeBounds(host, this.stageElement)
    const svg = cloneHostSvg(host)
    if (!bounds || !svg) return null
    return { host, bounds }
  }

  private captureBounds(host: HTMLElement): SurfaceBoundsSnapshot | null {
    const bounds = getRelativeBounds(host, this.stageElement)
    if (!bounds) return null
    return { host, bounds }
  }

  captureSurfaceSnapshot(host: HTMLElement): SurfaceBoundsSnapshot | null {
    return this.captureSnapshot(host)
  }

  captureSurfaceBounds(host: HTMLElement): SurfaceBoundsSnapshot | null {
    return this.captureBounds(host)
  }

  private createSourceShell(snapshot: SurfaceBoundsSnapshot): HTMLDivElement | null {
    const svg = cloneHostSvg(snapshot.host)
    if (!svg) return null
    const shell = document.createElement('div')
    shell.className = 'surface-transition-source-shell'
    shell.style.left = `${snapshot.bounds.left}px`
    shell.style.top = `${snapshot.bounds.top}px`
    shell.style.width = `${snapshot.bounds.width}px`
    shell.style.height = `${snapshot.bounds.height}px`
    shell.appendChild(svg)
    this.overlayElement.appendChild(shell)
    return shell
  }

  private createCloneShell(snapshot: SurfaceBoundsSnapshot, flight: SplitCloneFlight): HTMLDivElement | null {
    const svg = cloneHostSvg(snapshot.host)
    if (!svg) return null
    const shell = document.createElement('div')
    shell.className = 'surface-transition-clone-shell'
    shell.style.left = `${flight.sourceRect.left}px`
    shell.style.top = `${flight.sourceRect.top}px`
    shell.style.width = `${flight.sourceRect.width}px`
    shell.style.height = `${flight.sourceRect.height}px`
    shell.appendChild(svg)
    this.overlayElement.appendChild(shell)
    return shell
  }

  private ensureOverlayElement(): HTMLDivElement {
    const existing = this.stageElement.querySelector<HTMLDivElement>('.surface-transition-overlay')
    if (existing) return existing
    const overlay = document.createElement('div')
    overlay.className = 'surface-transition-overlay'
    this.stageElement.appendChild(overlay)
    return overlay
  }

  private cleanupOverlayIfEmpty() {
    if (this.overlayElement.childElementCount === 0) {
      this.overlayElement.innerHTML = ''
    }
  }
}
