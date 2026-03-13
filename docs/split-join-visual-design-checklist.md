# Split/Join Visual Design Checklist

이 문서는 sentence-step 실행 기준에서 split/fork-join 시각 디자인 TODO를 확정 가능한 체크리스트로 분리한 규격이다.

## Scope

- 대상 join 정책:
  - split 유지 join: `diff`, `compare`, `count`
  - merge join: `sum`
- 대상 차트:
  - simple bar, grouped bar, stacked bar, simple line, multiple line
- 전제:
  - `Next 1회 = sentenceIndex 1개`
  - 같은 sentence 안의 분기는 동시 실행

## A. Split 유지 Join (`diff`, `compare`, `count`)

### A1. Diff/Compare Bridge Line

- [ ] 브리지 생성 조건 확정: 두 ref가 서로 다른 panel의 scalar anchor를 가리킬 때만 생성
- [ ] 브리지 방향 규칙 확정:
  - horizontal split: `x` 축에 수직(세로) 브리지
  - vertical split: `y` 축에 수평(가로) 브리지
- [ ] 시작/끝점 규칙 확정: 작은 값 -> 큰 값 방향을 고정할지, 방향 없이 양끝 anchor만 표현할지 결정
- [ ] 스타일 토큰 확정:
  - stroke color
  - stroke width
  - opacity
  - line cap
- [ ] 애니메이션 타이밍 확정:
  - draw duration
  - easing
  - sentence step 내 동시 실행 여부

### A2. Diff/Compare Text (`Δ` / compare label)

- [ ] 텍스트 값 형식 확정:
  - `Δ {absDiff}` 또는 `compare: {absDiff}`
  - signed/unsigned 처리 규칙
  - 소수점 자리수 규칙
- [ ] 텍스트 위치 규칙 확정:
  - 브리지 중심점 기준
  - 큰 값 anchor 기준 `+offset` 방식
  - 충돌 시 fallback 우선순위
- [ ] 텍스트 스타일 토큰 확정:
  - color
  - font size
  - font weight
  - opacity

### A3. Count Join (split 유지)

- [ ] 패널별 count 텍스트 표기 형식 확정 (`count: N` 등)
- [ ] 중앙 total count 텍스트 표기 형식 확정 (`total count: N` 등)
- [ ] 중앙 total 위치 규칙 확정:
  - split 중앙 상단 기준 anchor
  - plot 영역 침범 여부
- [ ] 패널별 count와 total의 시각적 위계 규칙 확정
- [ ] count join 단계에서 기존 panel annotation 재사용/정리 우선순위 확정

### A4. 공통 Reconciliation/Layering

- [ ] 동일 annotation key 재사용 규칙 확정 (지우고 재생성 금지)
- [ ] split 유지 join 직전 cleanup 규칙 확정:
  - keep 대상 annotation
  - 제거 대상 annotation
- [ ] z-index(layer) 우선순위 확정:
  - panel mark
  - scalar baseline
  - bridge
  - label

### A5. 실패/폴백 규칙

- [ ] anchor 미해결 시 fallback 우선순위 확정:
  1. chart-backed connector
  2. scalar panel fallback
  3. text-only fallback
- [ ] partial success 허용 여부 확정 (line 실패 시 text만 유지 등)

## B. Merge Join (`sum`)

### B1. Merge Lifecycle

- [ ] merge 진입 규칙 확정: `joinBarrier + joinPolicy=merge`에서 `unsplit` 강제
- [ ] merge 순서 확정:
  1. split panel 유지 상태 종료
  2. unsplit 애니메이션
  3. merged chart(`c3`) 표시
  4. sum draw 실행
- [ ] merge duration/easing 규격 확정

### B2. Sum Visual Semantics

- [ ] merged chart에서 sum 애니메이션 표현 규칙 확정:
  - 기존 bar stack-up
  - collapsed aggregate bar
  - 기타 표현 중 하나로 고정
- [ ] 색상 보존 규칙 확정 (원본 차트 색 유지/강조 색 전환)
- [ ] 최종 sum 텍스트 규칙 확정:
  - 값 포맷
  - bar top offset
  - chart bounds clipping 대응

### B3. Merge 이후 상태

- [ ] merge 이후 chartId/annotation scope 초기화 규칙 확정
- [ ] 이후 sentence에서 split 재진입 시 초기 상태 규칙 확정
- [ ] `Prev`/재실행 시 deterministic replay 조건 확정

## C. 차트 타입별 수용 기준

### C1. Bar 계열

- [ ] simple/grouped/stacked 모두 동일 join 정책 반영 확인
- [ ] split selector(`overlap`) 모드에서 panel 필터 독립 동작 확인
- [ ] merge sum 시 stacked/grouped 변환 상태에서도 시각 의미 유지 확인

### C2. Line 계열

- [ ] simple/multiple line split selector 모드 동작 확인
- [ ] line chart에서 scalar baseline anchor 추출 규칙 확정
- [ ] bridge line이 기존 series path와 충돌할 때 가독성 규칙 확정

## D. QA Acceptance Checklist

- [ ] 시나리오 1: `EU avg` vs `ASIA avg` -> `diff` (split 유지 + bridge + Δ)
- [ ] 시나리오 2: `EU count` + `ASIA count` -> total count (split 유지)
- [ ] 시나리오 3: `EU sum` + `ASIA sum` -> final `sum` (merge)
- [ ] 시나리오 4: `ASIA avg` vs `GLOBAL max` (selector overlap split + diff)
- [ ] 시나리오 5: unknown join op -> merge default
- [ ] sentence-step 재생 검증:
  - Start/Next/Prev에서 step 경계 일관성
  - 같은 sentence 분기 동시 실행
  - join barrier 순서 보장

## E. Implementation Tracking (Owner/Status)

- [ ] Backend: split/join rule table 고정 및 노출 (`execution_plan`)
- [ ] Backend: draw_plan 생성기에서 keep-split/merge 분기 완전 분리
- [ ] Frontend: sentence-step 실행기와 draw group 동기화
- [ ] Frontend: bridge/count/sum animation 디자인 토큰 적용
- [ ] Test: unit/integration/e2e 회귀 세트 고정
- [ ] Docs: API 계약(`/generate_grammar`, `/compile_ops_plan`) 예시 payload 업데이트
