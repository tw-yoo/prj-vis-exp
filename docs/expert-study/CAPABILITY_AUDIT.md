# Capability Audit

This audit records the implementation state after the operation result and visualization integration work. It is a reference document only; the expert-study PDFs are not encoded as runtime rules or validation schema.

Status legend:

- Present: implemented in the current code path.
- Partial: represented in types or one path, but not fully wired everywhere.
- Absent: intentionally not implemented yet.
- Unknown: cannot be confirmed from the current code without a separate study pass.

## State

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 1 | Can operation outputs preserve the semantic meaning of transformed measures? | Present | `DatumValue.semanticMeasure`, `buildSemanticMeasure`, and axis-title resolution use operation-level measure names. |
| 2 | Can original measure names remain available after aggregation or arithmetic? | Present | `measure` is preserved while `semanticMeasure` stores derived meaning. |
| 3 | Can the chain track both previous and current visualization state? | Present | `ChainState.prevFrame` and `ChainState.currentFrame`. |
| 4 | Can annotation state be identified by stable semantic keys rather than CSS classes? | Present | `PrimitiveCall.semanticKey` and `renderFrameTransition` diff by key. |
| 5 | Can reversible scale state be recorded for isolation or rescale steps? | Partial | Existing `scaleState` remains, and policy exposes reversible rescale; full undo wiring is still limited. |
| 6 | Can synthetic visual marks be represented separately from source data rows? | Present | `SyntheticMark` and frame `marks.overlays`. |

## Steps

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 7 | Can a linear operation list be converted into explicit operation nodes? | Present | `buildTreeFromList`. |
| 8 | Can operation dependencies be represented as node edges? | Present | `OperationNode.inputs` and `meta.inputs` / `ref:*` extraction. |
| 9 | Can operation nodes be topologically linearized for execution compatibility? | Present | `topologicalLinearize`. |
| 10 | Can planner output be grouped into scope-reduction, transformation, and annotation phases? | Present | `VisualizationFrame.phase` and planner phase selection. |
| 11 | Can transformation frames be inserted before unsupported or transformed chart operations? | Partial | `selectTransformation` and planner transformation frames exist; chart-type transforms are not all rendered as derived charts yet. |
| 12 | Can duplicate explanatory steps be skipped across adjacent frames? | Present | Planner and frame renderer both deduplicate by `semanticKey`. |
| 13 | Can compositional cases such as two diffs and a max selection be planned? | Present | `two-diffs-max.spec.ts`. |
| 14 | Can merged-series comparison be represented without hardcoding chart data fields? | Partial | Synthetic merged-stack overlays are planned; complete visual derivation remains conservative. |

## Primitives

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 15 | Is there a reusable reference-line primitive? | Present | `src/rendering/primitives/referenceLine.ts`. |
| 16 | Is there a reusable difference-arrow primitive? | Present | `src/rendering/primitives/differenceArrow.ts`. |
| 17 | Is there a reusable salience primitive? | Present | `src/rendering/primitives/markSalience.ts`. |
| 18 | Is there a reusable chart-transform primitive interface? | Partial | `chartTransform.ts` defines deterministic transform calls; full rendering is still adapter-level. |
| 19 | Is text/numeric augmentation represented as a primitive? | Present | `textAnnotation.ts`. |
| 20 | Is layout transform represented as a primitive surface? | Partial | `layoutTransform.ts` exists with rescale/range-shading helpers; broad runner wiring is limited. |
| 21 | Is step/direction annotation represented for sequential change? | Partial | `stepAnnotation.ts` exists; only selected chart paths use it. |

## Salience

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 22 | Can salience strategy choose dim, remove, or grayscale? | Present | `TensionPolicy.salienceStrategy` and frame config. |
| 23 | Can salience be applied by predicate or stable datum keys? | Present | `MarkSalienceParams.selection`. |
| 24 | Can existing annotations be strengthened instead of redrawn from scratch? | Partial | `strengthenAnnotation` exists; adoption is still selective. |
| 25 | Can salience and annotations be diffed independently? | Partial | Primitive diffing is implemented; salience map diffing is still lightweight. |

## Transformation

| No. | Capability Question | Status | Current Code Evidence |
| --- | --- | --- | --- |
| 26 | Can chart-type transformation recommendations be queried by operation? | Present | `OPERATION_TRANSFORM_RECOMMENDATIONS` and `selectTransformation`. |
| 27 | Can annotation placement policy choose right-edge vs inline arrows? | Present | `TensionPolicy.arrowPlacement`, with `PairDiff` defaulting to inline. |
| 28 | Can annotation density policy be represented? | Present | `TensionPolicy.densityMode`; selective density is not yet behaviorally expanded. |
| 29 | Can isolation trigger optional rescale policy? | Partial | Policy and selected runner gating exist; broad reversible UI restoration is not complete. |

## Open Notes

- Tier 3 items remain out of scope: tentative sequential reveal, topology detection, selective density heuristics, and axis swap.
- This file intentionally audits capability state. It does not assert that all expert-study recommendations are mandatory system behavior.
