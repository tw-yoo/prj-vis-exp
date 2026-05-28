import type { OperationSpec } from '../domain/operation/types'
import { referencesFromOperation } from '../operation-next/diffEndpoint'
import { ChartType, type ChartTypeValue } from '../domain/chart'

/**
 * Chart types whose operation appliers DO NOT restructure mark geometry —
 * filter only changes opacity, average draws a horizontal reference line.
 * For these, the convergent-DAG pattern (two parallel filter+avg sentences
 * feeding a downstream diff) is purely visual narrative; the two branches
 * can play out in-place on the single chart (ops dims the male portion,
 * ops2 dims the female portion, ops3 draws the diff between the two reference
 * lines). Forcing a split surface only adds visual churn (re-rendering the
 * chart in two panes) without showing anything the in-place version doesn't.
 *
 * Charts whose appliers restructure marks (e.g. simpleBar filter recomputes
 * x-positions; stackedBar filter recomposes the stack) still benefit from
 * split when both branches need to coexist for a downstream merge — case
 * 0s6zi9dyw22qo4rp documents this for simpleBar. Leave them out of this set.
 *
 * Add a chart type here ONLY after confirming its filter/average appliers
 * are opacity/annotation-only.
 */
const CHART_TYPES_WITHOUT_SPLIT: ReadonlySet<ChartTypeValue> = new Set([
  ChartType.MULTI_LINE,
])

/**
 * Result of analysing an ops-spec for a convergent-DAG split pattern.
 *
 * Convergent pattern: two earlier ops groups (L and R) are independent of
 * each other, and a later ops group (M) consumes results from BOTH of them
 * via `ref:` inputs. Visualising this naturally calls for a split view —
 * each parallel branch on its own surface, the converging op shown across
 * the gap.
 *
 * The analyser is intentionally minimal: it only emits the FIRST convergent
 * pattern in an opsGroups list. Nested or multi-pair splits are out of
 * scope here.
 */
export interface SplitPlan {
  /** Index (in `opsGroups`) of the first parallel sentence. */
  leftGroupIndex: number
  /** Index of the second parallel sentence. */
  rightGroupIndex: number
  /** Index of the sentence that consumes refs from BOTH left and right. */
  mergeGroupIndex: number
  /** Surface id assigned to the left branch when split is materialized. */
  leftSurfaceId: string
  /** Surface id assigned to the right branch. */
  rightSurfaceId: string
}

const DEFAULT_LEFT_SURFACE_ID = 'split-left'
const DEFAULT_RIGHT_SURFACE_ID = 'split-right'

/**
 * Collect every operation id produced by ops in a group. Mirrors the
 * normalization used by `referencesFromOperation` for the consumer side
 * (`ref:nX` references strip the `ref:` prefix; produced ids are the bare
 * node id strings).
 */
function producedIds(groupOps: OperationSpec[]): Set<string> {
  const ids = new Set<string>()
  for (const op of groupOps) {
    if (typeof op.id === 'string' && op.id.trim()) ids.add(op.id.trim())
    const nodeId = op.meta?.nodeId
    if (typeof nodeId === 'string' && nodeId.trim()) ids.add(nodeId.trim())
    else if (typeof nodeId === 'number') ids.add(String(nodeId))
  }
  return ids
}

/**
 * Collect every ref id consumed by ops in a group. Each individual op's
 * refs come from `referencesFromOperation` (which already handles
 * targetA/targetB/value/targetValue/meta.inputs).
 */
function consumedRefs(groupOps: OperationSpec[]): Set<string> {
  const refs = new Set<string>()
  for (const op of groupOps) {
    for (const key of referencesFromOperation(op)) refs.add(key)
  }
  return refs
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true
  return false
}

