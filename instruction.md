# NL → Spec Conversion Guideline (Single‑Sequence `ops` • v1.1 • 2025‑10‑26)

---

## 0) Purpose & IO Contract (Author‑Facing Prompt)

**You are given:**
1) **Data** (CSV/JSON; conceptually, a list of `DatumValue`).
2) **Chart** (e.g., Vega‑Lite spec).
3) **User’s Question** (natural language).
4) **Short Answer** (the final answer string/value).
5) **Natural‑Language Explanation** (NL steps that produced the answer).
6) **Optional:** `textLocale` (UI locale like `"en-US"`, `"ko-KR"`) for `text` language.

**You must output:**
- A **single JSON object** with one or more **ordered operation lists**: `ops`, `ops2`, `ops3`, …
- **Core rule — Single‑Sequence per key:** Each top‑level list (`ops`, `ops2`, …) must encode **exactly one human‑perceived sequence** (see §2). Each list **must end in exactly one `Datum` or one `Boolean`.**
- If multiple sequences need to be combined **after** they finish, put the combining step(s) under **`last`** (optional). `last` also **must end** in exactly one `Datum` or one `Boolean`.
- **Human‑readable annotations:** Provide a top‑level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and gives **one plain sentence** per key (strings only; no nested structure). See §7.

**Strict output format:**
Return JSON only between these sentinels:
```
BEGIN_JSON
{ ... }
END_JSON
```
No commentary or code fences outside the sentinels.

---

## 1) Runtime Value Types

```ts
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
```
**Defaults:** If NL omits explicit field names → **label → `"target"`**, **measure → `"value"`**.
**Groups:** In multi‑line, grouped‑bar, stacked‑bar charts, `group` is a **concrete subgroup label value** (e.g., `"MSFT"`, `"2024"`), **not** a field name. The runtime infers the group field from the chart encoding.

---

## 2) The Sequencing Rule (What belongs in one `ops`?)
**Definition — Sequence Unit:** A sequence is a **single linear chain** of operations where each step’s input is the **output of the previous step**, as a human would read with cues like *then, next, within, after*. Encode each such chain in **one** top‑level key (`ops`, `ops2`, …).

**Segmentation heuristics:**
- **Keep together** when NL implies linear dependence: “Filter to 2024, then sum sales” → one list.
- **Split into parallel lists** when NL implies **independent calculations** to be compared/combined later: “Total iPhone‑2024 vs Samsung‑2023” → two lists (`ops`, `ops2`) + combine in `last`.
- **Do not split** a single chain across multiple keys (hurts readability and determinism).
- **Do not merge** independent chains into one key (creates hidden branching and confuses readers).
- **Lexical cues:**
  - Single sequence: *then, next, after, within, among, finally*.
  - Separate sequences: *respectively, for each of A and B, separately, in parallel*.

**Decision quick‑check:**
1) Does step B require the **result** of step A? → **Same `ops`.**
2) Are two computations **independent** and only compared at the end? → **Different lists** + **`last`**.
3) Does one branch operate on **different targets/series** with no cross‑dependence until the final comparison? → **Different lists.**

---

## 3) Canonical Parameters
- **`field`** — target field; prefer explicit names (e.g., `"country"`, `"rating"`), else `"target"`/`"value"` defaults.
- **`target`** — concrete **category value** (e.g., `"KOR"`, `"iPhone"`, `"2024-01-01"`).
- **`targetA` / `targetB`** — the two items for `compare`/`compareBool`/`diff`.
  - In regular lists: **category values** (or dual‑target objects where supported below).
  - In **`last`**: **IDs** of prior results (see §5).
- **`group`** — subgroup **label value** selecting a line/series/stack (e.g., `"MSFT"`, `"2024"`).
- **`which`** — `"max"|"min"` (for `findExtremum`).
- **`order`** — `"asc"|"desc"` (for `sort`).
- **`operator`** — one of `">", ">=", "<", "<=", "==", "!=", "in", "not-in", "contains", "between"`.
  - `between` is **inclusive** and intended for **label ranges** (e.g., dates as ISO strings).
- **`n` / `from`** — positional pick; `n` is 1‑based; `from` is `"left"|"right"`.

---

## 4) Supported Operations (use only these)
Each list must **terminate** in exactly one `Datum` or `Boolean`.

