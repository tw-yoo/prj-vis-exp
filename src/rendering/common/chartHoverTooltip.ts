import type * as d3 from 'd3'
import { DataAttributes } from '../interfaces'

const TOOLTIP_CLASS = 'chart-hover-tooltip'
const TOOLTIP_ROW_CLASS = 'chart-hover-tooltip__row'
const TOOLTIP_LABEL_CLASS = 'chart-hover-tooltip__label'
const TOOLTIP_VALUE_CLASS = 'chart-hover-tooltip__value'
const TOOLTIP_TARGET_SELECTOR = `rect.main-bar[${DataAttributes.XValue}][${DataAttributes.YValue}], circle[${DataAttributes.XValue}][${DataAttributes.YValue}]`

const tooltipCleanupStore: WeakMap<HTMLElement, () => void> = new WeakMap()
const numericFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

type TooltipMetadata = {
  xLabel: string
  yLabel: string
  groupLabel?: string | null
}

type TooltipRow = {
  label: string
  value: string
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function normalizeOptionalLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function formatTooltipValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return numericFormatter.format(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed
  }
  if (value == null) return ''
  return String(value)
}

export function writeTooltipRootAttrs(
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>,
  metadata: TooltipMetadata,
) {
  svg
    .attr(DataAttributes.XLabel, normalizeLabel(metadata.xLabel, 'x'))
    .attr(DataAttributes.YLabel, normalizeLabel(metadata.yLabel, 'y'))
    .attr(DataAttributes.GroupLabel, normalizeOptionalLabel(metadata.groupLabel))
}

function createTooltipElement(container: HTMLElement) {
  const tooltip = document.createElement('div')
  tooltip.className = TOOLTIP_CLASS
  tooltip.hidden = true
  tooltip.setAttribute('aria-hidden', 'true')
  container.appendChild(tooltip)
  return tooltip
}

function renderTooltipRows(tooltip: HTMLElement, rows: TooltipRow[]) {
  tooltip.replaceChildren()
  rows.forEach((row) => {
    const wrapper = document.createElement('div')
    wrapper.className = TOOLTIP_ROW_CLASS

    const label = document.createElement('span')
    label.className = TOOLTIP_LABEL_CLASS
    label.textContent = row.label

    const value = document.createElement('span')
    value.className = TOOLTIP_VALUE_CLASS
    value.textContent = row.value

    wrapper.append(label, value)
    tooltip.appendChild(wrapper)
  })
}

function resolveTooltipRows(mark: SVGElement): TooltipRow[] {
  const svg = mark.ownerSVGElement
  if (!(svg instanceof SVGSVGElement)) return []

  const xLabel = normalizeLabel(svg.getAttribute(DataAttributes.XLabel), svg.getAttribute(DataAttributes.XField) ?? 'x')
  const yLabel = normalizeLabel(svg.getAttribute(DataAttributes.YLabel), svg.getAttribute(DataAttributes.YField) ?? 'y')
  const xValue = formatTooltipValue(mark.getAttribute(DataAttributes.XValue))
  const yValue = formatTooltipValue(mark.getAttribute(DataAttributes.YValue))
  const groupLabel = normalizeOptionalLabel(svg.getAttribute(DataAttributes.GroupLabel))
  const groupValue = formatTooltipValue(mark.getAttribute(DataAttributes.GroupValue))

  const rows: TooltipRow[] = []
  if (xValue) rows.push({ label: xLabel, value: xValue })
  if (yValue) rows.push({ label: yLabel, value: yValue })
  if (groupLabel && groupValue) rows.push({ label: groupLabel, value: groupValue })
  return rows
}

function positionTooltip(container: HTMLElement, tooltip: HTMLElement, clientX: number, clientY: number) {
  const containerRect = container.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()
  const inset = 12
  const offset = 16
  const maxLeft = Math.max(inset, containerRect.width - tooltipRect.width - inset)
  const maxTop = Math.max(inset, containerRect.height - tooltipRect.height - inset)
  const nextLeft = Math.min(Math.max(inset, clientX - containerRect.left + offset), maxLeft)
  const nextTop = Math.min(Math.max(inset, clientY - containerRect.top + offset), maxTop)
  tooltip.style.left = `${nextLeft}px`
  tooltip.style.top = `${nextTop}px`
}

function hideTooltip(tooltip: HTMLElement) {
  tooltip.hidden = true
  tooltip.setAttribute('aria-hidden', 'true')
}

/**
 * True when an element BETWEEN `mark` and `container` (exclusive) carries its
 * own tooltip binding. Happens after a surface split: the pre-split binding on
 * the root container survives while each split host gets a fresh binding from
 * its own renderChart call. The innermost binding owns the mark — the outer
 * one must stay silent or two tooltips render for one hover, the outer one
 * positioned across the whole split container.
 */
