import { ChartType } from '../utils/chartRenderer'
import {
  AggregateOptions,
  ComparisonOperatorExtendedOptions,
  DiffModeOptions,
  ExtremumWhichOptions,
  NthFromOptions,
  SortOrderOptions,
} from '../types/operationOptions'
import {
  baseSelectFields,
  baseStyleFields,
  filterField,
  sortField,
  splitField,
  sumField,
  segmentField,
  textField,
  rectField,
  lineField,
  stackGroupField,
  groupFilterField,
} from './schema/drawSchemas'
import { validateDrawSchema } from './schema/validateDrawSchema'
import type { ActionSchema, FieldSchema, OperationRegistry } from './types'

const asRequired = (field: FieldSchema): FieldSchema => ({ ...field, optional: false })

const drawActions: ActionSchema[] = [
  {
    value: 'highlight',
    label: 'Highlight',
    icon: '🎯',
  },
  {
    value: 'dim',
    label: 'Dim',
    icon: '🌫️',
  },
  {
    value: 'text',
    label: 'Text',
    icon: '📝',
    fields: [asRequired(textField)],
  },
  {
    value: 'rect',
    label: 'Rect',
    icon: '▭',
    fields: [asRequired(rectField)],
  },
  {
    value: 'line',
    label: 'Line',
    icon: '📏',
    fields: [asRequired(lineField)],
  },
  {
    value: 'line-trace',
    label: 'Line Trace',
    icon: '🧵',
    allowedCharts: [ChartType.SIMPLE_LINE],
  },
  {
    value: 'filter',
    label: 'Filter',
    icon: '🧹',
    allowedCharts: [ChartType.SIMPLE_BAR, ChartType.GROUPED_BAR, ChartType.STACKED_BAR, ChartType.SIMPLE_LINE],
    fields: [asRequired(filterField)],
  },
  {
    value: 'sort',
    label: 'Sort',
    icon: '↕️',
    allowedCharts: [ChartType.SIMPLE_BAR, ChartType.GROUPED_BAR, ChartType.STACKED_BAR],
    fields: [asRequired(sortField)],
  },
  {
    value: 'split',
    label: 'Split',
    icon: '🪟',
    allowedCharts: [ChartType.SIMPLE_BAR],
    fields: [asRequired(splitField)],
  },
  {
    value: 'unsplit',
    label: 'Unsplit',
    icon: '🧩',
    allowedCharts: [ChartType.SIMPLE_BAR],
  },
  {
    value: 'sum',
    label: 'Sum',
    icon: '∑',
    allowedCharts: [ChartType.SIMPLE_BAR],
    fields: [sumField],
  },
  {
    value: 'bar-segment',
    label: 'Bar Segment',
    icon: '🧱',
    allowedCharts: [ChartType.SIMPLE_BAR, ChartType.GROUPED_BAR, ChartType.STACKED_BAR],
    fields: [asRequired(segmentField)],
  },
  {
    value: 'line-to-bar',
    label: 'Line to Bar',
    icon: '📊',
    allowedCharts: [ChartType.SIMPLE_LINE],
  },
  {
    value: 'stacked-to-grouped',
    label: 'Stacked → Grouped',
    icon: '↔️',
    allowedCharts: [ChartType.STACKED_BAR],
    fields: [stackGroupField],
  },
  {
    value: 'grouped-to-stacked',
    label: 'Grouped → Stacked',
    icon: '↔️',
    allowedCharts: [ChartType.GROUPED_BAR],
    fields: [stackGroupField],
  },
  {
    value: 'stacked-filter-groups',
    label: 'Stacked Filter Groups',
    icon: '🎛️',
    allowedCharts: [ChartType.STACKED_BAR],
    fields: [asRequired(groupFilterField)],
  },
  {
    value: 'grouped-filter-groups',
    label: 'Grouped Filter Groups',
    icon: '🎛️',
    allowedCharts: [ChartType.GROUPED_BAR],
    fields: [asRequired(groupFilterField)],
  },
  {
    value: 'clear',
    label: 'Clear',
    icon: '🧼',
  },
]

const isDev = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV
if (isDev) {
  const drawSchemaIssues = validateDrawSchema(drawActions)
  if (drawSchemaIssues.length > 0) {
    console.warn('[opsBuilder] draw schema mismatch', drawSchemaIssues)
  }
}