### 3.1 `retrieveValue`
- **Purpose:** All datum(s) whose category equals `target` (optionally within a `group`).
- **Params:** `{ "field": string, "target": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.2 `filter`
- **Purpose:** Filter by `field` using `operator` and `value`.
- **Params:** `{ "field": string, "operator": oneOf, "value": number|string|Array, "group"?: string }`
- **Returns:** `Data`

### 3.3 `compare`
- **Purpose:** Select the **winning datum** by comparing numeric values (optionally after aggregation).
- **Params (simple):** `{ "field": string, "targetA": string, "targetB": string, "group"?: string, "aggregate"?: "sum"|"avg"|"min"|"max", "which"?: "max"|"min" }`
- **Params (dual‑target object):** `{ "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "aggregate"?: ..., "which"?: ... }`
- **Returns:** `Datum[]`

### 3.4 `compareBool`
- **Purpose:** Relational compare returning **Boolean**.
- **Params (simple/object forms analogous to `compare`):** `{ "field": string, "targetA": ..., "targetB": ..., "operator": ">"|">="|"<"|"<="|"==" }`
- **Returns:** `Boolean`

### 3.5 `findExtremum`
- **Purpose:** Min/Max by a measure (optionally within `group`).
- **Params:** `{ "field": string, "which": "max"|"min", "group"?: string }`
- **Returns:** `Datum[]`

### 3.6 `sort`
- **Purpose:** Sort by label or measure (optionally within `group`).
- **Params:** `{ "field": string, "order": "asc"|"desc", "group"?: string }`
- **Returns:** `Datum[]`

### 3.7 `determineRange`
- **Purpose:** Compute `[min,max]` for a field.
- **Params:** `{ "field": string, "group"?: string }`
- **Returns:** `Interval` (not terminal)

### 3.8 `count`
- **Purpose:** Count items in the current slice.
- **Params:** `{ "group"?: string }`
- **Returns:** `Datum[]` (single numeric count as `DatumValue`)

### 3.9 `sum`
- **Purpose:** Sum numeric values (optionally within `group`).
- **Params:** `{ "field": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.10 `average`
- **Purpose:** Average numeric values (optionally within `group`).
- **Params:** `{ "field": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.11 `diff`
- **Purpose:** Difference between two targets (optionally after aggregation).
- **Params (simple):** `{ "field": string, "targetA": string, "targetB": string, "group"?: string, "aggregate"?: "sum"|"avg"|"min"|"max", "signed"?: boolean }`
- **Params (dual‑target object):** `{ "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "aggregate"?: ..., "signed"?: boolean }`
- **Returns:** `Datum[]`

### 3.12 `nth`
- **Purpose:** Pick the n‑th item by the current visual/ordering convention.
- **Params:** `{ "field"?: string, "n": number, "from"?: "left"|"right", "group"?: string }`
- **Returns:** `Datum[]`

---

## 5) IDs & `last` Referencing (very important)
- After each **non‑`last`** list runs, the runtime assigns IDs to returned `DatumValue`s:
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0"
  ```
- In **`last`**, always reference prior results by **ID** (e.g., `"ops_0"`, `"ops2_0"`). **Never** use raw labels here.
- **Allowed ops in `last`:** `compare`, `compareBool`, `diff` are common. Ensure `last` also ends in a **single** `Datum` or `Boolean`.

---

## 6) Normalization & Determinism
- If NL omits fields: **label → `"target"`**, **measure → `"value"`**.
- Synonyms: “largest/highest/top” → `which:"max"`; “smallest/lowest/bottom” → `which:"min"`.
- **Determinism guardrail:** If an op sequence might return **multiple** items before the terminal step, you **must** add steps (e.g., `sort` + `nth`, or extra `filter`) so the list ends in **exactly one** `Datum` or one `Boolean`.
- Prefer one operator form; we support both `"=="` and `"!="` (no `"eq"`).

---

## 7) Human‑Readable `text` (Plain Strings)
- Top‑level **`text`** **must** be present.
- Keys **mirror** the actual list keys included (`ops`, `ops2`, …, `last`). Do not invent keys like `"ops1"`.
- **Each value is a single sentence** describing what the list accomplishes overall. Two short sentences allowed if needed.
- Mention concrete fields and groups. For `last`, state what is compared/combined and with which operator.
- Language: use `textLocale` if provided; otherwise default to English.
- `text` does **not** affect execution and has no IDs.

---

## 8) Output Contract (STRICT)
Return a single JSON object between `BEGIN_JSON` and `END_JSON` sentinels:
- `ops` (required): array of operation objects encoding **one sequence**.
- `ops2`, `ops3`, … (optional): additional sequences.
- `last` (optional): combines earlier results by ID.
- `text` (required): plain strings mirroring keys.
No top‑level JSON arrays; no extra prose.

---

## 9) Authoring Checklist
1. Map fields to explicit names when possible; else defaults.
2. Apply the **Sequencing Rule** (one human‑perceived sequence per key).
3. Use only §4 operations.
4. Ensure termination: each list ends in **one** `Datum` or **one** `Boolean`.
5. In `last`, reference results by **ID** only.
6. Use numeric types for numbers (not strings).
7. Provide `text` with keys that mirror actual lists.
8. For yes/no questions, prefer `compareBool`; for “which is larger/smaller?”, use `compare` with a deterministic winner.
9. If a slice can tie or return multiple items, **enforce determinism** (`sort` + `nth` or refine filters).

---

## 10) Validator Rules (for automation)
- Reject if any list doesn’t terminate in exactly one `Datum`/`Boolean`.
- Reject if `last` uses raw labels instead of IDs.
- Reject if `text` is missing, has keys not present in lists, or uses nested structures.
- Warn if `retrieveValue`/`filter` leaves multiple items immediately before termination.
- Warn if sequences appear merged (independent branches) or split (linear chain across multiple keys).

---

## 11) Examples (condensed and aligned with the Sequencing Rule)

### Example 1 — Single sequence (filter → sort → nth)
**Q:** “Among ratings ≥ 70, which label is first alphabetically?”
```
BEGIN_JSON
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
END_JSON
```

### Example 2 — Two sequences + `last` (independent totals compared)
**Q:** “Is the total sales of iPhone in 2024 greater than Samsung in 2023?”
```
BEGIN_JSON
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
    "last": "Check whether iPhone‑2024 total is greater than Samsung‑2023 total."
  }
}
END_JSON
```

### Example 3 — Two sequences + `last` (label retrievals then compare)
**Q:** “Between KOR and JPN, which has the higher rating?”
```
BEGIN_JSON
{
  "ops": [ { "op": "retrieveValue", "field": "country", "target": "KOR" } ],
  "ops2": [ { "op": "retrieveValue", "field": "country", "target": "JPN" } ],
  "last": [ { "op": "compare", "field": "rating", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" } ],
  "text": {
    "ops": "Get KOR’s rating.",
    "ops2": "Get JPN’s rating.",
    "last": "Return whichever of KOR or JPN has the higher rating (max)."
  }
}
END_JSON
```

### Example 4 — Multi‑line series (one sequence with group)
**Q:** “Within MSFT, what is the maximum value?”
```
BEGIN_JSON
{
  "ops": [ { "op": "findExtremum", "field": "value", "which": "max", "group": "MSFT" } ],
  "text": { "ops": "Within the MSFT series, return the datum with the maximum value." }
}
END_JSON
```

### Example 5 — Signed difference using dual‑target object (one sequence)
**Q:** “What is the signed difference MSFT − AMZN on 2024‑01‑01?”
```
BEGIN_JSON
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
  "text": { "ops": "Compute the signed difference MSFT − AMZN at 2024‑01‑01." }
}
END_JSON
```

---

## 12) Quick Template (copyable)
```
BEGIN_JSON
{
  "ops": [ /* one sequence */ ],
  "ops2": [ /* optional: another sequence */ ],
  "last": [ /* optional: combine by IDs */ ],
  "text": {
    "ops": "…",
    "ops2": "…",
    "last": "…"
  }
}
END_JSON
```

---

**Spec‑Version:** v1.1  
**Changelog:**
- Unified operator set; removed `eq`.
- Clarified `between` (inclusive, label ranges).
- Formalized **Single‑Sequence per `ops`** rule and segmentation heuristics.
- Normalized `diff.signed`, `count.group?`.
- Added sentinels `BEGIN_JSON`/`END_JSON` and `textLocale` note.
- Consolidated duplicate sections into one authoritative spec.

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
    group: string|null, // subgroup label value (e.g., 'MSFT', 'AMZN', '2024') for multiple-line/stacked/grouped charts; null otherwise
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
- **Returns:** `Datum[]`
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
    group: string|null, // subgroup label value (e.g., 'MSFT', 'AMZN', '2024') for multiple-line/stacked/grouped charts; null otherwise
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
**Short Answer:** `KOR: 52`
```json
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "Retrieve the value where country equals KOR → **52**."
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
    "ops": "Get KOR’s rating **52**.",
    "ops2": "Get JPN’s rating **42**.",
    "last": "Compare 52 vs 42 → return **KOR** (max)."
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
    "ops": "Find the country with the maximum rating → **NLD: 76**."
  }
}
```

### Example C — Filter ≥ 70, sort asc, take first + `text`
**Q:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `GBR`
```json
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "country", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "Eligible {**GBR:75**, **IRL:70**, **NLD:76**}; A→Z pick → **GBR**."
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
    "ops": "KOR’s rating is **52**.",
    "ops2": "Global maximum is **NLD:76**.",
    "last": "Compare 52 > 76 → **false**."
  }
}
```



### Example F — Multiline: target a specific series (group value)
**Q:** “What is the maximum value on the MSFT line?”  
**Short Answer:** `…`
```json
{
  "ops": [
    { "op": "findExtremum", "field": "price", "which": "max", "group": "MSFT" }
  ],
  "text": {
    "ops": "Within the MSFT line (series), return the datum with the maximum price **35.03** (on 2007‑10‑01)."
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
# NL → Spec Conversion Guideline (Single‑Sequence `ops` • v1.2 • 2025‑10‑26)

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
- **Core rule — Single‑Sequence per key:** Each top‑level list (`ops`, `ops2`, …) must encode **exactly one human‑perceived sequence** (see §2). Each list **must end in exactly one `Datum` or one `Boolean`.**
- If multiple sequences need to be combined **after** they finish, put the combining step(s) under **`last`** (optional). `last` also **must end** in exactly one `Datum` or one `Boolean`.
- **Human‑readable annotations:** Provide a top‑level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and gives **one plain sentence** per key (strings only; no nested structure). See §7.

**Strict output format:**
Return JSON only between these sentinels:
```
BEGIN_JSON
{ ... }
END_JSON
```
No commentary or code fences outside the sentinels.

---

## 1) Runtime Value Types

```ts
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
```
**Defaults:** If NL omits explicit field names → **label → `"target"`**, **measure → `"value"`**.
**Groups:** In multi‑line, grouped‑bar, stacked‑bar charts, `group` is a **concrete subgroup label value** (e.g., `"MSFT"`, `"2024"`), **not** a field name. The runtime infers the group field from the chart encoding.

---

## 2) The Sequencing Rule (What belongs in one `ops`?)
**Definition — Sequence Unit:** A sequence is a **single linear chain** of operations where each step’s input is the **output of the previous step**, as a human would read with cues like *then, next, within, after*. Encode each such chain in **one** top‑level key (`ops`, `ops2`, …).

**Segmentation heuristics:**
- **Keep together** when NL implies linear dependence: “Filter to 2024, then sum sales” → one list.
- **Split into parallel lists** when NL implies **independent calculations** to be compared/combined later: “Total iPhone‑2024 vs Samsung‑2023” → two lists (`ops`, `ops2`) + combine in `last`.
- **Do not split** a single chain across multiple keys (hurts readability and determinism).
- **Do not merge** independent chains into one key (creates hidden branching and confuses readers).
- **Lexical cues:**
  - Single sequence: *then, next, after, within, among, finally*.
  - Separate sequences: *respectively, for each of A and B, separately, in parallel*.

**Decision quick‑check:**
1) Does step B require the **result** of step A? → **Same `ops`.**
2) Are two computations **independent** and only compared at the end? → **Different lists** + **`last`**.
3) Does one branch operate on **different targets/series** with no cross‑dependence until the final comparison? → **Different lists.**

---

## 3) Canonical Parameters
- **`field`** — target field; prefer explicit names (e.g., `"country"`, `"rating"`), else `"target"`/`"value"` defaults.
- **`target`** — concrete **category value** (e.g., `"KOR"`, `"iPhone"`, `"2024-01-01"`).
- **`targetA` / `targetB`** — the two items for `compare`/`compareBool`/`diff`.
  - In regular lists: **category values** (or dual‑target objects where supported below).
  - In **`last`**: **IDs** of prior results (see §5).
