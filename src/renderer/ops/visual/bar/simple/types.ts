import { OperationOp } from '../../../../../types'

export type RetrieveValueVisualOp = {
  op: typeof OperationOp.RetrieveValue
  visual?: {
    highlightColor?: string
    textColor?: string
    precision?: number
  }
  precision?: number
}

export type SortVisualOp = {
  op: typeof OperationOp.Sort
  by: 'x' | 'y'
  order: 'asc' | 'desc'
}
