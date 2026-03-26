import { dataActions } from './data'
import { drawActions } from './draw'

export const ops = {
  draw: drawActions,
  data: dataActions,
} as const
