## 13) Quick Template (copyable)
Template is illustrative only; when answering, produce valid JSON with the allowed keys and no comments.
---

**Spec‑Version:** v1.3 (Data-Focused Revision)
**Changelog:**
- Single‑source spec (removed duplicate/older versions).
- Operator set **normalized** (removed `eq`).
- `last` runs as a **single-step combiner** that references only precomputed IDs (`ops_*`, `ops2_*`, …). No `last_i` chaining.
- `text` upgraded to **Data Narrative** (natural explanations of findings, not operations).
- Examples revised with **conversational data-focused language** from provided datasets.

# NL → Spec Conversion Guideline (Single‑Sequence `ops` • v1.3 • 2025‑11‑14)

> **Design Rationale.** Explanations should be natural, conversational, and data-forward: state what you found (the actual values, labels, patterns), how they relate, and what conclusion they support. Avoid describing chart operations or technical procedures. This aligns with how humans naturally explain data insights in conversation—focusing on the story the data tells, not the mechanics of how it was retrieved.

> **Authoring Mindset.** You are **not** "discovering" the answer on the fly. You already know the final response, every intermediate value (`ops_0`, `ops2_0`, …), and what the data shows. Your job is to explain the *data story* a knowledgeable colleague would tell: describe the relevant values, their relationships, and how they lead to the answer. Never describe chart operations or technical steps—focus on what the numbers mean and how they answer the question.

---

## 0) Purpose & IO Contract (Author‑Facing Prompt)

**You are given:**
1) **Data** (CSV/JSON; conceptually, a list of `DatumValue`).
2) **Chart** (e.g., Vega‑Lite spec).
3) **User's Question** (natural language).
4) **Short Answer** (the final answer string/value).
5) **Natural‑Language Explanation** — the step‑by‑step reasoning/operations that produced the answer (this is the **primary input** you will convert to the grammar).
6) **Optional:** `textLocale` (UI locale like `"en-US"`, `"ko-KR"`) for `text` language.

**You must output:**
- A **single JSON object** with one or more **ordered operation lists**: `ops`, `ops2`, `ops3`, …
- **Core rule — Single‑Sequence per key:** Each top‑level list (`ops`, `ops2`, …) encodes **exactly one human‑perceived sequence** (see §2). Each list **must end in exactly one `Datum` or one `Boolean`.**
- If multiple sequences need to be combined **after** they finish, put the single combining step under **`last`** (optional). `last` also **must end** in exactly one `Datum` or one `Boolean`.
- **Human-readable annotations (`text`) — Data Narrative (REQUIRED):** Provide a top-level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and gives **natural explanations of what the data shows** per key. Each sentence should **describe the findings, values, and patterns** in conversational language, as if explaining to a colleague over coffee. Strings only; **no nested structure**.

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
**Groups:** In multi‑line, grouped‑bar, stacked‑bar charts, `group` is a **concrete subgroup label value** (e.g., `"MSFT"`, `"AMZN"`, `"2024"`), **not** a field name. The runtime infers the group field from the chart encoding. Never pass the dimension name itself (e.g., do **not** write `"group":"Continent"`); instead, spin up individual sequences that explicitly isolate each subgroup label (`"Africa"`, `"Asia"`, …) and hand their IDs to `last` for any comparisons or narration. Likewise, avoid redundant filters like `{"op":"filter","field":"Type","operator":"==","value":"Birth"}` when the target operation already supports `group:"Birth"`—use the `group` slot directly so the animation reflects the chart's native series switching in one step.

---

## 2) The Single‑Sequence Rule (What belongs in one `ops`?)

**Sequence Unit:** A sequence is a **single linear chain** whose step B consumes step A's result, as signaled by *then, next, within, after*. Encode each such chain in **one** key (`ops`, `ops2`, …).

**Segmentation heuristics:**
- **Keep together** when NL implies linear dependence: "Filter to 2007, then sum price" → one list.
- **Split** when NL implies **independent calculations** compared/combined later: "Total sun (6–8) vs fog (10–12)" → two lists + combine in `last`.
- **Workflow fidelity:** Mirror what a human analyst would actually do on the chart. Shared steps such as a descending sort, focus filter, or highlight happen **once**, and every subsequent pick (e.g., 2nd and 5th) is taken from that same state using multi-target ops (`nth` arrays, multi-value filters, etc.). Do **not** duplicate identical `sort`/`filter` chains across `ops`, `ops2`, … just to grab different ranks—those ranks must be captured in one list and only combined/computed-in-`last` afterward.
- **Do not split** one linear chain across multiple keys. **Do not merge** independent chains into one key.
- **Per-group enumerations:** When NL asks for a statistic **per subgroup** (e.g., "average population for each continent"), create one sequence per subgroup (`ops`, `ops2`, …) and keep each sequence scoped to a single concrete `group` label. Do **not** rely on a single aggregate op with `"group":"<fieldName>"` to broadcast multiple subgroup values; gather each value separately and bring them together (or narrate them) via `last`.

