import { DataAttributes, SvgElements } from './attributes'

export const SvgClassNames = {
  Annotation: 'annotation',
  AnnotationLayer: 'annotation-layer',
  PlotArea: 'plot-area',
  Guideline: 'guideline',
  LabelBackground: 'label-bg',
  ValueLine: 'value-line',
  DiffLine: 'diff-line',
  RetrieveLine: 'retrieve-line',
  TextAnnotation: 'text-annotation',
  RectAnnotation: 'rect-annotation',
  LineAnnotation: 'line-annotation',
  BarSegmentAnnotation: 'bar-segment-annotation',
  XAxis: 'x-axis',
  YAxis: 'y-axis',
  XAxisLabel: 'x-axis-label',
  YAxisLabel: 'y-axis-label',
  MainBar: 'main-bar',
  Tick: 'tick',
} as const

export type SvgClassName = (typeof SvgClassNames)[keyof typeof SvgClassNames]

export const SvgSelectors = {
  SvgRoot: SvgElements.Svg,
  PlotArea: `.${SvgClassNames.PlotArea}`,
  XAxisGroup: `.${SvgClassNames.XAxis}`,
  YAxisGroup: `.${SvgClassNames.YAxis}`,
  XAxisLabelText: `.${SvgClassNames.XAxisLabel}`,
  YAxisLabelText: `.${SvgClassNames.YAxisLabel}`,
  XAxisText: `.${SvgClassNames.XAxis} ${SvgElements.Text}`,
  YAxisText: `.${SvgClassNames.YAxis} ${SvgElements.Text}`,
  XAxisTicks: `.${SvgClassNames.XAxis} .${SvgClassNames.Tick}`,
  Annotation: `.${SvgClassNames.Annotation}`,
  ChartGroup: `[${DataAttributes.ChartId}]`,
  ChartPanelGroup: `${SvgElements.Group}[${DataAttributes.ChartId}][${DataAttributes.ChartPanel}="true"]`,
  DataTargets: `[${DataAttributes.Target}], [${DataAttributes.Id}], [${DataAttributes.Value}]`,
  MainBars: `${SvgElements.Rect}.${SvgClassNames.MainBar}`,
  VegaRoleAxisLabelText: '.role-axis-label text, text.role-axis-label',
  VegaAxisLabelCandidates: 'text, .role-axis-label',
} as const

export type SvgSelector = (typeof SvgSelectors)[keyof typeof SvgSelectors]
