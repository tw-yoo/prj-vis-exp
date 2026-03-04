import type { ActionSchema, FieldSchema } from '../types'
import type {
  DrawBarSegmentSpec,
  DrawFilterSpec,
  DrawGroupFilterSpec,
  DrawLineSpec,
  DrawOp,
  DrawRectSpec,
  DrawSelect,
  DrawSplitSpec,
  DrawSortSpec,
  DrawSumSpec,
  DrawTextSpec,
  DrawStackGroupSpec,
  DrawArrowSpec,
} from '../../../../rendering/draw/types'

type DrawOpStyle = NonNullable<DrawOp['style']>
type TextPosition = NonNullable<DrawTextSpec['position']>
type TextOffset = NonNullable<DrawTextSpec['offset']>
type TextStyle = NonNullable<DrawTextSpec['style']>
type RectAxis = NonNullable<DrawRectSpec['axis']>
type RectPoint = NonNullable<DrawRectSpec['point']>
type RectPosition = NonNullable<DrawRectSpec['position']>
type RectSize = NonNullable<DrawRectSpec['size']>
type RectStyle = NonNullable<DrawRectSpec['style']>
type LinePosition = NonNullable<DrawLineSpec['position']>
type LinePoint = NonNullable<LinePosition['start']>
type LineAxis = NonNullable<DrawLineSpec['axis']>
type LinePair = NonNullable<DrawLineSpec['pair']>
type LineConnectBy = NonNullable<DrawLineSpec['connectBy']>
type LineConnectByPoint = NonNullable<LineConnectBy['start']>
type LineHLine = NonNullable<DrawLineSpec['hline']>
type LineStyle = NonNullable<DrawLineSpec['style']>
type LineArrow = NonNullable<DrawArrowSpec>
type LineArrowStyle = NonNullable<DrawArrowSpec['style']>
type FilterX = NonNullable<DrawFilterSpec['x']>
type FilterY = NonNullable<DrawFilterSpec['y']>
type SegmentStyle = NonNullable<DrawBarSegmentSpec['style']>
type ScalarPanelSpec = NonNullable<DrawOp['scalarPanel']>
type ScalarPanelValue = NonNullable<ScalarPanelSpec['left']>
type ScalarPanelDelta = NonNullable<NonNullable<ScalarPanelSpec['delta']>>
type ScalarPanelPosition = NonNullable<ScalarPanelSpec['position']>
type ScalarPanelStyle = NonNullable<ScalarPanelSpec['style']>

const DRAW_OP_KEYS = [
  'action',
  'chartId',
  'select',
  'style',
  'text',
  'rect',
  'line',
  'sum',
  'segment',
  'split',
  'sort',
  'filter',
  'stackGroup',
  'groupFilter',
  'toSimple',
  'band',
  'scalarPanel',
] satisfies ReadonlyArray<keyof DrawOp>

const DRAW_OP_KEY_SET = new Set<string>(DRAW_OP_KEYS)

const DRAW_SELECT_KEYS = ['mark', 'keys'] satisfies ReadonlyArray<keyof DrawSelect>
const DRAW_OP_STYLE_KEYS = ['color', 'opacity'] satisfies ReadonlyArray<keyof DrawOpStyle>
const DRAW_TEXT_KEYS = ['value', 'mode', 'position', 'offset', 'style'] satisfies ReadonlyArray<keyof DrawTextSpec>
const DRAW_TEXT_POSITION_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof TextPosition>
const DRAW_TEXT_OFFSET_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof TextOffset>
const DRAW_TEXT_STYLE_KEYS = ['color', 'fontSize', 'fontWeight', 'fontFamily', 'opacity'] satisfies ReadonlyArray<
  keyof TextStyle
