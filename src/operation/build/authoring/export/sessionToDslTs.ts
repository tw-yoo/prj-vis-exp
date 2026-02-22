import { DrawAction, DrawMark, type DrawOp } from '../../../../rendering/draw/types'
import {
  type InteractionSession,
  TimelineStepKind,
  type TimelineStep,
} from '../../../../rendering/draw/interaction/session/types'
import { getEnabledTimelineSteps } from '../../../../rendering/draw/interaction/session/reducer'

const stringify = (value: unknown) => JSON.stringify(value)

const formatArgs = (...args: Array<string | undefined>) => {
  const next = args.slice()
  while (next.length > 0 && (next[next.length - 1] === undefined || next[next.length - 1] === 'undefined')) {
    next.pop()
  }
  return next.join(', ')
}

const formatScalar = (value: string | number) => (typeof value === 'number' ? String(value) : stringify(value))

const formatArray = (values: Array<string | number> | undefined) =>
  (values ?? []).map((value) => formatScalar(value)).join(', ')

const formatSelect = (op: DrawOp) => {
  const keys = op.select?.keys
  if (!keys || keys.length === 0) return undefined
  if (op.select?.mark) {
    return `draw.select.markKeys(${formatDrawMark(op.select.mark)}, ${formatArray(keys)})`
  }
  return `draw.select.keys(${formatArray(keys)})`
}

const formatDrawMark = (mark: string) => {
  switch (mark) {
    case DrawMark.Rect:
      return 'DrawMark.Rect'
    case DrawMark.Path:
      return 'DrawMark.Path'
    case DrawMark.Circle:
      return 'DrawMark.Circle'
    default:
      return stringify(mark)
  }
}

const formatLineStyle = (op: DrawOp) => {
  const stroke = op.line?.style?.stroke
  if (!stroke) return 'undefined'
  return `draw.style.line(${formatScalar(stroke)}, ${op.line?.style?.strokeWidth ?? 'undefined'}, ${op.line?.style?.opacity ?? 'undefined'})`
}

const formatLineArrow = (op: DrawOp) => {
  if (!op.line?.arrow) return 'undefined'
  const arrow = op.line.arrow
  const arrowStyleObj = arrow.style
  const styleExpr = arrowStyleObj
    ? `draw.style.arrow(${arrowStyleObj.stroke ? formatScalar(arrowStyleObj.stroke) : 'undefined'}, ${arrowStyleObj.fill ? formatScalar(arrowStyleObj.fill) : 'undefined'}, ${arrowStyleObj.strokeWidth ?? 'undefined'}, ${arrowStyleObj.opacity ?? 'undefined'})`
    : undefined
  if (arrow.start && arrow.end) {
    return `draw.arrow.both(${arrow.length ?? 'undefined'}, ${arrow.width ?? 'undefined'}, ${styleExpr})`
  }
  if (arrow.start) {
    return `draw.arrow.startOnly(${arrow.length ?? 'undefined'}, ${arrow.width ?? 'undefined'}, ${styleExpr})`
  }
  if (arrow.end) {
    return `draw.arrow.endOnly(${arrow.length ?? 'undefined'}, ${arrow.width ?? 'undefined'}, ${styleExpr})`
  }
  return 'undefined'
}

const formatLineSpec = (op: DrawOp) => {
  const line = op.line
  if (!line) return 'undefined'
  const style = formatLineStyle(op)
  const arrow = formatLineArrow(op)
  if (line.hline?.y != null) {
    return `draw.lineSpec.horizontalFromY(${line.hline.y}, ${style}, ${arrow})`
  }
  if (line.pair?.x?.length === 2) {
    return `draw.lineSpec.connect(${formatScalar(line.pair.x[0])}, ${formatScalar(line.pair.x[1])}, ${style}, ${arrow})`
  }
  if (line.axis?.x != null && line.axis?.y != null && line.angle != null && line.length != null) {
    return `draw.lineSpec.angle(${formatScalar(line.axis.x)}, ${line.axis.y}, ${line.angle}, ${line.length}, ${style}, ${arrow})`
  }
  if (line.position?.start && line.position?.end) {
    return `draw.lineSpec.normalized(${line.position.start.x}, ${line.position.start.y}, ${line.position.end.x}, ${line.position.end.y}, ${style}, ${arrow})`
  }
  return undefined
}

