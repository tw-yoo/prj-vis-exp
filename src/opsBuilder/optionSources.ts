import type { VegaLiteSpec } from '../utils/chartRenderer'
import { DataAttributes } from '../renderer/interfaces/attributes'
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
  const encoding = (spec as { encoding?: Record<string, unknown> }).encoding
  const tryField = (channel: unknown) => {
    if (!isPlainObject(channel)) return
    const field = channel.field
    if (typeof field === 'string') fields.add(field)
  }
  if (encoding) {
    tryField((encoding as any).x)
    tryField((encoding as any).y)
    tryField((encoding as any).color)
    tryField((encoding as any).row)
    tryField((encoding as any).column)
    tryField((encoding as any).facet)
  }
  const facetField = (spec as any)?.facet?.field
  if (typeof facetField === 'string') fields.add(facetField)
  return fields
}

const collectFromSpecData = (spec: VegaLiteSpec | null) => {
  const targets = new Set<string>()
  const series = new Set<string>()
  const values = new Set<string>()
  const fields = new Set<string>()
  if (!spec) return { targets, series, values, fields }
  const encoding = (spec as any)?.encoding
  const xField = encoding?.x?.field
  const yField = encoding?.y?.field
  const colorField = encoding?.color?.field
  const dataValues = (spec as any)?.data?.values
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