- **`group`** — subgroup **label value** selecting a line/series/stack (e.g., `"MSFT"`, `"2024"`).
- **`which`** — `"max"|"min"` (for `findExtremum`).
- **`order`** — `"asc"|"desc"` (for `sort`).
- **`operator`** — one of `">", ">=", "<", "<=", "==", "!=", "in", "not-in", "contains", "between"`.
  - `between` is **inclusive** and intended for **label ranges** (e.g., dates as ISO strings).
- **`n` / `from`** — positional pick; `n` is 1‑based; `from` is `"left"|"right"`.

---

## 4) Supported Operations (use only these)
Each list must **terminate** in exactly one `Datum` or `Boolean`.

### 3.1 `retrieveValue`
- **Purpose:** All datum(s) whose category equals `target` (optionally within a `group`).
- **Params:** `{ "op": "retrieveValue", "field": string, "target": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.2 `filter`
- **Purpose:** Filter by `field` using `operator` and `value`.
- **Params:** `{ "op": "filter", "field": string, "operator": oneOf, "value": number|string|Array, "group"?: string }`
- **Returns:** `Data`

### 3.3 `compare`
- **Purpose:** Select the **winning datum** by comparing numeric values (optionally after aggregation).
- **Params (simple):** `{ "op": "compare", "field": string, "targetA": string, "targetB": string, "group"?: string, "aggregate"?: "sum"|"avg"|"min"|"max", "which"?: "max"|"min" }`
- **Params (dual‑target object):** `{ "op": "compare", "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "aggregate"?: ..., "which"?: ... }`
- **Returns:** `Datum[]`

### 3.4 `compareBool`
- **Purpose:** Relational compare returning **Boolean**.
- **Params (simple/object forms):** `{ "op": "compareBool", "field": string, "targetA": ..., "targetB": ..., "operator": ">"|">="|"<"|"<="|"==" }`
- **Returns:** `Boolean`

### 3.5 `findExtremum`
- **Purpose:** Min/Max by a measure (optionally within `group`).
- **Params:** `{ "op": "findExtremum", "field": string, "which": "max"|"min", "group"?: string }`
- **Returns:** `Datum[]`

### 3.6 `sort`
- **Purpose:** Sort by label or measure (optionally within `group`).
- **Params:** `{ "op": "sort", "field": string, "order": "asc"|"desc", "group"?: string }`
- **Returns:** `Datum[]`

### 3.7 `determineRange`
- **Purpose:** Compute `[min,max]` for a field.
- **Params:** `{ "op": "determineRange", "field": string, "group"?: string }`
- **Returns:** `Interval` (not terminal)

### 3.8 `count`
- **Purpose:** Count items in the current slice.
- **Params:** `{ "op": "count", "group"?: string }`
- **Returns:** `Datum[]` (single numeric count as `DatumValue`)

### 3.9 `sum`
- **Purpose:** Sum numeric values (optionally within `group`).
- **Params:** `{ "op": "sum", "field": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.10 `average`
- **Purpose:** Average numeric values (optionally within `group`).
- **Params:** `{ "op": "average", "field": string, "group"?: string }`
- **Returns:** `Datum[]`

### 3.11 `diff`
- **Purpose:** Difference between two targets (optionally after aggregation).
- **Params (simple):** `{ "op": "diff", "field": string, "targetA": string, "targetB": string, "group"?: string, "aggregate"?: "sum"|"avg"|"min"|"max", "signed"?: boolean }`
- **Params (dual‑target object):** `{ "op": "diff", "field": string, "targetA": { "category": string, "series"?: string }, "targetB": { "category": string, "series"?: string }, "aggregate"?: ..., "signed"?: boolean }`
- **Returns:** `Datum[]`

### 3.12 `nth`
- **Purpose:** Pick the n‑th item by the current visual/ordering convention.
- **Params:** `{ "op": "nth", "field"?: string, "n": number, "from"?: "left"|"right", "group"?: string }`
- **Returns:** `Datum[]`

---

## 5) IDs & `last` Referencing (very important)
- After each **non‑`last`** list runs, the runtime assigns IDs to returned `DatumValue`s:
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0"
  ```
- In **`last`**, always reference prior results by **ID** (e.g., `"ops_0"`, `"ops2_0"`). **Never** use raw labels here.
- **Allowed ops in `last`:** `compare`, `compareBool`, `diff`. Ensure `last` also ends in a **single** `Datum` or `Boolean`.

---

## 6) Normalization & Determinism
- If NL omits fields: **label → `"target"`**, **measure → `"value"`**.
- Synonyms: “largest/highest/top” → `which:"max"`; “smallest/lowest/bottom” → `which:"min"`.
- **Determinism guardrail:** If an op sequence might return **multiple** items before the terminal step, you **must** add steps (e.g., `sort` + `nth`, or extra `filter`) so the list ends in **exactly one** `Datum` or one `Boolean`.
- Prefer canonical operators; we support `"=="`, `"!="`, avoid `"eq"`.

---

## 7) Human‑Readable `text` (Plain Strings)
- Top‑level **`text`** **must** be present.
- Keys **mirror** the actual list keys included (`ops`, `ops2`, …, `last`). Do not invent keys like `"ops1"`.
- **Each value is a single sentence** describing what the list accomplishes overall. Two short sentences allowed if needed.
- Mention concrete fields and groups. For `last`, state what is compared/combined and with which operator.
- Language: use `textLocale` if provided; otherwise default to English.
- `text` does **not** affect execution and has no IDs.

---

## 8) Output Contract (STRICT)
Return a single JSON object between `BEGIN_JSON` and `END_JSON` sentinels:
- `ops` (required): array of operation objects encoding **one sequence**.
- `ops2`, `ops3`, … (optional): additional sequences.
- `last` (optional): combines earlier results by ID.
- `text` (required): plain strings mirroring keys.
No top‑level JSON arrays; no extra prose.

---

## 9) Authoring Checklist
1. Map fields to explicit names when possible; else defaults.
2. Apply the **Sequencing Rule** (one human‑perceived sequence per key).
3. Use only §4 operations.
4. Ensure termination: each list ends in **one** `Datum` or **one** `Boolean`.
5. In `last`, reference results by **ID** only.
6. Use numeric types for numbers (not strings).
7. Provide `text` with keys that mirror actual lists.
8. For yes/no questions, prefer `compareBool`; for “which is larger/smaller?”, use `compare` with a deterministic winner.
9. If a slice can tie or return multiple items, **enforce determinism** (`sort` + `nth` or refine filters).

---

## 10) Validator Rules (for automation)
- Reject if any list doesn’t terminate in exactly one `Datum`/`Boolean`.
- Reject if `last` uses raw labels instead of IDs.
- Reject if `text` is missing, has keys not present in lists, or uses nested structures.
- Warn if `retrieveValue`/`filter` leaves multiple items immediately before termination.
- Warn if sequences look **merged** (independent branches inside one key) or **split** (one linear chain spread across multiple keys).

### 10.1 Validator Snippet (TypeScript‑like pseudocode)
```ts
type Op = { op: string; [k: string]: any };
interface Program { [k: string]: Op[] | any }

const LIST_KEYS = ["ops", "ops2", "ops3", "ops4", "ops5"]; // extend as needed
const TERMINAL_OPS = new Set(["compare", "compareBool", "findExtremum", "sum", "average", "diff", "count", "nth", "retrieveValue"]);
const NON_TERMINAL_OPS = new Set(["filter", "sort", "determineRange"]);

function validate(spec: Program) {
  const errors: string[] = []; const warns: string[] = [];

  // 1) Structure & text mirror
  if (!spec || typeof spec !== "object") errors.push("Top-level must be an object");
  if (!spec.text || typeof spec.text !== "object") errors.push("Missing top-level text object");

  const listKeys = LIST_KEYS.filter(k => Array.isArray(spec[k]));
  if (listKeys.length === 0) errors.push("At least one list (ops, ops2, …) is required");

  // text keys must mirror present lists (+ optional last)
  const expectedTextKeys = new Set([...listKeys, ...(spec.last ? ["last"] : [])]);
  for (const k of expectedTextKeys) if (typeof spec.text[k] !== "string") errors.push(`text.${k} must be a plain string`);
  for (const k of Object.keys(spec.text)) if (!expectedTextKeys.has(k)) warns.push(`text.${k} has no corresponding list`);

  // 2) Termination per list
  function checkList(key: string) {
    const ops: Op[] = spec[key];
    if (!Array.isArray(ops) || ops.length === 0) { errors.push(`${key} must be a non-empty array`); return; }

    // linearity heuristic: disallow adjacent terminal ops before final
    for (let i = 0; i < ops.length - 1; i++) {
      if (TERMINAL_OPS.has(ops[i].op)) warns.push(`${key}[${i}] is terminal but followed by more ops (possible merged sequences)`);
    }

    const last = ops[ops.length - 1];
    if (!TERMINAL_OPS.has(last.op)) errors.push(`${key} must end in a terminal op (got "${last.op}")`);

    // determinism heuristic: if final op is not Boolean and upstream allows multiple, flag when no disambiguation seen
    const hasDisambiguation = ops.some(o => (o.op === "nth") || (o.op === "compare") || (o.op === "compareBool") || (o.op === "findExtremum") || (o.op === "sum") || (o.op === "average") || (o.op === "diff") || (o.op === "count"));
    if (!hasDisambiguation) warns.push(`${key} may return multiple items without explicit disambiguation`);
  }

  for (const k of listKeys) checkList(k);

  // 3) last rules
  if (spec.last) {
    const last: Op[] = spec.last;
    if (!Array.isArray(last) || last.length === 0) errors.push("last must be a non-empty array when present");
    const ids = new Set<string>();
    for (const k of listKeys) ids.add(`${k}_0`); // runtime guarantees exactly one per list; index 0

    // ensure ID usage
    for (const [i, op] of last.entries()) {
      if (!TERMINAL_OPS.has(op.op)) errors.push(`last[${i}] must be terminal (got "${op.op}")`);
      for (const idField of ["targetA", "targetB"]) {
        if (op[idField] && typeof op[idField] === "string" && !ids.has(op[idField])) errors.push(`last[${i}].${idField} must reference an ID from prior lists`);
      }
    }

    const lastEnd = last[last.length - 1];
    if (!TERMINAL_OPS.has(lastEnd.op)) errors.push("last must end in a terminal op");
  }

  return { valid: errors.length === 0, errors, warns };
}
```

---

## 11) Converting Natural‑Language **Explanation** → JSON Grammar
**Goal:** Given the user’s **question** and a **human explanation** of how the answer was obtained, convert the explanation into the grammar.

**Procedure:**
1) **Parse sequences**: Split the explanation into **human‑perceived sequences** using cues (*then*, *within*, *after* vs *respectively*, *for each*). Map each sequence to one list key (`ops`, `ops2`, …).
2) **Map actions to ops**: For each sentence/phrase, choose from §4 (`filter`, `sum`, `average`, `findExtremum`, `compare/compareBool`, `diff`, `sort`, `nth`, `retrieveValue`, `determineRange`).
3) **Enforce determinism**: Ensure each list ends in **one** `Datum` or `Boolean`. Add `sort + nth`, `findExtremum`, `sum/average`, etc., as needed.
4) **Combine**: If the explanation compares independent results, put the final comparison in `last` and reference earlier results by **ID** (e.g., `"ops_0"`).
5) **Author `text`**: Write one sentence per key stating what the sequence does (mention fields/groups). For `last`, state the comparison and operator.

