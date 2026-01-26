import { DataAttributes, SvgElements } from './attributes'

export const SvgClassNames = {
  Annotation: 'annotation',
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
  XAxisText: `.${SvgClassNames.XAxis} ${SvgElements.Text}`,
  YAxisText: `.${SvgClassNames.YAxis} ${SvgElements.Text}`,
  XAxisTicks: `.${SvgClassNames.XAxis} .${SvgClassNames.Tick}`,
  Annotation: `.${SvgClassNames.Annotation}`,
  ChartGroup: `[${DataAttributes.ChartId}]`,
  DataTargets: `[${DataAttributes.Target}], [${DataAttributes.Id}], [${DataAttributes.Value}]`,
  MainBars: `${SvgElements.Rect}.${SvgClassNames.MainBar}`,
} as const

export type SvgSelector = (typeof SvgSelectors)[keyof typeof SvgSelectors]
