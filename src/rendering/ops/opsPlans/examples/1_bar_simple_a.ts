import type { DrawLineSpec } from '../../../draw/types'
import { DrawLineModes } from '../../../draw/types'
import { drawOps } from '../../../draw/drawOps'
import { group, plan } from '../helpers'

const lineSpec: DrawLineSpec = {
  mode: DrawLineModes.HorizontalFromY,
  hline: { y: 63 },
  style: {
    stroke: '#f59e0b',
    strokeWidth: 2,
  },
}

export default plan(
  group(
    drawOps.line({
      line: lineSpec,
    }),
  ),
)
