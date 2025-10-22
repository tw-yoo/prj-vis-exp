# AGENTS.md — Chart-Operation Visualization (Plain JavaScript)

---

## Scope & Constraints
- **Language**: **Plain JavaScript(ES Modules)**. 번들러/TS/빌드툴 없음.
- **No Dev Setup / No PR / No Auto Tests**: 설치·빌드·PR 흐름을 만들지 마세요. 변경은 **로컬 파일 수정** 중심으로 제안합니다.
- **Libraries in use**: D3, Vega-Lite(이미 리포에 있는 버전 사용). 새 의존성 추가는 **금지**(정 필요 시 먼저 물어볼 것).
- **Network**: 기본 **OFF**. 외부 리소스/폰트/CDN 등은 사용하지 않습니다.

---

## Repository Context Model
Codex는 아래 **우선순위**로 맥락을 수집합니다.

1. `AGENTS.md` (이 파일) — 규칙/철학/금지사항
2`operations/**` — 연산 계산 및 시각화
3기타 코드 — 위 계층과 충돌 시 **상위 정책이 우선**

---

## Project Overview
- **Goal**: 자연어로 된 차트 설명을 중간 문법(Intermediate Grammar)으로 변환한 뒤, 그 결과를 사용해 일련의 차트 연산/시각화를 자동으로 생성하는 파이프라인 구축.
- **중간 문법**: LLM이텍스트 지시(instruction.md)를 따라 chart operations JSON을 생성하며, 각 연산 타입/필드는 `object/OperationType.js`, `object/OperationSpec.js`에 명세됨.
- **연산 실행**: 생성된 연산은 `operations/` 디렉토리 내 순수 JS 구현(예: `operations/bar/simple/**`)을 통해 실제 시각화 상호작용(값 강조, 비교 등)을 수행.
- **데이터↔시각화 분리**: `operations/operationFunctions.js` 등에서 데이터 가공을 담당하고, 개별 chart util이 D3로 DOM을 조작하는 식으로 역할을 분리.
- **평가**: 파이프라인 품질 검증을 위해 `survey/` 디렉토리에 설문/태스크 제공. 사용자는 주어진 차트에서 연산 순서를 실행하며 결과를 확인.

---

## Core Design Principles
1. **수학 연산과/데이터 시각화 분리**

---

## JavaScript Guidelines (Dynamic Typing Pitfalls)
- **Numbers**: 문자열 숫자 → `Number()`/`parseFloat()` 명시 변환. `Number.isFinite()`로 검증. NaN 전파 금지.
- **Nullish**: `??`(null/undefined), `?.`(옵셔널 체이닝) 일관 사용.
- **Objects**: 구조 분해 시 기본값을 명시해 `undefined` 누락 버그 방지.
- **Equality**: **엄격 비교**(`===`) 기본.
- **Side Effects**: 전역 변수/싱글턴 상태 추가 금지. 필요한 경우 모듈 내부 클로저로 캡슐화.

## 작업 명세 템플릿 (Grouped/Stacked/Simple Bar, Simple/Multiple Line 일관화)

- [디자인] 모든 주석(라인/텍스트)의 스타일을 단일 규칙(2px, dasharray 5 5, 폰트 12px bold, white stroke)로 맞춘다.
- [Last 단계] `ops_*` ID를 유지하도록 DatumValue를 캐싱/변환하고, 마지막 단계에서는 simpleBar 헬퍼(`simpleBarXXX`)를 호출해 처리한다.
- [데이터 정규화] `to*DatumValues`에서 category/measure/group/id를 채우고, DOM rect에 `data-id/data-target/data-group`을 세팅한다.
- [Pipeline 연동] `run*Ops`의 `onRunOpsList`는 last 단계에서 simplebar spec을 재렌더링하고, 캐시된 DatumValue를 전달한다.
- [로깅] DOM 탐색/계산 실패 시 `console.warn`으로 원인(누락 facet/group 등)을 명시한다.