import type { DatumValue, OperationSpec } from '../types'
import { aggregateDatumValuesByTarget, countUniqueGroups } from '../renderer/ops/common/workingData.ts'
import { DrawAction, type DrawGroupFilterSpec, type DrawOp } from '../renderer/draw/types.ts'

const cloneDataset = (rows: any[]) => rows.map((row) => ({ ...row }))

type GroupFilterConfig<Spec> = {
  action: DrawAction
  getGroupField: (spec: Spec) => string | undefined
  getOriginalData: (container: HTMLElement) => any[]
  render: (container: HTMLElement, spec: Spec) => Promise<unknown>
}

export async function handleGroupFilter<Spec>(
  container: HTMLElement,
  spec: Spec,
  drawOp: DrawOp,
  config: GroupFilterConfig<Spec>,
) {
  if (drawOp.action !== config.action) return false
  const filterSpec = drawOp.groupFilter as DrawGroupFilterSpec | undefined
  if (!filterSpec) {
    console.warn(`draw:${config.action} requires groupFilter spec`)
    return true
  }
  const colorField = config.getGroupField(spec)
  if (!colorField) {
    console.warn(`draw:${config.action} requires a color encoding field`)
    return true
  }
  const originalData = config.getOriginalData(container)
  if (!originalData.length) return true
  let filtered = originalData
  if (filterSpec.reset) {
    filtered = originalData
  } else {
    const includeCandidates =
      filterSpec.groups?.length
        ? filterSpec.groups
        : filterSpec.include?.length
          ? filterSpec.include
          : filterSpec.keep
    if (includeCandidates && includeCandidates.length) {
      const includeSet = new Set(includeCandidates.map(String))
      filtered = originalData.filter((row) => includeSet.has(String(row[colorField])))
    } else if (filterSpec.exclude && filterSpec.exclude.length) {
      const excludeSet = new Set(filterSpec.exclude.map(String))
      filtered = originalData.filter((row) => !excludeSet.has(String(row[colorField])))
    } else {
      console.warn(`draw:${config.action} needs groups/include/keep/exclude or reset flag`)
      return true
    }
  }
  await config.render(container, { ...spec, data: { values: cloneDataset(filtered) } })
  return true
}

export function createGroupAwareOperationInput(
  getLatestWorking: () => DatumValue[],
  shouldAggregate: (latest: DatumValue[], operation: OperationSpec) => boolean,
) {
  return (operation: OperationSpec, _current: DatumValue[]) => {
    const latest = getLatestWorking()
    const hasGroup = operation.group != null && String(operation.group).trim() !== ''
    if (hasGroup) return latest
    return shouldAggregate(latest, operation) ? aggregateDatumValuesByTarget(latest) : latest
  }
}

export function shouldAggregateWhenMultipleGroups(latest: DatumValue[]) {
  return countUniqueGroups(latest) > 1
}

export function shouldAggregateWhenSingleGroup(latest: DatumValue[]) {
  return countUniqueGroups(latest) <= 1
}