**Meta‑Prompt Template (embed in your system or user message):**
```
Convert the provided natural-language explanation into the NL→Spec grammar.
- Apply the Single-Sequence rule: one human-perceived sequence per list key.
- Use only the supported ops. End each list in exactly one Datum or one Boolean.
- If combining results, put the final step(s) under `last` and reference earlier outputs by ID (ops_0, ops2_0, …).
- Return JSON only between BEGIN_JSON and END_JSON. Include a `text` object whose keys mirror the lists and whose values are single sentences.
```

---

## 12) Complex Examples (Explanation → Grammar)
Below, each example has (A) **Question**, (B) **Natural‑Language Explanation** (input), then (C) **JSON grammar** (output). Examples use the charts/data you provided.

### Ex‑A — Stocks (multi‑line): *max vs average over date ranges*
**Chart/Data:** `line_multiple.csv` with `symbol` (series), `date` (temporal), `price` (quantitative).

**(A) Question**: “After 2007‑01‑01, is **MSFT’s maximum price** greater than **AMZN’s average price** during 2007?”

**(B) Explanation (input)**: “For MSFT, consider dates on or after 2007‑01‑01 and take the **maximum** `price`. Separately, for AMZN, restrict to **2007‑01‑01 through 2007‑12‑31** and compute the **average** `price`. Finally, compare the two values and report whether MSFT’s max is greater.”

**(C) Grammar (output)**
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2007-01-01", "group": "MSFT" },
    { "op": "findExtremum", "field": "price", "which": "max", "group": "MSFT" }
  ],
  "ops2": [
    { "op": "filter", "field": "date", "operator": "between", "value": ["2007-01-01", "2007-12-31"], "group": "AMZN" },
    { "op": "average", "field": "price", "group": "AMZN" }
  ],
  "last": [
    { "op": "compareBool", "field": "price", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "Filter MSFT to dates ≥ 2007-01-01 and return the maximum price.",
    "ops2": "Within AMZN for 2007, compute the average price.",
    "last": "Check whether MSFT’s max price is greater than AMZN’s 2007 average."
  }
}
END_JSON
```

---

### Ex‑B — Weather (stacked vertical): *seasonal totals across different series*
**Chart/Data:** `bar_stacked_ver.csv` with `month` (nominal), `weather` (series), `count` (quantitative).

**(A) Question**: “Is the **total `sun` count in summer (months 6–8)** greater than the **total `fog` count in Q4 (months 10–12)**?”

**(B) Explanation (input)**: “For the `sun` series, restrict to months **6, 7, 8** and **sum** `count`. Separately, for the `fog` series, restrict to months **10, 11, 12** and **sum** `count`. Finally, compare the two totals (sun vs fog) and return a Boolean for `sun > fog`.”

**(C) Grammar (output)**
```
BEGIN_JSON
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
    "ops": "Sum the sun counts for months 6–8.",
    "ops2": "Sum the fog counts for months 10–12.",
    "last": "Check whether summer sun total is greater than Q4 fog total."
  }
}
END_JSON
```

---

### Ex‑C — Grouped horizontal (Urban vs Total): *per‑country gaps compared*
**Chart/Data:** `bar_grouped_hor.csv` with `Country` (label), `Urban/total` (series), `Persons per square kilometers` (value).

**(A) Question**: “Between **Macau** and **Singapore**, which country has the **larger gap** `Urban − Total` (absolute)?”

**(B) Explanation (input)**: “For **each** country (Macau and Singapore), take the value at series **Urban** and subtract the value at series **Total** to get a difference magnitude; use absolute value. Then compare the two differences and return the country with the larger gap.”

**(C) Grammar (output)**
```
BEGIN_JSON
{
  "ops": [
    {
      "op": "diff",
      "field": "Persons per square kilometers",
      "targetA": { "category": "Macau", "series": "Urban" },
      "targetB": { "category": "Macau", "series": "Total" },
      "signed": false
    }
  ],
  "ops2": [
    {
      "op": "diff",
      "field": "Persons per square kilometers",
      "targetA": { "category": "Singapore", "series": "Urban" },
      "targetB": { "category": "Singapore", "series": "Total" },
      "signed": false
    }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" }
  ],
  "text": {
    "ops": "Compute |Urban − Total| for Macau.",
    "ops2": "Compute |Urban − Total| for Singapore.",
    "last": "Return whichever country has the larger absolute gap."
  }
}
END_JSON
```

---

### Ex‑D — Stacked horizontal (opinions): *three‑way totals with pairwise `last`*
**Chart/Data:** `bar_stacked_hor.csv` with `Country` (label), `opinion` (series: Improve/Remain the same/Worsen), `percentage` (value).

**(A) Question**: “Across **EU5** (Britain, Germany, Spain, France, Italy), which opinion (**Improve**, **Remain the same**, **Worsen**) has the **highest total percentage**?”

**(B) Explanation (input)**: “Filter countries to the EU5 set. Separately sum `percentage` within each opinion series (**Improve**, **Remain the same**, **Worsen**). Finally, select the **maximum** of the three totals by comparing the first two, then comparing the winner with the third.”

**(C) Grammar (output)**
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "Country", "operator": "in", "value": ["Britain","Germany","Spain","France","Italy"] , "group": "Improve" },
    { "op": "sum", "field": "percentage", "group": "Improve" }
  ],
  "ops2": [
    { "op": "filter", "field": "Country", "operator": "in", "value": ["Britain","Germany","Spain","France","Italy"] , "group": "Remain the same" },
    { "op": "sum", "field": "percentage", "group": "Remain the same" }
  ],
  "ops3": [
    { "op": "filter", "field": "Country", "operator": "in", "value": ["Britain","Germany","Spain","France","Italy"] , "group": "Worsen" },
    { "op": "sum", "field": "percentage", "group": "Worsen" }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" },
    { "op": "compare", "field": "value", "targetA": "last_0", "targetB": "ops3_0", "which": "max" }
  ],
  "text": {
    "ops": "Sum EU5 totals for opinion ‘Improve’.",
    "ops2": "Sum EU5 totals for opinion ‘Remain the same’.",
    "ops3": "Sum EU5 totals for opinion ‘Worsen’.",
    "last": "Compare the three totals pairwise to return the maximum."
  }
}
END_JSON
```

