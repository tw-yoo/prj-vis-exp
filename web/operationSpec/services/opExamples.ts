// Curated chart_id + ops_spec examples per (op, chart_type).
// Sources: cherry-picked from data/review/review_cases.csv (first single-op
// row per chart_type) plus a few hand-tuned variations for filter/diff.

import type { ChartTypeKey } from './opApplicability'

export type OpExample = {
  /** Caption shown above the card (e.g., "Categorical include"). */
  caption: string
  chartId: string
  chartType: ChartTypeKey
  /** Full ops spec ready to feed runChartOps. */
  opsSpec: Record<string, unknown>
  /** Optional short note explaining what to look for in the rendered chart. */
  note?: string
}

type Mk = (overrides?: Partial<OpExample>) => OpExample

function single(op: string, params: Record<string, unknown> = {}) {
  return {
    ops: [
      {
        op,
        id: 'n1',
        meta: { nodeId: 'n1', inputs: [], sentenceIndex: 1 },
        ...params,
      },
    ],
  }
}

const ex = (
  chartId: string,
  chartType: ChartTypeKey,
  caption: string,
  op: string,
  params: Record<string, unknown> = {},
  note?: string,
): OpExample => ({
  chartId,
  chartType,
  caption,
  opsSpec: single(op, params),
  note,
})

// Type satisfies — keep Mk in scope so TS doesn't complain about unused helper.
const _unused: Mk = () => ({ caption: '', chartId: '', chartType: 'bar_simple', opsSpec: {} })
void _unused

