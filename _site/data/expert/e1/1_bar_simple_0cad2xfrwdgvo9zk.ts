import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import type { OpsPlanContext } from '../../../src/rendering/ops/opsPlans/types'

// CONVERTIBILITY_STATUS: COMPLETE
// CONVERTIBILITY_ITEMS: 0

const FALLBACK_AVERAGE = 0
const FALLBACK_BELOW_AVERAGE_TARGETS: Array<string | number> = []

function deriveAverageAndTargets(workingData: OpsPlanContext['workingData']) {
  const numericData = workingData.filter((datum) => Number.isFinite(Number(datum.value)))
  if (numericData.length === 0) {
    return {
      averageValue: FALLBACK_AVERAGE,
      belowAverageTargets: [...FALLBACK_BELOW_AVERAGE_TARGETS],
    }
  }

  const total = numericData.reduce((acc, datum) => acc + Number(datum.value), 0)
  const averageValue = total / numericData.length
  if (!Number.isFinite(averageValue)) {
    return {
      averageValue: FALLBACK_AVERAGE,
      belowAverageTargets: [...FALLBACK_BELOW_AVERAGE_TARGETS],
    }
  }

  const belowAverageTargets = Array.from(
    new Set(
      numericData
        .filter((datum) => Number(datum.value) < averageValue)
        .map((datum) => datum.target),
    ),
  )

  return { averageValue, belowAverageTargets }
}

export default (context: OpsPlanContext) => {
  const { averageValue, belowAverageTargets } = deriveAverageAndTargets(context.workingData)
  return plan(
    group(
      ops.draw.line(
        undefined,
        draw.lineSpec.horizontalFromY(
          averageValue,
          draw.style.line('#0ea5e9', 2, 0.9),
        ),
      ),
      ops.draw.sleep(1),
      ops.draw.highlight(
        undefined,
        draw.select.markKeys('rect', ...belowAverageTargets),
        '#ef4444',
        0.9,
      ),
    ),
  )
}
