import { ChartType, type ChartSpec, type ChartTypeValue } from '../../domain/chart'
import { INTERNAL_LAYOUT_HINTS_KEY, type ChartLayoutHints } from '../../domain/chart/layoutHints'
import { CHART_LAYOUT_SIZE } from '../config/chartLayoutConfig'

export type LayoutPadding = {
  left: number
  right: number
  top: number
  bottom: number
}

export type LayoutModel = {
  canvas: { width: number; height: number }
  padding: LayoutPadding
  explanation: {
    top: number
    height: number
    bottom: number
    annotationTopClearance: number
  }
  plot: { x: number; y: number; width: number; height: number }
  legend: {
    visible: boolean
    width: number
    offsetX: number
    rowGap: number
    titleGap: number
  }
  facet: {
    enabled: boolean
    orientation: 'column' | 'row' | null
    count: number
    gap: number
    panelWidth: number
    panelHeight: number
    titleOffsetY: number
  }
  axisTitles: {
    x: { x: number; y: number }
    y: { x: number; y: number }
  }
  tickLayout: {
    showAllTicksByDefault: boolean
    preferCanvasExpansionOverTickHiding: boolean
    rotationReferencePolicy: 'center' | 'sign-aware-edge-midpoint'
    maxCharsPerLine: number
    maxLines: number
    allowDensityReduction: boolean
    maxDensityStep: number
    overlapTolerancePx: number
    maxUnrotatedLabelLength: number
    candidateAngles: number[]
    rotatedAnchor: 'middle' | 'end'
    clearanceMinGap: number
    clearanceMaxShift: number
  }
  splitPanels: {
    enabled: boolean
    orientation: 'vertical' | 'horizontal'
    gap: number
    panelWidth: number
    panelHeight: number
    titleOffsetY: number
  }
}

export type LayoutOverflow = {
  left: number
  right: number
  top: number
  bottom: number
}

type ResolveLayoutModelInput = {
  container: HTMLElement
  chartType: ChartTypeValue
  spec: ChartSpec
  facet?: {
    enabled: boolean
    orientation?: 'column' | 'row' | null
    count?: number
  }
  legend?: {
    visible: boolean
  }
  split?: {
    enabled: boolean
    orientation?: 'vertical' | 'horizontal'
  }
}

function toPositiveNumber(value: unknown, fallback: number) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveHostWidth(container: HTMLElement) {
  const raw = Math.max(0, container.getBoundingClientRect?.().width || container.clientWidth || 0)
  return raw > 0 ? Math.min(raw, 800) : 800
}

function resolveExplicitSize(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

function resolveLayoutHints(spec: ChartSpec): ChartLayoutHints {
  const raw = (spec as ChartSpec & { [INTERNAL_LAYOUT_HINTS_KEY]?: unknown })[INTERNAL_LAYOUT_HINTS_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      explicitWidth: false,
      explicitHeight: false,
      explicitPadding: false,
      explicitAutosize: false,
    }
  }
  const hints = raw as Partial<ChartLayoutHints>
  return {
    explicitWidth: hints.explicitWidth === true,
    explicitHeight: hints.explicitHeight === true,
    explicitPadding: hints.explicitPadding === true,
    explicitAutosize: hints.explicitAutosize === true,
  }
}

function resolvePadding(
  spec: ChartSpec,
  hints: ChartLayoutHints,
  options: { isLine: boolean; isBar: boolean; facetEnabled: boolean },
): LayoutPadding {
  if (hints.explicitPadding) {
    const raw = spec.padding
    if (typeof raw === 'number') {
      return { left: raw, right: raw, top: raw, bottom: raw }
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return {
        left: toPositiveNumber((raw as { left?: unknown }).left, 60),
        right: toPositiveNumber((raw as { right?: unknown }).right, 20),
        top: toPositiveNumber((raw as { top?: unknown }).top, 40),
        bottom: toPositiveNumber((raw as { bottom?: unknown }).bottom, 70),
      }
    }
  }

  if (options.facetEnabled) {
    if (options.isBar) {
      return { left: 18, right: 18, top: 28, bottom: 40 }
    }
    return { left: 12, right: 12, top: 20, bottom: 24 }
  }
  if (options.isLine) {
    return { left: 60, right: 20, top: 60, bottom: 80 }
  }

  const normalizedPadding = spec.padding
  if (normalizedPadding && typeof normalizedPadding === 'object' && !Array.isArray(normalizedPadding)) {
    return {
      left: toPositiveNumber((normalizedPadding as { left?: unknown }).left, 60),
      right: toPositiveNumber((normalizedPadding as { right?: unknown }).right, 20),
      top: toPositiveNumber((normalizedPadding as { top?: unknown }).top, 40),
      bottom: toPositiveNumber((normalizedPadding as { bottom?: unknown }).bottom, 70),
    }
  }

  return { left: 60, right: 20, top: 40, bottom: 70 }
}

