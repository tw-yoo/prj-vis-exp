Task: Inventory (Recursive Grammar Pipeline, MVP).

Given a natural-language question + explanation and chart context,
extract the minimal set of operation tasks explicitly mentioned in the explanation.

Return JSON only. Do not include markdown fences.

Shared rules:
$shared_rules

High-priority context:
Roles summary:
$roles_summary_json

Series domain (values for series_field; empty list if unknown):
$series_domain_json

Measure fields (numeric candidates):
$measure_fields_json

Operation contract (allowed ops + required/optional/forbidden fields + semantic rules):
$ops_contract_json

Validation feedback from previous failed attempts:
$validation_feedback_json

Few-shot examples (reference patterns; adapt field/group values to current chart context):
$few_shot_examples

Output schema:
{
  "tasks": [{
    "taskId": "o1|o2|o3|... (MUST be unique, MUST match o<digits>)",
    "op": "string (MUST be in allowed_ops)",
    "sentenceIndex": 1,
    "mention": "short quote/summary of the part of explanation that mentions this operation",
    "paramsHint": { "paramName": "scalar|list-of-scalars" }
  }],
  "warnings": ["string"]
}

Rules:
- Only extract operations that are explicitly mentioned in the explanation.
  - Do NOT invent extra steps just because an op exists in allowed_ops.
  - Do NOT add operations that are logically implied but not stated —
    Step-Compose handles intermediate steps at compose-time.
  - "clearly implied" means: the sentence directly describes the action or result for this op.
    It does NOT mean: "this op will eventually be needed to reach the final answer."
- CRITICAL: Do NOT anticipate future operations based on semantic inference across sentences.
  - When the explanation has multiple sentences, each sentence MUST be treated independently.
  - Do NOT add a task to sentence N just because it logically prepares for an operation in sentence N+1.
  - Example (WRONG):
    Sentence 1: "retrieve value of 2016 and 2017"
    → LLM infers: "these two values will be diffed later, so I should add a diff task here"
    → Output: [retrieveValue(2016), retrieveValue(2017), diff(...)] ✗
  - Example (RIGHT):
    Sentence 1: "retrieve value of 2016 and 2017" (only retrieve is mentioned)
    → Output: [retrieveValue(2016), retrieveValue(2017)] (no diff)
    Sentence 3: "get the difference of the retrieved values"
    → Output: [diff(...)] (diff goes here, where it is explicitly mentioned)
  - Rationale: Step-Compose will compose operations across sentence boundaries. Inventory must not pre-compose.
- First infer the intended final result artifact from the explanation/question:
  - scalar (single number), boolean, single target(row 1), list/table(rows 2+), or set-like list.
  - Inventory must be consistent with ONE primary final artifact type.
  - If multiple artifact types are mentioned, treat non-final ones as intermediate steps and keep one final output intent.
- IMPORTANT: Visual/draw directives are NOT operation tasks in this pipeline.
  - If the explanation says things like "highlight", "draw", "split", "align", "reference line",
    do NOT create tasks with op="highlight"/"draw"/"split"/"align"/"reference_line".
  - Instead, add a short note to the top-level "warnings" list describing what was ignored.
  - This endpoint generates non-draw OpsSpec only.
- IMPORTANT: Series restriction directives are NOT modeled as filter tasks on the series field.
  - Forbidden inventory task:
    - { "op": "filter", "paramsHint": { "field": "@series_field", "include": ["A","B"] } }
    - { "op": "filter", "paramsHint": { "field": "<series_field>", "include": ["A","B"] } }
  - If the explanation says "filter only A and B" and A/B are series values (from series_domain):
    - Do NOT output a standalone filter task.
    - Add a warning.
    - Later steps should express series restriction via op_spec.group on substantive operations.
- Phrase mapping (non-draw meaning behind common visual phrases):
  - "average line" implies an "average" operation task (the *line drawing* itself is visual and should be in warnings).
  - "highlight bars above X" implies a "filter" operation task (the *highlight* itself is visual and should be in warnings).
  - "second highest/second lowest" implies a "findExtremum" task with paramsHint.rank=2 and which="max|min".
  - "from year A to year B" implies a "filter" task with paramsHint.operator="between", paramsHint.value=[A,B].
  - "add/sum two computed values" implies an "add" operation task with paramsHint.targetA/targetB (usually refs at compose-time).
- If the same op name appears in different parts of the explanation with different intent/arguments,
  create separate tasks with different taskIds.
- Build tasks as a minimal executable plan:
  - include prerequisite steps (filter/aggregate/compare) needed to derive the final intended artifact.
  - avoid redundant branches that do not contribute to the final artifact.
- sentenceIndex MUST be the 1-based index of the sentence that explicitly names or describes this task's action.
  - Assign a task to the sentence whose verb/action directly corresponds to this op
    (e.g., "retrieve" → retrieveValue, "difference" → diff, "filter" → filter).
  - Do NOT assign a task to a sentence just because it provides input data for the task.
  - The fact that sentence 1 produces values that a later op will consume
    does NOT mean that later op belongs in sentenceIndex=1.
    If an op is only mentioned in sentence 3, it gets sentenceIndex=3.
