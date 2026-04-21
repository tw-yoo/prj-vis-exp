# Engineering-Translated Analysis: Visual Explanation Strategies for a D3.js Chart System
**Dual-purpose document: Research-facing findings + Engineering-facing translation**  
**Source:** Cross-Case Synthesis (Step 2) — 131 expert strategy steps, 8 experts, 5 chart types  
**Target audience:** Coding agent (e.g., Codex) reviewing an existing D3.js chart-explanation program

---

## 1. Updated Analysis Summary

### What the Expert Data Shows

Experts explaining chart operations consistently apply a small set of visual implementation families in recurring sequences. Across 131 strategy steps, five structural patterns are strongly supported:

1. **A horizontal reference line (F1)** almost always precedes any comparison, threshold check, or aggregate computation — it is the spatial anchor that makes subsequent visual operations possible.
2. **A vertical double-arrow with a numeric label (F2: R4 + A2)** is the canonical way to externalize a numeric difference. It is the most implementation-stable pattern in the dataset, appearing across all chart types and all experts.
3. **Salience modulation (F3)** — ranging from hard mark removal to opacity dimming to highlight — is applied in every operation family but never alone. It is always paired with F1, F2, or F5.
4. **Chart-type transformation (F4)** — converting stacked to grouped, grouped to simple bar, line to bar, etc. — functions as a structural prerequisite that makes subsequent operations tractable, not as an explanation in itself.
5. **Multi-step explanations follow a two-phase structure:** scope reduction (OP2 + F3/F4) → operation + annotation (F1 + F2 + F5). This pattern is repeated in nested form for compositional questions.

### What This Implies for a D3.js Explanation System

The expert data suggests that a well-designed explanation system would likely need to support:
- Reusable, composable annotation primitives (not operation-specific SVG code)
- An explicit representation of explanation steps as data, not just as rendered SVG
- Configurable placement strategies for annotations (right-edge vs. inline)
- A modular salience API separable from operation-specific rendering
- A chart state model that can represent structural transformations as first-class changes
- Staged, transition-aware rendering of sequential steps

Whether the current program has these capabilities — and how they are structured — are the central questions for a code review.

---

## 2. Research-Facing Findings (Concise Reference)

### Revised Operation Taxonomy (v2)

| ID | Name | Key Characteristic |
|---|---|---|
| OP1 | Threshold filtering | Externally-specified numeric boundary |
| OP2 | Subset focus and isolation | Scope reduction; may chain into other operations |
| OP3 | Aggregate computation | Computed summary (mean/median) |
| OP4a | Point-to-point difference | Two named values → one gap |
| OP4b | Serial per-position difference | Gap at every x-position → series |
| OP5-R | Extrema and rank selection | Merged from OP5+OP9; mechanisms identical |
| OP6 | Sequential pairwise change | Ordered x-axis; direction + magnitude per step |
| OP7 | Per-group comparison | Two groups across all x-positions |
| OP8 | Sum and accumulation | Total over a set or x-range |
| OP10 | Count and enumeration | Count of qualifying marks |
| OP11 | Multi-step compositional | Structural chain; not a distinct operation |
| OP12 | Topological feature detection | *Tentative;* structural relationship (e.g., crossing) |

### Implementation Family Summary (v2)

| Family | Name | Core Mechanisms | Evidence Strength |
|---|---|---|---|
| F1 | Reference-Based Anchoring | R1, R2, R3, R5 | Strong — universal precondition |
| F2 | Difference Externalization | R4 + A2 (compound unit) | Strong — most stable cross-chart pattern |
| F3 | Salience Modulation | E1–E6 (exclusion → amplification gradient) | Strong; E2/E3 choice variable |
| F4 | Chart-Type Transformation | T1–T8 | Strong role (enabling); variable mechanism |
| F5 | Textual and Numeric Augmentation | A1–A6 | Strong; always paired, never standalone |
| F6 | Spatial and Layout Transformation | L1–L4 | Moderate; internally heterogeneous |
| F7 | Sequential and Direction-Encoding | F7a (R6, R7), F7b (S2, A4), F7c (S1) | F7a moderate; F7b–c tentative |

### Provisional Cross-Case Themes

