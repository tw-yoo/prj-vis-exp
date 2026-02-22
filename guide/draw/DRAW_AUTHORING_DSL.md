# Draw/Data Authoring DSL

Generated at: `2026-02-19T09:07:26.632Z`
Signature source: `typescript-ast-fallback`

Source:
- `src/renderer/ops/authoring/draw.ts`
- `src/renderer/ops/authoring/data.ts`
- `src/renderer/draw/supportMatrix.ts`

## Core Rules
- Authoring code should use positional DSL functions.
- Avoid object-literal calls like `drawOps.*({ ... })` and `dataOps.*({ ... })`.
- Use helper builders (`draw.*`) for nested spec composition.

## ops.draw API

| API | Signature | Description |
| --- | --- | --- |
| `ops.draw.highlight` | `highlight(chartId?: string, select?: SelectBuilder, color?: string, opacity?: number) => DrawOp` | - |
| `ops.draw.dim` | `dim(chartId?: string, select?: SelectBuilder, color?: string, opacity?: number) => DrawOp` | - |
| `ops.draw.clear` | `clear(chartId?: string) => DrawOp` | - |
| `ops.draw.sleep` | `sleep(seconds: number, chartId?: string) => DrawOp` | - |
| `ops.draw.line` | `line(chartId: string | undefined, lineSpec: DrawLineSpec) => DrawOp` | - |
| `ops.draw.rect` | `rect(chartId: string | undefined, rectSpec: DrawRectSpec) => DrawOp` | - |
| `ops.draw.text` | `text(chartId: string | undefined, select: SelectBuilder | undefined, textSpec: DrawTextSpec) => DrawOp` | - |
| `ops.draw.barSegment` | `barSegment(chartId: string | undefined, selectKeys: Array<string | number>, segmentSpec: DrawBarSegmentSpec) => DrawOp` | - |
| `ops.draw.filter` | `filter(chartId: string | undefined, filterSpec: DrawFilterSpec) => DrawOp` | - |
| `ops.draw.sort` | `sort(chartId: string | undefined, by?: DrawSortSpec['by'], order?: DrawSortSpec['order']) => DrawOp` | - |
| `ops.draw.split` | `split(chartId: string | undefined, splitSpec: DrawSplitSpec) => DrawOp` | - |
| `ops.draw.unsplit` | `unsplit(chartId?: string) => DrawOp` | - |
| `ops.draw.lineTrace` | `lineTrace(chartId?: string, select?: SelectBuilder) => DrawOp` | - |
| `ops.draw.lineToBar` | `lineToBar(chartId?: string) => DrawOp` | - |
| `ops.draw.sum` | `sum(chartId: string | undefined, sumSpec: DrawSumSpec) => DrawOp` | - |
| `ops.draw.stackedToGrouped` | `stackedToGrouped(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec) => DrawOp` | - |
| `ops.draw.groupedToStacked` | `groupedToStacked(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpec) => DrawOp` | - |
| `ops.draw.stackedFilterGroups` | `stackedFilterGroups(chartId: string | undefined, groups: Array<string | number>, mode: GroupFilterMode) => DrawOp` | - |
| `ops.draw.groupedFilterGroups` | `groupedFilterGroups(chartId: string | undefined, groups: Array<string | number>, mode: GroupFilterMode) => DrawOp` | - |

## draw Helper API

