import type { VegaLiteSpec } from '../../../domain/chart'
import { DataAttributes } from '../../../rendering/interfaces/attributes'
import type { OpsBuilderOptionSources } from './types'

const emptySources: OpsBuilderOptionSources = {
  targets: [],
  series: [],
  ids: [],
  values: [],
  fields: [],
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const asRecord = (value: unknown): Record<string, unknown> | null => (isPlainObject(value) ? value : null)

const toUniqueList = (items: Iterable<string>) => Array.from(new Set(items)).filter((item) => item.trim().length > 0)

const pushString = (set: Set<string>, value: unknown) => {
  if (value === null || value === undefined) return
  const text = String(value).trim()
  if (!text) return
  set.add(text)
}

const collectFromContainer = (container: HTMLElement | null) => {
  const targets = new Set<string>()
  const series = new Set<string>()
  const ids = new Set<string>()
  const values = new Set<string>()
  if (!container) return { targets, series, ids, values }
  const selector = `[${DataAttributes.Target}], [${DataAttributes.Id}], [${DataAttributes.Value}], [${DataAttributes.Series}]`
  container.querySelectorAll(selector).forEach((el) => {
    pushString(targets, el.getAttribute(DataAttributes.Target))
    pushString(ids, el.getAttribute(DataAttributes.Id))
    pushString(values, el.getAttribute(DataAttributes.Value))
    pushString(series, el.getAttribute(DataAttributes.Series))
  })
  return { targets, series, ids, values }
}

const collectEncodingFields = (spec: VegaLiteSpec | null) => {
  const fields = new Set<string>()
  if (!spec) return fields
  const specRecord = spec as Record<string, unknown>
  const encoding = asRecord(specRecord.encoding)
  const tryField = (channel: unknown) => {
    if (!isPlainObject(channel)) return
    const field = channel.field
    if (typeof field === 'string') fields.add(field)
  }
  if (encoding) {
    tryField(encoding.x)
    tryField(encoding.y)
    tryField(encoding.color)
    tryField(encoding.row)
    tryField(encoding.column)
    tryField(encoding.facet)
  }
  const facetField = asRecord(specRecord.facet)?.field
  if (typeof facetField === 'string') fields.add(facetField)
  return fields
}

const collectFromSpecData = (spec: VegaLiteSpec | null) => {
  const targets = new Set<string>()
  const series = new Set<string>()
  const values = new Set<string>()
  const fields = new Set<string>()
  if (!spec) return { targets, series, values, fields }
  const specRecord = spec as Record<string, unknown>
  const encoding = asRecord(specRecord.encoding)
  const xField = asRecord(encoding?.x)?.field
  const yField = asRecord(encoding?.y)?.field
  const colorField = asRecord(encoding?.color)?.field
  const dataValues = asRecord(specRecord.data)?.values
  if (!Array.isArray(dataValues)) return { targets, series, values, fields }
  dataValues.forEach((row: unknown) => {
    if (!isPlainObject(row)) return
    if (typeof xField === 'string') pushString(targets, row[xField])
    if (typeof yField === 'string') pushString(values, row[yField])
    if (typeof colorField === 'string') pushString(series, row[colorField])
    Object.keys(row).forEach((key) => fields.add(key))
  })
  return { targets, series, values, fields }
}

export const getEmptyOptionSources = () => ({ ...emptySources })

export const collectOpsBuilderOptionSources = (params: {
  container: HTMLElement | null
  spec: VegaLiteSpec | null
}): OpsBuilderOptionSources => {
  const { container, spec } = params
  const fromContainer = collectFromContainer(container)
  const fromSpecData = collectFromSpecData(spec)
  const fields = collectEncodingFields(spec)

  const targets = new Set<string>([...fromContainer.targets, ...fromSpecData.targets])
  const series = new Set<string>([...fromContainer.series, ...fromSpecData.series])
  const ids = new Set<string>(fromContainer.ids)
  const values = new Set<string>([...fromContainer.values, ...fromSpecData.values])

  fields.add('target')
  fields.add('value')
  fromSpecData.fields.forEach((field) => fields.add(field))

  return {
    targets: toUniqueList(targets),
    series: toUniqueList(series),
    ids: toUniqueList(ids),
    values: toUniqueList(values),
    fields: toUniqueList(fields),
  }
}
