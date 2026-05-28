import type * as d3 from 'd3'

/**
 * Type alias for the "parent" d3 transition that several primitives and
 * `ChartInstance` methods accept as an optional argument.
 *
 * Background: the validation pages (validation/data/e2-e10/*.js) and
 * `SimpleBarChartInstance.transitionChartScale` share one observation —
 * when every sub-operation (bar move, axis rescale, legend fade, annotation
 * fade-to-context) is scheduled under the SAME parent transition, the d3
 * scheduler ticks them in lockstep so the chart's visual state stays
 * coherent every frame. Without it, each sub-op runs on its own root
 * transition with its own timeline, and the operations finish at subtly
 * different moments — labels "pop" before bars settle, the legend completes
 * after the bars do, etc.
 *
 * Primitives like `fadeRemoveAnnotations`, `applyAnnotationContextFade`,
 * and `transitionLegendScope` accept this type as an optional parameter.
 * When provided, they hook into the parent's timeline via
 * `selection.transition(parent)`; when omitted, they fall back to creating
 * their own root transition (preserving existing call sites' behavior).
 *
 * Casting note: d3's `transition()` returns a parameterized `Transition`
 * type whose generics rarely match the child selection's. The validation-
 * page pattern (and `simpleBarInstance.ts:466`) handles this with
 * `transition as never` at the inheritance boundary. Primitives follow the
 * same convention — they cast `parent as never` when passing it to
 * `selection.transition(...)`.
 */
export type ParentTransition = d3.Transition<d3.BaseType, unknown, d3.BaseType, unknown>
