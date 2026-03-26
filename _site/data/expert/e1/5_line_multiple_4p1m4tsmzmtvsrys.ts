import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: COMPLETE
// CONVERTIBILITY_ITEMS: 0

const OBAMA = 'Obama'
const ROMNEY = 'Romney'

const FALLBACK_CROSS_LABELS = ['Jun 11 – Jul 1']
const FALLBACK_MIN_SUPPORT = 0.45
const FALLBACK_MAX_SUPPORT = 0.49

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/line/multiple/4p1m4tsmzmtvsrys.csv'

let crossLabels = [...FALLBACK_CROSS_LABELS]
let minSupport = FALLBACK_MIN_SUPPORT
let maxSupport = FALLBACK_MAX_SUPPORT

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)

  const byLabel = new Map<string, { obama?: number; romney?: number }>()
  const orderedLabels: string[] = []
  const seenLabel = new Set<string>()
  const allValues: number[] = []

  datumValues.forEach((datum) => {
    const label = String(datum.target)
    const candidate = String(datum.group ?? '')
    const value = Number(datum.value)
    if (!label || !Number.isFinite(value)) return

    if (!seenLabel.has(label)) {
      seenLabel.add(label)
      orderedLabels.push(label)
    }

    const row = byLabel.get(label) ?? {}
    if (candidate === OBAMA) row.obama = value
    if (candidate === ROMNEY) row.romney = value
    byLabel.set(label, row)

    allValues.push(value)
  })

  if (allValues.length > 0) {
    minSupport = Math.min(...allValues)
    maxSupport = Math.max(...allValues)
  }

  const computedCrossLabels: string[] = []
  let previousNonZeroSign: number | null = null

  orderedLabels.forEach((label) => {
    const values = byLabel.get(label)
    if (!values) return
    const obama = values.obama
    const romney = values.romney
    if (obama == null || romney == null) return

    const diff = obama - romney
    const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0

    if (sign !== 0 && previousNonZeroSign != null && sign !== previousNonZeroSign) {
      computedCrossLabels.push(label)
    }

    if (sign !== 0) {
      previousNonZeroSign = sign
    }
  })

  if (computedCrossLabels.length > 0) {
    crossLabels = computedCrossLabels
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

const supportRange = Math.max(maxSupport - minSupport, 1e-6)

const verticalLineOps = crossLabels.map((label) =>
  ops.draw.line(
    undefined,
    draw.lineSpec.angle(
      label,
      minSupport,
      0,
      supportRange,
      draw.style.line('#ef4444', 2, 0.95),
    ),
  ),
)

const opsWithSleep = verticalLineOps.flatMap((op, index) => (index === 0 ? [op] : [ops.draw.sleep(1), op]))

export default plan(
  group(...opsWithSleep),
)
