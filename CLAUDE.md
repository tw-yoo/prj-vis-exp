# Claude Code Notes

이 문서는 repo 루트에서 Claude Code가 작업할 때 참고하는 최소 메모입니다. `nlp_server/`는 별도 Python backend이므로, 그 디렉터리를 수정할 때는 `nlp_server/CLAUDE.md`를 따릅니다.

이 루트 앱은 Vega-Lite spec과 operation spec을 바탕으로 차트 annotation, transformation, explanation, interaction workflow를 실험하는 연구용 VIS/HCI prototype입니다. 상용 제품 기능 확장보다, `src/` 엔진과 `web/` 실험 UI 사이의 경계를 유지하면서 현재 operation/rendering 흐름을 안정적으로 다루는 것이 우선입니다.

## Scope

- 루트 프로젝트는 Vite + React + TypeScript 기반입니다.
- `src/`는 엔진/application/domain/rendering 코드를 담습니다.
- `web/`는 `workbench`, `specTest`, `demo`, `survey`, `data` 페이지 진입점을 담습니다.
- `data/expert/`는 authored expert plans / examples를 담습니다.
- `tests/e2e/`는 Playwright 테스트 모음입니다.
- `scripts/`는 build/test 전에 실행되는 guard script 모음입니다.
- `web/`는 engine 코드를 직접 참조하지 말고 가능한 `src/api/*`를 통해 접근합니다.

## Verified Commands

- `npm run dev`
- `npm run dev:5174`
- `npm run dev:5713`
- `npm run build`
- `npm run lint`
- `npm run test:e2e`
- `npm run test:e2e:headed`
- `npm run docs:draw`

## Workflow Notes

- 변경 검증은 가능하면 관련 범위만 좁혀서 수행합니다. rendering/ops 변경이면 우선 관련 `tests/e2e/*.spec.ts`를 확인합니다.
- `npm run build`는 먼저 `check:draw-support-sync`, `check:authoring-style`, `check:ide-hints`, `check:src-boundary`, `check:arch-boundary`를 통과해야 합니다.
- `npm run test:e2e`와 `npm run test:e2e:headed`도 동일한 사전 check를 먼저 실행합니다.
- `playwright.config.ts` 기준 e2e는 `tests/e2e`를 사용하고, `npm run dev -- --host 127.0.0.1 --port 4173`를 web server로 사용합니다.
- TODO: 루트 기준 unit test 진입점이 정리되면 여기에 추가합니다.