---

### Ex‑E — Grouped vertical (age × gender): *within‑series extremum under a label range*
**Chart/Data:** `bar_grouped_ver.csv` with `age` (column facet), `gender` (series), `people` (quantitative sum).

**(A) Question**: “Among **Female** values for ages **35–55**, which **age** has the **largest population**?”

**(B) Explanation (input)**: “Within the **Female** series, restrict the label `age` to the inclusive range **35–55**, and then take the **maximum** by `people`. Return that single datum (which encodes the winning age).”

**(C) Grammar (output)**
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "age", "operator": "between", "value": [35,55], "group": "Female" },
    { "op": "findExtremum", "field": "people", "which": "max", "group": "Female" }
  ],
  "text": {
    "ops": "Filter Female to ages 35–55, then return the age with the maximum population."
  }
}
END_JSON
```

---

## 13) Quick Template (copyable)
```
BEGIN_JSON
{
  "ops": [ /* one sequence */ ],
  "ops2": [ /* optional: another sequence */ ],
  "last": [ /* optional: combine by IDs */ ],
  "text": {
    "ops": "…",
    "ops2": "…",
    "last": "…"
  }
}
END_JSON
```

---

**Spec‑Version:** v1.2  
**Changelog:**
- Added **Validator Snippet** (TypeScript‑like) and strengthened validator rules.
- Introduced §11 conversion protocol from **NL explanation → grammar** with a meta‑prompt template.
- Added **complex examples** spanning all provided charts and demonstrating the Single‑Sequence rule.
- Kept unified operator set and inclusive `between` semantics.
- Retained sentinels `BEGIN_JSON`/`END_JSON` and `textLocale` support.
# NL → Spec Conversion Guideline (Single‑Sequence `ops` • v1.3 • 2025‑10‑26)

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
- **Human‑readable annotations (`text`) — Value‑Forward Narration (NEW):** Provide a top‑level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and gives **one or two plain sentences** per key. Your sentences should **name concrete fields/labels** *and* (whenever the NL explanation provides enough detail) **state intermediate/final numeric values** and **explain how they compose into the final result**. Strings only; no nested structure.

**Strict output format:**
Return JSON only between these sentinels:
```
BEGIN_JSON
{ ... }
END_JSON
```
No commentary or code fences outside the sentinels.

---

## 1) Runtime Value Types

```ts
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
```
**Defaults:** If NL omits explicit field names → **label → `"target"`**, **measure → `"value"`**.
**Groups:** In multi‑line, grouped‑bar, stacked‑bar charts, `group` is a **concrete subgroup label value** (e.g., `"MSFT"`, `"AMZN"`, `"2024"`), **not** a field name. The runtime infers the group field from the chart encoding.

---

## 2) The Single‑Sequence Rule (What belongs in one `ops`?)
**Sequence Unit:** A sequence is a **single linear chain** whose step B consumes step A’s result, as signaled by *then, next, within, after*. Encode each such chain in **one** key (`ops`, `ops2`, …).

**Segmentation heuristics:**
- **Keep together** when NL implies linear dependence: “Filter to 2024, then sum sales” → one list.
- **Split** when NL implies **independent calculations** compared/combined later: “Total iPhone‑2024 vs Samsung‑2023” → two lists + combine in `last`.
- **Do not split** one linear chain across multiple keys. **Do not merge** independent chains into one key.

**Quick‑check:**
1) Does step B require step A’s **result**? → **Same `ops`.**
2) Are computations **independent** until the end? → **Different lists** + **`last`**.
3) Different targets/series with no cross‑dependence until final comparison? → **Different lists**.

---

## 3) Canonical Parameters
- **`field`** — explicit field name preferred (e.g., `"country"`, `"rating"`), else defaults `"target"`/`"value"`.
- **`target`** — concrete **category value** (e.g., `"KOR"`, `"iPhone"`, `"2024-01-01"`).
- **`targetA` / `targetB`** — for `compare`/`compareBool`/`diff`.
  - In regular lists: category values (or dual‑target `{category,series}` object where supported).
  - In **`last`**: **IDs** of prior results (see §5).
- **`group`** — subgroup **label value** selecting a line/series/stack (e.g., `"MSFT"`, `"2024"`).
- **`which`** — `"max"|"min"`.
- **`order`** — `"asc"|"desc"`.
- **`operator`** — one of `">", ">=", "<", "<=", "==", "!=", "in", "not-in", "contains", "between"` (**no `eq`**). `between` is **inclusive** and intended for **label ranges** (e.g., dates as ISO strings).
- **`n` / `from`** — positional pick; `n` is 1‑based; `from` is `"left"|"right"`.

---

## 4) Supported Operations (use only these; `op` key is **required**)
Each list must **terminate** in exactly one `Datum` or `Boolean`.

- **`retrieveValue`** `{op, field, target, group?}` → `Datum[]`
- **`filter`** `{op, field, operator, value, group?}` → `Data`
- **`compare`** `{op, field, targetA, targetB, group?, aggregate?, which?}` → `Datum[]`
- **`compareBool`** `{op, field, targetA, targetB, operator}` → `Boolean`
- **`findExtremum`** `{op, field, which, group?}` → `Datum[]`
- **`sort`** `{op, field, order, group?}` → `Datum[]`
- **`determineRange`** `{op, field, group?}` → `Interval` (non‑terminal)
- **`count`** `{op, group?}` → `Datum[]`
- **`sum`** `{op, field, group?}` → `Datum[]`
- **`average`** `{op, field, group?}` → `Datum[]`
- **`diff`** `{op, field, targetA, targetB, group?, aggregate?, signed?}` → `Datum[]`
- **`nth`** `{op, field?, n, from?, group?}` → `Datum[]`

---

## 5) IDs & `last` Referencing (incl. `last_i` chaining)
- After each **non‑`last`** list runs, the runtime assigns IDs to returned `DatumValue`s:
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0"
  ```
- In **`last`**, always reference prior results by **ID** (e.g., `"ops_0"`, `"ops2_0"`). **Never** use raw labels here.
- You may chain results inside `last` by referring to **previous `last` outputs** as `"last_<i>"` (0‑based within `last`).
- `last` also **must end** in a **single** `Datum` or `Boolean`.

---

## 6) Normalization & Determinism
- If NL omits fields: **label → `"target"`**, **measure → `"value"`**.
- Synonyms: “largest/highest/top” → `which:"max"`; “smallest/lowest/bottom” → `which:"min"`.
- If a sequence might return **multiple** items before the terminal step, add steps (`sort`+`nth`, extra `filter`) so the list ends in **exactly one** `Datum` or **one** `Boolean`.
- Numbers in JSON must be numbers (not strings).

---

## 7) Human‑Readable `text` — **Value‑Forward Narration** (REQUIRED)
- Top‑level **`text`** **must** be present; its keys **mirror** the actual lists (`ops`, `ops2`, …, `last`).
- Each value is **one or two concise sentences** explaining: (1) **what slice/operation** was applied, (2) **what numeric/label result** it produced (if known from the NL explanation), and (3) **how** those results are combined to yield the final answer.
- Include **concrete names** (fields, series labels, category labels) and **numbers** when available (e.g., “sun total **268** vs fog total **159** → `true`”).
- Language: use `textLocale` if provided; otherwise English.
- `text` does **not** affect execution and has no IDs.

---

