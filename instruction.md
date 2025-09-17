# NL to Spec Conversion Guideline (Revised — Plain `text` Descriptions)

---

## 0) Purpose & IO Contract

**Input provided to the LM**

1) **Data** (CSV or JSON format; conceptually, a list of `DatumValue`)  
2) **Chart** (e.g., Vega-Lite spec)  
3) **User’s Question** (natural language)  
4) **Short Answer**  
5) **Natural-Language Explanation** — *the step-by-step reasoning/operations that produced the answer*

**The output that the LLM must produce**

- A single **JSON object** encoding one or more ordered operation lists: `ops`, `ops2`, `ops3`, …  
- Each list is an ordered program and **must end in exactly one `Datum` or one `Boolean`**.  
- If multiple lists must be combined **after** they finish, put the final step(s) under an **optional** top-level key **`last`**.  
- **(New) Human-Readable Descriptions:** Add a top-level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and provides **plain text** descriptions (strings only; **no** nested objects like `summary` or `steps`). See §8.

**Return JSON only** (no extra commentary).

---

## 1) Data & Value Types (Runtime Model)

```ts
class DatumValue {
  constructor(
    category: string,   // label field (e.g., 'country', 'brand')
    measure: string,    // value field (e.g., 'rating', 'sales')
    target: string,     // label value (e.g., 'KOR', 'iPhone')
    group: string|null, // subgroup label value (e.g., 'MSFT', 'AMZN', '2024') for multi-line/stacked/grouped charts; null otherwise
    value: number,      // numeric value (e.g., 82, 1.25)
    id?: string         // runtime-assigned id for cross-list referencing
  ) {}
}
class IntervalValue { constructor(category: string, min: number, max: number) {} }
class ScalarValue   { constructor(value: number) {} }
class BoolValue     { constructor(category: string, bool: boolean) {} }
```

**Important:** Real datasets can mix different `category`/`measure` names across `DatumValue`s.  
If unspecified or ambiguous in NL, **default**: category → `"target"`, measure → `"value"`.

**Clarification — Group label values**  
In multi-line, grouped-bar, and stacked-bar charts, the `group` value always denotes a **concrete subgroup label value** (e.g., `MSFT`, `AMZN`, `2024`) identifying which line/series/stack you are operating on. It is **not** the field name (e.g., `series`, `brand`, `year`); the runtime infers the group **field** from the chart’s encoding.

---

## 2) Canonical Parameter Meanings

- **`field`** — target field. If a label/category, prefer the explicit name (e.g., `"country"`), else `"target"`. If a measure, prefer explicit name (e.g., `"rating"`), else `"value"`.  
- **`target`** — a concrete **category value** (e.g., `"KOR"`, `"iPhone"`).  
- **`targetA` / `targetB`** — two items to compare in `compare` **or** `compareBool`.  
  - In **regular lists** (`ops`, `ops2`, …): category values.  
  - In **`last`**: **IDs** of earlier results (see §4).  
- **`group`** — **subgroup label value** (for multi-line, grouped-bar, and stacked-bar charts). Provide the **actual category value** that selects a specific series/stack (e.g., "MSFT", "AMZN", "2024"). Do **not** pass the field name (e.g., "series", "brand", "year"); the runtime infers it from the chart spec. Omit or set `null` to operate across all groups.  
  - **Anti-pattern:** `{"group":"series"}`. ✅ Use `{"group":"MSFT"}`.  
- **`which`** — `"max"` or `"min"` (for `findExtremum`).  
- **`order`** — `"asc"` or `"desc"` (for `sort`).  
- **`operator`** — one of `">"`, `">="`, `"<"`, `"<="`, `"=="`, `"!="`, `"eq"`, `"in"`, `"not-in"`, `"contains"`  
- **`n` / `from`** — positional selection; `n` is 1-based; `from` is `"left"` or `"right"`.

---

## 3) Supported Operation Specs (Correct & Precise)

Use **only** the following op names. Each list must **terminate** in a single `Datum` or `Boolean`.

### 3.3 `compare`
- **Purpose:** Select the **winning datum** between two targets by comparing their numeric values (optionally after aggregation). Use when the question asks *“Which is larger/smaller, A or B?”* and a **single winner** is expected.
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "aggregate"?: "sum"|"avg"|"min"|"max", "which"?: "max"|"min", "operator"?: ">"|">="|"<"|"<="|"=="|"eq" }`
- **Returns:** `Datum[]` (the winning `DatumValue`).
- **Notes:**
  - In **regular lists** (`ops`, `ops2`, …), `targetA`/`targetB` are **category values** (e.g., labels like `"KOR"`).
  - In **`last`**, `targetA`/`targetB` must be **IDs** of prior results (see §4).
  - If a **tie** is possible on the chosen field and aggregation, prefer `compareBool` or first make the slice strictly ordered (e.g., `sort` + `nth`) to avoid non-determinism.

### 3.4 `compareBool`
- **Purpose:** Compare two items’ numeric values with a relational operator and return a **Boolean**.
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "operator": ">"|">="|"<"|"<="|"=="|"eq" }`
- **Returns:** `Boolean` (`BoolValue` with `category: ""`).
- **Note:** In `last`, `targetA`/`targetB` must be **IDs** (see §4). If equality is possible and you need a winner, do **not** use `compareBool`; use `compare` (with a strict ordering) instead.

