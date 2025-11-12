## 13) Quick Template (copyable)
Template is illustrative only; when answering, produce valid JSON with the allowed keys and no comments.
---

**Spec‑Version:** v1.3  
**Changelog:**
- Single‑source spec (removed duplicate/older versions).
- Operator set **normalized** (removed `eq`).
- `last` **chaining** via `last_i` allowed and validated.
- `text` upgraded to **Value‑Forward Narration** (names + numbers + composition).
- Examples revised with **concrete values** from provided datasets.
# NL → Spec Conversion Guideline (Single‑Sequence `ops` • v1.3 • 2025‑10‑26)

> **Design Rationale.** Explanations should be short, concrete, and value‑forward: state the slice (overview/selection), the operation (zoom/filter/aggregate), and the actual numeric/label results used to form the conclusion. This aligns with narrative visualization guidance on concise author‑driven annotations and explicit highlights (Segel & Heer, 2010) and with the “overview → zoom/filter → details‑on‑demand” interaction mantra (Shneiderman, 1996).

---

## 0) Purpose & IO Contract (Author‑Facing Prompt)

**You are given:**
1) **Data** (CSV/JSON; conceptually, a list of `DatumValue`).
2) **Chart** (e.g., Vega‑Lite spec).
3) **User’s Question** (natural language).
4) **Short Answer** (the final answer string/value).
5) **Natural‑Language Explanation** — the step‑by‑step reasoning/operations that produced the answer (this is the **primary input** you will convert to the grammar).
6) **Optional:** `textLocale` (UI locale like `"en-US"`, `"ko-KR"`) for `text` language.

**You must output:**
- A **single JSON object** with one or more **ordered operation lists**: `ops`, `ops2`, `ops3`, …
- **Core rule — Single‑Sequence per key:** Each top‑level list (`ops`, `ops2`, …) encodes **exactly one human‑perceived sequence** (see §2). Each list **must end in exactly one `Datum` or one `Boolean`.**
- If multiple sequences need to be combined **after** they finish, put the combining step(s) under **`last`** (optional). `last` also **must end** in exactly one `Datum` or one `Boolean`.
- **Human-readable annotations (`text`) — Visualization Narrative (REQUIRED):** Provide a top-level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and gives **descriptive narrative sentences** per key. Each sentence should **describe what the viewer would see on the chart as the step runs** (highlighting, sorting, filtering, comparisons), while still naming concrete fields/labels, numeric values (when known), and how those visuals combine into the final takeaway. Strings only; **no nested structure**.

Strict output format (HARD RULE): Output must be a single raw JSON object only — no sentinels, no markdown fences, no commentary. The first non-whitespace character MUST be { and the last MUST be }.

---

## 1) Runtime Value Types

class DatumValue {
  constructor(
    category: string,   // label field (e.g., 'country', 'brand')
    measure: string,    // value field (e.g., 'rating', 'sales')
    target: string,     // label value (e.g., 'KOR', 'iPhone')
    group: string|null, // subgroup label value (e.g., 'MSFT', 'AMZN', '2024')
    value: number,      // numeric value (e.g., 82, 1.25)
    id?: string         // runtime-assigned id for cross-list referencing
  ) {}
}
class IntervalValue { constructor(category: string, min: number, max: number) {} }
class ScalarValue   { constructor(value: number) {} }
class BoolValue     { constructor(category: string, bool: boolean) {} }
**Defaults:** If NL omits explicit field names → **label → `"target"`**, **measure → `"value"`**.  
**Groups:** In multi‑line, grouped‑bar, stacked‑bar charts, `group` is a **concrete subgroup label value** (e.g., `"MSFT"`, `"AMZN"`, `"2024"`), **not** a field name. The runtime infers the group field from the chart encoding. Never pass the dimension name itself (e.g., do **not** write `"group":"Continent"`); instead, spin up individual sequences that explicitly isolate each subgroup label (`"Africa"`, `"Asia"`, …) and hand their IDs to `last` for any comparisons or narration.

---

## 2) The Single‑Sequence Rule (What belongs in one `ops`?)
**Sequence Unit:** A sequence is a **single linear chain** whose step B consumes step A’s result, as signaled by *then, next, within, after*. Encode each such chain in **one** key (`ops`, `ops2`, …).

**Segmentation heuristics:**
- **Keep together** when NL implies linear dependence: “Filter to 2007, then sum price” → one list.
- **Split** when NL implies **independent calculations** compared/combined later: “Total sun (6–8) vs fog (10–12)” → two lists + combine in `last`.
- **Workflow fidelity:** Mirror what a human analyst would actually do on the chart. Shared steps such as a descending sort, focus filter, or highlight happen **once**, and every subsequent pick (e.g., 2nd and 5th) is taken from that same state using multi-target ops (`nth` arrays, multi-value filters, etc.). Do **not** duplicate identical `sort`/`filter` chains across `ops`, `ops2`, … just to grab different ranks—those ranks must be captured in one list and only combined/computed-in-`last` afterward.
- **Do not split** one linear chain across multiple keys. **Do not merge** independent chains into one key.
- **Per-group enumerations:** When NL asks for a statistic **per subgroup** (e.g., “average population for each continent”), create one sequence per subgroup (`ops`, `ops2`, …) and keep each sequence scoped to a single concrete `group` label. Do **not** rely on a single aggregate op with `"group":"<fieldName>"` to broadcast multiple subgroup values; gather each value separately and bring them together (or narrate them) via `last`.

