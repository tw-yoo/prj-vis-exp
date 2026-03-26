# Draw/Data Authoring DSL

Generated at: `2026-02-22T06:11:00.242Z`
Signature source: `typescript-typechecker`

Source:
- `src/operation/build/authoring/draw.ts`
- `src/operation/build/authoring/data.ts`
- `src/rendering/draw/supportMatrix.ts`

## Core Rules
- Authoring code should use positional DSL functions.
- Avoid object-literal calls like `drawOps.*({ ... })` and `dataOps.*({ ... })`.
- Use helper builders (`draw.*`) for nested spec composition.

## ops.draw API

| API | Signature | Description |
| --- | --- | --- |
| `ops.draw.barSegment` | `barSegment(chartId: string | undefined, selectKeys: (string | number)[], segmentSpec: DrawSegmentSpecThreshold): DrawOp` | - |
| `ops.draw.clear` | `clear(chartId?: string | undefined): DrawOp` | - |
| `ops.draw.dim` | `dim(chartId?: string | undefined, select?: DrawSelectKeys | DrawSelectMarkKeys | undefined, color?: string | undefined, opacity?: number | undefined): DrawOp` | - |
| `ops.draw.filter` | `filter(chartId: string | undefined, filterSpec: DrawFilterSpecXInclude | DrawFilterSpecXExclude | DrawFilterSpecY): DrawOp` | - |
| `ops.draw.groupedFilterGroups` | `groupedFilterGroups(chartId: string | undefined, groups: (string | number)[], mode: GroupFilterMode): DrawOp` | - |
| `ops.draw.groupedToStacked` | `groupedToStacked(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpecBuild | undefined): DrawOp` | - |
| `ops.draw.highlight` | `highlight(chartId?: string | undefined, select?: DrawSelectKeys | DrawSelectMarkKeys | undefined, color?: string | undefined, opacity?: number | undefined): DrawOp` | - |
| `ops.draw.line` | `line(chartId: string | undefined, lineSpec: DrawLineSpecNormalized | DrawLineSpecHorizontalFromY | DrawLineSpecConnect | DrawLineSpecAngle): DrawOp` | - |
| `ops.draw.lineToBar` | `lineToBar(chartId?: string | undefined): DrawOp` | - |
| `ops.draw.lineTrace` | `lineTrace(chartId?: string | undefined, select?: DrawSelectKeys | DrawSelectMarkKeys | undefined): DrawOp` | - |
| `ops.draw.rect` | `rect(chartId: string | undefined, rectSpec: DrawRectSpecNormalized | DrawRectSpecAxisX | DrawRectSpecAxisY | DrawRectSpecDataPoint): DrawOp` | - |
| `ops.draw.sleep` | `sleep(seconds: number, chartId?: string | undefined): DrawOp` | - |
| `ops.draw.sort` | `sort(chartId: string | undefined, by?: "x" | "y" | undefined, order?: "asc" | "desc" | undefined): DrawOp` | - |
| `ops.draw.split` | `split(chartId: string | undefined, splitSpec: DrawSplitSpecTwo | DrawSplitSpecOneAndRest): DrawOp` | - |
| `ops.draw.stackedFilterGroups` | `stackedFilterGroups(chartId: string | undefined, groups: (string | number)[], mode: GroupFilterMode): DrawOp` | - |
| `ops.draw.stackedToGrouped` | `stackedToGrouped(chartId: string | undefined, stackGroupSpec?: DrawStackGroupSpecBuild | undefined): DrawOp` | - |
| `ops.draw.sum` | `sum(chartId: string | undefined, sumSpec: DrawSumSpecValue): DrawOp` | - |
| `ops.draw.text` | `text(chartId: string | undefined, select: DrawSelectKeys | DrawSelectMarkKeys | undefined, textSpec: DrawTextSpecAnchor | DrawTextSpecNormalized): DrawOp` | - |
| `ops.draw.unsplit` | `unsplit(chartId?: string | undefined): DrawOp` | - |

## draw Helper API

