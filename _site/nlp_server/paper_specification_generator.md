# OpsSpec Prompt Blueprint (English, Implementation-Aligned)

This document is a production-oriented prompt blueprint for generating stable OpsSpec grammar in the recursive pipeline.
It is intentionally aligned with the current code contracts (`op_registry`, validators, grounding, and scheduler).

---

## 1) Objective

Generate a valid, deterministic OpsSpec DAG from:
- natural-language `question` + `explanation`
- chart inputs (`vega_lite_spec`, `data_rows`)

Target properties:
- contract-valid JSON
- reproducible node dependency graph
- minimal task decomposition that converges to one final artifact type

---

## 2) Runtime Contract Boundaries (Must Match Code)

### 2.1 Dynamic contract injection
The LLM does **not** rely on hardcoded operation schemas in the prompt.
It must follow the injected `ops_contract_json`:
- `allowed_ops`
- per-op required/optional/forbidden keys
- semantic rules

### 2.2 What LLM can output vs what pipeline assigns
- Module 1 (Inventory): task-level hints only (`tasks[]`)
- Module 2 (Step-Compose): one `op_spec` + `inputs`
- Pipeline assigns deterministically:
  - `id` (`n1`, `n2`, ...)
  - `meta.nodeId`
  - `meta.inputs` normalization
  - `meta.sentenceIndex`
  - sentence-layer group name (`ops`, `ops2`, ...)

### 2.3 Grounding boundary (`@primary_*` tokens)
- Allowed in Module outputs: `@primary_dimension`, `@primary_measure`, `@series_field`
- Not allowed in final grammar after grounding
- Domain value normalization is deterministic (exact/case-insensitive/fuzzy)

---

## 3) Module 1 Prompt Spec (Inventory)

### 3.1 Input state
- `question`, `explanation`, sentence split
- `chart_context_json` (fields, domains, mark, series_field, etc.)
- `ops_contract_json`
- retry feedback from previous failed attempt (if any)

### 3.2 Output schema
```json
{
  "tasks": [
    {
      "taskId": "o1",
      "op": "average",
      "sentenceIndex": 1,
      "mention": "short mention from explanation",
      "paramsHint": { "field": "@primary_measure", "group": "Broadcasting" }
    }
  ],
  "warnings": []
}
```

### 3.3 Hard constraints
- `taskId` format: `o<digits>`, unique
- `op` must be in `allowed_ops`
- `paramsHint` must be flat (scalar / list of scalars only)
- Extract only required tasks; avoid disconnected branches
- Do not create visual directive ops (`highlight`, `draw`, `split`, etc.)

### 3.4 Series restriction policy (single, consistent)
- Never represent series restriction as `filter(field=@series_field, ...)`
- If the explanation only says “keep series A/B”, do **not** create a standalone filter task
- Express series restriction later via `op_spec.group` on substantive operations (e.g., `average`, `filter` on non-series field)

---

## 4) Module 2 Prompt Spec (Step-Compose)

### 4.1 Input state
- remaining tasks `S(O)`
- available executed nodes (artifact summaries)
- `chart_context_json`
- `ops_contract_json`
- retry feedback from previous failed attempt (if any)

### 4.2 Output schema
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
  "inputs": ["n1"],
  "warnings": []
}
```

### 4.3 Hard constraints
- Pick exactly one executable task
- Deterministic tie-break: smallest taskId when multiple are executable
- `op_spec` must not include `id`, `meta`, `chartId`
- scalar references must be string-only (`"ref:nX"`)
- no object ref (`{"id":"nX"}`)
- `inputs` must reference existing nodes only

---

## 5) Critical Error Patterns and Correct Forms

### 5.1 Series restriction
**Invalid**
```json
{ "op": "filter", "field": "@series_field", "include": ["A", "B"] }
```
**Valid**
```json
{ "op": "average", "field": "@primary_measure", "group": "A" }
```

### 5.2 Scalar ref format
**Invalid**
```json
{ "value": { "id": "n1" } }
```
**Valid**
```json
{ "value": "ref:n1" }
```

### 5.3 `setOp` minimal requirements
**Valid**
```json
{
  "pickTaskId": "o3",
  "op_spec": { "op": "setOp", "fn": "intersection" },
  "inputs": ["n1", "n2"]
}
```

### 5.4 Filter mode exclusivity
Valid modes (exactly one):
1. membership: `include` and/or `exclude`
2. comparison: `operator` + `value`
3. group-only: `group` only

Do not mix membership and comparison in one filter op.

---

## 6) Strict Retry Feedback Design

Retry feedback should be short, typed, and actionable:
- `[Type: Schema]`
- `[Type: Invalid Op]`
- `[Type: Filter Rule]`
- `[Type: Series Rule]`
- `[Type: Ref Rule]`
- `[Type: Input Rule]`
- `[Type: Semantic]`

Required structure:
1. attempt banner
2. error type
3. concrete detail from validator
4. single action instruction (“fix and return JSON only”)

---

## 7) Self-Check Before Returning JSON

### Module 1 checklist
- all taskIds unique and valid?
- only allowed ops used?
- no visual directive ops?
- no series-field filter task?
- minimal executable task graph?

### Module 2 checklist
- picked task exists in remaining tasks?
- op fields obey contract?
- no forbidden keys (`id/meta/chartId`)?
- scalar refs use `ref:nX` string only?
- inputs refer to existing nodes only?

---

## 8) Draw Plan Alignment Notes (for Prompt Authors)

Draw plan is generated **after** scheduled OpsSpec and is not authored directly by Module 1/2.

Important mapping expectations:
- target-selection ops (`filter`, `findExtremum`, `setOp`, `nth`, etc.) → `highlight`
- scalar ops (`average`, `diff`, `count`, `compare*`, `add`, `scale`) → horizontal line + text
- `diff` with scalar-ref-only context may branch to `scalar-panel`
- scoped series ops in stacked/grouped bars may emit group filter pre/post wrappers

If prompt examples include visual wording, keep it as semantic intent for data ops; do not emit draw ops in OpsSpec modules.
