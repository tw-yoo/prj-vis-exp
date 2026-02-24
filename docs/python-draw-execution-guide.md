# Python Draw Plan 생성/실행 가이드

이 문서는 아래 목표를 기준으로 작성되었습니다.

- Python(`nlp_server`)에서 자연어를 처리해 draw plan JSON을 생성
- 생성된 JSON을 Web Workbench(TypeScript)에서 읽어서 실제 draw 실행

---

## 1. 전체 흐름

1. `POST /generate_grammar` 호출
2. Python 파이프라인이 `ops_spec`를 만든 뒤 draw plan으로 변환
3. draw plan을 정적 JSON으로 저장
   - `public/generated/draw_plans/latest.json`
   - `public/generated/draw_plans/<request_id>.json`
4. Workbench에서 `Apply Python Draw Plan` 버튼으로 JSON 로드 후 실행

핵심 코드 위치:

- Python 파이프라인: `nlp_server/opsspec/pipeline.py`
- Draw 변환기: `nlp_server/draw_plan/build_draw_plan.py`
- Draw JSON export: `nlp_server/draw_plan/export_static.py`
- Workbench loader: `web/workbench/services/pythonDrawPlan.ts`
- Workbench 실행 버튼: `web/workbench/pages/ChartWorkbenchPage.tsx`

---

## 2. 실행 준비

프로젝트 루트:

`/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp`

### 2.1 Python 서버 실행

```bash
cd /Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server

# OpenAI 기본 사용 (권장)
export OPENAI_API_KEY="<YOUR_KEY>"
export OPENAI_MODEL="gpt-4o-mini"   # 선택
# export LLM_BACKEND="openai"        # 선택 (강제 지정 시)

python main.py
```

주의:

- 서버는 startup에서 `NLPEngine`도 함께 로드합니다.
- 환경에 따라 `fastapi`, `uvicorn`, `pydantic`, `stanza` 등이 필요할 수 있습니다.

### 2.2 Web Workbench 실행

```bash
cd /Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp
npm run dev
```

---

## 3. `generate_grammar` 요청 예시

요청 파일 예시(`request_draw_test.json`):

```json
{
  "question": "Which months are above average in both rain and sun?",
  "explanation": "Compute the average of count for rain and for sun across all months. Filter months where each is above its own average. Take the intersection of the two month sets.",
  "vega_lite_spec": {
    "mark": "bar",
    "encoding": {
      "x": { "field": "month", "type": "ordinal" },
      "y": { "field": "count", "type": "quantitative" },
      "color": { "field": "weather", "type": "nominal" }
    }
  },
  "data_rows": [
    { "month": "Jan", "weather": "rain", "count": 10 },
    { "month": "Feb", "weather": "rain", "count": 20 },
    { "month": "Mar", "weather": "rain", "count": 30 },
    { "month": "Jan", "weather": "sun", "count": 12 },
    { "month": "Feb", "weather": "sun", "count": 16 },
    { "month": "Mar", "weather": "sun", "count": 18 }
  ],
  "debug": true
}
```

호출:

```bash
curl -X POST "http://localhost:3000/generate_grammar" \
  -H "Content-Type: application/json" \
  -d @request_draw_test.json
```

응답은 최소 형태로 `{"ops1": ...}`만 반환됩니다.

---

## 4. 생성 산출물 확인

`/generate_grammar` 성공 시 확인할 파일:

1. Draw plan(Workbench가 읽는 파일)
   - `public/generated/draw_plans/latest.json`
   - `public/generated/draw_plans/<request_id>.json`

2. 디버그 번들
   - `nlp_server/debug/MMddhhmm/06_draw_plan.json`
   - `nlp_server/debug/MMddhhmm/05_final_grammar.json`
   - `nlp_server/debug/MMddhhmm/07_tree_ops_spec.dot`
   - `nlp_server/debug/MMddhhmm/07_tree_ops_spec.png` (Graphviz 설치 시)

---

## 5. Workbench에서 draw 실행

1. Workbench에서 Vega-Lite spec 렌더 (`Render Chart`)
2. `Apply Python Draw Plan` 클릭
3. 내부에서 `/generated/draw_plans/latest.json`을 읽어 draw op 실행

코드상 실행 경로:

- 로드: `fetchLatestPythonDrawPlan()` in `web/workbench/services/pythonDrawPlan.ts`
- 실행: `runChartOps(..., { ops: loaded.ops })` in `web/workbench/pages/ChartWorkbenchPage.tsx`

---

## 6. 실패 시 점검 순서

### 6.1 `latest.json`이 안 생김

1. `nlp_server` 로그 확인
2. 에러 리포트 확인:
   - `data/expert_prompt_reports/generate_grammar_error_*.txt`
3. 디버그 폴더 확인:
   - `nlp_server/debug/MMddhhmm/99_error.json`

### 6.2 draw는 생성됐는데 화면에 변화가 없음

1. `public/generated/draw_plans/latest.json`에서 `ops` 배열이 비어있는지 확인
2. `nlp_server/debug/.../06_draw_plan.json` 확인
3. 입력 `ops_spec`가 scalar/target 결과를 실제로 만드는지 확인
   - scalar 계열(`average`, `sum`, `count`, `diff`)은 기준선(line)으로 변환
   - target 계열(`filter`, `retrieveValue`, `findExtremum`, `nth`, `setOp`)은 highlight로 변환

### 6.3 트리 PNG가 없음

- Graphviz(`dot`) 미설치 가능성이 큽니다.
- 이 경우 `.dot` 파일만 생성되고, 경고 파일이 남습니다.

---

## 7. 변환 규칙을 수정하려면

- draw 액션 매핑 수정: `nlp_server/draw_plan/build_draw_plan.py`
- draw op 스키마 수정: `nlp_server/draw_plan/models.py`
- export 경로/포맷 수정: `nlp_server/draw_plan/export_static.py`

권장:

- 규칙 수정 후 `nlp_server/opsspec/tests/test_draw_plan.py`를 먼저 갱신/실행해서 회귀를 막는 방식으로 작업