## 8) Output Contract (STRICT)
Return a single JSON object between `BEGIN_JSON` and `END_JSON` sentinels:
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
7. Write **`text`** with **explicit labels and numbers** (when available) and explain composition to the final result.
8. Guard against ties/non‑determinism.

---

## 10) Validator Rules (+ snippet)
- **Reject** if any list doesn’t terminate in exactly one `Datum`/`Boolean`.
- **Reject** if `last` uses raw labels instead of IDs.
- **Reject** if `text` is missing, its keys don’t mirror lists, or values aren’t plain strings.
- **Warn** if a list contains a terminal op followed by more ops (merged sequences suspected).
- **Warn** if determinism is unclear.

**TypeScript‑like pseudocode (supports `last_i`):**
```ts
type Op = { op: string; [k: string]: any };
interface Program { [k: string]: Op[] | any }

const LIST_KEYS = ["ops","ops2","ops3","ops4","ops5"]; // extend as needed
const TERMINAL = new Set(["compare","compareBool","findExtremum","sum","average","diff","count","nth","retrieveValue"]);
const NON_TERMINAL = new Set(["filter","sort","determineRange"]);

function validate(spec: Program) {
  const errors: string[] = []; const warns: string[] = [];
  if (!spec || typeof spec !== "object") errors.push("Top-level must be an object");
  if (!spec.text || typeof spec.text !== "object") errors.push("Missing top-level text object");

  const listKeys = LIST_KEYS.filter(k => Array.isArray(spec[k]));
  if (listKeys.length === 0) errors.push("At least one list (ops, ops2, …) is required");

  // text keys must mirror present lists (+ optional last)
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

  // collect IDs from lists (assume single return per list → index 0)
  const ids = new Set<string>(); for (const k of listKeys) ids.add(`${k}_0`);

  // validate last
  if (spec.last) {
    const lastOps: Op[] = spec.last;
    if (!Array.isArray(lastOps) || lastOps.length === 0) errors.push("last must be a non-empty array when present");
    const lastIds = new Set<string>();
    for (let i=0;i<lastOps.length;i++) {
      const op = lastOps[i];
      if (!TERMINAL.has(op.op)) errors.push(`last[${i}] must be terminal (got "${op.op}")`);
      // allow chaining via last_i
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
```

---

## 11) Converting NL **Explanation** → JSON (with numbers & labels)
1) **Segment** the explanation into human‑perceived sequences → map to `ops`, `ops2`, … (Single‑Sequence rule).
2) **Map** each sentence/phrase to §4 ops.
3) **Enforce determinism** so each list ends in one `Datum`/`Boolean`.
4) **Combine** independent results in `last` using **IDs** (allow chaining via `last_i`).
5) **Author `text`** in **value‑forward style**: name fields/labels and include numeric results when available; state how intermediate results compose into the final answer.

---

## 12) Complex Examples (Explanation → Grammar with value‑forward `text`)
The examples below use the datasets/specs you provided. Numbers are computed from the given data.

### Ex‑A — Stocks (multi‑line): *max vs average over date ranges*
**Question**: “After 2007‑01‑01, is **MSFT’s maximum price** greater than **AMZN’s average price** during 2007?”
**Explanation (NL input)**: “For MSFT, restrict to dates ≥ 2007‑01‑01 and take the **maximum** `price`. For AMZN, restrict to **2007‑01‑01..2007‑12‑31** and compute the **average** `price`. Compare the two values and report if MSFT’s max > AMZN’s 2007 average.”
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2007-01-01", "group": "MSFT" },
    { "op": "findExtremum", "field": "price", "which": "max", "group": "MSFT" }
  ],
  "ops2": [
    { "op": "filter", "field": "date", "operator": "between", "value": ["2007-01-01","2007-12-31"], "group": "AMZN" },
    { "op": "average", "field": "price", "group": "AMZN" }
  ],
  "last": [
    { "op": "compareBool", "field": "price", "targetA": "ops_0", "targetB": "ops2_0", "operator": ">" }
  ],
  "text": {
    "ops": "MSFT ≥ 2007-01-01: max price is **35.03** on 2007-10-01.",
    "ops2": "AMZN in 2007: average price is **~69.95** across 12 months.",
    "last": "Compare 35.03 vs ~69.95 → return **false** for MSFT > AMZN average."
  }
}
END_JSON
```

### Ex‑B — Weather (stacked vertical): *seasonal totals across different series*
**Question**: “Is the **total `sun` count in summer (6–8월)** greater than the **total `fog` count in Q4 (10–12월)**?”
**Explanation**: “Sum `sun` counts for months 6,7,8; sum `fog` for 10,11,12; compare totals and return a Boolean.”
```
BEGIN_JSON
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
    "ops": "`sun` total for months 6–8 is **268** (85+89+94).",
    "ops2": "`fog` total for months 10–12 is **159** (55+50+54).",
    "last": "Compare 268 vs 159 → **true** (summer sun > Q4 fog)."
  }
}
END_JSON
```

### Ex‑C — Grouped horizontal (Urban vs Total): *per‑country gaps compared*
**Question**: “Between **Macau** and **Singapore**, which country has the **larger absolute gap** `Urban − Total`?”
**Explanation**: “For each country, compute |Urban − Total|; return the country with the larger gap.”
```
BEGIN_JSON
{
  "ops": [
    { "op": "diff", "field": "Persons per square kilometers", "targetA": {"category":"Macau","series":"Urban"}, "targetB": {"category":"Macau","series":"Total"}, "signed": false }
  ],
  "ops2": [
    { "op": "diff", "field": "Persons per square kilometers", "targetA": {"category":"Singapore","series":"Urban"}, "targetB": {"category":"Singapore","series":"Total"}, "signed": false }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" }
  ],
  "text": {
    "ops": "Macau gap is **|26.0 − 20.8| = 5.2**.",
    "ops2": "Singapore gap is **|7.5 − 7.4| = 0.1**.",
    "last": "Compare 5.2 vs 0.1 → return **Macau** as larger gap."
  }
}
END_JSON
```

### Ex‑D — Stacked horizontal (opinions): *three‑way totals with pairwise `last`*
**Question**: “Across **EU5** (Britain, Germany, Spain, France, Italy), which opinion (**Improve**, **Remain the same**, **Worsen**) has the **highest total percentage**?”
**Explanation**: “Sum `percentage` within each opinion for the EU5 countries; compare totals pairwise to return the maximum.”
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "Country", "operator": "in", "value": ["Britain","Germany","Spain","France","Italy"], "group": "Improve" },
    { "op": "sum", "field": "percentage", "group": "Improve" }
  ],
  "ops2": [
    { "op": "filter", "field": "Country", "operator": "in", "value": ["Britain","Germany","Spain","France","Italy"], "group": "Remain the same" },
    { "op": "sum", "field": "percentage", "group": "Remain the same" }
  ],
  "ops3": [
    { "op": "filter", "field": "Country", "operator": "in", "value": ["Britain","Germany","Spain","France","Italy"], "group": "Worsen" },
    { "op": "sum", "field": "percentage", "group": "Worsen" }
  ],
  "last": [
    { "op": "compare", "field": "value", "targetA": "ops_0", "targetB": "ops2_0", "which": "max" },
    { "op": "compare", "field": "value", "targetA": "last_0", "targetB": "ops3_0", "which": "max" }
  ],
  "text": {
    "ops": "EU5 ‘Improve’ total is **130** (32+29+25+22+22).",
    "ops2": "EU5 ‘Remain the same’ total is **171** (35+43+27+37+29).",
    "ops3": "EU5 ‘Worsen’ total is **193** (32+27+47+40+47).",
    "last": "Pairwise max: first 171 vs 130 → 171; then 171 vs 193 → return **Worsen (193)** as highest."
  }
}
END_JSON
```

### Ex‑E — Grouped vertical (age × gender): *within‑series extremum under a label range*
**Question**: “Among **Female** values for ages **35–55**, which **age** has the **largest population**?”
**Explanation**: “Within `gender = Female`, restrict `age` to 35–55 (inclusive) and take the maximum by `people`.”
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "age", "operator": "between", "value": [35,55], "group": "Female" },
    { "op": "findExtremum", "field": "people", "which": "max", "group": "Female" }
  ],
  "text": {
    "ops": "Female ages 35–55 → max at **35** with **11,635,647** people (then 40: 11,488,578; 45: 10,261,253; 50: 8,911,133; 55: 6,921,268)."
  }
}
END_JSON
```

### Ex‑F — Ratings table (simple vertical bars): *alpha pick after threshold*
**Question**: “Among countries with **rating ≥ 70**, which label is first alphabetically?”
**Explanation**: “Filter countries to ratings ≥ 70, sort labels A→Z, take the first; in this data, ≥70 are **GBR:75**, **NLD:76**, **IRL:70** → alphabetically **GBR**.”
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "country", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "Eligible: {GBR:75, IRL:70, NLD:76}; A→Z pick → **GBR**."
  }
}
END_JSON
```

