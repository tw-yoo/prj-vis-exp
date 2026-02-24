# Python Draw Plan 생성/실행 가이드

이 문서는 아래 목표를 기준으로 작성되었습니다.

- Python(`nlp_server`)에서 자연어를 처리해 draw plan을 생성
- Workbench(TypeScript)에서 draw plan을 실행
- JSON 수동 작성 없이 `data/expert/**/*.py` 시나리오를 직접 실행

---

## 1. 전체 흐름

1. `POST /generate_grammar` 또는 `POST /run_python_plan` 호출
2. Python 파이프라인이 `ops_spec`를 만든 뒤 draw plan으로 변환
3. draw plan을 정적 JSON으로 저장
   - `public/generated/draw_plans/latest.json`
   - `public/generated/draw_plans/<request_id>.json`
4. Workbench에서 두 가지 방식 중 하나로 실행
   - `Apply Python Draw Plan` 버튼: `latest.json` 로드
   - `Ops Plan` + `Load`: `.py` 시나리오를 서버에서 실행해 즉시 로드

핵심 코드 위치:

- Python 파이프라인: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server/opsspec/pipeline.py`
- Python 시나리오 로더: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server/opsspec/python_scenario_loader.py`
- Draw 변환기: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server/draw_plan/build_draw_plan.py`
- Draw JSON export: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server/draw_plan/export_static.py`
- Python plan API client: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/src/api/python-plan.ts`
- Workbench 분기/실행: `/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/web/workbench/pages/ChartWorkbenchPage.tsx`

---

## 2. 실행 준비

프로젝트 루트:

`/Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp`

### 2.1 Python 서버 실행

```bash
cd /Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp/nlp_server

export OPENAI_API_KEY="<YOUR_KEY>"
export OPENAI_MODEL="gpt-4o-mini"   # optional

python main.py
```

### 2.2 Web Workbench 실행

```bash
cd /Users/taewon_1/Desktop/vis-exp/explainable_chart_qa/prj-vis-exp/prj-vis-exp
npm run dev
```

---

## 3. Python 시나리오 파일(`.py`) 계약

위치:

- `data/expert/**/xxx.py`

필수 계약(둘 중 하나):

1. `def build_request() -> dict`
2. `REQUEST = {...}`

dict 필드:

- `question: str`
- `explanation: str`
- `vega_lite_spec: dict`
- `data_rows: list[dict]`
- `debug: bool` (optional)

예시:

```python
def build_request():
    return {
        "question": "Which months are above average in both rain and sun?",
        "explanation": "Compute the average of count for rain and for sun across all months. Filter months where each is above its own average. Take the intersection of the two month sets.",
        "vega_lite_spec": {
            "mark": "bar",
            "encoding": {
                "x": {"field": "month", "type": "ordinal"},
                "y": {"field": "count", "type": "quantitative"},
                "color": {"field": "weather", "type": "nominal"}
            }
        },
        "data_rows": [
            {"month": "Jan", "weather": "rain", "count": 10},
            {"month": "Feb", "weather": "rain", "count": 20},
            {"month": "Mar", "weather": "rain", "count": 30},
            {"month": "Jan", "weather": "sun", "count": 12},
            {"month": "Feb", "weather": "sun", "count": 16},
            {"month": "Mar", "weather": "sun", "count": 18}
        ],
        "debug": True
    }
```

---

## 4. API

### 4.1 `POST /run_python_plan`

요청:

```json
{
  "scenario_path": "data/expert/e1/sample_scenario.py",
  "debug": false
}
```

응답:

```json
{
  "scenario_path": "data/expert/e1/sample_scenario.py",
  "vega_lite_spec": { "...": "..." },
  "draw_plan": { "ops": [ { "op": "draw", "action": "..." } ] },
  "warnings": []
}
```

### 4.2 `POST /generate_grammar` (기존)

`question/explanation/spec/data_rows`를 직접 보내고 `{"ops1": ...}`를 받는 기존 경로도 유지됩니다.

---

## 5. Workbench에서 실행

방법 A: 최신 draw JSON 적용

1. `Render Chart`
2. `Apply Python Draw Plan`
3. `/generated/draw_plans/latest.json`을 읽어 실행

방법 B: Python 시나리오 직접 실행

1. `Ops Plan` 입력창에 `.py` 경로 입력
   - 예: `data/expert/e1/sample_scenario.py`
2. `Load` 클릭
3. 내부에서 `/run_python_plan` 호출
4. 반환된 `vega_lite_spec`/`draw_plan`을 즉시 반영
5. `Start`/`Next`로 그룹 실행

---

## 6. 산출물 확인

성공 시 확인 파일:

1. Draw plan
   - `public/generated/draw_plans/latest.json`
   - `public/generated/draw_plans/<request_id>.json`
2. Debug bundle
   - `nlp_server/debug/MMddhhmm/06_draw_plan.json`
   - `nlp_server/debug/MMddhhmm/05_final_grammar.json`
   - `nlp_server/debug/MMddhhmm/07_tree_ops_spec.dot`
   - `nlp_server/debug/MMddhhmm/07_tree_ops_spec.png` (Graphviz 설치 시)

---

## 7. 실패 시 점검

### 7.1 `.py` 시나리오 Load 실패

1. `scenario_path`가 `data/expert` 하위 `.py`인지 확인
2. `build_request()` 또는 `REQUEST`가 있는지 확인
3. 필수 필드 누락 여부 확인
4. 에러 리포트 확인:
   - `data/expert_prompt_reports/run_python_plan_error_*.txt`

### 7.2 draw plan은 있는데 화면 변화가 없음

1. `public/generated/draw_plans/latest.json`에서 `ops` 비었는지 확인
2. `nlp_server/debug/.../06_draw_plan.json` 확인
3. upstream `ops_spec`가 실제 scalar/target 결과를 만드는지 확인

### 7.3 트리 PNG가 없음

Graphviz(`dot`) 미설치 시 `.dot`만 생성되고 경고 파일이 남습니다.

