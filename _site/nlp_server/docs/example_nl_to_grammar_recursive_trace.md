# 예시 1개로 보는 전체 변환 추적: 자연어 → S(O) → step 1..N → OpsSpec(DAG)

이 문서는 “recursive grammar pipeline”이 실제로 어떤 중간 산출물을 만들면서 최종 OpsSpec(=grammar) DAG를 완성하는지, **작은 예시 1개**로 보여주기 위한 문서입니다.

관련 구현:
- Pipeline: `opsspec/modules/pipeline.py`
- Inventory module: `opsspec/modules/module_inventory.py`
- Step-Compose module: `opsspec/modules/module_step_compose.py`

---

## 0) 입력(예시)

Question:
- “Which season in Broadcasting has revenue higher than the Broadcasting average?”

Explanation (2 sentences):
1) “Compute the average revenue for Broadcasting.”
2) “Filter Broadcasting seasons whose revenue is greater than that average, then pick the maximum season.”

---

## 1) Step 0 — ChartContext (deterministic)

Pipeline은 `vega_lite_spec + data_rows`로부터 `ChartContext`를 결정론적으로 구성합니다.

- 구현: `opsspec/runtime/context_builder.py`

예시(요약):
```json
{
  "primary_dimension": "season",
  "primary_measure": "Revenue_Million_Euros",
  "series_field": "category",
  "categorical_values": { "category": ["Broadcasting", "Commercial"] }
}
```

---

## 2) Module — Inventory: S(O) 생성 (LLM + strict retry)

Inventory는 explanation에서 언급된 “연산 태스크”들을 뽑아 **S(O)=tasks[]**를 만듭니다.

- 프롬프트: `prompts/opsspec_inventory.md`
- 출력 스키마: `opsspec/core/recursive_models.py` (`OpInventory`)

예시 출력(요약):
```json
{
  "tasks": [
    {
      "taskId": "o1",
      "op": "average",
      "sentenceIndex": 1,
      "mention": "average revenue for Broadcasting",
      "paramsHint": { "field": "@primary_measure", "group": "Broadcasting" }
    },
    {
      "taskId": "o2",
      "op": "filter",
      "sentenceIndex": 2,
      "mention": "revenue greater than that average (Broadcasting)",
      "paramsHint": { "field": "@primary_measure", "operator": ">", "value": "ref:n1", "group": "Broadcasting" }
    },
    {
      "taskId": "o3",
      "op": "findExtremum",
      "sentenceIndex": 2,
      "mention": "pick the maximum season",
      "paramsHint": { "which": "max", "field": "@primary_measure" }
    }
  ],
  "warnings": []
}
```

중요:
- taskId는 요청 내에서 유니크해야 하며(`o<digits>`), `paramsHint`는 flat만 허용됩니다(validator가 강제).

---

## 3) Recursive loop: Step-Compose → Ground → Validate → Execute

각 step은 “남은 tasks + 현재까지 실행된 노드들의 artifact summary”를 보고, 다음 1개 노드를 제안합니다.

### Step 1) task o1 실행 → n1 생성

Step-Compose 출력(요약):
```json
{
  "pickTaskId": "o1",
  "op_spec": { "op": "average", "field": "@primary_measure", "group": "Broadcasting" },
  "inputs": []
}
```

Grounding(결정론):
- `@primary_measure → Revenue_Million_Euros`

Pipeline이 최종 OperationSpec을 확정할 때(요약):
- `nodeId=id="n1"`
- `groupName="ops"` (sentenceIndex=1)
- `meta.inputs=[]`
- `meta.source="recursive_step=1;taskId=o1"`

### Step 2) task o2 실행 → n2 생성 (ref:n1 사용)

Step-Compose 출력(요약):
```json
{
  "pickTaskId": "o2",
  "op_spec": {
    "op": "filter",
    "field": "@primary_measure",
    "operator": ">",
    "value": "ref:n1",
    "group": "Broadcasting"
  },
  "inputs": []
}
```

Pipeline은 op_spec 내부의 `"ref:n1"`를 스캔해서 scalar dependency를 추출하고, `meta.inputs`에 자동 포함합니다.

Pipeline이 확정하는 meta(요약):
- `nodeId=id="n2"`
- `groupName="ops2"` (sentenceIndex=2)
- `meta.inputs=["n1"]` (scalar ref dependency)
- `meta.source="recursive_step=2;taskId=o2"`

### Step 3) task o3 실행 → n3 생성 (data parent로 n2 사용)

Step-Compose 출력(요약):
```json
{
  "pickTaskId": "o3",
  "op_spec": { "op": "findExtremum", "which": "max", "field": "@primary_measure", "group": "Broadcasting" },
  "inputs": ["n2"]
}
```

Pipeline이 확정하는 meta(요약):
- `nodeId=id="n3"`
- `groupName="ops2"`
- `meta.inputs=["n2"]`
- `meta.source="recursive_step=3;taskId=o3"`

---

## 4) 최종 OpsSpec group map(요약)

최종 응답(`/generate_grammar`)은 group map만 반환합니다:
```json
{
  "ops": [
    { "op": "average", "field": "Revenue_Million_Euros", "group": "Broadcasting", "id": "n1", "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1, "source": "recursive_step=1;taskId=o1" } }
  ],
  "ops2": [
    { "op": "filter", "field": "Revenue_Million_Euros", "operator": ">", "value": "ref:n1", "group": "Broadcasting", "id": "n2", "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2, "source": "recursive_step=2;taskId=o2" } },
    { "op": "findExtremum", "field": "Revenue_Million_Euros", "which": "max", "group": "Broadcasting", "id": "n3", "meta": { "nodeId": "n3", "inputs": ["n2"], "sentenceIndex": 2, "source": "recursive_step=3;taskId=o3" } }
  ]
}
```

---

## 5) debug=true일 때 저장되는 번들

저장 위치:
- `opsspec/debug/<MMddhhmm>/`

대표 파일:
- `00_trace.md` (inventory 변화 + step별 트리 스냅샷)
- `00_request.json`, `01_context.json`, `02_inventory.json`
- `03_step_01_compose.json` / `04_step_01_grounded.json` / `05_step_01_op.json` / `06_step_01_exec.json`
- `90_final_grammar.json`
- `91_tree_ops_spec.dot` (+ Graphviz가 있으면 `.svg/.png`)
