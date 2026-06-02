# System Review for the Paper's System Section

Working title for the system: **VisExplain** (placeholder). The repository (`prj-vis-exp`) does not give the system a marketing name. The one stable, code-grounded name is the intermediate representation, **VIZSPEC** (the code calls it `OpsSpec`). The authors should pick a system name; see Open Questions.

This document is an architectural briefing, not a code audit. It describes what each part does conceptually, the data it consumes and produces, the intermediate representations, and the design rationale visible in code, comments, and design docs. Claims are marked **[fact]** when grounded directly in code or repository docs and **[inference]** when proposed by this review.

Scope per the request: the two components reviewed in depth are the **Specification Generator** (`nlp_server/opsspec/`) and the **Explanation Visualizer** (`src/operation-new/`).

---

## 1. Repository map and method

### 1.1 Top-level layout

The repo holds two cooperating codebases:

- A Python backend `nlp_server/` (FastAPI). It turns `(question, explanation, vega_lite_spec, data_rows)` into the **VIZSPEC** operation graph. This is the **Specification Generator**.
- A TypeScript + D3 frontend under `src/` (Vite + React). It consumes the VIZSPEC and renders the step-by-step visual explanation onto the chart. The active rendering engine is `src/operation-new/`. This is the **Explanation Visualizer**.

The two communicate over HTTP: the frontend calls `POST /generate_grammar`, receives the VIZSPEC group map plus per-step text, and replays it on the chart. **[fact]** (`nlp_server/CLAUDE.md`, `nlp_server/main.py`, `src/operation-next/runChartOps.ts`)

### 1.2 Entry points

| Layer | Entry point | Role |
| --- | --- | --- |
| Backend HTTP | `nlp_server/main.py` (`POST /generate_grammar`) | Returns VIZSPEC `ops_spec` group map + `text_chunks`. **[fact]** |
| Backend orchestrator | `nlp_server/opsspec/modules/pipeline.py` (`OpsSpecPipeline.generate`) | Runs the recursive grammar pipeline end to end. **[fact]** |
| Frontend dispatcher | `src/operation-next/runChartOps.ts` (`runChartOps`) | Routes a chart type to its `operation-new` runner. **[fact]** |
| Frontend runner (simple line) | `src/operation-new/runSimpleLine.ts` (`runSimpleLineOperationsNew`) | Iterates VIZSPEC groups/ops and draws annotations. **[fact]** |

The frontend contract `runChartOps(container, spec, opsSpec, options)` returns `OperationNextRunOutcome { result, continuation, runtimeSnapshot }`. **[fact]** (`src/operation-next/executionState.ts`)

### 1.3 File to component/step mapping

Specification Generator (`nlp_server/`):

| File / module | Pipeline step |
| --- | --- |
| `opsspec/runtime/context_builder.py` (`build_chart_context`) | Ground (build chart context, deterministic) |
| `opsspec/runtime/op_registry.py` (`build_ops_contract_for_prompt`) | Ground (the dynamic op contract injected into prompts) |
| `opsspec/modules/module_inventory.py` + `prompts/opsspec_inventory.md` | Extract (Inventory, LLM) |
| `opsspec/modules/module_step_compose.py` + `prompts/opsspec_step_compose.md` | Compose (Step-Compose, LLM, looped) |
| `opsspec/runtime/grounding.py` (`ground_op_spec`) | Ground (deterministic token/value normalization) |
| `opsspec/validation/recursive_validators.py`, `opsspec/validation/validators.py` | Validate (schema + semantic) |
| `opsspec/runtime/executor.py` (`OpsSpecExecutor`), `opsspec/runtime/artifacts.py` | Compose (single-step execution + artifact summary) |
| `opsspec/specs/*.py`, `opsspec/specs/union.py` | VIZSPEC node schema (per-op Pydantic models) |
| `opsspec/runtime/normalize.py`, `opsspec/runtime/scheduler.py` | Compile (normalize edges, topological phase hints) |
| `opsspec/core/llm.py` (`StructuredLLMClient`) | LLM client (all LLM calls) |
| `draw_plan/build_draw_plan.py`, `draw_plan/models.py` | Optional draw-plan compile (mostly off) |

Explanation Visualizer (`src/operation-new/`):

| File / module | Visualizer step |
| --- | --- |
| `operation-next/runChartOps.ts` | Dispatch (chart type to runner) |
| `operation-new/runSimpleLine.ts` (and `runSimpleBar/StackedBar/GroupedBar/MultipleLine.ts`) | Sequence (iterate groups/ops, thread state) |
| `operation-next/chainState.ts`, `operation-next/executionState.ts` | Step-to-step state + cross-op data resolution |
| `operation-new/appliers/<chartType>/<op>.ts` | Per-op renderers (map an op to primitives) |
| `operation-new/primitives/*.ts` | Atomic visual operations |
| `rendering-new/instances/simpleLineInstance.ts`, `rendering-new/chartInstance.ts` | Stateful chart instance (skeleton, scales, smooth rescale) |

### 1.4 What I read, what I skipped, confidence

Read in full or near-full: `pipeline.py`; the two recursive prompt files plus `opsspec_shared_rules.md`; `module_inventory.py`, `module_step_compose.py`; `op_registry.py`; all `specs/*.py` and `union.py`; `context_builder.py`, `grounding.py`, `artifacts.py`, `normalize.py`, `scheduler.py`; `core/llm.py`, `core/recursive_models.py`, `core/models.py`, `core/datum.py`; `draw_plan/models.py` and `docs/draw_operations_reference.md`; the two design docs `paper_grammar.md` and `paper_specification_generator.md`; `nlp_server/CLAUDE.md`. On the frontend: `applier.ts`, `runSimpleLine.ts`, `chainState.ts`, `executionState.ts`, `runChartOps.ts`, `rendering-new/chartInstance.ts`, `rendering-new/instances/simpleLineInstance.ts`, the simple-line appliers `average/filter/diff/findExtremum/lagDiff/retrieveValue`, and the primitives `drawReferenceLine`, `drawVerticalReferenceLine`, `drawDifferenceArrow`, `markSalience`, `annotationLayer`, `contextFade`, `fadeRemove`, `drawResultBadge`, `placeLabel`, `sequencedReveal`. One real debug bundle (`opsspec/debug/05231644_01`) for the worked example.