### 3.5 `findExtremum`
- **Purpose:** Find the min/max datum by a measure.  
- **Params:** `{ "field": string, "which": "max"|"min", "group"?: string /* subgroup label value, e.g., "MSFT" */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** If `group` is provided, first **slice to that subgroup** and then find the extremum; if omitted, run across all data.

### 3.6 `sort`
- **Purpose:** Sort by label (lexicographic) or by a measure (numeric).  
- **Params:** `{ "field": string, "order": "asc"|"desc", "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** With `group`, sort only within that subgroup; otherwise sort across the full slice.

### 3.7 `determineRange`
- **Purpose:** Compute `[min, max]` for a field (category or value).  
- **Params:** `{ "field": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Interval` (not terminal)  
- **Semantics:** With `group`, compute [min,max] within that subgroup; otherwise compute globally.

### 3.8 `count`
- **Purpose:** Count items in the current data slice.  
- **Params:** `{}`  
- **Returns:** `Datum[]` (single numeric count wrapped as a `DatumValue`)

### 3.9 `sum`
- **Purpose:** Sum numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** With `group`, sum within that subgroup; otherwise sum across all groups.

### 3.10 `average`
- **Purpose:** Average numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** With `group`, average within that subgroup; otherwise average across all groups.

### 3.11 `diff`
- **Purpose:** Difference between two targets (optionally after aggregation).  
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "aggregate"?: "sum"|"avg"|"min"|"max" }`  
- **Returns:** `Datum[]`

### 3.12 `nth`
- **Purpose:** Pick the n-th item by the current visual/ordering convention.  
- **Params:** `{ "field"?: string, "n": number, "from"?: "left"|"right" }`  
- **Returns:** `Datum[]`

---

## 4) Output Format & ID Referencing (very important)

- Top-level keys: `ops` (required), plus `ops2`, `ops3`, … (optional), **`last`** (optional), and **`text` (required; see §8)**.  
- **Each list terminates** in a single `Datum` or `Boolean`. Intermediates can be `Data`/`Interval`/`Scalar`.  
- **Runtime ID assignment (for non-`last` lists):** After each non-`last` list runs, the runtime sets an ID on each returned `DatumValue`:  
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0", ...
  ```
- **Referencing in `last`:** When combining earlier results (e.g., with `compare` or `compareBool`), use these **IDs** (`"ops_0"`, `"ops2_0"`, …) in fields like `targetA`/`targetB`. **Do not** use category labels in `last`.  
- **`text` does not affect execution** and has no IDs; it is purely for **human readers**.

---

## 5) Normalization & Synonyms

- If the NL explanation omits field names: **label → `"target"`**, **measure → `"value"`**.  
- Extremum: “largest/highest/top” → `"max"`, “smallest/lowest/bottom” → `"min"`.  
- Comparisons: “greater than”→`">"`, “at least”→`">="`, “less than”→`"<"`, “at most”→`"<="`, “equal”→`"=="`/`"eq"`.  
- Numbers in JSON must be numbers (not strings).

---

## 6) Examples (execution-focused)

Examples 1–15 from your existing guide remain valid for the executable structure. The new `text` rules in §8 are additive and do not change execution.

---

## 7) Authoring Checklist for LLMs

1. Map fields to explicit names when present; otherwise, use defaults (`"target"`, `"value"`).  
2. Use only the Supported Operations in §3.  
3. In **`last`**, reference earlier results via **IDs**: `<opKey>_<index>` (e.g., `ops_0`, `ops2_0`).  
4. Emit **valid JSON only**; no prose outside the JSON.  
5. Ensure numeric thresholds are numbers (not strings).  
6. Normalize synonyms (e.g., “highest” → `which:"max"`).  
7. **(New)** Provide a `text` object whose **values are plain strings** (no `summary`/`steps`). Make sure the keys **mirror** the operation lists present.  
8. For **yes/no** questions, use `compareBool`. For **“which is larger/smaller?”** questions that require returning an item, use `compare`.  
9. Avoid `compare` if a **tie** could occur on the chosen slice and aggregation; either refine the slice (e.g., additional `filter`) or use `sort` + `nth` to ensure a deterministic winner, or switch to `compareBool` if a boolean is acceptable.

---

## 8) Human-Readable Annotations — the `text` Object (Plain String)

### 8.1 Purpose

- Help users **understand at a glance** what each operation list is doing and how it maps to the chart—**without** changing execution.

### 8.2 Structure (Strict)

- Top-level **`text`** **must** be present.  
- Its keys **mirror** the operation program keys included in the spec: `ops`, `ops2`, `ops3`, …, and `last` if present.  
- **Each value is a single plain-text string** describing **what that list accomplishes overall** (not a JSON object; **no** `summary`/`steps`).  
- Prefer **one concise sentence**; two short sentences are acceptable if clarity demands.

### 8.3 Style Guide

- Be **concise and concrete**; name the actual fields (e.g., say **`country`**, **`rating`**).  
- Mention **groups** when used (e.g., “in group `2024`”).  
- For **`last`**, explicitly state what is being **compared/combined** and by which **operator**.  
- Avoid code-like jargon; write for a general audience.  
- Keep language consistent; use present tense (“Filter…”, “Sort…”, “Compare…”).

### 8.4 Common Mistakes (avoid)

- ❌ Using keys like `"ops1"` in `text` when the actual list key is `"ops"`.  
- ❌ Long paragraphs or multiple sentences that bury the main action.  
- ❌ Duplicating keys (e.g., two `"last"` entries).  
- ❌ Inserting JSON-like substructure (`summary`, `steps`, arrays).  
- ❌ Mismatch between what the text claims and what the ops do.

---

## 9) Examples with Plain `text`

### Example A — Simple retrieval + `text`

**Question:** “Give me the value for KOR.”  
**Short Answer:** `KOR: 82`  
**Explanation:** “Select the single datum whose `country` equals `KOR`.”  

```json
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "Retrieve the value where country equals KOR."
  }
}
```

---

### Example D2 — Parallel lists + `last` compare (IDs) + `text` (returns a Datum)

**Question:** “Between KOR and JPN, which has the higher rating?”
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
    "ops": "Get KOR’s rating.",
    "ops2": "Get JPN’s rating.",
    "last": "Return whichever of KOR or JPN has the higher rating (max)."
  }
}
```

> **Note:** Use `compare` only when a single winner exists; if a tie is possible, refine the slice or use `compareBool`.

---

### Example B — Find maximum + `text`

**Question:** “Which country has the highest rating?”  
**Short Answer:** `NLD`  
**Explanation:** “Return the single datum with the maximum value of `rating`.”

```json
{
  "ops": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "text": {
    "ops": "Find the country with the maximum rating."
  }
}
```

---

### Example C — Filter ≥ 70, sort asc, take first + `text`

**Question:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `AUT`  

```json
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "target", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "From items with rating ≥ 70, sort labels A→Z and take the first."
  }
}
```

---

### Example D — Parallel lists + `last` compare (IDs) + `text`

**Question:** “Is KOR’s rating greater than the max-rating country?”  
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
    "ops": "Get KOR’s rating.",
    "ops2": "Find the maximum rating across all countries.",
    "last": "Compare KOR’s rating to the maximum rating using the '>' operator."
  }
}
```

