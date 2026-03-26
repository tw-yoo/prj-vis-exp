import * as d3 from 'd3'
import {
  getMultipleLineStoredData,
  resolveMultiLineEncoding,
  type MultiLineSpec,
} from './multipleLineRenderer'
import {
  renderSimpleLineChart,
  tagSimpleLineMarks,
  type LineSpec,
} from './simpleLineRenderer'
import { storeDerivedChartState } from '../utils/derivedChartState'
import { ChartType } from '../../domain/chart'
import type { JsonValue } from '../../types'
import type { RawRow } from '../ops/common/datum'

export async function convertMultiLineToSimpleLine(
  container: HTMLElement,
  spec: MultiLineSpec,
  seriesKey: string,
): Promise<LineSpec> {
  const encoding = resolveMultiLineEncoding(spec)
  const colorField = encoding?.colorField

  // Phase 1: fade out other series marks
  const svg = d3.select(container).select('svg')
  if (!svg.empty() && colorField) {
    const otherMarks = svg
      .selectAll<SVGElement, unknown>('path[data-series], circle[data-series]')
      .filter(function () {
        const s = (this as SVGElement).getAttribute('data-series')
        return s != null && s !== seriesKey
      })
    if (!otherMarks.empty()) {
      try {
        await otherMarks
          .transition()
          .duration(400)
          .attr('opacity', 0)
          .end()
      } catch {
        // interrupted transitions are ok
      }
    }
  }

  // Build filtered dataset
  const stored = (getMultipleLineStoredData(container) || []) as RawRow[]
  const filtered = colorField
    ? stored.filter((row) => String((row as Record<string, unknown>)[colorField] ?? '') === seriesKey)
    : stored

  // Build SimpleLineSpec from MultiLineSpec
  const xEncoding = spec.encoding?.x as Record<string, JsonValue> | undefined
  const yEncoding = spec.encoding?.y as Record<string, JsonValue> | undefined
  const simpleLineSpec: LineSpec = {
    ...spec,
    mark: { type: 'line', point: true },
    data: { values: filtered.map((row) => ({ ...(row as object) })) },
    encoding: {
      x: {
        field: encoding?.xField ?? '',
        type: (xEncoding?.type as string) ?? 'nominal',
        ...(xEncoding?.axis !== undefined ? { axis: xEncoding.axis } : {}),
      },
      y: {
        field: encoding?.yField ?? '',
        type: (yEncoding?.type as string) ?? 'quantitative',
      },
    },
  } as unknown as LineSpec
  // Remove multi-line specific encodings
  const encAny = simpleLineSpec.encoding as unknown as Record<string, unknown>
  delete encAny.color
  delete encAny.column
  delete encAny.row

  await renderSimpleLineChart(container, simpleLineSpec)
  await tagSimpleLineMarks(container, simpleLineSpec)
  storeDerivedChartState(container, ChartType.SIMPLE_LINE, simpleLineSpec)

  return simpleLineSpec
}