| Helper | Signature | Description |
| --- | --- | --- |
| `draw.select.keys` | `keys(keys: Array<string | number>) => DrawSelect` | - |
| `draw.select.markKeys` | `markKeys(mark: DrawMark, keys: Array<string | number>) => DrawSelect` | - |
| `draw.style.line` | `line(stroke: string, strokeWidth?: number, opacity?: number) => LineStyleArgs` | - |
| `draw.style.segment` | `segment(fill: string, stroke?: string, strokeWidth?: number, opacity?: number) => SegmentStyleArgs` | - |
| `draw.style.rect` | `rect(fill: string, opacity?: number, stroke?: string, strokeWidth?: number) => RectStyleArgs` | - |
| `draw.style.text` | `text(color: string, fontSize?: number, fontWeight?: string | number, fontFamily?: string, opacity?: number) => TextStyleArgs` | - |
| `draw.style.arrow` | `arrow(stroke?: string, fill?: string, strokeWidth?: number, opacity?: number) => ArrowStyleArgs` | - |
| `draw.arrow.both` | `both(length?: number, width?: number, style?: ArrowStyleArgs) => DrawArrowSpec` | - |
| `draw.arrow.startOnly` | `startOnly(length?: number, width?: number, style?: ArrowStyleArgs) => DrawArrowSpec` | - |
| `draw.arrow.endOnly` | `endOnly(length?: number, width?: number, style?: ArrowStyleArgs) => DrawArrowSpec` | - |
| `draw.lineSpec.horizontalFromY` | `horizontalFromY(y: number, style?: LineStyleArgs, arrow?: DrawArrowSpec) => DrawLineSpec` | - |
| `draw.lineSpec.connect` | `connect(startX: string | number, endX: string | number, style?: LineStyleArgs, arrow?: DrawArrowSpec) => DrawLineSpec` | - |
| `draw.lineSpec.angle` | `angle(axisX: string | number, axisY: number, angleDeg: number, length: number, style?: LineStyleArgs, arrow?: DrawArrowSpec) => DrawLineSpec` | - |
| `draw.rectSpec.normalized` | `normalized(centerX: number, centerY: number, width: number, height: number, style?: RectStyleArgs) => DrawRectSpec` | - |
| `draw.rectSpec.axisX` | `axisX(xLabel: string | number, style?: RectStyleArgs) => DrawRectSpec` | - |
| `draw.rectSpec.axisY` | `axisY(y: number, style?: RectStyleArgs) => DrawRectSpec` | - |
| `draw.rectSpec.dataPoint` | `dataPoint(xLabel: string | number, width: number, height: number, style?: RectStyleArgs) => DrawRectSpec` | - |
| `draw.textSpec.anchor` | `anchor(value: string | Record<string, string>, textStyle?: TextStyleArgs, offsetX?: number, offsetY?: number) => DrawTextSpec` | - |
| `draw.textSpec.normalized` | `normalized(value: string | Record<string, string>, x: number, y: number, textStyle?: TextStyleArgs, offsetX?: number, offsetY?: number) => DrawTextSpec` | - |
| `draw.segmentSpec.threshold` | `threshold(threshold: number, when?: DrawComparisonToken, style?: SegmentStyleArgs) => DrawBarSegmentSpec` | - |
| `draw.filterSpec.xInclude` | `xInclude(labels: Array<string | number>) => DrawFilterSpec` | - |
| `draw.filterSpec.xExclude` | `xExclude(labels: Array<string | number>) => DrawFilterSpec` | - |
| `draw.filterSpec.y` | `y(op: DrawComparisonToken, value: number) => DrawFilterSpec` | - |
| `draw.splitSpec.two` | `two(groupAId: string, groupAKeys: Array<string | number>, groupBId: string, groupBKeys: Array<string | number>, orientation?: DrawSplitSpec['orientation']) => DrawSplitSpec` | - |
| `draw.splitSpec.oneAndRest` | `oneAndRest(groupAId: string, groupAKeys: Array<string | number>, restId: string, orientation?: DrawSplitSpec['orientation']) => DrawSplitSpec` | - |
| `draw.sumSpec.value` | `value(value: number, label?: string) => DrawSumSpec` | - |
| `draw.stackGroupSpec.build` | `build(swapAxes?: boolean, xField?: string, colorField?: string) => DrawStackGroupSpec` | - |

## ops.data API