>
const DRAW_RECT_KEYS = ['mode', 'position', 'axis', 'point', 'size', 'style'] satisfies ReadonlyArray<keyof DrawRectSpec>
const DRAW_RECT_AXIS_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof RectAxis>
const DRAW_RECT_POINT_KEYS = ['x'] satisfies ReadonlyArray<keyof RectPoint>
const DRAW_RECT_POSITION_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof RectPosition>
const DRAW_RECT_SIZE_KEYS = ['width', 'height'] satisfies ReadonlyArray<keyof RectSize>
const DRAW_RECT_STYLE_KEYS = ['fill', 'opacity', 'stroke', 'strokeWidth'] satisfies ReadonlyArray<keyof RectStyle>
const DRAW_LINE_KEYS = [
  'mode',
  'position',
  'axis',
  'pair',
  'connectBy',
  'hline',
  'angle',
  'length',
  'style',
  'arrow',
] satisfies ReadonlyArray<keyof DrawLineSpec>
const DRAW_LINE_POSITION_KEYS = ['start', 'end'] satisfies ReadonlyArray<keyof LinePosition>
const DRAW_LINE_POINT_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof LinePoint>
const DRAW_LINE_AXIS_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof LineAxis>
const DRAW_LINE_PAIR_KEYS = ['x'] satisfies ReadonlyArray<keyof LinePair>
const DRAW_LINE_CONNECT_BY_KEYS = ['start', 'end'] satisfies ReadonlyArray<keyof LineConnectBy>
const DRAW_LINE_CONNECT_BY_POINT_KEYS = ['target', 'series'] satisfies ReadonlyArray<keyof LineConnectByPoint>
const DRAW_LINE_HLINE_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof LineHLine>
const DRAW_LINE_STYLE_KEYS = ['stroke', 'strokeWidth', 'opacity'] satisfies ReadonlyArray<keyof LineStyle>
const DRAW_LINE_ARROW_KEYS = ['start', 'end', 'length', 'width', 'style'] satisfies ReadonlyArray<keyof LineArrow>
const DRAW_LINE_ARROW_STYLE_KEYS = ['stroke', 'fill', 'strokeWidth', 'opacity'] satisfies ReadonlyArray<
  keyof LineArrowStyle
>
const DRAW_SUM_KEYS = ['value', 'label'] satisfies ReadonlyArray<keyof DrawSumSpec>
const DRAW_SEGMENT_KEYS = ['threshold', 'when', 'style'] satisfies ReadonlyArray<keyof DrawBarSegmentSpec>
const DRAW_SEGMENT_STYLE_KEYS = ['fill', 'opacity', 'stroke', 'strokeWidth'] satisfies ReadonlyArray<keyof SegmentStyle>
const DRAW_SPLIT_KEYS = ['by', 'groups', 'restTo', 'orientation'] satisfies ReadonlyArray<keyof DrawSplitSpec>
const DRAW_SORT_KEYS = ['by', 'order'] satisfies ReadonlyArray<keyof DrawSortSpec>
const DRAW_FILTER_KEYS = ['x', 'y'] satisfies ReadonlyArray<keyof DrawFilterSpec>
const DRAW_FILTER_X_KEYS = ['include', 'exclude'] satisfies ReadonlyArray<keyof FilterX>
const DRAW_FILTER_Y_KEYS = ['op', 'value'] satisfies ReadonlyArray<keyof FilterY>
const DRAW_STACK_GROUP_KEYS = ['swapAxes', 'xField', 'colorField'] satisfies ReadonlyArray<keyof DrawStackGroupSpec>
const DRAW_GROUP_FILTER_KEYS = ['groups', 'include', 'keep', 'exclude', 'reset'] satisfies ReadonlyArray<
  keyof DrawGroupFilterSpec
>
const DRAW_TO_SIMPLE_KEYS = ['series'] as const
const DRAW_BAND_KEYS = ['axis', 'range', 'label', 'style'] as const
const DRAW_BAND_STYLE_KEYS = ['fill', 'opacity', 'stroke', 'strokeWidth'] as const
const DRAW_SCALAR_PANEL_KEYS = ['mode', 'layout', 'absolute', 'left', 'right', 'delta', 'position', 'style'] as const
const DRAW_SCALAR_PANEL_VALUE_KEYS = ['label', 'value'] satisfies ReadonlyArray<keyof ScalarPanelValue>
const DRAW_SCALAR_PANEL_DELTA_KEYS = ['label', 'value'] satisfies ReadonlyArray<keyof ScalarPanelDelta>
const DRAW_SCALAR_PANEL_POSITION_KEYS = ['x', 'y', 'width', 'height'] satisfies ReadonlyArray<keyof ScalarPanelPosition>
const DRAW_SCALAR_PANEL_STYLE_KEYS = [
  'leftFill',
  'rightFill',
  'panelFill',
  'panelStroke',
  'lineStroke',
  'arrowStroke',
  'textColor',
] satisfies ReadonlyArray<keyof ScalarPanelStyle>