| Theme | Statement | Strength |
|---|---|---|
| T1 | F1 (reference anchoring) is a universal precondition, not an operation-specific add-on | Strong |
| T2 | F2 (R4 + A2) is the canonical difference-externalization compound across all chart types | Strong |
| T3 | F3 (salience modulation) is attention infrastructure — always paired, never explanatory alone | Strong |
| T4 | F4 (chart transformation) is a structural prerequisite, always appearing before annotation steps | Strong |
| T5 | Multi-step explanations follow a consistent two-phase structure: scope reduction → annotation | Moderate |
| T6 | F7a (R6, R7) provides chart-type-specific direction-encoding for OP6, distinct from F2 | Moderate |

### Key Tensions

| Tension | Core Trade-off |
|---|---|
| Tn1 | **E2 (dim) vs. E3 (remove):** context preservation vs. annotation clarity |
| Tn2 | **In-place annotation vs. chart transformation:** fidelity to original chart vs. operational tractability |
| Tn3 | **Right-edge vs. inline arrow placement (R4):** spatial separation vs. data proximity |
| Tn4 | **Serial annotation density (OP4b):** repeating R4 per position vs. transforming to a derived chart |
| Tn5 | **Rescaling (L3) after isolation:** local readability vs. cross-state comparability |

---

## 3. Engineering Translation by Theme

---

### Theme T1 — Baseline Anchoring as Universal Precondition

**Why it matters analytically:**  
F1 (reference lines: R1, R2, R3) appears as the first rendering act in OP1, OP3, OP4a, OP5-R, and OP7. It is not operation-specific; it is a shared prerequisite that creates the spatial anchor for all subsequent annotation. Its variants (full-width, local, segmented) are structurally distinct and appear in predictable chart-type contexts.

**What the system likely needs to support:**
- A reusable **horizontal reference line primitive** that accepts: a y-value, a style (solid/dashed), a scope (full-width, local x-range, or x-group-bounded), and an optional label.
- The primitive should be usable identically across Simple Bar, Grouped Bar, Stacked Bar, Simple Line, and Multiple Line contexts.
- The label (A1) should be composable with the line, not embedded in operation-specific code.

**What a coding agent should inspect:**
- Are reference lines (threshold lines, average lines, segmented average lines) implemented as a shared primitive or recreated with separate SVG append calls per operation?
- Do reference lines accept a `scope` parameter (full-width vs. x-group-bounded), or is the scoping hard-coded per operation?
- Is the y-position of the line computed from data (e.g., `yScale(value)`) or set as a pixel offset?
- When R3 (segmented line, average over a subrange) is needed, does the system re-use R1 logic with an x-range constraint, or is it a separate code path?
- Can the line style (solid vs. dashed) be configured at call time, or is it fixed per operation?

**Kinds of modification likely needed:**
- If reference lines are recreated per-operation: **extract into a shared annotation primitive** (e.g., a D3 component factory `createReferenceLine(svg, { y, style, xRange, label })`).
- If scoping is hard-coded: **add an `xRange` parameter** that accepts `[x1Pixel, x2Pixel]` to support both R1 (full-width) and R2/R3 (bounded).
- If the line and label are separate and uncoordinated: **couple them as a compound unit** so the label position tracks the line's right endpoint automatically.

---

### Theme T2 — Difference Externalization as Canonical Compound

**Why it matters analytically:**  
The R4 + A2 compound (vertical double-arrow + numeric label) is the single most consistently observed pattern in the dataset. It appears in every expert's work, across all five chart types, for OP4a, OP4b (aggregate), OP3+OP4a chains, and OP6 (terminal step). Its spatial position varies (right-edge for point-to-point; inline for serial), but the mechanism is identical.

**What the system likely needs to support:**
- A **difference annotation compound** that takes two y-values (or two reference line positions) and produces: a vertical double-arrow spanning the gap, a numeric label placed adjacent to the arrow, and a configurable x-position (right-edge or inline).
- The compound should be callable in both **right-edge mode** (OP4a: arrow placed at `chartWidth`) and **inline mode** (OP4b: arrow placed at `xScale(datum)`).
- Arrow head direction should be automatic: double-headed by default; single-headed available for OP6 use.

