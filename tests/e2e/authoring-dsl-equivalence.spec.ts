import { expect, test } from '@playwright/test'
import { dataOps, drawOps, DrawComparisonOperators, DrawMark, draw, ops } from '../../src/api/legacy'

test('DSL draw ops are equivalent to legacy drawOps payloads', async () => {
  const legacyLine = drawOps.line({
    chartId: 'A',
    line: {
      mode: 'hline-y',
      hline: { y: 42 },
      style: { stroke: '#2563eb', strokeWidth: 2, opacity: 0.9 },
    },
  })
  const dslLine = ops.draw.line('A', draw.lineSpec.horizontalFromY(42, draw.style.line('#2563eb', 2, 0.9)))
  expect(dslLine).toEqual(legacyLine)

  const legacyFilter = drawOps.filter({
    chartId: 'A',
    filter: { y: { op: 'gte', value: 42 } },
  })
  const dslFilter = ops.draw.filter('A', draw.filterSpec.y('gte', 42))
  expect(dslFilter).toEqual(legacyFilter)

  const legacyBarSegment = drawOps.barSegment({
    chartId: 'A',
    selectKeys: ['USA'],
    segment: {
      threshold: 42,
      when: DrawComparisonOperators.GreaterEqual,
      style: {
        fill: '#ef4444',
        stroke: '#dc2626',
        strokeWidth: 1.5,
        opacity: 0.8,
      },
    },
  })
  const dslBarSegment = ops.draw.barSegment(
    'A',
    ['USA'],
    draw.segmentSpec.threshold(
      42,
      DrawComparisonOperators.GreaterEqual,
      draw.style.segment('#ef4444', '#dc2626', 1.5, 0.8),
    ),
  )
  expect(dslBarSegment).toEqual(legacyBarSegment)

  const legacySplit = drawOps.split({
    chartId: 'A',
    split: {
      by: 'x',
      groups: {
        asia: ['KOR', 'JPN'],
        europe: ['DEU', 'FRA'],
      },
      orientation: 'vertical',
    },
  })
  const dslSplit = ops.draw.split('A', draw.splitSpec.two('asia', ['KOR', 'JPN'], 'europe', ['DEU', 'FRA']))
  expect(dslSplit).toEqual(legacySplit)

  const legacyText = drawOps.text({
    chartId: 'A',
    select: { mark: DrawMark.Rect, keys: ['USA'] },
    text: {
      value: 'hello',
      mode: 'anchor',
      style: { color: '#111827', fontSize: 12, fontWeight: 'bold' },
    },
  })
  const dslText = ops.draw.text(
    'A',
    draw.select.markKeys(DrawMark.Rect, 'USA'),
    draw.textSpec.anchor('hello', draw.style.text('#111827', 12, 'bold')),
  )
  expect(dslText).toEqual(legacyText)

  const legacyRect = drawOps.rect({
    chartId: 'A',
    rect: {
      mode: 'normalized',
      position: { x: 0.5, y: 0.5 },
      size: { width: 0.2, height: 0.2 },
      style: { fill: '#22c55e33', stroke: '#16a34a', strokeWidth: 1.5, opacity: 0.8 },
    },
  })
  const dslRect = ops.draw.rect(
    'A',
    draw.rectSpec.normalized(0.5, 0.5, 0.2, 0.2, draw.style.rect('#22c55e33', 0.8, '#16a34a', 1.5)),
  )
  expect(dslRect).toEqual(legacyRect)
})

test('DSL data ops are equivalent to legacy dataOps payloads', async () => {
  const legacyFilterByComparison = dataOps.filter({
    operator: '>=',
    value: 100,
    field: 'Value',
    chartId: 'A',
  })
  const dslFilterByComparison = ops.data.filterByComparison('>=', 100, 'Value', undefined, 'A')
  expect(dslFilterByComparison).toEqual(legacyFilterByComparison)

  const legacyFilterInclude = dataOps.filter({
    include: ['USA', 'KOR'],
    field: 'Country',
    chartId: 'A',
  })
  const dslFilterInclude = ops.data.filterInclude(['USA', 'KOR'], 'Country', undefined, 'A')
  expect(dslFilterInclude).toEqual(legacyFilterInclude)

  const legacyAverage = dataOps.average({
    field: 'Value',
    chartId: 'A',
  })
  const dslAverage = ops.data.average('Value', undefined, 'A')
  expect(dslAverage).toEqual(legacyAverage)

  const legacyCount = dataOps.count({
    field: 'Country',
    chartId: 'A',
  })
  const dslCount = ops.data.count('Country', undefined, 'A')
  expect(dslCount).toEqual(legacyCount)
})
