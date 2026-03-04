const SIMPLE_BAR_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E simple bar fixture',
  data: {
    values: [
      { country: 'USA', rating: 12 },
      { country: 'KOR', rating: 18 },
      { country: 'FRA', rating: 9 },
      { country: 'ESP', rating: 15 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'country', type: 'nominal', sort: null },
    y: { field: 'rating', type: 'quantitative' },
  },
}

export const SIMPLE_BAR_SPEC = JSON.stringify(SIMPLE_BAR_SPEC_OBJECT, null, 2)

const STACKED_BAR_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E stacked bar fixture',
  data: {
    values: [
      { month: 'Jan', weather: 'sun', count: 10 },
      { month: 'Jan', weather: 'rain', count: 4 },
      { month: 'Feb', weather: 'sun', count: 8 },
      { month: 'Feb', weather: 'rain', count: 6 },
      { month: 'Mar', weather: 'sun', count: 12 },
      { month: 'Mar', weather: 'rain', count: 3 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'month', type: 'nominal', sort: null },
    y: { field: 'count', type: 'quantitative' },
    color: { field: 'weather', type: 'nominal' },
  },
}

const GROUPED_BAR_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E grouped bar fixture',
  data: {
    values: [
      { country: 'KOR', procedure: 'Surgical', value: 100 },
      { country: 'KOR', procedure: 'NonSurgical', value: 160 },
      { country: 'USA', procedure: 'Surgical', value: 120 },
      { country: 'USA', procedure: 'NonSurgical', value: 140 },
      { country: 'FRA', procedure: 'Surgical', value: 90 },
      { country: 'FRA', procedure: 'NonSurgical', value: 130 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'country', type: 'nominal', sort: null },
    xOffset: { field: 'procedure' },
    y: { field: 'value', type: 'quantitative' },
    color: { field: 'procedure', type: 'nominal' },
  },
}

const SIMPLE_LINE_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E simple line fixture',
  data: {
    values: [
      { year: '2018', value: 10 },
      { year: '2019', value: 12 },
      { year: '2020', value: 9 },
      { year: '2021', value: 14 },
    ],
  },
  mark: 'line',
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative' },
  },
}

const MULTI_LINE_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E multi line fixture',
  data: {
    values: [
      { year: '2018', series: 'A', value: 10 },
      { year: '2019', series: 'A', value: 12 },
      { year: '2020', series: 'A', value: 11 },
      { year: '2018', series: 'B', value: 8 },
      { year: '2019', series: 'B', value: 9 },
      { year: '2020', series: 'B', value: 13 },
    ],
  },
  mark: 'line',
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative' },
    color: { field: 'series', type: 'nominal' },
  },
}

export const STACKED_BAR_SPEC = JSON.stringify(STACKED_BAR_SPEC_OBJECT, null, 2)
export const GROUPED_BAR_SPEC = JSON.stringify(GROUPED_BAR_SPEC_OBJECT, null, 2)
export const SIMPLE_LINE_SPEC = JSON.stringify(SIMPLE_LINE_SPEC_OBJECT, null, 2)
export const MULTI_LINE_SPEC = JSON.stringify(MULTI_LINE_SPEC_OBJECT, null, 2)

const MULTILINE_LAYER_NO_TOP_ENCODING_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E multi line layered fixture (x/y only in layer encoding)',
  data: MULTI_LINE_SPEC_OBJECT.data,
  layer: [
    {
      mark: { type: 'line' },
      encoding: {
        x: { field: 'year', type: 'nominal', sort: null },
        y: { field: 'value', type: 'quantitative' },
        color: { field: 'series', type: 'nominal' },
      },
    },
    {
      mark: { type: 'point', filled: true, size: 80 },
      encoding: {
        x: { field: 'year', type: 'nominal', sort: null },
        y: { field: 'value', type: 'quantitative' },
        color: { field: 'series', type: 'nominal' },
      },
    },
  ],
  config: { view: { stroke: 'transparent' } },
}

export const MULTILINE_LAYER_NO_TOP_ENCODING_SPEC = JSON.stringify(
  MULTILINE_LAYER_NO_TOP_ENCODING_SPEC_OBJECT,
  null,
  2,
)