**What a coding agent should inspect:**
- Is the double-arrow compound implemented as a reusable function/component, or are its SVG elements (line, arrowhead path, text) assembled ad hoc in operation-specific rendering functions?
- Is the x-position of the arrow computed from a placement strategy (e.g., `'right-edge'` or `'inline'`), or is it hard-coded to a pixel value per operation?
- Is the arrow's y-span derived from two reference line positions (making it aware of F1 state), or does it accept two raw y-values independently?
- Is the label (A2) positioned relative to the arrow mid-point programmatically, or is its placement manually adjusted per case?
- When multiple R4 arrows are drawn (OP4b: one per x-position), does the code loop over a data array with a consistent draw call, or are individual arrows added manually?

**Kinds of modification likely needed:**
- If ad hoc: **create a `drawDifferenceArrow(svg, { y1, y2, x, placement, label })` primitive** usable in both right-edge and inline modes.
- If placement is hard-coded: **add a `placement` parameter** with values `'right-edge'` and `'inline'` that controls x-coordinate calculation.
- If the compound is not aware of reference line state: **pass reference line objects** (or their data) as inputs to the arrow, so the arrow's endpoints automatically track the lines.
- For OP4b serial arrows: **ensure the arrow is drawn inside a D3 `.each()` or data join** so it scales to any number of x-positions.

---

### Theme T3 — Salience Modulation as Attention Infrastructure

**Why it matters analytically:**  
F3 (salience modulation) appears in every operation family and is always paired with F1, F2, or F5 — it is never the sole explanation mechanism. Its internal gradient runs from hard exclusion (E3: remove) to amplification (E1: highlight). The E2 vs. E3 choice is a recurrent open design question — experts diverge here systematically.

**What the system likely needs to support:**
- A **mark salience API** that accepts: a set of marks (by datum, index, or predicate), a salience level (e.g., `'highlight'`, `'dim'`, `'grayscale'`, `'remove'`), and applies the corresponding visual treatment.
- The API should be **separable from operation rendering logic** so it can be called compositionally from any operation handler.
- `'remove'` should be reversible (toggle back on) if the system supports multi-step explanation with backward navigation.
- For E6 (strengthen existing annotation), the API needs access to annotation elements (not just data marks), so strengthening annotations (bolder arrows, darker text) is also possible.

**What a coding agent should inspect:**
- Is opacity/color/fill manipulation centralized in a salience module, or is it scattered across operation-specific rendering functions (e.g., `barChart.js` has `.attr('opacity', 0.2)` and `lineChart.js` also has `.attr('opacity', 0.2)` independently)?
- Can salience be applied to a **predicate-selected subset** of marks (e.g., `bars where datum.value < threshold`), or does it require manual index specification?
- Are salience changes applied through D3's update pattern (`.attr()` on bound data) or via direct DOM style manipulation (`.style('opacity', ...)`)?
- Is there a distinction in the code between `E2` (opacity reduction, mark remains in DOM) and `E3` (mark removed from DOM / data filtered)?
- If E3 (remove) is used, does the chart's scale and layout recompute automatically (needed for L3), or does rescaling require a separate explicit call?

**Kinds of modification likely needed:**
- If salience logic is scattered: **extract into a centralized `applyMarkSalience(selection, level)` helper** where `level` is an enum `('highlight' | 'dim' | 'grayscale' | 'remove')`.
- If salience is mixed into operation rendering: **refactor so operations call the salience API** rather than directly manipulating opacity/color.
- If `E3` (remove) and `L3` (rescale) are not linked: **create a `filterAndRescale(predicate)` step** that combines data filtering with scale domain recomputation and transition.
- If E6 (strengthen annotation) is not supported: **add a salience level for annotations** distinct from marks, since annotations are SVG elements added after the base chart, not bound to the original data join.

---

### Theme T4 — Chart Transformation as Structural Prerequisite

**Why it matters analytically:**  
F4 transformations (T1–T8) are not visual explanations in themselves — they are structural prerequisites that make subsequent operations tractable. They always appear at the *beginning* of a step chain, before F1, F2, F3 are applied. The most common are T1 (stacked → grouped, for OP7), T7 (grouped → stacked, for OP8), and T2/T5/T6 (reduce to simple bar, for OP3/OP5-R). T1 and T7 are logical inverses.

**What the system likely needs to support:**
- An explicit **chart state model** that distinguishes: (a) data, (b) encoding (which fields map to which channels), and (c) chart type. A transformation is a change to (b) or (c), not to the underlying data.
- The ability to **re-render the chart from a new state** when transformation is requested, using D3 transitions to animate the structural change.
- A **transformation registry** that maps `(source chart type, operation type)` → `recommended transformation` — so the planner can select T1 before OP7 on a Stacked Bar without hard-coding that logic in the operation handler.

