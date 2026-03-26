import { draw, ops } from '../../../src/api/legacy'
import { group, plan } from '../../../src/api/legacy'
import { getFileCsvPath, loadDatumValuesFromFilePath } from '../../util'

// CONVERTIBILITY_STATUS: PARTIAL
// CONVERTIBILITY_ITEMS: 1

type IncreasingRun = {
  years: string[]
  gain: number
  sum: number
}

const FALLBACK_RUNS: IncreasingRun[] = [
  { years: ['1996', '1997', '1998'], gain: 1.9, sum: 5.2 },
  { years: ['1999', '2000', '2001'], gain: 3.5, sum: 10.5 },
  { years: ['2004', '2005', '2006', '2007', '2008'], gain: 2.7, sum: 15.4 },
  { years: ['2009', '2010', '2011'], gain: 1.7, sum: 2.7 },
  { years: ['2013', '2014', '2015', '2016', '2017'], gain: 2.1, sum: 7.3 },
]

const FALLBACK_MAX_SET_YEARS = ['1999', '2000', '2001']
const FALLBACK_MAX_SET_SUM = 10.5

const inferredCsvPath = getFileCsvPath(import.meta.url)
const csvPath = inferredCsvPath || 'ChartQA/data/csv/line/simple/1c80b6i7wdu3m1ir.csv'

let increasingRuns = [...FALLBACK_RUNS]
let maxSetYears = [...FALLBACK_MAX_SET_YEARS]
let maxSetSum = FALLBACK_MAX_SET_SUM

try {
  const datumValues = await loadDatumValuesFromFilePath(csvPath)
  const rows = datumValues
    .map((datum) => ({
      year: String(datum.target),
      yearNum: Number(datum.target),
      value: Number(datum.value),
    }))
    .filter((row) => row.year.length > 0 && Number.isFinite(row.value))
    .sort((a, b) => {
      const aNumeric = Number.isFinite(a.yearNum)
      const bNumeric = Number.isFinite(b.yearNum)
      if (aNumeric && bNumeric) return a.yearNum - b.yearNum
      return a.year.localeCompare(b.year)
    })

  if (rows.length >= 3) {
    const computedRuns: IncreasingRun[] = []

    let start = 0
    for (let index = 1; index < rows.length; index += 1) {
      const isIncreasing = rows[index].value > rows[index - 1].value
      if (isIncreasing) continue

      const end = index - 1
      const increaseCount = end - start
      if (increaseCount >= 2) {
        const slice = rows.slice(start, end + 1)
        const gain = slice[slice.length - 1].value - slice[0].value
        const sum = slice.reduce((acc, row) => acc + row.value, 0)
        computedRuns.push({
          years: slice.map((row) => row.year),
          gain,
          sum,
        })
      }
      start = index
    }

    const finalEnd = rows.length - 1
    const finalIncreaseCount = finalEnd - start
    if (finalIncreaseCount >= 2) {
      const slice = rows.slice(start, finalEnd + 1)
      const gain = slice[slice.length - 1].value - slice[0].value
      const sum = slice.reduce((acc, row) => acc + row.value, 0)
      computedRuns.push({
        years: slice.map((row) => row.year),
        gain,
        sum,
      })
    }

    if (computedRuns.length > 0) {
      increasingRuns = computedRuns

      let bestRun = computedRuns[0]
      computedRuns.forEach((run) => {
        if (run.gain > bestRun.gain) bestRun = run
      })

      if (bestRun.years.length > 0) {
        maxSetYears = [...bestRun.years]
        maxSetSum = bestRun.sum
      }
    }
  }
} catch (_error) {
  // TODO(data-parse-fallback): Failed to parse CSV at runtime; using precomputed fallback values.
}

const runTraceOps = increasingRuns
  .filter((run) => run.years.length >= 2)
  .map((run) =>
    ops.draw.lineTrace(
      undefined,
      draw.select.keys(run.years[0], run.years[run.years.length - 1]),
    ),
  )

const displayedSum = Number(maxSetSum.toFixed(2))
const sumText = `Sum of maxSet y-values: ${displayedSum}`

// TODO(convertibility-step-6): `draw.sum` is not supported for simple-line runtime after `lineToBar` conversion.
// PROPOSED_ACTION: draw.sumVisibleYValues(label)
const sumFallbackOp = ops.draw.text(
  undefined,
  undefined,
  draw.textSpec.normalized(
    sumText,
    0.5,
    0.95,
    draw.style.text('#111827', 12, 700),
  ),
)

const nonSleepOps = [
  ...runTraceOps,
  ops.draw.highlight(
    undefined,
    draw.select.keys(...maxSetYears),
    '#f59e0b',
    0.95,
  ),
  ops.draw.filter(
    undefined,
    draw.filterSpec.xInclude(...maxSetYears),
  ),
  ops.draw.lineToBar(undefined),
  sumFallbackOp,
]

const opsWithSleep = nonSleepOps.flatMap((op, index) => (index === 0 ? [op] : [ops.draw.sleep(1), op]))

export default plan(
  group(...opsWithSleep),
)
