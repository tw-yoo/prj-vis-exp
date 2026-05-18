# Unresolved Verification Notes

## Correction work (post Phase 6)

The dead frame architecture introduced in Phase 2/3 was removed (`VisualizationFrame`, `frameRenderer`, `planFrames`, `OperationNode`, the parallel `src/rendering/primitives/` family, the `compositional/*` unit-style specs). `resolveAxisTitle` was reverted to ignore `DatumValue.semanticMeasure` (the field is preserved on data only, not surfaced in axis titles).

### After correction

- `npm run lint`: passes (350 pre-existing warnings, 0 errors).
- `npm run build`: passes (all five pre-build checks pass).
- `npm run test:e2e`: 58 passed, 84 failed.

### Phase 6 baseline (before correction)

- 64 passed, 83 failed.

### Net change

Five tests disappeared because the four `tests/e2e/compositional/*.spec.ts` files were deleted (they were unit-style assertions on the dead frame planner). One additional failure remains within noise levels for a long Playwright suite.

## Pre-existing failures

The 80+ failing tests are not introduced by the correction work. Before the correction the same files were already failing (for example `workbench-color-stability-legend-order.spec.ts:45` fails identically on the pre-phase commit `a79e24aa`). The current correction only removed dead code and reverted axis title behaviour; it did not touch the legacy primitives in `src/operation-next/primitives/*` or any chart renderer that those failing tests cover.

The failures cluster in these areas:

- color-stability legend ordering and group color preservation
- draw matrix split / unsplit edge cases
- workbench expert-util coverage rendering checks
- workbench-operation-coverage edge cases (`compareBool`, `retrieveValue`, etc.)
- explanation text rendering across multi-op groups
- workbench-simple-bar-diff (annotation slot expectations such as `value-label:__root__:NLD:__all__`)
- text placement policy edge cases

These need a separate regression pass that focuses on the legacy rendering path. Such a pass is out of scope for the correction work.

## Out of scope

- Re-introducing a frame-style architecture or any parallel annotation layer.
- Wiring `DatumValue.semanticMeasure` into axis titles.
- The 80+ pre-existing test failures listed above.