**What a coding agent should inspect:**
- Is chart type represented as an explicit state variable, or is it implicit in which rendering function was called?
- When a transformation is applied (e.g., stacked → grouped), does the system update a state object and re-render declaratively, or does it manually manipulate the existing SVG (move rects, add new rects, etc.)?
- Is there a step in the explanation plan where the system records "chart type changed from X to Y"? Or are transformations invisible in the step structure?
- Can transformations be **composed** (e.g., stacked → grouped → simple bar, as two sequential F4 steps), or does each transformation assume a fixed starting chart type?
- Is the data binding updated when chart type changes (i.e., does the `data()` join update correctly), or are old data references left in the DOM?
- Are transitions used when the chart transforms, or does the chart snap immediately?

**Kinds of modification likely needed:**
- If chart type is implicit: **introduce an explicit `chartState` object** with fields `{ type, encoding, data }` that can be passed to a unified render function.
- If transformations are DOM manipulation: **refactor to data-driven re-render:** `setState(newType) → recompute scales → rerender with transition`.
- If transformations are not in the step plan: **add a `TransformStep` type** to the step sequence that records before/after chart types, enabling undo and narrative explanation.
- If transformation selection is hard-coded per operation: **extract a `selectTransformation(chartType, operation)` planner function** that returns the appropriate F4 transformation type.

---

### Theme T5 — Two-Phase Explanation Structure

**Why it matters analytically:**  
Multi-step questions consistently follow: **Phase 1 (scope reduction)** using OP2 mechanisms (F3, F4, F6) → **Phase 2 (operation + annotation)** using F1, F2, F5. Compositional questions chain this pattern. The implication is that the step sequence is not flat — it has a consistent internal structure that the system could exploit.

**What the system likely needs to support:**
- An **explanation plan** represented as an ordered sequence of step objects, each with a type (`'scope-reduction'`, `'transformation'`, `'annotation'`), so the system can reason about step ordering.
- A **step renderer** that takes a step object, determines what visual changes to make, and applies them with the appropriate D3 transitions.
- Support for **step-level undo** (reverse a scope reduction to restore context) if the interface supports backward navigation.

**What a coding agent should inspect:**
- Is the explanation represented as an explicit sequence of step objects, or only as a sequence of rendering function calls (e.g., `step1()`, `step2()`, `step3()` with no shared structure)?
- Can individual steps be inspected, modified, or reordered programmatically, or is the sequence fixed in code?
- Is there a mechanism for one step's output (e.g., a filtered data set from scope reduction) to be passed as input to the next step, or does each step re-compute from the original data?
- Does the step sequence distinguish between enabling steps (scope reduction, transformation) and explanatory steps (annotation, labeling)?

**Kinds of modification likely needed:**
- If steps are only rendering calls: **define a `Step` type** (e.g., `{ type, params, execute(state) → newState }`) and build a plan as an array of `Step` objects.
- If state is not threaded between steps: **implement a state-threading pipeline** where each step receives the current visual/data state and returns a modified state.
- If phase structure is not represented: **tag each step with a phase** (`'reduction'` or `'annotation'`) to enable the planner to validate that reduction steps precede annotation steps.

---

### Theme T6 — Sequential Direction-Encoding as Chart-Type-Specific Device

**Why it matters analytically:**  
F7a mechanisms (R7: L-shape pair in Simple Line; R6: step arrow in Simple Bar) are specific to OP6 (sequential pairwise change). They differ mechanistically from F2 (double-arrow): R7 encodes both direction and magnitude using a horizontal + vertical L-shape; R6 encodes direction using a bar-top-to-bar-top arrow. Neither is used outside OP6. Their chart-type specificity is strong and consistent.

**What the system likely needs to support:**
- A **step-change annotation primitive** that: for Simple Line, draws a horizontal guide at y:n and a vertical single-arrow from y:n to y:n+1 (R7); for Simple Bar, draws a curved or straight arrow from the center-top of bar:n to center-top of bar:n+1 (R6).
- The primitive should accept both **up-direction and down-direction** (increase vs. decrease), encoding direction via arrowhead orientation and optionally via color.
- For OP6's terminal sub-step (identify the largest change), the system needs to apply **E6 (annotation strengthening)** to the specific R7 or R6 arrow that corresponds to the maximum step.