const GROUPED_BAR_GENDER_ORDER_BASE_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
  description: 'E2E grouped bar gender order base (no filter)',
  data: {
    values: [
      // Full dataset observed domain: Male then Female.
      { Platform: 'Facebook', Gender: 'Male', value: 10 },
      { Platform: 'Facebook', Gender: 'Female', value: 12 },
      // Rows that will be kept by the filter start with Female to reproduce remapping.
      { Platform: 'TikTok', Gender: 'Female', value: 7 },
      { Platform: 'TikTok', Gender: 'Male', value: 9 },
      { Platform: 'Instagram', Gender: 'Female', value: 8 },
      { Platform: 'Instagram', Gender: 'Male', value: 11 },
    ],
  },
  mark: 'bar',
  encoding: {
    column: { field: 'Platform', type: 'ordinal', header: {} },
    x: { field: 'Gender', type: 'nominal', axis: { title: '' } },
    y: { field: 'value', type: 'quantitative', axis: { grid: false } },
    color: { field: 'Gender', type: 'nominal' },
  },
  config: { view: { stroke: 'transparent' }, axis: { domainWidth: 1 } },
}

const GROUPED_BAR_GENDER_ORDER_FILTERED_SPEC_OBJECT = (() => {
  // Same chart description/encoding but different row order to simulate temp.csv materialization
  // changing data identity and observed domain ordering.
  const reordered = [
    { Platform: 'TikTok', Gender: 'Female', value: 7 },
    { Platform: 'TikTok', Gender: 'Male', value: 9 },
    { Platform: 'Instagram', Gender: 'Female', value: 8 },
    { Platform: 'Instagram', Gender: 'Male', value: 11 },
    { Platform: 'Facebook', Gender: 'Male', value: 10 },
    { Platform: 'Facebook', Gender: 'Female', value: 12 },
  ]
  return {
    ...GROUPED_BAR_GENDER_ORDER_BASE_SPEC_OBJECT,
    data: { values: reordered },
  description: 'E2E grouped bar gender order filtered (platform subset)',
  transform: [{ filter: { field: 'Platform', oneOf: ['TikTok', 'Instagram'] } }],
  }
})()

export const GROUPED_BAR_GENDER_ORDER_BASE_SPEC = JSON.stringify(GROUPED_BAR_GENDER_ORDER_BASE_SPEC_OBJECT, null, 2)
export const GROUPED_BAR_GENDER_ORDER_FILTERED_SPEC = JSON.stringify(
  GROUPED_BAR_GENDER_ORDER_FILTERED_SPEC_OBJECT,
  null,
  2,
)

const SIMPLE_BAR_V3_HIGHLIGHT_YDOMAIN_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
  description: 'E2E v3 simple bar fixture (calculate + scale domain/range)',
  data: SIMPLE_BAR_SPEC_OBJECT.data,
  transform: [{ calculate: "datum.country === 'USA' ? 'highlight' : 'normal'", as: '__hl' }],
  mark: 'bar',
  encoding: {
    x: { field: 'country', type: 'nominal', sort: null },
    y: { field: 'rating', type: 'quantitative', scale: { domain: [0, 20] } },
    color: {
      field: '__hl',
      type: 'nominal',
      legend: null,
      scale: { domain: ['normal', 'highlight'], range: ['#60a5fa', '#ff0000'] },
    },
  },
  config: { view: { stroke: 'transparent' } },
}

const STACKED_BAR_HIGHLIGHT_YMAX_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E stacked bar fixture (color condition + domainMax)',
  data: STACKED_BAR_SPEC_OBJECT.data,
  mark: 'bar',
  encoding: {
    x: { field: 'month', type: 'nominal', sort: null },
    y: { field: 'count', type: 'quantitative', scale: { domainMax: 20 } },
    color: {
      condition: { test: "datum.month === 'Feb'", value: '#ff0000' },
      field: 'weather',
      type: 'nominal',
    },
  },
  config: { view: { stroke: 'transparent' } },
}

