import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: COMPLETE
// CONVERTIBILITY_ITEMS: 0

const GROUP_SMALL = '0 – 500 million US dollars'
const GROUP_LARGE = '2,001 – 10,000 million US dollars'

type SegmentInstruction = {
  barId: string
  threshold: number
}

const FALLBACK_SEGMENTS: SegmentInstruction[] = [
  { barId: `2008|${GROUP_LARGE}`, threshold: 23.4 },
  { barId: `2009|${GROUP_LARGE}`, threshold: 22.5 },
  { barId: `2010|${GROUP_LARGE}`, threshold: 24.8 },
  { barId: `2011|${GROUP_LARGE}`, threshold: 24.8 },
  { barId: `2012|${GROUP_LARGE}`, threshold: 23.2 },
]

const FALLBACK_LARGEST_BAR_ID = `2011|${GROUP_LARGE}`

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/bar/stacked/1q3mzgt77lwo172f.csv'

let segmentInstructions = [...FALLBACK_SEGMENTS]
let largestDifferenceBarId = FALLBACK_LARGEST_BAR_ID

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  const relevant = datumValues.filter((datum) => {
    const group = String(datum.group ?? '')
    return group === GROUP_SMALL || group === GROUP_LARGE
  })

  const byYear = new Map<string, { small?: number; large?: number }>()
  relevant.forEach((datum) => {
    const year = String(datum.target)
    const group = String(datum.group ?? '')
    const value = Number(datum.value)
    if (!Number.isFinite(value)) return
    const row = byYear.get(year) ?? {}
    if (group === GROUP_SMALL) row.small = value
    if (group === GROUP_LARGE) row.large = value
    byYear.set(year, row)
  })

  const years = Array.from(byYear.keys()).sort((a, b) => Number(a) - Number(b))
  const computedSegments: SegmentInstruction[] = []
  let maxDiff = -Infinity
  let maxDiffBarId = FALLBACK_LARGEST_BAR_ID

  years.forEach((year) => {
    const pair = byYear.get(year)
    if (!pair) return
    const smallValue = pair.small
    const largeValue = pair.large
    if (smallValue == null || largeValue == null) return
    if (!Number.isFinite(smallValue) || !Number.isFinite(largeValue)) return

    const largerGroup = smallValue >= largeValue ? GROUP_SMALL : GROUP_LARGE
    const largerValue = Math.max(smallValue, largeValue)
    const smallerValue = Math.min(smallValue, largeValue)
    const diff = largerValue - smallerValue
    const barId = `${year}|${largerGroup}`

    computedSegments.push({ barId, threshold: smallerValue })
    if (diff > maxDiff) {
      maxDiff = diff
      maxDiffBarId = barId
    }
  })

  if (computedSegments.length > 0) {
    segmentInstructions = computedSegments
    largestDifferenceBarId = maxDiffBarId
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

const segmentOps = segmentInstructions.flatMap((instruction, index) => {
  const op = ops.draw.barSegment(
    undefined,
    [instruction.barId],
    draw.segmentSpec.threshold(
      instruction.threshold,
      'gte',
      draw.style.segment('rgba(239, 68, 68, 0.35)', '#dc2626', 1.5, 0.95),
    ),
  )
  return index === 0 ? [op] : [ops.draw.sleep(1), op]
})

export default plan(
  group(
    ops.draw.stackedFilterGroups(undefined, [GROUP_SMALL, GROUP_LARGE], 'include'),
    ops.draw.sleep(1),
    ops.draw.stackedToGrouped(
      undefined,
      draw.stackGroupSpec.build(false, 'Year', 'Asset Size'),
    ),
    ops.draw.sleep(1),
    ...segmentOps,
    ops.draw.sleep(1),
    ops.draw.text(
      undefined,
      draw.select.markKeys('rect', largestDifferenceBarId),
      draw.textSpec.anchor(
        'Largest',
        draw.style.text('#111827', 12, 700),
        0,
        -10,
      ),
    ),
  ),
)
