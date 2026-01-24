import vegaEmbedLib from 'vega-embed'

/**
 * Minimal Vega-Lite spec shape we care about for embedding/rendering.
 * This keeps the typing light while still providing structure.
 */
export interface VegaLiteSpec {
  $schema?: string
  data?: {
    url?: string
    values?: unknown[]
    [key: string]: unknown
  }
  mark?: string | { type?: string; [key: string]: unknown }
  encoding?: Record<string, unknown>
  layer?: Array<Record<string, unknown>>
  config?: Record<string, unknown>
  width?: number
  height?: number
  [key: string]: unknown
}

export interface VegaEmbedOptions {
  actions?: boolean
  renderer?: 'svg' | 'canvas'
  padding?:
    | number
    | {
        left?: number
        right?: number
        top?: number
        bottom?: number
      }
  [key: string]: unknown
}

export const ChartType = Object.freeze({
  SIMPLE_BAR: 'Simple bar chart',
  STACKED_BAR: 'Stacked bar chart',
  GROUPED_BAR: 'Grouped bar chart',
  MULTIPLE_BAR: 'Multiple bar chart',
  SIMPLE_LINE: 'Simple line chart',
  MULTI_LINE: 'Multi line chart',
})

export type ChartTypeValue = (typeof ChartType)[keyof typeof ChartType]

type VegaEmbedFn = (container: HTMLElement, spec: unknown, options?: VegaEmbedOptions) => Promise<unknown>

type AxisClearanceOptions = {
  attempts?: number
  minGap?: number
  maxShift?: number
  x?: { minGap?: number; maxShift?: number }
  y?: { minGap?: number; maxShift?: number }
}

type GlobalWithVega = typeof globalThis & {
  vegaEmbed?: VegaEmbedFn
  vega?: { embed?: VegaEmbedFn }
}

declare const vegaEmbed: VegaEmbedFn | undefined

/** Resolve mark type to a string, handling object form. */
function normalizeMarkType(mark: VegaLiteSpec['mark']) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (typeof mark === 'object' && typeof mark.type === 'string') {
    return mark.type
  }
  return null
}

function hasFieldChannel(channel: unknown) {
  if (!channel) return false
  if (typeof channel === 'string') return true
  if (typeof channel === 'object') {
    const channelObj = channel as { field?: unknown; condition?: unknown }
    if (channelObj.field) return true
    if (Array.isArray(channelObj.condition)) {
      return channelObj.condition.some((c) => !!(c as { field?: unknown })?.field)
    }
    if (channelObj.condition && (channelObj.condition as { field?: unknown }).field) return true
  }
  return false
}

function normalizeLayers(spec: VegaLiteSpec = {}) {
  const baseEncoding = spec.encoding || {}
  if (Array.isArray(spec.layer) && spec.layer.length > 0) {
    return spec.layer.map((layer) => ({
      mark: normalizeMarkType(layer?.mark ?? spec.mark),
      encoding: { ...baseEncoding, ...(layer?.encoding || {}) },
    }))
  }
  return [
    {
      mark: normalizeMarkType(spec.mark),
      encoding: baseEncoding,
    },
  ]
}

/** Infer a coarse chart type (bar/line variants) from the spec. */
export function getChartType(spec: VegaLiteSpec): ChartTypeValue | null {
  if (!spec || typeof spec !== 'object') return null

  const layers = normalizeLayers(spec)
  const baseEnc = spec.encoding || {}
  const hasFacet = !!((baseEnc as { column?: unknown }).column || (baseEnc as { row?: unknown }).row || spec.facet || spec.repeat)

  const barLayer = layers.find((layer) => layer.mark === 'bar')
  if (barLayer) {
    const encoding = (barLayer.encoding || {}) as Record<string, any>
    const hasColor = !!encoding.color

    if (hasFacet) {
      return ChartType.MULTIPLE_BAR
    }

    const isSingleSeriesColor =
      encoding.color?.field === encoding.y?.field &&
      encoding.x?.type === 'quantitative' &&
      encoding.y?.type === 'nominal'

    if (!hasColor || isSingleSeriesColor) {
      return ChartType.SIMPLE_BAR
    }

    const stackType = encoding.y?.stack || encoding.x?.stack || null
    if (stackType !== 'none') {
      return ChartType.STACKED_BAR
    }
    return ChartType.GROUPED_BAR
  }

  const lineLayers = layers.filter((layer) => layer.mark === 'line')
  if (lineLayers.length > 0) {
    const colorInLayers = layers.some((layer) => hasFieldChannel((layer.encoding as Record<string, unknown>)?.color))
    const colorInBase = hasFieldChannel((baseEnc as Record<string, unknown>).color)
    if (colorInLayers || colorInBase) {
      return ChartType.MULTI_LINE
    }
    return ChartType.SIMPLE_LINE
  }

  return null
}

