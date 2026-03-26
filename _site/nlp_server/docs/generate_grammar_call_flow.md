# `/generate_grammar` 호출 흐름(코드 경로) 문서

이 문서는 `POST /generate_grammar` 요청이 들어왔을 때, **어떤 파일의 어떤 함수**를 거쳐 최종 OpsSpec(=grammar) DAG가 생성되는지 “코드 경로” 관점에서 정리합니다.

---

## 실행 환경(LLM/TLS) 설정

`/generate_grammar`는 서버 시작 시 `StructuredLLMClient` 백엔드를 고정합니다.

- 기본: `OPENAI_API_KEY`가 있으면 ChatGPT(OpenAI HTTP) 사용
- 강제 로컬: `LLM_BACKEND=ollama` 설정 시 로컬 Ollama 고정

권장 환경변수:

- OpenAI
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` (기본 `gpt-4o-mini`)
  - `OPENAI_BASE_URL` (기본 `https://api.openai.com/v1`)
- Ollama
  - `LLM_BACKEND=ollama`
  - `OLLAMA_MODEL`
  - `OLLAMA_BASE_URL`

TLS/인증서:

- HTTPS 호출 시 `SSL_CERT_FILE`이 지정되면 해당 CA 번들을 우선 사용합니다.
- `SSL_CERT_FILE`이 없으면 `certifi` CA 번들을 자동 사용하고, 없을 때만 Python 기본 trust store를 사용합니다.
- 운영/재현 테스트에서 SSL 우회(monkeypatch)는 사용하지 않습니다.

---

## 0) 전제: pipeline 인스턴스 생성/로딩

1) 서버 시작 시 FastAPI lifespan이 실행됩니다.
- 파일: `main.py`
- 함수: `lifespan(app)`

2) lifespan 내부에서 grammar pipeline을 만들고 `.load()`로 프롬프트/LLM client를 준비합니다.
- 파일: `main.py`
- 코드 위치: `lifespan(app)` 내부
  - `grammar_pipeline = OpsSpecPipeline(...)`
  - `grammar_pipeline.load()`
  - `app.state.grammar_pipeline = grammar_pipeline`

---

## 1) 엔드포인트: `/generate_grammar`

1) HTTP 요청을 받는 함수
- 파일: `main.py`
- 함수: `generate_grammar(request: GenerateGrammarRequest)`

2) `app.state.grammar_pipeline`에서 pipeline을 꺼내어 실행
- 파일: `main.py`
- 함수: `generate_grammar(...)`
- 호출: `pipeline.generate(question=..., explanation=..., vega_lite_spec=..., data_rows=..., request_id=..., debug=...)`

3) 응답은 **opsSpec group map + draw_plan + execution_plan**을 반환
- 파일: `main.py`
- 함수: `generate_grammar(...)`
- 동작:
  - `result.ops_spec`의 각 op를 `model_dump(...)`로 dict로 변환
  - `build_draw_ops_spec(...)` + `validate_draw_groups_payload(...)`로 `draw_plan` 생성/검증
  - `build_sentence_execution_plan(...)`로 sentence-step 실행 계획(`execution_plan`) 생성
  - 최종 응답: `{ "ops": [...], "ops2": [...], ..., "draw_plan": { ... }, "execution_plan": { "mode": "sentence-step", "steps": [...] } }`

---

## 1-1) 엔드포인트: `/compile_ops_plan` (ops-only 입력 실행용)

1) HTTP 요청을 받는 함수
- 파일: `main.py`
- 함수: `compile_ops_plan(request: CompileOpsPlanRequest)`

2) 입력 `ops_spec`을 deterministic 단계로 정규화 후 실행 가능한 draw 계약으로 변환
- 파일: `main.py`
- 함수: `compile_ops_plan(...)`
- 처리 순서:
  - `build_chart_context(...)`
  - `validate_and_parse_ops_spec_groups(...)`
  - `canonicalize_ops_spec_groups(...)`
  - `schedule_ops_spec(...)`
  - `build_draw_ops_spec(...)` + `validate_draw_groups_payload(...)`
  - `build_sentence_execution_plan(...)`

3) 응답
- `{ ops_spec, draw_plan, execution_plan, warnings }`
- 클라이언트가 `draw_plan` 없이 `ops`만 가진 JSON을 넣어도 sentence-step + split/join 규칙으로 바로 실행 가능

---

## 2) 핵심 구현: `OpsSpecPipeline.generate(...)`

entrypoint:
- 파일: `opsspec/modules/pipeline.py`
- 클래스/메서드: `OpsSpecPipeline.generate(...)`

### 2-1) Step 0 — ChartContext 구성 (deterministic)

- 파일: `opsspec/modules/pipeline.py`
- 메서드: `OpsSpecPipeline.generate(...)`
- 호출: `build_chart_context(vega_lite_spec, data_rows)`
  - 구현 파일: `opsspec/runtime/context_builder.py`
  - 출력: `(chart_context: ChartContext, context_warnings: list[str], rows_preview: list[dict])`

### 2-2) Step 1 — Inventory: S(O) 생성 (LLM + strict retry)

