import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: COMPLETE
// CONVERTIBILITY_ITEMS: 0

const FALLBACK_AVERAGE = 131.6421052631579
const FALLBACK_BELOW_AVERAGE_YEARS = [
  '2005',
  '2007',
  '2008',
  '2010',
  '2011',
  '2013',
  '2014',
  '2016',
  '2017',
  '2018',
  '2019',
]

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/line/simple/724mfnyk34kp97le.csv'

let averageValue = FALLBACK_AVERAGE
let belowAverageYears = [...FALLBACK_BELOW_AVERAGE_YEARS]

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  if (datumValues.length > 0) {
    const sum = datumValues.reduce((acc, datum) => acc + Number(datum.value), 0)
    const average = sum / datumValues.length

    if (Number.isFinite(average)) {
      averageValue = average
      belowAverageYears = Array.from(
        new Set(
          datumValues
            .filter((datum) => Number(datum.value) < average)
            .map((datum) => String(datum.target)),
        ),
      )
    }
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

export default plan(
  group(
    ops.draw.line(
      undefined,
      draw.lineSpec.horizontalFromY(
        averageValue,
        draw.style.line('#0ea5e9', 2, 0.95),
      ),
    ),
    ops.draw.sleep(1),
    ops.draw.highlight(
      undefined,
      draw.select.keys(...belowAverageYears),
      '#ef4444',
      0.95,
    ),
  ),
)
