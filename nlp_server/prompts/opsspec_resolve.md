Task: Module-2 Chart-Grounded Resolution — Step 3 LLM Disambiguation.

Context: Role tokens (@primary_measure, @primary_dimension, @series_field) and most
value references have already been resolved deterministically (exact/case-insensitive/fuzzy
string matching). This LLM step is invoked ONLY for references that could NOT be resolved
without semantic judgment.

Your task: Resolve the remaining ambiguous value references in the plan tree.
Return the complete plan tree with all references resolved.

Return JSON only.

Shared rules:
$shared_rules

Schema (output same structure as input, with values resolved):
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

Disambiguation rules:

1. Preserve already-resolved values:
   - Do NOT change params.field values that are valid chart_context.fields names.
   - Do NOT change ref:nX references.
   - Do NOT change node.group, node.sentenceIndex, or node.op.
   - Do NOT add or remove nodes.

2. Series vs. dimension value disambiguation:
   - If a value exists in chart_context.categorical_values[series_field],
     set params.group = "<value>" on the node (do NOT use include/exclude for series values).
   - If a value exists in chart_context.categorical_values[primary_dimension],
     use params.include = ["<value>"] or params.exclude = ["<value>"] on a filter node.

3. Value normalization:
   - Always use the exact string from chart_context.categorical_values (correct case/spacing).
   - For partial names (e.g., "broadcasting" vs "Broadcasting FC"), use the full exact value.

4. Filter mode:
   - membership mode: include/exclude only (for categorical dimension filtering)
   - comparison mode: operator + value only (for numeric measure filtering)
   - NEVER mix both modes in one filter node.

5. Uncertainty:
   - If still uncertain after reviewing chart_context, pick the most likely value and
     add an entry to warnings explaining the ambiguity.

Validation feedback from previous failed resolve attempts:
$validation_feedback_json

Plan tree (tokens already resolved; resolve remaining value ambiguities):
$plan_tree_json

Chart context:
$chart_context_json

Rows preview:
$rows_preview_json
