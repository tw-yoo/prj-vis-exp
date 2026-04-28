# Operation Next Architecture

`operation-next` separates computation order from visualization description. The runtime still accepts the existing operation list format, then adds a tree and frame layer around it so compositional explanations can be planned without chart-specific annotation rewrites.

## Layers

1. Operation tree

   `operationTree.ts` converts a linear `OperationSpec[]` into `OperationNode[]` with explicit input edges. The adapter keeps the old list execution path compatible while making dependencies such as `ref:n1` available to planning code.

2. Execution engine

   Existing runners execute operations and maintain `ChainState`. Each operation now has a current and previous `VisualizationFrame` so annotation state can be compared across steps.

3. Visualization planner

   `visualizationPlanner.ts` maps operation nodes, result metadata, chart type, and `TensionPolicy` into frame descriptions. Frames carry phase tags, axes, salience state, synthetic overlays, and primitive calls.

4. Frame renderer

   `frameRenderer.ts` diffs primitive calls by `semanticKey`. Identical calls are skipped, updated calls transition in place when supported, and removed calls are cleared through the primitive implementation.

## Policy Surface

`tensionPolicy.ts` exposes the study tensions as explicit runtime policy:

- salience strategy: dim, remove, or grayscale
- annotation strategy: in-place or derive-chart
- arrow placement: right-edge or inline
- density mode: all, derive-chart, or selective
- rescale after isolation: enabled or disabled

The default policy is chosen to preserve the current prototype behavior while making each decision inspectable and overridable by future study conditions.