---

### Example E — Grouped chart, sums across different groups + `text`

**Question:** “Is the total sales of iPhone in 2024 greater than Samsung in 2023?”  
**Short Answer:** `true`

```json
{
  "ops": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "iPhone" },
    { "op": "filter", "field": "year", "operator": "==", "value": "2024" },
    { "op": "sum", "field": "sales" }
  ],
  "ops2": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "Samsung" },
    { "op": "filter", "field": "year", "operator": "==", "value": "2023" },
    { "op": "sum", "field": "sales" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Compute the total sales of iPhone in 2024.",
    "ops2": "Compute the total sales of Samsung in 2023.",
    "last": "Check whether iPhone-2024 total is greater than Samsung-2023 total."
  }
}
```

---

### Example F — Multiline: target a specific series (group value)

**Question:** “What is the maximum value on the MSFT line?”  
**Short Answer:** `…`

```json
{
  "ops": [
    { "op": "findExtremum", "field": "value", "which": "max", "group": "MSFT" }
  ],
  "text": {
    "ops": "Within the MSFT line (series), return the datum with the maximum value."
  }
}
```

---

## 10) Output Contract (STRICT)

Return JSON only.  
Return a single JSON object with:  
- `ops`: (required) array of operation objects  
- `ops2`, `ops3`, …: (optional) parallel lists  
- `last`: (optional) list combining previous results using **IDs**  
- **`text`: (required)** object providing **plain-text** descriptions that mirror the operation keys

Do **NOT** return a top-level JSON array.

---

## 11) Quality & Risk Notes (for authors)

- **Clarity vs. Brevity:** keep `text` short and faithful; overly terse text may hide important context; overly long text can confuse.  
- **Chart Alignment:** Mention fields and groups exactly as used; mismatches confuse users.  
- **Internationalization:** If the UI language differs, generate `text` in the UI language.  
- **Trade-off (critical note):** Plain strings are lightweight but can lose step-level traceability. If ambiguity arises, tighten wording to reflect the exact operation sequence (“filter… then sort… then take the first”).  
- **Privacy:** Do not leak sensitive values beyond what the question and data imply.

---

### Quick Template (copyable)

```json
{
  "ops": [ /* ... */ ],
  "ops2": [ /* optional */ ],
  "ops3": [ /* optional */ ],
  "last": [ /* optional */ ],
  "text": {
    "ops": "…",
    "ops2": "…",
    "ops3": "…",
    "last": "…"
  }
}
```

# NL to Spec Conversion Guideline (Revised — Plain `text` Descriptions)
  
---
  
## 0) Purpose & IO Contract
  
**Input provided to the LM**
  
1) **Data** (CSV or JSON format; conceptually, a list of `DatumValue`)  
2) **Chart** (e.g., Vega-Lite spec)  
3) **User’s Question** (natural language)  
4) **Short Answer**  
5) **Natural-Language Explanation** — *the step-by-step reasoning/operations that produced the answer*
  
**The output that the LLM must produce**
  
- A single **JSON object** encoding one or more ordered operation lists: `ops`, `ops2`, `ops3`, …  
- Each list is an ordered program and **must end in exactly one `Datum` or one `Boolean`**.  
- If multiple lists must be combined **after** they finish, put the final step(s) under an **optional** top-level key **`last`**.  
- **(New) Human-Readable Descriptions:** Add a top-level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and provides **plain text** descriptions (strings only; **no** nested objects like `summary` or `steps`). See §8.
  
**Return JSON only** (no extra commentary).
  
---
  
## 1) Data & Value Types (Runtime Model)
  
```ts
class DatumValue {
  constructor(
    category: string,   // label field (e.g., 'country', 'brand')
    measure: string,    // value field (e.g., 'rating', 'sales')
    target: string,     // label value (e.g., 'KOR', 'iPhone')
    group: string|null, // subgroup label value (e.g., 'MSFT', 'AMZN', '2024') for multi-line/stacked/grouped charts; null otherwise
    value: number,      // numeric value (e.g., 82, 1.25)
    id?: string         // runtime-assigned id for cross-list referencing
  ) {}
}
class IntervalValue { constructor(category: string, min: number, max: number) {} }
class ScalarValue   { constructor(value: number) {} }
class BoolValue     { constructor(category: string, bool: boolean) {} }
```
  
**Important:** Real datasets can mix different `category`/`measure` names across `DatumValue`s.  
If unspecified or ambiguous in NL, **default**: category → `"target"`, measure → `"value"`.
  
**Clarification — Group label values**  
In multi-line, grouped-bar, and stacked-bar charts, the `group` value always denotes a **concrete subgroup label value** (e.g., `MSFT`, `AMZN`, `2024`) identifying which line/series/stack you are operating on. It is **not** the field name (e.g., `series`, `brand`, `year`); the runtime infers the group **field** from the chart’s encoding.
  
---
  
## 2) Canonical Parameter Meanings
  
- **`field`** — target field. If a label/category, prefer the explicit name (e.g., `"country"`), else `"target"`. If a measure, prefer explicit name (e.g., `"rating"`), else `"value"`.  
- **`target`** — a concrete **category value** (e.g., `"KOR"`, `"iPhone"`, date like `"2024-01-01"`).  
- **`targetA` / `targetB`** — two items to compare in `compare`, `compareBool`, or `diff`.  
  - In **regular lists** (`ops`, `ops2`, …): usually **category values** (strings).  
  - **Dual-target object form (multiline/grouped/stacked):** you may pass an object:  
    `{ "category": "<category value>", "series": "<group label value>" }`  
    Example: `{ "category": "2024-01-01", "series": "MSFT" }`.  
  - In **`last`**, `targetA`/`targetB` must be **IDs** of prior results (see §4).  
