import vegaEmbedLib from 'vega-embed'
import type { JsonObject, JsonValue } from '../types'
import { normalizeSpec as normalizeSpecDomain } from '../domain/chart/normalizeSpec'
import { loadRowsFromVegaLiteData, normalizeVegaLiteDataUrl } from './vegaLite/dataLoader'
import { ensureStableOrdinalColorMapping } from './vegaLite/colorScaleStability'
import { DataAttributes, SvgClassNames } from './interfaces'

/**
 * Minimal Vega-Lite spec shape we care about for embedding/rendering.
 * This keeps the typing light while still providing structure.
 */
export interface VegaLiteSpec {
  $schema?: string
  data?: {
    url?: string
    values?: JsonValue[]
    [key: string]: JsonValue | undefined
  }
  mark?: string | { type?: string; [key: string]: JsonValue | undefined }
  encoding?: Record<string, JsonValue>
  layer?: Array<Record<string, JsonValue>>
  config?: Record<string, JsonValue>
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
  SIMPLE_LINE: 'Simple line chart',
  MULTI_LINE: 'Multi line chart',
})

export type ChartTypeValue = (typeof ChartType)[keyof typeof ChartType]

type VegaEmbedResult = {
  view?: object
  spec?: VegaLiteSpec
  [key: string]: JsonValue | object | undefined
}

type VegaEmbedFn = (container: HTMLElement, spec: VegaLiteSpec, options?: VegaEmbedOptions) => Promise<VegaEmbedResult>
type VegaViewLike = {
  renderer?: (rendererType?: 'svg' | 'canvas') => unknown
  runAsync?: () => Promise<unknown>
}

type EncodingHint = {
  xField: string
  yField: string
  xType?: string
  yType?: string
  colorField?: string
}

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

type EncodingChannel = {
  field?: JsonValue
  type?: JsonValue
  stack?: JsonValue
  scale?: { domain?: JsonValue; domainMin?: JsonValue; domainMax?: JsonValue; nice?: JsonValue; zero?: JsonValue }
}

type EncodingMap = Record<string, EncodingChannel | undefined>

declare const vegaEmbed: VegaEmbedFn | undefined

