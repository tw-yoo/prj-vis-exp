import type { OperationSpec } from '../../../types'
import type { OpsPlanGroups } from './types'

export const group = (...ops: OperationSpec[]): OperationSpec[] => ops

export const plan = (...groups: OperationSpec[][]): OpsPlanGroups => groups