Skipped or skimmed: `executor.py` internals (per-op arithmetic; behavior summarized from `op_registry.py` semantic rules and the artifact summaries), `validators.py` internals (rules summarized from the contract and the typed retry feedback), the `baseline/` and `module_baseline_*` code (these are comparison baselines, not the system), tests, build config, the `web/` workbench player (out of the two focus directories; its role is summarized from `runChartOps` and `CLAUDE.md`), and the simple-bar / stacked-bar / grouped-bar / multi-line appliers and primitives (`stackComposition`, `transitionLegend`, `sharedTransition`), which follow the same applier/primitive pattern as simple line.

Confidence: high for the Specification Generator pipeline structure, the VIZSPEC schema, the chart-context schema, the LLM call contracts, and the worked example; high for the simple-line Visualizer (appliers, primitives, chain state, smooth rescale); medium for the non-line appliers and for the optional draw-plan path (which is `DRAW_PLAN_MODE=off` by default).

---

## 2. System overview

**Input.** A natural-language `question` and a step-numbered `explanation` of the answer, plus the chart as a Vega-Lite `vega_lite_spec` and its `data_rows` (list of row objects). **[fact]** (`nlp_server/models.py`, `pipeline.py: generate`)

**Output.** A step-by-step visual explanation drawn on the chart: a sequence of reference lines, highlights, connecting arrows, and value labels animated onto the existing chart, each step paired with the sentence of the explanation it visualizes. **[fact]** (the appliers in `src/operation-new/appliers/`, plus `text_chunks` in the VIZSPEC response)

**The two components and the data between them.** The Specification Generator (`nlp_server/opsspec/`) reads the explanation against a deterministic summary of the chart and emits the **VIZSPEC**: a directed acyclic graph of data operations, returned as a group map `{ "ops": [...], "ops2": [...], ... }` plus `text_chunks` `{ "ops": "<sentence 1>", "ops2": "<sentence 2>", ... }`. Each graph node carries `meta.nodeId` (`n1`, `n2`, ...) and `meta.inputs` (the node ids it depends on), and cross-node scalar values are referenced by the string `"ref:nX"`. The Explanation Visualizer (`src/operation-new/`) consumes that group map directly: it walks the groups in order, runs each operation against the chart's data to recompute the value, and draws the matching annotation, threading a small **ChainState** so each step builds on the previous one. **[fact]**

**End-to-end flow (suitable for a system-overview figure).**

1. Chart spec + data rows are summarized into a deterministic **chart context** (primary dimension, primary measure, series field, categorical domains, numeric stats, mark type).
2. **Extract:** an LLM reads the explanation and emits a flat list of operation tasks `S(O)` (one task per reasoning chunk), using only the chart context and an injected op contract.
3. **Ground + Compose + Validate, looped:** the pipeline repeatedly picks the next executable task, an LLM proposes one operation spec for it, the proposal is deterministically grounded (role tokens and domain values resolved to real fields/labels), validated against the op contract, executed once to produce a real artifact value, and appended as a node with a stable id and dependency edges. The loop ends when all tasks are placed.
4. **Compile:** edges are normalized and a topological scheduler annotates phase hints. The VIZSPEC group map + text chunks are returned.
5. **Visualize:** the frontend dispatches by chart type to an `operation-new` runner, which iterates the VIZSPEC groups; for each operation it resolves its input data from prior nodes, recomputes the value, and draws the atomic annotation onto a separate annotation layer over the existing chart skeleton, with smooth transitions; the matching explanation sentence is shown as the textual cue for that group.

---

## 3. Intermediate representations

### 3.1 VIZSPEC operation graph (the `OpsSpec` DAG)

Where defined: node models in `nlp_server/opsspec/specs/*.py`; the discriminated union in `opsspec/specs/union.py`; the response shape in `opsspec/core/models.py` (`GenerateOpsSpecResponse`). **[fact]**

Structure:

- The graph is returned as a **group map**: keys are reasoning-chunk layers `ops`, `ops2`, `ops3`, ... (regex `^(ops|ops[2-9]|ops[1-9][0-9]+)$`). Group `ops` is chunk 1, `opsK` is chunk k. **[fact]** (`core/models.py: GroupName`, `pipeline.py: _group_name`)
- Each node is one operation object. Common fields (`base.py: BaseOpFields`): `op` (the operation name), `id` (`n<digits>`), `meta`, `chartId`. **[fact]**
- `meta` (`base.py: OpsMeta`): `nodeId` (`n<digits>`), `inputs` (list of parent node ids, the dependency edges), `sentenceIndex` (1-based reasoning-chunk order, maps to the group name), `view` (optional render hints), `source` (provenance string such as `recursive_step=2;taskId=o2`). **[fact]**
- `meta.view` (`base.py: OpsMetaView`): `phase` (topological phase number), `parallelGroup` (id like `p1` when several nodes share a phase), plus legacy `splitGroup`, `panelId`, `joinBarrier`. **[fact]**
- **Dependencies are encoded two ways, and both are kept consistent.** Structural edges live in `meta.inputs`. Scalar values from a prior node are referenced inline by the string `"ref:nX"` (never an object `{"id":"nX"}`). At compile time `meta.inputs` is set to the union of the explicit inputs and every `ref:nX` found in the node's fields. **[fact]** (`pipeline.py`, `normalize.py`, `artifacts.py: extract_scalar_ref_deps`)

One short real VIZSPEC node (from `opsspec/debug/05231644_01/90_final_grammar.json`):

```json
{
  "op": "diff",
  "id": "n5",
  "meta": { "nodeId": "n5", "inputs": ["n2", "n4"], "sentenceIndex": 3,
            "view": { "phase": 3 }, "source": "recursive_step=5;taskId=o5" },
  "field": "Fatality rate among plague cases",
  "targetA": "ref:n2", "targetB": "ref:n4", "signed": false
}
```

The full operation vocabulary (18 ops) is the discriminated union in `union.py`, keyed by `op`. The op contract (`op_registry.py`) lists each op's required, optional, and forbidden fields plus semantic rules, and is injected into both prompts and the validators so the grammar is single-sourced. **[fact]**