export function getRenderEpoch(container: HTMLElement) {
  const raw = container.getAttribute(DataAttributes.RenderEpoch)
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function bumpRenderEpoch(container: HTMLElement, target?: HTMLElement | null) {
  const nextEpoch = getRenderEpoch(container) + 1
  container.setAttribute(DataAttributes.RenderEpoch, String(nextEpoch))
  if (target && target !== container) {
    target.setAttribute(DataAttributes.RenderEpoch, String(nextEpoch))
  }
  return nextEpoch
}

function syncSvgRenderEpoch(target: HTMLElement, epoch: number) {
  target.querySelectorAll('svg').forEach((svg) => {
    svg.setAttribute(DataAttributes.RenderEpoch, String(epoch))
  })
}

/** Resolve mark type to a string, handling object form. */
function normalizeMarkType(mark: VegaLiteSpec['mark']) {
  if (!mark) return null
  if (typeof mark === 'string') return mark
  if (typeof mark === 'object' && typeof mark.type === 'string') {
    return mark.type
  }
  return null
}

function hasFieldChannel(channel: JsonValue | undefined) {
  if (!channel) return false
  if (typeof channel === 'string') return true
  if (typeof channel === 'object') {
    const channelObj = channel as { field?: JsonValue; condition?: JsonValue }
    if (channelObj.field) return true
    if (Array.isArray(channelObj.condition)) {
      return channelObj.condition.some((c) => !!(c as { field?: JsonValue })?.field)
    }
    if (channelObj.condition && (channelObj.condition as { field?: JsonValue }).field) return true
  }
  return false
}

function normalizeLayers(spec: VegaLiteSpec = {}) {
  const baseEncoding =
    spec.encoding && typeof spec.encoding === 'object' ? (spec.encoding as Record<string, JsonValue>) : {}
  if (Array.isArray(spec.layer) && spec.layer.length > 0) {
    return spec.layer.map((layer) => ({
      mark: normalizeMarkType((layer?.mark as VegaLiteSpec['mark']) ?? spec.mark),
      encoding: {
        ...baseEncoding,
        ...(layer?.encoding && typeof layer.encoding === 'object' ? layer.encoding : {}),
      },
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
  const hasFacet = !!(
    (baseEnc as { column?: JsonValue }).column || (baseEnc as { row?: JsonValue }).row || spec.facet || spec.repeat
  )

  const barLayer = layers.find((layer) => layer.mark === 'bar')
  if (barLayer) {
    const encoding = (barLayer.encoding || {}) as EncodingMap
    const hasColor = !!encoding.color
    const hasXOffset = hasFieldChannel((encoding as Record<string, JsonValue>).xOffset)

    if (hasFacet) {
      // Faceted bar views are treated as grouped/multi-series bars in this app.
      return ChartType.GROUPED_BAR
    }

    const isSingleSeriesColor =
      encoding.color?.field === encoding.y?.field &&
      encoding.x?.type === 'quantitative' &&
      encoding.y?.type === 'nominal'

    if (!hasColor || isSingleSeriesColor) {
      return ChartType.SIMPLE_BAR
    }
    if (hasXOffset) {
      return ChartType.GROUPED_BAR
    }

    const stackType = encoding.y?.stack || encoding.x?.stack || null
    if (stackType !== 'none') {
      return ChartType.STACKED_BAR
    }
    return ChartType.GROUPED_BAR
  }

  const lineLayers = layers.filter((layer) => layer.mark === 'line')
  if (lineLayers.length > 0) {
    const colorInLayers = layers.some((layer) => hasFieldChannel((layer.encoding as EncodingMap)?.color))
    const colorInBase = hasFieldChannel((baseEnc as Record<string, JsonValue>).color)
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
    const embedFn = globalObj.vega.embed
    return (container: HTMLElement, spec: VegaLiteSpec, options?: VegaEmbedOptions) =>
      embedFn(container, spec, options) as Promise<VegaEmbedResult>
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
  const encodings: EncodingMap[] = []
  if (isLineMark(spec.mark) && spec.encoding) {
    encodings.push(spec.encoding as EncodingMap)
  }
  if (Array.isArray(spec.layer)) {
    spec.layer.forEach((layer) => {
      if (isLineMark(layer?.mark as VegaLiteSpec['mark']) && layer?.encoding) {
        encodings.push(layer.encoding as EncodingMap)
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

  const hasExplicitDomain = lineEncodings.some((enc) => {
    const scale = enc?.y?.scale
    if (!scale) return false
    return scale.domain !== undefined || scale.domainMin !== undefined || scale.domainMax !== undefined
  })
  if (hasExplicitDomain) return spec

  const yFields = Array.from(
    new Set(lineEncodings.map((enc) => enc?.y?.field).filter(Boolean)),
  )
  if (yFields.length === 0) return spec

  const dataRef =
    spec.data || (Array.isArray(spec.layer) ? (spec.layer.find((l) => l?.data)?.data as VegaLiteSpec['data']) : undefined)
  const rows = await loadRowsForSpecData(dataRef)
  if (!Array.isArray(rows) || rows.length === 0) return spec

  let minVal = Infinity
  let maxVal = -Infinity
  rows.forEach((row) => {
    yFields.forEach((field) => {
      const value = Number((row as Record<string, JsonValue>)?.[field as string])
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

  const minGapPx = Number.isFinite(opts.minGap as number) ? (opts.minGap as number) : 12
  const maxShiftPx = Number.isFinite(opts.maxShift as number) ? (opts.maxShift as number) : 120
  const overlapPx = maxTickBottom + minGapPx - labelRect.top
  if (overlapPx <= 0) return true

  const svgRect = svg.getBoundingClientRect()
  const viewBox = (svg as SVGSVGElement).viewBox && (svg as SVGSVGElement).viewBox.baseVal ? (svg as SVGSVGElement).viewBox.baseVal : null
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

  const minGapPx = Number.isFinite(opts.minGap as number) ? (opts.minGap as number) : 12
  const maxShiftPx = Number.isFinite(opts.maxShift as number) ? (opts.maxShift as number) : 120
  const desiredRight = axisRect.left - minGapPx
  const overlapPx = labelRect.right - desiredRight
  if (overlapPx <= 0) return true

  const svgRect = svg.getBoundingClientRect()
  const viewBox = (svg as SVGSVGElement).viewBox && (svg as SVGSVGElement).viewBox.baseVal ? (svg as SVGSVGElement).viewBox.baseVal : null
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

function applyAxisContrast(container: HTMLElement) {
  const svg = container.querySelector('svg')
  if (!svg) return

  const setStroke = (selector: string) => {
    svg.querySelectorAll<SVGElement>(selector).forEach((node) => {
      node.setAttribute('stroke', '#000000')
      node.setAttribute('stroke-opacity', '1')
      node.style.setProperty('stroke', '#000000')
      node.style.setProperty('stroke-opacity', '1')
    })
  }

  const setFill = (selector: string) => {
    svg.querySelectorAll<SVGElement>(selector).forEach((node) => {
      node.setAttribute('fill', '#000000')
      node.setAttribute('fill-opacity', '1')
      node.style.setProperty('fill', '#000000')
      node.style.setProperty('fill-opacity', '1')
      node.style.setProperty('opacity', '1')
    })
  }

  // Vega axis groups and marks.
  setStroke('.role-axis line')
  setStroke('.role-axis path')
  setStroke('.role-axis .mark-rule')
  setFill('.role-axis .role-axis-label')
  setFill('.role-axis .role-axis-title')
  setFill('.mark-text.role-axis-label')
  setFill('.mark-text.role-axis-title')

  // Custom labels added by renderers.
  setFill('.x-axis-label')
  setFill('.y-axis-label')
}

function normalizeSchemaForEmbed(spec: VegaLiteSpec): VegaLiteSpec {
  const rawSchema = typeof spec.$schema === 'string' ? spec.$schema : ''
  if (!rawSchema) return spec
  if (!/vega-lite\/v3/i.test(rawSchema)) return spec

  const cloned: VegaLiteSpec = (() => {
    try {
      return structuredClone(spec)
    } catch {
      return JSON.parse(JSON.stringify(spec)) as VegaLiteSpec
    }
  })()
  cloned.$schema = 'https://vega.github.io/schema/vega-lite/v5.json'
  return cloned
}

function patchSpecDataUrls(spec: VegaLiteSpec): VegaLiteSpec {
  const clone: VegaLiteSpec = (() => {
    try {
      return structuredClone(spec)
    } catch {
      return JSON.parse(JSON.stringify(spec)) as VegaLiteSpec
    }
  })()

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item))
      return
    }

    const rec = node as Record<string, unknown>
    const data = rec.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const dataRec = data as Record<string, unknown>
      if (typeof dataRec.url === 'string') {
        dataRec.url = normalizeVegaLiteDataUrl(dataRec.url) ?? dataRec.url
      }
    }
    Object.values(rec).forEach((value) => walk(value))
  }

  walk(clone)
  return clone
}

function hasVisibleSvg(target: HTMLElement) {
  const svgs = Array.from(target.querySelectorAll('svg'))
  return svgs.some((svg) => {
    const style = window.getComputedStyle(svg)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false
    const rect = svg.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

async function enforceSvgRenderer(target: HTMLElement, result: VegaEmbedResult, debug: { debugDataLoader?: boolean } | null) {
  if (typeof window === 'undefined') return
  if (hasVisibleSvg(target)) return
  if (target.querySelectorAll('canvas').length === 0) return

  const view = (result?.view ?? null) as VegaViewLike | null
  if (!view || typeof view.renderer !== 'function' || typeof view.runAsync !== 'function') return

  try {
    view.renderer('svg')
    await view.runAsync()
  } catch (error) {
    if (debug?.debugDataLoader) {
      console.warn('[Workbench] failed to enforce SVG renderer', error)
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function extractField(channel: unknown): string | undefined {
  const rec = asRecord(channel)
  return typeof rec.field === 'string' && rec.field.trim() ? rec.field.trim() : undefined
}

function extractType(channel: unknown): string | undefined {
  const rec = asRecord(channel)
  return typeof rec.type === 'string' && rec.type.trim() ? rec.type.trim() : undefined
}

function collectEncodingHints(spec: VegaLiteSpec): EncodingHint[] {
  const layers = normalizeLayers(spec)
  const hints: EncodingHint[] = []
  const seen = new Set<string>()

  layers.forEach((layer) => {
    const encoding = asRecord(layer.encoding)
    const xChannel = encoding.x
    const yChannel = encoding.y
    const colorChannel = encoding.color
    const xField = extractField(xChannel)
    const yField = extractField(yChannel)
    if (!xField || !yField) return
    const hint: EncodingHint = {
      xField,
      yField,
      xType: extractType(xChannel),
      yType: extractType(yChannel),
      colorField: extractField(colorChannel),
    }
    const key = `${hint.xField}|${hint.yField}|${hint.colorField ?? ''}|${hint.xType ?? ''}|${hint.yType ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    hints.push(hint)
  })

  return hints
}

function toTemporalTarget(raw: unknown): string | null {
  if (raw == null) return null
  const date = raw instanceof Date ? raw : new Date(String(raw))
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function resolveDatumForMark(mark: SVGElement): Record<string, unknown> {
  const ownerData = asRecord((mark as SVGElement & { __data__?: unknown }).__data__)
  const embeddedDatum = asRecord(ownerData.datum)
  if (Object.keys(embeddedDatum).length > 0) return embeddedDatum
  if (Object.keys(ownerData).length > 0) return ownerData

  // Vega sometimes binds datum on a parent group (e.g. symbol marks).
  let parent: Element | null = mark.parentElement
  for (let i = 0; i < 3 && parent; i += 1) {
    const parentOwner = asRecord((parent as Element & { __data__?: unknown }).__data__)
    const parentDatum = asRecord(parentOwner.datum)
    if (Object.keys(parentDatum).length > 0) return parentDatum
    if (Object.keys(parentOwner).length > 0) return parentOwner
    parent = parent.parentElement
  }

  // Vega often binds datum to a child path inside a graphics-symbol group.
  // When annotating groups (role=graphics-symbol), attempt to inherit the first child datum.
  const childCandidates = Array.from(mark.querySelectorAll<SVGElement>('path,circle,rect'))
  for (const child of childCandidates) {
    const childOwner = asRecord((child as SVGElement & { __data__?: unknown }).__data__)
    const childDatum = asRecord(childOwner.datum)
    if (Object.keys(childDatum).length > 0) return childDatum
    if (Object.keys(childOwner).length > 0) return childOwner
  }
  return {}
}

function resolveTargetAndValueFromHint(datum: Record<string, unknown>, hint: EncodingHint) {
  const rawX = datum[hint.xField]
  const rawY = datum[hint.yField]
  const xNum = Number(rawX)
  const yNum = Number(rawY)

  if (rawX != null && Number.isFinite(yNum)) {
    const target =
      hint.xType === 'temporal'
        ? toTemporalTarget(rawX) ?? String(rawX)
        : String(rawX)
    return { target, value: yNum }
  }

  if (rawY != null && Number.isFinite(xNum)) {
    const target =
      hint.yType === 'temporal'
        ? toTemporalTarget(rawY) ?? String(rawY)
        : String(rawY)
    return { target, value: xNum }
  }

  return null
}

function annotateRenderedMarksForDraw(target: HTMLElement, spec: VegaLiteSpec) {
  const hints = collectEncodingHints(spec)
  if (!hints.length) return
  const marks = Array.from(
    target.querySelectorAll<SVGElement>('svg [role="graphics-symbol"], svg rect, svg path, svg circle'),
  )
  if (!marks.length) return

  marks.forEach((mark) => {
    if (mark.classList.contains(SvgClassNames.Annotation)) return
    const datum = resolveDatumForMark(mark)
    if (Object.keys(datum).length === 0) return

    let matched: { hint: EncodingHint; target: string; value: number } | null = null
    for (const hint of hints) {
      const resolved = resolveTargetAndValueFromHint(datum, hint)
      if (!resolved) continue
      matched = { hint, ...resolved }
      break
    }
    if (!matched) return

    const { hint, target, value } = matched
    mark.setAttribute(DataAttributes.Target, target)
    mark.setAttribute(DataAttributes.Value, String(value))

    const rawSeries = hint.colorField ? datum[hint.colorField] : null
    const series = rawSeries == null ? '' : String(rawSeries)
    if (series) {
      mark.setAttribute(DataAttributes.Series, series)
    }

    if (!mark.getAttribute(DataAttributes.Id)) {
      const id = series ? `${target}__${series}` : target
      mark.setAttribute(DataAttributes.Id, id)
    }
  })
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
  const renderEpoch = bumpRenderEpoch(container, target)

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

  const debugOpts =
    typeof window !== 'undefined' && window && typeof (window as any).__WORKBENCH_VEGA_DEBUG__ === 'object'
      ? ((window as any).__WORKBENCH_VEGA_DEBUG__ as {
          logEmbedSpec?: boolean
          logColorStability?: boolean
          debugDataLoader?: boolean
        })
      : null

  const normalizedSpec: VegaLiteSpec = (() => {
    // Apply the same safe defaults the app uses elsewhere (sizes, padding, axis/range defaults),
    // but do not override explicit encodings or scale domains.
    const normalized = normalizeSpecDomain(spec as any) as unknown as VegaLiteSpec

    // Respect container width like the legacy renderChart path (prevents unexpected sizing regressions).
    const hostWidthRaw = Math.max(0, container.getBoundingClientRect?.().width || container.clientWidth || 0)
    const hostWidth = hostWidthRaw > 0 ? Math.min(hostWidthRaw, 800) : 800
    const hasExplicitPadding = Object.prototype.hasOwnProperty.call(spec as Record<string, unknown>, 'padding')
    const hasExplicitAutosize = Object.prototype.hasOwnProperty.call(spec as Record<string, unknown>, 'autosize')
    const encoding = normalized.encoding && typeof normalized.encoding === 'object' ? (normalized.encoding as any) : null
    const hasFacetChart = !!(
      (encoding && (encoding.column || encoding.row)) ||
      (normalized as any).facet ||
      (normalized as any).repeat
    )

    if (hostWidth > 0) {
      if (hasFacetChart) {
        const preferredCellWidth = Math.min(180, hostWidth - 40)
        normalized.width = Math.max(140, preferredCellWidth)
        if (!hasExplicitAutosize) {
          delete (normalized as any).autosize
        }
        if (!hasExplicitPadding) {
          normalized.padding = { left: 12, right: 12, top: 20, bottom: 24 } as any
        }
      } else {
        normalized.width = Math.min((normalized.width ?? hostWidth) as number, hostWidth - 10)
      }
    }

    return normalized
  })()

  const enhancedSpec: VegaLiteSpec = (() => {
    // Clone defensively: downstream helpers may add safe defaults.
    let cloned: VegaLiteSpec
    try {
      cloned = structuredClone(normalizedSpec)
    } catch {
      cloned = JSON.parse(JSON.stringify(normalizedSpec)) as VegaLiteSpec
    }

    const config = (cloned.config && typeof cloned.config === 'object' ? cloned.config : {}) as Record<string, JsonValue>
    const axis = (config.axis && typeof config.axis === 'object' ? config.axis : {}) as Record<string, JsonValue>
    const axisY = (config.axisY && typeof config.axisY === 'object' ? config.axisY : {}) as Record<string, JsonValue>
    const view = (config.view && typeof config.view === 'object' ? config.view : {}) as Record<string, JsonValue>

    const nextAxis: Record<string, JsonValue> = {
      labelFontSize: 11,
      titleFontSize: 13,
      titlePadding: 10,
      labelPadding: 5,
      labelLimit: 0,
      ...axis,
    }

    const nextAxisY: Record<string, JsonValue> = {
      ...axisY,
      ...(axisY.grid === undefined ? { grid: false } : {}),
    }

    const nextView: Record<string, JsonValue> = {
      ...view,
      ...(view.stroke === undefined ? { stroke: 'transparent' } : {}),
    }

    cloned.config = {
      ...config,
      axis: nextAxis,
      axisY: nextAxisY,
      view: nextView,
    }

    // Workbench design default: if a simple bar spec does not specify any color encoding
    // or mark/config color, use the historical default bar fill (#69b3a2) instead of
    // Vega-Lite's default palette (often #4c78a8).
    try {
      const inferred = getChartType(cloned)
      const markType = normalizeMarkType(cloned.mark)
      const encoding = cloned.encoding && typeof cloned.encoding === 'object' ? (cloned.encoding as Record<string, JsonValue>) : {}
      const hasColorEncoding = hasFieldChannel(encoding.color)
      const markRec = cloned.mark && typeof cloned.mark === 'object' && !Array.isArray(cloned.mark) ? (cloned.mark as Record<string, JsonValue>) : {}
      const hasMarkColor = typeof markRec.color === 'string' || typeof markRec.fill === 'string'
      const configMark = asRecord((cloned.config as any)?.mark)
      const hasConfigMarkColor = typeof configMark.color === 'string' && configMark.color.trim().length > 0

      if (inferred === ChartType.SIMPLE_BAR && markType === 'bar' && !hasColorEncoding && !hasMarkColor && !hasConfigMarkColor) {
        cloned.mark = { ...markRec, type: 'bar', color: '#69b3a2' }
      }
    } catch {
      // ignore default injection failures
    }

    return cloned
  })()

  await applyAutoLineDomain(enhancedSpec)

  const schemaNormalizedSpec = normalizeSchemaForEmbed(enhancedSpec)
  const dataPatchedSpec = patchSpecDataUrls(schemaNormalizedSpec)

  let finalSpec: VegaLiteSpec = dataPatchedSpec
  try {
    const stabilizedPromise = ensureStableOrdinalColorMapping(dataPatchedSpec as unknown as Record<string, unknown>, {
      loadRows: async (data) =>
        loadRowsFromVegaLiteData(data as any, {
          debug: !!debugOpts?.debugDataLoader,
          debugLabel: typeof (data as any)?.url === 'string' ? String((data as any).url) : 'inline-values',
        }),
      debug: { logColorStability: !!debugOpts?.logColorStability },
      legendBehavior: 'presentOnly',
    }) as Promise<VegaLiteSpec>

    const stabilizedOrTimeout = await Promise.race<VegaLiteSpec | null>([
      stabilizedPromise,
      new Promise<null>((resolve) => {
        // NOTE: Color stability injection may require fetching/parsing CSV data (and applying transforms).
        // We intentionally allow a generous timeout here to avoid silently skipping the injection for
        // larger datasets, which would cause series/group → color remapping after filter ops.
        window.setTimeout(() => resolve(null), 8000)
      }),
    ])
    if (stabilizedOrTimeout) {
      finalSpec = stabilizedOrTimeout
    } else if (debugOpts?.debugDataLoader) {
      console.warn('[Workbench] skip color stability injection (timeout)')
    }
  } catch (error) {
    if (debugOpts?.debugDataLoader) {
      console.warn('[Workbench] skip color stability injection (error)', error)
    }
  }

  const embedOptions: VegaEmbedOptions = {
    actions: false,
    mode: 'vega-lite',
    renderer: 'svg',
    ...options,
  }

  ;(container as any).__lastVegaLiteSpec = finalSpec
  ;(container as any).__lastVegaEmbedOptions = embedOptions
  if (canvas) {
    ;(canvas as any).__lastVegaLiteSpec = finalSpec
    ;(canvas as any).__lastVegaEmbedOptions = embedOptions
  }
  if (debugOpts?.logEmbedSpec) {
    console.log('[Workbench] vegaEmbed spec (final)', finalSpec)
  }

  const result = await embed(target, finalSpec, embedOptions)
  syncSvgRenderEpoch(target, renderEpoch)
  await enforceSvgRenderer(target, result, debugOpts)
  annotateRenderedMarksForDraw(target, finalSpec)
  ;(container as any).__lastVegaEmbedResult = result
  if (canvas) {
    ;(canvas as any).__lastVegaEmbedResult = result
  }

  adjustXAxisLabelAngle(target)
  ensureXAxisLabelClearance(target, { attempts: 5, minGap: 14, maxShift: 140 })
  applyAxisContrast(target)
  setTimeout(() => applyAxisContrast(target), 140)

  return result
}

// NOTE: Do not rewrite `$schema`. Workbench should render incoming specs "as-is"
// (v3/v5 examples) and avoid altering semantics or user expectations.
