## 1. VizSpec Declarative Grammar

- **Sequence form:** The pipeline accepts either a single step, an array of steps, or an object containing an `ops` list; all cases are normalized into a linear sequence that is executed in order while updating a working dataset after each step.
- **Data model:** Each step operates on normalized chart rows that expose a category/label, a measure/value, an optional subgroup/series tag, and identifiers for lookup; selectors in the spec can point to marks by label, numeric key, or an object combining category and series cues.
- **Taxonomy of atomic operations:**
  - Data scoping & ordering: Retrieve Value, Filter, Sort, Nth-position selection, Lagged Difference (adjacent delta along an ordered domain).
  - Comparative reasoning: Compare (winner), Boolean Compare (relational truth), Extremum search (min/max), Range determination (domain bounds).
  - Aggregation & derivation: Sum, Average, Count, Difference/Ratio/Percent-of-total.
  - Meta/pacing & rendering: Sleep delays and explicit Draw directives for fine-grained visual actions.
- **Parameter expectations (conceptual):**
  - Selection steps define the target mark(s) or subgroup, the visual dimension of interest (category vs. value), and optional precision for displayed numbers.
  - Predicate steps supply a comparison operator and threshold(s); ordering steps specify sort key and direction; positional steps state rank and traversal side (left/right).
  - Comparative steps pair two targets (with optional distinct subgroups) and declare whether to pick the larger/smaller item or to evaluate a relational statement.
  - Aggregation steps name the measure to combine, optional grouping, and mode choices such as signed vs. absolute difference, ratio vs. percentage, and rounding preferences.
  - Control steps carry timing parameters; draw steps bundle a visual action type plus the selection and styling hints needed to render it.

## 2. Visual Synthesis (Execution Phase)

- **Operation → visual action mapping (simple bar implementation):**
  - Value retrieval and positional selection highlight the addressed bars and place numeric callouts anchored on the marks; nth-selection inherits the same pattern while emphasizing ordinal position.
  - Filtering draws a horizontal reference line at the threshold, pauses, shades only the qualifying portion of each bar, pauses again, then clears overlays before redrawing the filtered view.
  - Ordering and range cues: sorting wipes prior annotations, reorders bars, and realigns axis ticks; extremum search highlights the winning bar(s) with value labels; averaging renders a horizontal guide line across the plot.
  - Comparative reasoning: difference between two targets highlights both, draws a baseline at the smaller value, and overlays a colored segment on the larger bar to depict the magnitude gap.
  - Aggregation view: summation triggers a temporary aggregated rendering (single summed bar with label) and a timed pause to let viewers register the result.
  - Fallback draw primitives (highlight, dim, text, rect, line, bar-segment, split/unsplit, filter, sort) are available so non-implemented ops or future chart types can still emit explicit visual instructions.
- **State management and transitions:**
  - After the chart is rendered, a working dataset is updated step by step; results can be scoped per sub-chart when a split view is active, ensuring subsequent steps address the correct subset.
  - Intermediate results are cacheable by step key, allowing later operations to reference earlier outcomes through selectors.
  - Auto-generated draw plans receive the pre-operation working set for context (e.g., count uses the current ordering), and are executed by a handler that targets marks via data-driven keys.
  - An annotation layer separates overlays from base marks; it is cleared once at start and thereafter only when a Clear action (explicit or embedded in a plan) is issued, enabling controlled persistence of highlights across steps.
  - Sleep actions inserted in plans enforce perceptible pauses between stages of a multi-part visual effect (e.g., threshold line → segment shading → filter re-render).
- **Visual design patterns observed:**
- Focus+Context: active elements use a vivid accent color while non-selected marks are dimmed or hidden; overlay elements (lines, shaded segments, labels) sit in a dedicated layer to avoid mutating the underlying chart geometry.
  - Semantic color coding: warm accents signal selections, filters, and differences; cooler hues denote statistical references such as averages; neutral defaults return the chart to a baseline state after clears.
  - Anchored annotations: numeric labels are anchored to mark centers, and threshold/guide lines span the plot area to tie values to axes; shaded bar segments convey partial inclusion relative to a cutoff.
  - Smooth pacing: consistent transition durations and brief sleeps create a stepwise narrative, supporting comprehension of sequential reasoning (e.g., setup cue → highlight → result reveal).
  - View transforms: split/unsplit and aggregate renderings re-layout the chart to juxtapose subsets or totals, while axis updates after sorting maintain spatial consistency between data and ticks.

