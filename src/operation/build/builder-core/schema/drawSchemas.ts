import type { FieldSchema } from '../types'
import {
  DrawComparisonTokenOptions,
  DrawLineModeOptions,
  DrawMarkOptions,
  DrawRectModeOptions,
  DrawTextModeOptions,
} from '../../../../rendering/draw/types'
import {
  SortByOptions,
  SortOrderOptions,
  SplitByOptions,
  SplitOrientationOptions,
} from '../../../../types/operationOptions'

export const baseSelectFields: FieldSchema[] = [
  {
    key: 'select',
    label: 'Select',
    kind: 'object',
    optional: true,
    fields: [
      {
        key: 'mark',
        label: 'Mark',
        kind: 'enum',
        optional: true,
        options: [...DrawMarkOptions],
      },
      {
        key: 'keys',
        label: 'Keys',
        kind: 'stringOrNumberArray',
        optional: true,
        optionsSource: 'dataKey',
      },
    ],
  },
]

export const baseStyleFields: FieldSchema[] = [
  {
    key: 'style',
    label: 'Style',
    kind: 'object',
    optional: true,
    fields: [
      { key: 'color', label: 'Color', kind: 'string', optional: true },
      { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
    ],
  },
]

export const filterField: FieldSchema = {
  key: 'filter',
  label: 'Filter',
  kind: 'object',
  optional: true,
  fields: [
    {
      key: 'x',
      label: 'X Filter',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'include', label: 'Include', kind: 'stringOrNumberArray', optional: true, optionsSource: 'target' },
        { key: 'exclude', label: 'Exclude', kind: 'stringOrNumberArray', optional: true, optionsSource: 'target' },
      ],
    },
    {
      key: 'y',
      label: 'Y Filter',
      kind: 'object',
      optional: true,
      fields: [
        {
          key: 'op',
          label: 'Operator',
          kind: 'enum',
          optional: false,
          options: [...DrawComparisonTokenOptions],
        },
        { key: 'value', label: 'Value', kind: 'number', optional: false },
      ],
    },
  ],
}

export const sortField: FieldSchema = {
  key: 'sort',
  label: 'Sort',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'by', label: 'By', kind: 'enum', optional: true, options: [...SortByOptions] },
    { key: 'order', label: 'Order', kind: 'enum', optional: true, options: [...SortOrderOptions] },
  ],
}

export const splitField: FieldSchema = {
  key: 'split',
  label: 'Split',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'by', label: 'By', kind: 'enum', optional: true, options: [...SplitByOptions] },
    {
      key: 'groups',
      label: 'Groups',
      kind: 'map',
      optional: false,
      valueSchema: {
        key: 'group',
        label: 'Group Values',
        kind: 'stringOrNumberArray',
        optionsSource: 'target',
      },
    },
    { key: 'restTo', label: 'Rest To', kind: 'string', optional: true },
    {
      key: 'orientation',
      label: 'Orientation',
      kind: 'enum',
      optional: true,
      options: [...SplitOrientationOptions],
    },
  ],
}

export const textField: FieldSchema = {
  key: 'text',
  label: 'Text',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'value', label: 'Value', kind: 'stringOrMap', optional: false },
    {
      key: 'mode',
      label: 'Mode',
      kind: 'enum',
      optional: true,
      options: [...DrawTextModeOptions],
    },
    {
      key: 'position',
      label: 'Position',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'number', optional: false },
        { key: 'y', label: 'Y', kind: 'number', optional: false },
      ],
    },
    {
      key: 'offset',
      label: 'Offset',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'number', optional: true },
        { key: 'y', label: 'Y', kind: 'number', optional: true },
      ],
    },
    {
      key: 'style',
      label: 'Style',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'color', label: 'Color', kind: 'string', optional: true },
        { key: 'fontSize', label: 'Font Size', kind: 'number', optional: true },
        { key: 'fontWeight', label: 'Font Weight', kind: 'stringOrNumber', optional: true },
        { key: 'fontFamily', label: 'Font Family', kind: 'string', optional: true },
        { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
      ],
    },
  ],
}

export const rectField: FieldSchema = {
  key: 'rect',
  label: 'Rect',
  kind: 'object',
  optional: true,
  fields: [
    {
      key: 'mode',
      label: 'Mode',
      kind: 'enum',
      optional: true,
      options: [...DrawRectModeOptions],
    },
    {
      key: 'axis',
      label: 'Axis',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'stringOrNumberArray', optional: true, optionsSource: 'target' },
        { key: 'y', label: 'Y', kind: 'numberArray', optional: true },
      ],
    },
    {
      key: 'point',
      label: 'Point',
      kind: 'object',
      optional: true,
      fields: [{ key: 'x', label: 'X', kind: 'stringOrNumber', optional: false, optionsSource: 'target' }],
    },
    {
      key: 'position',
      label: 'Position',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'number', optional: false },
        { key: 'y', label: 'Y', kind: 'number', optional: false },
      ],
    },
    {
      key: 'size',
      label: 'Size',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'width', label: 'Width', kind: 'number', optional: false },
        { key: 'height', label: 'Height', kind: 'number', optional: false },
      ],
    },
    {
      key: 'style',
      label: 'Style',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'fill', label: 'Fill', kind: 'string', optional: true },
        { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
        { key: 'stroke', label: 'Stroke', kind: 'string', optional: true },
        { key: 'strokeWidth', label: 'Stroke Width', kind: 'number', optional: true },
      ],
    },
  ],
}