const DRAW_FIELD_KEY_MAP: Record<string, readonly string[]> = {
  select: DRAW_SELECT_KEYS,
  style: DRAW_OP_STYLE_KEYS,
  text: DRAW_TEXT_KEYS,
  'text.position': DRAW_TEXT_POSITION_KEYS,
  'text.offset': DRAW_TEXT_OFFSET_KEYS,
  'text.style': DRAW_TEXT_STYLE_KEYS,
  rect: DRAW_RECT_KEYS,
  'rect.axis': DRAW_RECT_AXIS_KEYS,
  'rect.point': DRAW_RECT_POINT_KEYS,
  'rect.position': DRAW_RECT_POSITION_KEYS,
  'rect.size': DRAW_RECT_SIZE_KEYS,
  'rect.style': DRAW_RECT_STYLE_KEYS,
  line: DRAW_LINE_KEYS,
  'line.position': DRAW_LINE_POSITION_KEYS,
  'line.position.start': DRAW_LINE_POINT_KEYS,
  'line.position.end': DRAW_LINE_POINT_KEYS,
  'line.axis': DRAW_LINE_AXIS_KEYS,
  'line.pair': DRAW_LINE_PAIR_KEYS,
  'line.connectBy': DRAW_LINE_CONNECT_BY_KEYS,
  'line.connectBy.start': DRAW_LINE_CONNECT_BY_POINT_KEYS,
  'line.connectBy.end': DRAW_LINE_CONNECT_BY_POINT_KEYS,
  'line.hline': DRAW_LINE_HLINE_KEYS,
  'line.style': DRAW_LINE_STYLE_KEYS,
  'line.arrow': DRAW_LINE_ARROW_KEYS,
  'line.arrow.style': DRAW_LINE_ARROW_STYLE_KEYS,
  sum: DRAW_SUM_KEYS,
  segment: DRAW_SEGMENT_KEYS,
  'segment.style': DRAW_SEGMENT_STYLE_KEYS,
  split: DRAW_SPLIT_KEYS,
  sort: DRAW_SORT_KEYS,
  filter: DRAW_FILTER_KEYS,
  'filter.x': DRAW_FILTER_X_KEYS,
  'filter.y': DRAW_FILTER_Y_KEYS,
  stackGroup: DRAW_STACK_GROUP_KEYS,
  groupFilter: DRAW_GROUP_FILTER_KEYS,
  toSimple: DRAW_TO_SIMPLE_KEYS,
  band: DRAW_BAND_KEYS,
  'band.style': DRAW_BAND_STYLE_KEYS,
  scalarPanel: DRAW_SCALAR_PANEL_KEYS,
  'scalarPanel.left': DRAW_SCALAR_PANEL_VALUE_KEYS,
  'scalarPanel.right': DRAW_SCALAR_PANEL_VALUE_KEYS,
  'scalarPanel.delta': DRAW_SCALAR_PANEL_DELTA_KEYS,
  'scalarPanel.position': DRAW_SCALAR_PANEL_POSITION_KEYS,
  'scalarPanel.style': DRAW_SCALAR_PANEL_STYLE_KEYS,
}

type ValidateOptions = { skipKeyCheck?: boolean }

function validateFieldSchema(
  field: FieldSchema,
  path: string[],
  errors: string[],
  options: ValidateOptions = {},
) {
  const nextPath = [...path, field.key]
  const pathKey = nextPath.join('.')
  const allowed = DRAW_FIELD_KEY_MAP[pathKey]
  if (!options.skipKeyCheck && path.length === 0 && !DRAW_OP_KEY_SET.has(field.key)) {
    errors.push(`draw schema: unknown root key "${field.key}"`)
  }
  if (allowed && field.fields) {
    field.fields.forEach((child) => {
      if (!allowed.includes(child.key)) {
        errors.push(`draw schema: "${pathKey}" has unknown field "${child.key}"`)
      }
    })
  }
  if (field.fields) {
    field.fields.forEach((child) => validateFieldSchema(child, nextPath, errors))
  }
  if (field.valueSchema) {
    validateFieldSchema(field.valueSchema, nextPath, errors, { skipKeyCheck: true })
  }
}

export function validateDrawSchema(actions: ActionSchema[]) {
  const errors: string[] = []
  actions.forEach((action) => {
    if (!action.fields) return
    action.fields.forEach((field) => validateFieldSchema(field, [], errors))
  })
  return errors
}