**Quick‑check:**
1) Does step B require step A's **result**? → **Same `ops`.**  
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
- **Field Availability:** Every `field`, `orderField`, or `group` you reference must exist in the chart spec or data encoding. Derived values (e.g., "positive year-over-year change") must be constructed via supported operations (`lagDiff` + `filter` + `sum`), not by inventing a new field name.
- **Multi-select friendly ops:** Use `filter` with `operator:"in"` (and an array `value`) to keep multiple labels in the same sequence; `sort` keeps the entire ordered slice in memory; `nth` accepts a single rank or an array of ranks (emitting one datum per requested position); `lagDiff` naturally emits the whole list of adjacent differences. Lean on these capabilities instead of cloning entire sequences. Use `retrieveValue` only when you truly need a single label; otherwise prefer `filter`. Whenever you need to isolate just a few marks before aggregating (e.g., median of even-length lists), apply the multi-select, then aggregate in `last` so the visual state matches human expectations.
- **Break long workflows across `last`:** Keep each `ops` list focused on gathering/ordering the needed marks. When a sequence starts to mix selection, aggregation, and comparison logic, move the final aggregation or comparison into `last` so the earlier steps remain reusable (and other lists can reference those IDs). This also mirrors how a human would highlight several marks first, then compute with them afterward. Avoid chaining more than ~3 operations inside one list when the final result requires a different "mode" (e.g., highlight + sum, highlight + diff); gather first, compute later.
- **Scalar reuse rule:** If you need a derived scalar (e.g., an average) later in the workflow, restate the literal value or redo the intermediate steps inside that list. Do **not** attempt to drop an ID such as `"ops2_0"` into another op's `value` or threshold—those placeholders are only legal inside `last`.

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
  - Orders the current slice by `orderField` (default: category axis) and emits one datum per adjacent difference. Each datum's `target` is the later category and includes `prevTarget` metadata so you can reference the prior label in `last` or text. Chain with `filter`/`sum` to answer prompts like "sum of all positive year-over-year changes" without repeating `diff`.
- **`nth`** `{op, field?, n, from?, group?}` → `Datum[]`

**Percentage-of-total diffs.** To express "what percent of the total is X?" or similar ratios, compute the total in one sequence, the focal value in another, then run `diff` with `aggregate: "percentage_of_total"` (or `"percent_of_total"`). This makes the runtime divide `targetA` by `targetB`, multiply by 100, and return a single datum (so you do not need an extra `multiply` step). Use `precision` to control rounding when needed.

**Summing multiple IDs before a `diff`.** `targetA` (and/or `targetB`) may be an array of selectors/IDs such as `["ops2_0","ops3_0","ops4_0"]`. The runtime gathers every referenced datum, sums their numeric values, and then applies the requested diff/ratio/percent-of-total logic against the other side. This is the canonical way to compare "the combined top-1 groups across these years" vs "the total", or any situation where several previously cached values must be treated as a single aggregate in the final step.

**Special `nth` usage:** You may provide `n` as a single 1-based integer or as an array of integers (e.g., `[2,5]`). When `n` is an array, the returned `Datum[]` contains one datum for each requested rank (in the provided order); the runtime still assigns sequential IDs (`<opKey>_0`, `<opKey>_1`, …), letting `last` refer to any of them without re-running `sort`. This is the canonical way to answer prompts like "difference between the 2nd and 5th largest values": `sort` once, `nth` with `[2,5]`, then compute the `diff` inside `last` by referencing `ops_0` and `ops_1`.

### Ordering heuristics — prefer native axis order

- Treat the chart's rendered axis order (e.g., time increasing left→right, categorical order given in the spec) as already sorted. Terms like "earliest", "first", "leftmost" map to `nth` with `"from":"left"`; "latest", "last", "rightmost" map to `nth` with `"from":"right"`.
- Only emit an explicit `sort` when NL **demands a reordering** (e.g., "sort the remaining bars descending by GDP", "alphabetically first label after filtering") or when ranking by a different measure than the axis encodes (e.g., "second-highest price").
- Redundant `sort` + `nth` chains bloat the spec and can destabilize tie handling. Prefer the minimal deterministic sequence that still ends in a single datum.

