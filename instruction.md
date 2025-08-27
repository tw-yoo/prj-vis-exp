# NL to Spec Conversion Guideline

---

## 0\) Purpose & IO Contract

**Input provided to the LLM**

1) **Data** (CSV or JSON format, conceptually, a list of `DatumValue`)  
2) **Chart** (e.g., Vega‑Lite spec)  
3) **User’s Question** (natural language)  
4) **Short Answer**   
5) **Natural‑Language Explanation** — *the step‑by‑step reasoning/operations that produced the answer*

**The output that the LLM must produce**

- A single **JSON object** encoding one or more ordered operation lists: `ops`, `ops2`, `ops3`, …  
- Each list is an ordered program and **must end in exactly one `Datum` or one `Boolean`**.  
- If multiple lists must be combined **after** they finish, put the final step(s) under an **optional** top‑level key **`last`**.

**Return JSON only** (no extra commentary).  
---

## 1\) Data & Value Types (Runtime Model)

class DatumValue {

  constructor(

    category: string,   // category/label field name (e.g., 'country', 'brand')

    measure: string,    // measure/value field name (e.g., 'rating', 'sales')

    target: string,     // concrete label value (e.g., 'KOR', 'iPhone')

    group: string|null, // subgroup id for grouped/stacked charts; null otherwise

    value: number,      // numeric value (e.g., 82, 1.25)

    id?: string         // runtime‑assigned id for cross‑list referencing

  ) {}

}

class IntervalValue { constructor(category: string, min: number, max: number) {} }

class ScalarValue   { constructor(value: number) {} }

class BoolValue     { constructor(category: string, bool: boolean) {} }

**Important:** Real datasets can mix different `category` / `measure` names across `DatumValue`s.  
If unspecified or ambiguous in NL, **default**: category → `"target"`, measure → `"value"`.

---

## 2\) Canonical Parameter Meanings

- **`field`** — The field the op targets. If it’s a label/category, prefer the explicit name (e.g., `"country"`), else `"target"`. If it’s a measure, prefer the explicit name (e.g., `"rating"`), else `"value"`.  
- **`target`** — A concrete **category value** (e.g., `"KOR"`, `"iPhone"`).  
- **`targetA` / `targetB`** — Two items to compare in `compareBool`.  
  - In **regular lists** (`ops`, `ops2`, …): these are **category values**.  
  - In **`last`**: these are **IDs** of earlier results (see §4).  
- **`group`** — A subgroup label (only for grouped/stacked charts). Omit or set `null` for simple charts.  
- **`which`** — `"max"` or `"min"` (for `findExtremum`).  
- **`order`** — `"asc"` or `"desc"` (for `sort`).  
- **`operator`** — One of `">"`, `">="`, `"<"`, `"<="`, `"=="`, `"!="`, `"eq"`, `"in"`, `"not-in"`, `"contains"`, `"startsWith"`, `"endsWith"`.  
- **`n` / `from`** — Positional selection; `n` is 1‑based; `from` is `"left"` or `"right"`.

---

## 3\) Supported Operation Specs (Correct & Precise)

Use **only** the following op names. Each list must **terminate** in one `Datum` or one `Boolean`.

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
- **Note:** In `last`, `targetA`/`targetB` must be **IDs** of earlier results (see §4).

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
- **Returns:** `Datum` (single numeric count wrapped as a `DatumValue`)

### 3.9 `average`

- **Purpose:** Average numeric values across the current data slice (or field).  
- **Params:** `{ "field": string, "group"?: string }`  
- **Returns:** `Datum` (single numeric count wrapped as a `DatumValue`)

### 3.10 `diff`

- **Purpose:** Compute numeric difference between two targets (optionally via aggregation).  
- **Params:** `{ "field": string, "targetA": string, "targetB": string, "aggregate"?: "sum"|"avg"|"min"|"max" }`  
- **Returns:** `Datum` (single numeric count wrapped as a `DatumValue`)

### 3.11 `nth`

- **Purpose:** Pick the n‑th item by the current visual/ordering convention.  
- **Params:** `{ "field"?: string, "n": number, "from"?: "left"|"right" }`  
- **Returns:** `Datum`

