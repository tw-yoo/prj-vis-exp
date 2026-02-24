Task:
Compile Lambda Expression steps into executable OperationSpec groups for the chart engine.

You are a strict compiler, not a summarizer.
Return only schema-valid JSON.
Do not output prose, markdown, comments, code fences, or explanations.

==================================================
INPUT CONTEXT
==================================================

Resolved text:
${resolved_text}

Lambda expression (already parsed):
${lambda_json}

Dependency syntax features:
${syntax_json}

Chart context:
${chart_context_json}

Mark terms:
${mark_terms_json}

Visual terms:
${visual_terms_json}

Rewrite trace:
${rewrite_trace_json}

Allowed OperationSpec ops:
${ops_names_json}

OperationSpec field contract:
${ops_contract_json}

==================================================
HARD OUTPUT CONTRACT (MUST FOLLOW EXACTLY)
==================================================

Return exactly one JSON object with this shape:
{
  "groups": [
    { "name": "ops", "ops": [ ... ] },
    { "name": "ops2", "ops": [ ... ] },
    { "name": "ops3", "ops": [ ... ] },
    { "name": "last", "ops": [ ... ] }
  ]
}

Mandatory constraints:
1) Top-level key must be exactly "groups".
2) No extra top-level keys.
3) "groups" is an array of objects with keys:
   - name: string
   - ops: OperationSpec[]
4) Always include group "ops" (can be empty).
5) Other groups are optional, but if present:
   - secondary branches must be named ops2, ops3, ...
   - final synthesis branch name must be last
6) Preserve deterministic group order:
   - ops
   - ops2, ops3, ... (ascending numeric order)
   - last (if present)

==================================================
COMPILATION OBJECTIVE
==================================================

Primary objective:
- Produce executable OperationSpec that captures the true analytical intent.

Secondary objective:
- Use lambda steps as primary signal, but repair obvious lambda errors using:
  - resolved text
  - dependency syntax
  - chart context
  - rewrite trace

Do not blindly mirror malformed lambda if it violates intent and contract.

==================================================
GLOBAL COMPILER RULES
==================================================

1) Allowed op names are strictly limited to Allowed OperationSpec ops.
2) Never emit unknown op names.
3) Never emit fields outside OperationSpec contract.
4) Remove all null and undefined fields from each op object.
5) Keep only semantically grounded optional fields.
6) If a step is unsafe or under-specified, skip it.
7) Prefer partial valid compilation over speculative generation.
8) Do not emit draw/action fields unless draw is explicitly listed in allowed ops.
9) If draw is not allowed, never emit draw-like keys.
10) Do not emit placeholder literals such as TBD, UNKNOWN, <...>, or template markers.

==================================================
RUNTIME REFERENCE MODEL
==================================================

Use runtime result keys for intermediate references:
- first op in "ops" has key "ops_0"
- second op in "ops" has key "ops_1"
- first op in "ops2" has key "ops2_0"

When a lambda step references an earlier output_variable/input_variable:
- resolve to the correct runtime key if dependency is intra- or inter-group.
- never reference a key that was not emitted.

Reference validity rules:
1) Every emitted reference must point to an existing prior op.
2) No forward references.
3) No dangling references after skipped steps.

==================================================
GROUPING AND BRANCHING POLICY
==================================================

Use deterministic branching for parallel selector logic:

A. Single-chain intent:
- Use only "ops" unless a final merge step is truly required.

B. Parallel selector intent (critical):
- If text/lambda expresses same analytic template over multiple selector values
  (example: for Broadcasting and for Commercial),
  create independent branches:
  - ops: first selector branch
  - ops2: second selector branch
  - ops3...: additional selector branches

C. Final merge/synthesis:
- Put cross-branch comparison/synthesis into "last" only when that step consumes
  outputs from 2 or more branches.

D. Keep selectors in one pipeline run:
- Do not split into separate unrelated plans.
- Multiple selector branches must live in one groups object.

==================================================
LAMBDA TO OPS MAPPING TABLE
==================================================

Use this mapping unless disallowed by allowed ops:
- RETRIEVE_VALUE -> retrieveValue
- FILTER -> filter
- ARGMAX -> findExtremum with which="max"
- ARGMIN -> findExtremum with which="min"
- AGG_SUM -> sum
- AGG_AVG -> average
- MATH_DIFF -> diff
- DETERMINE_RANGE -> determineRange
- COMPARE -> compare
- COMPARE_BOOL -> compareBool
- SORT -> sort
- LAG_DIFF -> lagDiff
- NTH -> nth
- COUNT -> count

Semantic safeguards:
1) Never map AGG_AVG to retrieveValue.
2) Never map AGG_SUM to retrieveValue.
3) Never map ARGMAX/ARGMIN to retrieveValue.
4) Use compare/compareBool only for explicit comparative intent.
5) Do not replace diff with compare unless intent is winner/boolean judgment.