| `op` | Result kind | Key fields (beyond common) |
| --- | --- | --- |
| `retrieveValue` | scalar / row | `field`, `target`, `group`, `targetAxis` (`x`/`y`) |
| `filter` | row list | `field`, `include`, `exclude`, `operator`, `value`, `group`, `xKindHint` |
| `findExtremum` | scalar | `field`, `group`, `which` (`max`/`min`), `rank` |
| `sort` | row list | `field`, `group`, `order`, `orderField` |
| `nth` | scalar / rows | `field`, `group`, `order`, `orderField`, `n`, `from` |
| `average` | scalar | `field`, `group` |
| `sum` | scalar | `field`, `group` (bar charts only) |
| `count` | scalar | `field`, `group` |
| `diff` | scalar | `field`, `targetA`, `targetB`, `group(A/B)`, `aggregate`, `signed`, `mode`, `percent`, `scale`, `precision` |
| `diffByValue` | row list | `value`, `targetValue`, `field`, `group`, `signed` |
| `lagDiff` | row list | `field`, `group`, `order`, `absolute` |
| `pairDiff` | row list | `by`, `seriesField`, `field`, `groupA`, `groupB`, `absolute`, `precision` (series charts only) |
| `compareBool` | boolean | `field`, `targetA`, `targetB`, `group(A/B)`, `aggregate`, `operator` |
| `add` | scalar | `targetA`, `targetB`, `field`, `group` |
| `scale` | scalar | `target`, `factor`, `field`, `group` |
| `range` | scalar | `field`, `group` |
| `rollingWindow` | row list | `window`, `aggregate`, `field`, `orderField`, `group` |
| `monotonicRun` | row list | `direction`, `strict`, `mode`, `minLength`, `field`, `orderField`, `group` |

Notes: these are **data** operations, not draw directives; visual verbs (`highlight`, `draw`, `split`) are explicitly excluded from the grammar (`recursive_validators.py: _VISUAL_DIRECTIVE_OPS`). The op set is "non-draw" by design (`op_registry.py: LEGACY_NON_DRAW_OPS`). Chart-family gating: `pairDiff` and `sum` are restricted (`pairDiff` to series charts, `sum` to bar charts) by `allowed_chart_families`. **[fact]**

### 3.2 Chart context (the grounding/data representation)

Where defined: `opsspec/core/models.py: ChartContext`, built by `opsspec/runtime/context_builder.py: build_chart_context`. **[fact]**

Fields: `fields`, `dimension_fields`, `measure_fields`, `primary_dimension`, `primary_measure`, `series_field`, `categorical_values` (domain value list per categorical field), `field_types` (`numeric`/`categorical`/`unknown`), `numeric_stats` (`{min,max,mean}` per measure), `mark`, `is_stacked`, `encoding_summary` (per Vega-Lite channel: field, type, title, aggregate, stack). **[fact]**

Role selection heuristic (`_pick_roles`): `primary_dimension` is the categorical x channel, else categorical y, else first categorical field; `primary_measure` is the quantitative y channel, else quantitative x, else first numeric field; `series_field` is the color channel only when it is categorical. Vega-Lite encoding types override data-inferred types (nominal/ordinal/temporal to categorical, quantitative to numeric). This object is the deterministic grounding basis for every LLM call and every validator. **[fact]**

### 3.3 Runtime value (DatumValue) and artifact summary

The executor produces lists of `DatumValue` (`opsspec/core/datum.py`): `category`, `measure`, `target`, `group`, `value` (float), plus `id`, `name`, `lookup_id`, `prev_target`, `series`. A scalar result is one `DatumValue` with `category="result"`; a table result is many rows. **[fact]**

Between steps the executor output is compacted by `artifacts.py: summarize_runtime_values` into an **artifact summary** handed to the next LLM call: `count`, `kind` (`scalar`/`table`/`empty`), `scalarRefOk` (whether the node can be referenced as `ref:nX`), `last` (`{target, group, value}`), `preview` (top-k rows), `targets_preview` (for tables), and `primary_dimension`/`primary_measure`/`series_field`. The compaction keeps the recursive loop stable and reproducible. **[fact]**

### 3.4 Atomic visual operations (the Visualizer's primitive set)

The live renderer is D3 (not Vega-Lite for the overlays). Each operation is drawn by composing **primitives** in `src/operation-new/primitives/`. These are the system's atomic visual operations.

| Primitive (export) | What it draws / does | Key parameters |
| --- | --- | --- |
| `drawReferenceLine` | Horizontal reference line that animates `x1`→`x2`, then a collision-aware label fades in. Used for averages and value thresholds. | `layer, cssClass, x1, x2, y, color?, style?('solid'\|'guideline'), label?, svg?, viewport?, anchorValue?` |
| `drawVerticalReferenceLine` | Vertical reference line `y1`→`y2` at `x`, with a label near the axis side. | `layer, cssClass, x, y1, y2, color?, style?, label?, svg?, viewport?, anchorValue?` |
| `drawVerticalComparisonArrow` | Double-headed vertical arrow spanning `topY..bottomY`, in three phases (ref lines grow, shaft expands, heads + difference label). Used for `diff`. | `layer, cssClass, x, topY, bottomY, color?, label?, svg?, viewport?, refLines?, phaseOnePromises?` |
| `drawDirectionalArrow` | Single-headed arrow from one point to another with endpoint padding and an optional delta label. Used for `lagDiff`. | `layer, cssClass, fromX, fromY, toX, toY, color?, strokeWidth?, label?, svg?, viewport?, targetKey?, prevTargetKey?` |
| `applyMarkSalience` / `restoreMarkSalience` | Smoothly fade marks to in-scope vs out-of-scope opacity (highlight by dimming the rest). | `marks, isInScope, inOpacity?, outOpacity?, duration?` |
| `drawResultBadge` | A single corner text label for scalar/boolean terminal ops (`count`, `compareBool`, `sum`, `add`, `scale`). | `layer, cssClass, text, layout, anchor?, color?, inset?, fontSize?` |
| `applyAnnotationContextFade` | Cross-step lifecycle: fade still-referenced prior annotations to a faint "context" style (text 0.6, anchor lines 0.4, filter line dashed), and fade-and-remove stale ones. | `layer, annotationRecords, filterClass, referencedResultIds?, parent?` |
| `fadeRemoveAnnotations` | Fade a class of annotations to opacity 0 and remove (cross-fade rather than pop). | `scope, cssClass, duration?, parent?` |
| `placeOperationTextLabel` | Collision-aware label placement inside the viewport (re-exported from `operation-next/textPlacement`). | `svg, text, preferred{x,y}, viewport` |
| `playSequencedReveal` / `playChainedReveal` | Orchestrate a multi-stage timed reveal (for example bars, then average lines, then a difference arrow). | `stages[{name, startDelayMs, build}]` |
| `ChartInstance.transitionChartScale` | The core no-flicker rescale: one shared D3 transition drives line, points, and both axes so they never drift apart. | `yDomain?, xDomain?, xLabelDomain?, activeTargets?, outOfScopeOpacity?, duration?, ease?` |