---

## 4\) Output Format & ID Referencing (very important)

- Top‑level keys: `ops` (required), plus `ops2`, `ops3`, … (optional), and **`last`** (optional).  
- **Each list terminates** in a single `Datum` or `Boolean`. Intermediates can be `Data`/`Interval`/`Scalar`.  
- **Runtime ID assignment (for non‑`last` lists):** After each non‑`last` list runs, the runtime sets an ID on each returned `DatumValue`:  
    
  id \= \<operationId\> \+ "\_" \+ \<0-based index\>  
    
  // e.g., "ops\_0", "ops2\_0", ...  
    
  *(This follows the runtime logic like `datum.id = \`${opKey}\_${idx}\`\`.)*  
    
- **Referencing in `last`:** When combining earlier results, use these **IDs** (e.g., `"ops_0"`, `"ops2_0"`) in fields like `targetA`/`targetB`. **Do not** use category labels in `last` to refer to earlier outputs.

---

## 5\) Normalization & Synonyms

- If the NL explanation omits field names: **label → `"target"`**, **measure → `"value"`**.  
- Extremum: “largest/highest/top” → `"max"`, “smallest/lowest/bottom” → `"min"`.  
- Comparisons: “greater than”→`">"`, “at least”→`">="`, “less than”→`"<"`, “at most”→`"<="`, “equal”→`"=="`/`"eq"`.  
- Numbers in JSON must be numbers (not strings).

---

## 6\) Expanded End‑to‑End Examples

Each example includes **Question → Short Answer (placeholder) → Natural‑Language Explanation → Spec (JSON)**.  
The **LLM must parse the Explanation** and output the **Spec**. Short Answer is a *fake concrete string* (e.g., `"iPhone"`, `"KOR: 82"`), not a description of the method.

### Example 1 — Simple retrieval

**Question:** “Give me the value for KOR.”  
**Short Answer:** `KOR: 82`  
**Explanation:** “Select the single datum whose `country` equals `KOR`.”  
**Spec:**

{

  "ops": \[

    { "op": "retrieveValue", "field": "country", "target": "KOR" }

  \]

}

---

### Example 2 — Find maximum

**Question:** “Which country has the highest rating?”  
**Short Answer:** `NLD`  
**Explanation:** “Return the single datum with the maximum value of `rating`.”  
**Spec:**

{

  "ops": \[

    { "op": "findExtremum", "field": "rating", "which": "max" }

  \]

}

---

### Example 3 — Filter ≥ 70, sort label asc, take first

**Question:** “Among ratings ≥ 70, which label is first alphabetically?”  
**Short Answer:** `AUT`  
**Explanation:** “Filter where `rating` ≥ 70; sort by label ascending (use `target`); pick the first from the left.”  
**Spec:**

{

  "ops": \[

    { "op": "filter", "field": "rating", "operator": "\>=", "value": 70 },

    { "op": "sort", "field": "target", "order": "asc" },

    { "op": "nth", "n": 1, "from": "left" }

  \]

}

---

### Example 4 — Sort by measure desc, take the 3rd

**Question:** “Which item is 3rd highest by rating?”  
**Short Answer:** `iPhone`  
**Explanation:** “Sort by `rating` descending; take the 3rd item from the left.”  
**Spec:**

{

  "ops": \[

    { "op": "sort", "field": "rating", "order": "desc" },

    { "op": "nth", "n": 3, "from": "left" }

  \]

}

---

### Example 5 — Determine range (value) then highlight max

**Question:** “Show the value range and return the maximum point.”  
**Short Answer:** `Max: 96`  
**Explanation:** “Compute the value‑axis range; then select the maximum by `rating`.”  
**Spec:**

{

  "ops": \[

    { "op": "determineRange", "field": "rating" },

    { "op": "findExtremum", "field": "rating", "which": "max" }

  \]

}

---

### Example 6 — Count after filtering

**Question:** “How many countries have rating ≥ 80?”  
**Short Answer:** `3`  
**Explanation:** “Filter where `rating` ≥ 80; return the count of remaining items.”  
**Spec:**

{

  "ops": \[

    { "op": "filter", "field": "rating", "operator": "\>=", "value": 80 },

    { "op": "count" }

  \]

}

---

### Example 7 — Average of a subset

**Question:** “What is the average rating of KOR and JPN?”  
**Short Answer:** `75.5`  
**Explanation:** “Filter to `country` in {KOR, JPN}; compute average of `rating`.”  
**Spec:**

{

  "ops": \[

    { "op": "filter", "field": "country", "operator": "in", "value": \["KOR", "JPN"\] },

    { "op": "average", "field": "rating" }

  \]

}

---

### Example 8 — Grouped chart: Retrieve within a group

*(Assume grouped bar chart where `group` is `"2024"` and category is `brand`, measure is `sales`.)*  
**Question:** “Return 2024 sales for iPhone.”  
**Short Answer:** `iPhone (2024): 1.20`  
**Explanation:** “Retrieve the datum where `brand` is `iPhone` in group `2024`.”  
**Spec:**

{

  "ops": \[

    { "op": "retrieveValue", "field": "brand", "target": "iPhone", "group": "2024" }

  \]

}

---

### Example 9 — Grouped chart: Compare two groups’ sums (uses `last` IDs)

*(Assume `brand` is the label, `sales` is the measure, `group` is the year.)*  
**Question:** “Is the total sales of iPhone in 2024 greater than Samsung in 2023?”  
**Short Answer:** `true`  
**Explanation:** “Sum 2024 sales for iPhone; sum 2023 sales for Samsung; compare the two totals.”  
**Spec:**

{

  "ops": \[

    { "op": "filter", "field": "brand", "operator": "==", "value": "iPhone" },

    { "op": "filter", "field": "group", "operator": "==", "value": "2024" },

    { "op": "sum", "field": "sales" }

  \],

  "ops2": \[

    { "op": "filter", "field": "brand", "operator": "==", "value": "Samsung" },

    { "op": "filter", "field": "group", "operator": "==", "value": "2023" },

    { "op": "sum", "field": "sales" }

  \],

  "last": \[

    { "op": "compareBool", "field": "value", "targetA": "ops\_0", "targetB": "ops2\_0", "operator": "\>" }

  \]

}

---

### Example 10 — Parallel queries (max & min)

**Question:** “Find both the max and the min rating countries.”  
**Short Answer:** `NLD, MEX`  
**Explanation:** “One list returns the max; another returns the min.”  
**Spec:**

{

  "ops": \[

    { "op": "findExtremum", "field": "rating", "which": "max" }

  \],

  "ops2": \[

    { "op": "findExtremum", "field": "rating", "which": "min" }

  \]

}

---

### Example 11 — Composite with `last`: Compare KOR vs max country (IDs)

**Question:** “Is KOR’s rating greater than the max‑rating country?”  
**Short Answer:** `false`  
**Explanation:** “Retrieve KOR’s value; find the maximum; compare the two results.”  
**Spec:**

{

  "ops": \[

    { "op": "retrieveValue", "field": "country", "target": "KOR" }

  \],

  "ops2": \[

    { "op": "findExtremum", "field": "rating", "which": "max" }

  \],

  "last": \[

    { "op": "compareBool", "field": "rating", "targetA": "ops\_0", "targetB": "ops2\_0", "operator": "\>" }

  \]

}

---

### Example 12 — Composite with `last`: Average of a subset vs a concrete country (IDs)

**Question:** “Is the average of KOR & JPN less than NLD’s rating?”  
**Short Answer:** `true`  
**Explanation:** “Compute average over KOR and JPN; retrieve NLD; compare avg with NLD.”  
**Spec:**

{

  "ops": \[

    { "op": "filter", "field": "country", "operator": "in", "value": \["KOR", "JPN"\] },

    { "op": "average", "field": "rating" }

  \],

  "ops2": \[

    { "op": "retrieveValue", "field": "country", "target": "NLD" }

  \],

  "last": \[

    { "op": "compareBool", "field": "value", "targetA": "ops\_0", "targetB": "ops2\_0", "operator": "\<" }

  \]

}

---

### Example 13 — More complex `last`: Three lists with different pipelines (IDs)

**Question:** “Is the best in Europe higher than Korea after removing ratings \< 60?”  
**Short Answer:** `true`  
**Explanation:**

1) Filter to region `Europe`, filter ratings ≥ 60, then take the maximum by `rating`.  
2) Retrieve `KOR`.  
3) Compare the two results in `last` using IDs.  
   **Spec:**

{

  "ops": \[

    { "op": "filter", "field": "region", "operator": "==", "value": "Europe" },

    { "op": "filter", "field": "rating", "operator": "\>=", "value": 60 },

    { "op": "findExtremum", "field": "rating", "which": "max" }

  \],

  "ops2": \[

    { "op": "retrieveValue", "field": "country", "target": "KOR" }

  \],

  "last": \[

    { "op": "compareBool", "field": "rating", "targetA": "ops\_0", "targetB": "ops2\_0", "operator": "\>" }

  \]

}

---

### Example 14 — Grouped chart, cross‑year comparison with IDs

**Question:** “In 2024, is Android’s average sales ≥ iPhone’s average sales in 2023?”  
**Short Answer:** `false`  
**Explanation:**

1) Filter `brand=Android`, `group=2024`, `average(sales)` → one datum.  
2) Filter `brand=iPhone`, `group=2023`, `average(sales)` → one datum.  
3) Compare in `last` using IDs.  
   **Spec:**

{

  "ops": \[

    { "op": "filter", "field": "brand", "operator": "==", "value": "Android" },

    { "op": "filter", "field": "group", "operator": "==", "value": "2024" },

    { "op": "average", "field": "sales" }

  \],

  "ops2": \[

    { "op": "filter", "field": "brand", "operator": "==", "value": "iPhone" },

    { "op": "filter", "field": "group", "operator": "==", "value": "2023" },

    { "op": "average", "field": "sales" }

  \],

  "last": \[

    { "op": "compareBool", "field": "value", "targetA": "ops\_0", "targetB": "ops2\_0", "operator": "\>=" }

  \]

}

---

### Example 15 — Multi‑stage per‑list plus `last` (IDs)

**Question:** “Among countries with rating ≥ 70, is the first alphabetically greater than the minimum among countries \< 70?”  
**Short Answer:** `true`  
**Explanation:**

1) Filter `rating` ≥ 70; sort by `target` asc; take `nth=1`.  
2) Filter `rating` \< 70; find `min`.  
3) Compare those two results with `last` IDs.  
   **Spec:**

{

  "ops": \[

    { "op": "filter", "field": "rating", "operator": "\>=", "value": 70 },

    { "op": "sort", "field": "target", "order": "asc" },

    { "op": "nth", "n": 1, "from": "left" }

  \],

  "ops2": \[

    { "op": "filter", "field": "rating", "operator": "\<", "value": 70 },

    { "op": "findExtremum", "field": "rating", "which": "min" }

  \],

  "last": \[

    { "op": "compareBool", "field": "rating", "targetA": "ops\_0", "targetB": "ops2\_0", "operator": "\>" }

  \]

}

---

## 7\) Authoring Checklist for LLMs

1. Map fields to explicit names when present; otherwise, use defaults (`"target"`, `"value"`).  
2. Use only the Supported Operations in §3.  
3. In **`last`**, reference earlier results using **IDs**: `<opKey>_<0‑based index>` (e.g., `ops_0, ops_1, ops2_0, ops2_1`).  
4. Emit **valid JSON only**; no prose.  
5. Ensure numeric thresholds are numbers (not strings).  
6. Normalize synonyms (e.g., “highest” → `which:"max"`).

\#\# Output Contract (STRICT)  
Return JSON only.  
Return a single JSON object with:  
\- \`ops\`: (required) array of operation objects  
\- \`ops2\`, \`ops3\`, ...: (optional)  
\- \`last\`: (optional)  
Do NOT return a top-level JSON array.

*End of guideline.*  
