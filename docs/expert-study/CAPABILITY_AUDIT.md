# Capability Audit (post-correction)

This audit records the current state of the operation-next code path. It is reference material; the expert-study PDFs are not encoded as runtime rules or validation schema.

> **Update**: An earlier revision of this audit reported many capabilities as "Present" because new modules existed in the tree. Those modules (`VisualizationFrame`, `frameRenderer`, `planFrames`, `OperationNode`, the parallel `src/rendering/primitives/` family) were never wired into the rendering path and have been removed. Statuses below reflect actual runtime behaviour after that removal.

Status legend:

- Present: implemented in the current code path and exercised at runtime.
- Partial: types or limited wiring exist, but the capability is not realised end to end.
- Removed: a previous experimental module covered this; the module was deleted.
- Absent: intentionally not implemented.
- Unknown: cannot be confirmed without an additional study pass.

## Data

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 1 | Are operation outputs annotated with the semantic meaning of transformed measures? | Present | `DatumValue.semanticMeasure` (data field) populated by `buildSemanticMeasure` in `dataOps.ts`. Used for downstream parameter prediction, not for axis titles. |
| 2 | Do original measure names remain available after aggregation or arithmetic? | Present | `measure` is preserved unchanged. `resolveAxisTitle.ts` uses it for axis titles. |
| 3 | Does the chain track previous and current frame state? | Removed | The `prevFrame`/`currentFrame` fields were removed along with the dead frame layer. |
| 4 | Are annotations identified by stable semantic keys rather than CSS classes? | Absent | The active path uses CSS-class-keyed selections (`AnnotationRecord.cssClass`). The semantic-key scheme was part of the removed frame layer. |
| 5 | Is reversible scale state recorded for isolation or rescale steps? | Partial | `ScaleRecord` is written by `pairDiff` and read by subsequent steps; restoring to an earlier scale on backward navigation is not implemented. |
| 6 | Are synthetic visual marks represented separately from source data rows? | Removed | The `SyntheticMark` overlay representation was removed. |

## Steps

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 7 | Is the operation list converted into an explicit dependency tree? | Removed | The tree representation was deleted. Ref dependencies are resolved per-runner via `stateWithOperationDependencies` in `executionState.ts`. |
| 8 | Are operation dependencies modelled as edges? | Removed | Same as above. `meta.inputs` / `ref:*` is consumed directly by the runner helper. |
| 9 | Is execution topologically linearised? | Absent | Operations execute in their input list order. |
| 10 | Are explanation steps tagged with a phase (scope-reduction, transformation, annotation)? | Absent | Removed with the frame layer. |
| 11 | Are transformation frames inserted before chart-type-incompatible operations? | Absent | Removed. |
| 12 | Are duplicate explanatory steps deduplicated across adjacent frames? | Absent | Removed. |
| 13 | Are compositional cases (e.g. two diffs and a max selection) planned automatically? | Absent | Removed. |
| 14 | Is merged-series comparison represented without hardcoding chart data fields? | Absent | Removed. |

## Primitives

The active drawing primitives are in `src/operation-next/primitives/`. The parallel `src/rendering/primitives/` family was removed.

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 15 | Is there a reusable reference-line primitive? | Present | `src/operation-next/primitives/drawReferenceLine.ts`. |
| 16 | Is there a reusable difference-arrow primitive? | Present | `src/operation-next/primitives/drawDifferenceArrow.ts`. |
| 17 | Is there a reusable salience primitive? | Present | `src/operation-next/primitives/markSalience.ts`. |
| 18 | Is there a reusable chart-transform primitive interface? | Absent | Removed. Chart-type transforms remain inside chart-specific draw handlers. |
| 19 | Is text/numeric augmentation represented as a primitive? | Partial | Per-runner annotation helpers in `annotationLayer.ts` handle text annotations; not factored as a generic primitive. |
| 20 | Is layout transform represented as a primitive surface? | Absent | Removed. |
| 21 | Is step/direction annotation represented for sequential change? | Absent | Removed. |

## Salience

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 22 | Can salience strategy choose dim, remove, or grayscale? | Partial | `TensionPolicy.salienceStrategy` is defined; runners do not currently read it. |
| 23 | Can salience be applied by predicate or stable datum keys? | Present | `applyMarkSalience` accepts a selection callback. |
| 24 | Can existing annotations be strengthened instead of redrawn? | Absent | Removed. |
| 25 | Can salience and annotations be diffed independently? | Absent | Removed. |

## Transformation

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 26 | Are chart-type transformation recommendations queryable by operation? | Absent | `OPERATION_TRANSFORM_RECOMMENDATIONS` was removed. Chart-type transforms are encoded in chart-specific draw handlers. |
| 27 | Can annotation placement policy choose right-edge vs inline arrows? | Partial | `TensionPolicy.arrowPlacement` exists; runners do not currently read it. |
| 28 | Can annotation density policy be represented? | Partial | `TensionPolicy.densityMode` exists; not consumed yet. |
| 29 | Can isolation trigger an optional rescale policy? | Present | `multipleLine.ts` `runPairDiffOperation` reads `tensionPolicy.rescaleAfterIsolation.default` to gate `applyPairDiffFocusTransform`. |

## Open Notes

- The expert study is reference material. The system does not validate against it and does not require all capabilities to be implemented.
- A previous experimental architecture was removed because it ran in parallel to the legacy path without contributing to actual rendering. The legacy path (`src/operation-next/primitives/*`) remains the single drawing path.
- `DatumValue.semanticMeasure` is preserved as a data-only field for downstream parameter prediction, not for display.