| API | Signature | Description |
| --- | --- | --- |
| `ops.data.retrieveValue` | `retrieveValue(target: TargetSelector | TargetSelector[], field?: string, precision?: number, group?: string | null, chartId?: string) => OpRetrieveValueSpec` | - |
| `ops.data.filterByComparison` | `filterByComparison(operator: ComparisonOperator, value: OpFilterSpec['value'], field?: string, group?: string | null, chartId?: string) => OpFilterSpec` | - |
| `ops.data.filterInclude` | `filterInclude(values: Array<string | number>, field?: string, group?: string | null, chartId?: string) => OpFilterSpec` | - |
| `ops.data.filterExclude` | `filterExclude(values: Array<string | number>, field?: string, group?: string | null, chartId?: string) => OpFilterSpec` | - |
| `ops.data.findExtremum` | `findExtremum(which: ExtremumWhich, field?: string, group?: string | null, chartId?: string) => OpFindExtremumSpec` | - |
| `ops.data.determineRange` | `determineRange(field?: string, group?: string | null, chartId?: string) => OpDetermineRangeSpec` | - |
| `ops.data.compare` | `compare(targetA: TargetSelector | TargetSelector[], targetB: TargetSelector | TargetSelector[], field?: string, groupA?: string | null, groupB?: string | null, which?: OpCompareSpec['which'], chartId?: string) => OpCompareSpec` | - |
| `ops.data.compareBool` | `compareBool(targetA: TargetSelector | TargetSelector[], targetB: TargetSelector | TargetSelector[], operator: ComparisonOperator, field?: string, groupA?: string | null, groupB?: string | null, chartId?: string) => OpCompareBoolSpec` | - |
| `ops.data.sort` | `sort(field?: string, order?: SortOrder, group?: string | null, chartId?: string) => OpSortSpec` | - |
| `ops.data.sum` | `sum(field: string, group?: string | null, chartId?: string) => OpSumSpec` | - |
| `ops.data.average` | `average(field: string, group?: string | null, chartId?: string) => unknown` | - |
| `ops.data.diff` | `diff(targetA: TargetSelector | TargetSelector[], targetB: TargetSelector | TargetSelector[], field?: string, signed?: boolean, precision?: number, chartId?: string) => OpDiffSpec` | - |
| `ops.data.lagDiff` | `lagDiff(orderField: string, order?: SortOrder, group?: string | null, chartId?: string) => OpLagDiffSpec` | - |
| `ops.data.nth` | `nth(n: number, from?: NthFrom, orderField?: string, group?: string | null, chartId?: string) => OpNthSpec` | - |
| `ops.data.count` | `count(field?: string, group?: string | null, chartId?: string) => OpCountSpec` | - |
| `ops.data.sleep` | `sleep(seconds: number, chartId?: string) => unknown` | - |

## Draw Support By Chart (Runtime)

| ops.draw | Simple Bar | Stacked Bar | Grouped Bar | Simple Line | Multi Line |
| --- | --- | --- | --- | --- | --- |
| `ops.draw.highlight` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.dim` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.clear` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.sleep` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.line` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.rect` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.text` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.barSegment` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.filter` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.sort` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.split` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.unsplit` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.lineTrace` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.lineToBar` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.sum` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.stackedToGrouped` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.groupedToStacked` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.stackedFilterGroups` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.groupedFilterGroups` | ❌ | ❌ | ❌ | ❌ | ❌ |

## Examples

```ts
import { draw, ops, values } from 'src/renderer/ops/authoring'

const line = draw.lineSpec.horizontalFromY(42, draw.style.line('#2563eb', 2, 0.9))
const split = draw.splitSpec.two('asia', values('KOR', 'JPN'), 'europe', values('DEU', 'FRA'))

const opsGroup = [
  ops.draw.line('A', line),
  ops.draw.filter('A', draw.filterSpec.y('gte', 42)),
  ops.draw.split(undefined, split),
  ops.data.filterByComparison('>=', 100, 'Value'),
  ops.data.average('Value'),
]
```