**Quick‑check:**
1) Does step B require step A’s **result**? → **Same `ops`.**  
2) Are computations **independent** until the end? → **Different lists** + **`last`**.  
3) Different targets/series with no cross‑dependence until final comparison? → **Different lists**.

---

## 3) Canonical Parameters
- **`field`** — explicit field name preferred (e.g., `"country"`, `"rating"`), else defaults `"target"`/`"value"`.
- **`target`** — concrete **category value** (e.g., `"KOR"`, `"iPhone"`, `"2008-10-01"`).
- **`targetA` / `targetB`** — for `compare`/`compareBool`/`diff`.
  - In regular lists: category values (or dual-target `{category,series}` object).
  - In **`last`**: **IDs** of prior results (see §5).
- **`group`** — subgroup **label value** selecting a line/series/stack (e.g., `"MSFT"`, `"sun"`, `"Improve"`).
- **`which`** — `"max"|"min"`.
- **`order`** — `"asc"|"desc"`.
- **`operator`** — one of `">", ">=", "<", "<=", "==", "!=", "in", "not-in", "contains", "between"` (**no `eq`**). `between` is **inclusive** for **label ranges**.
- **`n` / `from`** — positional pick; `n` is 1‑based; `from` is `"left"|"right"`.
- **Field Availability:** Every `field`, `orderField`, or `group` you reference must exist in the chart spec or data encoding. Derived values (e.g., “positive year-over-year change”) must be constructed via supported operations (`lagDiff` + `filter` + `sum`), not by inventing a new field name.
- **Multi-select friendly ops:** Use `filter` with `operator:"in"` (and an array `value`) to keep multiple labels in the same sequence; `sort` keeps the entire ordered slice in memory; `nth` accepts a single rank or an array of ranks (emitting one datum per requested position); `lagDiff` naturally emits the whole list of adjacent differences. Lean on these capabilities instead of cloning entire sequences. Use `retrieveValue` only when you truly need a single label; otherwise prefer `filter`. Whenever you need to isolate just a few marks before aggregating (e.g., median of even-length lists), apply the multi-select, then aggregate in `last` so the visual state matches human expectations.
- **Break long workflows across `last`:** Keep each `ops` list focused on gathering/ordering the needed marks. When a sequence starts to mix selection, aggregation, and comparison logic, move the final aggregation or comparison into `last` so the earlier steps remain reusable (and other lists can reference those IDs). This also mirrors how a human would highlight several marks first, then compute with them afterward.
- **Break long workflows across `last`:** Keep each `ops` list focused on gathering/ordering the needed marks. When a sequence starts to mix selection, aggregation, and comparison logic, move the final aggregation or comparison into `last` so the earlier steps remain reusable (and other lists can reference those IDs). This also mirrors how a human would highlight several marks first, then compute with them afterward. Avoid chaining more than ~3 operations inside one list when the final result requires a different “mode” (e.g., highlight + sum, highlight + diff); gather first, compute later.
- **Scalar reuse rule:** If you need a derived scalar (e.g., an average) later in the workflow, restate the literal value or redo the intermediate steps inside that list. Do **not** attempt to drop an ID such as `"ops2_0"` into another op’s `value` or threshold—those placeholders are only legal inside `last`.

---

## 4) Supported Operations (use only these; `op` key is **required**)
Each list must **terminate** in exactly one `Datum` or `Boolean`.

- **`retrieveValue`** `{op, field, target, group?}` → `Datum[]`  
- **`filter`** `{op, field, operator, value, group?}` → `Data`  
  - `value` / `value2` must be literal numbers/strings/arrays. Do **not** point them to IDs like `"ops2_0"`; those IDs only exist for `last` lookups and the runtime will not resolve them mid-sequence.
- **`compare`** `{op, field, targetA, targetB, group?, aggregate?, which?}` → `Datum[]`  
- **`compareBool`** `{op, field, targetA, targetB, operator}` → `Boolean`  
- **`findExtremum`** `{op, field, which, group?}` → `Datum[]`  
- **`sort`** `{op, field, order, group?}` → `Datum[]`  
- **`determineRange`** `{op, field, group?}` → `Interval` (non‑terminal)  
- **`count`** `{op, group?}` → `Datum[]`  
- **`sum`** `{op, field, group?}` → `Datum[]`  
- **`average`** `{op, field, group?}` → `Datum[]`  
- **`diff`** `{op, field, targetA, targetB, group?, aggregate?, signed?}` → `Datum[]`  
- **`lagDiff`** `{op, field?, orderField?, order?, group?, absolute?}` → `Datum[]`  
  - Orders the current slice by `orderField` (default: category axis) and emits one datum per adjacent difference. Each datum’s `target` is the later category and includes `prevTarget` metadata so you can reference the prior label in `last` or text. Chain with `filter`/`sum` to answer prompts like “sum of all positive year-over-year changes” without repeating `diff`.
- **`nth`** `{op, field?, n, from?, group?}` → `Datum[]`

