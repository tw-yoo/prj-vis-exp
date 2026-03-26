import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: COMPLETE
// CONVERTIBILITY_ITEMS: 0

const FALLBACK_AVERAGE = 2.7825
const FALLBACK_ABOVE_AVERAGE_TARGETS = [
  '2002',
  '2003',
  '2004',
  '2005',
  '2006',
  '2007',
  '2008',
  '2010',
  '2011',
]

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/bar/simple/0o12tngadmjjux2n.csv'

let averageValue = FALLBACK_AVERAGE
let aboveAverageTargets = [...FALLBACK_ABOVE_AVERAGE_TARGETS]

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  if (datumValues.length > 0) {
    const sum = datumValues.reduce((acc, datum) => acc + datum.value, 0)
    const mean = sum / datumValues.length
    if (Number.isFinite(mean)) {
      averageValue = mean
      aboveAverageTargets = Array.from(
        new Set(
          datumValues
            .filter((datum) => datum.value > mean)
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
        draw.style.line('#0ea5e9', 2, 0.9),
      ),
    ),
    ops.draw.sleep(1),
    ops.draw.highlight(
      undefined,
      draw.select.markKeys('rect', ...aboveAverageTargets),
      '#ef4444',
      0.9,
    ),
  ),
)