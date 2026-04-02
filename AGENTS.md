# Project Agent Notes

이 문서는 repo 루트에서 작업하는 AI/code agent용 메모입니다. `nlp_server/`는 별도 Python backend이므로, 해당 디렉터리를 수정할 때는 `nlp_server/AGENTS.md`를 따릅니다.

이 루트 앱은 Vega-Lite spec과 operation spec을 바탕으로 차트 annotation, transformation, explanation, interaction workflow를 실험하는 연구용 VIS/HCI prototype입니다. 상용 제품 기능 확장보다, `src/` 엔진과 `web/` 실험 UI 사이의 경계를 유지하면서 현재 operation/rendering 흐름을 안정적으로 다루는 것이 우선입니다.

## 범위

- 이 프로젝트의 루트는 Vite + React + TypeScript 기반입니다.
- `src/`는 application/domain/operation/rendering 엔진 코드를 담습니다.
- `web/`는 `workbench`, `specTest`, `demo`, `survey`, `data` 페이지 진입점을 담습니다.
- `data/expert/`는 authored expert plans / examples를 담습니다.
- `tests/e2e/`는 Playwright end-to-end 테스트 모음입니다.
- `scripts/`는 build/pretest에서 사용하는 guard script 모음입니다.
- `web/`는 engine 코드를 직접 참조하지 말고 가능한 `src/api/*`를 통해 접근합니다.

## 확인된 명령

- `npm run dev`
- `npm run dev:5174`
- `npm run dev:5713`
- `npm run build`
- `npm run lint`
- `npm run test:e2e`
- `npm run test:e2e:headed`
- `npm run docs:draw`

## 작업 워크플로 메모

- `npm run build`는 `check:draw-support-sync`, `check:authoring-style`, `check:ide-hints`, `check:src-boundary`, `check:arch-boundary`를 먼저 실행한 뒤 `tsc -b`와 `vite build`를 수행합니다.
- `npm run test:e2e`와 `npm run test:e2e:headed`도 같은 사전 check를 먼저 통과해야 합니다.
- `playwright.config.ts` 기준 e2e는 `tests/e2e`를 사용하고, `npm run dev -- --host 127.0.0.1 --port 4173`를 web server로 띄운 뒤 `http://127.0.0.1:4173`에 붙습니다.
- rendering/ops 변경은 가능하면 관련 `tests/e2e/*.spec.ts`로 좁혀서 검증합니다.
- TODO: 루트 기준의 안정적인 unit test 진입점이 정리되면 여기에 추가합니다.