- **`group`** — **subgroup label value** (for multi-line, grouped-bar, stacked-bar). Provide the **actual label value** that selects a specific series/stack (e.g., `"MSFT"`, `"AMZN"`, `"2024"`). It is **not** the field name; the runtime infers the group **field** from the chart encoding. Omit or set `null` to operate across all groups.  
  - **Anti-pattern:** `{"group":"series"}`. ✅ Use `{"group":"MSFT"}`.  
- **`which`** — `"max"` or `"min"` (for `findExtremum`).  
- **`order`** — `"asc"` or `"desc"` (for `sort`).  
- **`operator`** — one of `">"`, `">="`, `"<"`, `"<="`, `"=="`, `"!="`, `"eq"`, `"in"`, `"not-in"`, `"contains"`, plus `"between"` for temporal label ranges.  
- **`n` / `from`** — positional selection; `n` is 1-based; `from` is `"left"` or `"right"`.
  
---
  
## 3) Supported Operation Specs (Correct & Precise)
  
Use **only** the following op names. Each list must **terminate** in a single `Datum` or `Boolean`.
  
### 3.1 `retrieveValue`
- **Purpose:** Return all datum(s) whose category equals `target` (optionally within a specific series).  
- **Params:** `{ "field": string, "target": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`
- **Notes:** For multiline/grouped/stacked charts, pass `group` to select the specific line/series (e.g., `"MSFT"`). If omitted, returns matches across all series.
  
### 3.2 `filter`
- **Purpose:** Filter by `field` using `operator` and `value`.  
- **Params:** `{ "field": string, "operator": ">"|">="|"<"|"<="|"=="|"!="|"eq"|"in"|"not-in"|"contains"|"between", "value": number|string|Array, "group"?: string }`  
- **Returns:** `Data`
- **Semantics:**  
  - For numeric fields, use relational operators.  
  - For categorical fields, use `"=="`, `"in"`, `"not-in"`, `"contains"`.  
  - For temporal labels (`field` is a date-like **label**), `"between"` expects `[start, end]` (inclusive).  
  - If `group` is provided, the filter is first **sliced** to that series before applying the condition (runtime infers the group field).
  
### 3.3 `compare`
- **Purpose:** Select the **winning datum** between two targets by comparing their numeric values (optionally after aggregation). Use when the question asks *“Which is larger/smaller, A or B?”* and a **single winner** is expected.
- **Params:**  
  - **Simple form:** `{ "field": string, "targetA": string, "targetB": string, "group"?: string, "aggregate"?: "sum"|"avg"|"min"|"max", "which"?: "max"|"min" }`  
  - **Dual-target object form:** `{ "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "aggregate"?: "sum"|"avg"|"min"|"max", "which"?: "max"|"min" }`
- **Returns:** `Datum[]` (the winning `DatumValue`).
- **Notes:**  
  - In **regular lists**, `targetA`/`targetB` are category values or object form above.  
  - In **`last`**, `targetA`/`targetB` must be **IDs** (see §4).  
  - If a **tie** is possible on the chosen slice and aggregation, prefer `compareBool` or create a strict ordering (e.g., `sort` + `nth`) to avoid non-determinism.
  
### 3.4 `compareBool`
- **Purpose:** Compare two items’ numeric values with a relational operator and return a **Boolean**.
- **Params:**  
  - **Simple form:** `{ "field": string, "targetA": string, "targetB": string, "group"?: string, "operator": ">"|">="|"<"|"<="|"=="|"eq" }`  
  - **Dual-target object form:** `{ "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "operator": ">"|">="|"<"|"<="|"=="|"eq" }`
- **Returns:** `Boolean` (`BoolValue` with `category: ""`).
- **Note:** In `last`, `targetA`/`targetB` must be **IDs** (see §4). If equality is possible and you need a winner, use `compare` (with a strict ordering) instead.
  
