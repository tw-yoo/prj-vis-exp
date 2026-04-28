# Unresolved Verification Notes

## Phase 6 e2e regression suite

`npm run lint` and `npm run build` pass after Phase 6 cleanup. The full Playwright suite currently reports 64 passed and 83 failed.

The new compositional and policy checks pass:

- `tests/e2e/compositional/two-diffs-max.spec.ts`
- `tests/e2e/compositional/merge-series.spec.ts`
- `tests/e2e/compositional/duplicate-skip.spec.ts`
- `tests/e2e/compositional/tension-policy.spec.ts`

The remaining failures cluster around existing workbench/demo regression expectations:

- legacy annotation slots such as `data-annotation-slot="aggregate-line:__root__:average"`
- draw interaction split/filter behavior
- explanation text placement and concise text assertions
- color stability and conversion smoke tests

These failures need a focused regression pass because they span multiple existing UI workflows. Phase 6 did not add expert-study schema validation or hardcoded expert mappings.
