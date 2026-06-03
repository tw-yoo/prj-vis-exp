import * as d3 from 'd3'
import { DataAttributes, SvgAttributes, SvgClassNames, SvgElements } from '../../rendering/interfaces'
import { COLORS, DURATIONS, EASINGS } from '../../rendering/common/d3Helpers'

/**
 * Replace the simple-bar chart's existing `.main-bar` rects in place with new
 * bars representing supplied derived scalars (e.g. the two pairwise
 * differences fed into a downstream diff(of diffs) op). Used when an operation
 * consumes `ref:nX` inputs that resolve to scalar values which are NOT visible
 * as marks on the current chart, and the standard cross-bar arrow would have
 * nothing meaningful to point at.
 *
 * The chart skeleton (margins, y-axis, plot box) is preserved. Only the bars,
 * x-axis ticks, and x-axis title are rewritten. Y-axis is intentionally NOT
 * rescaled so the new bars sit on the same vertical reference as the original
 * data — this matches the user's expectation per feedback case
 * `0pzdf7hfbxgjghsa` ("축은 그대로 두고 새로운 bar와 axis title, label만 사용").
 */
export interface DerivedBarRow {
  label: string
  value: number
  /** Optional `ref:nX` source so the new bar can be tagged for downstream ops. */
  ref?: string
}

export interface RebindDerivedBarsOptions {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  rows: DerivedBarRow[]
  /** New x-axis title (e.g. "Difference between 2016→2017 and 2017→2018"). */
  xAxisTitle: string
  /** Fill colour for the new bars. Defaults to the standard bar fill. */
  fill?: string
}

const DERIVED_BAR_CLASS = `${SvgClassNames.MainBar} derived-bar`
const DERIVED_TICK_CLASS = 'tick derived-tick'

