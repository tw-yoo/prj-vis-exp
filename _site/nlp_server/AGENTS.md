# nlp_server 역할/계약 문서 (For Other AI Agents)

이 문서는 다른 AI Agent에게 `nlp_server`가 프로젝트에서 어떤 역할을 하는지, 어떤 입력을 받아 무엇을 출력하는지, 그리고 내부 파이프라인이 어떻게 구성되어 있는지를 **구체적으로** 설명하기 위한 문서입니다.

---

## 0) AI Agent 개발 명령 (연구용 최소 구현 원칙)

아래는 이 repo에서 `nlp_server`를 수정/확장하는 AI Agent에게 주는 **명령**입니다.

1. 최소한의 기능을 만들 것.
   - 이 코드는 연구를 위한 코드이므로 “기능 확장”을 전제로 과도한 설계를 하지 말 것.
   - 목표는 빠르게 가설을 검증할 수 있는 **MVP 파이프라인**을 유지하는 것.
2. 코드의 재사용성을 고려할 것.
   - 규칙/계약/프롬프트는 중복 작성하지 말고 한 곳에서 관리할 것(예: shared rules).
3. 코드의 가독성을 고려할 것.
   - 작은 함수, 명확한 타입, 명확한 파일 경계를 유지할 것.
4. 응답은 한국어로 할 것.

연구용 코드 품질을 위해 추가로 필요한 명령:
1. 재현 가능성(Reproducibility)을 최우선으로 할 것.
   - LLM 호출은 `temperature=0` 유지(`StructuredLLMClient` 기본).
   - 출력은 **스키마 검증 + 계약 기반 validator + 결정론적 정규화**로 안정화할 것.
     - 중요: 이 파이프라인은 nodeId를 재작성(canonicalize)하지 않고, 실행 순서대로 `n1,n2,...`를 부여한다.
   - `OPENAI_MODEL`/backend, 프롬프트 경로+해시, 입력/중간 산출물을 debug 번들에 남겨 추적 가능하게 할 것.
2. 일반화 가능성(Generalizability)을 최우선으로 할 것.
   - 특정 데이터셋/특정 질문 패턴에만 맞춘 하드코딩을 피할 것.
   - 규칙 추가가 필요하면 “한 케이스 예외 처리” 대신, contract/validator 레벨에서 일관 규칙으로 추가할 것.
3. 변경 범위를 최소화하고, 실패는 빠르게 드러나게 할 것.
   - 스키마/validator 위반은 조용히 무시하지 말고 실패(또는 strict retry)시키며, debug 번들에 원인 기록.
4. 의존성 추가는 신중하게 할 것.
   - 가능한 표준 라이브러리로 해결하고(예: DOT 렌더는 graphviz CLI), 필수일 때만 의존성을 추가.

---

## 1) nlp_server의 핵심 역할 (한 줄 정의)

`nlp_server`는 **(question + explanation) 자연어 텍스트**와 **Vega-Lite spec + data rows**를 입력으로 받아, 최종적으로 **OpsSpec(=grammar)** DAG를 생성해서 반환하는 서버입니다.

- 출력 OpsSpec은 “legacy operation set(비-드로우)” 기반이며, 각 op에 `meta.nodeId` / `meta.inputs`가 포함되어 DAG를 복원할 수 있습니다.
- `/generate_grammar`는 웹/TS가 쉽게 소비할 수 있도록 **opsSpec group map + draw_plan**을 함께 반환합니다:
  - `{ "ops": [...], "ops2": [...], ..., "draw_plan": { "ops": [ { "op":"draw", ... } ], ... } }`

---

## 2) nlp_server가 “하는 일” / “하지 않는 일”

### 하는 일
1. **차트 컨텍스트 구성(결정론)**
   - Vega-Lite encoding + data rows로부터
     - `primary_dimension`, `primary_measure`, `series_field`
     - categorical domain(값 목록), numeric stats
     - chart mark / stacked 여부
   - 를 구성해서 LLM grounding의 안정성을 높입니다.

2. **Recursive Grammar 파이프라인 실행**
   - Module A: Inventory — explanation에서 S(O)=연산 태스크 집합을 생성(LLM + strict retry)
   - Module B: Step-Compose — 남은 태스크 중 “다음 1개 노드(op_spec + inputs)”를 제안(LLM + strict retry)
   - 이후는 결정론적으로:
     - grounding(token/value normalize) → 계약/의미 검증 → 실행 → artifact summary 갱신
   - S(O)가 빌 때까지 반복합니다.

3. **엄격 검증 + 재시도(strict retry)**
   - LLM이 잘못된 JSON/스키마/계약을 출력하면 validation feedback을 넣어 재시도합니다.

4. **디버깅 번들 저장 + 트리 시각화**
   - `debug=true`인 요청(또는 실패한 요청)은 `opsspec/debug/<MMddhhmm>/`에 단계별 JSON을 저장합니다.
   - final OpsSpec을 DOT(+가능하면 SVG/PNG)로 렌더링해서 저장합니다.

### 하지 않는 일
1. **실제 시각화 렌더링 엔진 구현**
   - Python은 draw plan(JSON) 생성까지 담당하고, 실제 렌더링은 TS Workbench가 담당.
