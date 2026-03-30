import * as d3 from 'd3'
import {
  getMultipleLineStoredData,
  resolveMultiLineEncoding,
  type MultiLineSpec,
} from './multipleLineRenderer'
import {
  setSimpleLineStoredData,
  tagSimpleLineMarks,
  type LineSpec,
} from './simpleLineRenderer'
import { storeDerivedChartState } from '../utils/derivedChartState'
import { storeRuntimeChartState } from '../utils/runtimeChartState'
import { ChartType } from '../../domain/chart'
import type { JsonValue } from '../../types'
import type { RawRow } from '../ops/common/datum'
import { DataAttributes } from '../interfaces'

function removeSeriesMetadata(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
  svg.attr(DataAttributes.ColorField, null).attr(DataAttributes.GroupLabel, null)
  svg.selectAll<SVGElement, unknown>('[data-series]').each(function () {
    ;(this as SVGElement).removeAttribute(DataAttributes.Series)
    ;(this as SVGElement).removeAttribute(DataAttributes.GroupValue)
  })
}

export async function convertMultiLineToSimpleLine(
  container: HTMLElement,
  spec: MultiLineSpec,
  seriesKey: string,
): Promise<LineSpec> {
  const encoding = resolveMultiLineEncoding(spec)
  const colorField = encoding?.colorField

  // Phase 1: fade out other series marks
  const svg = d3.select(container).select<SVGSVGElement>('svg')
  if (!svg.empty() && colorField) {
    const otherMarks = svg
      .selectAll<SVGElement, unknown>('path[data-series], circle[data-series], g[data-series]')
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
      otherMarks.remove()
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

  if (!svg.empty()) {
    svg.attr(DataAttributes.XField, encoding?.xField ?? '').attr(DataAttributes.YField, encoding?.yField ?? '')
  }
  removeSeriesMetadata(svg)
  setSimpleLineStoredData(container, filtered.map((row) => ({ ...row })))
  await tagSimpleLineMarks(container, simpleLineSpec)
  storeRuntimeChartState(container, { chartType: ChartType.SIMPLE_LINE, spec: simpleLineSpec, renderer: 'd3' })
  storeDerivedChartState(container, ChartType.SIMPLE_LINE, simpleLineSpec)

  return simpleLineSpec
}
