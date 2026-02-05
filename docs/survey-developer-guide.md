# Survey Developer Guide (NEW)

This document explains how the migrated survey system works in `prj-vis-exp`, where to change code safely, and how data/assets flow end-to-end.

---

## 1) Scope and Philosophy

The survey system is implemented as React pages under `src/survey/**` and selected by URL query (`view=...`) in `src/App.tsx`.

Core principles:

- React controls page lifecycle, state, and navigation.
- D3/Vega-Lite rendering is delegated to chart renderer modules.
- Survey text/html/json assets are loaded from `public/survey/**`.
- Firestore REST API is used directly (no Firebase SDK in survey pages).

---

## 2) Entry Points and URL Routing

The main switch is in `src/App.tsx`:

- `?view=result-viewer` -> `ResultViewerPage`
- `?view=consent` -> `ConsentPage`
- `?view=pre-registration` -> `PreRegistrationPage`
- `?view=main-survey` -> `MainSurveyPage`
- `?view=data-collection` -> `DataCollectionPage`
- no `view` -> default chart workbench page

All survey pages are lazy-loaded via `React.lazy` and wrapped with `Suspense`.

---

## 3) Folder Map

### `src/survey/pages/`

- `ConsentPage.tsx`: consent collection + submit API call
- `PreRegistrationPage.tsx`: screening flow + pre-registration write
- `MainSurveyPage.tsx`: main experiment flow (code check, chart+explanation, Likert responses, timings)
- `DataCollectionPage.tsx`: compositional QA data collection flow
- `ResultViewerPage.tsx`: researcher/admin viewer for collected responses
- `*.css`: page-level styling

### `src/survey/components/`

- `SurveyNav.tsx`: previous/next/progress UI
- `LikertQuestion.tsx`: radio scale input
- `OpenEndedInput.tsx`: text/textarea wrapper
- `RankingQuestion.tsx`: ranking interaction (drag/click)
- `CompletionCode.tsx`: completion code display and local persistence

### `src/survey/services/`

- `surveyApi.ts`: fetch static assets under `public/survey/**` with caching
- `surveyStorage.ts`: namespaced local/session storage helpers
- `surveyFirestore.ts`: Firestore REST encode/decode + CRUD helpers

### `src/survey/engine/`

- `mainSurveyConfig.ts`: declarative survey page descriptors and question seeds
- `dataCollectionConfig.ts`: data-collection page descriptors + progress helpers
- `tutorialExamplesData.ts`: tutorial example content

### `src/survey/types/`

- survey model and Firestore contract types

---

## 4) Asset Loading Rules

Static survey assets are served from:

- source files: `public/survey/**`
- runtime URLs: `/survey/**`

Use service helpers, not raw path guessing:

- `fetchSurveyJson(path)`
- `fetchSurveyText(path)`
- `resolveSurveyAssetPath(path)`

Notes:

- `surveyApi.ts` memoizes by URL+mode unless `useCache=false`.
- In `DataCollectionPage`, some chart specs are loaded from `/ChartQA/data/vlSpec/...` derived from chart ID format (`type_subtype_file`).

---

## 5) Data and Persistence Contracts

### 5.1 Local/session storage keys (by page)

Consent / pre-registration:

- `preRegResponses`

Main survey:

- `formResponses`
- `pageTiming`
- `pageResponses`
- `survey_submission_locked`
- `participant_code`

Data collection:

- `data_collection_state_v1` (TTL-based session snapshot, 30 minutes)

### 5.2 Firestore paths used by survey code

All Firestore calls go through `surveyFirestore.ts` using REST:

- `pre-registration/{sanitizedEmail}` (pre-registration records)
- `survey/{code}` (participant document)
- `survey/{code}/{questionKey}/response` (main survey responses)
- `survey/{code}/{pageSlug}/time` (timing records)
- `survey/{code}/state/snapshot` (state hydration read path)
- `data_collection/{participantCode}` (task responses in `questions` field)

`surveyFirestore.ts` handles Firestore typed value encode/decode (`stringValue`, `integerValue`, `mapValue`, etc.).

---

## 6) Per-Flow Behavior

### 6.1 Consent flow (`ConsentPage`)

- URL param: `page` (0/1)
- Validates email + confirmation choice.
- Posts to `VITE_CONSENT_API_URL` (fallback `http://localhost:3000/consent/add`).
- On success, moves to completion screen.

### 6.2 Pre-registration flow (`PreRegistrationPage`)

- URL param: `page`
- Randomly selects 4 screening statements from a fixed pool.
- Stores draft responses in `preRegResponses`.
- Pass/fail logic based on expected true/false answers.
- On pass, submits to `recordPreRegistration(...)` and shows completion page.

### 6.3 Main survey flow (`MainSurveyPage`)

- URL params:
  - `page`
  - `test=1|true` (enables test behavior)
  - `offline=1|true` (skips remote validation/writes)
- Descriptor-driven pages from `buildMainSurveyPageDescriptors()`.
- Access code gate on first page:
  - Validates code via Firestore (`validateSurveyCode`) unless test/offline.
  - Initializes participant doc (`ensureSurveyDocument`).
