import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: PARTIAL
// CONVERTIBILITY_ITEMS: 2

const SURGICAL_GROUP = 'Surgical'

const FALLBACK_EUROPE_COUNTRIES = ['Russia', 'Germany', 'France', 'Italy']
const FALLBACK_ASIA_COUNTRIES = ['India', 'Turkey', 'Japan']

const FALLBACK_EUROPE_AVERAGE = 266352
const FALLBACK_ASIA_AVERAGE = 332067

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/bar/grouped/0gacqohbzj07n25s.csv'

let europeCountries = [...FALLBACK_EUROPE_COUNTRIES]
let asiaCountries = [...FALLBACK_ASIA_COUNTRIES]
let europeAverage = FALLBACK_EUROPE_AVERAGE
let asiaAverage = FALLBACK_ASIA_AVERAGE

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  const surgicalByCountry = new Map<string, number>()

  datumValues.forEach((datum) => {
    if (String(datum.group ?? '') !== SURGICAL_GROUP) return
    const value = Number(datum.value)
    if (!Number.isFinite(value)) return
    surgicalByCountry.set(String(datum.target), value)
  })

  const loadedEurope = FALLBACK_EUROPE_COUNTRIES.filter((country) => surgicalByCountry.has(country))
  const loadedAsia = FALLBACK_ASIA_COUNTRIES.filter((country) => surgicalByCountry.has(country))

  const averageFrom = (countries: string[]) => {
    const values = countries
      .map((country) => surgicalByCountry.get(country))
      .filter((value): value is number => Number.isFinite(value))
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  const nextEuropeAverage = averageFrom(loadedEurope)
  const nextAsiaAverage = averageFrom(loadedAsia)

  if (loadedEurope.length > 0 && loadedAsia.length > 0 && nextEuropeAverage != null && nextAsiaAverage != null) {
    europeCountries = loadedEurope
    asiaCountries = loadedAsia
    europeAverage = nextEuropeAverage
    asiaAverage = nextAsiaAverage
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

const minAverage = Math.min(europeAverage, asiaAverage)
const averageDifference = Math.abs(europeAverage - asiaAverage)

const summaryText = `Europe avg: ${Math.round(europeAverage)}, Asia avg: ${Math.round(asiaAverage)}, Diff: ${Math.round(averageDifference)}`

export default plan(
  group(
    ops.draw.split(
      undefined,
      draw.splitSpec.two('chartA', europeCountries, 'chartB', asiaCountries, 'horizontal'),
    ),
    ops.draw.sleep(1),

    // TODO(convertibility-step-2): Group filtering by series for each split sub-chart is not supported independently; `groupedFilterGroups` applies globally and re-renders.
    // PROPOSED_ACTION: draw.groupedFilterGroupsByChart(chartId, groups, mode)
    ops.draw.groupedFilterGroups(undefined, [SURGICAL_GROUP], 'include'),
    ops.draw.sleep(1),

    ops.draw.split(
      undefined,
      draw.splitSpec.two('chartA', europeCountries, 'chartB', asiaCountries, 'horizontal'),
    ),
    ops.draw.sleep(1),

    ops.draw.filter('chartA', draw.filterSpec.xInclude(...europeCountries)),
    ops.draw.sleep(1),

    ops.draw.filter('chartB', draw.filterSpec.xInclude(...asiaCountries)),
    ops.draw.sleep(1),

    ops.draw.line(
      'chartA',
      draw.lineSpec.horizontalFromY(
        europeAverage,
        draw.style.line('#2563eb', 2, 0.95),
      ),
    ),
    ops.draw.sleep(1),

    ops.draw.line(
      'chartB',
      draw.lineSpec.horizontalFromY(
        asiaAverage,
        draw.style.line('#16a34a', 2, 0.95),
      ),
    ),
    ops.draw.sleep(1),

    // TODO(convertibility-step-4): Creating a new summary chart (chartC) from derived averages and deleting chartA/chartB is not supported by current draw actions.
    // PROPOSED_ACTION: draw.composeSummaryBarChart(xLabel, yLabel, data)
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

    ops.draw.line(
      'chartA',
      draw.lineSpec.horizontalFromY(
        minAverage,
        draw.style.line('#f59e0b', 1.5, 0.9),
      ),
    ),
    ops.draw.sleep(1),

    ops.draw.line(
      'chartB',
      draw.lineSpec.horizontalFromY(
        minAverage,
        draw.style.line('#f59e0b', 1.5, 0.9),
      ),
    ),
    ops.draw.sleep(1),

    ops.draw.barSegment(
      'chartA',
      europeCountries,
      draw.segmentSpec.threshold(
        minAverage,
        'gt',
        draw.style.segment('rgba(239, 68, 68, 0.35)', '#dc2626', 1.25, 0.95),
      ),
    ),
    ops.draw.sleep(1),

    ops.draw.barSegment(
      'chartB',
      asiaCountries,
      draw.segmentSpec.threshold(
        minAverage,
        'gt',
        draw.style.segment('rgba(239, 68, 68, 0.35)', '#dc2626', 1.25, 0.95),
      ),
    ),
  ),
)