export const sumField: FieldSchema = {
  key: 'sum',
  label: 'Sum',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'value', label: 'Value', kind: 'number', optional: false },
    { key: 'label', label: 'Label', kind: 'string', optional: true },
  ],
}

export const segmentField: FieldSchema = {
  key: 'segment',
  label: 'Segment',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'threshold', label: 'Threshold', kind: 'number', optional: false },
    {
      key: 'when',
      label: 'When',
      kind: 'enum',
      optional: true,
      options: [...DrawComparisonTokenOptions],
    },
    {
      key: 'style',
      label: 'Style',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'fill', label: 'Fill', kind: 'string', optional: true },
        { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
        { key: 'stroke', label: 'Stroke', kind: 'string', optional: true },
        { key: 'strokeWidth', label: 'Stroke Width', kind: 'number', optional: true },
      ],
    },
  ],
}

export const lineField: FieldSchema = {
  key: 'line',
  label: 'Line',
  kind: 'object',
  optional: true,
  fields: [
    {
      key: 'mode',
      label: 'Mode',
      kind: 'enum',
      optional: true,
      options: [...DrawLineModeOptions],
    },
    {
      key: 'position',
      label: 'Position',
      kind: 'object',
      optional: true,
      fields: [
        {
          key: 'start',
          label: 'Start',
          kind: 'object',
          optional: false,
          fields: [
            { key: 'x', label: 'X', kind: 'number', optional: false },
            { key: 'y', label: 'Y', kind: 'number', optional: false },
          ],
        },
        {
          key: 'end',
          label: 'End',
          kind: 'object',
          optional: false,
          fields: [
            { key: 'x', label: 'X', kind: 'number', optional: false },
            { key: 'y', label: 'Y', kind: 'number', optional: false },
          ],
        },
      ],
    },
    {
      key: 'axis',
      label: 'Axis',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'string', optional: false, optionsSource: 'target' },
        { key: 'y', label: 'Y', kind: 'number', optional: false },
      ],
    },
    {
      key: 'pair',
      label: 'Pair',
      kind: 'object',
      optional: true,
      fields: [{ key: 'x', label: 'X Pair', kind: 'stringArray', optional: false, optionsSource: 'target' }],
    },
    {
      key: 'connectBy',
      label: 'Connect By',
      kind: 'object',
      optional: true,
      fields: [
        {
          key: 'start',
          label: 'Start',
          kind: 'object',
          optional: false,
          fields: [
            { key: 'target', label: 'Target', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
            { key: 'series', label: 'Series', kind: 'stringOrNumber', optional: true, optionsSource: 'series' },
          ],
        },
        {
          key: 'end',
          label: 'End',
          kind: 'object',
          optional: false,
          fields: [
            { key: 'target', label: 'Target', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
            { key: 'series', label: 'Series', kind: 'stringOrNumber', optional: true, optionsSource: 'series' },
          ],
        },
      ],
    },
    {
      key: 'hline',
      label: 'HLine',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'string', optional: true, optionsSource: 'target' },
        { key: 'y', label: 'Y', kind: 'number', optional: true },
      ],
    },
    { key: 'angle', label: 'Angle', kind: 'number', optional: true },
    { key: 'length', label: 'Length', kind: 'number', optional: true },
    {
      key: 'style',
      label: 'Style',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'stroke', label: 'Stroke', kind: 'string', optional: true },
        { key: 'strokeWidth', label: 'Stroke Width', kind: 'number', optional: true },
        { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
      ],
    },
    {
      key: 'arrow',
      label: 'Arrow',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'start', label: 'Start', kind: 'boolean', optional: true },
        { key: 'end', label: 'End', kind: 'boolean', optional: true },
        { key: 'length', label: 'Length', kind: 'number', optional: true },
        { key: 'width', label: 'Width', kind: 'number', optional: true },
        {
          key: 'style',
          label: 'Style',
          kind: 'object',
          optional: true,
          fields: [
            { key: 'stroke', label: 'Stroke', kind: 'string', optional: true },
            { key: 'fill', label: 'Fill', kind: 'string', optional: true },
            { key: 'strokeWidth', label: 'Stroke Width', kind: 'number', optional: true },
            { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
          ],
        },
      ],
    },
  ],
}