const GROUPED_BAR_HIGHLIGHT_YMAX_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E grouped bar fixture (color condition + domainMax)',
  data: GROUPED_BAR_SPEC_OBJECT.data,
  mark: 'bar',
  encoding: {
    x: { field: 'country', type: 'nominal', sort: null },
    xOffset: { field: 'procedure' },
    y: { field: 'value', type: 'quantitative', scale: { domainMax: 200 } },
    color: {
      condition: { test: "datum.country === 'USA' && datum.procedure === 'Surgical'", value: '#ff0000' },
      field: 'procedure',
      type: 'nominal',
    },
  },
  config: { view: { stroke: 'transparent' } },
}

const LINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E layered line fixture (point highlight + domainMax)',
  data: SIMPLE_LINE_SPEC_OBJECT.data,
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative', scale: { domainMax: 20 } },
  },
  layer: [
    { mark: { type: 'line' }, encoding: { color: { value: '#2563eb' } } },
    {
      mark: { type: 'point', filled: true, size: 80 },
      encoding: {
        color: { condition: { test: "datum.year === '2020'", value: '#ff0000' }, value: '#2563eb' },
      },
    },
  ],
  config: { view: { stroke: 'transparent' } },
}

const MULTILINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E layered multi line fixture (point highlight + domainMax)',
  data: MULTI_LINE_SPEC_OBJECT.data,
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative', scale: { domainMax: 20 } },
  },
  layer: [
    { mark: { type: 'line' }, encoding: { color: { field: 'series', type: 'nominal' } } },
    {
      mark: { type: 'point', filled: true, size: 80 },
      encoding: {
        color: {
          condition: { test: "datum.series === 'B' && datum.year === '2019'", value: '#ff0000' },
          field: 'series',
          type: 'nominal',
        },
      },
    },
  ],
  config: { view: { stroke: 'transparent' } },
}

export const SIMPLE_BAR_V3_HIGHLIGHT_YDOMAIN_SPEC = JSON.stringify(SIMPLE_BAR_V3_HIGHLIGHT_YDOMAIN_SPEC_OBJECT, null, 2)
export const STACKED_BAR_HIGHLIGHT_YMAX_SPEC = JSON.stringify(STACKED_BAR_HIGHLIGHT_YMAX_SPEC_OBJECT, null, 2)
export const GROUPED_BAR_HIGHLIGHT_YMAX_SPEC = JSON.stringify(GROUPED_BAR_HIGHLIGHT_YMAX_SPEC_OBJECT, null, 2)
export const LINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC = JSON.stringify(LINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC_OBJECT, null, 2)
export const MULTILINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC = JSON.stringify(MULTILINE_LAYER_POINT_HIGHLIGHT_YMAX_SPEC_OBJECT, null, 2)

const COLOR_STABILITY_PALETTE = ['#ff0000', '#00ff00', '#0000ff']