- 파일: `opsspec/modules/pipeline.py`
- 메서드: `OpsSpecPipeline.generate(...)`
- 호출(LLM):
  - `run_inventory_module(...)`
  - 구현 파일: `opsspec/modules/module_inventory.py`
  - 프롬프트: `prompts/opsspec_inventory.md`
  - 공통 규칙: `prompts/opsspec_shared_rules.md`

- 검증(계약 기반):
  - `validate_inventory(...)`
  - 구현 파일: `opsspec/validation/recursive_validators.py`
  - op 계약 생성: `build_ops_contract_for_prompt()`
    - 구현 파일: `opsspec/runtime/op_registry.py`

Inventory 결과가 스키마/validator를 통과하지 못하면:
- 파일: `opsspec/modules/pipeline.py`
- 메서드: `OpsSpecPipeline.generate(...)`
- 동작: validation feedback을 누적해 strict retry (`RECURSIVE_MAX_RETRIES`) 후 실패 시 RuntimeError

### 2-3) Step 2..N — Recursive loop (Step-Compose → Ground → Validate → Execute)

반복 entrypoint:
- 파일: `opsspec/modules/pipeline.py`
- 메서드: `OpsSpecPipeline.generate(...)`

각 step에서 수행하는 일:

1) Step-Compose (LLM + strict retry)
- 호출:
  - `run_step_compose_module(...)`
  - 구현 파일: `opsspec/modules/module_step_compose.py`
  - 프롬프트: `prompts/opsspec_step_compose.md`
  - 공통 규칙: `prompts/opsspec_shared_rules.md`

- 검증(계약 기반):
  - `validate_step_compose_output(...)`
  - 구현 파일: `opsspec/validation/recursive_validators.py`
  - 핵심: `id/meta/chartId` 금지, `{ "id":"nX" }` 객체 ref 금지, `"ref:nX"`만 허용,
    `inputs`는 이미 실행된 nodeId만, `ref:nX`도 이미 실행된 nodeId만.

2) Deterministic grounding (token/value normalize)
- 호출:
  - `ground_op_spec(op_spec, chart_context=...)`
  - 구현 파일: `opsspec/runtime/grounding.py`
  - 역할:
    - `@primary_measure/@primary_dimension/@series_field` 토큰 치환
    - categorical domain 값 정규화(exact → case-insensitive → difflib fuzzy)

3) DAG 메타/ID 결정론 부여 + scalar deps 추출
- 파일: `opsspec/modules/pipeline.py`
- 메서드: `OpsSpecPipeline.generate(...)`
- 규칙(요약):
  - `nodeId = n1,n2,...` (실행 순서)
  - `id = nodeId`
  - `meta.inputs = inputs ∪ (op_spec 내부 "ref:nX"에서 추출한 deps)` → dedupe/sort
  - `meta.sentenceIndex = task.sentenceIndex`
  - `meta.source = "recursive_step=<k>;taskId=<oX>"`
- scalar deps 추출 함수:
  - `extract_scalar_ref_deps(...)`
  - 구현 파일: `opsspec/runtime/artifacts.py`

4) OperationSpec 파싱 + 의미 검증
- 파싱:
  - `parse_operation_spec(...)`
  - 구현 파일: `opsspec/specs/union.py`
- 의미 검증:
  - `validate_operation(...)`
  - 구현 파일: `opsspec/validation/validators.py`

5) 실행(Executor) + artifact summary 생성
- 실행기:
  - `OpsSpecExecutor.execute(...)`
  - 구현 파일: `opsspec/runtime/executor.py`
  - 주의: executor는 “모르는 op”를 조용히 통과시키지 않고 `NotImplementedError`로 fail-fast 합니다.

- artifact summary:
  - `summarize_runtime_values(...)`
  - 구현 파일: `opsspec/runtime/artifacts.py`
  - 목적: 다음 step-compose prompting에 넣을 “현재까지의 결과 요약”을 결정론적으로 생성

반복 종료 조건:
- 남은 tasks(S(O))가 비면 종료
- `RECURSIVE_MAX_STEPS`를 넘기면 실패(RuntimeError)하고 남은 task를 디버그 payload에 남김

### 2-4) Normalize (stable IDs 유지)

재작성(canonicalize)으로 nodeId를 바꾸지 않고, `meta.inputs`만 최소 정규화합니다.
- 호출: `normalize_meta_inputs(groups)`
- 구현 파일: `opsspec/runtime/normalize.py`

---

## 3) Debug 번들 생성(옵션)

- 성공 케이스: `debug=true`일 때만 debug 번들을 저장합니다.
- 실패 케이스: debug 설정과 무관하게 원인 추적을 위한 `99_error.json` 번들을 저장합니다.

구현:
- 파일: `opsspec/modules/pipeline.py`
- 함수: `_persist_debug_bundle(payloads)`
- 저장 경로: `opsspec/debug/<MMddhhmm>/`

---

## 4) 관련 프롬프트 파일

- shared rules: `prompts/opsspec_shared_rules.md`
- inventory: `prompts/opsspec_inventory.md`
- step-compose: `prompts/opsspec_step_compose.md`