**Multi-select tips:**
- **Filter once, keep both labels:** `{"op":"filter","field":"country","operator":"in","value":["USA","FRA"]}` returns both rows so IDs `ops_0`, `ops_1` are ready for `last`. No duplicate filters needed.
- **Sort + `nth` arrays:** Perform a single `sort`, then `{"op":"nth","n":[2,5],"from":"left"}` to capture both ranks in order. The runtime assigns sequential IDs so `last` can `diff`/`compare` them without rerunning the earlier steps.
- **Ops that already emit lists:** `lagDiff`, `compare`, `determineRange`, and plain `filter`/`sort` keep every matching datum. Use that list directly (or trim it with another op) instead of spinning up parallel sequences.
- **Combine only at the end:** After a multi-select step, use `last` (or another terminal op) to compute comparisons, sums, or booleans across the captured IDs. This mirrors how a person would highlight several marks and then reason about them.
- **Median workflow tip:** For even-length sets, `sort` once, use `nth` with the two middle ranks (e.g., `[6,7]`), then compute the average inside `last` so only those two highlighted marks remain on screen during the final step.

---

## 5) IDs & `last` Referencing (single-step combiner)

- After each **non‑`last`** list runs, the runtime assigns IDs to returned `DatumValue`s:
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0"
  ```
- In **`last`**, always reference prior results by **ID** (e.g., `"ops_0"`, `"ops2_0"`). **Never** use raw labels here.
- Outside of `last`, IDs are **opaque** — you cannot plug `"ops_0"` into another op's `value`, `target`, or threshold field. If a later step needs a scalar/label produced earlier, restate the literal number/label (the LLM must compute it) or restructure the workflow so the comparison happens inside `last`.
- **HARD BAN — IDs outside `last`:** `ops_*`, `ops2_*`, … are reserved exclusively for `last`. They must never appear in any non-`last` operation (`diff`, `compare`, `retrieveValue`, `sum`, `filter`, etc.). If you think an op needs `"ops_0"` as input, stop and rewrite the sequence so the operation names its targets directly (via `{category, series, group}` objects or literal numbers). This keeps every sequence faithful to the natural-language steps shown on the chart.
- **No ID-harvesting operations:** Do not insert extra `retrieveValue`, `nth`, or similar steps whose only purpose is to mint IDs for later math. Reject patterns like:
  ```json
  {
    "ops": [
      { "op": "retrieveValue", "field": "Religious", "target": "Hindu", "group": "Work participation (%)" },
      { "op": "retrieveValue", "field": "Religious", "target": "Hindu", "group": "Literacy (%)" },
      { "op": "diff", "field": "value", "targetA": "ops_0", "targetB": "ops_1", "aggregate": "ratio", "precision": 4 }
    ]
  }
  ```
  Instead, encode the computation directly in the terminal step:
  ```json
  {
    "ops": [
      {
        "op": "diff",
        "field": "value",
        "targetA": { "category": "Hindu", "series": "Work participation (%)" },
        "targetB": { "category": "Hindu", "series": "Literacy (%)" },
        "aggregate": "ratio",
        "precision": 4
      }
    ]
  }
  ```
  Apply this rule broadly: whenever the natural-language explanation requests a final computation (diff, compare, ratio, sum, etc.), feed the true chart targets or literal values straight into that operation. Only introduce additional steps when the narrative explicitly describes an intermediate visual manipulation (filtering, sorting, spotlighting) that the viewer would actually see.
- **Use the terminal IDs:** Within a list, IDs increment with every operation (`ops_0`, `ops_1`, …). When `last` references the outcome of that list, point to the ID emitted by its **terminal** operation (often the highest index). Referencing an earlier ID (e.g., using `ops_0` when the real diff lives at `ops_1`) means you are comparing the pre-processed dataset rather than the intended highlighted datum.
- **Single-shot `last`:** `last` contains exactly **one** operation. That step may reference any previously produced IDs (`ops_0`, `ops2_0`, …) but must never mention `"last_0"`, `"last_1"`, or any other pseudo-ID created inside `last`. The combiner does not get to fabricate new intermediate values; it simply reads the finished results from earlier lists and produces the final datum/boolean in one move.
- **Reject chained `last` ops:** Specs like the following are invalid because the second `compare` depends on `last_0`, which does not exist prior to `last` execution:
  ```json
  {
    "ops": [ { "op": "diff", "field": "value", "targetA": {"category":"Hindu","series":"Work participation (%)"}, "targetB": {"category":"Hindu","series":"Literacy (%)"}, "aggregate": "ratio" } ],
    "ops2": [ { "op": "diff", "field": "value", "targetA": {"category":"Muslim","series":"Work participation (%)"}, "targetB": {"category":"Muslim","series":"Literacy (%)"}, "aggregate": "ratio" } ],
    "ops3": [ { "op": "diff", "field": "value", "targetA": {"category":"Sikh","series":"Work participation (%)"}, "targetB": {"category":"Sikh","series":"Literacy (%)"}, "aggregate": "ratio" } ],
    "last": [
      { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" },
      { "op": "compare", "field": "value", "targetA": "last_0", "targetB": "ops3_0", "which": "max" }
    ]
  }
  ```
  To compare all three ratios, restructure so `last` performs a single extremum operation (e.g., `findExtremum` over the union of `ops`, `ops2`, `ops3`) or expand one of the earlier sequences to gather every needed datum before computing the final highlight. The goal is that viewers see the chart reach its conclusion in one clear final beat, not hop through invisible `last_*` placeholders.
- `last` still **must end** in a **single** `Datum` or `Boolean`.

---

## 6) Normalization & Determinism

- If NL omits fields: **label → `"target"`**, **measure → `"value"`**.  
- Synonyms: "largest/highest/top" → `which:"max"`; "smallest/lowest/bottom" → `which:"min"`.  
- If a sequence might return **multiple** items before the terminal step, add steps (`sort`+`nth`, extra `filter`) so the list ends in **exactly one** `Datum` or **one** `Boolean`, unless the final operation intentionally emits multiple ranks (for example, using `nth` with an array of indices); those cases still terminate the list while yielding one datum per rank for later `last` references.  
- The **rendered axis order is authoritative**. Treat chronological/categorical order as already sorted and reach for `nth` with `from:"left"`/`"right"` (or arrays) instead of bolting on a `sort`, unless the prompt explicitly asks for a different ordering criterion (e.g., alphabetical, highest/lowest by value).  
- **Prefer single-pass multi-selects.** When the NL prompt requires multiple picks from the same slice (e.g., "2nd vs 5th largest"), run the shared steps once, then use array-friendly ops (`nth`, `filter` with `in`, `retrieveValue` with multiple targets) to collect every needed datum before handing IDs to `last`. Do **not** duplicate identical sequences just to capture another rank.
- Never invent standalone fields (e.g., `"PositiveYearOverYearChanges"`). Compose derived measures via supported ops such as `lagDiff`, `filter`, `sum`, `diff`, etc., so the runtime can recompute them from the chart data.
- Numbers in JSON must be numbers (not strings).

---

## 7) Human-Readable `text` — Data Narrative (REQUIRED)

- The top-level `text` object is REQUIRED. Its keys must exactly mirror the operation lists that exist in the program (`ops`, `ops2`, `ops3`, …, and `last` when present).
- Each `text.<key>` value must be a single plain-text string (no Markdown, no lists, no JSON, no nested structure).

### 7.1 Purpose

`text` is a short data narrative for humans.  
It should describe what the data in the chart shows in natural language: concrete values, patterns, trends, outliers, and comparisons that are relevant to the user’s question.

### 7.2 Narrative structure

For each key (`ops`, `ops2`, …, `last`), write `text.<key>` as a small linear story with a simple beginning–middle–end:

- **Beginning**: Briefly state what part of the data or which groups/years you are talking about.
- **Middle**: Describe the key figures, patterns, notable exceptions, or comparisons over time that matter for the question. Always mention specific labels (e.g., countries, years, groups) and numbers when they are available.
- **End**: Give a short conclusion or takeaway that summarizes the main insight (for example, which value is largest, how much something increased, or which group differs most).

### 7.3 Content guidelines

When writing `text`:

- Focus on **impactful insights**: the most important changes, contrasts, and extremes that answer the user’s question.
- Mention **key statistics** explicitly: actual numeric values and category labels, not vague descriptions.
- Highlight **patterns and outliers**: increasing or decreasing trends, unusually high or low values, or surprising differences between groups.
- When the question involves a comparison, clearly state both sides and the size/direction of the difference.

### 7.4 Style guidelines

- Use natural, conversational language, as if you are explaining the chart to a colleague over coffee.
- Assume the reader is not a technical expert: keep sentences clear and simple, but keep the numbers precise.
- Do **not** describe internal chart operations or procedures. Avoid phrases like:
  - “filter the data to…”
  - “sort descending and take the top 3”
  - “retrieve the value where…”
  - “compute the difference between…”
- Instead, describe what these operations reveal in the data:
  - “Among these groups, X has the highest value at 76.”
  - “From 1980 to 2005, the value increases from 7,764 to 21,783.”
  - “The three largest parties have 164,376, 143,843, and 76,605 votes, averaging 128,275.”

### 7.5 Locale

- If `textLocale` is provided (for example, `"ko-KR"`), write all `text` strings in that language and style.
- If `textLocale` is not provided, default to English.

---

## 8) Output Contract (STRICT)

Allowed top-level keys: `ops`, `ops2`, `ops3`, `ops4`, `ops5`, `ops6`, `ops7` (extend as needed), `last`, `text`.

Forbidden top-level keys: `notes`, `explanation`, `meta`, `BEGIN_JSON`, `END_JSON`, `code`, `comment`.

Do not include any keys beyond the allowed set.

- `ops` (required): array of operation objects encoding **one sequence**.  
- `ops2`, `ops3`, … (optional): additional sequences.  
- `last` (optional): single-step combiner over precomputed IDs.  
- `text` (required): **data-focused** strings mirroring keys.  

No top‑level JSON arrays; no extra prose.

---

## 9) Authoring Checklist (for LLMs)

1. Map fields to explicit names when possible; else defaults.  
2. Apply the **Single‑Sequence** rule per list.  
3. Use **only** §4 operations; include `op` key.  
4. Ensure termination: each list ends in one `Datum` or one `Boolean`.  
5. In `last`, reference prior results by **ID** and keep it to a single combining op (no `last_i`).  
6. Use numeric types for numbers; avoid `eq`.  
7. Write **`text`** as a **data narrative**: describe what you found in the data (actual values, labels, patterns), not chart operations. Lead with findings, use natural conversational language, and explain how the concrete numbers support the conclusion. Never use operation vocabulary.
8. Prefer single-pass multi-selects (filters with `in`, `nth` arrays, `lagDiff`, etc.) instead of duplicating identical sequences for each target.  
9. Guard against ties/non‑determinism.

---

## 10) Validator Rules (+ snippet)

- **Reject** if any list doesn't terminate in exactly one `Datum`/`Boolean`.  
- **Reject** if `last` uses raw labels instead of IDs.  
- **Reject** if `text` is missing, its keys don't mirror lists, or values aren't plain strings.  
- **Warn** if a list contains a terminal op followed by more ops (merged sequences suspected).  
- **Warn** if determinism is unclear.

```typescript
type Op = { op: string; [k: string]: any };
interface Program { [k: string]: Op[] | any }

const LIST_KEYS = ["ops","ops2","ops3","ops4","ops5","ops6","ops7"];
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

  const ids = new Set<string>();
  for (const k of listKeys) {
    const opsForKey: Op[] = spec[k];
    for (let i = 0; i < opsForKey.length; i++) {
      ids.add(`${k}_${i}`);
    }
  }

  if (spec.last) {
    const lastOps: Op[] = spec.last;
    if (!Array.isArray(lastOps) || lastOps.length !== 1) errors.push("last must contain exactly one operation when present");
    else {
      const op = lastOps[0];
      if (!TERMINAL.has(op.op)) errors.push(`last[0] must be terminal (got "${op.op}")`);
      for (const f of ["targetA","targetB"]) {
        const v = op[f];
        if (typeof v === "string") {
          if (v.startsWith("last_")) errors.push(`last[0].${f} must not reference "${v}" (no chaining inside last)`);
          if (!ids.has(v)) errors.push(`last[0].${f} must reference an ID from prior lists (found "${v}")`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warns };
}
```

---

## 11) Converting NL **Explanation** → JSON (with numbers & labels)

1) **Segment** the explanation into human‑perceived sequences → map to `ops`, `ops2`, … (Single‑Sequence rule).  
2) **Map** each sentence/phrase to §4 ops.  
3) **Enforce determinism** so each list ends in one `Datum`/`Boolean`.  
4) **Combine** independent results in `last` with a **single** operation over the gathered IDs.  
5) **Author `text`** as a **data narrative**: describe what you found in the data (specific values, labels, patterns), not what operations were performed. Use natural conversational language to explain how the concrete numbers lead to the conclusion.

**Meta‑Prompt Template:**

Convert the provided natural-language explanation into the NL→Spec grammar.
- Apply the Single-Sequence rule: one human-perceived sequence per list key.
- Use only the supported ops. End each list in exactly one Datum or one Boolean.
- If combining results, stage every prerequisite beforehand and let `last` perform one final operation that references the needed IDs (ops_0, ops2_0, …). No additional chaining inside `last`.
- Write `text` entries as natural data narratives: explain findings in conversational language, not operational steps.

---

## 12) Examples (Using ONLY the provided datasets/specs)

### 12.1 Ratings — Simple retrieval

**Data/Chart:** `bar_simple_ver.csv` (`country`, `rating`).  
**Q:** "Give me the value for **KOR**."  
**Short Answer:** `KOR: 52`

```json
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "South Korea has a rating of 52."
  }
}
```

---

### 12.2 Ratings — Parallel comparison

**Q:** "Between **KOR** and **JPN**, which has the higher rating?"  
**Short Answer:** `KOR`

```json
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
    "ops": "South Korea has a rating of 52.",
    "ops2": "Japan has a rating of 42.",
    "last": "South Korea's rating (52) is higher than Japan's (42)."
  }
}
```

---

### 12.3 Ratings — Find maximum

**Q:** "Which country has the highest rating?"  
**Short Answer:** `NLD`

```json
{
  "ops": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "text": {
    "ops": "The Netherlands has the highest rating at 76."
  }
}
```

---

### 12.4 Ratings — Threshold with alphabetical selection

**Q:** "Among ratings ≥ 70, which label is first alphabetically?"  
**Short Answer:** `GBR`

```json
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "country", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "Among countries with ratings of 70 or higher (Great Britain at 75, Ireland at 70, and the Netherlands at 76), Great Britain comes first alphabetically."
  }
}
```

---

### 12.4a Chronological edges — latest minus earliest

**Data/Chart:** `bar_simple_201_7.csv` (`Year`, `Gross Domestic Product`).  
**Q:** "What is the latest value minus the earliest value?"  
**Short Answer:** `14019`

```json
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
    "ops": "The most recent year, 2005, shows a GDP of 21,783.",
    "ops2": "The earliest year, 1980, had a GDP of 7,764.",
    "last": "The increase from 1980 to 2005 is 14,019."
  }
}
```

---

### 12.4b Percent of total

**Data/Chart:** `bar_simple_201_7.csv` (`Year`, `Gross Domestic Product`).  
**Q:** "What percent of the total is the maximum value (one decimal)?"  
**Short Answer:** `35.7%`

```json
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
    "ops": "The total GDP across all years is 61,009.",
    "ops2": "The maximum GDP is 21,783, occurring in 2005.",
    "last": "The maximum value represents 35.7 percent of the total."
  }
}
```

---

### 12.5 Ratings — Boolean comparison to maximum

**Q:** "Is **KOR**'s rating greater than the max‑rating country?"  
**Short Answer:** `false`

```json
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
    "ops": "South Korea has a rating of 52.",
    "ops2": "The highest rating is 76, held by the Netherlands.",
    "last": "South Korea's rating (52) is not greater than the maximum (76), so the answer is false."
  }
}
```

---

### 12.4c Median calculation (even count)

**Data/Chart:** `line_simple_202_135.csv` (`Year`, `Average audience share (m)`)  
**Q:** "What is the median value after sorting by year?"  
**Short Answer:** `≈11.03`

```json
{
  "ops": [
    { "op": "sort", "field": "Year", "order": "asc" },
    { "op": "nth", "field": "Year", "n": [6, 7], "from": "left" }
  ],
  "last": [
    { "op": "average", "field": "Average audience share (m)", "targetA": "ops_0", "targetB": "ops_1" }
  ],
  "text": {
    "ops": "The two middle years in the timeline are 2001-2002 (with 10.77 million viewers) and 2002-2003 (with 11.29 million viewers).",
    "last": "The median audience share is approximately 11.03 million, the average of these two middle values."
  }
}
```

---

### 12.6 Weather (stacked vertical) — seasonal comparison

**Data/Chart:** `bar_stacked_ver.csv` (`month`, `weather` series, `count`).  
**Q:** "Is the total **sun** count in summer (6–8월) greater than the total **fog** count in Q4 (10–12월)?"  
**Short Answer:** `true`

```json
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
    "ops": "During summer months (June through August), sunny days total 268: 85 in June, 89 in July, and 94 in August.",
    "ops2": "In the fourth quarter (October through December), foggy days total 159: 55 in October, 50 in November, and 54 in December.",
    "last": "Summer sunny days (268) outnumber Q4 foggy days (159), so the answer is true."
  }
}
```

---

### 12.6b Stacked populations — per-continent averages

**Data/Chart:** `bar_stacked_202_44.csv` (`Year`, `Continent`, `Population`).  
**Q:** "Across the shown years, which continent has the highest average total population, and what are those averages?"  
**Short Answer:** `Asia leads with ≈1.915B (vs Africa ≈0.316B, Europe ≈0.631B, Latin America ≈0.251B, Northern America ≈0.219B, Oceania ≈0.018B)`

```json
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
    { "op": "findExtremum", "field": "value", "which": "max" }
  ],
  "text": {
    "ops": "Africa averages about 316 million people per year across the timeline.",
    "ops2": "Asia averages approximately 1.91 billion people per year, the largest population.",
    "ops3": "Europe averages around 631 million people per year.",
    "ops4": "Latin America averages roughly 251 million people per year.",
    "ops5": "Northern America averages about 219 million people per year.",
    "ops6": "Oceania averages approximately 17.7 million people per year.",
    "last": "Asia has the highest average population at around 1.91 billion per year."
  }
}
```

---

### 12.7 Grouped horizontal — per-country gaps

**Data/Chart:** `bar_grouped_hor.csv` (`Country`, `Urban/total` series, `Persons per square kilometers`).  
**Q:** "Between **Macau** and **Singapore**, which has the larger absolute gap `Urban − Total`?"  
**Short Answer:** `Macau`

```json
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
    "ops": "Macau shows a gap of 5.2 persons per square kilometer between urban (26.0) and total (20.8) density.",
    "ops2": "Singapore shows a much smaller gap of 0.1 persons per square kilometer between urban (7.5) and total (7.4) density.",
    "last": "Macau has the larger absolute gap at 5.2, compared to Singapore's 0.1."
  }
}
```

---

### 12.8 Stacked horizontal — EU5 opinion totals

**Data/Chart:** `bar_stacked_hor.csv` (`Country`, `opinion` series, `percentage`).  
**Q:** "Across **EU5** (Britain, Germany, Spain, France, Italy), which opinion has the highest total percentage?"  
**Short Answer:** `Worsen (193)`

```json
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
    { "op": "findExtremum", "field": "value", "which": "max" }
  ],
  "text": {
    "ops": "Across the EU5 countries, those who think things will improve total 130 percent (32 in Britain, 29 in Germany, 25 in Spain, 22 in France, and 22 in Italy).",
    "ops2": "Those who think things will remain the same total 171 percent (35 in Britain, 43 in Germany, 27 in Spain, 37 in France, and 29 in Italy).",
    "ops3": "Those who think things will worsen total 193 percent (32 in Britain, 27 in Germany, 47 in Spain, 40 in France, and 47 in Italy).",
    "last": "The worsen opinion has the highest total at 193 percent across the EU5."
  }
}
```

---

### 12.9 Grouped vertical — extremum in age range

**Data/Chart:** `bar_grouped_ver.csv` (`age`, `gender` series, `people`).  
**Q:** "Among **Female** values for ages **35–55**, which age has the largest population?"  
**Short Answer:** `35`

```json
{
  "ops": [
    { "op": "filter", "field": "age", "operator": "between", "value": [35,55], "group": "Female" },
    { "op": "findExtremum", "field": "people", "which": "max", "group": "Female" }
  ],
  "text": {
    "ops": "Among women aged 35 to 55, age 35 has the largest population at 11,635,647, followed by age 40 (11,488,578), age 45 (10,261,253), age 50 (8,911,133), and age 55 (6,921,268)."
  }
}
```

---

### 12.10 Multi-line stocks — series extremum vs average

**Data/Chart:** `line_multiple.csv` (`symbol` series, `date`, `price`).  
**Q:** "After **2007‑01‑01**, is **MSFT**'s **maximum** price greater than **AMZN**'s **average** in **2007**?"  
**Short Answer:** `false`

```json
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
    "ops": "After January 1, 2007, Microsoft's stock price peaked at 35.03 (on October 1, 2007).",
    "ops2": "During 2007, Amazon's stock price averaged about 69.95 across the twelve months.",
    "last": "Microsoft's peak (35.03) is not greater than Amazon's average (69.95), so the answer is false."
  }
}
```

---

### 12.11 Multi-line stocks — same-date Boolean comparison

**Q:** "On **2008‑10‑01**, is **MSFT** higher than **AMZN**?"  
**Short Answer:** `false`

```json
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
    "ops": "On October 1, 2008, Microsoft's stock price was 21.57.",
    "ops2": "On October 1, 2008, Amazon's stock price was 57.24.",
    "last": "Microsoft's price (21.57) was not higher than Amazon's (57.24), so the answer is false."
  }
}
```

---

### 12.12 Multi-line stocks — same-date signed difference

**Q:** "What is **MSFT − AMZN** on **2008‑10‑01**?"  
**Short Answer:** `−35.67`

```json
{
  "ops": [
    { "op": "diff",
      "field": "price",
      "targetA": { "category": "2008-10-01", "series": "MSFT" },
      "targetB": { "category": "2008-10-01", "series": "AMZN" },
      "signed": true }
  ],
  "text": {
    "ops": "On October 1, 2008, Microsoft's price (21.57) minus Amazon's price (57.24) equals negative 35.67."
  }
}
```

---

### 12.13 Multi-line stocks — second-highest value

**Q:** "What is the **second‑highest** **AMZN** value?"  
**Short Answer:** `134.52 (2009‑12‑01)`

```json
{
  "ops": [
    { "op": "sort", "field": "value", "order": "desc", "group": "AMZN" },
    { "op": "nth", "n": 2, "from": "left", "group": "AMZN" }
  ],
  "text": {
    "ops": "Amazon's second-highest stock price is 134.52, recorded on December 1, 2009, just below the peak of 135.91 on November 1, 2009."
  }
}
```

---

### 12.14 Multi-line stocks — average after cutoff

**Q:** "After **2007‑01‑01**, what is **MSFT**'s **average** price?"  
**Short Answer:** `≈27.91`

```json
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2007-01-01", "group": "MSFT" },
    { "op": "average", "field": "price", "group": "MSFT" }
  ],
  "text": {
    "ops": "After January 1, 2007, Microsoft's stock price averages about 27.91."
  }
}
```

---

### 12.15 Year-over-year gains — sum of positive changes

**Q:** "What is the sum of all positive **year-over-year** changes in **Winnings**?"  
**Short Answer:** `1,133,363`

```json
{
  "ops": [
    { "op": "lagDiff", "field": "Winnings", "orderField": "Year" },
    { "op": "filter", "field": "value", "operator": ">", "value": 0 },
    { "op": "sum", "field": "value" }
  ],
  "text": {
    "ops": "Looking at year-over-year changes in winnings, the positive increases (440, 44,416, 95,020, and so on) sum to 1,133,363."
  }
}
```

---

### 12.16 GDP line — difference between 2nd and 5th largest

**Data/Chart:** `line_simple_201_7.csv` (`Year`, `Gross Domestic Product`)  
**Q:** "What is the difference between the **2nd** and **5th** largest GDP values?"  
**Short Answer:** `5,120`

```json
{
  "ops": [
    { "op": "sort", "field": "Gross Domestic Product", "order": "desc" },
    { "op": "nth", "field": "Gross Domestic Product", "n": [2, 5], "from": "left" }
  ],
  "last": [
    { "op": "diff", "field": "Gross Domestic Product", "targetA": "ops_0", "targetB": "ops_1", "signed": true }
  ],
  "text": {
    "ops": "The second-largest GDP is 11,570 (in year 2000) and the fifth-largest is 6,450 (in year 1985).",
    "last": "The difference between these two values is 5,120."
  }
}
```

---

### 12.17 Simple bar — comparing two countries

**Data/Chart:** `bar_simple_ver.csv` (`country`, `rating`)  
**Q:** "How much higher is **GBR** than **FRA**?"  
**Short Answer:** `19`

```json
{
  "ops": [
    { "op": "filter", "field": "country", "operator": "in", "value": ["GBR", "FRA"] }
  ],
  "last": [
    { "op": "diff", "field": "rating", "targetA": "ops_0", "targetB": "ops_1", "signed": true }
  ],
  "text": {
    "ops": "Great Britain has a rating of 75 and France has a rating of 56.",
    "last": "Great Britain's rating is 19 points higher than France's."
  }
}
```

---

### 12.18 Audience share — sum of extremes

**Data/Chart:** `line_simple_202_135.csv` (`Year`, `Average audience share (m)`)  
**Q:** "What is the sum of the top two and bottom two values?"  
**Short Answer:** `42.51`

```json
{
  "ops": [
    { "op": "sort", "field": "Average audience share (m)", "order": "desc" },
    { "op": "nth", "field": "Average audience share (m)", "n": [1, 2, 11, 12], "from": "left" }
  ],
  "last": [
    { "op": "sum", "field": "Average audience share (m)" }
  ],
  "text": {
    "ops": "The two highest audience shares are 15.82 and 14.35 million, and the two lowest are 6.90 and 5.44 million.",
    "last": "These four values sum to approximately 42.51 million."
  }
}
```

---

## 13) References (for authors)

- Segel, E., & Heer, J. (2010). **Narrative Visualization: Telling Stories with Data.** *IEEE TVCG, 16(6)*, 1139–1148.  
- Shneiderman, B. (1996). **The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations.** *IEEE VL/HCC*.  

These motivate natural data narratives, clear explanations of key values, and conversational language that focuses on what the data shows rather than how it was retrieved—principles that our `text` rules operationalize.