const formatRectSpec = (op: DrawOp) => {
  const rect = op.rect
  if (!rect) return undefined
  const style = rect.style?.fill
    ? `draw.style.rect(${formatScalar(rect.style.fill)}, ${rect.style.opacity ?? 'undefined'}, ${rect.style.stroke ? formatScalar(rect.style.stroke) : 'undefined'}, ${rect.style.strokeWidth ?? 'undefined'})`
    : 'undefined'

  if (rect.position && rect.size) {
    return `draw.rectSpec.normalized(${rect.position.x}, ${rect.position.y}, ${rect.size.width}, ${rect.size.height}, ${style})`
  }
  if (rect.axis?.x != null) {
    return `draw.rectSpec.axisX(${formatScalar(Array.isArray(rect.axis.x) ? rect.axis.x[0] : rect.axis.x)}, ${style})`
  }
  if (rect.axis?.y != null) {
    return `draw.rectSpec.axisY(${rect.axis.y}, ${style})`
  }
  if (rect.point?.x != null && rect.size) {
    return `draw.rectSpec.dataPoint(${formatScalar(rect.point.x)}, ${rect.size.width}, ${rect.size.height}, ${style})`
  }
  return undefined
}

const formatTextSpec = (op: DrawOp) => {
  const text = op.text
  if (!text) return undefined
  const style = text.style?.color
    ? `draw.style.text(${formatScalar(text.style.color)}, ${text.style.fontSize ?? 'undefined'}, ${text.style.fontWeight != null ? formatScalar(text.style.fontWeight as string | number) : 'undefined'}, ${text.style.fontFamily ? formatScalar(text.style.fontFamily) : 'undefined'}, ${text.style.opacity ?? 'undefined'})`
    : 'undefined'
  const valueExpr = typeof text.value === 'string' ? formatScalar(text.value) : stringify(text.value)
  if (text.mode === 'anchor') {
    return `draw.textSpec.anchor(${valueExpr}, ${style}, ${text.offset?.x ?? 'undefined'}, ${text.offset?.y ?? 'undefined'})`
  }
  if (text.position) {
    return `draw.textSpec.normalized(${valueExpr}, ${text.position.x}, ${text.position.y}, ${style}, ${text.offset?.x ?? 'undefined'}, ${text.offset?.y ?? 'undefined'})`
  }
  return undefined
}

const formatSplitSpec = (op: DrawOp) => {
  const split = op.split
  if (!split?.groups) return undefined
  const entries = Object.entries(split.groups)
  if (entries.length >= 2) {
    const [a, b] = entries
    return `draw.splitSpec.two(${formatScalar(a[0])}, [${formatArray(a[1])}], ${formatScalar(b[0])}, [${formatArray(b[1])}], ${split.orientation ? formatScalar(split.orientation) : 'undefined'})`
  }
  if (entries.length === 1) {
    const [a] = entries
    return `draw.splitSpec.oneAndRest(${formatScalar(a[0])}, [${formatArray(a[1])}], ${formatScalar(split.restTo ?? 'B')}, ${split.orientation ? formatScalar(split.orientation) : 'undefined'})`
  }
  return undefined
}

const formatFilterSpec = (op: DrawOp) => {
  const filter = op.filter
  if (!filter) return undefined
  if (filter.x?.include?.length) {
    return `draw.filterSpec.xInclude(${formatArray(filter.x.include)})`
  }
  if (filter.x?.exclude?.length) {
    return `draw.filterSpec.xExclude(${formatArray(filter.x.exclude)})`
  }
  if (filter.y?.op && filter.y?.value != null) {
    return `draw.filterSpec.y(${formatScalar(filter.y.op)}, ${filter.y.value})`
  }
  return undefined
}

