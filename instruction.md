# NL to Spec Conversion Guideline (Revised — Plain `text` Descriptions)

---

## 0) Purpose & IO Contract

**Input provided to the LLM**

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
    group: string|null, // subgroup id for grouped/stacked charts; null otherwise
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

---

## 2) Canonical Parameter Meanings

- **`field`** — target field. If a label/category, prefer the explicit name (e.g., `"country"`), else `"target"`. If a measure, prefer explicit name (e.g., `"rating"`), else `"value"`.  
- **`target`** — a concrete **category value** (e.g., `"KOR"`, `"iPhone"`).  
- **`targetA` / `targetB`** — two items to compare in `compareBool`.  
  - In **regular lists** (`ops`, `ops2`, …): category values.  
  - In **`last`**: **IDs** of earlier results (see §4).  
- **`group`** — subgroup label (only for grouped/stacked charts). Omit or set `null` for simple charts.  
- **`which`** — `"max"` or `"min"` (for `findExtremum`).  
- **`order`** — `"asc"` or `"desc"` (for `sort`).  
- **`operator`** — one of `">"`, `">="`, `"<"`, `"<="`, `"=="`, `"!="`, `"eq"`, `"in"`, `"not-in"`, `"contains"`  
- **`n` / `from`** — positional selection; `n` is 1-based; `from` is `"left"` or `"right"`.

---

## 3) Supported Operation Specs (Correct & Precise)

Use **only** the following op names. Each list must **terminate** in a single `Datum` or `Boolean`.

### 3.1 `retrieveValue`
- **Purpose:** Return the single datum matching a category value (optionally within a group).  
- **Params:** `{ "field": string, "target": string, "group"?: string }`  
- **Returns:** `Datum`

### 3.2 `filter`
- **Purpose:** Filter the current data by `field`, `operator`, and `value`.  
- **Params:** `{ "field": string, "operator": "...", "value": any }`  
- **Returns:** `Datum[]`

### 3.3 `compareBool`
- **Purpose:** Compare two items’ numeric values with an operator.  
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "operator": ">"|">="|"<"|"<="|"=="|"eq" }`  
- **Returns:** `Boolean` (`BoolValue` with `category: ""`)  
- **Note:** In `last`, `targetA`/`targetB` must be **IDs** (see §4).

### 3.4 `findExtremum`
- **Purpose:** Find the min/max datum by a measure.  
- **Params:** `{ "field": string, "which": "max"|"min", "group"?: string }`  
- **Returns:** `Datum`

### 3.5 `sort`
- **Purpose:** Sort by label (lexicographic) or by a measure (numeric).  
- **Params:** `{ "field": string, "order": "asc"|"desc", "group"?: string }`  
- **Returns:** `Datum[]`

### 3.6 `determineRange`
- **Purpose:** Compute `[min, max]` for a field (category or value).  
- **Params:** `{ "field": string, "group"?: string }`  
- **Returns:** `Interval` (not terminal)

### 3.7 `count`
- **Purpose:** Count items in the current data slice.  
- **Params:** `{}`  
- **Returns:** `Datum` (single numeric count wrapped as a `DatumValue`)

### 3.8 `sum`
- **Purpose:** Sum numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string }`  
- **Returns:** `Datum`

### 3.9 `average`
- **Purpose:** Average numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string }`  
- **Returns:** `Datum`

### 3.10 `diff`
- **Purpose:** Difference between two targets (optionally after aggregation).  
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "aggregate"?: "sum"|"avg"|"min"|"max" }`  
- **Returns:** `Datum`

### 3.11 `nth`
- **Purpose:** Pick the n-th item by the current visual/ordering convention.  
- **Params:** `{ "field"?: string, "n": number, "from"?: "left"|"right" }`  
- **Returns:** `Datum`

---

## 4) Output Format & ID Referencing (very important)

- Top-level keys: `ops` (required), plus `ops2`, `ops3`, … (optional), **`last`** (optional), and **`text` (required; see §8)**.  
- **Each list terminates** in a single `Datum` or `Boolean`. Intermediates can be `Data`/`Interval`/`Scalar`.  
- **Runtime ID assignment (for non-`last` lists):** After each non-`last` list runs, the runtime sets an ID on each returned `DatumValue`:  
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0", ...
  ```
- **Referencing in `last`:** When combining earlier results, use these **IDs** (`"ops_0"`, `"ops2_0"`, …) in fields like `targetA`/`targetB`. **Do not** use category labels in `last`.  
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
    { "op": "filter", "field": "group", "operator": "==", "value": "2024" },
    { "op": "sum", "field": "sales" }
  ],
  "ops2": [
    { "op": "filter", "field": "brand", "operator": "==", "value": "Samsung" },
    { "op": "filter", "field": "group", "operator": "==", "value": "2023" },
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