/**
 * Scan `opsGroups` for a convergent DAG pattern. Returns a `SplitPlan` for
 * the first match, or `null` if no split is needed.
 *
 * The match criterion (concrete, not heuristic):
 *   ∃ indices L < R < M such that
 *     • group[M] consumes at least one ref produced by group[L], AND
 *     • group[M] consumes at least one ref produced by group[R], AND
 *     • group[R] does NOT consume any ref produced by group[L]
 *       (true parallel siblings, not a chain), AND
 *     • (trivially) L < R.
 *
 * No assumption about group keys ("ops"/"ops2"/…) — analysis is on
 * structural produced/consumed sets only.
 */
export function analyzeSplitPlan(
  opsGroups: OperationSpec[][],
  options?: {
    leftSurfaceId?: string
    rightSurfaceId?: string
    /**
     * Chart type for the spec being analyzed. When provided AND the chart
     * type is in `CHART_TYPES_WITHOUT_SPLIT` (e.g. multipleLine), the analyzer
     * returns `null` regardless of the DAG structure — the in-place narrative
     * (opacity-only filter + reference-line average) handles convergent ops
     * without needing two surfaces. See `CHART_TYPES_WITHOUT_SPLIT` jsdoc for
     * the policy rationale.
     */
    chartType?: ChartTypeValue | null
  },
): SplitPlan | null {
  if (!Array.isArray(opsGroups) || opsGroups.length < 3) return null

  // Chart-type opt-out: even if the DAG structure matches the convergent
  // pattern, some chart types don't benefit from split. Bail early with a
  // single JSON log line so reviewers can see WHY no split happened on case
  // 4pi1e6ev8e0zobww (multipleLine filter+avg+diff).
  const chartType = options?.chartType ?? null
  if (chartType && CHART_TYPES_WITHOUT_SPLIT.has(chartType)) {
    console.info(
      '[splitPlan] analyzeSplitPlan: chart-type opt-out ' +
        JSON.stringify({
          chartType,
          opsGroupCount: opsGroups.length,
          reason:
            'multipleLine (and similar) appliers mutate opacity/annotations only — split adds visual churn without gain',
        }),
    )
    return null
  }

  const produced = opsGroups.map(producedIds)
  const consumed = opsGroups.map(consumedRefs)

  for (let m = 2; m < opsGroups.length; m += 1) {
    const consumedByM = consumed[m]
    if (consumedByM.size === 0) continue

    // For each pair (L, R) where L < R < M, check if M consumes from both
    // and they are mutually independent.
    for (let l = 0; l < m - 1; l += 1) {
      if (!intersects(consumedByM, produced[l])) continue
      for (let r = l + 1; r < m; r += 1) {
        if (!intersects(consumedByM, produced[r])) continue
        // R must NOT depend on L's outputs — otherwise it's a chain, not
        // a parallel sibling. (L cannot depend on R because L < R: L was
        // already materialized when R is analyzed; but R could still ref L.)
        if (intersects(consumed[r], produced[l])) continue
        const plan: SplitPlan = {
          leftGroupIndex: l,
          rightGroupIndex: r,
          mergeGroupIndex: m,
          leftSurfaceId: options?.leftSurfaceId ?? DEFAULT_LEFT_SURFACE_ID,
          rightSurfaceId: options?.rightSurfaceId ?? DEFAULT_RIGHT_SURFACE_ID,
        }
        console.info(
          '[splitPlan] analyzeSplitPlan: convergent DAG detected ' +
            JSON.stringify({
              chartType,
              plan,
              opsGroupCount: opsGroups.length,
            }),
        )
        return plan
      }
    }
  }

  return null
}

/**
 * True iff `groupIndex` is one of the three indices in `plan`. Convenience
 * helper for callers that branch on plan role.
 */
export function splitPlanRoleFor(
  plan: SplitPlan | null,
  groupIndex: number,
): 'left' | 'right' | 'merge' | null {
  if (!plan) return null
  if (groupIndex === plan.leftGroupIndex) return 'left'
  if (groupIndex === plan.rightGroupIndex) return 'right'
  if (groupIndex === plan.mergeGroupIndex) return 'merge'
  return null
}