2. **차트 데이터의 대규모 truncation/cap**
   - 현재 가정: `data_rows < 500`.
3. **정답 검증용 추가 LLM**
   - OpsSpec 생성 이후 “답이 맞는지”를 재검증하는 추가 LLM 단계는 MVP 범위 밖입니다.

---

## 3) Public API (FastAPI)

Endpoint 구현:
- `main.py`

요청/응답 모델:
- `models.py`

주요 엔드포인트:
- `GET /health`
- `GET /op_registry` (op 계약/스키마 힌트)
- `POST /generate_grammar` (recursive pipeline, opsSpec + draw_plan 응답)
- `POST /run_module_trace` (inventory + steps + ops_spec + trace 반환)
- `POST /run_python_plan` (시나리오 파일로 grammar+draw plan 생성)
- `POST /canonicalize_opsspec` (별도 유틸; pipeline 내부에서는 id 재작성 canonicalize를 사용하지 않음)
- `POST /generate_lambda` (별도 레거시 경로; grammar 파이프라인과 분리)

---

## 4) Recursive Grammar 파이프라인 (구현 상세)

오케스트레이터:
- `opsspec/modules/pipeline.py`

### 4.0 Context Builder (deterministic)
- `opsspec/runtime/context_builder.py`

### 4.1 Inventory (LLM)
- 모듈: `opsspec/modules/module_inventory.py`
- 프롬프트: `prompts/opsspec_inventory.md`
- 스키마: `opsspec/core/recursive_models.py`
- 검증: `opsspec/validation/recursive_validators.py` (`validate_inventory`)

### 4.2 Step-Compose (LLM)
- 모듈: `opsspec/modules/module_step_compose.py`
- 프롬프트: `prompts/opsspec_step_compose.md`
- 검증: `opsspec/validation/recursive_validators.py` (`validate_step_compose_output`)

### 4.3 Grounding / Validation / Execution (deterministic)
- Grounding(token/value normalize):
  - `opsspec/runtime/grounding.py`
- op 계약(prompt/validator에 주입되는 단일 지식원):
  - `opsspec/runtime/op_registry.py` (`build_ops_contract_for_prompt`)
- Union 파싱:
  - `opsspec/specs/union.py`
- 의미 검증:
  - `opsspec/validation/validators.py`
- 실행기:
  - `opsspec/runtime/executor.py`
  - **모르는 op는 `NotImplementedError`로 fail-fast** (op 추가 시 누락을 바로 드러내기 위함)
- artifact summary(ref 스캔 포함):
  - `opsspec/runtime/artifacts.py`
- meta.inputs 결정론 정규화(IDs 유지):
  - `opsspec/runtime/normalize.py`

### 4.4 shared rules (프롬프트 공통 규칙)
- `prompts/opsspec_shared_rules.md`
  - `"ref:nX"` 문자열 ref만 허용, `{ "id": "nX" }` 금지
  - Step-Compose는 `id/meta/chartId` 출력 금지(파이프라인이 결정론적으로 부여)
  - group은 sentence layer이며 series branch가 아님

---

## 5) OpsSpec(=Grammar) 모델 구조

- op별 모델: `opsspec/specs/`
- Union: `opsspec/specs/union.py`

공통 필드:
- `op`, `id`, `meta(nodeId, inputs, sentenceIndex, source, ...)`, `chartId`

Tree/DAG 연결:
- `meta.nodeId`: 노드 ID (`n<digits>`)
- `meta.inputs`: 부모 노드 nodeId 목록(의존관계 edge)

Cross-node scalar reference:
- `"ref:nX"` 문자열로만 표현

---

## 6) Debug 번들(연구 재현성)

`debug=true`일 때 성공 요청은 번들을 저장하고, 실패한 요청은 debug 설정과 무관하게 원인 추적을 위한 `99_error.json` 번들을 남깁니다.

저장 위치:
- `opsspec/debug/<MMddhhmm>/`

대표 파일:
- `00_request.json`, `01_context.json`, `02_inventory.json`
- per-step: `03_step_01_compose.json`, `04_step_01_grounded.json`, `05_step_01_op.json`, `06_step_01_exec.json`
- `90_final_grammar.json`
- `91_tree_ops_spec.dot` (+ Graphviz 있으면 `.svg/.png`)
- `95_draw_plan.json` (옵션), `99_error.json` (실패 시)

---

## 7) operation 추가 시 변경해야 하는 “유일한” 코드 포인트(명문화)

새 op 추가 시 최소 변경 포인트:
1) Spec 모델 추가: `opsspec/specs/<new_op>.py`
2) Union 등록: `opsspec/specs/union.py`
3) 계약 등록: `opsspec/runtime/op_registry.py`
4) 의미 검증 추가: `opsspec/validation/validators.py`
5) 실행기 구현: `opsspec/runtime/executor.py`

원칙:
- pipeline/recursive validators는 계약(JSON)을 동적으로 사용하므로, op_registry만 업데이트하면 prompt/validator에 자동 반영되도록 유지합니다.
