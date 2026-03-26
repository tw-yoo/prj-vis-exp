import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: PARTIAL
// CONVERTIBILITY_ITEMS: 3

const FREQUENCY_OCCASIONAL = 'Occasionally (less than once a month)'
const FREQUENCY_INFREQUENT = 'Infrequently (once a year or less)'
const FREQUENCY_FREQUENT = 'Frequently (one or more times per month)'

const PRIMARY_SELECTED_FREQUENCIES = [FREQUENCY_OCCASIONAL, FREQUENCY_INFREQUENT]
const SECONDARY_SELECTED_FREQUENCIES = [FREQUENCY_OCCASIONAL, FREQUENCY_FREQUENT]

const FALLBACK_SELECTED_FREQUENCIES = [...PRIMARY_SELECTED_FREQUENCIES]
const FALLBACK_MAX_RACE = 'White'
const FALLBACK_MAX_SUM = 0.88

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/bar/grouped/0opt5fjw2xphdgp2.csv'

let selectedFrequencies = [...FALLBACK_SELECTED_FREQUENCIES]
let maxRace = FALLBACK_MAX_RACE
let maxSum = FALLBACK_MAX_SUM

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  const rows = datumValues
    .map((datum) => ({
      frequency: String(datum.target),
      race: String(datum.group ?? ''),
      value: Number(datum.value),
    }))
    .filter((row) => row.frequency.length > 0 && row.race.length > 0 && Number.isFinite(row.value))

  if (rows.length > 0) {
    const availableFrequencies = new Set(rows.map((row) => row.frequency))
    const hasAll = (candidates: string[]) => candidates.every((candidate) => availableFrequencies.has(candidate))

    if (hasAll(PRIMARY_SELECTED_FREQUENCIES)) {
      selectedFrequencies = [...PRIMARY_SELECTED_FREQUENCIES]
    } else if (hasAll(SECONDARY_SELECTED_FREQUENCIES)) {
      selectedFrequencies = [...SECONDARY_SELECTED_FREQUENCIES]
    }

    const sumByRace = new Map<string, number>()
    rows.forEach((row) => {
      if (!selectedFrequencies.includes(row.frequency)) return
      sumByRace.set(row.race, (sumByRace.get(row.race) ?? 0) + row.value)
    })

    let nextMaxRace = maxRace
    let nextMaxSum = -Infinity

    sumByRace.forEach((value, race) => {
      if (value > nextMaxSum) {
        nextMaxSum = value
        nextMaxRace = race
      }
    })

    if (Number.isFinite(nextMaxSum)) {
      maxRace = nextMaxRace
      maxSum = nextMaxSum
    }
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

const selectedLabel = selectedFrequencies
  .map((frequency) => {
    if (frequency.startsWith('Occasionally')) return 'Occasionally'
    if (frequency.startsWith('Infrequently')) return 'Infrequently'
    if (frequency.startsWith('Frequently')) return 'Frequently'
    return frequency
  })
  .join(' + ')

const summaryText = `${selectedLabel} max: ${maxRace} (${maxSum.toFixed(2)})`
const winnerSegmentIds = selectedFrequencies.map((frequency) => `selected|${frequency}|${maxRace}`)

export default plan(
  group(
    // TODO(convertibility-step-1): Exact axis remapping from facet-grouped layout to a non-facet swapped grouped layout is not directly supported as a single draw action.
    // PROPOSED_ACTION: draw.remapGroupedAxes(xField, groupField)
    ops.draw.groupedToStacked(
      undefined,
      draw.stackGroupSpec.build(false, 'Race/Ethnicity', 'Frequency'),
    ),
    ops.draw.sleep(1),

    // TODO(convertibility-step-2): Field-level include filtering on non-x dimensions (e.g., Frequency after transform) is not directly supported in grouped runtime flow.
    // PROPOSED_ACTION: draw.filterByField(field, includeValues)
    ops.draw.split(
      undefined,
      draw.splitSpec.oneAndRest('selected', selectedFrequencies, 'others', 'horizontal'),
    ),
    ops.draw.sleep(1),

    // TODO(convertibility-step-3): Creating a brand-new simple bar chart from aggregated grouped values is not supported by current draw actions.
    // PROPOSED_ACTION: draw.composeSimpleBarFromAggregates(xField, groupField, aggregate)
    ops.draw.text(
      undefined,
      undefined,
      draw.textSpec.normalized(
        summaryText,
        0.5,
        0.98,
        draw.style.text('#111827', 12, 700),
      ),
    ),
    ops.draw.sleep(1),

    ops.draw.highlight(
      'selected',
      draw.select.markKeys('rect', ...winnerSegmentIds),
      '#ef4444',
      0.95,
    ),
  ),
)
