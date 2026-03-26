Shared rules (apply to ALL modules):

1) NodeId format:
- A nodeId MUST be a string matching: n<digits> (examples: "n1", "n2", "n10").

2) Scalar references (CRITICAL):
- When a field needs to refer to the scalar output of a previous node, use a STRING reference:
  - "ref:n<digits>" (example: "ref:n1")
- NEVER use an object reference like: { "id": "n1" } anywhere.

3) Prefer stable, simple JSON:
- Prefer scalar values and lists of scalars.
- Avoid nested objects unless absolutely necessary.

4) Strict JSON only:
- Output must be valid JSON.
- Do not output null keys.
- Do not output unknown keys.

5) Step-Compose output restrictions:
- In Step-Compose output, NEVER include: "id", "meta", "chartId".
- The pipeline assigns id/meta deterministically.

6) Sentence-layer grouping:
- Group names represent explanation sentence layers, not series branches.
- The pipeline maps:
  - sentenceIndex=1 -> group "ops"
  - sentenceIndex=k (k>=2) -> group "ops{k}" (examples: "ops2", "ops3", "ops10")
- Do NOT use a "last" group.

7) Series restriction (CRITICAL):
- Do NOT restrict series values via a filter on the series field.
  - Forbidden (OpsSpec): { "op": "filter", "field": "<series_field>", "include": ["A","B"] }
- Instead, restrict series via op_spec.group / op_spec.groupA / op_spec.groupB:
  - Example: { "op": "average", "field": "@primary_measure", "group": "A" }
  - FilterOp also allows multi-series restriction via list:
    { "op": "filter", "field": "<categorical_field>", "include": ["2016"], "group": ["A","B"] }
  - For FilterOp, group list uses OR semantics (match any listed group).
  - FilterOp also allows group-only mode for series restriction:
    { "op": "filter", "group": ["A","B"] }
  - FilterOp comparison mode also allows row-order interval slicing:
    { "op": "filter", "field": "<categorical_field>", "operator": "between", "value": ["2009","2014"] }
    This means inclusive slice from first "2009" to first "2014" after it.
  - For pairwise differences, prefer op="pairDiff" with by/groupA/groupB.
  - If groupA/groupB are values of a non-default field, set pairDiff.seriesField explicitly.
8) SumOp rule:
- op="sum" is allowed only for bar charts (simple/stacked).
- SumOp.group may be a string or list of strings.
- In stacked bar, group=None or multi-group means sum all values.
- SumOp is row aggregation only (not scalar arithmetic).

9) AddOp rule:
- Use op="add" to add two scalar values.
- targetA/targetB must be scalar refs ("ref:nX") or numeric literals.

10) Final artifact consistency:
- For each request, produce one primary final artifact type (scalar, boolean, or row-list).
- Intermediate artifacts may differ, but each intermediate node should contribute to deriving that final artifact.
- Avoid dangling branches that do not feed into any later node.
