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
