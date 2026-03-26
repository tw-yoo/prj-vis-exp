# Deprecated: TS NLP Pipeline

이 폴더는 과거 TypeScript 기반 NL -> Lambda -> Ops 변환 로직 보관용입니다.

- 상태: deprecated (참고 전용)
- 실행 경로: 미사용
- 빌드 대상: `tsconfig.app.json`에서 제외

현재 활성 경로는 Python `nlp_server`의 `/generate_grammar`입니다.
TS는 NLP 의미 해석/변환을 수행하지 않고, 요청/응답 어댑터 역할만 수행합니다.
