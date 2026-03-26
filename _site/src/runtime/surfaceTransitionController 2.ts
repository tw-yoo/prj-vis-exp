type SurfaceTransitionBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type SurfaceBoundsSnapshot = {
  host: HTMLElement
  bounds: SurfaceTransitionBounds
}

export type SurfaceTransitionGhost = {
  node: HTMLDivElement
  snapshot: SurfaceBoundsSnapshot
}

export type MultiSurfaceLayoutTarget = {
  orientation: 'horizontal' | 'vertical'
  surfaceIds: string[]
}

export type SurfaceTransitionPlan =
  | {
      kind: 'split'
      source: SurfaceBoundsSnapshot
      targets: SurfaceBoundsSnapshot[]
      layout: MultiSurfaceLayoutTarget
    }
  | {
      kind: 'merge'
      sources: SurfaceBoundsSnapshot[]
      target: SurfaceBoundsSnapshot
      layout: MultiSurfaceLayoutTarget
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

const DEFAULT_SPLIT_DURATION_MS = 440
const DEFAULT_MERGE_DURATION_MS = 420
const DEFAULT_STAGGER_MS = 56
const SURFACE_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function waitForAnimation(animation: Animation | null | undefined): Promise<void> {
  if (!animation) return Promise.resolve()
  return animation.finished.then(() => undefined).catch(() => undefined)
}

function getRelativeBounds(host: HTMLElement, stageElement: HTMLElement): SurfaceTransitionBounds | null {
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
  const { width, height } = svg.getBoundingClientRect()
  if (width > 0) clone.setAttribute('width', String(width))
  if (height > 0) clone.setAttribute('height', String(height))
  clone.style.display = 'block'
  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.overflow = 'visible'
  clone.style.background = '#ffffff'
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  return clone
}

function setHostOpacity(host: HTMLElement, opacity: string) {
  host.style.opacity = opacity
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

    const ghosts = targetSnapshots
      .map((targetSnapshot) => this.createGhost(sourceSnapshot))
      .filter((ghost): ghost is SurfaceTransitionGhost => ghost != null)

    if (!ghosts.length) return

    args.targetHosts.forEach((host) => setHostOpacity(host, '0'))

    const durationMs = args.durationMs ?? DEFAULT_SPLIT_DURATION_MS
    const staggerMs = args.staggerMs ?? DEFAULT_STAGGER_MS

    const animations = ghosts.map((ghost, index) => {
      const target = targetSnapshots[index]
      const dx = target.bounds.left - sourceSnapshot.bounds.left
      const dy = target.bounds.top - sourceSnapshot.bounds.top
      const sx = target.bounds.width / sourceSnapshot.bounds.width
      const sy = target.bounds.height / sourceSnapshot.bounds.height
      return this.animateGhost(ghost, [
        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.9, offset: 1 },
      ], {
        duration: durationMs,
        delay: index * staggerMs,
      })
    })

    const revealAnimations = args.targetHosts.map((host, index) =>
      host.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.58 },
          { opacity: 1, offset: 1 },
        ],
        {
          duration: durationMs,
          delay: index * staggerMs,
          easing: SURFACE_TRANSITION_EASING,
          fill: 'forwards',
        },
      ),
    )

    await Promise.all([...animations, ...revealAnimations.map((animation) => waitForAnimation(animation))])

    args.targetHosts.forEach((host) => setHostOpacity(host, '1'))
    ghosts.forEach((ghost) => ghost.node.remove())
    this.cleanupOverlayIfEmpty()
  }

  async animateMerge(args: MergeTransitionArgs): Promise<void> {
    const sourceSnapshots =
      args.sourceSnapshots ??
      (args.sourceHosts ?? [])
        .map((host) => this.captureSnapshot(host))
        .filter((snapshot): snapshot is SurfaceBoundsSnapshot => snapshot != null)
    const targetSnapshot = this.captureBounds(args.targetHost)
    if (!sourceSnapshots.length || !targetSnapshot) return

    const ghosts = sourceSnapshots
      .map((snapshot) => this.createGhost(snapshot))
      .filter((ghost): ghost is SurfaceTransitionGhost => ghost != null)
    if (!ghosts.length) return

    setHostOpacity(args.targetHost, '0')

    const durationMs = args.durationMs ?? DEFAULT_MERGE_DURATION_MS
    const staggerMs = args.staggerMs ?? DEFAULT_STAGGER_MS

    const animations = ghosts.map((ghost, index) => {
      const source = sourceSnapshots[index]
      const dx = targetSnapshot.bounds.left - source.bounds.left
      const dy = targetSnapshot.bounds.top - source.bounds.top
      const sx = targetSnapshot.bounds.width / source.bounds.width
      const sy = targetSnapshot.bounds.height / source.bounds.height
      return this.animateGhost(ghost, [
        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, offset: 0 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.12, offset: 1 },
      ], {
        duration: durationMs,
        delay: index * staggerMs,
      })
    })

    const reveal = args.targetHost.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.45 },
        { opacity: 1, offset: 1 },
      ],
      {
        duration: durationMs + Math.max(0, sourceSnapshots.length - 1) * staggerMs,
        easing: SURFACE_TRANSITION_EASING,
        fill: 'forwards',
      },
    )

    await Promise.all([...animations, waitForAnimation(reveal)])

    setHostOpacity(args.targetHost, '1')
    ghosts.forEach((ghost) => ghost.node.remove())
    this.cleanupOverlayIfEmpty()
  }

  private captureSnapshot(host: HTMLElement): SurfaceBoundsSnapshot | null {
    const bounds = getRelativeBounds(host, this.stageElement)
    const svg = cloneHostSvg(host)
    if (!bounds || !svg) return null
    return {
      host,
      bounds,
    }
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

  private createGhost(snapshot: SurfaceBoundsSnapshot): SurfaceTransitionGhost | null {
    const svg = cloneHostSvg(snapshot.host)
    if (!svg) return null

    const ghost = document.createElement('div')
    ghost.className = 'surface-transition-ghost'
    ghost.style.left = `${snapshot.bounds.left}px`
    ghost.style.top = `${snapshot.bounds.top}px`
    ghost.style.width = `${snapshot.bounds.width}px`
    ghost.style.height = `${snapshot.bounds.height}px`
    ghost.appendChild(svg)
    this.overlayElement.appendChild(ghost)
    return {
      node: ghost,
      snapshot,
    }
  }

  private animateGhost(
    ghost: SurfaceTransitionGhost,
    keyframes: Keyframe[],
    options: { duration: number; delay: number },
  ): Promise<void> {
    const animation = ghost.node.animate(keyframes, {
      duration: options.duration,
      delay: options.delay,
      easing: SURFACE_TRANSITION_EASING,
      fill: 'forwards',
    })
    return waitForAnimation(animation)
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