/** Ensure a .chart-canvas child exists and return it. */
function ensureChartCanvas(container: HTMLElement) {
  if (!container) return null
  if (container.classList.contains('chart-canvas')) {
    return container
  }
  let canvas = container.querySelector(':scope > .chart-canvas') as HTMLElement | null
  if (!canvas) {
    canvas = document.createElement('div')
    canvas.className = 'chart-canvas'
    container.insertBefore(canvas, container.firstChild)
    const directSvg = container.querySelector(':scope > svg')
    if (directSvg) {
      canvas.appendChild(directSvg)
    }
  }
  return canvas
}

/** Resolve a vegaEmbed function from global scope (no import assumed). */
function resolveVegaEmbed(): VegaEmbedFn | null {
  // Prefer bundled import (vite/esm)
  if (typeof vegaEmbedLib === 'function') {
    return vegaEmbedLib as unknown as VegaEmbedFn
  }
  // Fallback to globals (browser CDN scenario)
  try {
    if (typeof vegaEmbed === 'function') return vegaEmbed
  } catch (_) {
    // ignore ReferenceError when vegaEmbed is not defined globally
  }
  const globalObj: GlobalWithVega | null =
    typeof window !== 'undefined'
      ? (window as GlobalWithVega)
      : typeof globalThis !== 'undefined'
        ? (globalThis as GlobalWithVega)
        : null
  if (globalObj && typeof globalObj.vegaEmbed === 'function') {
    return globalObj.vegaEmbed.bind(globalObj)
  }
  if (globalObj && globalObj.vega && typeof globalObj.vega.embed === 'function') {
    return (container, spec, options) => globalObj.vega?.embed?.(container, spec, options)
  }
  return null
}

function isLineMark(mark: VegaLiteSpec['mark']) {
  if (!mark) return false
  if (typeof mark === 'string') return mark === 'line'
  if (typeof mark === 'object' && typeof mark.type === 'string') {
    return mark.type === 'line'
  }
  return false
}

function collectLineEncodings(spec: VegaLiteSpec = {}) {
  const encodings: Record<string, any>[] = []
  if (isLineMark(spec.mark) && spec.encoding) {
    encodings.push(spec.encoding as Record<string, any>)
  }
  if (Array.isArray(spec.layer)) {
    spec.layer.forEach((layer) => {
      if (isLineMark(layer?.mark) && layer?.encoding) {
        encodings.push(layer.encoding as Record<string, any>)
      }
    })
  }
  return encodings
}

function parseCsvRows(text: string) {
  if (!text || typeof text !== 'string') return []
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length <= 1) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim()
    })
    return row
  })
}

async function loadRowsForSpecData(dataRef: VegaLiteSpec['data']) {
  if (!dataRef) return []
  if (Array.isArray(dataRef.values)) {
    return dataRef.values
  }
  if (typeof dataRef.url === 'string') {
    try {
      const res = await fetch(dataRef.url)
      if (!res?.ok) return []
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('json')) {
        return await res.json()
      }
      const text = await res.text()
      try {
        return JSON.parse(text)
      } catch (_) {
        return parseCsvRows(text)
      }
    } catch (err) {
      console.warn('loadRowsForSpecData: failed to fetch data', err)
      return []
    }
  }
  return []
}

function computePaddedDomain(minVal: number, maxVal: number) {
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) return null
  let domainMin = minVal >= 0 ? minVal * 0.8 : minVal * 1.2
  let domainMax = maxVal >= 0 ? maxVal * 1.2 : maxVal * 0.8
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) return null
  if (domainMin === domainMax) {
    domainMin -= 5
    domainMax += 5
  }
  return [domainMin, domainMax]
}

async function applyAutoLineDomain(spec: VegaLiteSpec) {
  if (!spec || typeof spec !== 'object') return spec

  const lineEncodings = collectLineEncodings(spec)
  if (lineEncodings.length === 0) return spec

  const hasExplicitDomain = lineEncodings.some((enc) => enc?.y?.scale?.domain !== undefined)
  if (hasExplicitDomain) return spec

  const yFields = Array.from(
    new Set(lineEncodings.map((enc) => enc?.y?.field).filter(Boolean)),
  )
  if (yFields.length === 0) return spec

  const dataRef =
    spec.data || (Array.isArray(spec.layer) ? (spec.layer.find((l) => l?.data)?.data as VegaLiteSpec['data']) : null)
  const rows = await loadRowsForSpecData(dataRef)
  if (!Array.isArray(rows) || rows.length === 0) return spec

  let minVal = Infinity
  let maxVal = -Infinity
  rows.forEach((row: any) => {
    yFields.forEach((field) => {
      const value = Number(row?.[field as string])
      if (Number.isFinite(value)) {
        if (value < minVal) minVal = value
        if (value > maxVal) maxVal = value
      }
    })
  })

  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) return spec

  const padded = computePaddedDomain(minVal, maxVal)
  if (!padded) return spec

  lineEncodings.forEach((enc) => {
    if (!enc?.y) return
    const scale = enc.y.scale || {}
    enc.y = {
      ...enc.y,
      scale: {
        ...scale,
        domain: padded,
        ...(scale.zero === undefined ? { zero: false } : {}),
      },
    }
  })

  return spec
}

