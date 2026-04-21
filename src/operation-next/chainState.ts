import type { DatumValue } from '../domain/operation/types'

// ---------------------------------------------------------------------------
// AnnotationRecord
// ---------------------------------------------------------------------------

/**
 * Tracks a single annotation that has been drawn into the annotation layer.
 *
 * - `cssClass`   : CSS class of the annotation elements (e.g. 'operation-next-filter')
 * - `role`       : semantic role — 'anchor' annotations (e.g. filter threshold line)
 *                  persist as context when subsequent operations run;
 *                  'result' and 'label' annotations are cleared by the next operation.
 * - `persistent` : when true, the next operation's annotate step must NOT remove
 *                  elements with this cssClass from the annotation layer.
 */
export interface AnnotationRecord {
  cssClass: string
  role: 'anchor' | 'result' | 'label'
  persistent: boolean
}

// ---------------------------------------------------------------------------
// ScaleRecord
// ---------------------------------------------------------------------------

/**
 * Captures a y-axis rescale that occurred during the current chain.
 * Written by pairDiff (via applyPairDiffFocusTransform).
 * Read by subsequent average / findExtremum to ensure annotation Y positions
 * are computed against the rescaled axis, not the original.
 */
export interface ScaleRecord {
  /** Original y domain before any rescale */
  originalDomain: [number, number]
  /** Current y domain after the rescale */
  currentDomain: [number, number]
  /** Name of the operation that triggered the rescale (e.g. 'pairDiff') */
  rescaledBy: string
}

// ---------------------------------------------------------------------------
// ChainState
// ---------------------------------------------------------------------------

/**
 * Shared state threaded through sequential operation execution within a group.
 *
 * Data layers:
 *   originalData  — full dataset from spec; never mutated.
 *   workingData   — starts equal to originalData; replaced by filter / pairDiff
 *                   to contain only the operationally active subset.
 *   derivedData   — synthetic result values (lagDiff deltas, pairDiff per-target
 *                   differences); null until a compute operation writes it.
 *                   Subsequent findExtremum / average use this instead of workingData
 *                   when non-null.
 *
 * Visual layers:
 *   salienceMap       — maps each mark's target key to its current opacity so
 *                       subsequent operations know which marks are already dimmed.
 *   annotationRecords — ordered list of annotations drawn into the layer;
 *                       used to decide what to clear and what to keep when the
 *                       next operation runs.
 *   scaleState        — non-null after a y-axis rescale; subsequent annotation
 *                       placement must use the rescaled domain.
 */
export interface ChainState {
  /** Full original dataset — never mutated */
  readonly originalData: DatumValue[]

  /** Operationally active dataset (starts = originalData) */
  workingData: DatumValue[]

  /**
   * Synthetic delta / difference values produced by lagDiff or pairDiff.
   * null until one of those operations writes it.
   * Reset at group boundaries.
   */
  derivedData: DatumValue[] | null

  /** Return value of the most recently completed operation */
  lastResult: DatumValue[] | null

  /**
   * Maps a mark's target key to its current opacity level.
   * Written by filter / pairDiff focus.
   * Read by subsequent operations to skip re-dimming already-dimmed marks.
   * Reset at group boundaries.
   */
  salienceMap: Map<string, number>

  /**
   * Ordered list of annotations currently visible in the annotation layer.
   * Each annotate step pushes a record after drawing.
   * Cleared at group boundaries.
   */
  annotationRecords: AnnotationRecord[]

  /**
   * Non-null when the y-axis has been rescaled during this chain (e.g. by pairDiff).
   * Subsequent annotation steps must position themselves against the rescaled axis.
   * Reset at group boundaries.
   */
  scaleState: ScaleRecord | null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the initial ChainState for a new operation run.
 * Call once before the group/operation loop in each runner.
 */
export function createChainState(data: DatumValue[]): ChainState {
  return {
    originalData: data,
    workingData: data,
    derivedData: null,
    lastResult: null,
    salienceMap: new Map(),
    annotationRecords: [],
    scaleState: null,
  }
}

// ---------------------------------------------------------------------------
// Group boundary reset
// ---------------------------------------------------------------------------

/**
 * Resets the parts of ChainState that should not carry over between groups.
 *
 * Preserved across boundaries:
 *   originalData — never changes
 *   workingData  — kept so multi-group plans can build on prior scope reduction
 *
 * Reset at boundaries:
 *   derivedData, lastResult, salienceMap, annotationRecords, scaleState
 */
export function clearGroupBoundary(state: ChainState): ChainState {
  return {
    ...state,
    derivedData: null,
    lastResult: null,
    salienceMap: new Map(),
    annotationRecords: [],
    scaleState: null,
  }
}