export function resolveLayoutModel(input: ResolveLayoutModelInput): LayoutModel {
  const { container, chartType, spec } = input
  const hints = resolveLayoutHints(spec)
  const hostWidth = resolveHostWidth(container)
  const maxCanvasWidth = Math.max(240, hostWidth - 10)
  const isLine = chartType === ChartType.SIMPLE_LINE || chartType === ChartType.MULTI_LINE
  const isBar =
    chartType === ChartType.SIMPLE_BAR ||
    chartType === ChartType.GROUPED_BAR ||
    chartType === ChartType.STACKED_BAR
  const facetEnabled = input.facet?.enabled === true
  const facetOrientation = input.facet?.orientation ?? null
  const facetCount = Math.max(1, Math.floor(input.facet?.count ?? 1))
  const legendVisible = input.legend?.visible === true
  const basePadding = resolvePadding(spec, hints, { isLine, isBar, facetEnabled })
  const explanationTop = CHART_LAYOUT_SIZE.explanation.topInset
  const explanationHeight = CHART_LAYOUT_SIZE.explanation.bandHeight
  const explanationBottom = explanationTop + explanationHeight
  const annotationTopClearance = explanationBottom + CHART_LAYOUT_SIZE.explanation.annotationGap
  const minimumTopPadding = annotationTopClearance + CHART_LAYOUT_SIZE.explanation.plotGap
  const padding = {
    ...basePadding,
    top: Math.max(basePadding.top, minimumTopPadding),
  }
  const topPaddingDelta = padding.top - basePadding.top

  const legendWidth = legendVisible ? 136 : 0
  const legendOffsetX = legendVisible ? 24 : 0
  const facetGap = 24

  let canvasWidth = 600
  let canvasHeight = 300
  let plotWidth = 520
  let plotHeight = 190
  let facetPanelWidth = 0
  let facetPanelHeight = 0

  if (facetEnabled) {
    const preferredCellWidth = isBar ? 220 : Math.min(180, Math.max(140, hostWidth - 40))
    const legendReserve = legendVisible ? legendWidth + legendOffsetX : 0
    facetPanelWidth = hints.explicitWidth
      ? toPositiveNumber(spec.width, preferredCellWidth)
      : preferredCellWidth
    facetPanelHeight = hints.explicitHeight
      ? toPositiveNumber(spec.height, 300)
      : toPositiveNumber(spec.height, isLine ? 360 : 300)

    const facetContentWidth =
      facetOrientation === 'column'
        ? facetCount * facetPanelWidth + Math.max(0, facetCount - 1) * facetGap
        : facetPanelWidth
    canvasWidth = padding.left + padding.right + facetContentWidth + legendReserve
    canvasHeight =
      padding.top +
      padding.bottom +
      (facetOrientation === 'row'
        ? facetCount * facetPanelHeight + Math.max(0, facetCount - 1) * facetGap
        : facetPanelHeight)
    plotWidth = facetContentWidth
    plotHeight = canvasHeight - padding.top - padding.bottom
  } else if (isLine) {
    const preferredWidth = CHART_LAYOUT_SIZE.line.preferredWidth
    const explicitHeight = resolveExplicitSize(spec.height)
    const baseLineWidth = hints.explicitWidth
      ? toPositiveNumber(spec.width, preferredWidth)
      : Math.min(Math.max(preferredWidth, toPositiveNumber(spec.width, preferredWidth)), maxCanvasWidth)
    const legendReserve = legendVisible ? legendWidth + legendOffsetX : 0
    canvasWidth = clamp(baseLineWidth + legendReserve, 280, Math.max(280, hostWidth - 10))
    canvasHeight =
      explicitHeight != null
        ? explicitHeight + topPaddingDelta
        : padding.top + padding.bottom + CHART_LAYOUT_SIZE.line.defaultPlotHeight
    plotWidth = Math.max(160, canvasWidth - padding.left - padding.right - legendReserve)
    plotHeight = Math.max(CHART_LAYOUT_SIZE.line.minPlotHeight, canvasHeight - padding.top - padding.bottom)
  } else {
    const preferredWidth = hints.explicitWidth ? toPositiveNumber(spec.width, 600) : Math.min(toPositiveNumber(spec.width, 600), maxCanvasWidth)
    canvasWidth = clamp(preferredWidth, 240, Math.max(240, maxCanvasWidth))
    const baseCanvasHeight = hints.explicitHeight ? toPositiveNumber(spec.height, 300) : toPositiveNumber(spec.height, 300)
    canvasHeight = baseCanvasHeight + topPaddingDelta
    plotWidth = Math.max(140, canvasWidth - padding.left - padding.right)
    plotHeight = Math.max(120, canvasHeight - padding.top - padding.bottom)
  }

  const splitEnabled = input.split?.enabled === true
  const splitOrientation = input.split?.orientation ?? 'vertical'
  const splitGap = isLine ? 20 : 18

  return {
    canvas: { width: canvasWidth, height: canvasHeight },
    padding,
    explanation: {
      top: explanationTop,
      height: explanationHeight,
      bottom: explanationBottom,
      annotationTopClearance,
    },
    plot: {
      x: padding.left,
      y: padding.top,
      width: plotWidth,
      height: plotHeight,
    },
    legend: {
      visible: legendVisible,
      width: legendWidth,
      offsetX: legendOffsetX,
      rowGap: 10,
      titleGap: 8,
    },
    facet: {
      enabled: facetEnabled,
      orientation: facetOrientation,
      count: facetCount,
      gap: facetGap,
      panelWidth: facetEnabled ? (facetOrientation === 'column' ? facetPanelWidth : plotWidth) : plotWidth,
      panelHeight: facetEnabled ? (facetOrientation === 'row' ? facetPanelHeight : plotHeight) : plotHeight,
      titleOffsetY: 12,
    },
    axisTitles: {
      x: {
        x: padding.left + plotWidth / 2,
        y: canvasHeight - padding.bottom + (isLine ? 44 : 40),
      },
      y: {
        x: -(padding.top + plotHeight / 2),
        y: padding.left - (isLine ? 46 : 44),
      },
    },
    tickLayout: {
      showAllTicksByDefault: isBar,
      preferCanvasExpansionOverTickHiding: isBar,
      rotationReferencePolicy: 'sign-aware-edge-midpoint',
      maxCharsPerLine: facetEnabled && isBar ? 11 : isLine ? 14 : 12,
      maxLines: facetEnabled && isBar ? 2 : isLine ? 4 : 2,
      allowDensityReduction: !isBar,
      maxDensityStep: isBar ? 1 : 12,
      overlapTolerancePx: facetEnabled && isBar ? 1 : isBar ? 2 : 1,
      maxUnrotatedLabelLength: isLine ? 12 : facetEnabled && isBar ? 18 : 10,
      candidateAngles: isLine
        ? [-25, -35, -45, -60, -75, -90]
        : facetEnabled && isBar
          ? [-20, -35, -45, -60, -75, -90]
          : [-20, -35, -45, -60, -75, -90],
      rotatedAnchor: 'end',
      clearanceMinGap: 14,
      clearanceMaxShift: 140,
    },
    splitPanels: {
      enabled: splitEnabled,
      orientation: splitOrientation,
      gap: splitGap,
      panelWidth: splitOrientation === 'horizontal' ? (plotWidth - splitGap) / 2 : plotWidth,
      panelHeight: splitOrientation === 'vertical' ? (plotHeight - splitGap) / 2 : plotHeight,
      titleOffsetY: 10,
    },
  }
}

