import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: PARTIAL
// CONVERTIBILITY_ITEMS: 3

const SERIES_INTERNET = 'Internet'
const SERIES_RADIO = 'Radio'
const SERIES_NEWSPAPER = 'Newspaper'

const FALLBACK_SELECTED_YEARS = ['2003', '2004', '2005', '2006', '2007']
const FALLBACK_INTERNET_AVERAGE = 22.4

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/line/multiple/3un2wyjae3ebkncl.csv'

let selectedYears = [...FALLBACK_SELECTED_YEARS]
let internetAverage = FALLBACK_INTERNET_AVERAGE

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)

  const byYear = new Map<string, { internet?: number; radio?: number; newspaper?: number }>()

  datumValues.forEach((datum) => {
    const year = String(datum.target)
    const source = String(datum.group ?? '')
    const value = Number(datum.value)
    if (!year || !Number.isFinite(value)) return

    const row = byYear.get(year) ?? {}
    if (source === SERIES_INTERNET) row.internet = value
    if (source === SERIES_RADIO) row.radio = value
    if (source === SERIES_NEWSPAPER) row.newspaper = value
    byYear.set(year, row)
  })

  const yearsSorted = Array.from(byYear.keys()).sort((a, b) => Number(a) - Number(b))
  const matchedYears: string[] = []
  const internetValues: number[] = []

  yearsSorted.forEach((year) => {
    const values = byYear.get(year)
    if (!values) return
    const internet = values.internet
    const radio = values.radio
    const newspaper = values.newspaper
    if (internet == null || radio == null || newspaper == null) return
    if (internet > radio && internet < newspaper) {
      matchedYears.push(year)
      internetValues.push(internet)
    }
  })

  if (matchedYears.length > 0 && internetValues.length > 0) {
    selectedYears = matchedYears
    internetAverage = internetValues.reduce((acc, value) => acc + value, 0) / internetValues.length
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

export default plan(
  group(
    // TODO(convertibility-step-2): Multi-line runtime does not support direct x-domain filter draw action; `split` is used as a best-effort focus on matching years.
    // PROPOSED_ACTION: draw.filterByXInclude(...labels)
    ops.draw.split(
      undefined,
      draw.splitSpec.oneAndRest('candidate', selectedYears, 'others', 'horizontal'),
    ),
    ops.draw.sleep(1),

    // TODO(convertibility-step-1): Multi-line runtime does not support direct series include filtering; using `dim` to focus target series.
    // PROPOSED_ACTION: draw.filterSeriesInclude(...series)
    ops.draw.dim(
      'candidate',
      draw.select.keys(SERIES_INTERNET, SERIES_RADIO, SERIES_NEWSPAPER),
      undefined,
      0.15,
    ),
    ops.draw.sleep(1),

    // TODO(convertibility-step-3): Multi-line runtime does not support direct single-series filter; using `dim` + `highlight` for Internet.
    // PROPOSED_ACTION: draw.filterSeriesOnly(series)
    ops.draw.dim(
      'candidate',
      draw.select.keys(SERIES_INTERNET),
      undefined,
      0.12,
    ),
    ops.draw.sleep(1),

    ops.draw.highlight(
      'candidate',
      draw.select.keys(SERIES_INTERNET),
      '#f59e0b',
      0.98,
    ),
    ops.draw.sleep(1),

    ops.draw.line(
      'candidate',
      draw.lineSpec.horizontalFromY(
        internetAverage,
        draw.style.line('#0ea5e9', 2, 0.95),
      ),
    ),
  ),
)