## 3. LLM Integration & Validation

- **Instruction strategy:** A standalone prompt template (`prompt.txt`) frames the model as a “chart-operations planner,” provides an explicit JSON ops spec schema (`{ "ops": [...] }`), enumerates allowed operations, and constrains draw actions. The template is filled with runtime placeholders for chart type, supported operations, and permissible draw actions, effectively teaching the grammar before inference.
- **Context injection:** The same prompt requires authors to prefill known axis/series field names, candidate domain labels for x and series dimensions, and the user’s question text; these cues reduce hallucinated field names and ground operators to the displayed chart.
- **Schema validation:** Execution-side validators enforce required parameters for each op class (e.g., targets for comparisons, required fields for aggregations, ordering fields for lagged differences). Missing or invalid fields raise errors early. In dev mode, the ops builder also validates draw schema definitions to catch mismatches between UI schemas and draw op types.
- **Sanitization/normalization:** Ops specs are normalized from multiple input shapes into a canonical ops array. Sleep durations are coerced to numbers at execution time so timing remains robust across inputs.
- **Fail-safes:** If an operation type lacks a handler, the runner logs a warning and proceeds; auto-draw plan builders return null when prerequisites are missing, skipping visualization rather than crashing. Annotation layers are cleared defensively when unspecified. Conversely, low-level data operations will throw when required arguments are absent, signaling malformed specs early rather than producing silent inaccuracies.

## 4. Visual Primitives & Composition

- **Primitive action space:** The draw subsystem exposes atomic actions including Highlight, Dim, Clear, Text annotation, Rect overlay, Line (guideline or connector), Line Trace, Bar Segment shading, Split/Unsplit view, Sort re-layout, Filter re-layout, Sum overlay, Line-to-Bar conversion, Stacked↔Grouped reshaping, and Sleep (temporal pause). These actions operate over selected marks (bars, points, paths) identified by chart-scoped keys.
- **Composition patterns (examples):**
  - Filter → [horizontal threshold line] → [pause] → [shade qualifying bar segment(s)] → [pause] → [clear overlays] → [apply filtered re-render]. This stages intent, condition, and outcome.
  - Difference → [highlight both compared bars] → [horizontal line at the smaller value] → [shade excess segment on the larger bar] to depict magnitude and direction.
  - Retrieval / Extremum / Nth → [highlight target marks] + [anchor numeric labels] to bind values to positions.
  - Average → [draw horizontal guideline at aggregated value] as a persistent reference.
  - Sort → [clear annotations] → [reorder bars and retick axis] to signal structural change before new reasoning steps.
  - Count (ordinal narration) → iterative [highlight bar i] + [place ordinal label] across the current ordering, leveraging prior working state.
  - Sum (aggregate view) → [render aggregated bar with label] → [pause] to let the viewer register the composite value.
- **Execution glue:** High-level analytical steps generate these primitive sequences via auto-draw plan builders that translate data-op results into mark selections, guide placements, and pacing pauses. The plan executor walks the sequence, dispatching to chart-specific handlers for geometry-aware actions and to a generic renderer for normalized overlays, while optional split handlers reset state when views are reconfigured. This modular decomposition is what produces the stepwise, animated visual explanations from each analytical operation.

## 5. Extensibility & Constraints

- **Renderer abstraction:** A dispatcher selects rendering strategies by chart type; a chart-type classifier routes to chart-specific runners, each built atop a shared operations runner that accepts pluggable render, handler, and split hooks. This mirrors a strategy/factory pattern: the orchestrator chooses the appropriate renderer, while downstream execution uses the same generic pipeline for data ops and draw-plan execution. Adding a new chart entails implementing its renderer and draw handler, then registering it in the dispatcher.
- **Shared vs. specific visual logic:** Core draw actions (highlight, dim, clear, text, rect, line, line-trace, sort, filter, split/unsplit, sleep) are chart-agnostic and executed by a generic handler or base class; bar-specific behaviors (bar-segment shading, sum overlay layout, stacked/grouped toggles) are isolated in the bar handler and visual builders. This separation allows reusing the primitive action vocabulary while swapping geometry-aware handlers per chart type.
- **Prompt negative constraints:** The system prompt enforces strict JSON-only output, bans markdown/comments/trailing commas, and requires emitting only the ops spec. It restricts operations and draw actions to enumerated lists, preventing invention of new operation names, and requires impossible requests be explained via a single draw text op.
- **Ambiguity handling:** The prompt includes only lightweight grounding (known field names and domain candidates) and provides no default disambiguation heuristics (e.g., no “top-k” default), so ambiguity is surfaced rather than auto-resolved.
- **Implicit operations:** The system favors explicit operations authored by the model. There is no automatic insertion of analytical steps such as sorting before ranking; supportedOps and supportedDrawActions are passed in explicitly. Temporal pacing is achieved by the model emitting explicit sleep ops and/or draw-plan sleeps when needed.