export const stackGroupField: FieldSchema = {
  key: 'stackGroup',
  label: 'Stack Group',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'swapAxes', label: 'Swap Axes', kind: 'boolean', optional: true },
    { key: 'xField', label: 'X Field', kind: 'string', optional: true, optionsSource: 'field' },
    { key: 'colorField', label: 'Color Field', kind: 'string', optional: true, optionsSource: 'field' },
  ],
}

export const toSimpleField: FieldSchema = {
  key: 'toSimple',
  label: 'To Simple',
  kind: 'object',
  optional: true,
  fields: [{ key: 'series', label: 'Series', kind: 'stringOrNumber', optional: false, optionsSource: 'series' }],
}

export const groupFilterField: FieldSchema = {
  key: 'groupFilter',
  label: 'Group Filter',
  kind: 'object',
  optional: true,
  fields: [
    { key: 'groups', label: 'Groups', kind: 'stringOrNumberArray', optional: true, optionsSource: 'series' },
    { key: 'include', label: 'Include', kind: 'stringOrNumberArray', optional: true, optionsSource: 'series' },
    { key: 'keep', label: 'Keep', kind: 'stringOrNumberArray', optional: true, optionsSource: 'series' },
    { key: 'exclude', label: 'Exclude', kind: 'stringOrNumberArray', optional: true, optionsSource: 'series' },
    { key: 'reset', label: 'Reset', kind: 'boolean', optional: true },
  ],
}

export const bandField: FieldSchema = {
  key: 'band',
  label: 'Band',
  kind: 'object',
  optional: true,
  fields: [
    {
      key: 'axis',
      label: 'Axis',
      kind: 'enum',
      optional: false,
      options: ['x', 'y'],
    },
    {
      key: 'range',
      label: 'Range',
      kind: 'stringOrNumberArray',
      optional: false,
      optionsSource: 'target',
    },
    { key: 'label', label: 'Label', kind: 'string', optional: true },
    {
      key: 'style',
      label: 'Style',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'fill', label: 'Fill', kind: 'string', optional: true },
        { key: 'opacity', label: 'Opacity', kind: 'number', optional: true },
        { key: 'stroke', label: 'Stroke', kind: 'string', optional: true },
        { key: 'strokeWidth', label: 'Stroke Width', kind: 'number', optional: true },
      ],
    },
  ],
}

export const scalarPanelField: FieldSchema = {
  key: 'scalarPanel',
  label: 'Scalar Panel',
  kind: 'object',
  optional: true,
  fields: [
    {
      key: 'mode',
      label: 'Mode',
      kind: 'enum',
      optional: true,
      options: ['base', 'diff'],
    },
    {
      key: 'layout',
      label: 'Layout',
      kind: 'enum',
      optional: true,
      options: ['inset', 'full-replace'],
    },
    {
      key: 'absolute',
      label: 'Absolute',
      kind: 'boolean',
      optional: true,
    },
    {
      key: 'left',
      label: 'Left',
      kind: 'object',
      optional: false,
      fields: [
        { key: 'label', label: 'Label', kind: 'string', optional: false },
        { key: 'value', label: 'Value', kind: 'number', optional: false },
      ],
    },
    {
      key: 'right',
      label: 'Right',
      kind: 'object',
      optional: false,
      fields: [
        { key: 'label', label: 'Label', kind: 'string', optional: false },
        { key: 'value', label: 'Value', kind: 'number', optional: false },
      ],
    },
    {
      key: 'delta',
      label: 'Delta',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'label', label: 'Label', kind: 'string', optional: true },
        { key: 'value', label: 'Value', kind: 'number', optional: false },
      ],
    },
    {
      key: 'position',
      label: 'Position',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'x', label: 'X', kind: 'number', optional: false },
        { key: 'y', label: 'Y', kind: 'number', optional: false },
        { key: 'width', label: 'Width', kind: 'number', optional: false },
        { key: 'height', label: 'Height', kind: 'number', optional: false },
      ],
    },
    {
      key: 'style',
      label: 'Style',
      kind: 'object',
      optional: true,
      fields: [
        { key: 'leftFill', label: 'Left Fill', kind: 'string', optional: true },
        { key: 'rightFill', label: 'Right Fill', kind: 'string', optional: true },
        { key: 'panelFill', label: 'Panel Fill', kind: 'string', optional: true },
        { key: 'panelStroke', label: 'Panel Stroke', kind: 'string', optional: true },
        { key: 'lineStroke', label: 'Line Stroke', kind: 'string', optional: true },
        { key: 'arrowStroke', label: 'Arrow Stroke', kind: 'string', optional: true },
        { key: 'textColor', label: 'Text Color', kind: 'string', optional: true },
      ],
    },
  ],
}

export const sleepSecondsField: FieldSchema = {
  key: 'seconds',
  label: 'Seconds',
  kind: 'number',
  optional: true,
}

export const sleepDurationField: FieldSchema = {
  key: 'duration',
  label: 'Duration',
  kind: 'number',
  optional: true,
}