**What a coding agent should inspect:**
- Does the program implement R7 (L-shape pair) as a distinct module, or are its two components (horizontal guide line, vertical arrow) assembled separately in ad hoc code?
- Is the direction (increase vs. decrease) of the arrow encoded in the data binding (e.g., `datum.direction`), or is it computed per-element in the rendering function?
- When OP6's "find maximum step" sub-operation is needed, can E6 (annotation strengthening) be applied to a specific arrow element by its index or datum, or does strengthening require re-rendering all arrows?
- Is R7 implemented separately from R6, or does the system try to share logic in a way that obscures their structural difference?

**Kinds of modification likely needed:**
- If R7 is assembled ad hoc: **extract `drawLShapeStepAnnotation(svg, { xN, xN1, yN, yN1 })` as a reusable function** that draws both the horizontal guide and vertical arrow from parameters.
- If direction is not encoded in data: **add a `direction: 'increase' | 'decrease'` field** to the step annotation datum so rendering style (color, arrow direction) can be driven declaratively.
- If E6 (strengthen) cannot target a single arrow: **add a `datum`-keyed selection mechanism** so `strengthenAnnotation(datum)` can locate and style a specific annotation element by its bound data.

---

## 4. Engineering Translation by Tension

---

### Tension Tn1 — E2 (Dim) vs. E3 (Remove)

**Why it matters:**  
Expert practice diverges here systematically. Some experts dim irrelevant marks (E2), keeping them visible for context; others remove them entirely (E3), producing a cleaner base for subsequent annotations. Both approaches are valid depending on whether subsequent annotation steps need a clean canvas or whether context is informative.

**Design choice implied:**  
The system should likely support both strategies and allow the active strategy to be **configured per step** rather than fixed globally. The planner (or the operation handler) should be able to specify `salience: 'dim' | 'remove'` when reducing scope.

**What a coding agent should inspect:**
- Does the program have a single code path for focus control, or separate paths for E2 and E3?
- If the program defaults to one strategy (e.g., always dims), can this be overridden per step?
- If E3 (remove) is used, does the D3 exit pattern handle the transition cleanly, or do removed elements leave artifacts?
- Does L3 (rescaling) trigger automatically when E3 removes marks, or must it be called separately?

**Likely modification:**  
Add a `salienceStrategy: 'dim' | 'remove' | 'grayscale'` parameter to the salience API and the step planner. If the program currently only supports one, adding the other requires: (a) a data filter for E3 (binding a filtered dataset to the marks selection + exit handling + scale recomputation), and (b) an opacity setter for E2 (no DOM removal, just visual change).

---

### Tension Tn2 — In-Place Annotation vs. Chart Transformation

**Why it matters:**  
For OP6 (find max step change) and OP4b (serial differences), two structurally different approaches coexist: annotating the original chart in place (E6, or repeating R4 inline) vs. transforming to a derived chart (T3/T6) and then annotating that. These produce fundamentally different artifacts. The in-place approach preserves the original chart's structure; the transformation approach improves clarity at the cost of fidelity.

**Design choice implied:**  
The system likely needs to support both, with the **planner or caller making an explicit choice** between the two strategies. A single code path that always transforms is not justified by the expert data; neither is always annotating in place.

**What a coding agent should inspect:**
- Does the program offer both paths (in-place annotation and derived chart) for OP6 and OP4b, or does it default to one?
- If transformation is chosen, does the system correctly link the derived chart back to the original for narrative coherence (e.g., axis labels that indicate "Difference between X and Y")?
- Is the decision to transform or annotate in-place made at the planner level (explicit branching), or is it embedded in the operation-specific rendering function?

**Likely modification:**  
Add a `strategy: 'inPlace' | 'deriveChart'` parameter to the OP6 and OP4b operation handlers. The `'deriveChart'` path should invoke F4 (transformation) before F1/F2/F5 are applied; the `'inPlace'` path applies F7a or F2 directly to the existing chart.

---

### Tension Tn3 — Right-Edge vs. Inline Arrow Placement (R4)

**Why it matters:**  
For OP4a (point-to-point difference), the double-arrow is placed at the chart's right edge to avoid occluding data. For OP4b (serial per-position difference), the arrow is placed inline at each x-position. The right-edge default breaks down when comparison targets are spatially close; inline placement breaks down when there are many x-positions (density problem).