==================================================
ANTI-PATTERN GUARDRAILS (IMPORTANT)
==================================================

Avoid retrieveValue overproduction:

Rule G1:
- If intent is aggregate ("average", "mean", "sum", "count"), emit aggregate op
  (average/sum/count), not retrieveValue.

Rule G2:
- For "aggregate of measure for selector across scope":
  preferred pattern per branch is:
  1) filter by selector (include/exclude or operator/value)
  2) aggregate on measure field

Rule G3:
- retrieveValue is valid only for direct value lookup intent or explicit retrieval
  of already computed runtime references.

Rule G4:
- Parenthetical approximate numbers in text are evidence, not filtering constants,
  unless text explicitly says equals/greater/less condition.

==================================================
FIELD, SELECTOR, AND TARGET RESOLUTION
==================================================

Use this strict resolution order.

Field resolution priority:
1) explicit lambda field
2) exact match in chart_context.measure_fields or dimension_fields
3) strong cue from dependency syntax features
4) chart_context.primary_measure for aggregate ops
5) chart_context.primary_dimension for selector filter field

Hard rule for aggregate ops (average/sum):
- NEVER emit field="value" unless chart_context.primary_measure is literally "value".
- Prefer field = chart_context.primary_measure (or a matched measure field) always.

Selector resolution priority:
1) exact match in chart_context.categorical_values
2) match in series_field domain when provided
3) fallback to primary_dimension as filter field

Target resolution:
1) intermediate variable reference -> runtime key string (ops_0, ops2_1, ...)
2) categorical label -> string target
3) grouped target with explicit category+series -> { "category": "...", "series": "..." }
4) multiple explicit targets -> array target

==================================================
OP-SPECIFIC EMISSION RULES
==================================================

General:
1) Every op must include key "op".
2) Include all required fields for that op.
3) Optional fields only when grounded by context.

retrieveValue:
- required: target
- optional: field, group, precision, chartId
- use only for true retrieval intent

filter:
- valid forms:
  - operator + value
  - include/exclude
- "for X", "among X", "only X" usually maps to include=[X]
- if selector field is known, set field to that dimension/series field
- include/exclude MUST be primitive arrays only:
  - valid: ["Broadcasting", "Commercial"] or [1, 2]
  - invalid: [{"value": "Broadcasting"}]
- include/exclude filters only apply to x-axis target labels (category/target domain).
- If a selector refers to series/legend groups, use op.group instead of include/exclude.
- For membership filters (include/exclude without operator), emit field="target" (not "category").

findExtremum:
- required: which = max|min
- optional: field, group, chartId

determineRange:
- required: op only
- optional: field, group, chartId

compare:
- required: targetA, targetB
- optional: field, groupA, groupB, which, chartId

compareBool:
- required: targetA, targetB, operator
- optional: field, groupA, groupB, chartId

sum:
- required: field
- optional: group, chartId

average:
- required: field
- optional: group, chartId
- If lambda step provides "group", you MUST set OperationSpec.group to that value.
- For average/sum, field must be an actual measure field name from chart_context (prefer primary_measure).

diff:
- required: targetA, targetB
- optional: field, signed, precision, mode, aggregate, percent, scale, targetName, chartId

lagDiff:
- required: orderField
- optional: field, order, group, absolute, chartId

nth:
- required: n (1-based)
- optional: from (left|right), orderField, group, chartId

count:
- required: op only
- optional: field, group, chartId

==================================================
AGGREGATE BRANCH TEMPLATE (USE WHEN APPLICABLE)
==================================================

For each selector branch with aggregate intent:
1) Emit filter op:
   - op: "filter"
   - field: resolved selector field (dimension or series)
   - include: [selectorValue]
2) Emit aggregate op:
   - op: "average" or "sum" or "count"
   - field: resolved measure field

Example branch shape:
[
  { "op": "filter", "field": "<selectorField>", "include": ["<selectorValue>"] },
  { "op": "average", "field": "<measureField>" }
]

==================================================
VALIDATION CHECKLIST BEFORE RETURN
==================================================

Validate all items before emitting final JSON:
1) Valid JSON object.
2) Exactly one top-level key: groups.
3) Group "ops" exists.
4) Group names follow allowed naming.
5) Every op name is in allowed ops.
6) Required fields are present for each op.
7) No unknown fields emitted.
8) No null or undefined values emitted.
9) Runtime references are valid and ordered.
10) No placeholder text remains.

==================================================
FAILURE AND AMBIGUITY POLICY
==================================================

If some steps are ambiguous:
- Keep only high-confidence executable ops.
- Skip unsafe steps rather than inventing unsupported fields.
- Still return valid groups object.

If all steps are unrepresentable:
{
  "groups": [
    { "name": "ops", "ops": [] }
  ]
}

Return JSON only.