- For question pages:
  - Left panel: chart from `data/vlSpec/ch_${questionId}.json`.
  - Right panel:
    - `BASELINE`: HTML from `data/opsSpec/op_${questionId}.html`.
    - `OURS`: run ops from `data/opsSpec/op_${questionId}.json` via `runChartOps`.
    - fallback: plain chart render if ops file missing.
- Persists:
  - per-question responses
  - page timing (with visit metadata)
- Uses submission lock map to prevent duplicate submit (`survey_submission_locked`).

### 6.4 Data collection flow (`DataCollectionPage`)

- URL params:
  - `page`
  - `code` (optional deep-link participant code)
  - `offline=1|true`
- Initialization loads:
  - `data_collection/participant_assignments.json`
  - `data_collection/chart_sheet_map.json`
  - `data_collection/ops_options.json` (fallback to built-in defaults)
- Flow structure generated by `buildDataCollectionPageDescriptors(...)`:
  - login -> tutorial intro/examples/tasks -> tutorial end -> main tasks -> complete
- Main task responses are saved to Firestore (`data_collection/{code}`).
- Tutorial task responses are local-only practice.
- Session recovery:
  - restores from local snapshot (`data_collection_state_v1`) if not expired.

### 6.5 Result viewer (`ResultViewerPage`)

- Lists documents in `data_collection` collection.
- Aggregates chart IDs from `questions` fields.
- Loads chart spec candidates and renders selected chart.
- Shows participant question/answer/explanation blocks for selected chart.

---

## 7) Chart Rendering Integration

Survey pages do not directly use D3 internals. They call:

- `renderChart(container, spec)` for standard render
- `runChartOps(container, spec, ops)` for operation-driven animation/explanation
- `renderVegaLiteChart(container, spec)` in data-collection tutorial/task pages

Important:

- Always pass `HTMLElement` refs (no global ID selector usage).
- Clear/fallback behavior is handled in page-level catch blocks (error message injected into container).

---

## 8) Query Parameter Cheat Sheet

- `view`: selects survey page in `App.tsx`
- `page`: page index for flow navigation (multiple pages)
- `code`: data-collection participant code bootstrap
- `test=true|1`: main-survey test mode
- `offline=true|1`: bypass remote validation/writes for local debugging

Example URLs:

- `/?view=consent`
- `/?view=pre-registration&page=0`
- `/?view=main-survey&page=0&test=1`
- `/?view=data-collection&code=ABC123&page=1`
- `/?view=result-viewer`

---

## 9) How to Extend Safely

### Add a new static page to main survey

1. Edit `buildMainSurveyPageDescriptors()` in `src/survey/engine/mainSurveyConfig.ts`.
2. Add a new static descriptor with `path` under `public/survey/pages/**`.
3. If timing is needed, set `trackTime: true`.

### Add a new question pair in main survey

1. Add seed in `tutorialSeeds` or `mainSeeds` (`questionId`, text, answer, explanation type).
2. Place assets:
   - chart: `public/survey/data/vlSpec/ch_${questionId}.json`
   - explanation:
     - baseline HTML: `public/survey/data/opsSpec/op_${questionId}.html`
     - or ops JSON: `public/survey/data/opsSpec/op_${questionId}.json`

### Add/modify data-collection task options

1. Update `public/survey/data_collection/ops_options.json`.
2. Keep `value` non-empty; optional `label` and `tip`.
3. Verify fallback behavior if JSON is malformed (built-in options are used).

### Add participant assignments

1. Update `public/survey/data_collection/participant_assignments.json`.
2. Ensure participant code maps to chart ID list.
3. Optional `TUTORIAL` key defines tutorial chart list.

---

## 10) Operational Checklist (Before Release)

1. Verify each `view=...` route opens.
2. Verify all referenced asset paths return 200.
3. Run main-survey with:
   - normal mode (remote enabled)
   - `offline=1`
   - `test=1`
4. Confirm Firestore writes on:
   - pre-registration
   - main survey responses/timing
   - data-collection task saves
5. Confirm session restore and URL `page` restore.

---

## 11) Common Failure Modes and Fixes

### Blank content or "Failed to load page"

- Cause: wrong asset path (`public/survey/**` vs runtime `/survey/**`).
- Fix: route through `fetchSurveyJson/fetchSurveyText` and `resolveSurveyAssetPath`.

### Chart not rendering in task/question

- Cause: missing spec file or invalid chart ID format.
- Fix: verify chart file exists and chart ID follows `type_subtype_file`.

### "Invalid participant code" in data collection

- Cause: code not in `participant_assignments.json`.
- Fix: add code mapping and redeploy static assets.

### Timing/answers not persisted remotely

- Cause: `offline=1`, missing Firestore config, or network/auth issue.
- Fix: remove offline param, ensure valid Firestore settings (`config.json`) and API reachability.

### Duplicate submit blocked unexpectedly

- Cause: submission lock persisted in `survey_submission_locked`.
- Fix: clear local storage key for test users or use test bypass code path.

---

## 12) Current Technical Debt (Known)

- Some renderer/ops modules still contain `any` and `@ts-nocheck`.
- Firestore decode helpers still use broad `any` internally.
- Large visualization bundle (`vega` chunk) remains heavy; code splitting already improved but can be optimized further.

If you touch survey flows, prioritize correctness and data integrity first, then type/lint hardening in targeted follow-up PRs.
