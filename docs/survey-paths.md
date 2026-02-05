# Survey Asset Path Rules

This project serves migrated survey assets from:

- `public/survey/**`

At runtime they are available as:

- `/survey/**`

## Rules

- Use absolute app paths in fetch calls whenever possible (e.g. `/survey/data_collection/pages/main-task.html`).
- If legacy code has relative paths like `pages/foo.html` or `data/vlSpec/x.json`, route them through:
  - `resolveSurveyAssetPath(path)` from `src/survey/services/surveyApi.ts`
- Do not fetch from `frontend/survey/**` at runtime; that folder is source-only.

## Examples

- `fetchSurveyText('pages/main_survey/main_intro.html')` -> `/survey/pages/main_survey/main_intro.html`
- `fetchSurveyJson('data/vlSpec/ch_q1.json')` -> `/survey/data/vlSpec/ch_q1.json`
- `fetchSurveyText('/survey/consent/pages/consent.html')` -> unchanged