function hasInnerTooltipBinding(mark: Element, container: HTMLElement): boolean {
  let el: Element | null = mark.parentElement
  while (el && el !== container) {
    if (el instanceof HTMLElement && tooltipCleanupStore.has(el)) return true
    el = el.parentElement
  }
  return false
}

export function attachChartHoverTooltip(container: HTMLElement) {
  tooltipCleanupStore.get(container)?.()

  const tooltip = createTooltipElement(container)
  const targetMarks = Array.from(container.querySelectorAll<SVGElement>(TOOLTIP_TARGET_SELECTOR))

  const showTooltipForTarget = (target: EventTarget | null, clientX: number, clientY: number) => {
    const matched = target instanceof Element ? target.closest(TOOLTIP_TARGET_SELECTOR) : null
    if (!(matched instanceof SVGElement)) {
      hideTooltip(tooltip)
      return
    }
    if (hasInnerTooltipBinding(matched, container)) {
      hideTooltip(tooltip)
      return
    }

    const rows = resolveTooltipRows(matched)
    if (!rows.length) {
      hideTooltip(tooltip)
      return
    }

    renderTooltipRows(tooltip, rows)
    tooltip.hidden = false
    tooltip.setAttribute('aria-hidden', 'false')
    positionTooltip(container, tooltip, clientX, clientY)
  }

  const handlePointerMove = (event: PointerEvent) => {
    showTooltipForTarget(event.target, event.clientX, event.clientY)
  }

  const handleMouseMove = (event: MouseEvent) => {
    showTooltipForTarget(event.target, event.clientX, event.clientY)
  }

  const handleMouseOver = (event: MouseEvent) => {
    showTooltipForTarget(event.target, event.clientX, event.clientY)
  }

  const handlePointerOver = (event: PointerEvent) => {
    showTooltipForTarget(event.target, event.clientX, event.clientY)
  }

  const handlePointerLeave = () => {
    hideTooltip(tooltip)
  }

  const handleMouseLeave = () => {
    hideTooltip(tooltip)
  }

  container.addEventListener('pointerover', handlePointerOver)
  container.addEventListener('pointermove', handlePointerMove)
  container.addEventListener('mouseover', handleMouseOver)
  container.addEventListener('mousemove', handleMouseMove)
  container.addEventListener('pointerleave', handlePointerLeave)
  container.addEventListener('mouseleave', handleMouseLeave)

  const markCleanups = targetMarks.map((mark) => {
    const handleMarkPointerEnter = (event: PointerEvent) => {
      showTooltipForTarget(mark, event.clientX, event.clientY)
    }
    const handleMarkPointerMove = (event: PointerEvent) => {
      showTooltipForTarget(mark, event.clientX, event.clientY)
    }
    const handleMarkMouseEnter = (event: MouseEvent) => {
      showTooltipForTarget(mark, event.clientX, event.clientY)
    }
    const handleMarkMouseMove = (event: MouseEvent) => {
      showTooltipForTarget(mark, event.clientX, event.clientY)
    }
    const handleMarkPointerLeave = () => {
      hideTooltip(tooltip)
    }
    const handleMarkMouseLeave = () => {
      hideTooltip(tooltip)
    }

    mark.addEventListener('pointerenter', handleMarkPointerEnter)
    mark.addEventListener('pointermove', handleMarkPointerMove)
    mark.addEventListener('mouseenter', handleMarkMouseEnter)
    mark.addEventListener('mousemove', handleMarkMouseMove)
    mark.addEventListener('pointerleave', handleMarkPointerLeave)
    mark.addEventListener('mouseleave', handleMarkMouseLeave)

    return () => {
      mark.removeEventListener('pointerenter', handleMarkPointerEnter)
      mark.removeEventListener('pointermove', handleMarkPointerMove)
      mark.removeEventListener('mouseenter', handleMarkMouseEnter)
      mark.removeEventListener('mousemove', handleMarkMouseMove)
      mark.removeEventListener('pointerleave', handleMarkPointerLeave)
      mark.removeEventListener('mouseleave', handleMarkMouseLeave)
    }
  })

  const cleanup = () => {
    container.removeEventListener('pointerover', handlePointerOver)
    container.removeEventListener('pointermove', handlePointerMove)
    container.removeEventListener('mouseover', handleMouseOver)
    container.removeEventListener('mousemove', handleMouseMove)
    container.removeEventListener('pointerleave', handlePointerLeave)
    container.removeEventListener('mouseleave', handleMouseLeave)
    markCleanups.forEach((cleanupMark) => cleanupMark())
    if (tooltip.parentElement === container) tooltip.remove()
  }
  tooltipCleanupStore.set(container, cleanup)
}