| Helper | Signature | Description |
| --- | --- | --- |
| `draw.arrow.both` | `both(length?: number | undefined, width?: number | undefined, style?: { stroke?: string | undefined; fill?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined): DrawArrowSpec` | - |
| `draw.arrow.endOnly` | `endOnly(length?: number | undefined, width?: number | undefined, style?: { stroke?: string | undefined; fill?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined): DrawArrowSpec` | - |
| `draw.arrow.startOnly` | `startOnly(length?: number | undefined, width?: number | undefined, style?: { stroke?: string | undefined; fill?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined): DrawArrowSpec` | - |
| `draw.filterSpec.xExclude` | `xExclude(...labels: (string | number)[]): DrawFilterSpecXExclude` | - |
| `draw.filterSpec.xInclude` | `xInclude(...labels: (string | number)[]): DrawFilterSpecXInclude` | - |
| `draw.filterSpec.y` | `y(op: DrawComparisonToken, value: number): DrawFilterSpecY` | - |
| `draw.lineSpec.angle` | `angle(axisX: string | number, axisY: number, angleDeg: number, length: number, style?: { stroke?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined, arrow?: DrawArrowSpec | undefined): DrawLineSpecAngle` | - |
| `draw.lineSpec.connect` | `connect(startX: string | number, endX: string | number, style?: { stroke?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined, arrow?: DrawArrowSpec | undefined): DrawLineSpecConnect` | - |
| `draw.lineSpec.horizontalFromY` | `horizontalFromY(y: number, style?: { stroke?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined, arrow?: DrawArrowSpec | undefined): DrawLineSpecHorizontalFromY` | - |
| `draw.lineSpec.normalized` | `normalized(startX: number, startY: number, endX: number, endY: number, style?: { stroke?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; } | undefined, arrow?: DrawArrowSpec | undefined): DrawLineSpecNormalized` | - |
| `draw.rectSpec.axisX` | `axisX(xLabel: string | number, style?: { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; } | undefined): DrawRectSpecAxisX` | - |
| `draw.rectSpec.axisY` | `axisY(y: number, style?: { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; } | undefined): DrawRectSpecAxisY` | - |
| `draw.rectSpec.dataPoint` | `dataPoint(xLabel: string | number, width: number, height: number, style?: { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; } | undefined): DrawRectSpecDataPoint` | - |
| `draw.rectSpec.normalized` | `normalized(centerX: number, centerY: number, width: number, height: number, style?: { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; } | undefined): DrawRectSpecNormalized` | - |
| `draw.segmentSpec.threshold` | `threshold(threshold: number, when?: DrawComparisonToken, style?: { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; } | undefined): DrawSegmentSpecThreshold` | - |
| `draw.select.keys` | `keys(...keys: (string | number)[]): DrawSelectKeys` | - |
| `draw.select.markKeys` | `markKeys(mark: DrawMark, ...keys: (string | number)[]): DrawSelectMarkKeys` | - |
| `draw.splitSpec.oneAndRest` | `oneAndRest(groupAId: string, groupAKeys: (string | number)[], restId: string, orientation?: NonNullable<"vertical" | "horizontal" | undefined>): DrawSplitSpecOneAndRest` | - |
| `draw.splitSpec.two` | `two(groupAId: string, groupAKeys: (string | number)[], groupBId: string, groupBKeys: (string | number)[], orientation?: NonNullable<"vertical" | "horizontal" | undefined>): DrawSplitSpecTwo` | - |
| `draw.stackGroupSpec.build` | `build(swapAxes?: boolean | undefined, xField?: string | undefined, colorField?: string | undefined): DrawStackGroupSpecBuild` | - |
| `draw.style.arrow` | `arrow(stroke?: string | undefined, fill?: string | undefined, strokeWidth?: number | undefined, opacity?: number | undefined): { stroke?: string | undefined; fill?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; }` | - |
| `draw.style.line` | `line(stroke: string, strokeWidth?: number | undefined, opacity?: number | undefined): { stroke?: string | undefined; strokeWidth?: number | undefined; opacity?: number | undefined; }` | - |
| `draw.style.rect` | `rect(fill: string, opacity?: number | undefined, stroke?: string | undefined, strokeWidth?: number | undefined): { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; }` | - |
| `draw.style.segment` | `segment(fill: string, stroke?: string | undefined, strokeWidth?: number | undefined, opacity?: number | undefined): { fill?: string | undefined; opacity?: number | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; }` | - |
| `draw.style.text` | `text(color: string, fontSize?: number | undefined, fontWeight?: string | number | undefined, fontFamily?: string | undefined, opacity?: number | undefined): { color?: string | undefined; fontSize?: number | undefined; fontWeight?: string | ... 1 more ... | undefined; fontFamily?: string | undefined; opacity?: number | undefined; }` | - |
| `draw.sumSpec.value` | `value(value: number, label?: string | undefined): DrawSumSpecValue` | - |
| `draw.textSpec.anchor` | `anchor(value: string | Record<string, string>, textStyle?: { color?: string | undefined; fontSize?: number | undefined; fontWeight?: string | number | undefined; fontFamily?: string | undefined; opacity?: number | undefined; } | undefined, offsetX?: number | undefined, offsetY?: number | undefined): DrawTextSpecAnchor` | - |
| `draw.textSpec.normalized` | `normalized(value: string | Record<string, string>, x: number, y: number, textStyle?: { color?: string | undefined; fontSize?: number | undefined; fontWeight?: string | number | undefined; fontFamily?: string | undefined; opacity?: number | undefined; } | undefined, offsetX?: number | undefined, offsetY?: number | undefined): DrawTextSpecNormalized` | - |