function adjustSvgXAxisLabelClearance(svg: SVGElement, opts: { minGap?: number; maxShift?: number } = {}) {
  const axisLabel = svg.querySelector('.x-axis-label')
  if (!axisLabel) return true

  const axisGroup = svg.querySelector('.x-axis')
  if (!axisGroup) return false

  const tickNodes = axisGroup.querySelectorAll('text')
  if (!tickNodes || tickNodes.length === 0) return false

  const labelRect = axisLabel.getBoundingClientRect()
  if (!labelRect || !Number.isFinite(labelRect.top)) return false

  let maxTickBottom = -Infinity
  tickNodes.forEach((node) => {
    const rect = node.getBoundingClientRect()
    if (rect && Number.isFinite(rect.bottom)) {
      maxTickBottom = Math.max(maxTickBottom, rect.bottom)
    }
  })

  if (!Number.isFinite(maxTickBottom)) return false

  const minGapPx = Number.isFinite(opts.minGap) ? opts.minGap : 12
  const maxShiftPx = Number.isFinite(opts.maxShift) ? opts.maxShift : 120
  const overlapPx = maxTickBottom + minGapPx - labelRect.top
  if (overlapPx <= 0) return true

  const svgRect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null
  const currentY = parseFloat(axisLabel.getAttribute('y') || '0')
  if (!Number.isFinite(currentY)) return true

  const pxDelta = Math.min(overlapPx, maxShiftPx)
  let scaleY = 1
  if (viewBox && Number.isFinite(viewBox.height) && svgRect && Number.isFinite(svgRect.height) && svgRect.height > 0) {
    scaleY = viewBox.height / svgRect.height
  }
  axisLabel.setAttribute('y', String(currentY + pxDelta * scaleY))
  return true
}

function adjustSvgYAxisLabelClearance(svg: SVGElement, opts: { minGap?: number; maxShift?: number } = {}) {
  const axisLabel = svg.querySelector('.y-axis-label')
  if (!axisLabel) return true

  const axisGroup = svg.querySelector('.y-axis')
  if (!axisGroup) return false

  const axisRect = axisGroup.getBoundingClientRect?.()
  const labelRect = axisLabel.getBoundingClientRect?.()
  if (!axisRect || !labelRect || !Number.isFinite(axisRect.left) || !Number.isFinite(labelRect.right)) {
    return false
  }

  const minGapPx = Number.isFinite(opts.minGap) ? opts.minGap : 12
  const maxShiftPx = Number.isFinite(opts.maxShift) ? opts.maxShift : 120
  const desiredRight = axisRect.left - minGapPx
  const overlapPx = labelRect.right - desiredRight
  if (overlapPx <= 0) return true

  const svgRect = svg.getBoundingClientRect()
  const viewBox = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null
  const currentY = parseFloat(axisLabel.getAttribute('y') || '0')
  if (!Number.isFinite(currentY)) return true

  const pxDelta = Math.min(overlapPx, maxShiftPx)
  let scaleX = 1
  if (viewBox && Number.isFinite(viewBox.width) && svgRect && Number.isFinite(svgRect.width) && svgRect.width > 0) {
    scaleX = viewBox.width / svgRect.width
  }
  axisLabel.setAttribute('y', String(currentY - pxDelta * scaleX))
  return true
}

function ensureXAxisLabelClearance(container: HTMLElement, opts: AxisClearanceOptions = {}) {
  const attempts = Math.max(1, Math.floor(opts.attempts ?? 3))
  let remaining = attempts
  const schedule =
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(cb, 16)

  const resolveAxisOpts = (axisKey: 'x' | 'y') => {
    const axisOverrides =
      opts && typeof opts === 'object' && opts[axisKey] && typeof opts[axisKey] === 'object'
        ? (opts[axisKey] as { minGap?: number; maxShift?: number })
        : null
    return {
      minGap: axisOverrides?.minGap ?? opts.minGap,
      maxShift: axisOverrides?.maxShift ?? opts.maxShift,
    }
  }

  const step = () => {
    if (remaining <= 0) return
    remaining -= 1

    schedule(() => {
      const svg = container.querySelector('svg')
      if (!svg) {
        if (remaining > 0) step()
        return
      }
      const handledX = adjustSvgXAxisLabelClearance(svg, resolveAxisOpts('x'))
      const handledY = adjustSvgYAxisLabelClearance(svg, resolveAxisOpts('y'))
      if ((!handledX || !handledY) && remaining > 0) {
        step()
      }
    })
  }

  step()
}

