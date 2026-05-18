# Expert Study — Reference Notes

This directory holds the source PDFs from the chart-explanation expert study (`Claude.pdf`, `Claude2.pdf`) and accompanying notes. The study findings are **reference material**, not enforced runtime rules — there is no code that maps expert taxonomy onto operations or validates against it.

## Current architecture (post-correction)

A previous experimental architecture introduced a `VisualizationFrame` layer, a parallel `src/rendering/primitives/` family, an `OperationNode` tree, and a frame renderer. None of it was wired into the actual rendering path; it has been removed.

The active path is documented at [`src/operation-next/README.md`](../../src/operation-next/README.md). In short:

- `runChartOps.ts` → chart-type runner → `src/operation-next/primitives/*` for drawing.
- `DatumValue.semanticMeasure` is preserved as a data field for downstream parameter prediction (not for display).
- `tensionPolicy.ts` keeps a small policy surface (currently used by `multipleLine` pairDiff rescale gating).

## Files

- `Claude.pdf`, `Claude2.pdf` — expert study source documents (reference only).
- `CAPABILITY_AUDIT.md` — current capability state of the operation-next code path. Updated alongside correction work.
- `UNRESOLVED.md` — verification status notes.