const STACKED_BAR_COLOR_STABILITY_BASE_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E stacked bar color stability base',
  data: {
    values: [
      { category: 'A', group: 'g1', value: 10 },
      { category: 'A', group: 'g2', value: 5 },
      { category: 'A', group: 'g3', value: 2 },
      { category: 'B', group: 'g1', value: 3 },
      { category: 'B', group: 'g2', value: 7 },
      { category: 'B', group: 'g3', value: 4 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'category', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative' },
    color: { field: 'group', type: 'nominal' },
  },
  config: { range: { category: COLOR_STABILITY_PALETTE }, view: { stroke: 'transparent' } },
}

const STACKED_BAR_COLOR_STABILITY_FILTERED_SPEC_OBJECT = {
  ...STACKED_BAR_COLOR_STABILITY_BASE_SPEC_OBJECT,
  description: 'E2E stacked bar color stability filtered',
  transform: [{ filter: { field: 'group', oneOf: ['g2', 'g3'] } }],
}

const GROUPED_BAR_COLOR_STABILITY_BASE_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E grouped bar color stability base',
  data: {
    values: [
      { category: 'A', group: 'g1', value: 10 },
      { category: 'A', group: 'g2', value: 5 },
      { category: 'A', group: 'g3', value: 2 },
      { category: 'B', group: 'g1', value: 3 },
      { category: 'B', group: 'g2', value: 7 },
      { category: 'B', group: 'g3', value: 4 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'category', type: 'nominal', sort: null },
    xOffset: { field: 'group' },
    y: { field: 'value', type: 'quantitative' },
    color: { field: 'group', type: 'nominal' },
  },
  config: { range: { category: COLOR_STABILITY_PALETTE }, view: { stroke: 'transparent' } },
}

const GROUPED_BAR_COLOR_STABILITY_FILTERED_SPEC_OBJECT = {
  ...GROUPED_BAR_COLOR_STABILITY_BASE_SPEC_OBJECT,
  description: 'E2E grouped bar color stability filtered',
  transform: [{ filter: { field: 'group', oneOf: ['g2', 'g3'] } }],
}

const MULTI_LINE_COLOR_STABILITY_BASE_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E multi-line color stability base',
  data: {
    values: [
      { year: '2018', series: 'g1', value: 10 },
      { year: '2019', series: 'g1', value: 12 },
      { year: '2020', series: 'g1', value: 11 },
      { year: '2018', series: 'g2', value: 7 },
      { year: '2019', series: 'g2', value: 9 },
      { year: '2020', series: 'g2', value: 10 },
      { year: '2018', series: 'g3', value: 3 },
      { year: '2019', series: 'g3', value: 4 },
      { year: '2020', series: 'g3', value: 6 },
    ],
  },
  mark: { type: 'line', point: true },
  encoding: {
    x: { field: 'year', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative' },
    color: { field: 'series', type: 'nominal' },
  },
  config: { range: { category: COLOR_STABILITY_PALETTE }, view: { stroke: 'transparent' } },
}

const MULTI_LINE_COLOR_STABILITY_FILTERED_SPEC_OBJECT = {
  ...MULTI_LINE_COLOR_STABILITY_BASE_SPEC_OBJECT,
  description: 'E2E multi-line color stability filtered',
  transform: [{ filter: { field: 'series', oneOf: ['g2', 'g3'] } }],
}

export const STACKED_BAR_COLOR_STABILITY_BASE_SPEC = JSON.stringify(STACKED_BAR_COLOR_STABILITY_BASE_SPEC_OBJECT, null, 2)
export const STACKED_BAR_COLOR_STABILITY_FILTERED_SPEC = JSON.stringify(
  STACKED_BAR_COLOR_STABILITY_FILTERED_SPEC_OBJECT,
  null,
  2,
)
export const GROUPED_BAR_COLOR_STABILITY_BASE_SPEC = JSON.stringify(GROUPED_BAR_COLOR_STABILITY_BASE_SPEC_OBJECT, null, 2)
export const GROUPED_BAR_COLOR_STABILITY_FILTERED_SPEC = JSON.stringify(
  GROUPED_BAR_COLOR_STABILITY_FILTERED_SPEC_OBJECT,
  null,
  2,
)
export const MULTI_LINE_COLOR_STABILITY_BASE_SPEC = JSON.stringify(MULTI_LINE_COLOR_STABILITY_BASE_SPEC_OBJECT, null, 2)
export const MULTI_LINE_COLOR_STABILITY_FILTERED_SPEC = JSON.stringify(
  MULTI_LINE_COLOR_STABILITY_FILTERED_SPEC_OBJECT,
  null,
  2,
)

// --- Expert util patch coverage fixtures (transform.filter + y-scale + highlight variants) ---

const EXPERT_SIMPLE_BAR_PATCHED_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E expert util: simple bar (highlight_simple_bar + set_y_scale)',
  data: {
    values: [
      { x: 'g1', y: 10 },
      { x: 'g2', y: 15 },
      { x: 'g3', y: 7 },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'x', type: 'nominal', sort: null },
    y: { field: 'y', type: 'quantitative', scale: { domainMax: 30 } },
    // matches expert_drawing_util.highlight_simple_bar overwrite shape
    color: {
      condition: { test: "datum['x'] == \"g2\"", value: '#ff0000' },
      value: 'lightgray',
      legend: null,
    },
  },
  config: { view: { stroke: 'transparent' } },
}