export async function rebindDerivedBars(opts: RebindDerivedBarsOptions): Promise<void> {
  const { svg, rows, xAxisTitle } = opts
  if (rows.length === 0) return

  const marginLeft = Number(svg.attr(DataAttributes.MarginLeft) ?? 0)
  const marginTop = Number(svg.attr(DataAttributes.MarginTop) ?? 0)
  const plotWidth = Number(svg.attr(DataAttributes.PlotWidth) ?? 0)
  const plotHeight = Number(svg.attr(DataAttributes.PlotHeight) ?? 0)
  if (!(plotWidth > 0) || !(plotHeight > 0)) return

  const skeleton = svg.select<SVGGElement>('g.chart-skeleton')
  if (skeleton.empty()) return

  const barMarks = skeleton.select<SVGGElement>('g.bar-marks')
  if (barMarks.empty()) return

  // Read current y-domain from the existing bars so the new bars sit on the
  // same scale. We compute pixelsPerValue from any existing bar's height/value.
  const samples = barMarks
    .selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
    .nodes()
    .map((node) => {
      const value = Number(node.getAttribute(DataAttributes.Value))
      const y = Number(node.getAttribute(SvgAttributes.Y))
      const height = Number(node.getAttribute(SvgAttributes.Height))
      return Number.isFinite(value) && value !== 0 && Number.isFinite(y) && Number.isFinite(height)
        ? { value, y, height }
        : null
    })
    .filter((sample): sample is NonNullable<typeof sample> => sample !== null)

  if (samples.length === 0) return
  const reference = samples[0]
  const zeroY = reference.value >= 0 ? reference.y + reference.height : reference.y
  // Map a value → bar-top y from TWO distinct-value samples (a linear fit across
  // the existing bars), so the new bars sit on the SAME scale regardless of the
  // chart's baseline. The old `reference.height / reference.value` ratio assumed
  // a FROM-ZERO domain and collapsed to 0 when the first existing bar was the
  // domain MINIMUM (height 0) — e.g. on a zoomed [0.69,0.72] domain after a
  // sort→bar conversion — which mapped every value to the baseline and made all
  // derived bars vanish (height 1). For a from-zero chart this fit is identical
  // to the old behaviour; for a non-zero baseline it stays correct.
  const other = samples.find((sample) => sample.value !== reference.value)
  const yForValue = other
    ? (value: number) =>
        reference.y + (value - reference.value) * ((other.y - reference.y) / (other.value - reference.value))
    : (value: number) => zeroY - value * (reference.height / Math.abs(reference.value || 1))

  // Fade out + remove the existing bars.
  const existingBars = barMarks.selectAll<SVGRectElement, unknown>(`rect.${SvgClassNames.MainBar}`)
  await existingBars
    .interrupt()
    .transition()
    .duration(DURATIONS.REMOVE)
    .ease(EASINGS.SMOOTH)
    .style(SvgAttributes.Opacity, 0)
    .end()
    .catch(() => {})
  existingBars.remove()

  // Compute a band scale for the derived bars across the existing plot width.
  const band = d3
    .scaleBand<string>()
    .domain(rows.map((row) => row.label))
    .range([0, plotWidth])
    .padding(0.25)

  const fill = opts.fill ?? COLORS.ANNOTATION_RED

  // Append the new bars (positions relative to the skeleton transform, which
  // already translates by (marginLeft, marginTop)).
  const newBars = barMarks
    .selectAll<SVGRectElement, DerivedBarRow>('rect.derived-bar')
    .data(rows, (d) => d.label)
    .enter()
    .append(SvgElements.Rect)
    .attr(SvgAttributes.Class, DERIVED_BAR_CLASS)
    .attr(SvgAttributes.X, (d) => band(d.label) ?? 0)
    .attr(SvgAttributes.Width, band.bandwidth())
    .attr(SvgAttributes.Y, (d) => {
      const y = yForValue(d.value)
      return d.value >= 0 ? y : zeroY
    })
    .attr(SvgAttributes.Height, (d) => Math.max(1, Math.abs(yForValue(d.value) - zeroY)))
    .attr(SvgAttributes.Fill, fill)
    .attr(DataAttributes.Id, (d) => d.label)
    .attr(DataAttributes.Target, (d) => d.label)
    .attr(DataAttributes.Value, (d) => String(d.value))
    .attr(DataAttributes.XValue, (d) => d.label)
    .attr(DataAttributes.YValue, (d) => String(d.value))
    .style(SvgAttributes.Opacity, 0)

  newBars.each(function (datum) {
    if (datum.ref) {
      this.setAttribute('data-operation-result-ref', datum.ref)
    }
  })

  await newBars
    .transition()
    .duration(DURATIONS.HIGHLIGHT)
    .ease(EASINGS.SMOOTH)
    .style(SvgAttributes.Opacity, 1)
    .end()
    .catch(() => {})

  // Rewrite x-axis ticks to match the new band.
  const xAxis = skeleton.select<SVGGElement>(`g.${SvgClassNames.XAxis}`)
  xAxis.selectAll('g.tick').remove()
  const tickGroup = xAxis
    .selectAll<SVGGElement, DerivedBarRow>('g.derived-tick')
    .data(rows, (d) => d.label)
    .enter()
    .append(SvgElements.Group)
    .attr(SvgAttributes.Class, DERIVED_TICK_CLASS)
    .attr(SvgAttributes.Transform, (d) => `translate(${(band(d.label) ?? 0) + band.bandwidth() / 2},0)`)
  tickGroup.append(SvgElements.Line).attr(SvgAttributes.Stroke, 'currentColor').attr('y2', 6)
  tickGroup
    .append(SvgElements.Text)
    .attr(SvgAttributes.Fill, 'currentColor')
    .attr(SvgAttributes.Y, 9)
    .attr('dy', '0.71em')
    .attr(SvgAttributes.TextAnchor, 'middle')
    .attr(SvgAttributes.FontSize, 13)
    .text((d) => d.label)

  // Update the x-axis title.
  const titleNode = svg.select<SVGTextElement>(`text.${SvgClassNames.XAxisLabel}`)
  if (!titleNode.empty()) {
    titleNode.text(xAxisTitle)
  }
}