### 3.5 `findExtremum`
- **Purpose:** Find the min/max datum by a measure.  
- **Params:** `{ "field": string, "which": "max"|"min", "group"?: string /* subgroup label value, e.g., "MSFT" */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** If `group` is provided, first **slice to that subgroup** and then find the extremum; if omitted, run across all data.
  
### 3.6 `sort`
- **Purpose:** Sort by label (lexicographic) or by a measure (numeric).  
- **Params:** `{ "field": string, "order": "asc"|"desc", "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** With `group`, sort only within that subgroup; otherwise sort across the full slice.
  
### 3.7 `determineRange`
- **Purpose:** Compute `[min, max]` for a field (category or value).  
- **Params:** `{ "field": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Interval` (not terminal)  
- **Semantics:** With `group`, compute [min,max] within that subgroup; otherwise compute globally.
  
### 3.8 `count`
- **Purpose:** Count items in the current data slice.  
- **Params:** `{ "group"?: string }`  
- **Returns:** `Datum[]` (single numeric count wrapped as a `DatumValue`)
  
### 3.9 `sum`
- **Purpose:** Sum numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** With `group`, sum within that subgroup; otherwise sum across all groups.
  
### 3.10 `average`
- **Purpose:** Average numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string /* subgroup label value */ }`  
- **Returns:** `Datum[]`  
- **Semantics:** With `group`, average within that subgroup; otherwise average across all groups.
  
### 3.11 `diff`
- **Purpose:** Difference between two targets (optionally after aggregation).  
- **Params:**  
  - **Simple form:** `{ "field": string, "targetA": string, "targetB": string, "group"?: string, "aggregate"?: "sum"|"avg"|"min"|"max", "signed"?: boolean }`  
  - **Dual-target object form:** `{ "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "aggregate"?: "sum"|"avg"|"min"|"max", "signed"?: boolean }`  
- **Returns:** `Datum[]`
  
### 3.12 `nth`
- **Purpose:** Pick the n-th item by the current visual/ordering convention.  
- **Params:** `{ "field"?: string, "n": number, "from"?: "left"|"right", "group"?: string }`  
- **Returns:** `Datum[]`
  
---
  
## 4) Output Format & ID Referencing (very important)
  
- Top-level keys: `ops` (required), plus `ops2`, `ops3`, … (optional), **`last`** (optional), and **`text` (required; see §8)**.  
- **Each list terminates** in a single `Datum` or `Boolean`. Intermediates can be `Data`/`Interval`/`Scalar`.  
- **Runtime ID assignment (for non-`last` lists):** After each non-`last` list runs, the runtime sets an ID on each returned `DatumValue`:  
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0", ...
  ```
- **Referencing in `last`:** When combining earlier results (e.g., with `compare` or `compareBool`), use these **IDs** (`"ops_0"`, `"ops2_0"`, …) in fields like `targetA`/`targetB`. **Do not** use category labels in `last`.  
- **`text` does not affect execution** and has no IDs; it is purely for **human readers**.
  
---
  
## 5) Normalization & Synonyms
  
- If the NL explanation omits field names: **label → `"target"`**, **measure → `"value"`**.  
- Extremum: “largest/highest/top” → `"max"`, “smallest/lowest/bottom” → `"min"`.  
- Comparisons: “greater than”→`">"`, “at least”→`">="`, “less than”→`"<"`, “at most”→`"<="`, “equal”→`"=="`/`"eq"`.  
- Numbers in JSON must be numbers (not strings).
  
---
  
## 6) Examples (execution-focused)
  
Examples 1–15 from your existing guide remain valid for the executable structure. The new `text` rules in §8 are additive and do not change execution.
  
---
  
## 7) Authoring Checklist for LLMs
  
1. Map fields to explicit names when present; otherwise, use defaults (`"target"`, `"value"`).  
2. Use only the Supported Operations in §3.  
3. In **`last`**, reference earlier results via **IDs**: `<opKey>_<index>` (e.g., `ops_0`, `ops2_0`).  
4. Emit **valid JSON only**; no prose outside the JSON.  
5. Ensure numeric thresholds are numbers (not strings).  
6. Normalize synonyms (e.g., “highest” → `which:"max"`).  
7. **(New)** Provide a `text` object whose **values are plain strings** (no `summary`/`steps`). Make sure the keys **mirror** the operation lists present.  
8. For **yes/no** questions, use `compareBool`. For **“which is larger/smaller?”** questions that require returning an item, use `compare`.  
9. Avoid `compare` if a **tie** could occur on the chosen slice and aggregation; either refine the slice (e.g., additional `filter`) or use `sort` + `nth` to ensure a deterministic winner, or switch to `compareBool` if a boolean is acceptable.
  
---
  
## 8) Human-Readable Annotations — the `text` Object (Plain String)
  
### 8.1 Purpose
  
- Help users **understand at a glance** what each operation list is doing and how it maps to the chart—**without** changing execution.
  
### 8.2 Structure (Strict)
  
- Top-level **`text`** **must** be present.  
- Its keys **mirror** the operation program keys included in the spec: `ops`, `ops2`, `ops3`, …, and `last` if present.  
- **Each value is a single plain-text string** describing **what that list accomplishes overall** (not a JSON object; **no** `summary`/`steps`).  
- Prefer **one concise sentence**; two short sentences are acceptable if clarity demands.
  
### 8.3 Style Guide
  
- Be **concise and concrete**; name the actual fields (e.g., say **`country`**, **`rating`**).  
- Mention **groups** when used (e.g., “in group `2024`”).  
- For **`last`**, explicitly state what is being **compared/combined** and by which **operator**.  
- Avoid code-like jargon; write for a general audience.  
- Keep language consistent; use present tense (“Filter…”, “Sort…”, “Compare…”).
  
### 8.4 Common Mistakes (avoid)
  
- ❌ Using keys like `"ops1"` in `text` when the actual list key is `"ops"`.  
- ❌ Long paragraphs or multiple sentences that bury the main action.  
- ❌ Duplicating keys (e.g., two `"last"` entries).  
- ❌ Inserting JSON-like substructure (`summary`, `steps`, arrays).  
- ❌ Mismatch between what the text claims and what the ops do.
  
---
  
## 9) Examples with Plain `text`
  
### Example A — Simple retrieval + `text`
  
**Question:** “Give me the value for KOR.”  
**Short Answer:** `KOR: 82`  
**Explanation:** “Select the single datum whose `country` equals `KOR`.”  
  
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "Retrieve the value where country equals KOR."
  }
}
```
  
---
  
### Example D2 — Parallel lists + `last` compare (IDs) + `text` (returns a Datum)
  
**Question:** “Between KOR and JPN, which has the higher rating?”
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
    "ops": "Get KOR’s rating.",
    "ops2": "Get JPN’s rating.",
    "last": "Return whichever of KOR or JPN has the higher rating (max)."
  }
}
```
  
> **Note:** Use `compare` only when a single winner exists; if a tie is possible, refine the slice or use `compareBool`.
  
---
  
### Example B — Find maximum + `text`
  
**Question:** “Which country has the highest rating?”  
**Short Answer:** `NLD`  
**Explanation:** “Return the single datum with the maximum value of `rating`.”
  
```json
{
  "ops": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "text": {
    "ops": "Find the country with the maximum rating."
  }
}
```
  
---
  
### Example C — Filter ≥ 70, sort asc, take first + `text`
  
**Question:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `AUT`  
  
```json
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "target", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "From items with rating ≥ 70, sort labels A→Z and take the first."
  }
}
```
  
---
  
### Example D — Parallel lists + `last` compare (IDs) + `text`
  
**Question:** “Is KOR’s rating greater than the max-rating country?”  
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
    "ops": "Get KOR’s rating.",
    "ops2": "Find the maximum rating across all countries.",
    "last": "Compare KOR’s rating to the maximum rating using the '>' operator."
  }
}
```
  
---
  
### Example E — Grouped chart, sums across different groups + `text`
  
**Question:** “Is the total sales of iPhone in 2024 greater than Samsung in 2023?”  
**Short Answer:** `true`
  
