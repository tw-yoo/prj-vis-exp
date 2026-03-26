Task: Step-Compose (Recursive Grammar Pipeline, MVP).

You will be given:
- A fixed current operation task selected by the pipeline
- A set of remaining operation tasks S(O) extracted from the explanation
- A set of available executed nodes (nodeId + result summaries)
- Chart context and rows preview

Your job:
Propose exactly ONE operation spec (op_spec) for the fixed current task
using the currently available nodes and the base chart (C0).
Always keep global coherence with the intended final artifact type implied by question/explanation
(scalar vs list/table vs boolean). Intermediate nodes are allowed, but the plan must converge to one final artifact.

Return JSON only. Do not include markdown fences.

Shared rules:
$shared_rules

Operation contract (allowed ops + required/optional/forbidden fields + semantic rules):
$ops_contract_json

Validation feedback from previous failed attempts:
$validation_feedback_json

Few-shot examples (reference patterns; adapt field/group values to current chart context):
$few_shot_examples

Output schema:
{
  "op_spec": {
    "op": "string",
    "...": "OperationSpec-like top-level fields (NO id/meta/chartId)"
  },
  "inputs": ["n<digits>", "..."],
  "warnings": ["string"]
}

Critical rules:
1) Task selection:
   - DO NOT pick/select a taskId in your output.
   - The pipeline already selected the current task.
   - op_spec.op MUST match current_task.op.
2) op_spec shape:
   - op_spec MUST include "op".
   - op_spec MUST NOT include: "id", "meta", "chartId".
   - Use ONLY fields allowed by the operation contract for that op.
3) References:
   - If you need a scalar from a previous node, use a STRING reference "ref:nX".
   - NEVER output {"id":"nX"} objects.
4) inputs:
   - inputs can include nodeIds that the operation depends on.
   - Every nodeId in inputs MUST already exist in available nodes.
   - For setOp, inputs MUST contain at least two nodeIds.
   - For non-setOp ops, do NOT use more than one "data parent" input. Prefer scalar refs for scalar dependencies.
   - Prefer ops that consume already-produced intermediates and move one step closer to final output intent.
5) Series restriction:
   - Do NOT filter on series_field directly.
   - Restrict series via op_spec.group / op_spec.groupA / op_spec.groupB when needed.
   - For FilterOp, op_spec.group may be a string or list of strings. A list means OR semantics.
   - IMPORTANT: For average/count/findExtremum/sort/determineRange/retrieveValue/lagDiff/nth, group MUST be a single series value string.
   - Never use sentence-layer tokens ("ops", "ops2", ...) as group values.
   - Never put dimension subsets (e.g., years like ["2010","2013"]) into group.
6) Filter MUST choose a mode:
   - For op="filter", you MUST set EITHER:
     - membership mode: include and/or exclude
     - comparison mode: operator AND value (both)
     - group-only mode: group only (series restriction)
   - In membership mode, field may be any categorical field (except series_field).
   - For row-order interval phrases like "from year A to year B", use comparison mode:
     operator="between", value=[A,B] (inclusive slice from first A to first B after A).
   - Never output a field-only filter. It will be rejected by validation.
7) CompareBool / Nth / SetOp reminders:
   - For op="findExtremum", use rank for k-th extremum (e.g., second highest -> which="max", rank=2).
   - For op="compareBool", you MUST include operator (e.g., ">", "<=", "==").
   - For op="add", you MUST include targetA and targetB (each should be scalar ref like "ref:nX" or numeric literal).
   - For op="diff": MUST include targetA and targetB (both must be scalar refs "ref:nX").
     inputs MUST contain exactly 2 nodeIds matching the referenced nodes.
   - For op="compare": MUST include targetA, targetB (scalar refs "ref:nX"), and which ("min" or "max").
     inputs MUST contain exactly 2 nodeIds.
   - For op="nth", you MUST include n (integer or list of integers). (n is required.)
   - For op="setOp", you MUST include fn ("intersection" or "union") AND inputs with at least two nodeIds.
   - For op="pairDiff", you MUST include by, groupA, and groupB.
   - For grouped/stacked comparisons where groupA/groupB come from a non-default field, include seriesField.
   - For op="sum", use it only for bar charts; group may be string or list. sum is row aggregation, not scalar addition.
8) Planning quality checklist (must satisfy):
   - Decide whether this step's output is scalar or row-list and ensure it is needed by later steps.
   - If a scalar is needed from prior nodes, use "ref:nX" explicitly.
   - Avoid producing disconnected or unused branches.
   - Keep op choices semantically aligned with intent:
     - row aggregation: sum/average/count
     - scalar arithmetic: add/scale/diff (scalar-ref mode)
     - row selection/ranking: filter/sort/nth/findExtremum
9) QUESTION-DRIVEN INPUT SELECTION:
   When multiple available nodes could serve as inputs or scalar refs, resolve ambiguity by reading the QUESTION:
   - Ask: "What semantic role does the current step play in answering the question?"
   - Choose inputs/refs that match that semantic role, NOT simply the most recently computed node.
   Example:
     Available: n2=avg_top3, n4=avg_bottom3
     Task: "scale" (double the lowest average)
     Question mentions "lowest three" → target should be "ref:n4" (avg_bottom3), not n2.
   When the explanation sentence is ambiguous (e.g., "double the X" without naming X explicitly),
   derive X from the QUESTION before selecting the ref.

10) COMPREHENSIVE INPUTS GATHERING - 필수 규칙 (MUST APPLY):
   For comparison/ranking operations (findExtremum, compare, diff, pairDiff):

   CRITICAL RULE: inputs MUST include ALL available nodes that contribute
   to the semantic meaning of the current task.

   Specific cases (MUST apply):

   - findExtremum: If multiple candidate nodes exist (from different groups/times),
     inputs MUST contain ALL of them.
     Example:
       Available: n1 (Tablets 2017: 173.56), n2 (Mobile PCs 2022: 244.43)
       Task: findExtremum("field", which="max")
       → inputs MUST be ['n1', 'n2'], NOT ['n1'] alone
       → Rationale: "max between two values" requires BOTH values to compare
       → If only n1 is included, the max is not determined between the two candidates

   - compare/diff: MUST include exactly 2 nodes being compared

   - pairDiff: Include all relevant input nodes for the pair comparison

   IMPORTANT: The explanation sentence may be implicit about all needed inputs.
   Do NOT assume that "find maximum" or "check which is greater" requires only one input.
   Derive from the QUESTION's semantic intent: if the question asks to compare
   MULTIPLE values or entities, then ALL available candidate nodes must be inputs.

Mini pattern (subset average via inputs):
- Wrong:
  {
    "op_spec": { "op": "average", "field": "Installed base in million units", "group": ["2010", "2013", "2017"] },
    "inputs": []
  }
- Correct:
  1) filter subset first (include years) -> node n3
  2) average consumes that filter result
  {
    "op_spec": { "op": "average", "field": "Installed base in million units" },
    "inputs": ["n3"]
  }

Question:
$question

Explanation:
$explanation

Current task (fixed by pipeline):
$current_task_json

Remaining tasks S(O):
$remaining_tasks_json

Available executed nodes (you may reference them via nodeId; scalar outputs use "ref:nX"):
$available_nodes_json

Chart context:
$chart_context_json

Rows preview:
$rows_preview_json
