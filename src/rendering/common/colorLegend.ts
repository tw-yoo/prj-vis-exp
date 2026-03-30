import * as d3 from 'd3'
import type { ChartSpec } from '../../domain/chart'
import { CHART_TEXT_SIZE } from '../config/chartTextConfig'
import { SvgAttributes, SvgElements } from '../interfaces'
import type { LayoutModel } from './chartLayout'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function isLegendVisible(channel: unknown) {
  const legend = asRecord(channel).legend
  return legend !== null && legend !== false
}

export function resolveColorLegendTitle(channel: unknown, fallbackField: string | null) {
  const color = asRecord(channel)
  if (Object.prototype.hasOwnProperty.call(color, 'title')) {
    const title = color.title
    if (title == null) return null
    if (typeof title === 'string') {
      const trimmed = title.trim()
      return trimmed.length > 0 ? trimmed : null
    }
  }
  return fallbackField
}

export function resolveTopLevelColorChannel(spec: ChartSpec) {
  return asRecord(asRecord((spec as { encoding?: unknown }).encoding).color)
}

type RenderColorLegendOptions = {
  svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>
  layout: LayoutModel
  margin: LayoutModel['padding']
  plotWidth: number
  items: Array<{ label: string; color: string }>
  title?: string | null
}

export function renderColorLegend(options: RenderColorLegendOptions) {
  const { svg, layout, margin, plotWidth, items, title = null } = options
  if (items.length === 0) return null

  const legend = svg
    .append(SvgElements.Group)
    .attr(SvgAttributes.Transform, `translate(${margin.left + plotWidth + layout.legend.offsetX},${margin.top})`)

  if (title) {
    legend
      .append(SvgElements.Text)
      .attr(SvgAttributes.X, 0)
      .attr(SvgAttributes.Y, 0)
      .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.legendTitle)
      .attr(SvgAttributes.FontWeight, 'bold')
      .attr(SvgAttributes.DominantBaseline, 'hanging')
      .text(title)
  }

  items.forEach((item, index) => {
    const rowY =
      (title ? CHART_TEXT_SIZE.legendTitle + layout.legend.titleGap : 0) +
      index * (CHART_TEXT_SIZE.legendLabel + layout.legend.rowGap)

    legend
      .append(SvgElements.Circle)
      .attr(SvgAttributes.CX, 8)
      .attr(SvgAttributes.CY, rowY + CHART_TEXT_SIZE.legendLabel / 2)
      .attr(SvgAttributes.R, 5)
      .attr(SvgAttributes.Fill, item.color)
      .attr(SvgAttributes.Opacity, 0.85)

    legend
      .append(SvgElements.Text)
      .attr(SvgAttributes.X, 20)
      .attr(SvgAttributes.Y, rowY + CHART_TEXT_SIZE.legendLabel / 2)
      .attr(SvgAttributes.FontSize, CHART_TEXT_SIZE.legendLabel)
      .attr(SvgAttributes.DominantBaseline, 'middle')
      .text(item.label)
  })

  return legend
}
