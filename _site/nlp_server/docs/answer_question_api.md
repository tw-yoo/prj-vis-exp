# Chart QA Answer API (`/answer_question`)

이 문서는 `nlp_server`에 추가된 “차트 QA 답변” API를 설명합니다.

## 목적

- 입력: `question` + `vega_lite_spec` + `data_rows`
- 출력: (1) 최소 계획(`plan`) (2) 정답(`answer`) (3) 차트 읽기 스타일 설명(`explanation`)

LLM 응답은 “차트를 렌더링해서 보고 있는 것처럼” 축/범례/시리즈/마크 언어로 작성되도록 프롬프트를 구성합니다.

## 구현 위치

- Endpoint: `main.py`
  - `POST /answer_question`
- Pipeline: `opsspec/modules/answer_pipeline.py`
- Prompt template: `prompts/chart_answer.md`

## Request schema

```json
{
  "question": "string",
  "vega_lite_spec_path": "data/test/spec/bar_stacked_ver.json",
  "data_csv_path": "data/test/data/bar_stacked_ver.csv",
  "llm": "chatgpt",
  "debug": false
}
```

- Choose `"chatgpt"` (default) or `"gemini"` for `llm`. Gemini requires `GEMINI_API_KEY` in the environment (and optionally `GEMINI_MODEL`, default `models/text-bison-001`); the backend calls Google’s Generative Language API when you request `llm=gemini`.
- 경로는 기본적으로 프로젝트 루트 디렉토리 내부 파일만 허용합니다(임의의 시스템 파일 읽기 방지).

## Response schema

```json
{
  "plan": ["string"],
  "answer": "string",
  "explanation": "string",
  "warnings": ["string"],
  "request_id": "string"
}
```

## Debug 번들 (`debug=true`)

`debug=true`로 호출하면, pipeline이 요청별 스냅샷을 저장합니다.

- 저장 위치: `opsspec/debug_answers/<MMddhhmm>/`
- 대표 파일:
  - `00_request.json`
  - `01_context.json` (ChartContext + rows preview)
  - `02_prompt.json` (system/user prompt + backend/config)
- `03_response.json`
- `99_error.json` (실패한 경우)

## Module trace helper (`/run_module_trace`)

`/run_module_trace` accepts the same metadata (question, explanation, Vega-Lite JSON path, CSV path) and returns the recursive-pipeline trace plus the final grammar.

Its response contains:
- `inventory`: extracted tasks S(O)
- `steps`: recursive step traces (picked taskId, nodeId, grounded op_spec summary, artifact summary, ...)
- `ops_spec`: final OpsSpec group map
- `trace`: the full structured trace payload

---

## specTest Export/Import bundle (gold JSON)

specTest 페이지에서 `Download Spec`로 내려받는 JSON은 “gold bundle”로, 차트/질문/설명 + OpsSpec(=grammar)을 함께 묶어 저장합니다.

### Bundle version 2 (현재)

`version: 2`부터는 Import 시 sentence(lane 문장)가 유실되지 않도록 **sentence 메타를 sidecar로 포함**합니다.

- `explanation`: 원문 explanation 텍스트(있으면 그대로)
- `explanation_sentences: string[]`: explanation을 sentence split한 결과(참고용)
- `group_sentences: Record<string,string>`: `ops/ops2/ops3...` 각 group(=sentenceIndex)에 대응하는 문장 텍스트
- `node_sentences: Record<string,string>`: `meta.nodeId`별로 대응되는 문장 텍스트(디버깅/이해용)

주의:
- 이 메타는 **backend(`/generate_grammar`) 응답 스키마를 바꾸지 않고**, specTest의 export/import JSON에만 추가됩니다.