function clampOverflowValue(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function expandLayoutModel(layout: LayoutModel, overflow: Partial<LayoutOverflow>): LayoutModel {
  const left = clampOverflowValue(overflow.left ?? 0)
  const right = clampOverflowValue(overflow.right ?? 0)
  const top = clampOverflowValue(overflow.top ?? 0)
  const bottom = clampOverflowValue(overflow.bottom ?? 0)
  if (left === 0 && right === 0 && top === 0 && bottom === 0) return layout

  const xTitleBottomInset = layout.canvas.height - layout.axisTitles.x.y
  const yTitleOffset = layout.padding.left - layout.axisTitles.y.y
  const nextPadding = {
    left: layout.padding.left + left,
    right: layout.padding.right + right,
    top: layout.padding.top + top,
    bottom: layout.padding.bottom + bottom,
  }
  const nextCanvas = {
    width: layout.canvas.width + left + right,
    height: layout.canvas.height + top + bottom,
  }
  const nextPlot = {
    x: nextPadding.left,
    y: nextPadding.top,
    width: layout.plot.width,
    height: layout.plot.height,
  }

  return {
    ...layout,
    canvas: nextCanvas,
    padding: nextPadding,
    plot: nextPlot,
    axisTitles: {
      x: {
        x: nextPadding.left + nextPlot.width / 2,
        y: nextCanvas.height - xTitleBottomInset,
      },
      y: {
        x: -(nextPadding.top + nextPlot.height / 2),
        y: nextPadding.left - yTitleOffset,
      },
    },
  }
}