```json
{
  "ops": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "iPhone" },
    { "op": "filter", "field": "year", "operator": "==", "value": "2024" },
    { "op": "sum", "field": "sales" }
  ],
  "ops2": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "Samsung" },
    { "op": "filter", "field": "year", "operator": "==", "value": "2023" },
    { "op": "sum", "field": "sales" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Compute the total sales of iPhone in 2024.",
    "ops2": "Compute the total sales of Samsung in 2023.",
    "last": "Check whether iPhone-2024 total is greater than Samsung-2023 total."
  }
}
```
  
---
  
### Example F — Multiline: target a specific series (group value)
  
**Question:** “What is the maximum value on the MSFT line?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "findExtremum", "field": "value", "which": "max", "group": "MSFT" }
  ],
  "text": {
    "ops": "Within the MSFT line (series), return the datum with the maximum value."
  }
}
```
  
---
  
### Example G — Multiline dual-target object form (`compareBool`)
  
**Question:** “At 2024-01-01, is MSFT higher than AMZN?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "date", "target": "2024-01-01", "group": "MSFT" }
  ],
  "ops2": [
    { "op": "retrieveValue", "field": "date", "target": "2024-01-01", "group": "AMZN" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Get MSFT’s value at 2024-01-01.",
    "ops2": "Get AMZN’s value at 2024-01-01.",
    "last": "Check whether MSFT’s value is greater than AMZN’s at that date."
  }
}
```
  
---
  
### Example H — Dual-target object form without parallel lists (`diff`)
  
**Question:** “What is the difference between MSFT and AMZN on 2024-01-01?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    {
      "op": "diff",
      "field": "value",
      "targetA": { "category": "2024-01-01", "series": "MSFT" },
      "targetB": { "category": "2024-01-01", "series": "AMZN" },
      "signed": true
    }
  ],
  "text": {
    "ops": "Compute the signed difference MSFT − AMZN at 2024-01-01."
  }
}
```
  
---
  
### Example I — Nested filter + aggregation in a grouped chart
  
**Question:** “Among MSFT values after 2015-01-01, what is the average?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2015-01-01", "group": "MSFT" },
    { "op": "average", "field": "value", "group": "MSFT" }
  ],
  "text": {
    "ops": "Filter MSFT series to dates ≥ 2015-01-01, then compute the average value."
  }
}
```
  
---
  
### Example J — Sort with group and pick nth
  
**Question:** “What is the second-highest AMZN value?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "sort", "field": "value", "order": "desc", "group": "AMZN" },
    { "op": "nth", "n": 2, "from": "left", "group": "AMZN" }
  ],
  "text": {
    "ops": "Sort AMZN series values descending, then take the second."
  }
}
```
  
---
  
### Example K — Multi-series comparison using `last`
  
**Question:** “Between MSFT (2020-01-01) and AMZN (2020-01-01), which is higher?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "date", "target": "2020-01-01", "group": "MSFT" }
  ],
  "ops2": [
    { "op": "retrieveValue", "field": "date", "target": "2020-01-01", "group": "AMZN" }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" }
  ],
  "text": {
    "ops": "Get MSFT’s value at 2020-01-01.",
    "ops2": "Get AMZN’s value at 2020-01-01.",
    "last": "Return whichever of MSFT or AMZN is higher on 2020-01-01."
  }
}
```
  
---
  
### Example L — Stacked bar: total across stacks vs other group
  
**Question:** “Is total 2024 sales greater than total 2023 sales?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "sum", "field": "sales", "group": "2024" }
  ],
  "ops2": [
    { "op": "sum", "field": "sales", "group": "2023" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Sum sales in stack 2024.",
    "ops2": "Sum sales in stack 2023.",
    "last": "Check whether 2024’s total sales are greater than 2023’s."
  }
}
```
  
---
  
### Example M — Complex pipeline with filter + diff
  
**Question:** “What is the signed difference between MSFT and AMZN values on 2018-01-01, considering only dates after 2017?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2017-01-01" },
    {
      "op": "diff",
      "field": "value",
      "targetA": { "category": "2018-01-01", "series": "MSFT" },
      "targetB": { "category": "2018-01-01", "series": "AMZN" },
      "signed": true
    }
  ],
  "text": {
    "ops": "Filter to dates ≥ 2017-01-01, then compute MSFT − AMZN difference on 2018-01-01."
  }
}
```
  
---
  
### Example N — Range determination then extremum inside range
  
**Question:** “Within 2010–2020 on MSFT, what is the maximum value?”  
**Short Answer:** `…`
  
```json
{
  "ops": [
    { "op": "filter", "field": "date", "operator": "between", "value": ["2010-01-01", "2020-12-31"], "group": "MSFT" },
    { "op": "findExtremum", "field": "value", "which": "max", "group": "MSFT" }
  ],
  "text": {
    "ops": "Filter MSFT series to 2010–2020, then find the maximum value."
  }
}
```
  
---
  
## 10) Output Contract (STRICT)
  
Return JSON only.  
Return a single JSON object with:  
- `ops`: (required) array of operation objects  
- `ops2`, `ops3`, …: (optional) parallel lists  
- `last`: (optional) list combining previous results using **IDs**  
- **`text`: (required)** object providing **plain-text** descriptions that mirror the operation keys
  
Do **NOT** return a top-level JSON array.
  
---
  
## 11) Quality & Risk Notes (for authors)
  
- **Clarity vs. Brevity:** keep `text` short and faithful; overly terse text may hide important context; overly long text can confuse.  
- **Chart Alignment:** Mention fields and groups exactly as used; mismatches confuse users.  
- **Internationalization:** If the UI language differs, generate `text` in the UI language.  
- **Trade-off (critical note):** Plain strings are lightweight but can lose step-level traceability. If ambiguity arises, tighten wording to reflect the exact operation sequence (“filter… then sort… then take the first”).  
- **Privacy:** Do not leak sensitive values beyond what the question and data imply.
  
---
  
### Quick Template (copyable)
  
```json
{
  "ops": [ /* ... */ ],
  "ops2": [ /* optional */ ],
  "ops3": [ /* optional */ ],
  "last": [ /* optional */ ],
  "text": {
    "ops": "…",
    "ops2": "…",
    "ops3": "…",
    "last": "…"
  }
}
```
# NL → Spec Conversion Guide (LLM-Oriented, Revised)

---