## ops.data API

| API | Signature | Description |
| --- | --- | --- |
| `ops.data.average` | `average(field: string, group?: string | null | undefined, chartId?: string | undefined): OpAverageSpec` | - |
| `ops.data.compare` | `compare(targetA: TargetSelector | TargetSelector[], targetB: TargetSelector | TargetSelector[], field?: string | undefined, groupA?: string | ... 1 more ... | undefined, groupB?: string | ... 1 more ... | undefined, which?: "max" | ... 1 more ... | undefined, chartId?: string | undefined): OpCompareSpec` | - |
| `ops.data.compareBool` | `compareBool(targetA: TargetSelector | TargetSelector[], targetB: TargetSelector | TargetSelector[], operator: string, field?: string | undefined, groupA?: string | ... 1 more ... | undefined, groupB?: string | ... 1 more ... | undefined, chartId?: string | undefined): OpCompareBoolSpec` | - |
| `ops.data.count` | `count(field?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpCountSpec` | - |
| `ops.data.determineRange` | `determineRange(field?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpDetermineRangeSpec` | - |
| `ops.data.diff` | `diff(targetA: TargetSelector | TargetSelector[], targetB: TargetSelector | TargetSelector[], field?: string | undefined, signed?: boolean | undefined, precision?: number | undefined, chartId?: string | undefined): OpDiffSpec` | - |
| `ops.data.filterByComparison` | `filterByComparison(operator: string, value: JsonValue | undefined, field?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpFilterSpec` | - |
| `ops.data.filterExclude` | `filterExclude(values: (string | number)[], field?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpFilterSpec` | - |
| `ops.data.filterInclude` | `filterInclude(values: (string | number)[], field?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpFilterSpec` | - |
| `ops.data.findExtremum` | `findExtremum(which: "max" | "min", field?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpFindExtremumSpec` | - |
| `ops.data.lagDiff` | `lagDiff(orderField: string, order?: SortOrder | undefined, group?: string | null | undefined, chartId?: string | undefined): OpLagDiffSpec` | - |
| `ops.data.nth` | `nth(n: number, from?: "left" | "right" | undefined, orderField?: string | undefined, group?: string | null | undefined, chartId?: string | undefined): OpNthSpec` | - |
| `ops.data.retrieveValue` | `retrieveValue(target: TargetSelector | TargetSelector[], field?: string | undefined, precision?: number | undefined, group?: string | null | undefined, chartId?: string | undefined): OpRetrieveValueSpec` | - |
| `ops.data.sleep` | `sleep(seconds: number, chartId?: string | undefined): { chartId?: string | undefined; seconds?: number | undefined; duration?: number | undefined; op: "sleep"; }` | - |
| `ops.data.sort` | `sort(field?: string | undefined, order?: SortOrder | undefined, group?: string | null | undefined, chartId?: string | undefined): OpSortSpec` | - |
| `ops.data.sum` | `sum(field: string, group?: string | null | undefined, chartId?: string | undefined): OpSumSpec` | - |

## Draw Support By Chart (Runtime)

| ops.draw | Simple Bar | Stacked Bar | Grouped Bar | Simple Line | Multi Line |
| --- | --- | --- | --- | --- | --- |
| `ops.draw.barSegment` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.clear` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.dim` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.filter` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.groupedFilterGroups` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.groupedToStacked` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.highlight` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.line` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.lineToBar` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.lineTrace` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.rect` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.sleep` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.sort` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.split` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.stackedFilterGroups` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.stackedToGrouped` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.sum` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.text` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ops.draw.unsplit` | ❌ | ❌ | ❌ | ❌ | ❌ |

## Examples

```ts
import { draw, ops, values } from 'src/operation/build/authoring'

const line = draw.lineSpec.horizontalFromY(42, draw.style.line('#2563eb', 2, 0.9))
const split = draw.splitSpec.two('asia', values('KOR', 'JPN'), 'europe', values('DEU', 'FRA'))

const opsGroup = [
  ops.draw.line('A', line)
  ops.draw.filter('A', draw.filterSpec.y('gte', 42))
  ops.draw.split(undefined, split)
  ops.data.filterByComparison('>=', 100, 'Value')
  ops.data.average('Value')
]
```