const EXPERT_STACKED_BAR_FILTER_HIGHLIGHT_YMAX_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v3.0.0-rc4.json',
  description: 'E2E expert util: stacked bar (filter_one_of + highlight_stacked_bar + set_y_scale)',
  data: {
    values: [
      { category: 'A', group: 'g1', value: 10 },
      { category: 'A', group: 'g2', value: 5 },
      { category: 'A', group: 'g3', value: 2 },
      { category: 'B', group: 'g1', value: 3 },
      { category: 'B', group: 'g2', value: 7 },
      { category: 'B', group: 'g3', value: 4 },
    ],
  },
  transform: [
    // matches expert_drawing_util.filter_one_of: {"filter": {"field": ..., "oneOf": [...]}}
    { filter: { field: 'group', oneOf: ['g2', 'g3'] } },
  ],
  mark: 'bar',
  encoding: {
    x: { field: 'category', type: 'nominal', sort: null },
    y: { field: 'value', type: 'quantitative', scale: { domainMax: 30 } },
    // matches expert_drawing_util.highlight_stacked_bar: preserve field + overlay condition
    color: {
      field: 'group',
      type: 'nominal',
      condition: { test: "datum['category'] == \"A\"", value: '#ff0000' },
    },
  },
  config: { range: { category: COLOR_STABILITY_PALETTE }, view: { stroke: 'transparent' } },
}

const EXPERT_GROUPED_BAR_FILTER_HIGHLIGHT_YDOMAIN_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E expert util: grouped bar (filter_one_of + highlight_grouped_bar + set_y_scale(domain))',
  data: {
    values: [
      { category: 'A', group: 'g1', value: 10 },
      { category: 'A', group: 'g2', value: 5 },
      { category: 'A', group: 'g3', value: 2 },
      { category: 'B', group: 'g1', value: 3 },
      { category: 'B', group: 'g2', value: 7 },
      { category: 'B', group: 'g3', value: 4 },
    ],
  },
  transform: [{ filter: { field: 'group', oneOf: ['g2', 'g3'] } }],
  mark: 'bar',
  encoding: {
    x: { field: 'category', type: 'nominal', sort: null },
    xOffset: { field: 'group' },
    y: { field: 'value', type: 'quantitative', scale: { domain: [0, 30] } },
    color: {
      field: 'group',
      type: 'nominal',
      condition: { test: "datum['category'] == \"B\" && datum['group'] == \"g3\"", value: '#ff0000' },
    },
  },
  config: { range: { category: COLOR_STABILITY_PALETTE }, view: { stroke: 'transparent' } },
}

const EXPERT_MULTILINE_LAYERED_FILTER_HIGHLIGHT_POINTS_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E expert util: layered multi-line (filter_multiple_line + highlight_points)',
  data: {
    values: [
      { x: 1, series: 'g1', y: 10 },
      { x: 2, series: 'g1', y: 12 },
      { x: 3, series: 'g1', y: 11 },
      { x: 1, series: 'g2', y: 7 },
      { x: 2, series: 'g2', y: 9 },
      { x: 3, series: 'g2', y: 10 },
      { x: 1, series: 'g3', y: 3 },
      { x: 2, series: 'g3', y: 4 },
      { x: 3, series: 'g3', y: 6 },
    ],
  },
  // filter_multiple_line attaches filter at layered root so both layers are filtered consistently
  transform: [{ filter: { field: 'series', oneOf: ['g2', 'g3'] } }],
  encoding: {
    x: { field: 'x', type: 'quantitative' },
    y: { field: 'y', type: 'quantitative', scale: { domainMax: 20 } },
  },
  layer: [
    { mark: { type: 'line' }, encoding: { color: { field: 'series', type: 'nominal' } } },
    {
      mark: { type: 'point', filled: true, size: 80 },
      encoding: {
        // highlight_points overlays a condition on the point mark layer
        color: {
          field: 'series',
          type: 'nominal',
          condition: { test: "datum['x'] == 2 && datum['series'] == \"g3\"", value: '#ff0000' },
        },
      },
    },
  ],
  config: { range: { category: COLOR_STABILITY_PALETTE }, view: { stroke: 'transparent' } },
}