## 0) TL;DR & IO Contract

**Input to the LLM:**
1. **Data** (CSV/JSON as `DatumValue` list)
2. **Chart** (e.g., Vega-Lite spec)
3. **User’s Question** (natural language)
4. **Short Answer**
5. **NL Explanation** (step-by-step reasoning)

**LLM Output:**
- **A single JSON object** with one or more **ordered operation lists**: `ops`, `ops2`, `ops3`, …  
- Each list is an ordered program and **must end in exactly one `Datum` or one `Boolean`**.
- If results must be combined afterward, use an **optional** top-level key **`last`**.
- **Human-Readable Descriptions:** Add a top-level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and provides **plain text** descriptions (strings only; **no** nested objects or arrays). See §8.
- **Return JSON only** (no extra commentary).

---

## 1) Inputs & Value Types

```ts
class DatumValue {
  constructor(
    category: string,   // label field (e.g., 'country', 'brand')
    measure: string,    // value field (e.g., 'rating', 'sales')
    target: string,     // label value (e.g., 'KOR', 'iPhone')
    group: string|null, // subgroup label value (e.g., 'MSFT', 'AMZN', '2024') for multi-line/stacked/grouped charts; null otherwise
    value: number,      // numeric value (e.g., 82, 1.25)
    id?: string         // runtime-assigned id for cross-list referencing
  ) {}
}
class IntervalValue { constructor(category: string, min: number, max: number) {} }
class ScalarValue   { constructor(value: number) {} }
class BoolValue     { constructor(category: string, bool: boolean) {} }
```

**Defaults:** If field names are ambiguous, use: category → `"target"`, measure → `"value"`.

**Group label values:** In multi-line, grouped-bar, stacked-bar charts, the `group` value is always a **concrete subgroup label value** (e.g., `MSFT`, `2024`), not the field name. The runtime infers the group field from the chart encoding.

---

## 2) Canonical Parameter Meanings

- **`field`** — target field. If a label/category, use explicit name (e.g., `"country"`), else `"target"`. If a measure, use explicit name (e.g., `"rating"`), else `"value"`.
- **`target`** — a concrete **category value** (e.g., `"KOR"`, `"iPhone"`).
- **`targetA` / `targetB`** — two items to compare in `compare`/`compareBool`.
  - In **regular lists**: category values.
  - In **`last`**: **IDs** of earlier results (see §4).
- **`group`** — **subgroup label value** (for multi-line/grouped/stacked charts). Always the **actual label value** (e.g., `"MSFT"`), never the field name.
- **`which`** — `"max"` or `"min"` (for `findExtremum`).
- **`order`** — `"asc"` or `"desc"` (for `sort`).
- **`operator`** — one of `">"`, `">="`, `"<"`, `"<="`, `"=="`, `"!="`, `"eq"`, `"in"`, `"not-in"`, `"contains"`.
- **`n` / `from`** — positional selection; `n` is 1-based; `from` is `"left"` or `"right"`.

---

## 3) Supported Operations (LLM Must Use Only These)

Each list must **terminate** in a single `Datum` or `Boolean`.

### 3.1 `retrieveValue`
- **Purpose:** Return all datum(s) whose category equals `target` (optionally within a group).
- **Params:** `{ "field": string, "target": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.2 `filter`
- **Purpose:** Filter by `field` using `operator` and `value`.
- **Params:** `{ "field": string, "operator": ..., "value": ..., "group"?: string }`
- **Returns:** `Data`

### 3.3 `compare`
- **Purpose:** Select the **winning datum** between two targets by comparing their numeric values (optionally after aggregation).
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "aggregate"?: ..., "which"?: ... }`
- **Returns:** `Datum[]`
- **In `last`:** `targetA`/`targetB` are **IDs** of earlier results.