function adjustXAxisLabelAngle(container: HTMLElement) {
  setTimeout(() => {
    const svg = container.querySelector('svg')
    if (!svg) return

    const xAxisLabels = svg.querySelectorAll('.mark-text.role-axis-label[aria-hidden="true"]')
    if (!xAxisLabels || xAxisLabels.length === 0) return

    let maxLabelLength = 0
    let totalOverlap = 0
    const labels = Array.from(xAxisLabels)

    labels.forEach((label) => {
      const text = label.textContent || ''
      maxLabelLength = Math.max(maxLabelLength, text.length)
    })

    for (let i = 0; i < labels.length - 1; i++) {
      const rect1 = labels[i].getBoundingClientRect()
      const rect2 = labels[i + 1].getBoundingClientRect()
      if (rect1.right > rect2.left) {
        totalOverlap += rect1.right - rect2.left
      }
    }

    let targetAngle = 0

    if (totalOverlap > 20 || maxLabelLength > 12) {
      if (maxLabelLength > 20) {
        targetAngle = -90
      } else {
        targetAngle = -45
      }
    }

    if (targetAngle !== 0) {
      labels.forEach((label) => {
        const currentTransform = label.getAttribute('transform') || ''
        const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/)

        if (match) {
          const x = parseFloat(match[1])
          const y = parseFloat(match[2])

          label.setAttribute('text-anchor', 'end')
          label.setAttribute('transform', `translate(${x},${y}) rotate(${targetAngle})`)
        }
      })

      const chartRect = svg.getBoundingClientRect()
      const currentHeight = parseFloat(svg.getAttribute('height') || '0') || chartRect.height
      const additionalPadding = targetAngle === -90 ? 80 : 40
      svg.setAttribute('height', String(currentHeight + additionalPadding))
    }
  }, 100)
}

/**
 * Render a Vega-Lite spec into the provided container element.
 * @param container Host element that will contain the SVG.
 * @param spec Vega-Lite specification object.
 * @param options Optional vega-embed options (renderer/actions/etc).
 */
export async function renderVegaLiteChart(
  container: HTMLElement,
  spec: VegaLiteSpec,
  options: VegaEmbedOptions = {},
) {
  const canvas = ensureChartCanvas(container)
  const target = canvas || container

  if (!target) {
    console.warn('renderVegaLiteChart: unable to resolve chart container')
    return null
  }

  while (target.firstChild) {
    target.removeChild(target.firstChild)
  }

  if (!spec || typeof spec !== 'object') {
    console.warn('renderVegaLiteChart: expected a Vega-Lite specification object')
    return null
  }

  const embed = resolveVegaEmbed()
  if (typeof embed !== 'function') {
    console.warn('renderVegaLiteChart: vegaEmbed is not available on the global scope')
    return null
  }

  const enhancedSpec: VegaLiteSpec = {
    ...normalizeSchema(spec),
    config: {
      ...(spec.config || {}),
      axis: {
        labelFontSize: 11,
        titleFontSize: 13,
        titlePadding: 10,
        labelPadding: 5,
        labelLimit: 0,
        ...(spec.config as { axis?: Record<string, unknown> } | undefined)?.axis,
      },
    },
  }

  await applyAutoLineDomain(enhancedSpec)

  const embedOptions: VegaEmbedOptions = {
    actions: false,
    renderer: 'svg',
    padding: { left: 70, right: 30, top: 30, bottom: 70 },
    ...options,
  }

  const result = await embed(target, enhancedSpec, embedOptions)

  adjustXAxisLabelAngle(target)
  ensureXAxisLabelClearance(target, { attempts: 5, minGap: 14, maxShift: 140 })

  return result
}

/**
 * If the incoming spec uses an old Vega-Lite schema (e.g., v3), bump it to v5
 * to silence version warnings while keeping the content intact.
 */
function normalizeSchema(input: VegaLiteSpec): VegaLiteSpec {
  const spec = { ...input }
  const schema = typeof spec.$schema === 'string' ? spec.$schema : ''
  const match = schema.match(/vega-lite\/v(\d+)/i)
  const major = match ? Number(match[1]) : null
  if (!major || major < 5) {
    spec.$schema = 'https://vega.github.io/schema/vega-lite/v5.json'
  }
  return spec
}