Chart-type-specific primitives also exist for bars/series: `stackComposition`, `transitionLegend`, `sharedTransition`. **[fact]** (file presence and the bar/series appliers; not read line by line)

### 3.5 Optional Python draw plan (secondary, mostly off)

There is a second, optional visual representation produced on the Python side: a **draw plan** (`draw_plan/models.py`, `build_draw_plan.py`). It maps each data op to a coarse draw action and is validated by a `DrawOperation` union: `clear`, `highlight` (`select{mark,keys}`, `style`), `line` (`horizontal-from-y` / `connect` / `connect-panel-scalar`), `text` (normalized `[0,1]` position), `band`, `sum`, `scalar-panel`, and `stacked/grouped-filter-groups`. The documented op-to-action mapping (`docs/draw_operations_reference.md`, section 8.1): selection ops (`retrieveValue`, `filter`, `findExtremum`, `nth`, `lagDiff`, `pairDiff`) to `highlight`; scalar ops (`average`, `count`, `compareBool`, `add`, `scale`) to `line + text`; `diff` to `line(connect)` or, for scalar-only refs, a two-step `scalar-panel`; scoped series ops to group-filter pre/post wrappers. **[fact]**

Important: this draw plan is gated by `DRAW_PLAN_MODE` which defaults to `off` (`pipeline.py: _resolve_draw_plan_mode`), and the live `/generate_grammar` response carries only the VIZSPEC group map and `text_chunks`. The TypeScript Visualizer consumes the VIZSPEC directly and decides annotations per op in its appliers; it does not read this Python draw plan. **[fact]** (`runChartOps.ts`, `nlp_server/CLAUDE.md`) The draw plan is best described in the paper as an alternative/auxiliary compilation rather than the live rendering path. **[inference]**

---

## 4. Specification Generator

The orchestrator is `OpsSpecPipeline.generate` (`opsspec/modules/pipeline.py`). It maintains three states updated each iteration (named in `paper_grammar.md`): `S(O)` remaining tasks, `C` executed artifacts, `G` the confirmed VIZSPEC graph. The pipeline calls the LLM exactly twice per "shape": once for Extract (Inventory) and once per recursive step for Compose (Step-Compose); all other stages are deterministic. **[fact]**

The four conceptual steps in the request map onto the code as: Extract = Inventory; Ground = chart context build + op contract + the deterministic `ground_op_spec` normalization; Compose = the recursive Step-Compose + execute loop; Validate and Compile = per-step validation plus the final normalize and schedule. The build of the chart context happens once up front and is the basis of grounding for all later steps. **[fact]**

LLM client (`opsspec/core/llm.py: StructuredLLMClient`): default backend is the OpenAI HTTP API with model string `gpt-5.4-mini` (overridable via `OPENAI_MODEL`); alternative backends are `instructor`-wrapped OpenAI and Ollama-native. All calls use `temperature=0, top_p=1` and request a JSON object (`response_format: json_object` for OpenAI), then validate the parsed JSON with a Pydantic response model. Determinism is a stated goal (`paper_grammar.md` section 8): temperature 0, strict schema/contract validation, stable `n1..nN` ids, deterministic grounding. **[fact]**

### 4.1 Extract (Inventory)

- Input: `question`, `explanation`, the chart context, the role summary and series domain, a rows preview, and the injected op contract `ops_contract_json`; plus typed retry feedback on a failed prior attempt. **[fact]** (`module_inventory.py: render_inventory_prompt`)
- Output: `OpInventory` = `{ tasks: [...], warnings: [] }`. Each task (`core/recursive_models.py: OpTask`): `taskId` (`o<digits>`, unique), `op` (must be in `allowed_ops`), `sentenceIndex` (>=1, the reasoning-chunk order), `mention` (a short quote of the chunk), `paramsHint` (a flat dict of scalars or scalar lists). **[fact]**
- What it does: the prompt asks the model to first segment the explanation into meaningful reasoning chunks (a chunk may be shorter than, equal to, or span multiple sentences), then to extract only the operation-bearing acts, sparsely (rhetorical or interpretive spans get no task). It returns the minimal task set, not a full plan; intermediate ops are deferred to Compose. **[fact]** (`prompts/opsspec_inventory.md`)
- Design rationale: extraction is deliberately split from composition so the model never has to emit a whole correct graph at once. The prompt explicitly forbids anticipating future ops across chunks ("Inventory must not pre-compose"), which keeps each task local and auditable. A long "phrase mapping" table grounds natural-language phrasings in the op vocabulary (for example "average line" to `average`, "second highest" to `findExtremum` with `rank=2`, "from year A to year B" to `filter` with `operator=between`, "percent change" to `diff` with `percent=true`). This is where G1 (decompose into simple steps grounded in familiar chart conventions) is realized in the generator. **[fact]**
- Edge cases / validation: `validate_inventory` (`recursive_validators.py`) enforces `taskId` format and uniqueness, `op` in `allowed_ops`, no visual-directive ops (`highlight`, `draw`, `split`, `align`, `reference_line`, also caught by keyword in the mention), flat `paramsHint`, and the single-group rule (`average`, `count`, `findExtremum`, `sort`, `retrieveValue`, `lagDiff`, `nth` may use `group` only as a single series value). Series restriction must never be a filter on the series field (a hard rule repeated in the prompt and the shared rules). A separate check warns when question and explanation disagree on a numeric range (`module_inventory.py: _build_range_mismatch_warning`). **[fact]**
- Example fragment (request `0s6zi9dyw22qo4rp`): the chunk "calculate the average of sep 1896 until dec 1896" yields two tasks, `o1 filter(field="Month/Year", include=[Sep..Dec 1896])` and `o2 average(field="Fatality rate among plague cases")`, realizing the subset-then-aggregate pattern; the chunk "compare the two averages" yields `o5 diff(targetA="ref:n2", targetB="ref:n4", signed=false)`. **[fact]**

### 4.2 Ground