const EXPERT_CALCULATE_FIELD_COLOR_SPEC_OBJECT = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  description: 'E2E expert util-adjacent: calculate + color.field + scale(domain/range) + filter',
  data: {
    values: [
      { x: 'A', group: 'g1', y: 10 },
      { x: 'A', group: 'g2', y: 5 },
      { x: 'B', group: 'g1', y: 3 },
      { x: 'B', group: 'g2', y: 7 },
    ],
  },
  transform: [
    { calculate: "datum.group === 'g2' ? 'highlight' : 'normal'", as: '__hl' },
    { filter: { field: 'group', oneOf: ['g2'] } },
  ],
  mark: 'bar',
  encoding: {
    x: { field: 'x', type: 'nominal', sort: null },
    y: { field: 'y', type: 'quantitative' },
    // explicit scale(domain/range) -> stability injection should not override
    color: {
      field: '__hl',
      type: 'nominal',
      legend: null,
      scale: { domain: ['normal', 'highlight'], range: ['#60a5fa', '#ff0000'] },
    },
  },
  config: { view: { stroke: 'transparent' } },
}

export const EXPERT_SIMPLE_BAR_PATCHED_SPEC = JSON.stringify(EXPERT_SIMPLE_BAR_PATCHED_SPEC_OBJECT, null, 2)
export const EXPERT_STACKED_BAR_FILTER_HIGHLIGHT_YMAX_SPEC = JSON.stringify(
  EXPERT_STACKED_BAR_FILTER_HIGHLIGHT_YMAX_SPEC_OBJECT,
  null,
  2,
)
export const EXPERT_GROUPED_BAR_FILTER_HIGHLIGHT_YDOMAIN_SPEC = JSON.stringify(
  EXPERT_GROUPED_BAR_FILTER_HIGHLIGHT_YDOMAIN_SPEC_OBJECT,
  null,
  2,
)
export const EXPERT_MULTILINE_LAYERED_FILTER_HIGHLIGHT_POINTS_SPEC = JSON.stringify(
  EXPERT_MULTILINE_LAYERED_FILTER_HIGHLIGHT_POINTS_SPEC_OBJECT,
  null,
  2,
)
export const EXPERT_CALCULATE_FIELD_COLOR_SPEC = JSON.stringify(EXPERT_CALCULATE_FIELD_COLOR_SPEC_OBJECT, null, 2)

export const MULTI_LINE_URL_ORDER_BASE_SPEC = JSON.stringify(
  {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'Multi-line URL order stability fixture',
    data: { url: 'data/test/data/color_stability_multiline.csv' },
    width: 600,
    height: 320,
    layer: [
      {
        mark: { type: 'line', point: false },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Favorable_View_Percentage', type: 'quantitative' },
          color: { field: 'Country', type: 'nominal', legend: { title: 'Country' } },
        },
      },
      {
        mark: { type: 'point', filled: true, size: 60 },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Favorable_View_Percentage', type: 'quantitative' },
          color: { field: 'Country', type: 'nominal' },
        },
      },
    ],
    config: { view: { stroke: 'transparent' }, axis: { domainWidth: 1 } },
  },
  null,
  2,
)

export const MULTI_LINE_URL_ORDER_FILTERED_SPEC = JSON.stringify(
  {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: 'Multi-line URL order stability fixture',
    data: { url: 'data/test/data/color_stability_multiline.csv' },
    width: 600,
    height: 320,
    transform: [{ filter: { field: 'Year', range: [2010, 2012] } }],
    layer: [
      {
        mark: { type: 'line', point: false },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Favorable_View_Percentage', type: 'quantitative' },
          color: { field: 'Country', type: 'nominal', legend: { title: 'Country' } },
        },
      },
      {
        mark: { type: 'point', filled: true, size: 60 },
        encoding: {
          x: { field: 'Year', type: 'ordinal' },
          y: { field: 'Favorable_View_Percentage', type: 'quantitative' },
          color: { field: 'Country', type: 'nominal' },
        },
      },
    ],
    config: { view: { stroke: 'transparent' }, axis: { domainWidth: 1 } },
  },
  null,
  2,
)