**Design choice implied:**  
Arrow placement should be a **configurable strategy with a default**, not a hard-coded pixel value. The planner should select placement mode based on operation type (`'right-edge'` for OP4a, `'inline'` for OP4b), with override possible.

**What a coding agent should inspect:**
- Is the x-position of the difference arrow computed from a strategy parameter, or is it a hard-coded value like `chartWidth - margin.right`?
- When arrows are placed at the right edge, does their position update correctly when the chart width changes (responsive layout)?
- For inline arrows (OP4b), is the arrow's x-position derived from `xScale(datum.x)`, making it data-driven and robust to scale changes?
- Does the code support both placement modes, or only one?

**Likely modification:**  
Introduce a `placementMode: 'right-edge' | 'inline'` parameter in the `drawDifferenceArrow` primitive. In `'right-edge'` mode, `x = svgWidth - rightMargin`; in `'inline'` mode, `x = xScale(datum.x)`. Both modes should respond to scale changes.

---

### Tension Tn4 — Serial Annotation Density (OP4b)

**Why it matters:**  
When OP4b (serial per-position difference) is explained with inline R4 per x-position and A2 labels, the chart becomes visually dense at high x-position counts. Experts address this in two ways: some annotate every position; one expert transforms to a derived difference chart (T4). No expert selectively annotates some positions, though this might be a valid middle ground.

**Design choice implied:**  
The system should likely support a **density control parameter** for serial annotations, with at least two strategies: `'all'` (annotate every position) and `'deriveChart'` (transform to a difference series chart). A `'selective'` mode (annotate only peaks or labeled positions) is a design option not yet validated in the data, marked tentative.

**What a coding agent should inspect:**
- For OP4b, does the program currently generate annotations for every x-position, or does it have density control?
- If the program annotates every position, does it handle label overlap (e.g., using `dy` offsets or hiding labels when arrows are too close)?
- Is there an existing path to the derived difference chart (T4), or would that require creating a new chart rendering branch?

**Likely modification:**  
Add a `densityMode: 'all' | 'deriveChart'` parameter to the OP4b handler. The `'all'` path applies R4+A2 in a D3 data join over the difference series. The `'deriveChart'` path invokes F4 (T4 or T3 transformation) and re-renders with a new yScale.

---

### Tension Tn5 — Rescaling After Isolation (L3)

**Why it matters:**  
L3 (rescale after filtering) is needed when E3 (mark removal) or F4 (chart transformation) changes the visible data range. Without rescaling, the remaining marks may be compressed or clipped. With rescaling, the filtered chart is visually incomparable to the original — the y-axis domain has changed, making magnitude comparison across steps impossible.

**Design choice implied:**  
The system should likely support **an explicit rescale flag** on isolation steps, with the rescale operation logging the domain change so subsequent steps (and viewers) can be informed of the changed scale.

**What a coding agent should inspect:**
- Does the program recompute the y-axis domain after filtering, or does it reuse the original domain?
- If rescaling occurs, is the domain change recorded in the step state or only applied to the SVG?
- Does the y-axis transition (animated scale change) when rescaling, or does it snap to the new domain?
- Can the old scale be recovered (for backward navigation), or is the rescale destructive?

**Likely modification:**  
Add a `rescale: boolean` option to isolation/filter steps. When `true`, recompute `yScale.domain([0, d3.max(filteredData, d => d.value)])` and apply the new scale to both the axis and mark positions with a D3 transition. Store the previous domain in the step state object for potential reversal.

---

## 5. D3.js-Specific Review Implications

The following concerns are directly suggested by the analysis. They are framed as hypotheses about what may exist in the current program, not confirmed findings.

---

**Primitive reuse:** Based on the frequency of F1 (reference lines) and F2 (difference arrows), the most critical review question is whether these are implemented as reusable D3 components or recreated inline per operation. If every operation that needs an average line has its own `svg.append('line')...` block, refactoring into a shared `drawReferenceLine()` function would likely reduce duplication and improve consistency.

**DOM/state coupling:** F4 (chart transformation) is the highest-risk area for DOM/state coupling. If transformation is implemented by directly manipulating existing SVG elements (moving rects from stacked to grouped positions by changing their `x` and `width` attributes in-place), the chart state is embedded in the DOM rather than in a data model. This makes it harder to undo, compose, or plan transformations. A review should assess whether `chartType` is an explicit state variable or an implicit consequence of which function was last called.

