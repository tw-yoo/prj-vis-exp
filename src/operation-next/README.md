# Operation Next Architecture

`operation-next` keeps the existing operation-list execution path. A previous attempt to introduce a separate visualization-frame layer (`VisualizationFrame`, `frameRenderer`, `planFrames`, `OperationNode`, and a parallel `src/rendering/primitives/` family) was reverted because it was never wired into the rendering path. The current shape is intentionally kept thin.

## Layers

1. Operation list

   `runChartOps.ts` normalizes the input ops spec into groups and dispatches to a chart-type-specific runner. There is no separate tree representation; ref dependencies are resolved at the runner level via `stateWithOperationDependencies`.

2. Execution engine

   Runners (`runners/{simpleBar,groupedBar,stackedBar,simpleLine,multipleLine}.ts`) execute operations and maintain `ChainState` (`originalData`, `workingData`, `derivedData`, `lastResult`, `salienceMap`, `annotationRecords`, `scaleState`).

3. Drawing primitives

   Annotations are drawn through `src/operation-next/primitives/{drawReferenceLine,drawDifferenceArrow,markSalience,annotationLayer,formatValue}.ts`. These remain the single visualization path.

## Policy Surface

`tensionPolicy.ts` exposes a small policy object so future studies can vary annotation behaviour without touching runners. Currently consumed:

- `rescaleAfterIsolation.default` — gates the y-axis rescale step inside `multipleLine.ts` `runPairDiffOperation`.

The other fields (`salienceStrategy`, `annotationStrategy`, `arrowPlacement`, `densityMode`) are defined for future hooks but not yet read by runners.

## `DatumValue.semanticMeasure`

`DatumValue` carries a `semanticMeasure` field (`"avg(rating)"`, `"sum(value)"`, `"Δrating"` …) populated by `dataOps.ts`. This is **not** used for axis titles or chart visuals — those continue to use the original `measure`/encoding fields. The `semanticMeasure` exists so downstream parameter prediction (e.g. authoring a follow-up operation that targets the result of the previous one) can identify what the prior step produced.