**Percentage-of-total diffs.** To express “what percent of the total is X?” or similar ratios, compute the total in one sequence, the focal value in another, then run `diff` with `aggregate: "percentage_of_total"` (or `"percent_of_total"`). This makes the runtime divide `targetA` by `targetB`, multiply by 100, and return a single datum (so you do not need an extra `multiply` step). Use `precision` to control rounding when needed.

---

**Special `nth` usage:** You may provide `n` as a single 1-based integer or as an array of integers (e.g., `[2,5]`). When `n` is an array, the returned `Datum[]` contains one datum for each requested rank (in the provided order); the runtime still assigns sequential IDs (`<opKey>_0`, `<opKey>_1`, …), letting `last` refer to any of them without re-running `sort`. This is the canonical way to answer prompts like “difference between the 2nd and 5th largest values”: `sort` once, `nth` with `[2,5]`, then `diff` over `ops_0` and `ops_1`.

### Ordering heuristics — prefer native axis order
- Treat the chart’s rendered axis order (e.g., time increasing left→right, categorical order given in the spec) as already sorted. Terms like “earliest”, “first”, “leftmost” map to `nth` with `"from":"left"`; “latest”, “last”, “rightmost” map to `nth` with `"from":"right"`.
- Only emit an explicit `sort` when NL **demands a reordering** (e.g., “sort the remaining bars descending by GDP”, “alphabetically first label after filtering”) or when ranking by a different measure than the axis encodes (e.g., “second-highest price”).
- Redundant `sort` + `nth` chains bloat the spec and can destabilize tie handling. Prefer the minimal deterministic sequence that still ends in a single datum.

- **Filter once, keep both labels:** `{"op":"filter","field":"country","operator":"in","value":["USA","FRA"]}` returns both rows so IDs `ops_0`, `ops_1` are ready for `last`. No duplicate filters needed.
- **Sort + `nth` arrays:** Perform a single `sort`, then `{"op":"nth","n":[2,5],"from":"left"}` to capture both ranks in order. The runtime assigns sequential IDs so you can `diff`/`compare` them immediately.
- **Ops that already emit lists:** `lagDiff`, `compare`, `determineRange`, and plain `filter`/`sort` keep every matching datum. Use that list directly (or trim it with another op) instead of spinning up parallel sequences.
- **Combine only at the end:** After a multi-select step, use `last` (or another terminal op) to compute comparisons, sums, or booleans across the captured IDs. This mirrors how a person would highlight several marks and then reason about them.
- **Median workflow tip:** For even-length sets, `sort` once, use `nth` with the two middle ranks (e.g., `[6,7]`), then compute the average inside `last` so only those two highlighted marks remain on screen during the final step.


## 5) IDs & `last` Referencing (incl. `last_i` chaining)
- After each **non‑`last`** list runs, the runtime assigns IDs to returned `DatumValue`s:
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0"
- In **`last`**, always reference prior results by **ID** (e.g., `"ops_0"`, `"ops2_0"`). **Never** use raw labels here.
- Outside of `last`, IDs are **opaque** — you cannot plug `"ops_0"` into another op’s `value`, `target`, or threshold field. If a later step needs a scalar/label produced earlier, restate the literal number/label (the LLM must compute it) or restructure the workflow so the comparison happens inside `last`.
- **Reusing IDs inside the same sequence:** Every operation (bar/line/stacked/grouped) now preserves its result dataset for later steps and automatically aliases each returned `DatumValue` with an `ops_*` style ID (`ops_0`, `ops_1`, …). This means later operations in the **same** sequence can freely refer to those IDs in supported fields like `targetA`, `targetB`, `compareAgainst`, etc. Example:
  ```json
  {
    "ops": [
      { "op": "retrieveValue", "field": "Religious", "target": "Hindu", "group": "Literacy (%)" },
      { "op": "retrieveValue", "field": "Religious", "target": "Hindu", "group": "Work participation (%)" },
      { "op": "diff", "field": "value", "targetA": "ops_0", "targetB": "ops_1", "aggregate": "ratio", "precision": 4 }
    ],
    "last": [
      { "op": "compare", "field": "value", "targetA": "ops_2", "targetB": "ops2_2", "which": "max" }
    ]
  }
  ```
  Here `ops_0` and `ops_1` come from the earlier `retrieveValue` steps in `ops`, the `diff` emits a new datum aliased as `ops_2`, and `last` can compare that ratio against a parallel `ops2_2`. No manual ID wiring is needed—the runtime assigns and carries the IDs automatically.
- You may chain results inside `last` by referring to **previous `last` outputs** as `"last_<i>"` (0‑based within `last`).
- `last` also **must end** in a **single** `Datum` or `Boolean`.

---

