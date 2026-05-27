/**
 * Sequenced multi-stage reveal helper.
 *
 * Pattern formalized from validation/data/e2/e2_q3.js function2's dual-panel
 * reveal — a three-stage visual story where each stage runs after the
 * previous one settles:
 *
 *   Stage 1 (0–400ms):     bars fade in
 *   Stage 2 (500–1100ms):  average lines draw out simultaneously across panels
 *   Stage 3 (1200–1900ms): difference arrow connects the two averages
 *
 * Existing code in `drawDifferenceArrow.ts` (refLines → shaft expand → heads
 * appear + label) hardcodes this pattern with bespoke await chains. Same
 * shape appears in pairDiff annotations across line/bar charts. This
 * primitive generalizes the pattern so any applier can compose its visual
 * narrative as a list of named stages with explicit timing.
 *
 * Semantics:
 *   - All stages are scheduled at the same point in time. Each stage waits
 *     `startDelayMs` from that moment (NOT from the previous stage's end —
 *     callers compute cumulative delays themselves so stages with explicit
 *     overlap are expressible).
 *   - Each stage's `build()` returns one or more promises (typically d3
 *     `transition.end()` promises). The stage's overall settle time is when
 *     ALL its promises resolve.
 *   - `playSequencedReveal` resolves when every stage has settled.
 *   - Interrupted transitions (d3 throws) are swallowed per-stage so a
 *     mid-flight chart wipe doesn't bubble an error.
 *
 * Example (validation e2_q3 f2-style three-stage reveal):
 *
 *   await playSequencedReveal([
 *     {
 *       name: 'bars',
 *       startDelayMs: 0,
 *       build: () => buildBars(g).map(t => t.end()),
 *     },
 *     {
 *       name: 'avg-lines',
 *       startDelayMs: 500,
 *       build: () => buildAvgLines(g).map(t => t.end()),
 *     },
 *     {
 *       name: 'diff-arrow',
 *       startDelayMs: 1200,
 *       build: () => buildDiffArrow(g).map(t => t.end()),
 *     },
 *   ])
 *
 * The cumulative-delay convention lets callers parameterize stage offsets
 * (e.g. `AVG_LINE_DELAY`, `DIFF_ARROW_DELAY = AVG_LINE_DELAY + 700`) at the
 * call site, mirroring the validation file's readability.
 */
export interface RevealStage {
  /** Stage identifier (logged for debugging; not user-facing). */
  name: string
  /** Wait this many ms from `playSequencedReveal` invocation before kicking off `build()`. */
  startDelayMs: number
  /**
   * Builds the stage's visual contribution and returns a list of promises
   * (typically d3 `transition.end()` results). The stage settles when every
   * promise resolves. Promises that reject are swallowed — d3 transitions
   * commonly reject on `.interrupt()` and we don't want those to abort the
   * sequence.
   */
  build: () => Array<Promise<unknown>>
}

/**
 * Runs all stages in parallel, each gated by its own `startDelayMs` from the
 * call site's "now". Resolves when every stage has settled.
 */
export async function playSequencedReveal(stages: RevealStage[]): Promise<void> {
  if (stages.length === 0) return

  console.info('[operation-new] playSequencedReveal: starting', {
    stageCount: stages.length,
    stages: stages.map((s) => ({ name: s.name, startDelayMs: s.startDelayMs })),
  })

  const runStage = async (stage: RevealStage): Promise<void> => {
    if (stage.startDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, stage.startDelayMs))
    }
    const promises = stage.build()
    if (promises.length === 0) return
    // Swallow individual rejections so an interrupted d3 transition in one
    // sub-promise doesn't fail the whole stage.
    await Promise.all(promises.map((p) => p.catch(() => undefined)))
  }

  await Promise.all(stages.map(runStage))

  console.info('[operation-new] playSequencedReveal: settled')
}

/**
 * Helper for callers that prefer "chain" semantics — each stage starts after
 * the previous one fully settles, with an optional `gapMs` between them.
 *
 * Wraps `playSequencedReveal` by walking the input list, awaiting each
 * stage's promises before moving on. Useful when the visual story is
 * strictly sequential (no overlap) and the caller doesn't want to track
 * cumulative delays manually.
 */
export interface ChainedStage {
  name: string
  /** Optional gap before kicking off this stage's `build()` (after the previous stage settles). */
  gapMs?: number
  build: () => Array<Promise<unknown>>
}

export async function playChainedReveal(stages: ChainedStage[]): Promise<void> {
  for (const stage of stages) {
    if (stage.gapMs && stage.gapMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, stage.gapMs))
    }
    const promises = stage.build()
    if (promises.length === 0) continue
    await Promise.all(promises.map((p) => p.catch(() => undefined)))
  }
}