export const operationRegistry: OperationRegistry = {
  operations: [
    {
      op: 'draw',
      label: 'Draw',
      icon: '🎨',
      fields: [
        { key: 'chartId', label: 'Chart ID', kind: 'string', optional: true, ui: 'chartId' },
        ...baseSelectFields,
        ...baseStyleFields,
      ],
      actions: drawActions,
    },
    {
      op: 'retrieveValue',
      label: 'Retrieve Value',
      icon: '🔍',
      fields: [
        { key: 'target', label: 'Target', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'precision', label: 'Precision', kind: 'number', optional: true },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'filter',
      label: 'Filter',
      icon: '🧪',
      fields: [
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        {
          key: 'operator',
          label: 'Operator',
          kind: 'enum',
          optional: true,
          options: [...ComparisonOperatorExtendedOptions],
        },
        { key: 'value', label: 'Value', kind: 'stringOrNumber', optional: true },
        { key: 'include', label: 'Include', kind: 'stringOrNumberArray', optional: true, optionsSource: 'target' },
        { key: 'exclude', label: 'Exclude', kind: 'stringOrNumberArray', optional: true, optionsSource: 'target' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'findExtremum',
      label: 'Find Extremum',
      icon: '🏁',
      fields: [
        { key: 'which', label: 'Which', kind: 'enum', optional: false, options: [...ExtremumWhichOptions] },
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'determineRange',
      label: 'Determine Range',
      icon: '📐',
      fields: [
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'compare',
      label: 'Compare',
      icon: '⚖️',
      fields: [
        { key: 'targetA', label: 'Target A', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        { key: 'targetB', label: 'Target B', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'groupA', label: 'Group A', kind: 'string', optional: true, optionsSource: 'series' },
        { key: 'groupB', label: 'Group B', kind: 'string', optional: true, optionsSource: 'series' },
        { key: 'which', label: 'Which', kind: 'enum', optional: true, options: [...ExtremumWhichOptions] },
      ],
    },
    {
      op: 'compareBool',
      label: 'Compare Bool',
      icon: '✅',
      fields: [
        { key: 'targetA', label: 'Target A', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        { key: 'targetB', label: 'Target B', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        {
          key: 'operator',
          label: 'Operator',
          kind: 'enum',
          optional: false,
          options: [...ComparisonOperatorExtendedOptions],
        },
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'groupA', label: 'Group A', kind: 'string', optional: true, optionsSource: 'series' },
        { key: 'groupB', label: 'Group B', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'sort',
      label: 'Sort',
      icon: '↕️',
      fields: [
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'order', label: 'Order', kind: 'enum', optional: true, options: [...SortOrderOptions] },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'sum',
      label: 'Sum',
      icon: '∑',
      fields: [
        { key: 'field', label: 'Field', kind: 'string', optional: false, optionsSource: 'field' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'average',
      label: 'Average',
      icon: '➗',
      fields: [
        { key: 'field', label: 'Field', kind: 'string', optional: false, optionsSource: 'field' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'diff',
      label: 'Diff',
      icon: '➖',
      fields: [
        { key: 'targetA', label: 'Target A', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        { key: 'targetB', label: 'Target B', kind: 'stringOrNumber', optional: false, optionsSource: 'target' },
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'signed', label: 'Signed', kind: 'boolean', optional: true },
        { key: 'precision', label: 'Precision', kind: 'number', optional: true },
        { key: 'mode', label: 'Mode', kind: 'enum', optional: true, options: [...DiffModeOptions] },
        { key: 'percent', label: 'Percent', kind: 'boolean', optional: true },
        { key: 'scale', label: 'Scale', kind: 'number', optional: true },
        { key: 'aggregate', label: 'Aggregate', kind: 'enum', optional: true, options: [...AggregateOptions] },
      ],
    },
    {
      op: 'lagDiff',
      label: 'Lag Diff',
      icon: '⏱️',
      fields: [
        { key: 'orderField', label: 'Order Field', kind: 'string', optional: false, optionsSource: 'field' },
        { key: 'order', label: 'Order', kind: 'enum', optional: true, options: [...SortOrderOptions] },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
        { key: 'absolute', label: 'Absolute', kind: 'boolean', optional: true },
      ],
    },
    {
      op: 'nth',
      label: 'Nth',
      icon: '🔢',
      fields: [
        { key: 'n', label: 'N', kind: 'number', optional: false },
        { key: 'from', label: 'From', kind: 'enum', optional: true, options: [...NthFromOptions] },
        { key: 'orderField', label: 'Order Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'count',
      label: 'Count',
      icon: '🧮',
      fields: [
        { key: 'field', label: 'Field', kind: 'string', optional: true, optionsSource: 'field' },
        { key: 'group', label: 'Group', kind: 'string', optional: true, optionsSource: 'series' },
      ],
    },
    {
      op: 'sleep',
      label: 'Sleep',
      icon: '⏸️',
      fields: [
        { key: 'seconds', label: 'Seconds', kind: 'number', optional: true },
        { key: 'duration', label: 'Duration', kind: 'number', optional: true },
      ],
    },
  ],
}