Grounding has two parts: the deterministic chart context built once (section 3.2), and the per-op normalization `ground_op_spec` (`opsspec/runtime/grounding.py`) applied to each composed op before validation. **[fact]**

- Input: a raw `op_spec` dict from Step-Compose plus the chart context. Output: the same op with role tokens and domain values resolved, plus warnings. **[fact]**
- What it does: replaces role tokens `@primary_measure`, `@primary_dimension`, `@series_field` with real field names; normalizes field-name casing against `chart_context.fields`; and resolves domain values to real labels (`group`/`groupA`/`groupB` against the series domain, `include`/`exclude` against the field's categorical domain, `target`/`targetA`/`targetB` against the primary-dimension domain) using exact, then case-insensitive, then fuzzy match (`difflib` cutoff 0.8). `ref:nX` strings are passed through untouched. **[fact]**
- Design rationale: the LLM is allowed to emit stable role tokens and approximate labels, and grounding pins them to the chart deterministically, so the same input yields the same grounded op (`paper_specification_generator.md` section 2.3, `paper_grammar.md` section 3.4). The op contract `build_ops_contract_for_prompt` injected into the prompt is the other half of grounding: it tells the model exactly which ops and fields are legal for this chart family. **[fact]**

### 4.3 Compose (Step-Compose, recursive)

This is the recursive loop in `pipeline.py` (bounded by `RECURSIVE_MAX_STEPS`, default 25). **[fact]**

- Per step input: the deterministically selected current task, the remaining tasks `S(O)`, the available executed nodes with their artifact summaries, chart context, rows preview, the op contract, and retry feedback. **[fact]** (`module_step_compose.py`)
- Per step output: `StepComposeOutput` = `{ pickTaskId?, op_spec, inputs, warnings }`. The model returns exactly one `op_spec` (top-level op fields, no `id`/`meta`/`chartId`) and an `inputs` list of existing node ids. **[fact]**
- What it does, important nuance: **task selection is deterministic in the pipeline, not by the LLM.** `_select_next_task` picks the ready task (one whose `ref:nX` dependencies are all executed) with the smallest `taskId`, falling back to the smallest id. The selected task is handed to Step-Compose, whose only job is to compose the single op for it; `pickTaskId` is treated as legacy and ignored. The pipeline then assigns the id `n<k>` deterministically, builds `meta` (nodeId, inputs = explicit inputs union scalar refs, sentenceIndex, source), parses it into a typed `OperationSpec`, validates it, and executes it once. **[fact]** (`pipeline.py`, `module_step_compose.py`)
- Execution and artifact growth: `OpsSpecExecutor.execute` runs the single op against `data_rows` to produce `DatumValue`s; the pipeline reads `executor.runtime[nodeId]`, summarizes it (`summarize_runtime_values`), stores the artifact for later steps, removes the task from `S(O)`, and appends the node to the graph. Unknown ops fail fast (`NotImplementedError`), so a missing op surfaces immediately (`nlp_server/CLAUDE.md` section 4.3). A NaN result (empty slice / bad group) adds a warning. **[fact]**
- Design rationale: composing one ready node at a time keeps each LLM call small and checkable and lets the graph grow stably (`paper_grammar.md` section 3.3). Determinism is preserved by moving id/meta assignment and task selection out of the LLM. **[fact]**
- Validation: `validate_step_compose_output` (`recursive_validators.py`) checks the op matches the selected task, no forbidden keys (`id`/`meta`/`chartId`), fields obey the contract (required/optional/forbidden), scalar refs are `ref:nX` strings only (object refs rejected via `contains_object_ref`), and `inputs` reference existing nodes; `validate_operation` (`validators.py`) then applies per-op semantic checks (for example filter mode exclusivity: exactly one of membership / comparison / group-only). **[fact]**
- Example fragment: step 2 selects `o2`, Step-Compose returns `op_spec={op:"average", field:"Fatality rate among plague cases"}` with `inputs=["n1"]` (the filter result becomes the average's data parent); the pipeline assigns `n2`, executes it, and records the scalar artifact `0.613125`. **[fact]**

### 4.4 Validate and Compile

After the loop, two deterministic passes finalize the graph. **[fact]**

- Normalize (`runtime/normalize.py: normalize_meta_inputs`): for each node, `meta.inputs` is recomputed as the union of explicit inputs and `ref:nX` dependencies, with self-refs removed, deduped and sorted; node ids are never rewritten (stable ids are a stated invariant). Nodes are ordered by numeric id within each group. **[fact]**
- Schedule (`runtime/scheduler.py: schedule_ops_spec`): builds the dependency edges from `meta.nodeId`/`meta.inputs`, computes a topological **phase** per node, and writes `meta.view.phase` (and `parallelGroup = pK` when a phase has several nodes). This is the explicit realization of G3 (order steps by the dependency structure): nodes with no dependencies land in phase 1, a node depending on them lands in a later phase. **[fact]**
- Compile output: `GenerateOpsSpecResponse` with `ops_spec` (the group map), `chart_context`, `text_chunks` (one explanation chunk per group, built from task mentions), and `warnings`. A debug bundle (`opsspec/debug/<MMddhhmm>/`) is always written with per-step JSON, a Graphviz DOT of the graph, and a trace markdown, for reproducibility. **[fact]**
- Example fragment (final): groups `ops`=[n1 filter, n2 average], `ops2`=[n3 filter, n4 average], `ops3`=[n5 diff]; the scheduler puts n1,n3 in phase 1 (`p1`), n2,n4 in phase 2 (`p2`), n5 in phase 3; `text_chunks` = the three numbered sentences. **[fact]**

---

## 5. Explanation Visualizer

The Visualizer is `src/operation-new/`. The dispatcher `runChartOps` (`src/operation-next/runChartOps.ts`) routes by chart type to a runner; all five chart types (simple bar, stacked bar, grouped bar, simple line, multi line) now route into `operation-new` runners. **[fact]** This review documents the simple-line path in depth (the requested focus); the others follow the same applier/primitive pattern.

Inferred decomposition into conceptual steps (the Visualizer's steps are not named in the code; this is a code-grounded decomposition):

### Step V1: Dispatch and prepare the stateful chart instance

- Modules: `runChartOps.ts`, `rendering-new/instances/simpleLineInstance.ts`, `rendering-new/chartInstance.ts`.
- Input: the chart `spec`, the VIZSPEC `opsSpec` group map, and `options` (which may carry a prior `initialChainState` and `runtimeSnapshot` for continuation). Output: a built `SimpleLineChartInstance` and an initialized runtime result store. **[fact]**
- What it does: `runChartOps` initializes the runtime store (restoring a prior snapshot or resetting), resolves the chart type, normalizes the ops groups, and collects every `ref:nX` referenced id so appliers know which prior results must be kept. The runner then calls `ensureSimpleLineChartInstance`, which builds the chart **once** and is idempotent: `ensureRendered` compares a `specKey` derived from the data source and no-ops when the spec is unchanged. The instance owns the SVG, the `skeleton` group, a dedicated `annotationLayer` group appended on top of the skeleton, the x/y scales, the line path and point marks, and a `transitionChartScale` method. **[fact]**
- Design rationale: a single stateful instance with an idempotent build is what lets repeated op calls reuse the same axes and marks rather than rebuilding (no flicker). The annotation layer is created once and never re-appended, so annotation mutations never touch the chart skeleton. This is the structural answer to the two-component mismatch that earlier attempts could not resolve (`CLAUDE.md`, "이전 시도와 한계"). **[fact]**

### Step V2: Sequence the graph into ordered steps and thread state

- Modules: `runSimpleLine.ts`, `operation-next/chainState.ts`, `operation-next/executionState.ts`.
- Input: the VIZSPEC groups; an initial **ChainState**. Output: per op, a recomputed `DatumValue[]` result and an updated ChainState; finally an `OperationNextRunOutcome`. **[fact]**
- What it does: the runner walks groups in order (`ops`, then `ops2`, ...), and within a group walks ops in order. At each group boundary it calls `clearGroupBoundary`. For each op it resolves the op's input data with `stateWithOperationDependencies`, dispatches to the applier whose `op` matches (unknown ops are skipped), threads the returned `nextState` forward, and stores the result under the node id so later `ref:nX` lookups resolve. **[fact]**
- How the operation graph becomes a sequence: the order is exactly the VIZSPEC group order then in-group node order (`ops`, `ops2`, ...), which mirrors the generator's reasoning-chunk order and, through `meta.inputs`, the dependency structure. So G3 is honored on the rendering side as well: a node's input data is pulled from the runtime results of its `meta.inputs` parents. **[fact]**

### Step V3: Render each op as an atomic annotation (the appliers)

- Modules: `operation-new/appliers/simpleLine/<op>.ts`, `operation-new/primitives/*.ts`.
- Input per op: an `ApplierArgs` (`operation`, `operationIndex`, `state`, `instance`, `options`, and optional group lookahead). Output: an `ApplierResult` `{ result, nextState }`. The applier interface is `{ op, apply(args) }`; appliers are looked up in a registry keyed by op (`applier.ts`). **[fact]**
- What it does: each applier recomputes its value from `state.workingData`, clears or fades prior annotations of its class, draws its primitives onto the annotation layer with transitions, and returns the next ChainState (appending an `AnnotationRecord`). The op-to-primitive mapping for simple line:

| Op | Primitives used | Visual result |
| --- | --- | --- |
| `retrieveValue` | point highlight (red, r=6) + value label; reverse lookup adds `drawVerticalReferenceLine` + category label | the looked-up point is marked and labeled |
| `filter` | value-based: threshold `drawReferenceLine` + red point highlight, no rescale; categorical: 3-phase dim then `transitionChartScale` rescale + `transitionPersistentRefLines` | the chart narrows smoothly to the kept subset, or matching points turn red |
| `average` | `drawReferenceLine` (horizontal) + label "Average: X" or "Avg (filtered): X" | a horizontal line at the mean with its value |
| `diff` | `drawVerticalComparisonArrow` between two endpoints (point marks or prior average lines) + "Difference: X" | a double-headed arrow connecting the two compared values |
| `findExtremum` | point highlight + value label; over derived data it strengthens the winning arrow and dims the rest | the extreme point or arrow is emphasized |
| `lagDiff` | `drawDirectionalArrow` per adjacent pair (blue) + signed delta labels + endpoint highlight; sets `derivedData` | arrows between consecutive points with their deltas |
| `count`, `compareBool`, `sum` | `drawResultBadge` (corner text) | a single value/boolean badge |

The simple-line runner registers exactly 12 appliers (`retrieveValue`, `filter`, `diff`, `average`, `findExtremum`, `lagDiff`, `count`, `compareBool`, `sum`, `nth`, `sort`, `diffByValue`); an op with no registered applier is skipped. `add` and `scale` are documented users of `drawResultBadge` in the primitive's comment but are not registered on the simple-line path, so on a simple-line chart they would currently be no-ops. (`sort`, `nth`, `diffByValue` follow the same pattern; `diffByValue` draws per-row connectors carrying `data-target` so a following `findExtremum` can rank over them.) **[fact]** for the registry and the rows read; **[inference]** for `sort`/`nth` exact visuals, not read line by line.

- Design rationale: every op renders as a familiar chart convention (a reference line for a mean, a highlighted mark for a selection, a double-headed arrow for a difference, a corner badge for a scalar), which is G1 on the rendering side, and each draws a value label directly on the overlay, which is half of G2. **[fact]**

### Step-to-step state, and text/overlay synchronization

ChainState (`operation-next/chainState.ts`) is the user-visible step-to-step state. In plain terms it carries: the full dataset (`originalData`, never changed); the **currently active subset** of the chart (`workingData`, replaced by a filter); any **synthetic series** a compute op produced (`derivedData`, for example lagDiff deltas); the **most recent result** (`lastResult`); **which marks are currently highlighted or dimmed** (`salienceMap`, target to opacity); the **annotations currently on the chart and their roles** (`annotationRecords`, each tagged anchor/result/label and whether it persists); whether the **y-axis has been rescaled** and to what domain (`scaleState`); and the **current filtered scope** (`filterContext`). **[fact]**

State transitions:

- Cross-op data flow: `stateWithOperationDependencies` reads `meta.inputs`, separates scalar `ref:` inputs (thresholds, which do not replace data) from data inputs, and sets `workingData` to the stored rows of the data-parent node. So a prior step's result literally becomes the next op's input dataset, matching the VIZSPEC edges. **[fact]** (`executionState.ts`)
- Group boundary: `clearGroupBoundary` keeps `originalData`, `workingData`, and `filterContext` (so a later sentence still operates on the filtered scope) but resets `derivedData`, `lastResult`, `salienceMap`, `annotationRecords`, and `scaleState` (so each sentence starts with a clean overlay). **[fact]**
- Attention management: before drawing, an applier calls `applyAnnotationContextFade`, which fades still-referenced prior annotations to a faint context style (text to 0.6, anchor lines to 0.4, the filter threshold to dashed) and fades-and-removes stale ones (those whose result id no longer appears in `referencedResultIds`). The current step is drawn at full salience over those faded anchors. This is the other half of G2: prior steps remain as faint context while the current step stands out. **[fact]**
- Continuity across separate calls: when the workbench replays one sentence per `runChartOps` call, the runner serializes ChainState into the `continuation` and the runtime results into `runtimeSnapshot`, and restores them on the next call, so a `diff` in `ops3` can still find the two averages from `ops` and `ops2`. **[fact]**

Text and chart synchronization: the generator returns `text_chunks` keyed by the same group names as the VIZSPEC (`ops`, `ops2`, ...), one explanation sentence per group. The Visualizer runs one group at a time, so the textual cue for group `opsK` is the sentence shown while that group's annotations are drawn. The shared group key is the synchronization mechanism between the explanation sentence and the overlay. On the chart itself, each annotation carries its own value as a text label (the reference-line label, the difference label, the result badge), so the number being explained is co-located with the mark. **[fact]** for the data contract; the exact moment-to-moment display is handled by the workbench player in `web/` (not in the two focus directories). **[inference]**

Rendering path: D3 throughout for both the chart skeleton and the overlays (`simpleLineInstance.ts` builds scales, axes, line, and points with D3; the SVG carries `data-render-epoch`, `data-m-left`, `data-m-top`, `data-plot-w`, `data-plot-h`, `data-x-field`, `data-y-field`, and point marks carry `data-target`/`data-id`/`data-value`). Vega-Lite is the input spec format only; it is resolved to an encoding and rendered by D3, not by Vega. The no-flicker invariant is implemented by `transitionChartScale`, which mutates the scales synchronously and rides one parent D3 transition for the line, points, and both axes, so ticks and marks share identical timing every frame. **[fact]**

---

## 6. End-to-end worked example

Source: debug bundle `nlp_server/opsspec/debug/05231644_01`, request id `test_0s6zi9dyw22qo4rp_4ff7fe0c`. This is the canonical compositional case (two filtered averages, then their difference). The bundle's chart is the simple-bar twin; the simple-line case is structurally identical, and the visual-step description below is taken from the simple-line appliers. **[fact]** for the generation; **[fact]** for the applier behavior, **[inference]** that this exact request would render with the line appliers since the bundle is the bar twin.

Input:

- Question: "What is the difference between the average of September 1896 until December 1896 and the average of January 1897 until April 1897?"
- Explanation: "1. calculate the average of sep 1896 until dec 1896 / 2. calculate the average of jan 1897 until april 1897 / 3. compare the two averages".
- Chart: x `Month/Year` (nominal), y `Fatality rate among plague cases` (quantitative), monthly values 1896 to 1897.

Chart context (built deterministically): `primary_dimension="Month/Year"`, `primary_measure="Fatality rate among plague cases"`, `series_field=null`, numeric stats `min 0.3846 / max 0.8164 / mean 0.61986`.

Extract (Inventory), 5 tasks: `o1 filter(include=[Sep..Dec 1896])`, `o2 average`, `o3 filter(include=[Jan..Apr 1897])`, `o4 average`, `o5 diff(targetA=ref:n2, targetB=ref:n4, signed=false)`. The month ranges were pre-resolved into explicit `include` lists from the rows preview (the inventory's data-resolution rule), and each "average of months" chunk produced a filter plus an average.

Compose loop, 5 steps (deterministic selection by readiness then smallest id):

1. `o1` to `n1` filter, group `ops`, artifact table of 4 rows.
2. `o2` to `n2` average, group `ops`, `inputs=[n1]`, artifact scalar `0.613125`.
3. `o3` to `n3` filter, group `ops2`, artifact table of 4 rows.
4. `o4` to `n4` average, group `ops2`, `inputs=[n3]`, artifact scalar `0.686625`.
5. `o5` to `n5` diff, group `ops3`, `inputs=[n2,n4]`, scalar refs `n2,n4`, artifact scalar `0.0735`.

Compile (final VIZSPEC):

```json
{
  "ops":  [ {"op":"filter","id":"n1","meta":{"nodeId":"n1","inputs":[],"sentenceIndex":1,"view":{"phase":1,"parallelGroup":"p1"}},"field":"Month/Year","include":["Sep 1896","Oct 1896","Nov 1896","Dec 1896"]},
            {"op":"average","id":"n2","meta":{"nodeId":"n2","inputs":["n1"],"sentenceIndex":1,"view":{"phase":2,"parallelGroup":"p2"}},"field":"Fatality rate among plague cases"} ],
  "ops2": [ {"op":"filter","id":"n3","meta":{"nodeId":"n3","inputs":[],"sentenceIndex":2,"view":{"phase":1,"parallelGroup":"p1"}},"field":"Month/Year","include":["Jan 1897","Feb 1897","Mar 1897","Apr 1897"]},
            {"op":"average","id":"n4","meta":{"nodeId":"n4","inputs":["n3"],"sentenceIndex":2,"view":{"phase":2,"parallelGroup":"p2"}},"field":"Fatality rate among plague cases"} ],
  "ops3": [ {"op":"diff","id":"n5","meta":{"nodeId":"n5","inputs":["n2","n4"],"sentenceIndex":3,"view":{"phase":3}},"field":"Fatality rate among plague cases","targetA":"ref:n2","targetB":"ref:n4","signed":false} ]
}
```

with `text_chunks = { ops: "calculate the average of sep 1896 until dec 1896", ops2: "calculate the average of jan 1897 until april 1897", ops3: "compare the two averages" }`.

Visualize (simple-line rendering of this VIZSPEC):

- Group `ops` (sentence 1 shown): `n1 filter` narrows the chart smoothly to the four 1896 months (`transitionChartScale`); `n2 average` draws a horizontal reference line at 0.613 labeled "Avg (filtered): 0.61".
- Group `ops2` (sentence 2 shown): the group boundary resets the overlay but keeps the `n2` line as a faint context anchor (it is referenced by `n5`); `n3 filter` narrows to the four 1897 months; `n4 average` draws a reference line at 0.687.
- Group `ops3` (sentence 3 shown): `n5 diff` draws a double-headed vertical arrow between the two average reference lines (0.613 and 0.687) labeled "Difference: 0.07".

The flicker-free axis narrowing, the fade-to-context of the prior average, and the connecting arrow correspond to G1 (familiar conventions), G2 (text plus salient annotation), and G3 (the diff is last because it depends on the two averages).

---

## 7. Suggested figures and tables

1. **System overview figure.** Two boxes (Specification Generator, Explanation Visualizer) with the VIZSPEC group map + text_chunks flowing between them; inside the generator show the recurrence `(S, C, G)` with the single LLM-composed node per step and the deterministic ground/validate/execute ring; inside the visualizer show the per-group loop over appliers writing to the annotation layer.
2. **VIZSPEC example object.** The `n5 diff` node from section 3.1, annotated to point out `meta.inputs` (edges) versus `ref:nX` (scalar reference) and `meta.view.phase` (schedule).
3. **Atomic visual operations table.** The primitive table from section 3.4 (operation, what it draws, key parameters), optionally paired with a small thumbnail of each annotation.
4. **Op grammar table.** The 18-op table from section 3.1 (op, result kind, key fields), useful as the grammar reference.
5. **Step-by-step visualization sequence.** A filmstrip of the worked example: filtered chart, average line, second filtered chart, second average line, difference arrow, each frame captioned with its explanation sentence.
6. **Chart-context schema box.** The `ChartContext` fields (section 3.2) as the grounding representation.
7. **Pipeline trace.** The Graphviz DOT the backend already emits (`91_tree_ops_spec.dot`) makes a clean dependency-graph figure with phase coloring.

---

## 8. Suggested section outline for the paper

- **System overview.** Input, output, the two components, the VIZSPEC as the contract between them (section 2). Introduce G1 to G3 here.
- **VIZSPEC: an operation graph.** Nodes, edges (`meta.inputs`), scalar refs (`ref:nX`), groups as reasoning chunks, the 18-op vocabulary, the chart context (section 3). Connect G3 to the dependency edges.
- **Specification Generator.**
  - Chart context and op contract (grounding basis).
  - Extract (Inventory): chunking and the phrase-to-op mapping. Connect G1.
  - Compose (recursive Step-Compose + execute): one node at a time, deterministic selection and id assignment.
  - Ground and Validate: token/value normalization, contract and semantic checks, typed retry.
  - Compile: normalize edges, topological schedule. Connect G3.
- **Explanation Visualizer.**
  - Stateful chart instance and the no-flicker rescale.
  - Sequencing the graph and threading ChainState; cross-op data via `ref`/`inputs`. Connect G3.
  - Atomic visual operations and the op-to-annotation mapping. Connect G1.
  - Attention management: text cues per group plus context fade and salience. Connect G2.
- **Worked example** (section 6).
- **Design choices and reproducibility.** Temperature 0, strict validation, stable ids, deterministic grounding, debug bundles.

---

## 9. Open questions for the authors

1. **System name.** The repository has no product name (package name `prj-vis-exp`, window title `prj-vis-exp`). The IR is consistently `VIZSPEC`/`OpsSpec`. The authors must choose the system name that this review left as the placeholder "VisExplain". **[fact]** that no name exists in code.
2. **Which visual representation to present.** There are two: the live TypeScript `operation-new` primitives (what actually draws) and the optional Python `draw_plan` (`DrawOperation` union), which is `DRAW_PLAN_MODE=off` by default and not consumed by the frontend. The paper should be explicit that the atomic visual operations are the `operation-new` primitives and that the draw plan is auxiliary, or explain why both exist. The reason for keeping both is not stated in code. **[fact]** for the default-off; **[inference]** that the draw plan is legacy/auxiliary.
3. **`sentenceIndex` naming.** The field is documented as legacy and actually encodes reasoning-chunk order, not sentence order (`recursive_models.py`, prompts). The paper should use "reasoning chunk" to avoid implying one task per sentence. **[fact]**
4. **Default LLM and determinism claims.** The default model string is `gpt-5.4-mini` (`core/llm.py`). The authors should confirm the exact model used for the paper's results, and note that "determinism" here means temperature 0 plus strict validation and deterministic post-processing, not a formal guarantee from the model. **[fact]** for the code defaults.
5. **Phase/parallelGroup hints are computed but lightly used.** The scheduler writes `meta.view.phase`/`parallelGroup`, but `docs/draw_operations_reference.md` section 8.4 says draw generation does not use these hints for decisions, and the live appliers key off op semantics and chain state rather than `view`. The authors should state whether phase hints drive any rendering parallelism or are trace-only. This is an apparent partial-use that the paper should clarify. **[fact]**
6. **Duplicate ` 2.ts` / ` 2.py` files.** `src/operation-new/` and some backend folders contain macOS-style copies (for example `runSimpleLine 2.ts`, `applier 2.ts`). They are not imported by the live code (the runners import `./applier`, `./runSimpleLine`, etc.). They appear to be backup artifacts and should be removed before release to avoid confusion. **[fact]** that they are not imported on the paths read; **[inference]** that they are stale copies.
7. **Reported scope versus actual scope.** `nlp_server/CLAUDE.md` and the branch notes describe `operation-new` as a simple-line rewrite running alongside the old engine, but `runChartOps.ts` now routes all five chart types into `operation-new`. The authors should confirm the migration status before describing the engine's coverage. **[fact]**
8. **A `compare` op shim and an `Average` data row.** `specs/compare.py` keeps a deprecated permissive `CompareOp` (not in the union, kept for legacy tests); and the worked example's chart data contains a literal `Average` category in `Month/Year`. Neither affects the live grammar, but the paper's examples should avoid datasets whose domain includes summary rows. **[fact]**
9. **Rationale gaps.** The code does not state the reasons behind several specific choices: the `difflib` fuzzy cutoff of 0.8 for domain matching, the artifact preview size (default 5), `RECURSIVE_MAX_STEPS=25` and `RECURSIVE_MAX_RETRIES=3`, the specific opacity/duration constants for context fade and rescale, and the exact set of annotation colors. These are parameter choices the authors must justify or cite from their design process; they are not documented in code or comments. **[fact]** that the values exist; the reasons are not in the repo.