- paramsHint must be FLAT (no nested objects). Keep it minimal.
- Role tokens allowed in paramsHint values:
  - "@primary_dimension", "@primary_measure", "@series_field"
- Series restriction:
  - Never represent series selection as a filter on the series field.
  - Use paramsHint.group="<series value>" or paramsHint.group=["A","B"] instead.
  - When paramsHint.group is a list for FilterOp, it means OR semantics across listed series values.
- Filter task must choose a mode:
  - If you output a task with op="filter", paramsHint MUST include EITHER:
    - membership mode: include and/or exclude
    - comparison mode: operator AND value (both)
    - group-only mode: group only (series restriction)
  - In membership mode, paramsHint.field may be any categorical field (except series_field).
  - If the explanation only says "filter only A and B" and A/B are series values (from series_domain),
    do NOT create a group-only filter task; attach the series restriction to other substantive tasks via paramsHint.group.
- DATA RESOLUTION RULE: When a task requires selecting a specific subset of data items
  (e.g., "top N", "highest N", "lowest N", "bottom N", "most recent N", "largest N",
  "smallest N", or any phrase asking to pick N specific items by value ranking):
  1. Check if you can determine the actual values from rows_preview.
  2. If YES: use op="filter" with paramsHint.include=[<specific_values_from_rows_preview>].
     - Read rows_preview, sort mentally by the relevant measure field,
       and extract the N dimension values directly.
  3. If NO (e.g., the subset depends on an intermediate computed result not yet available):
     - Fall back to dynamic ops (sort, nth, findExtremum).
  Principle: rows_preview is provided so you can resolve data-dependent selections AT INVENTORY TIME.
  Always prefer resolving to concrete values over deferring to runtime sorting.
  Example:
    rows_preview: [{Year:"2018", prod:100}, {Year:"2019", prod:95}, {Year:"2017", prod:80}, ...]
    explanation: "find the top 2 years by production"
    → filter(field="Year", include=["2018", "2019"])  ← resolved from rows_preview
    NOT: sort(desc) + nth(1,2)
- LAST SENTENCE RULE: The tasks in the LAST sentence of the explanation must collectively
  produce the final answer to the QUESTION.
  1. Re-read the QUESTION to understand the complete structure of the final answer.
  2. If the question asks to compare two derived values (e.g., "how big was X compared to Y?"),
     generate ALL ops needed: compute X, compute Y, then compare/diff X and Y.
  3. If the explanation uses vague or singular language in the last sentence
     (e.g., "get the difference", "compare the values"), expand it to the full set of
     ops implied by the question — do not stop at one op if the question requires more.
  - Example (WRONG):
    question: "how big was change A compared to change B?"
    last sentence: "get the difference of the retrieved values"
    → Only 1 diff task  ← WRONG: doesn't fully answer the comparison
  - Example (RIGHT):
    question: "how big was change A compared to change B?"
    last sentence: "get the difference of the retrieved values"
    → 3 diff tasks: diff(A_start, A_end), diff(B_start, B_end), diff(diff_A, diff_B)
    ← RIGHT: fully computes both changes and their comparison

- MULTI-OP GENERATION PER SENTENCE:
  A single explanation sentence may require MULTIPLE ops to be extracted.
  - Example:
    explanation: "Filter for the revenue of Thailand and the Philippines"
    question: "in which years did Thailand's revenue exceed Philippines?"
    → This sentence requires TWO ops:
      1) filter(field="Country", include=["Thailand", "Philippines"])  ← the explicit "filter"
      2) pairDiff(...) ← implicit "compare" to prepare for later question answering
      So taskIds: o1 (filter), o2 (pairDiff) with sentenceIndex=1 for both.
    → Do NOT create filter-only (no pairDiff) just because the sentence only mentions "filter".
    → The question context ("Thailand exceeded Philippines") reveals that pairDiff is needed.

- PAIRDIFF GROUPORDER SEMANTICS:
  For pairDiff(groupA, groupB):
  - Read the QUESTION to understand which direction the comparison should go.
  - groupA should be the SUBJECT being asked about (numerator in the division).
  - groupB should be the BASELINE/COMPARISON target (denominator).
  - Example:
    question: "in which years did Thailand's revenue exceed that of Philippines?"
    → groupA="Thailand" (the subject being analyzed)
    → groupB="Philippines" (the baseline it is compared against)
    → signed=true (so positive result = Thailand > Philippines)
  - Counter-example (WRONG):
    question: "in which years did Thailand's revenue exceed Philippines?"
    → groupA="Philippines", groupB="Thailand"  ← WRONG: reversed
    → This would make positive results mean Philippines > Thailand, contradicting the question.

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