const formatDrawStep = (step: TimelineStep): string | null => {
  if (step.kind !== TimelineStepKind.Draw) return null
  const op = step.op
  const chartId = op.chartId ? formatScalar(op.chartId) : 'undefined'
  switch (op.action) {
    case DrawAction.Highlight:
      return `ops.draw.highlight(${formatArgs(chartId, formatSelect(op), op.style?.color ? formatScalar(op.style.color) : undefined, op.style?.opacity != null ? String(op.style.opacity) : undefined)})`
    case DrawAction.Dim:
      return `ops.draw.dim(${formatArgs(chartId, formatSelect(op), op.style?.color ? formatScalar(op.style.color) : undefined, op.style?.opacity != null ? String(op.style.opacity) : undefined)})`
    case DrawAction.Clear:
      return `ops.draw.clear(${chartId})`
    case DrawAction.Line:
      return `ops.draw.line(${chartId}, ${formatLineSpec(op) ?? stringify(op.line)})`
    case DrawAction.Rect:
      return `ops.draw.rect(${chartId}, ${formatRectSpec(op) ?? stringify(op.rect)})`
    case DrawAction.Text:
      return `ops.draw.text(${formatArgs(chartId, formatSelect(op), formatTextSpec(op) ?? stringify(op.text))})`
    case DrawAction.BarSegment: {
      const segmentStyle = op.segment?.style?.fill
        ? `draw.style.segment(${formatScalar(op.segment.style.fill)}, ${op.segment.style.stroke ? formatScalar(op.segment.style.stroke) : 'undefined'}, ${op.segment.style.strokeWidth ?? 'undefined'}, ${op.segment.style.opacity ?? 'undefined'})`
        : 'undefined'
      const segmentSpec =
        op.segment?.threshold != null
          ? `draw.segmentSpec.threshold(${op.segment.threshold}, ${op.segment.when ? formatScalar(op.segment.when) : 'undefined'}, ${segmentStyle})`
          : stringify(op.segment)
      return `ops.draw.barSegment(${chartId}, [${formatArray(op.select?.keys)}], ${segmentSpec})`
    }
    case DrawAction.Filter:
      return `ops.draw.filter(${chartId}, ${formatFilterSpec(op) ?? stringify(op.filter)})`
    case DrawAction.Split:
      return `ops.draw.split(${chartId}, ${formatSplitSpec(op) ?? stringify(op.split)})`
    case DrawAction.Unsplit:
      return `ops.draw.unsplit(${chartId})`
    case DrawAction.LineTrace:
      return `ops.draw.lineTrace(${formatArgs(chartId, formatSelect(op))})`
    case DrawAction.Sort:
      return `ops.draw.sort(${formatArgs(chartId, op.sort?.by ? formatScalar(op.sort.by) : undefined, op.sort?.order ? formatScalar(op.sort.order) : undefined)})`
    case DrawAction.Sum:
      return `ops.draw.sum(${chartId}, draw.sumSpec.value(${op.sum?.value ?? 0}, ${op.sum?.label ? formatScalar(op.sum.label) : 'undefined'}))`
    default:
      return null
  }
}

const formatSleepStep = (step: TimelineStep): string | null => {
  if (step.kind !== TimelineStepKind.Sleep) return null
  return `ops.draw.sleep(${Math.max(0, step.durationMs) / 1000})`
}

export function serializeSessionToDslPlanSource(session: InteractionSession): string {
  const steps = getEnabledTimelineSteps(session)
  const lines: string[] = []
  let usesDrawMark = false

  steps.forEach((step) => {
    if (step.kind === TimelineStepKind.Group) return
    const expr = step.kind === TimelineStepKind.Sleep ? formatSleepStep(step) : formatDrawStep(step)
    if (!expr) return
    if (expr.includes('DrawMark.')) usesDrawMark = true
    lines.push(`  ${expr},`)
  })

  const imports = [`import { draw, ops } from 'src/operation/build/authoring'`]
  if (usesDrawMark) {
    imports.push(`import { DrawMark } from 'src/rendering/draw/types'`)
  }
  return `${imports.join('\n')}\n\nconst plan = [\n${lines.join('\n')}\n]\n\nexport default plan\n`
}