export const EXAMPLES: Record<string, OpExample[]> = {
  retrieveValue: [
    // ── Simple bar ────────────────────────────────────────────────────────
    ex('0pzdf7hfbxgjghsa', 'bar_simple', 'Pick by year (numeric category)', 'retrieveValue', {
      field: 'Year',
      target: '2016',
    }, 'target matches the X-axis category — that bar is highlighted with its value label'),
    ex('0xo3r87obscjsktm', 'bar_simple', 'Pick by country (string category)', 'retrieveValue', {
      target: 'El Salvador',
      field: 'Country',
    }, 'target is a string — looks up the matching category'),
    ex('0pzdf7hfbxgjghsa', 'bar_simple', 'With precision (2 decimals)', 'retrieveValue', {
      field: 'Year',
      target: '2016',
      precision: 2,
    }, 'precision controls how many decimals the value label shows'),

    // ── Simple line ───────────────────────────────────────────────────────
    ex('albgfrf44bz6134k', 'line_simple', 'Pick a year on a line', 'retrieveValue', {
      target: '2009',
      field: 'Year',
    }, 'The corresponding point gets a marker with its Y-value'),
    ex('95yhyqjyeu4fohbj', 'line_simple', 'Pick at a 4-digit year', 'retrieveValue', {
      target: '2010',
      field: 'Year',
    }),

    // ── Multiple line ─────────────────────────────────────────────────────
    ex('29rxoltwhongoday', 'line_multiple', 'Pick a year in one series', 'retrieveValue', {
      target: '2002',
      field: 'Year',
      group: 'Dissatisfied',
    }, 'group scopes the lookup to one series — only that series\' point is highlighted'),
    ex('0bunvsqd54e3qahz', 'line_multiple', 'Pick a year in a different series', 'retrieveValue', {
      target: '2010',
      field: 'Year',
      group: 'female',
    }, 'Same op, different group — the other series stays dim'),
  ],

  filter: [
    // ── Simple bar ────────────────────────────────────────────────────────
    ex('1a6pxfig1xf4oeu3', 'bar_simple', 'Numeric threshold (≤200)', 'filter', {
      field: 'Franchise value in million US dollars',
      operator: '<=',
      value: 200,
    }, 'operator + value on a numeric field — bars above the threshold dim out'),
    ex('0eq4w2wsl864mhcj', 'bar_simple', 'Numeric threshold (≥60)', 'filter', {
      field: 'Sales volume in million units',
      operator: '>=',
      value: 60,
    }, 'Strict ≥: keep bars at or above the threshold'),
    ex('1bv05pu9d8jnidty', 'bar_simple', 'Strict less-than on year', 'filter', {
      field: 'Year',
      operator: '<',
      value: 2026,
    }),
    ex('0s6zi9dyw22qo4rp', 'bar_simple', 'Categorical include list', 'filter', {
      field: 'Month/Year',
      include: ['Sep 1896', 'Oct 1896', 'Nov 1896', 'Dec 1896'],
    }, 'include[] keeps only the listed categories'),
    ex('1fngt6cb1d60a2ow', 'bar_simple', 'Exclude a single category', 'filter', {
      field: 'Region/Entity',
      exclude: ['Metro Total'],
    }, 'exclude[] is the inverse of include — drop just the listed entries'),
    ex('1a6pxfig1xf4oeu3', 'bar_simple', 'Numeric threshold (≥, integer)', 'filter', {
      field: 'Franchise value in million US dollars',
      operator: '>=',
      value: 300,
    }, '">=" with an integer threshold — bars below are dimmed'),

    // ── Simple line ───────────────────────────────────────────────────────
    ex('2jki13q54zizc6i4', 'line_simple', 'Date-range include', 'filter', {
      field: 'Period',
      include: ['Jul 2008 - Jun 2009', 'Jul 2009 - Jun 2010', 'Jul 2010 - Jun 2011'],
    }, 'The X-axis rescales to fit the kept range'),
    ex('08x3crju85yix5ab', 'line_simple', 'Symbol "<" on a numeric field', 'filter', {
      field: 'CPI_Score',
      operator: '<',
      value: 80,
    }, 'Symbol form (<) is equivalent to word form (lt)'),
    ex('0cymcilknp8krjwz', 'line_simple', 'Symbol ">" with a float', 'filter', {
      field: 'Average price in US dollars',
      operator: '>',
      value: 4.0,
    }),
    ex('8chfa8n079zpfigi', 'line_simple', 'Symbol ">=" on integer ranking', 'filter', {
      field: 'FIFA World Ranking position',
      operator: '>=',
      value: 20,
    }, 'Note: only symbol-form operators (>, >=, <, <=, ==, !=) are supported by the visual applier'),

    // ── Multiple line ─────────────────────────────────────────────────────
    ex('4wqpl5jrdmc75go3', 'line_multiple', 'Include across all series', 'filter', {
      field: 'Year',
      include: ['2026', '2027', '2028', '2029'],
    }, 'Without group the filter affects every series at once'),
    ex('6rvtt4egfl5nmyue', 'line_multiple', 'Include + group (one series)', 'filter', {
      field: 'Year',
      include: ['2012', '2013', '2014', '2015', '2016', '2017'],
      group: 'female',
    }, 'group scopes the filter to a single series — the other series stays intact'),
    ex('6p4fnscalopvysnn', 'line_multiple', 'Numeric ">" across all series', 'filter', {
      field: 'Share of the population',
      operator: '>',
      value: 40,
    }),
    ex('16aphfabldrpgcmd', 'line_multiple', 'Numeric ">" within one series', 'filter', {
      field: 'Average weight in metric grams',
      operator: '>',
      value: 3670,
      group: 'Boys',
    }, 'Combines a numeric operator with a group scope'),

    // ── Grouped bar ───────────────────────────────────────────────────────
    ex('0yx2080f08329xxb', 'bar_grouped', 'Include across all groups', 'filter', {
      field: 'Channel',
      include: ['Supermarkets & hypermarkets', 'Discounters'],
    }),
    ex('0zjxkqy20iibpdvo', 'bar_grouped', 'Include scoped to one group', 'filter', {
      field: 'Platform',
      include: ['YouTube', 'Twitter', 'Twitch'],
      group: 'Male',
    }, 'group narrows the include filter to one series'),
    ex('1hm2mi3o0ejxp7tn', 'bar_grouped', 'Equality operator "=="', 'filter', {
      field: 'Group',
      operator: '==',
      value: 'Hypertensive untreated',
      include: ['Hypertensive untreated'],
    }, '"==" matches an exact value; pairing with include[] keeps that single bar visible'),
    ex('0lua5jsw92d3enb4', 'bar_grouped', '">" with group scope', 'filter', {
      field: 'Share of respondents',
      operator: '>',
      value: 0.03,
      group: '2019',
    }),

    // ── Stacked bar ───────────────────────────────────────────────────────
    ex('240rurpp2arislnt', 'bar_stacked', 'Include a single age group', 'filter', {
      field: 'Age Group',
      include: ['18–29'],
    }),
    ex('13guplcbmfu1tjzu', 'bar_stacked', 'Include subset of stack layers', 'filter', {
      field: 'Factor',
      include: ['Germany – exports', 'Italy – exports'],
    }, 'Only the listed stack layers stay opaque'),
    ex('2a8mliwolqqo6s5u', 'bar_stacked', 'Not-equal "!="', 'filter', {
      field: 'Region',
      operator: '!=',
      value: 'Asia Pacific',
    }, '"!=" drops rows whose field equals the value (inverse of ==)'),
    ex('0vfqjaxeiv96ww7g', 'bar_stacked', 'Equality "==" on a categorical', 'filter', {
      field: 'Discussion Frequency',
      operator: '==',
      value: 'Almost all of the time',
    }),
    ex('62w3xg16iivw11et', 'bar_stacked', 'Multi-year include + group', 'filter', {
      field: 'Year',
      include: ['2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019'],
      group: 'Industry',
    }),
  ],

  findExtremum: [
    // ── Simple bar ────────────────────────────────────────────────────────
    ex('0wflwm4jebx7n12y', 'bar_simple', 'Max with explicit field', 'findExtremum', {
      which: 'max',
      field: 'Number of fires',
    }, 'Highlights the tallest bar; the field disambiguates when multiple measures exist'),
    ex('1esx2fbduhqn7knk', 'bar_simple', 'Max with implicit field', 'findExtremum', {
      which: 'max',
    }, 'Without field, the op uses the chart\'s primary measure'),
    ex('0wflwm4jebx7n12y', 'bar_simple', 'Min instead of max', 'findExtremum', {
      which: 'min',
      field: 'Number of fires',
    }, 'which: "min" picks the smallest bar'),

    // ── Simple line ───────────────────────────────────────────────────────
    ex('95yhyqjyeu4fohbj', 'line_simple', 'Min on a line', 'findExtremum', {
      which: 'min',
      field: 'Number of people in millions',
    }),
    ex('95wcyze391ifhegp', 'line_simple', 'Max on a line', 'findExtremum', {
      which: 'max',
      field: 'Exchange rate in Singapore dollars',
    }),

    // ── Multiple line ─────────────────────────────────────────────────────
    ex('4twwx65oath7vrkt', 'line_multiple', 'Min within one series', 'findExtremum', {
      which: 'min',
      field: 'Value_Trillion_USD',
      group: 'Imports',
    }, 'group scopes the extremum to a single series — other series stay dim'),
    ex('0b9o2vahkw2a1bxy', 'line_multiple', 'Max within one series', 'findExtremum', {
      which: 'max',
      field: 'Share of respondents',
      group: 'No',
    }, 'Same chart, different series + extremum — useful for comparison'),
  ],

  average: [
    ex('0o12tngadmjjux2n', 'bar_simple', 'Mean across all bars', 'average', {
      field: 'Production in million units',
    }, 'Draws a horizontal reference line at the mean'),
    ex('724mfnyk34kp97le', 'line_simple', 'Mean across the line', 'average', {
      field: 'Cinema visits in millions',
    }),
    ex('3z678inbp0t89ahu', 'line_multiple', 'Mean within one series', 'average', {
      field: 'Percentage_of_Respondents',
      group: 'Dissatisfied',
    }),
    ex('0rfuaawgi58ajpsv', 'bar_grouped', 'Mean within one group', 'average', {
      field: 'Media rights revenue in billion US dollars',
      group: 'North America',
    }),
    ex('10x2rgiqw97wdspi', 'bar_stacked', 'Mean within one series', 'average', {
      field: 'Revenue_Million_Euros',
      group: 'Commercial',
    }),
  ],

  diff: [
    // ── Simple bar ────────────────────────────────────────────────────────
    ex('0o12tngadmjjux2n', 'bar_simple', 'Two bars, absolute gap', 'diff', {
      targetA: '2004',
      targetB: '2010',
      field: 'Production in million units',
      signed: false,
    }, 'signed:false → unsigned absolute difference between the two targets'),
    ex('0o12tngadmjjux2n', 'bar_simple', 'Two bars, signed (with sign)', 'diff', {
      targetA: '2004',
      targetB: '2010',
      field: 'Production in million units',
      signed: true,
    }, 'signed:true → preserves the direction sign (B − A)'),
    ex('0o12tngadmjjux2n', 'bar_simple', 'Ratio mode', 'diff', {
      targetA: '2004',
      targetB: '2010',
      field: 'Production in million units',
      mode: 'ratio',
    }, 'mode:"ratio" returns B/A instead of B−A'),
    ex('0o12tngadmjjux2n', 'bar_simple', 'Ratio as percent', 'diff', {
      targetA: '2004',
      targetB: '2010',
      field: 'Production in million units',
      mode: 'ratio',
      percent: true,
    }, 'percent:true scales the ratio to a percentage (×100)'),
    ex('0o12tngadmjjux2n', 'bar_simple', 'With precision', 'diff', {
      targetA: '2004',
      targetB: '2010',
      field: 'Production in million units',
      signed: false,
      precision: 2,
    }, 'precision controls the decimal places of the resulting label'),

    // ── Simple line ───────────────────────────────────────────────────────
    ex('2jromeq5u9lloh1s', 'line_simple', 'Two years, absolute', 'diff', {
      targetA: '2010',
      targetB: '2011',
      field: 'Audience_Millions',
      signed: false,
    }, 'Arrow between two points; label shows the gap'),
    ex('2jromeq5u9lloh1s', 'line_simple', 'Two years, signed', 'diff', {
      targetA: '2010',
      targetB: '2011',
      field: 'Audience_Millions',
      signed: true,
    }, 'Same chart with signed:true — shows direction of change'),
  ],

  diffByValue: [
    ex('0o12tngadmjjux2n', 'bar_simple', 'Unsigned delta from reference', 'diffByValue', {
      value: 19992014,
      field: 'Production in million units',
    }, 'Each bar shows |row − reference| — distance from the threshold'),
    ex('0o12tngadmjjux2n', 'bar_simple', 'Signed delta from reference', 'diffByValue', {
      value: 19992014,
      field: 'Production in million units',
      signed: true,
    }, 'signed:true preserves above/below sign — direction is visible in the bar'),
    ex('0eq4w2wsl864mhcj', 'bar_simple', 'Delta on a different field', 'diffByValue', {
      value: 50,
      field: 'Sales volume in million units',
      signed: true,
    }, 'Reference value is 50; each bar shows how much higher/lower it is'),
  ],

  lagDiff: [
    // ── Simple line ───────────────────────────────────────────────────────
    ex('2jromeq5u9lloh1s', 'line_simple', 'YoY ascending, signed', 'lagDiff', {
      orderField: 'Year',
      order: 'asc',
      absolute: false,
    }, 'Arrows between consecutive points; labels show each delta (with sign)'),
    ex('74p313e1n8rzkfzp', 'line_simple', 'Ascending, absolute values', 'lagDiff', {
      orderField: 'Age group',
      order: 'asc',
      absolute: true,
    }, 'absolute:true → labels show |delta|, sign of change is lost but magnitudes line up'),
    ex('2jromeq5u9lloh1s', 'line_simple', 'Descending order', 'lagDiff', {
      orderField: 'Year',
      order: 'desc',
      absolute: false,
    }, 'order:"desc" — adjacent diffs are computed from newest to oldest'),
    ex('827lhm2w7n652knp', 'line_simple', 'Without absolute flag', 'lagDiff', {
      orderField: 'Year',
      order: 'asc',
    }, 'absolute defaults — same as signed/false in this configuration'),

    // ── Multiple line ─────────────────────────────────────────────────────
    ex('au22oa0vjosoagxu', 'line_multiple', 'Per-series, one group', 'lagDiff', {
      orderField: 'Year',
      order: 'asc',
      group: 'male',
      absolute: false,
    }, 'group narrows lagDiff to a single series; the other series stays dim'),
  ],

  pairDiff: [
    // ── Multiple line ─────────────────────────────────────────────────────
    ex('23wg8zio5ahp40tg', 'line_multiple', 'Two series, absolute', 'pairDiff', {
      by: 'Year',
      field: 'Percentage',
      groupA: 'Oppose',
      groupB: 'Favor',
      absolute: true,
    }, 'absolute:true → each year shows |B−A|, magnitude only'),
    ex('23wg8zio5ahp40tg', 'line_multiple', 'Two series, signed', 'pairDiff', {
      by: 'Year',
      field: 'Percentage',
      groupA: 'Oppose',
      groupB: 'Favor',
      signed: true,
    }, 'signed:true → arrow direction reflects which series is higher'),
    ex('23wg8zio5ahp40tg', 'line_multiple', 'Swap A/B to flip direction', 'pairDiff', {
      by: 'Year',
      field: 'Percentage',
      groupA: 'Favor',
      groupB: 'Oppose',
      signed: true,
    }, 'Same chart with groupA/groupB swapped — arrows point the other way'),
  ],

  sort: [
    ex('0cad2xfrwdgvo9zk', 'bar_simple', 'Ascending by field', 'sort', {
      field: 'Number of fatalities',
      order: 'asc',
    }, 'Bars slide into the new order (smallest → largest)'),
    ex('1ce802l2rdg98d7d', 'bar_simple', 'Descending by field', 'sort', {
      field: 'Share of respondents',
      order: 'desc',
    }, 'order:"desc" — largest first'),
    ex('1a09xqtrj8zms716', 'bar_simple', 'Descending, different field', 'sort', {
      field: 'US dollars per square foot',
      order: 'desc',
    }, 'Same op shape, different chart and field'),
  ],

  // Data-layer-only ops: showcase the JSON spec but no live chart preview.
  sum: [],
  count: [],
  nth: [],
  add: [],
  scale: [],
  compareBool: [],
  draw: [],
}

export function getExamplesByChartType(op: string): Map<ChartTypeKey, OpExample[]> {
  const out = new Map<ChartTypeKey, OpExample[]>()
  const list = EXAMPLES[op] ?? []
  for (const ex of list) {
    const bucket = out.get(ex.chartType) ?? []
    bucket.push(ex)
    out.set(ex.chartType, bucket)
  }
  return out
}