## 6) Normalization & Determinism
- If NL omits fields: **label → `"target"`**, **measure → `"value"`**.  
- Synonyms: “largest/highest/top” → `which:"max"`; “smallest/lowest/bottom” → `which:"min"`.  
- If a sequence might return **multiple** items before the terminal step, add steps (`sort`+`nth`, extra `filter`) so the list ends in **exactly one** `Datum` or **one** `Boolean**, unless the final operation intentionally emits multiple ranks (for example, using `nth` with an array of indices); those cases still terminate the list while yielding one datum per rank for later `last` references.  
- The **rendered axis order is authoritative**. Treat chronological/categorical order as already sorted and reach for `nth` with `from:"left"`/`"right"` (or arrays) instead of bolting on a `sort`, unless the prompt explicitly asks for a different ordering criterion (e.g., alphabetical, highest/lowest by value).  
- **Prefer single-pass multi-selects.** When the NL prompt requires multiple picks from the same slice (e.g., “2nd vs 5th largest”), run the shared steps once, then use array-friendly ops (`nth`, `filter` with `in`, `retrieveValue` with multiple targets) to collect every needed datum before handing IDs to `last`. Do **not** duplicate identical sequences just to capture another rank.
- Never invent standalone fields (e.g., `"PositiveYearOverYearChanges"`). Compose derived measures via supported ops such as `lagDiff`, `filter`, `sum`, `diff`, etc., so the runtime can recompute them from the chart data.
- Numbers in JSON must be numbers (not strings).

---

## 7) Human‑Readable `text` — **Visualization Narrative** (REQUIRED)
- No Markdown formatting in text values (no bold, backticks, or lists); use plain sentences.
- Avoid emphasis markers entirely (no `**value**`, `_value_`, or HTML tags). Just write the words/numbers.
- Top‑level **`text`** **must** be present; its keys **mirror** the actual lists (`ops`, `ops2`, `ops3`, `last`).
- **Describe the visualization actions, not just the statistics.** Each value should read like stage directions for the viewer: note what part of the chart is focused, which marks are re‑ordered or highlighted, and why.
- Use **process language** (“start by sorting...”, “then spotlight...”, “finally place both bars side by side...”) so readers can imagine the animation steps.
- Still mention concrete labels and numeric values (when known), but weave them into the visual description (e.g., “Then spotlight the second tallest bar, France, at 2.4T after the descending sort.”).
- When `last` combines sequences, explicitly narrate how previously highlighted elements are brought together or contrasted (“Finally bring forward the two highlighted GDP bars and read their 2.1T vs 1.7T heights to compute the signed difference.”).
- Language: use `textLocale` if provided; otherwise English.  
- `text` does **not** affect execution and has no IDs.

---

## 8) Output Contract (STRICT)
Allowed top-level keys: ops, ops2, ops3, ops4, ops5, ops6, ops7 (extend as needed), last, text.
Forbidden top-level keys: notes, explanation, meta, BEGIN_JSON, END_JSON, code, comment.
Do not include any keys beyond the allowed set.
- `ops` (required): array of operation objects encoding **one sequence**.  
- `ops2`, `ops3`, … (optional): additional sequences.  
- `last` (optional): combines earlier results by ID; may chain via `last_i`.  
- `text` (required): **value‑forward** strings mirroring keys.  
No top‑level JSON arrays; no extra prose.

---

## 9) Authoring Checklist (for LLMs)
1. Map fields to explicit names when possible; else defaults.  
2. Apply the **Single‑Sequence** rule per list.  
3. Use **only** §4 operations; include `op` key.  
4. Ensure termination: each list ends in one `Datum` or one `Boolean`.  
5. In `last`, reference results by **ID**; chain via `last_i` if needed.  
6. Use numeric types for numbers; avoid `eq`.  
7. Write **`text`** as a visualization narrative: describe the on-screen action, mention concrete labels/numbers when known, and explain how those highlighted visuals lead to the final result.  
8. Prefer single-pass multi-selects (filters with `in`, `nth` arrays, `lagDiff`, etc.) instead of duplicating identical sequences for each target.  
9. Guard against ties/non‑determinism.

---

## 10) Validator Rules (+ snippet)
- **Reject** if any list doesn’t terminate in exactly one `Datum`/`Boolean`.  
- **Reject** if `last` uses raw labels instead of IDs.  
- **Reject** if `text` is missing, its keys don’t mirror lists, or values aren’t plain strings.  
- **Warn** if a list contains a terminal op followed by more ops (merged sequences suspected).  
- **Warn** if determinism is unclear.

type Op = { op: string; [k: string]: any };
interface Program { [k: string]: Op[] | any }

const LIST_KEYS = ["ops","ops2","ops3","ops4","ops5","ops6","ops7"]; // extend as needed
const TERMINAL = new Set(["compare","compareBool","findExtremum","sum","average","diff","lagDiff","count","nth","retrieveValue"]);
const NON_TERMINAL = new Set(["filter","sort","determineRange"]);

function validate(spec: Program) {
  const errors: string[] = []; const warns: string[] = [];
  if (!spec || typeof spec !== "object") errors.push("Top-level must be an object");
  if (!spec.text || typeof spec.text !== "object") errors.push("Missing top-level text object");

  const listKeys = LIST_KEYS.filter(k => Array.isArray(spec[k]));
  if (listKeys.length === 0) errors.push("At least one list (ops, ops2, …) is required");

  const expectedText = new Set([...listKeys, ...(spec.last ? ["last"] : [])]);
  for (const k of expectedText) if (typeof spec.text[k] !== "string") errors.push(`text.${k} must be a plain string`);
  for (const k of Object.keys(spec.text)) if (!expectedText.has(k)) warns.push(`text.${k} has no corresponding list`);

  function checkList(key: string) {
    const ops: Op[] = spec[key];
    if (!Array.isArray(ops) || ops.length === 0) { errors.push(`${key} must be a non-empty array`); return; }
    for (let i = 0; i < ops.length - 1; i++) {
      if (TERMINAL.has(ops[i].op)) warns.push(`${key}[${i}] is terminal but followed by more ops (possible merged sequences)`);
    }
    const last = ops[ops.length - 1];
    if (!TERMINAL.has(last.op)) errors.push(`${key} must end in a terminal op (got "${last.op}")`);
  }
  for (const k of listKeys) checkList(k);

  const ids = new Set<string>(); for (const k of listKeys) ids.add(`${k}_0`);

  if (spec.last) {
    const lastOps: Op[] = spec.last;
    if (!Array.isArray(lastOps) || lastOps.length === 0) errors.push("last must be a non-empty array when present");
    const lastIds = new Set<string>();
    for (let i=0;i<lastOps.length;i++) {
      const op = lastOps[i];
      if (!TERMINAL.has(op.op)) errors.push(`last[${i}] must be terminal (got "${op.op}")`);
      lastIds.add(`last_${i}`);
      for (const f of ["targetA","targetB"]) {
        const v = op[f];
        if (typeof v === "string" && !(ids.has(v) || lastIds.has(v))) {
          errors.push(`last[${i}].${f} must reference an ID from prior lists or previous last steps`);
        }
      }
    }
    const end = lastOps[lastOps.length - 1];
    if (!TERMINAL.has(end.op)) errors.push("last must end in a terminal op");
  }

  return { valid: errors.length === 0, errors, warns };
}

---

## 11) Converting NL **Explanation** → JSON (with numbers & labels)
1) **Segment** the explanation into human‑perceived sequences → map to `ops`, `ops2`, … (Single‑Sequence rule).  
2) **Map** each sentence/phrase to §4 ops.  
3) **Enforce determinism** so each list ends in one `Datum`/`Boolean`.  
4) **Combine** independent results in `last` using **IDs** (allow chaining via `last_i`).  
5) **Author `text`** as a visualization narrative: describe what the chart is doing in that step, mention the concrete labels/numbers involved, and state how those visuals compose into the final answer.

**Meta‑Prompt Template**
Convert the provided natural-language explanation into the NL→Spec grammar.
- Apply the Single-Sequence rule: one human-perceived sequence per list key.
- Use only the supported ops. End each list in exactly one Datum or one Boolean.
- If combining results, put the final step(s) under `last` and reference earlier outputs by ID (ops_0, ops2_0, …).

---

## 12) Examples (Using ONLY the provided datasets/specs)

### 12.1 Ratings — Simple retrieval + `text`
**Data/Chart:** `bar_simple_ver.csv` (`country`, `rating`).  
**Q:** “Give me the value for **KOR**.”  
**Short Answer:** `KOR: 52`
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "Retrieve the rating where country = KOR and read the resulting value 52."
  }
}

---

### 12.2 Ratings — Parallel lists + `last` compare (returns a Datum)
**Q:** “Between **KOR** and **JPN**, which has the higher rating?”  
**Short Answer:** `KOR`
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "ops2": [
    { "op": "retrieveValue", "field": "country", "target": "JPN" }
  ],
  "last": [
    { "op": "compare", "field": "rating", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" }
  ],
  "text": {
    "ops": "Get KOR’s rating 52.",
    "ops2": "Get JPN’s rating 42.",
    "last": "Compare 52 against 42 and return KOR (the higher mark)."
  }
}

---

### 12.3 Ratings — Find maximum + `text`
**Q:** “Which country has the highest rating?”  
**Short Answer:** `NLD`
{
  "ops": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "text": {
    "ops": "Find the country with the maximum rating and report NLD at 76."
  }
}

---

### 12.4 Ratings — Threshold → alphabetical pick
**Q:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `GBR`
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "country", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "Eligible labels are {GBR:75, IRL:70, NLD:76}; after sorting A→Z, pick GBR."
  }
}

---

### 12.4a Chronological edges — latest minus earliest (no extra sort)
**Data/Chart:** `bar_simple_201_7.csv` (`Year`, `Gross Domestic Product`).  
**Q:** “What is the latest value minus the earliest value?”  
**Short Answer:** `14019`
{
  "ops": [
    { "op": "nth", "field": "Year", "n": 1, "from": "right" }
  ],
  "ops2": [
    { "op": "nth", "field": "Year", "n": 1, "from": "left" }
  ],
  "last": [
    { "op": "diff", "field": "Gross Domestic Product", "targetA": "ops_0", "targetB": "ops2_0", "signed": true }
  ],
  "text": {
    "ops": "Grab the rightmost (latest) year 2005 with GDP 21,783.",
    "ops2": "Grab the leftmost (earliest) year 1980 with GDP 7,764.",
    "last": "Compute 21,783 − 7,764 → 14,019."
  }
}

---

### 12.4b Percent of total via `diff.aggregate`
**Data/Chart:** `bar_simple_201_7.csv` (`Year`, `Gross Domestic Product`).  
**Q:** “What percent of the total is the maximum value (one decimal)?”  
**Short Answer:** `35.7%`
{
  "ops": [
    { "op": "sum", "field": "Gross Domestic Product" }
  ],
  "ops2": [
    { "op": "findExtremum", "field": "Gross Domestic Product", "which": "max" }
  ],
  "last": [
    { "op": "diff", "field": "value", "targetA": "ops2_0", "targetB": "ops_0", "aggregate": "percentage_of_total", "precision": 1 }
  ],
  "text": {
    "ops": "Total GDP is 61,009.",
    "ops2": "Maximum GDP is 21,783 (year 2005).",
    "last": "21,783 ÷ 61,009 × 100 → 35.7%."
  }
}

---

### 12.5 Ratings — Compare to global max (Boolean)
**Q:** “Is **KOR**’s rating greater than the max‑rating country?”  
**Short Answer:** `false`
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "ops2": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "last": [
    { "op": "compareBool", "field": "rating", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "KOR’s rating is 52.",
    "ops2": "Global maximum is NLD at 76.",
    "last": "Compare 52 > 76 → false."
  }
}

---
### 12.4c GDP median (even count) — average the middle pair in `last`
**Data/Chart:** `line_simple_202_135.csv` (`Year`, `Average audience share (m)`)  
**Q:** “What is the median value after sorting by year?”  
**Short Answer:** `≈11.03`
{
  "ops": [
    { "op": "sort", "field": "Year", "order": "asc" },
    { "op": "nth", "field": "Year", "n": [6, 7], "from": "left" }
  ],
  "last": [
    { "op": "average", "field": "Average audience share (m)", "targetA": "ops_0", "targetB": "ops_1" }
  ],
  "text": {
    "ops": "Sort the timeline once, then spotlight the two middle years (2001–2002 at 10.77 and 2002–2003 at 11.29).",
    "last": "With only those two marks highlighted, average their heights to show the median of about 11.03."
  }
}

---

### 12.6 Weather (stacked vertical) — seasonal totals across series
**Data/Chart:** `bar_stacked_ver.csv` (`month`, `weather` series, `count`).  
**Q:** “Is the total **sun** count in summer (6–8월) greater than the total **fog** count in Q4 (10–12월)?”  
**Short Answer:** `true`
{
  "ops": [
    { "op": "filter", "field": "month", "operator": "in", "value": [6,7,8], "group": "sun" },
    { "op": "sum", "field": "count", "group": "sun" }
  ],
  "ops2": [
    { "op": "filter", "field": "month", "operator": "in", "value": [10,11,12], "group": "fog" },
    { "op": "sum", "field": "count", "group": "fog" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Summer sun total is 268 (85+89+94).",
    "ops2": "Q4 fog total is 159 (55+50+54).",
    "last": "Compare 268 vs 159 → true."
  }
}

---

### 12.6b Stacked populations — per-continent averages
**Data/Chart:** `bar_stacked_202_44.csv` (`Year`, `Continent`, `Population`).  
**Q:** “Across the shown years, which continent has the highest average total population, and what are those averages?”  
**Short Answer:** `Asia leads with ≈1.915B (vs Africa ≈0.316B, Europe ≈0.631B, Latin America ≈0.251B, Northern America ≈0.219B, Oceania ≈0.018B)`
{
  "ops": [
    { "op": "filter", "field": "Continent", "operator": "==", "value": "Africa" },
    { "op": "average", "field": "Population" }
  ],
  "ops2": [
    { "op": "filter", "field": "Continent", "operator": "==", "value": "Asia" },
    { "op": "average", "field": "Population" }
  ],
  "ops3": [
    { "op": "filter", "field": "Continent", "operator": "==", "value": "Europe" },
    { "op": "average", "field": "Population" }
  ],
  "ops4": [
    { "op": "filter", "field": "Continent", "operator": "==", "value": "Latin America" },
    { "op": "average", "field": "Population" }
  ],
  "ops5": [
    { "op": "filter", "field": "Continent", "operator": "==", "value": "Northern America" },
    { "op": "average", "field": "Population" }
  ],
  "ops6": [
    { "op": "filter", "field": "Continent", "operator": "==", "value": "Oceania" },
    { "op": "average", "field": "Population" }
  ],
  "last": [
    { "op": "compare", "field": "Population", "targetA": "ops2_0", "targetB": "ops_0", "which": "max" },
    { "op": "compare", "field": "Population", "targetA": "last_0", "targetB": "ops3_0", "which": "max" },
    { "op": "compare", "field": "Population", "targetA": "last_1", "targetB": "ops4_0", "which": "max" },
    { "op": "compare", "field": "Population", "targetA": "last_2", "targetB": "ops5_0", "which": "max" },
    { "op": "compare", "field": "Population", "targetA": "last_3", "targetB": "ops6_0", "which": "max" }
  ],
  "text": {
    "ops": "Filter to the Africa stacks and average their heights across the years to land near 316M people.",
    "ops2": "Do the same for Asia, whose towering stacks average roughly 1.91B per year.",
    "ops3": "Repeat for Europe to get about 631M per year once its stacks are isolated.",
    "ops4": "Latin America’s stacks average roughly 251M across the shown years.",
    "ops5": "Northern America settles near a 219M yearly average.",
    "ops6": "Oceania’s thinner stacks average around 17.7M.",
    "last": "Bring all six averages onto the stage and keep the tallest glow on Asia (~1.91B), clearly above Europe (~0.63B) and the remaining continents."
  }
}

---

### 12.7 Grouped horizontal (Urban vs Total) — per‑country gaps
**Data/Chart:** `bar_grouped_hor.csv` (`Country`, `Urban/total` series, `Persons per square kilometers`).  
**Q:** “Between **Macau** and **Singapore**, which has the larger absolute gap `Urban − Total`?”  
**Short Answer:** `Macau`
{
  "ops": [
    { "op": "diff",
      "field": "Persons per square kilometers",
      "targetA": {"category":"Macau","series":"Urban"},
      "targetB": {"category":"Macau","series":"Total"},
      "signed": false }
  ],
  "ops2": [
    { "op": "diff",
      "field": "Persons per square kilometers",
      "targetA": {"category":"Singapore","series":"Urban"},
      "targetB": {"category":"Singapore","series":"Total"},
      "signed": false }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" }
  ],
  "text": {
    "ops": "Macau gap |26.0 − 20.8| = 5.2.",
    "ops2": "Singapore gap |7.5 − 7.4| = 0.1.",
    "last": "Compare 5.2 vs 0.1 and report Macau."
  }
}

---

### 12.8 Stacked horizontal (opinions) — EU5 three‑way totals
**Data/Chart:** `bar_stacked_hor.csv` (`Country`, `opinion` series, `percentage`).  
**Q:** “Across **EU5** (Britain, Germany, Spain, France, Italy), which opinion has the highest total percentage?”  
**Short Answer:** `Worsen (193)`
{
  "ops": [
    { "op": "filter", "field": "Country", "operator": "in",
      "value": ["Britain","Germany","Spain","France","Italy"], "group": "Improve" },
    { "op": "sum", "field": "percentage", "group": "Improve" }
  ],
  "ops2": [
    { "op": "filter", "field": "Country", "operator": "in",
      "value": ["Britain","Germany","Spain","France","Italy"], "group": "Remain the same" },
    { "op": "sum", "field": "percentage", "group": "Remain the same" }
  ],
  "ops3": [
    { "op": "filter", "field": "Country", "operator": "in",
      "value": ["Britain","Germany","Spain","France","Italy"], "group": "Worsen" },
    { "op": "sum", "field": "percentage", "group": "Worsen" }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" },
    { "op": "compare", "field": "value", "targetA": "last_0", "targetB": "ops3_0", "which": "max" }
  ],
  "text": {
    "ops": "EU5 ‘Improve’ total 130 (32+29+25+22+22).",
    "ops2": "EU5 ‘Remain the same’ total 171 (35+43+27+37+29).",
    "ops3": "EU5 ‘Worsen’ total 193 (32+27+47+40+47).",
    "last": "Compare the three totals and report Worsen at 193."
  }
}

---

### 12.9 Grouped vertical (age × gender) — extremum in a label range
**Data/Chart:** `bar_grouped_ver.csv` (`age`, `gender` series, `people`).  
**Q:** “Among **Female** values for ages **35–55**, which age has the largest population?”  
**Short Answer:** `35`
{
  "ops": [
    { "op": "filter", "field": "age", "operator": "between", "value": [35,55], "group": "Female" },
    { "op": "findExtremum", "field": "people", "which": "max", "group": "Female" }
  ],
  "text": {
    "ops": "Female ages 35–55 → max at age 35 with 11,635,647 (then 40: 11,488,578; 45: 10,261,253; 50: 8,911,133; 55: 6,921,268)."
  }
}

---

### 12.10 Multi‑line stocks — series max vs yearly average
**Data/Chart:** `line_multiple.csv` (`symbol` series, `date`, `price`).  
**Q:** “After **2007‑01‑01**, is **MSFT**’s **maximum** price greater than **AMZN**’s **average** in **2007**?”  
**Short Answer:** `false`
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2007-01-01", "group": "MSFT" },
    { "op": "findExtremum", "field": "price", "which": "max", "group": "MSFT" }
  ],
  "ops2": [
    { "op": "filter", "field": "date", "operator": "between",
      "value": ["2007-01-01","2007-12-31"], "group": "AMZN" },
    { "op": "average", "field": "price", "group": "AMZN" }
  ],
  "last": [
    { "op": "compareBool", "field": "price", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "MSFT after 2007‑01‑01 peaks at 35.03 (on 2007‑10‑01).",
    "ops2": "AMZN in 2007 averages about 69.95 over 12 months.",
    "last": "Compare 35.03 vs 69.95 → false."
  }
}

---

### 12.11 Multi‑line stocks — same‑date comparison (Boolean)
**Q:** “On **2008‑10‑01**, is **MSFT** higher than **AMZN**?”  
**Short Answer:** `false`
{
  "ops": [
    { "op": "retrieveValue", "field": "date", "target": "2008-10-01", "group": "MSFT" }
  ],
  "ops2": [
    { "op": "retrieveValue", "field": "date", "target": "2008-10-01", "group": "AMZN" }
  ],
  "last": [
    { "op": "compareBool", "field": "price", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "MSFT at 2008‑10‑01 is 21.57.",
    "ops2": "AMZN at 2008‑10‑01 is 57.24.",
    "last": "Compare 21.57 > 57.24 → false."
  }
}

---

### 12.12 Multi‑line stocks — same‑date difference (signed)
**Q:** “What is **MSFT − AMZN** on **2008‑10‑01**?”  
**Short Answer:** `−35.67`
{
  "ops": [
    { "op": "diff",
      "field": "price",
      "targetA": { "category": "2008-10-01", "series": "MSFT" },
      "targetB": { "category": "2008-10-01", "series": "AMZN" },
      "signed": true }
  ],
  "text": {
    "ops": "Difference at 2008‑10‑01 is 21.57 − 57.24 = −35.67."
  }
}

---

### 12.13 Multi‑line stocks — second‑highest within a series
**Q:** “What is the **second‑highest** **AMZN** value?”  
**Short Answer:** `134.52 (2009‑12‑01)`
{
  "ops": [
    { "op": "sort", "field": "value", "order": "desc", "group": "AMZN" },
    { "op": "nth", "n": 2, "from": "left", "group": "AMZN" }
  ],
  "text": {
    "ops": "AMZN values sorted descending → 1st 135.91 (2009‑11‑01), 2nd 134.52 (2009‑12‑01). Return the second."
  }
}

---

### 12.14 Multi‑line stocks — average after a cutoff (single sequence)
**Q:** “After **2007‑01‑01**, what is **MSFT**’s **average** price?”  
**Short Answer:** `≈27.91`
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2007-01-01", "group": "MSFT" },
    { "op": "average", "field": "price", "group": "MSFT" }
  ],
  "text": {
    "ops": "MSFT dates ≥ 2007‑01‑01 → average price about 27.91."
  }
}

> *If the runtime cannot compute a number at authoring time, keep the sentence structure but omit the numeric (still list labels/operations).*

### 12.15 Year-over-year gains — sum of positive changes
**Q:** “What is the sum of all positive **year-over-year** changes in **Winnings**?”  
**Short Answer:** `1,133,363`
{
  "ops": [
    { "op": "lagDiff", "field": "Winnings", "orderField": "Year" },
    { "op": "filter", "field": "value", "operator": ">", "value": 0 },
    { "op": "sum", "field": "value" }
  ],
  "text": {
    "ops": "Compute adjacent differences in Winnings (by Year), keep the positive ones (440, 44,416, 95,020, …), then sum them to 1,133,363."
  }
}

---

### 12.16 GDP line — difference between 2nd and 5th largest values
**Data/Chart:** `line_simple_201_7.csv` (`Year`, `Gross Domestic Product`)  
**Q:** “What is the difference between the **2nd** and **5th** largest GDP values?”  
**Short Answer:** `2000 (11,570) minus 1985 (6,450) = 5,120`
{
  "ops": [
    { "op": "sort", "field": "Gross Domestic Product", "order": "desc" },
    { "op": "nth", "field": "Gross Domestic Product", "n": [2, 5], "from": "left" }
  ],
  "last": [
    { "op": "diff", "field": "Gross Domestic Product", "targetA": "ops_0", "targetB": "ops_1", "signed": true }
  ],
  "text": {
    "ops": "Sort the GDP line once (tallest to shortest) and, in that same view, spotlight the 2nd and 5th tallest markers—2000 at 11,570 and 1985 at 6,450.",
    "last": "With both highlights still glowing, bring them together and read their heights side by side to show the signed difference of roughly 5,120."
  }
}

---

### 12.17 Simple bar — filter once, compare two countries
**Data/Chart:** `bar_simple_ver.csv` (`country`, `rating`)  
**Q:** “How much higher is **GBR** than **FRA**?”  
**Short Answer:** `75 − 56 = 19`
{
  "ops": [
    { "op": "filter", "field": "country", "operator": "in", "value": ["GBR", "FRA"] }
  ],
  "last": [
    { "op": "diff", "field": "rating", "targetA": "ops_0", "targetB": "ops_1", "signed": true }
  ],
  "text": {
    "ops": "Filter the bar chart once so GBR (75) and FRA (56) remain lit side-by-side, keeping both highlights alive.",
    "last": "With both highlights still visible, place them together and read their heights (75 vs 56) to narrate the +19 difference."
  }
}

---

### 12.18 Audience share — sum of top two + bottom two
**Data/Chart:** `line_simple_202_135.csv` (`Year`, `Average audience share (m)`)  
**Q:** “What is the sum of the top two and bottom two values?”  
**Short Answer:** `42.51`
{
  "ops": [
    { "op": "sort", "field": "Average audience share (m)", "order": "desc" },
    { "op": "nth", "field": "Average audience share (m)", "n": [1, 2, 11, 12], "from": "left" }
  ],
  "last": [
    { "op": "sum", "field": "Average audience share (m)", "targetA": "ops_0", "targetB": "ops_1" },
    { "op": "sum", "field": "Average audience share (m)", "targetA": "last_0", "targetB": "ops_2" },
    { "op": "sum", "field": "Average audience share (m)", "targetA": "last_1", "targetB": "ops_3" }
  ],
  "text": {
    "ops": "Sort the series once, then keep the two tallest marks (15.82, 14.35) and the two shortest marks (6.90, 5.44) highlighted.",
    "last": "Sequentially add the top pair (≈30.17), add the first bottom value (≈37.07), then add the final bottom value to reach about 42.51. Each addition happens after the highlights so the viewer sees which bars are being combined."
  }
}

---

## 13) References (for authors)
- Segel, E., & Heer, J. (2010). **Narrative Visualization: Telling Stories with Data.** *IEEE TVCG, 16(6)*, 1139–1148.  
- Shneiderman, B. (1996). **The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations.** *IEEE VL/HCC*.  

These motivate concise author‑driven annotations, highlights of key values, and staging of selection → operation → result, which our `text` rules operationalize.