---

## 13) Quick Template (copyable)
```
BEGIN_JSON
{
  "ops": [ /* one sequence */ ],
  "ops2": [ /* optional: another sequence */ ],
  "last": [ /* optional: combine by IDs (allow last_i) */ ],
  "text": {
    "ops": "…",
    "ops2": "…",
    "last": "…"
  }
}
END_JSON
```

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
- **Human‑readable annotations (`text`) — Value‑Forward Narration (REQUIRED):** Provide a top‑level **`text`** object that **mirrors the operation list keys** (`ops`, `ops2`, `ops3`, `last`) and gives **one or two plain sentences** per key. Sentences should **name concrete fields/labels** and — when inferable — **state numeric values** and **explain how they compose** into the final result. Strings only; **no nested structure**.

**Strict output format:**
Return JSON only between these sentinels:
```
BEGIN_JSON
{ ... }
END_JSON
```
No commentary or code fences outside the sentinels.

---

## 1) Runtime Value Types

```ts
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
```
**Defaults:** If NL omits explicit field names → **label → `"target"`**, **measure → `"value"`**.  
**Groups:** In multi‑line, grouped‑bar, stacked‑bar charts, `group` is a **concrete subgroup label value** (e.g., `"MSFT"`, `"AMZN"`, `"2024"`), **not** a field name. The runtime infers the group field from the chart encoding.

---

## 2) The Single‑Sequence Rule (What belongs in one `ops`?)
**Sequence Unit:** A sequence is a **single linear chain** whose step B consumes step A’s result, as signaled by *then, next, within, after*. Encode each such chain in **one** key (`ops`, `ops2`, …).

**Segmentation heuristics:**
- **Keep together** when NL implies linear dependence: “Filter to 2007, then sum price” → one list.
- **Split** when NL implies **independent calculations** compared/combined later: “Total sun (6–8) vs fog (10–12)” → two lists + combine in `last`.
- **Do not split** one linear chain across multiple keys. **Do not merge** independent chains into one key.

**Quick‑check:**
1) Does step B require step A’s **result**? → **Same `ops`.**  
2) Are computations **independent** until the end? → **Different lists** + **`last`**.  
3) Different targets/series with no cross‑dependence until final comparison? → **Different lists**.

---

## 3) Canonical Parameters
- **`field`** — explicit field name preferred (e.g., `"country"`, `"rating"`), else defaults `"target"`/`"value"`.
- **`target`** — concrete **category value** (e.g., `"KOR"`, `"iPhone"`, `"2008-10-01"`).
- **`targetA` / `targetB`** — for `compare`/`compareBool`/`diff`.
  - In regular lists: category values (or dual‑target `{category,series}` object).
  - In **`last`**: **IDs** of prior results (see §5).
- **`group`** — subgroup **label value** selecting a line/series/stack (e.g., `"MSFT"`, `"sun"`, `"Improve"`).
- **`which`** — `"max"|"min"`.
- **`order`** — `"asc"|"desc"`.
- **`operator`** — one of `">", ">=", "<", "<=", "==", "!=", "in", "not-in", "contains", "between"` (**no `eq`**). `between` is **inclusive** for **label ranges**.
- **`n` / `from`** — positional pick; `n` is 1‑based; `from` is `"left"|"right"`.

---

## 4) Supported Operations (use only these; `op` key is **required**)
Each list must **terminate** in exactly one `Datum` or `Boolean`.

- **`retrieveValue`** `{op, field, target, group?}` → `Datum[]`  
- **`filter`** `{op, field, operator, value, group?}` → `Data`  
- **`compare`** `{op, field, targetA, targetB, group?, aggregate?, which?}` → `Datum[]`  
- **`compareBool`** `{op, field, targetA, targetB, operator}` → `Boolean`  
- **`findExtremum`** `{op, field, which, group?}` → `Datum[]`  
- **`sort`** `{op, field, order, group?}` → `Datum[]`  
- **`determineRange`** `{op, field, group?}` → `Interval` (non‑terminal)  
- **`count`** `{op, group?}` → `Datum[]`  
- **`sum`** `{op, field, group?}` → `Datum[]`  
- **`average`** `{op, field, group?}` → `Datum[]`  
- **`diff`** `{op, field, targetA, targetB, group?, aggregate?, signed?}` → `Datum[]`  
- **`nth`** `{op, field?, n, from?, group?}` → `Datum[]`

---

## 5) IDs & `last` Referencing (incl. `last_i` chaining)
- After each **non‑`last`** list runs, the runtime assigns IDs to returned `DatumValue`s:
  ```
  id = <operationKey> + "_" + <0-based index>
  // e.g., "ops_0", "ops2_0"
  ```
- In **`last`**, always reference prior results by **ID** (e.g., `"ops_0"`, `"ops2_0"`). **Never** use raw labels here.
- You may chain results inside `last` by referring to **previous `last` outputs** as `"last_<i>"` (0‑based within `last`).
- `last` also **must end** in a **single** `Datum` or `Boolean`.

---

## 6) Normalization & Determinism
- If NL omits fields: **label → `"target"`**, **measure → `"value"`**.  
- Synonyms: “largest/highest/top” → `which:"max"`; “smallest/lowest/bottom” → `which:"min"`.  
- If a sequence might return **multiple** items before the terminal step, add steps (`sort`+`nth`, extra `filter`) so the list ends in **exactly one** `Datum` or **one** `Boolean`.  
- Numbers in JSON must be numbers (not strings).

---

## 7) Human‑Readable `text` — **Value‑Forward Narration** (REQUIRED)
- Top‑level **`text`** **must** be present; its keys **mirror** the actual lists (`ops`, `ops2`, `ops3`, `last`).
- Each value is **one or two concise sentences** explaining: (1) **what slice/operation** was applied, (2) **what numeric/label result** it produced (if derivable), and (3) **how** those result(s) combine to yield the final answer.  
- Include **concrete names** (fields, series labels, category labels) and — when available — **numbers** when available (e.g., “sun total **268** vs fog total **159** → `true`”).  
- Language: use `textLocale` if provided; otherwise English.  
- `text` does **not** affect execution and has no IDs.

---

## 8) Output Contract (STRICT)
Return a single JSON object between `BEGIN_JSON` and `END_JSON` sentinels:
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
7. Write **`text`** with **explicit labels and numbers** (when available) and explain composition to the final result.  
8. Guard against ties/non‑determinism.

---

## 10) Validator Rules (+ snippet)
- **Reject** if any list doesn’t terminate in exactly one `Datum`/`Boolean`.  
- **Reject** if `last` uses raw labels instead of IDs.  
- **Reject** if `text` is missing, its keys don’t mirror lists, or values aren’t plain strings.  
- **Warn** if a list contains a terminal op followed by more ops (merged sequences suspected).  
- **Warn** if determinism is unclear.

```ts
type Op = { op: string; [k: string]: any };
interface Program { [k: string]: Op[] | any }

const LIST_KEYS = ["ops","ops2","ops3","ops4","ops5"]; // extend as needed
const TERMINAL = new Set(["compare","compareBool","findExtremum","sum","average","diff","count","nth","retrieveValue"]);
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
```

---

## 11) Converting NL **Explanation** → JSON (with numbers & labels)
1) **Segment** the explanation into human‑perceived sequences → map to `ops`, `ops2`, … (Single‑Sequence rule).  
2) **Map** each sentence/phrase to §4 ops.  
3) **Enforce determinism** so each list ends in one `Datum`/`Boolean`.  
4) **Combine** independent results in `last` using **IDs** (allow chaining via `last_i`).  
5) **Author `text`** in **value‑forward** style: name fields/labels and include numeric results when available; state how intermediate results compose into the final answer.

**Meta‑Prompt Template**
```
Convert the provided natural-language explanation into the NL→Spec grammar.
- Apply the Single-Sequence rule: one human-perceived sequence per list key.
- Use only the supported ops. End each list in exactly one Datum or one Boolean.
- If combining results, put the final step(s) under `last` and reference earlier outputs by ID (ops_0, ops2_0, …).
- Return JSON only between BEGIN_JSON and END_JSON. Include a `text` object whose keys mirror the lists and whose values are single sentences.
```

