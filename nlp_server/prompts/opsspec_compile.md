Task: Module-3 Compile.

Compile grounded_plan_tree into final OpsSpec group map.
Return JSON only.

Shared rules:
$shared_rules

Output Schema:
{
  "ops_spec": {
    "<groupName>": [OperationSpec]
  },
  "warnings": ["string"]
}

Strict contract:
- Use legacy op names only + setOp.
- Keep legacy flat parameter shape (no nested args object).
- Do not output null keys.
- Do not output unknown keys.
- Use exact field names from chart_context.fields only.
- Generic field names like "value" and "category" are forbidden.
- If uncertain, pick the safest valid op and add warning.
- For cross-node scalar references in fields like filter.value, diff.targetA/targetB, compare.targetA/targetB:
  - use string refs like "ref:n1"
  - never output {"id":"n1"} objects

Mapping rule (CRITICAL):
- For EACH node in grounded_plan_tree.nodes, you MUST emit exactly one OperationSpec in:
  - ops_spec[node.group]
- Do NOT invent extra nodes not present in grounded_plan_tree.
- Do NOT omit nodes from grounded_plan_tree.
- Each emitted OperationSpec MUST preserve:
  - meta.nodeId == node.nodeId
  - meta.sentenceIndex == node.sentenceIndex
  - meta.inputs includes node.inputs (and also include any ref:nX dependencies if they exist in params)

Operation contract (required/optional/forbidden + semantic rules):
$ops_contract_json

Validation feedback from previous failed compile attempts:
$validation_feedback_json

Critical rules:
1) filter mode:
   - membership mode: include/exclude only
   - comparison mode: operator + value only
   - never mix both
2) average/sum:
   - field must be a numeric measure field in chart_context
3) setOp:
   - op must be "setOp"
   - fn must be "intersection" or "union"
   - meta.inputs must reference at least two prior nodeIds
5) sentence-layer metadata:
   - meta.sentenceIndex is required for every op
   - meta.sentenceIndex must match the group name:
     - group "ops" -> sentenceIndex=1
     - group "ops{k}" -> sentenceIndex=k
4) series selector values:
   - if selector maps to series field domain, prefer group="<value>" over include/exclude

Positive examples (shape only):
Example A (sentence-layer, 3 sentences: averages -> filters -> intersection):
{
  "ops_spec": {
    "ops": [
      { "op": "average", "field": "Revenue_Million_Euros", "group": "Broadcasting", "id": "n1", "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 } },
      { "op": "average", "field": "Revenue_Million_Euros", "group": "Commercial",   "id": "n2", "meta": { "nodeId": "n2", "inputs": [], "sentenceIndex": 1 } }
    ],
    "ops2": [
      { "op": "filter", "field": "Revenue_Million_Euros", "operator": ">", "value": "ref:n1", "group": "Broadcasting", "id": "n3", "meta": { "nodeId": "n3", "inputs": ["n1"], "sentenceIndex": 2 } },
      { "op": "filter", "field": "Revenue_Million_Euros", "operator": ">", "value": "ref:n2", "group": "Commercial",   "id": "n4", "meta": { "nodeId": "n4", "inputs": ["n2"], "sentenceIndex": 2 } }
    ],
    "ops3": [
      { "op": "setOp", "fn": "intersection", "id": "n5", "meta": { "nodeId": "n5", "inputs": ["n3", "n4"], "sentenceIndex": 3 } }
    ]
  },
  "warnings": []
}

Example A2 (ref:nX scalar reference in filter comparison mode, and meta.inputs includes the referenced node):
{
  "ops_spec": {
    "ops": [
      { "op": "average", "field": "Revenue_Million_Euros", "group": "Broadcasting", "id": "n1", "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 } }
    ],
    "ops2": [
      { "op": "filter", "field": "Revenue_Million_Euros", "operator": ">", "value": "ref:n1", "group": "Broadcasting", "id": "n2", "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 } }
    ]
  },
  "warnings": []
}

Example B:
{
  "ops_spec": {
    "ops": [
      { "op": "filter", "field": "Season", "include": ["2016/17", "2017/18"], "id": "n1", "meta": { "nodeId": "n1", "inputs": [], "sentenceIndex": 1 } }
    ],
    "ops2": [
      { "op": "average", "field": "Revenue_Million_Euros", "id": "n2", "meta": { "nodeId": "n2", "inputs": ["n1"], "sentenceIndex": 2 } }
    ]
  },
  "warnings": []
}

Negative examples (forbidden):
- { "op": "filter", "field": "Season", "include": ["2016/17"], "operator": ">", "value": 10 }
- { "op": "average", "field": "value" }
- { "op": "filter", "field": "category", "include": ["Broadcasting"] } when category is not a chart field name
- { "op": "filter", "field": "Revenue_Million_Euros", "operator": ">", "value": {"id":"n1"} }

Grounded plan tree:
$grounded_plan_tree_json

Chart context:
$chart_context_json