**Transition handling:** The analysis describes several animation/transition moments: scope reduction (E3 removal), chart transformation (F4), and sequential step reveals (S1). If these transitions are implemented as ad hoc `.transition().duration()` calls embedded in operation logic, they may not compose well when transitions need to be sequenced (e.g., remove marks, then rescale, then draw annotation). D3's `transition.end()` promise can be used to chain transitions, but this pattern may not be consistently applied.

**Annotation layering:** F5 (textual augmentation) elements (labels, arrow text, running totals) are added after base chart marks. If they are appended directly to the same `<g>` element as the chart marks, their z-order relative to marks may be unpredictable, and selecting them separately for E6 (annotation strengthening) becomes difficult. Annotations should likely live in a dedicated layer (e.g., a separate `<g class="annotations">`) above the marks layer.

**Scale and layout recomputation:** L3 (rescale after filtering) and F4 (transformation involving new scales) both require recomputing the y-axis domain and re-positioning all marks. If scale computation is done once at chart initialization and not exposed as a callable update function, adding dynamic rescaling requires structural change. A review should check whether `xScale` and `yScale` are created in a closure that can be updated with `yScale.domain(newDomain)`, or whether they are defined as constants.

**Explicit step representation:** The two-phase explanation structure (Theme T5) strongly suggests that explanation steps should be represented as data, not only as code. If the current program represents a step sequence only as a series of function calls (e.g., `renderStep1(); renderStep2();`), adding features like step navigation, undo, or automated narration would require significant restructuring. A review should check whether any step-sequence data structure exists (e.g., an array of step descriptors), or whether the sequence is implicit in execution order.

**Strategy composability:** F3 (salience modulation) should ideally be composable with any operation — a threshold filter, an average computation, and an extrema selection all need to suppress non-qualifying marks. If each operation has its own salience logic, adding a new operation requires writing salience code again. A composable salience API would take a selection and a level, apply the appropriate visual treatment, and be callable from any operation handler.

---

## 6. Questions a Coding Agent Should Answer

When reviewing the current D3.js program, the coding agent should answer the following questions. They are ordered from most foundational to most specific.

### Architecture and State

1. Is there an explicit `chartState` object (or equivalent) that records the current chart type, encoding, and visible data range? Or is chart state implicit in which rendering function was last called?
2. Is the explanation sequence represented as an array of step objects, or only as a sequence of function calls?
3. Can individual steps be inspected, reordered, or skipped programmatically?
4. Is there a mechanism for one step to pass its output state to the next step, or does each step re-derive state from the original chart data?

### Primitive Reuse (F1 and F2)

5. Are horizontal reference lines (threshold lines, average lines) implemented as a shared, parameterized primitive, or recreated ad hoc per operation?
6. Does the reference line primitive accept a scope parameter (`xStart`, `xEnd`) to support both full-width (R1) and x-group-bounded (R2) variants?
7. Is the difference arrow (R4) and its label (A2) implemented as a reusable compound unit, or assembled from separate SVG append calls in operation-specific code?
8. Can the difference arrow's x-position be set via a placement mode parameter (`'right-edge'` vs. `'inline'`), or is it hard-coded?
9. Are multiple R4 arrows for OP4b (serial differences) rendered via a D3 data join, or added individually in a loop?

### Salience Modulation (F3)

10. Is salience modulation (opacity, fill, mark removal) centralized in a shared function, or scattered across operation-specific rendering code?
11. Can salience be applied to a predicate-selected subset of marks (e.g., `marks where d.value < threshold`), or does it require explicit index lists?
12. Does the program distinguish between E2 (opacity reduction, marks remain in DOM) and E3 (marks removed from DOM via D3 exit)?
13. When E3 (removal) is applied, does the y-axis domain recompute automatically, or does rescaling require a separate explicit call?
14. Can E6 (annotation strengthening) be applied to annotation elements (arrows, text) separately from data marks?

### Chart Transformation (F4)

15. Is chart type transformation implemented as a data-model state change followed by declarative re-render, or as direct SVG manipulation of existing elements?
16. Is there a `TransformStep` type or equivalent in the step sequence that records which transformation was applied and from/to which chart types?
17. Can transformations be composed in sequence (e.g., stacked → grouped → simple bar), or does each transformation assume a fixed starting chart type?
18. Are D3 transitions used when chart structure transforms, or do charts snap to the new structure immediately?
19. Is there a planner function or lookup that maps `(chartType, operationType)` → recommended transformation, or is this logic embedded in operation handlers?

