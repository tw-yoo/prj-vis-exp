import type { VegaLiteSpec } from '../../domain/chart'
import type { ChartContext } from '../../domain/nlp'
import { DataAttributes } from '../../rendering/interfaces/attributes'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function pushUnique(bucket: string[], value: unknown) {
  if (value === null || value === undefined) return
  const text = String(value).trim()
  if (!text) return
  if (!bucket.includes(text)) bucket.push(text)
}

function collectFromSpec(spec: VegaLiteSpec) {
  const fields: string[] = []
  const targets: string[] = []
  const series: string[] = []
  const values: string[] = []

  const specRecord = spec as unknown as UnknownRecord
  const encoding = asRecord(specRecord.encoding)
  const xField = typeof asRecord(encoding?.x)?.field === 'string' ? String(asRecord(encoding?.x)?.field) : undefined
  const yField = typeof asRecord(encoding?.y)?.field === 'string' ? String(asRecord(encoding?.y)?.field) : undefined
  const seriesField =
    typeof asRecord(encoding?.color)?.field === 'string' ? String(asRecord(encoding?.color)?.field) : undefined

  pushUnique(fields, xField)
  pushUnique(fields, yField)
  pushUnique(fields, seriesField)

  const valuesRaw = asRecord(specRecord.data)?.values
  if (Array.isArray(valuesRaw)) {
    valuesRaw.forEach((row) => {
      const record = asRecord(row)
      if (!record) return
      Object.keys(record).forEach((field) => pushUnique(fields, field))
      if (xField) pushUnique(targets, record[xField])
      if (seriesField) pushUnique(series, record[seriesField])
      if (yField) pushUnique(values, record[yField])
    })
  }

  return {
    xField,
    yField,
    seriesField,
    fields,
    targets,
    series,
    values,
  }
}

function collectFromContainer(container?: HTMLElement | null) {
  const fields: string[] = []
  const targets: string[] = []
  const series: string[] = []
  const values: string[] = []

  if (!container) return { fields, targets, series, values }

  const selector = `[${DataAttributes.Target}], [${DataAttributes.Series}], [${DataAttributes.Value}]`
  container.querySelectorAll(selector).forEach((node) => {
    pushUnique(targets, node.getAttribute(DataAttributes.Target))
    pushUnique(series, node.getAttribute(DataAttributes.Series))
    pushUnique(values, node.getAttribute(DataAttributes.Value))
  })

  const svg = container.querySelector('svg')
  if (svg) {
    pushUnique(fields, svg.getAttribute(DataAttributes.XField))
    pushUnique(fields, svg.getAttribute(DataAttributes.YField))
    pushUnique(fields, svg.getAttribute(DataAttributes.ColorField))
  }

  return { fields, targets, series, values }
}

function mergeUnique(...lists: string[][]) {
  const merged: string[] = []
  lists.forEach((list) => list.forEach((entry) => pushUnique(merged, entry)))
  return merged
}

export function resolveChartContext(spec: VegaLiteSpec, container?: HTMLElement | null): ChartContext {
  const fromSpec = collectFromSpec(spec)
  const fromContainer = collectFromContainer(container)

  const fields = mergeUnique(fromSpec.fields, fromContainer.fields, ['target', 'value'])
  const targets = mergeUnique(fromSpec.targets, fromContainer.targets)
  const series = mergeUnique(fromSpec.series, fromContainer.series)
  const values = mergeUnique(fromSpec.values, fromContainer.values)

  return {
    spec,
    xField: fromSpec.xField,
    yField: fromSpec.yField,
    seriesField: fromSpec.seriesField,
    fields,
    targets,
    series,
    values,
  }
}

