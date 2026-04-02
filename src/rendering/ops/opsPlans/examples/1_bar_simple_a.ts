import { draw, ops } from '../../../../operation/build'
import { group, plan } from '../helpers'

export default plan(
  group(
    ops.draw.line(undefined, draw.lineSpec.horizontalFromY(63, draw.style.line('#f59e0b', 2))),
  ),
)
