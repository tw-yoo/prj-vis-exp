Task:
Compile natural-language chart reasoning into Lambda Expression JSON.

You are a strict parser. Return JSON only.
Do not output prose, markdown, comments, or code fences.

==================================================
INPUT CONTEXT
==================================================

Resolved text:
${resolved_text}

Dependency syntax features:
${syntax_json}

Chart context (required):
${chart_context_json}

Derived lambda hints:
${lambda_hints_json}

Mark terms:
${mark_terms_json}

Visual terms:
${visual_terms_json}

Rewrite trace:
${rewrite_trace_json}

Allowed operations and meanings:
${operations_json}

==================================================
OUTPUT CONTRACT
==================================================

Return one JSON object:
{
  "lambda_expression": [
    {
      "step": 1,
      "operation": "...",
      "field": "...",
      "target": "...",
      "condition": "...",
      "group": "...",
      "output_variable": "...",
      "input_variable": "...",
      "branch": "ops|ops2|last"
    }
  ]
}

Rules:
1) Use only allowed operations.
2) Keep step numbers sequential from 1.
3) Use output_variable for intermediate values.
4) Use input_variable when consuming previous outputs.
5) Do not emit keys outside schema.
6) Prefer valid partial output over speculative output.

==================================================
CONVERSION RULES
==================================================

1) Aggregate intent:
If text indicates average/mean/sum/count, emit AGG_AVG/AGG_SUM/COUNT as the main operation.
Do not replace aggregate intent with RETRIEVE_VALUE unless text is clearly a direct lookup.

2) Parallel selector pattern:
For patterns like:
"for A ... and for B ..."
emit separate branches or explicit step-level separation so downstream opsSpec can build independent chains.
Use chart_context categorical values to map A/B to the correct selector field.

If derived lambda hints include a branch plan (lambda_hints.branch_plan):
1) You MUST follow its branches exactly (ops, ops2, ...).
2) If branch_plan.selector_kind == "series":
   - Represent the selector using "group" field (NOT condition string).
   - Do not emit FILTER(include/exclude) for these selectors.
3) If branch_plan.selector_kind == "target":
   - Emit FILTER as needed using condition "field in [value]" or "field not in [value]".
   - Do not put target selectors into "group".

3) Scope phrases:
Phrases such as "across all seasons", "over all years" describe aggregation scope.
Treat numeric values in parentheses (e.g., "≈212.8") as reference hints, not filter conditions.

4) Field selection:
Prefer chart_context.primary_measure or matched measure_candidates for aggregate operations.
Prefer chart_context.primary_dimension / series_field for selector conditions.

==================================================
QUALITY CHECK
==================================================

Before returning:
1) JSON is valid.
2) Every step has valid operation.
3) Aggregation intent is preserved when present.
4) output_variable/input_variable references are coherent.

Return JSON only.
