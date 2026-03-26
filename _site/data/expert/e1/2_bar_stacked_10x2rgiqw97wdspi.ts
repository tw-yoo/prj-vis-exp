import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: PARTIAL
// CONVERTIBILITY_ITEMS: 1

const FALLBACK_COMMERCIAL_AVERAGE = 257.81818181818176
const FALLBACK_BROADCASTING_AVERAGE = 211.95454545454547
const FALLBACK_COMMERCIAL_ABOVE_TARGETS = ['2015/16', '2016/17', '2017/18', '2018/19', '2019/20']
const FALLBACK_BROADCASTING_ABOVE_TARGETS = ['2015/16', '2016/17', '2017/18', '2018/19', '2019/20']

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/bar/stacked/10x2rgiqw97wdspi.csv'

let commercialAverage = FALLBACK_COMMERCIAL_AVERAGE
let broadcastingAverage = FALLBACK_BROADCASTING_AVERAGE
let commercialAboveTargets = [...FALLBACK_COMMERCIAL_ABOVE_TARGETS]
let broadcastingAboveTargets = [...FALLBACK_BROADCASTING_ABOVE_TARGETS]

function computeAverage(values: number[]): number {
  if (values.length === 0) return NaN
  const sum = values.reduce((acc, value) => acc + value, 0)
  return sum / values.length
}

function computeAboveTargets(
  rows: Array<{ target: string | number; value: number }>,
  average: number,
): string[] {
  return Array.from(new Set(rows.filter((row) => row.value > average).map((row) => String(row.target))))
}

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  const commercialRows = datumValues
    .filter((datum) => String(datum.group ?? '').toLowerCase() === 'commercial')
    .map((datum) => ({ target: datum.target, value: datum.value }))
  const broadcastingRows = datumValues
    .filter((datum) => String(datum.group ?? '').toLowerCase() === 'broadcasting')
    .map((datum) => ({ target: datum.target, value: datum.value }))

  const commercialMean = computeAverage(commercialRows.map((row) => row.value))
  if (Number.isFinite(commercialMean)) {
    commercialAverage = commercialMean
    commercialAboveTargets = computeAboveTargets(commercialRows, commercialMean)
  }

  const broadcastingMean = computeAverage(broadcastingRows.map((row) => row.value))
  if (Number.isFinite(broadcastingMean)) {
    broadcastingAverage = broadcastingMean
    broadcastingAboveTargets = computeAboveTargets(broadcastingRows, broadcastingMean)
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

export default plan(
  group(
    ops.draw.stackedFilterGroups(undefined, ['Commercial', 'Broadcasting'], 'include'),
    ops.draw.sleep(1),
    // TODO(convertibility-step-2): `draw.split` on stacked bars can split only by x-domain labels (Season), not by series (Revenue_Type).
    // PROPOSED_ACTION: draw.splitBySeries('Revenue_Type', 'Commercial', 'Broadcasting', { orientation: 'vertical' })
    ops.draw.stackedFilterGroups(undefined, ['Commercial'], 'include'),
    ops.draw.sleep(1),
    ops.draw.line(
      undefined,
      draw.lineSpec.horizontalFromY(
        commercialAverage,
        draw.style.line('#0ea5e9', 2, 0.9),
      ),
    ),
    ops.draw.sleep(1),
    ops.draw.highlight(
      undefined,
      draw.select.markKeys('rect', ...commercialAboveTargets),
      '#ef4444',
      0.9,
    ),
    ops.draw.sleep(1),
    ops.draw.stackedFilterGroups(undefined, ['Broadcasting'], 'include'),
    ops.draw.sleep(1),
    ops.draw.line(
      undefined,
      draw.lineSpec.horizontalFromY(
        broadcastingAverage,
        draw.style.line('#0ea5e9', 2, 0.9),
      ),
    ),
    ops.draw.sleep(1),
    ops.draw.highlight(
      undefined,
      draw.select.markKeys('rect', ...broadcastingAboveTargets),
      '#f97316',
      0.9,
    ),
  ),
)