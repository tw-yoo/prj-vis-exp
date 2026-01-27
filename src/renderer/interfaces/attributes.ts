export const DataAttributes = {
  Id: 'data-id',
  Target: 'data-target',
  Value: 'data-value',
  Series: 'data-series',
  ChartId: 'data-chart-id',
  MarginLeft: 'data-m-left',
  MarginTop: 'data-m-top',
  PlotWidth: 'data-plot-w',
  PlotHeight: 'data-plot-h',
  XField: 'data-x-field',
  YField: 'data-y-field',
  XSortOrder: 'data-x-sort-order',
  ColorField: 'data-color-field',
  FacetField: 'data-facet-field',
} as const

export type DataAttribute = (typeof DataAttributes)[keyof typeof DataAttributes]

export const SvgElements = {
  Svg: 'svg',
  Group: 'g',
  Rect: 'rect',
  Path: 'path',
  Circle: 'circle',
  Text: 'text',
  Line: 'line',
} as const

export type SvgElementTag = (typeof SvgElements)[keyof typeof SvgElements]

export const SvgAttributes = {
  Class: 'class',
  D: 'd',
  X: 'x',
  Y: 'y',
  X1: 'x1',
  X2: 'x2',
  Y1: 'y1',
  Y2: 'y2',
  Width: 'width',
  Height: 'height',
  Fill: 'fill',
  Stroke: 'stroke',
  StrokeWidth: 'stroke-width',
  StrokeDasharray: 'stroke-dasharray',
  Opacity: 'opacity',
  TextAnchor: 'text-anchor',
  DominantBaseline: 'dominant-baseline',
  FontSize: 'font-size',
  FontWeight: 'font-weight',
  FontFamily: 'font-family',
  Transform: 'transform',
  RX: 'rx',
  CX: 'cx',
  CY: 'cy',
  R: 'r',
  PaintOrder: 'paint-order',
  ViewBox: 'viewBox',
} as const

export type SvgAttribute = (typeof SvgAttributes)[keyof typeof SvgAttributes]
