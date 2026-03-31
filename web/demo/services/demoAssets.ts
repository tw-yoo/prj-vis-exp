import type { ChartSpec, OperationSpec, OpsSpecInput } from '../../../src/api/types'
import { normalizeOpsGroups } from '../../../src/api/types'

export type DemoQuestion = {
  id: string
  title: string
  question: string
  description: string
  sentences: string[]
  opsSpec: OpsSpecInput
}

export type DemoChart = {
  id: string
  title: string
  subtitle: string
  specPath: string
  questions: DemoQuestion[]
}

const meta = (nodeId: string, sentenceIndex: number, inputs: Array<string | number> = []) => ({
  nodeId,
  inputs,
  sentenceIndex,
})

const ref = (nodeId: string) => `ref:${nodeId}`

export const DEMO_CHARTS: DemoChart[] = [
  {
    id: 'simple-bar',
    title: 'Simple Bar Chart',
    subtitle: 'Questions based on the country rating demo chart',
    specPath: '/data/test/spec/bar_simple_ver.json',
    questions: [
      {
        id: 'simple-bar-above-average',
        title: 'Countries Above Average',
        question: 'How many countries have a rating above the overall average?',
        description: 'Use `average` to compute the baseline, then `filter` and `count` to finish the question.',
        sentences: [
          'First, compute the average rating across all countries.',
          'Then keep only the countries whose ratings are above that average.',
          'Finally, count the remaining countries.',
        ],
        opsSpec: {
          ops: [{ id: 'sb_q1_avg', op: 'average', field: 'rating', meta: meta('sb_q1_avg', 1) }],
          ops2: [
            {
              id: 'sb_q1_filter',
              op: 'filter',
              field: 'rating',
              operator: '>',
              value: ref('sb_q1_avg'),
              meta: meta('sb_q1_filter', 2, ['sb_q1_avg']),
            },
          ],
          ops3: [{ id: 'sb_q1_count', op: 'count', field: 'rating', meta: meta('sb_q1_count', 3, ['sb_q1_filter']) }],
        },
      },
      {
        id: 'simple-bar-max-min-gap',
        title: 'Maximum-Minimum Gap',
        question: 'What is the difference between the highest country rating and the lowest country rating?',
        description: 'Use `findExtremum` twice and compare the two resulting values with `diff`.',
        sentences: [
          'First, find the country with the highest rating.',
          'Next, find the country with the lowest rating.',
          'Then compute the difference between those two values.',
        ],
        opsSpec: {
          ops: [{ id: 'sb_q2_max', op: 'findExtremum', field: 'rating', which: 'max', meta: meta('sb_q2_max', 1) }],
          ops2: [{ id: 'sb_q2_min', op: 'findExtremum', field: 'rating', which: 'min', meta: meta('sb_q2_min', 2) }],
          ops3: [
            {
              id: 'sb_q2_diff',
              op: 'diff',
              field: 'rating',
              targetA: ref('sb_q2_max'),
              targetB: ref('sb_q2_min'),
              signed: false,
              meta: meta('sb_q2_diff', 3, ['sb_q2_max', 'sb_q2_min']),
            },
          ],
        },
      },
      {
        id: 'simple-bar-split-peak-gap',
        title: 'Nordic vs English-Speaking Split',
        question: 'If the chart is split into Nordic countries and English-speaking countries, what is the difference between the two peak ratings?',
        description: 'Use `draw.split` to divide the chart, then compare the maximum rating in each panel.',
        sentences: [
          'First, split the countries into Nordic and English-speaking panels.',
          'Find the highest rating in the Nordic panel.',
          'Find the highest rating in the English-speaking panel.',
          'Then compute the difference between the two peak ratings.',
        ],
        opsSpec: {
          ops: [
            {
              op: 'draw',
              action: 'split',
              split: {
                by: 'x',
                groups: {
                  nordic: ['NOR', 'SWE', 'DNK', 'FIN'],
                  english: ['USA', 'GBR', 'CAN', 'AUS', 'IRL'],
                },
                orientation: 'horizontal',
              },
            },
          ],
          ops2: [
            {
              id: 'sb_q3_nordic_max',
              op: 'findExtremum',
              chartId: 'nordic',
              field: 'rating',
              which: 'max',
              meta: meta('sb_q3_nordic_max', 2),
            },
          ],
          ops3: [
            {
              id: 'sb_q3_english_max',
              op: 'findExtremum',
              chartId: 'english',
              field: 'rating',
              which: 'max',
              meta: meta('sb_q3_english_max', 3),
            },
          ],
          ops4: [
            {
              id: 'sb_q3_diff',
              op: 'diff',
              field: 'rating',
              targetA: ref('sb_q3_nordic_max'),
              targetB: ref('sb_q3_english_max'),
              signed: false,
              meta: meta('sb_q3_diff', 4, ['sb_q3_nordic_max', 'sb_q3_english_max']),
            },
          ],
        },
      },
    ],
  },
  {
    id: 'stacked-bar',
    title: 'Stacked Bar Chart',
    subtitle: 'Questions based on the monthly weather-count chart',
    specPath: '/data/test/spec/bar_stacked_ver.json',
    questions: [
      {
        id: 'stacked-bar-sun-above-average',
        title: 'Sunny Months Above Average',
        question: 'How many months have a sun count above the average sun count?',
        description: 'Use `average`, `filter`, and `count` while keeping the `sun` series selected.',
        sentences: [
          'First, compute the average count for the sun series.',
          'Then keep only the months where the sun count is above that average.',
          'Finally, count how many months remain.',
        ],
        opsSpec: {
          ops: [{ id: 'st_q1_avg', op: 'average', field: 'count', group: 'sun', meta: meta('st_q1_avg', 1) }],
          ops2: [
            {
              id: 'st_q1_filter',
              op: 'filter',
              field: 'count',
              group: 'sun',
              operator: '>',
              value: ref('st_q1_avg'),
              meta: meta('st_q1_filter', 2, ['st_q1_avg']),
            },
          ],
          ops3: [{ id: 'st_q1_count', op: 'count', field: 'count', meta: meta('st_q1_count', 3, ['st_q1_filter']) }],
        },
      },
      {
        id: 'stacked-bar-cross-series-diff',
        title: 'Cross-Series Difference',
        question: 'How much higher is the sun count in month 8 than the rain count in month 2?',
        description: 'Retrieve one value from each weather series and compare them with `diff`.',
        sentences: [
          'First, retrieve the sun count for month 8.',
          'Next, retrieve the rain count for month 2.',
          'Then compute the difference between those two values.',
        ],
        opsSpec: {
          ops: [{ id: 'st_q2_sun', op: 'retrieveValue', field: 'count', target: '8', group: 'sun', meta: meta('st_q2_sun', 1) }],
          ops2: [{ id: 'st_q2_rain', op: 'retrieveValue', field: 'count', target: '2', group: 'rain', meta: meta('st_q2_rain', 2) }],
          ops3: [
            {
              id: 'st_q2_diff',
              op: 'diff',
              field: 'count',
              targetA: ref('st_q2_sun'),
              targetB: ref('st_q2_rain'),
              signed: false,
              meta: meta('st_q2_diff', 3, ['st_q2_sun', 'st_q2_rain']),
            },
          ],
        },
      },
      {
        id: 'stacked-bar-split-fog-peak',
        title: 'Early-Year vs Late-Year Fog Peak',
        question: 'If months 1-6 and 7-12 are split apart, what is the difference between the fog peaks in the two panels?',
        description: 'Use `draw.split`, then compare the maximum fog count in each side of the year.',
        sentences: [
          'First, split the months into an early-year panel and a late-year panel.',
          'Find the highest fog count in the early-year panel.',
          'Find the highest fog count in the late-year panel.',
          'Then compute the difference between the two fog peaks.',
        ],
        opsSpec: {
          ops: [
            {
              op: 'draw',
              action: 'split',
              split: {
                by: 'x',
                groups: {
                  early: ['1', '2', '3', '4', '5', '6'],
                  late: ['7', '8', '9', '10', '11', '12'],
                },
                orientation: 'horizontal',
              },
            },
          ],
          ops2: [
            {
              id: 'st_q3_early_fog',
              op: 'findExtremum',
              chartId: 'early',
              field: 'count',
              group: 'fog',
              which: 'max',
              meta: meta('st_q3_early_fog', 2),
            },
          ],
          ops3: [
            {
              id: 'st_q3_late_fog',
              op: 'findExtremum',
              chartId: 'late',
              field: 'count',
              group: 'fog',
              which: 'max',
              meta: meta('st_q3_late_fog', 3),
            },
          ],
          ops4: [
            {
              id: 'st_q3_diff',
              op: 'diff',
              field: 'count',
              targetA: ref('st_q3_early_fog'),
              targetB: ref('st_q3_late_fog'),
              signed: false,
              meta: meta('st_q3_diff', 4, ['st_q3_early_fog', 'st_q3_late_fog']),
            },
          ],
        },
      },
    ],
  },
  {
    id: 'grouped-bar',
    title: 'Grouped Bar Chart',
    subtitle: 'Questions based on regional media-rights revenue',
    specPath: '/data/test/spec/bar_grouped_ver.json',
    questions: [
      {
        id: 'grouped-bar-na-average',
        title: 'North America Average',
        question: 'What is the average media-rights revenue for North America across the shown years?',
        description: 'Use `average` while keeping the North America series selected across all years.',
        sentences: [
          'First, isolate the North America series across the full chart.',
          'Then compute its average media-rights revenue across the shown years.',
        ],
        opsSpec: {
          ops: [
            {
              id: 'gb_q1_avg',
              op: 'average',
              field: 'Media rights revenue in billion US dollars',
              group: 'North America',
              meta: meta('gb_q1_avg', 1),
            },
          ],
        },
      },
      {
        id: 'grouped-bar-global-peak',
        title: 'Highest Single Value',
        question: 'What is the highest single media-rights revenue value shown anywhere in the chart?',
        description: 'Use `findExtremum` once to identify the largest revenue value across all displayed bars.',
        sentences: [
          'Scan all bars across the grouped chart as a single set.',
          'Then select the maximum revenue value shown anywhere in the chart.',
        ],
        opsSpec: {
          ops: [
            {
              id: 'gb_q2_global_max',
              op: 'findExtremum',
              field: 'Media rights revenue in billion US dollars',
              which: 'max',
              meta: meta('gb_q2_global_max', 1),
            },
          ],
        },
      },
      {
        id: 'grouped-bar-split-market-peak-gap',
        title: 'Mature vs Growth Market Split',
        question: 'If the chart is split into mature markets and growth markets, what is the difference between the maximum revenue values in the two panels?',
        description: 'Use `draw.split` on regions, then compare the largest value in each panel.',
        sentences: [
          'First, split the regions into mature-market and growth-market panels.',
          'Find the highest revenue value in the mature-market panel.',
          'Find the highest revenue value in the growth-market panel.',
          'Then compute the difference between the two panel maxima.',
        ],
        opsSpec: {
          ops: [
            {
              op: 'draw',
              action: 'split',
              split: {
                by: 'x',
                groups: {
                  mature: ['North America', 'Europe, Middle East and Africa'],
                  growth: ['Asia Pacific', 'Latin America'],
                },
                orientation: 'horizontal',
              },
            },
          ],
          ops2: [
            {
              id: 'gb_q3_mature_max',
              op: 'findExtremum',
              chartId: 'mature',
              field: 'Media rights revenue in billion US dollars',
              which: 'max',
              meta: meta('gb_q3_mature_max', 2),
            },
          ],
          ops3: [
            {
              id: 'gb_q3_growth_max',
              op: 'findExtremum',
              chartId: 'growth',
              field: 'Media rights revenue in billion US dollars',
              which: 'max',
              meta: meta('gb_q3_growth_max', 3),
            },
          ],
          ops4: [
            {
              id: 'gb_q3_diff',
              op: 'diff',
              field: 'Media rights revenue in billion US dollars',
              targetA: ref('gb_q3_mature_max'),
              targetB: ref('gb_q3_growth_max'),
              signed: false,
              meta: meta('gb_q3_diff', 4, ['gb_q3_mature_max', 'gb_q3_growth_max']),
            },
          ],
        },
      },
    ],
  },
  {
    id: 'simple-line',
    title: 'Simple Line Chart',
    subtitle: 'Questions based on annual R&D expenditure',
    specPath: '/data/test/spec/line_simple.json',
    questions: [
      {
        id: 'simple-line-largest-increase',
        title: 'Largest Year-over-Year Increase',
        question: 'What is the largest year-over-year increase in research and development expenditure?',
        description: 'Use `lagDiff` to compute adjacent changes, then `findExtremum` to select the largest increase.',
        sentences: [
          'First, compute the change between each pair of adjacent years.',
          'Then select the largest increase from those year-over-year differences.',
        ],
        opsSpec: {
          ops: [
            {
              id: 'sl_q1_lag',
              op: 'lagDiff',
              field: 'research_and_development_expenditure',
              orderField: 'year',
              order: 'asc',
              meta: meta('sl_q1_lag', 1),
            },
          ],
          ops2: [
            {
              id: 'sl_q1_max',
              op: 'findExtremum',
              field: 'research_and_development_expenditure',
              which: 'max',
              meta: meta('sl_q1_max', 2, ['sl_q1_lag']),
            },
          ],
        },
      },
      {
        id: 'simple-line-last-two-sum',
        title: 'Sum of 2013 and 2014',
        question: 'What is the sum of the expenditure values for 2013 and 2014?',
        description: 'Retrieve the final two yearly values and combine them with `add`.',
        sentences: [
          'First, retrieve the expenditure value for 2013.',
          'Next, retrieve the expenditure value for 2014.',
          'Then add the two values together.',
        ],
        opsSpec: {
          ops: [
            {
              id: 'sl_q2_2013',
              op: 'retrieveValue',
              field: 'research_and_development_expenditure',
              target: '2013-01-01',
              meta: meta('sl_q2_2013', 1),
            },
          ],
          ops2: [
            {
              id: 'sl_q2_2014',
              op: 'retrieveValue',
              field: 'research_and_development_expenditure',
              target: '2014-01-01',
              meta: meta('sl_q2_2014', 2),
            },
          ],
          ops3: [
            {
              id: 'sl_q2_sum',
              op: 'add',
              field: 'research_and_development_expenditure',
              targetA: ref('sl_q2_2013'),
              targetB: ref('sl_q2_2014'),
              meta: meta('sl_q2_sum', 3, ['sl_q2_2013', 'sl_q2_2014']),
            },
          ],
        },
      },
      {
        id: 'simple-line-split-peak-gap',
        title: 'Early vs Late Period Peak',
        question: 'If the line is split into 1990-2001 and 2002-2014, what is the difference between the peak values in the two periods?',
        description: 'Split the timeline into two periods and compare the maximum value in each panel.',
        sentences: [
          'First, split the line into an early period and a late period.',
          'Find the highest value in the early-period panel.',
          'Find the highest value in the late-period panel.',
          'Then compute the difference between the two peaks.',
        ],
        opsSpec: {
          ops: [
            {
              op: 'draw',
              action: 'split',
              split: {
                by: 'x',
                groups: {
                  early: [
                    '1990-01-01', '1991-01-01', '1992-01-01', '1993-01-01', '1994-01-01', '1995-01-01',
                    '1996-01-01', '1997-01-01', '1998-01-01', '1999-01-01', '2000-01-01', '2001-01-01',
                  ],
                  late: [
                    '2002-01-01', '2003-01-01', '2004-01-01', '2005-01-01', '2006-01-01', '2007-01-01',
                    '2008-01-01', '2009-01-01', '2010-01-01', '2011-01-01', '2012-01-01', '2013-01-01',
                    '2014-01-01',
                  ],
                },
                orientation: 'horizontal',
              },
            },
          ],
          ops2: [
            {
              id: 'sl_q3_early_max',
              op: 'findExtremum',
              chartId: 'early',
              field: 'research_and_development_expenditure',
              which: 'max',
              meta: meta('sl_q3_early_max', 2),
            },
          ],
          ops3: [
            {
              id: 'sl_q3_late_max',
              op: 'findExtremum',
              chartId: 'late',
              field: 'research_and_development_expenditure',
              which: 'max',
              meta: meta('sl_q3_late_max', 3),
            },
          ],
          ops4: [
            {
              id: 'sl_q3_diff',
              op: 'diff',
              field: 'research_and_development_expenditure',
              targetA: ref('sl_q3_late_max'),
              targetB: ref('sl_q3_early_max'),
              signed: false,
              meta: meta('sl_q3_diff', 4, ['sl_q3_early_max', 'sl_q3_late_max']),
            },
          ],
        },
      },
    ],
  },
  {
    id: 'multiple-line',
    title: 'Multiple Line Chart',
    subtitle: 'Questions based on multi-stock price trajectories',
    specPath: '/data/test/spec/line_multiple.json',
    questions: [
      {
        id: 'multiple-line-msft-average',
        title: 'Average MSFT Price',
        question: 'What is the average price of MSFT across the full chart?',
        description: 'Use `average` while keeping only the MSFT series selected.',
        sentences: [
          'First, isolate the MSFT series across the full chart.',
          'Then compute the average price for that series.',
        ],
        opsSpec: {
          ops: [{ id: 'ml_q1_avg', op: 'average', field: 'price', group: 'MSFT', meta: meta('ml_q1_avg', 1) }],
        },
      },
      {
        id: 'multiple-line-amzn-peak',
        title: 'Highest AMZN Price',
        question: 'What is the highest AMZN price shown anywhere in the chart?',
        description: 'Use `findExtremum` on the AMZN series to identify its peak price.',
        sentences: [
          'First, isolate the AMZN series across the full chart.',
          'Then select the maximum price reached by AMZN.',
        ],
        opsSpec: {
          ops: [{ id: 'ml_q2_amzn_max', op: 'findExtremum', field: 'price', group: 'AMZN', which: 'max', meta: meta('ml_q2_amzn_max', 1) }],
        },
      },
      {
        id: 'multiple-line-split-amzn-peak',
        title: 'AMZN Peak in Early vs Late 2000',
        question: 'If 2000 is split into Jan-Jun and Jul-Dec, what is the difference between the AMZN peaks in the two panels?',
        description: 'Use `draw.split` over the first year, then compare the maximum AMZN price in each panel.',
        sentences: [
          'First, split the 2000 dates into Jan-Jun and Jul-Dec panels.',
          'Find the highest AMZN price in the Jan-Jun panel.',
          'Find the highest AMZN price in the Jul-Dec panel.',
          'Then compute the difference between those two peaks.',
        ],
        opsSpec: {
          ops: [
            {
              op: 'draw',
              action: 'split',
              split: {
                by: 'x',
                groups: {
                  firstHalf2000: ['2000-01-01', '2000-02-01', '2000-03-01', '2000-04-01', '2000-05-01', '2000-06-01'],
                  secondHalf2000: ['2000-07-01', '2000-08-01', '2000-09-01', '2000-10-01', '2000-11-01', '2000-12-01'],
                },
                orientation: 'horizontal',
              },
            },
          ],
          ops2: [
            {
              id: 'ml_q3_first_max',
              op: 'findExtremum',
              chartId: 'firstHalf2000',
              field: 'price',
              group: 'AMZN',
              which: 'max',
              meta: meta('ml_q3_first_max', 2),
            },
          ],
          ops3: [
            {
              id: 'ml_q3_second_max',
              op: 'findExtremum',
              chartId: 'secondHalf2000',
              field: 'price',
              group: 'AMZN',
              which: 'max',
              meta: meta('ml_q3_second_max', 3),
            },
          ],
          ops4: [
            {
              id: 'ml_q3_diff',
              op: 'diff',
              field: 'price',
              targetA: ref('ml_q3_first_max'),
              targetB: ref('ml_q3_second_max'),
              signed: false,
              meta: meta('ml_q3_diff', 4, ['ml_q3_first_max', 'ml_q3_second_max']),
            },
          ],
        },
      },
    ],
  },
]

function normalizeStaticDataUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)) return trimmed
  return `/${trimmed.replace(/^\.?\//, '')}`
}

function normalizeSpecDataPath(spec: ChartSpec): ChartSpec {
  if (!spec.data?.url || typeof spec.data.url !== 'string') return spec
  return {
    ...spec,
    data: {
      ...spec.data,
      url: normalizeStaticDataUrl(spec.data.url),
    },
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function loadDemoChartSpec(specPath: string): Promise<ChartSpec> {
  const raw = await fetchJson<ChartSpec>(normalizeStaticDataUrl(specPath))
  return normalizeSpecDataPath(raw)
}

export function buildDemoStepOpsSpec(opsSpec: OpsSpecInput, stepCount: number): OpsSpecInput {
  const groups = normalizeOpsGroups(opsSpec).slice(0, Math.max(0, stepCount))
  if (groups.length === 0) return []
  if (groups.length === 1 && groups[0]?.name === 'ops') return groups[0].ops

  return groups.reduce<Record<string, OperationSpec[]>>((accumulator, group) => {
    accumulator[group.name] = group.ops
    return accumulator
  }, {})
}
