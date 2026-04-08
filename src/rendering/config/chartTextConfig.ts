export const CHART_TEXT_SIZE = Object.freeze({
  axisLabel: 15,
  axisTitle: 18,
  legendLabel: 20,
  legendTitle: 20,
  chartTitle: 18,
  chartSubtitle: 14,
  explanationPrimary: 15,
  explanationSecondary: 13,
  facetLabel: 13,
  facetTitle: 14,
  annotation: 14,
  annotationMinor: 13,
  valueLabel: 20,
  splitPanelTitle: 20,
  autoDraw: 14,
  autoDrawMinor: 13,
  scalarPanelValue: 13,
  scalarPanelValueLarge: 18,
})

export const CHART_TEXT_COLLISION = Object.freeze({
  obstaclePaddingPx: 3,
  viewportPaddingPx: 3,
  stepPx: 2,
  maxRadiusAnchorPx: 44,
  maxRadiusNormalizedPx: 64,
  sideFlipPenalty: 120,
  scoreWeightOverlap: 1000,
  scoreWeightOutside: 1200,
  leaderLineThresholdPx: 24,
  barInsideFallbackCollisionArea: 24,
})

export const CHART_ANNOTATION_LAYOUT = Object.freeze({
  comparisonSummaryRightGutter: 96,
  comparisonSummaryTopInset: 18,
  comparisonSummaryBottomInset: 18,
  comparisonSummarySideInset: 22,
  legendExtraOffsetX: 40,
  comparisonForbiddenOverlapPenalty: 6000,
  comparisonCrossPanelPenalty: 12000,
})

export const CHART_PANEL_LAYOUT = Object.freeze({
  groupedFacetGap: 50,
})