---

## 12) Examples (Using ONLY the provided datasets/specs)

### 12.1 Ratings — Simple retrieval + `text`
**Data/Chart:** `bar_simple_ver.csv` (`country`, `rating`).  
**Q:** “Give me the value for **KOR**.”  
**Short Answer:** `KOR: 52`
```
BEGIN_JSON
{
  "ops": [
    { "op": "retrieveValue", "field": "country", "target": "KOR" }
  ],
  "text": {
    "ops": "Retrieve the rating where country = KOR → **52**."
  }
}
END_JSON
```

---

### 12.2 Ratings — Parallel lists + `last` compare (returns a Datum)
**Q:** “Between **KOR** and **JPN**, which has the higher rating?”  
**Short Answer:** `KOR`
```
BEGIN_JSON
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
    "ops": "Get KOR’s rating **52**.",
    "ops2": "Get JPN’s rating **42**.",
    "last": "Compare 52 vs 42 → return **KOR** (max)."
  }
}
END_JSON
```

---

### 12.3 Ratings — Find maximum + `text`
**Q:** “Which country has the highest rating?”  
**Short Answer:** `NLD`
```
BEGIN_JSON
{
  "ops": [
    { "op": "findExtremum", "field": "rating", "which": "max" }
  ],
  "text": {
    "ops": "Find the country with the maximum rating → **NLD: 76**."
  }
}
END_JSON
```

---

### 12.4 Ratings — Threshold → alphabetical pick
**Q:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `GBR`
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "rating", "operator": ">=", "value": 70 },
    { "op": "sort", "field": "country", "order": "asc" },
    { "op": "nth", "n": 1, "from": "left" }
  ],
  "text": {
    "ops": "Eligible {**GBR:75**, **IRL:70**, **NLD:76**}; A→Z pick → **GBR**."
  }
}
END_JSON
```

---

### 12.5 Ratings — Compare to global max (Boolean)
**Q:** “Is **KOR**’s rating greater than the max‑rating country?”  
**Short Answer:** `false`
```
BEGIN_JSON
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
    "ops": "KOR’s rating is **52**.",
    "ops2": "Global maximum is **NLD:76**.",
    "last": "Compare 52 > 76 → **false**."
  }
}
END_JSON
```

---

### 12.6 Weather (stacked vertical) — seasonal totals across series
**Data/Chart:** `bar_stacked_ver.csv` (`month`, `weather` series, `count`).  
**Q:** “Is the total **sun** count in summer (6–8월) greater than the total **fog** count in Q4 (10–12월)?”  
**Short Answer:** `true`
```
BEGIN_JSON
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
    "ops": "`sun` total is **268** (85+89+94).",
    "ops2": "`fog` total is **159** (55+50+54).",
    "last": "Compare 268 vs 159 → **true**."
  }
}
END_JSON
```

---

### 12.7 Grouped horizontal (Urban vs Total) — per‑country gaps
**Data/Chart:** `bar_grouped_hor.csv` (`Country`, `Urban/total` series, `Persons per square kilometers`).  
**Q:** “Between **Macau** and **Singapore**, which has the larger absolute gap `Urban − Total`?”  
**Short Answer:** `Macau`
```
BEGIN_JSON
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
    "ops": "Macau gap **|26.0 − 20.8| = 5.2**.",
    "ops2": "Singapore gap **|7.5 − 7.4| = 0.1**.",
    "last": "Compare 5.2 vs 0.1 → **Macau**."
  }
}
END_JSON
```

---

### 12.8 Stacked horizontal (opinions) — EU5 three‑way totals
**Data/Chart:** `bar_stacked_hor.csv` (`Country`, `opinion` series, `percentage`).  
**Q:** “Across **EU5** (Britain, Germany, Spain, France, Italy), which opinion has the highest total percentage?”  
**Short Answer:** `Worsen (193)`
```
BEGIN_JSON
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
    "ops": "EU5 ‘Improve’ total **130** (32+29+25+22+22).",
    "ops2": "EU5 ‘Remain the same’ total **171** (35+43+27+37+29).",
    "ops3": "EU5 ‘Worsen’ total **193** (32+27+47+40+47).",
    "last": "Max of {130, 171, 193} → **Worsen (193)**."
  }
}
END_JSON
```

---

### 12.9 Grouped vertical (age × gender) — extremum in a label range
**Data/Chart:** `bar_grouped_ver.csv` (`age`, `gender` series, `people`).  
**Q:** “Among **Female** values for ages **35–55**, which age has the largest population?”  
**Short Answer:** `35`
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "age", "operator": "between", "value": [35,55], "group": "Female" },
    { "op": "findExtremum", "field": "people", "which": "max", "group": "Female" }
  ],
  "text": {
    "ops": "Female ages 35–55 → max at **35** with **11,635,647** (then 40: 11,488,578; 45: 10,261,253; 50: 8,911,133; 55: 6,921,268)."
  }
}
END_JSON
```

---

### 12.10 Multi‑line stocks — series max vs yearly average
**Data/Chart:** `line_multiple.csv` (`symbol` series, `date`, `price`).  
**Q:** “After **2007‑01‑01**, is **MSFT**’s **maximum** price greater than **AMZN**’s **average** in **2007**?”  
**Short Answer:** `false`
```
BEGIN_JSON
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
    "ops": "MSFT ≥ 2007‑01‑01 → max **35.03** (on 2007‑10‑01).",
    "ops2": "AMZN in 2007 → average **≈69.95** over 12 months.",
    "last": "Compare 35.03 vs 69.95 → **false**."
  }
}
END_JSON
```

---

### 12.11 Multi‑line stocks — same‑date comparison (Boolean)
**Q:** “On **2008‑10‑01**, is **MSFT** higher than **AMZN**?”  
**Short Answer:** `false`
```
BEGIN_JSON
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
    "ops": "MSFT(2008‑10‑01) **21.57**.",
    "ops2": "AMZN(2008‑10‑01) **57.24**.",
    "last": "Compare 21.57 > 57.24 → **false**."
  }
}
END_JSON
```

---

### 12.12 Multi‑line stocks — same‑date difference (signed)
**Q:** “What is **MSFT − AMZN** on **2008‑10‑01**?”  
**Short Answer:** `−35.67`
```
BEGIN_JSON
{
  "ops": [
    { "op": "diff",
      "field": "price",
      "targetA": { "category": "2008-10-01", "series": "MSFT" },
      "targetB": { "category": "2008-10-01", "series": "AMZN" },
      "signed": true }
  ],
  "text": {
    "ops": "Difference at 2008‑10‑01 is **21.57 − 57.24 = −35.67**."
  }
}
END_JSON
```

---

### 12.13 Multi‑line stocks — second‑highest within a series
**Q:** “What is the **second‑highest** **AMZN** value?”  
**Short Answer:** `134.52 (2009‑12‑01)`
```
BEGIN_JSON
{
  "ops": [
    { "op": "sort", "field": "value", "order": "desc", "group": "AMZN" },
    { "op": "nth", "n": 2, "from": "left", "group": "AMZN" }
  ],
  "text": {
    "ops": "AMZN values sorted desc → 1st **135.91** (2009‑11‑01), 2nd **134.52** (2009‑12‑01). Return the second."
  }
}
END_JSON
```

---

### 12.14 Multi‑line stocks — average after a cutoff (single sequence)
**Q:** “After **2007‑01‑01**, what is **MSFT**’s **average** price?”  
**Short Answer:** `≈27.91`
```
BEGIN_JSON
{
  "ops": [
    { "op": "filter", "field": "date", "operator": ">=", "value": "2007-01-01", "group": "MSFT" },
    { "op": "average", "field": "price", "group": "MSFT" }
  ],
  "text": {
    "ops": "MSFT dates ≥ 2007‑01‑01 → average price **≈27.91**."
  }
}ㅂ
END_JSON
```

> *If the runtime cannot compute a number at authoring time, keep the sentence structure but omit the numeric (still list labels/operations).*

---

## 13) References (for authors)
- Segel, E., & Heer, J. (2010). **Narrative Visualization: Telling Stories with Data.** *IEEE TVCG, 16(6)*, 1139–1148.  
- Shneiderman, B. (1996). **The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations.** *IEEE VL/HCC*.  

These motivate concise author‑driven annotations, highlights of key values, and staging of selection → operation → result, which our `text` rules operationalize.

---END NEW FILE---