### Annotation and Text (F5)

20. Do annotation elements (labels, axis titles, running totals) live in a dedicated SVG layer (`<g class="annotations">`) above the marks, or are they mixed into the marks group?
21. Can annotation elements be selected and styled independently of data marks (e.g., for E6 strengthening)?
22. Is there support for axis relabeling (A6) — changing x-axis tick labels after a chart transformation — as an explicit step?

### Sequential and Temporal Devices (F7)

23. Is there a `drawLShapeStepAnnotation` function (or equivalent) for OP6 (sequential change) in Simple Line charts?
24. Is direction (increase vs. decrease) encoded in the data binding for step annotations, or computed per-element in the render function?
25. For F7c (animation / progressive reveal), are D3 transitions chained using `transition.end()` promises, or are they applied with fixed delays that may desync?
26. Is there any representation of animation as a named, reusable step type, or are transitions embedded as one-off calls?

### Layout and Placement (F6)

27. When L3 (rescale after filtering) is applied, does the chart's y-axis transition smoothly to the new domain, and is the old domain stored for potential recovery?
28. For L4 (background shading for a range), is the shaded region drawn as a `<rect>` behind the marks layer, and is its position data-driven (i.e., `xScale(rangeStart)` to `xScale(rangeEnd)`)?
29. For L2 (reposition marks), is there a mechanism to reorder bars spatially while preserving their data identity?

---

## 7. Expected Downstream Use

This document should be used by the coding agent in three modes:

### Mode 1 — Capability Review Guide

Use **Section 6 (Questions)** as a structured checklist during codebase review. For each question, record:
- **Present:** the capability exists and is appropriately implemented
- **Partial:** the capability exists but is hard-coded, duplicated, or non-composable
- **Absent:** the capability is not implemented
- **Unknown:** the question cannot be answered without running the code or reading runtime behavior

Group findings by implementation family (F1–F7) and architecture concern (state, steps, primitives, salience, transformation).

### Mode 2 — Gap-Analysis Reference

Use **Sections 3 and 4 (Engineering Translation by Theme / Tension)** to interpret the review findings. For each capability that is **Partial** or **Absent**, cross-reference:
- Which theme or tension it relates to
- The evidence strength of that theme (Strong / Moderate / Tentative) to prioritize work
- The suggested modification type (abstraction change, planner change, rendering refactor, API redesign)

Prioritize modifications related to **Strong-evidence themes** (T1, T2, T3, T4) over those related to **Moderate or Tentative** ones.

### Mode 3 — Input for Prioritized Modification Plan

After completing Modes 1 and 2, use the findings to construct a prioritized modification plan with three tiers:

**Tier 1 — High priority (likely to affect correctness and composability):**
- Reusable reference line primitive (F1; Strong evidence; affects OP1, OP3, OP4a, OP5-R)
- Difference arrow compound with configurable placement (F2; Strong evidence; affects OP4a, OP4b, OP6, OP7)
- Centralized salience API with E2/E3 branching (F3; Strong evidence; affects all operations)
- Explicit chart state model and transformation step type (F4; Strong evidence; affects OP2, OP7, OP8, OP11)

**Tier 2 — Medium priority (likely to affect completeness and extensibility):**
- Explicit step sequence representation with phase tagging (T5; Moderate evidence)
- L-shape step annotation primitive for OP6 in Simple Line (F7a; Moderate evidence)
- Annotation layering in a dedicated SVG group (F5; Moderate evidence)
- Rescale-after-filter as an explicit, reversible step (L3; Moderate evidence; Tn5)

**Tier 3 — Lower priority or tentative (validate before implementing):**
- Selective density control for serial annotations (OP4b; Tn4; no clear expert consensus)
- Animation as a named, reusable step type (F7c; Tentative evidence)
- Crossing detection module for OP12 (OP12; Tentative — single case)
- Axis swap / pivot transformation (T8; Tentative — single case)

The modification plan should note which changes are **additive** (new primitive, new parameter) vs. **refactoring** (extracting existing logic into a shared module) vs. **redesign** (replacing implicit state with an explicit model). Additive changes carry lower regression risk and should generally be preferred when the existing code is functional but lacks composability.
