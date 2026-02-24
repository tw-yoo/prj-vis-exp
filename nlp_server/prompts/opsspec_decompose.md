Task: Module-1 Decompose.

Given an English question + explanation and chart context, output a node-level plan tree.
Return JSON only.

Shared rules:
$shared_rules

High-priority context (use this first, before chart_context and rows):
Roles summary:
$roles_summary_json

Series domain (values for series_field; empty list if unknown):
$series_domain_json

Measure fields (numeric candidates):
$measure_fields_json

Validation feedback from previous failed attempts:
$validation_feedback_json

Schema:
{
  "plan_tree": {
    "nodes": [{
      "nodeId": "n1|n2|n3|... (MUST be unique, MUST match n<digits>)",
      "op": "string",
      "group": "ops|ops2|ops3|ops4|... (sentence-layer groups only; no \"last\")",
      "params": { "paramName": "scalar|list-of-scalars" },
      "inputs": ["nodeId", "... (MUST be existing earlier nodeIds; do NOT use \"rows\")"],
      "sentenceIndex": 1,
      "view": {
        "split": "vertical|horizontal|none",
        "align": "x|y|none",
        "highlight": true,
        "reference_line": true,
        "note": "string"
      },
      "id": "optional-runtime-id"
    }],
    "warnings": ["string"]
  },
  "warnings": ["string"]
}

Goal-driven planning (do NOT output these steps, only output JSON):
1) Determine goal_type from the Question (examples):
   - LIST_TARGETS: question asks "Which season/year/country ...?"
   - RETURN_SCALARS: question asks to compute/report averages/sums/counts for categories
   - COMPARE_SCALARS: question asks difference/gap between two aggregates
   - FIND_EXTREMUM: question asks largest/smallest/biggest/lowest/highest
   - SET_INTERSECTION: question asks targets satisfying conditions in BOTH A and B
2) Align each explanation sentence to the goal (intermediate vs final).
3) Synthesize the minimal plan: create only the nodes required to answer the question.

Rules:
- Allowed operations: retrieveValue, filter, findExtremum, determineRange, compare, compareBool, sort, sum, average, diff, lagDiff, nth, count, setOp.
- setOp is only for joins.
- IMPORTANT: use only operations that are necessary. Never enumerate the allowed operations list.
- Node connectivity:
  - inputs must reference earlier nodeIds only
  - do NOT use inputs=["rows"] or any other pseudo-input token
- params must be FLAT (no nested objects). Use OpsSpec-like keys when possible:
  - field, target, targetA, targetB, include, exclude, operator, value, group, groupA, groupB,
    which, order, orderField, n, from, aggregate, targetName, fn
- Role tokens:
  - Use plain strings only: "@primary_dimension", "@primary_measure", "@series_field"
  - Example: "params": { "field": "@primary_measure" }
- Sentence-layer grouping:
  - sentenceIndex is REQUIRED and must be a positive integer.
  - group must match sentenceIndex:
    - sentenceIndex=1 -> group="ops"
    - sentenceIndex=k -> group="ops{k}" (k>=2)
  - Multiple independent nodes MAY appear in the same group (parallel computation).
- Keep params minimal and stable.

Few-shot examples (shape only; copy the style, not the literals):

Example 1: RETURN_SCALARS with series conjunction ("for A and B") in ONE sentence:
{
  "plan_tree": {
    "nodes": [
      { "nodeId": "n1", "op": "average", "group": "ops", "params": { "field": "@primary_measure", "group": "A" }, "inputs": [], "sentenceIndex": 1 },
      { "nodeId": "n2", "op": "average", "group": "ops", "params": { "field": "@primary_measure", "group": "B" }, "inputs": [], "sentenceIndex": 1 }
    ],
    "warnings": []
  },
  "warnings": []
}

Example 2: SET_INTERSECTION across 3 sentences:
Sentence 1: compute averages for A and B
Sentence 2: filter targets above each average
Sentence 3: intersect the filtered target sets
{
  "plan_tree": {
    "nodes": [
      { "nodeId": "n1", "op": "average", "group": "ops",  "params": { "field": "@primary_measure", "group": "A" }, "inputs": [], "sentenceIndex": 1 },
      { "nodeId": "n2", "op": "average", "group": "ops",  "params": { "field": "@primary_measure", "group": "B" }, "inputs": [], "sentenceIndex": 1 },

      { "nodeId": "n3", "op": "filter",  "group": "ops2", "params": { "field": "@primary_measure", "operator": ">", "value": "ref:n1", "group": "A" }, "inputs": ["n1"], "sentenceIndex": 2 },
      { "nodeId": "n4", "op": "filter",  "group": "ops2", "params": { "field": "@primary_measure", "operator": ">", "value": "ref:n2", "group": "B" }, "inputs": ["n2"], "sentenceIndex": 2 },

      { "nodeId": "n5", "op": "setOp",   "group": "ops3", "params": { "fn": "intersection" }, "inputs": ["n3", "n4"], "sentenceIndex": 3 }
    ],
    "warnings": []
  },
  "warnings": []
}

Example 3: COMPARE_SCALARS ("difference between the average of A and B"):
{
  "plan_tree": {
    "nodes": [
      { "nodeId": "n1", "op": "average", "group": "ops",  "params": { "field": "@primary_measure", "group": "A" }, "inputs": [], "sentenceIndex": 1 },
      { "nodeId": "n2", "op": "average", "group": "ops",  "params": { "field": "@primary_measure", "group": "B" }, "inputs": [], "sentenceIndex": 1 },
      { "nodeId": "n3", "op": "diff",    "group": "ops2", "params": { "field": "@primary_measure", "targetA": "ref:n1", "targetB": "ref:n2" }, "inputs": ["n1", "n2"], "sentenceIndex": 2 }
    ],
    "warnings": []
  },
  "warnings": []
}

Example 4: FIND_EXTREMUM ("Which year has the biggest jump?"):
{
  "plan_tree": {
    "nodes": [
      { "nodeId": "n1", "op": "lagDiff",     "group": "ops",  "params": { "field": "@primary_measure", "order": "asc" }, "inputs": [], "sentenceIndex": 1 },
      { "nodeId": "n2", "op": "findExtremum","group": "ops2", "params": { "field": "@primary_measure", "which": "max" }, "inputs": ["n1"], "sentenceIndex": 2 }
    ],
    "warnings": []
  },
  "warnings": []
}

Negative examples (forbidden):
- Creating one node for each allowed operation without evidence in the explanation
- Using nested objects in params: { "field": { "name": "@primary_measure", "role": "@primary_measure" } }
- Using inputs=["rows"]
- Using nodeId="filter" or other non n<digits> ids
- Using setOp when the question only asks to report scalars (no join)

Question:
$question

Explanation:
$explanation

Explanation sentences (deterministic split; 1-based indices):
$explanation_sentences_json

Chart context:
$chart_context_json

Rows preview:
$rows_preview_json
