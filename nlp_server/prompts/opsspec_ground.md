Task: Module-2 Ground.

Input: plan_tree + chart context + rows preview.
Output: grounded_plan_tree where all role tokens are resolved into concrete fields/values.
Return JSON only.

Shared rules:
$shared_rules

Schema:
{
  "grounded_plan_tree": {
    "nodes": [{
      "nodeId": "string",
      "op": "string",
      "group": "string",
      "params": { "paramName": "scalar|list-of-scalars" },
      "inputs": ["nodeId", "..."],
      "sentenceIndex": 1,
      "view": { "split": "vertical|horizontal|none", "align": "x|y|none", "highlight": true, "reference_line": true, "note": "string" },
      "id": "optional-runtime-id"
    }],
    "warnings": ["string"]
  },
  "warnings": ["string"]
}

Grounding rules:
- Preserve sentence-layer structure:
  - Do NOT change node.group.
  - Do NOT change node.sentenceIndex.
- Resolve tokens:
  - @primary_measure -> chart_context.primary_measure
  - @primary_dimension -> chart_context.primary_dimension
  - @series_field -> chart_context.series_field
- average/sum field must be chart_context.primary_measure unless explicitly needed otherwise.
- For selector values like Broadcasting/Commercial:
  - if value is in chart_context.categorical_values[series_field], prefer group=selector.
  - otherwise map to primary_dimension include/exclude.
- filter rule:
  - membership mode: include/exclude only
  - comparison mode: operator + value only
  - do not use both modes together.
- If you must reference a prior node scalar, use params.value="ref:n<digits>" (string), never {"id": "..."}.

Plan tree:
$plan_tree_json

Chart context:
$chart_context_json

Rows preview:
$rows_preview_json