## 6. Narrative Design & Rendering Mechanics

- **Cognitive pacing:** Temporal pauses are deliberate. Generic sleep handling executes any provided duration, and composite draw plans insert fixed 1-second pauses at attention-heavy moments (e.g., before and after threshold shading or sum overlays). This creates micro-beats that separate “setup → reveal → transition,” reducing cognitive load. Outside those scripted pauses, no automatic delays are added, keeping simple highlights snappy while richer operations get breathing room.
- **Step transitions:** End-of-step cues are visual: some plans conclude with a Clear action to wipe annotations (filter) before re-rendering the filtered view, while others leave highlights/text in place to preserve context for subsequent reasoning (diff, retrieve, nth). The annotation layer is isolated from base marks, so clears remove overlays without disturbing the underlying chart; absence of a clear means history remains visible, signaling continuity across steps.
- **Coordinate space mapping:** Geometry is recovered from the live SVG rather than hidden chart state. For horizontal guides (e.g., threshold lines) the handler reads y-axis ticks or data-mark positions, interpolates in SVG space, and maps the numeric value to a y coordinate before drawing. For bar segments, it inspects each bar’s data attributes (value, target) and DOM bounding boxes, scales them to the viewBox, and overlays shaded rectangles that exactly cover the qualifying portion. Highlights/selects locate marks via data-target/id/value keys and then use their bounding boxes or centers for anchored text and overlays.
- **Contextual chaining:** The operations runner maintains a “working” dataset that is updated after each data operation; subsequent steps consume this transformed set, so a filter step narrows the scope for the next computation unless a chartId-scoped buffer is used to branch per subview. Auto-draw plans also receive the pre-operation working slice for contextual labeling (e.g., count uses current ordering). Runtime result caching and target selectors allow later steps to reference previously computed slices by identifier when provided, reinforcing deterministic chaining without implicit recomputation.
- **Runtime result caching:** The data layer exposes a runtime result store keyed by operation identifiers, enabling future features that reuse earlier results. The current system does not rely on intermediate variables in specs; chaining is achieved primarily by the working dataset updates and explicit target selectors.

## 7. Update (2026-03-04)

- TS `OperationOp`은 `setOp`, `pairDiff`, `add`, `scale`를 런타임 data op로 정식 지원한다.
- 실행 스케줄 정책:
  - 같은 phase 내부에서 `data op`는 순차 실행(결정성 보장)
  - `draw op`는 병렬 실행하되, 구조 변경 draw(`clear/filter/sort/split/unsplit/sum` 등)는 배리어로 순차 처리
- sleep 정책:
  - 신규 auto draw / Python draw plan은 `sleep`을 생성하지 않는다.
  - 기본 최소 실행 시간은 draw transition(기본 0.5s)으로 확보한다.
  - 레거시 sleep 입력은 런타임 호환 경로(no-op/skip)만 유지한다.
- bar sum 렌더 정책:
  - simple/stacked/grouped 모두 `draw.sum.value`를 우선 사용한다.
  - stacked/grouped는 단일 합산 바에서 시리즈 색을 유지하기 위해 시리즈 비율 기반으로 값 분배 렌더링한다.
- auto draw 확장:
  - simple/stacked/grouped bar에서 `determineRange`, `compareBool`, `setOp`, `add`, `scale`, `pairDiff`까지 포함한다.
  - stacked/grouped `compare/diff`는 `groupA/groupB`가 있으면 series-level strict pair를 우선 시도하고, 실패 시 target-level fallback으로 연결선을 생성한다.
