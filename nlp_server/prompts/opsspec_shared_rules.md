Shared rules (apply to ALL modules):

1) NodeId format:
- A nodeId MUST be a string matching: n<digits> (examples: "n1", "n2", "n10").

2) Node references inside params (CRITICAL):
- When a param needs to refer to the output of a previous node, use a STRING reference:
  - "ref:n<digits>" (example: "ref:n1")
- NEVER use an object reference like: { "id": "n1" } anywhere.
- In PlanTree inputs, use nodeIds directly (["n1", "n2"]), NOT "ref:n1".

3) Flat params only (PlanTree/GroundedPlanTree):
- params values MUST be a scalar (string/number/bool/null) OR a list of scalars.
- Do NOT use nested objects in params (no {"field": {"name": ...}}).

4) Strict JSON only:
- Output must be valid JSON.
- Do not output null keys.
- Do not output unknown keys.

5) OpsSpec meta is mandatory (module-3 output and final grammar):
- Every OperationSpec MUST include "meta".
- Every meta MUST include "inputs" as a list (can be empty []).
- Use meta.inputs to represent dependencies (tree edges).

6) Sentence-layer grouping (apply to ALL modules):
- Group names represent explanation sentence layers, not series branches.
- Sentence 1 -> group "ops"
- Sentence k (k>=2) -> group "ops{k}" (examples: "ops2", "ops3", "ops10")
- Do NOT use a "last" group.

7) Series restriction (CRITICAL):
- Do NOT restrict series values via a filter on the series field.
  - Forbidden (PlanTree / GroundedPlanTree): { "op": "filter", "params": { "field": "@series_field", "include": ["A","B"] } }
  - Forbidden (OpsSpec): { "op": "filter", "field": "<series_field>", "include": ["A","B"] }
- Instead, restrict series via params.group / op.group:
  - Example: { "op": "average", "params": { "field": "@primary_measure", "group": "A" } }