### 3.4 `compareBool`
- **Purpose:** Compare two items’ numeric values with a relational operator and return a **Boolean**.
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "operator": ... }`
- **Returns:** `Boolean`
- **In `last`:** `targetA`/`targetB` are **IDs**.

### 3.5 `findExtremum`
- **Purpose:** Find the min/max datum by a measure.
- **Params:** `{ "field": string, "which": "max"|"min", "group"?: string }`
- **Returns:** `Datum[]`

### 3.6 `sort`
- **Purpose:** Sort by label (lexicographic) or by a measure (numeric).
- **Params:** `{ "field": string, "order": "asc"|"desc", "group"?: string }`
- **Returns:** `Datum[]`

### 3.7 `determineRange`
- **Purpose:** Compute `[min, max]` for a field.
- **Params:** `{ "field": string, "group"?: string }`
- **Returns:** `Interval`

### 3.8 `count`
- **Purpose:** Count items in the current data slice.
- **Params:** `{}`
- **Returns:** `Datum[]`

### 3.9 `sum`
- **Purpose:** Sum numeric values across the current data slice (or field).
- **Params:** `{ "field": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.10 `average`
- **Purpose:** Average numeric values across the current data slice (or field).
- **Params:** `{ "field": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.11 `diff`
- **Purpose:** Difference between two targets (optionally after aggregation).
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "aggregate"?: ... }`
- **Returns:** `Datum[]`

### 3.12 `nth`
- **Purpose:** Pick the n-th item by the current visual/ordering convention.
- **Params:** `{ "field"?: string, "n": number, "from"?: "left"|"right" }`
- **Returns:** `Datum[]`

---

## 4) IDs & `last` Referencing

- Top-level keys: `ops` (required), plus `ops2`, `ops3`, … (optional), **`last`** (optional), and **`text` (required; see §8)**.
- **Each list terminates** in a single `Datum` or `Boolean`.
- **Runtime ID assignment:** After each non-`last` list runs, the runtime sets an ID on each returned `DatumValue`:
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0", ...
  ```
- **Referencing in `last`:** Use these **IDs** (`"ops_0"`, `"ops2_0"`, …) in fields like `targetA`/`targetB`. **Do not** use category labels in `last`.
- **`text` does not affect execution** and has no IDs; it is purely for **human readers**.

---

## 5) Normalization & Determinism

- If NL omits field names: **label → `"target"`**, **measure → `"value"`**.
- Extremum: “largest/highest/top” → `"max"`, “smallest/lowest/bottom” → `"min"`.
- Comparisons: “greater than”→`">"`, “at least”→`">="`, “less than”→`"<"`, “at most”→`"<="`, “equal”→`"=="`/`"eq"`.
- Numbers in JSON must be numbers (not strings).
- If a **tie** is possible on an operation that must return a single winner, prefer `compareBool`, or use `sort` + `nth` to enforce determinism.

---

## 6) Checklist for LLMs

1. Map fields to explicit names when present; otherwise, use defaults (`"target"`, `"value"`).
2. Use only the Supported Operations in §3.
3. In **`last`**, reference earlier results via **IDs**: `<opKey>_<index>` (e.g., `ops_0`, `ops2_0`).
4. Emit **valid JSON only**; no prose outside the JSON.
5. Ensure numeric thresholds are numbers (not strings).
6. Normalize synonyms (e.g., “highest” → `which:"max"`).
7. **Provide a `text` object** whose **values are plain strings** (no `summary`/`steps`). Keys **mirror** the operation lists present.
8. For **yes/no** questions, use `compareBool`. For **“which is larger/smaller?”** questions that require returning an item, use `compare`.
9. Avoid `compare` if a **tie** could occur on the chosen slice and aggregation; refine the slice (e.g., with `filter`) or use `sort` + `nth` to ensure a deterministic winner, or switch to `compareBool` if a boolean is acceptable.

---

## 7) `text` Object Rules (Human-Readable Descriptions)

- Top-level **`text`** **must** be present.
- Its keys **mirror** the operation program keys: `ops`, `ops2`, `ops3`, …, and `last` if present.
- **Each value is a single plain-text string** describing **what that list accomplishes overall** (not a JSON object; **no** `summary`/`steps`/arrays).
- Prefer **one concise sentence**; two short sentences are acceptable if clarity demands.
- Be **concrete**: name actual fields/groups as used.
- For **`last`**, explicitly state what is being compared/combined and by which **operator**.
- Avoid code-like jargon; write for a general audience.
- Do **not** use keys like `"ops1"` in `text` when the actual list key is `"ops"`.
- Do **not** insert JSON-like substructure (`summary`, `steps`, arrays).
- Do **not** mismatch what the text claims and what the ops do.

---

## 8) Extended Examples (A–N)

### Example A — Simple retrieval + `text`
**Q:** “Give me the value for KOR.”  
**Short Answer:** `KOR: 82`
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "Retrieve the value where country equals KOR."
  }
}
```

### Example D2 — Parallel lists + `last` compare (IDs) + `text` (returns a Datum)
**Q:** “Between KOR and JPN, which has the higher rating?”  
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
    "ops": "Get KOR’s rating.",
    "ops2": "Get JPN’s rating.",
    "last": "Return whichever of KOR or JPN has the higher rating (max)."
  }
}
```

### Example B — Find maximum + `text`
**Q:** “Which country has the highest rating?”  
**Short Answer:** `NLD`
```json
{
  "ops": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "text": {
    "ops": "Find the country with the maximum rating."
  }
}
```

### Example C — Filter ≥ 70, sort asc, take first + `text`
**Q:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `AUT`
```json
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "target", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "From items with rating ≥ 70, sort labels A→Z and take the first."
  }
}
```

### Example D — Parallel lists + `last` compareBool (IDs) + `text`
**Q:** “Is KOR’s rating greater than the max-rating country?”  
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
    "ops": "Get KOR’s rating.",
    "ops2": "Find the maximum rating across all countries.",
    "last": "Compare KOR’s rating to the maximum rating using the '>' operator."
  }
}
```

### Example E — Grouped chart, sums across different groups + `text`
**Q:** “Is the total sales of iPhone in 2024 greater than Samsung in 2023?”  
**Short Answer:** `true`
```json
{
  "ops": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "iPhone" },
    { "op": "filter", "field": "year", "operator": "==", "value": "2024" },
    { "op": "sum", "field": "sales" }
  ],
  "ops2": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "Samsung" },
    { "op": "filter", "field": "year", "operator": "==", "value": "2023" },
    { "op": "sum", "field": "sales" }
  ],
  "last": [
    { "op": "compareBool", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Compute the total sales of iPhone in 2024.",
    "ops2": "Compute the total sales of Samsung in 2023.",
    "last": "Check whether iPhone-2024 total is greater than Samsung-2023 total."
  }
}
```

### Example F — Multiline: target a specific series (group value)
**Q:** “What is the maximum value on the MSFT line?”  
**Short Answer:** `…`
```json
{
  "ops": [
    { "op": "findExtremum", "field": "value", "which": "max", "group": "MSFT" }
  ],
  "text": {
    "ops": "Within the MSFT line (series), return the datum with the maximum value."
  }
}
```

---

## 9) Output Contract (STRICT)

- Return JSON only.
- Return a single JSON object with:
  - `ops`: (required) array of operation objects
  - `ops2`, `ops3`, …: (optional) parallel lists
  - `last`: (optional) list combining previous results using **IDs**
  - **`text`: (required)** object providing **plain-text** descriptions that mirror the operation keys
- **Do NOT return a top-level JSON array.**

---

## 10) Quality & Risk Notes

- **Clarity vs. Brevity:** Keep `text` short and faithful; overly terse text may hide important context; overly long text can confuse.
- **Chart Alignment:** Mention fields and groups exactly as used; mismatches confuse users.
- **Internationalization:** If the UI language differs, generate `text` in the UI language.
- **Trade-off:** Plain strings are lightweight but can lose step-level traceability. If ambiguity arises, tighten wording to reflect the exact operation sequence (“filter… then sort… then take the first”).
- **Privacy:** Do not leak sensitive values beyond what the question and data imply.

---

### Quick Template
```json
{
  "ops": [ /* ... */ ],
  "ops2": [ /* optional */ ],
  "ops3": [ /* optional */ ],
  "last": [ /* optional */ ],
  "text": {
    "ops": "…",
    "ops2": "…",
    "ops3": "…",
    "last": "…"
  }
}
```