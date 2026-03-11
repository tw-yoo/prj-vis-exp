import type {
  DrawBarSegmentSpec,
  DrawFilterSpec,
  DrawLineSpec,
  DrawMark,
  DrawRectSpec,
  DrawSelect,
  DrawSplitSpec,
  DrawStackGroupSpec,
  DrawSumSpec,
  DrawTextSpec,
} from '../../../rendering/draw/types'
import { DrawLineModes, DrawRectModes, DrawTextModes } from '../../../rendering/draw/types'

declare const __authoringBrand: unique symbol

export type Brand<Name extends string> = { readonly [__authoringBrand]: Name }

export type DrawSelectKeys = DrawSelect &
  Brand<'draw.select.keys'> & {
    keys: Array<string | number>
    mark?: undefined
  }

export type DrawSelectMarkKeys = DrawSelect &
  Brand<'draw.select.markKeys'> & {
    mark: DrawMark
    keys: Array<string | number>
  }

export type DrawTextSpecAnchor = DrawTextSpec &
  Brand<'draw.textSpec.anchor'> & {
    mode: typeof DrawTextModes.Anchor
    position?: undefined
  }

export type DrawTextSpecNormalized = DrawTextSpec &
  Brand<'draw.textSpec.normalized'> & {
    mode: typeof DrawTextModes.Normalized
    position: { x: number; y: number }
  }

export type DrawLineSpecNormalized = DrawLineSpec &
  Brand<'draw.lineSpec.normalized'> & {
    position: { start: { x: number; y: number }; end: { x: number; y: number } }
  }

export type DrawLineSpecHorizontalFromY = DrawLineSpec &
  Brand<'draw.lineSpec.horizontalFromY'> & {
    mode: typeof DrawLineModes.HorizontalFromY
    hline: { y: number }
  }

export type DrawLineSpecConnect = DrawLineSpec &
  Brand<'draw.lineSpec.connect'> & {
    mode: typeof DrawLineModes.Connect
    pair: { x: [string, string] }
  }

export type DrawLineSpecAngle = DrawLineSpec &
  Brand<'draw.lineSpec.angle'> & {
    mode: typeof DrawLineModes.Angle
    axis: { x: string; y: number }
    angle: number
    length: number
  }

export type DrawRectSpecNormalized = DrawRectSpec &
  Brand<'draw.rectSpec.normalized'> & {
    mode: typeof DrawRectModes.Normalized
    position: { x: number; y: number }
    size: { width: number; height: number }
  }

export type DrawRectSpecAxisX = DrawRectSpec &
  Brand<'draw.rectSpec.axisX'> & {
    mode: typeof DrawRectModes.Axis
    axis: { x: string }
  }

export type DrawRectSpecAxisY = DrawRectSpec &
  Brand<'draw.rectSpec.axisY'> & {
    mode: typeof DrawRectModes.Axis
    axis: { y: number }
  }

export type DrawRectSpecDataPoint = DrawRectSpec &
  Brand<'draw.rectSpec.dataPoint'> & {
    mode: typeof DrawRectModes.DataPoint
    point: { x: string | number }
    size: { width: number; height: number }
  }

export type DrawFilterSpecXInclude = DrawFilterSpec &
  Brand<'draw.filterSpec.xInclude'> & {
    x: { include: Array<string | number> }
  }

export type DrawFilterSpecXExclude = DrawFilterSpec &
  Brand<'draw.filterSpec.xExclude'> & {
    x: { exclude: Array<string | number> }
  }

export type DrawFilterSpecY = DrawFilterSpec &
  Brand<'draw.filterSpec.y'> & {
    y: { op: NonNullable<DrawFilterSpec['y']>['op']; value: number }
  }

export type DrawSplitSpecTwo = DrawSplitSpec &
  Brand<'draw.splitSpec.two'> & {
    by: 'x'
    groups: Record<string, Array<string | number>>
    orientation: NonNullable<DrawSplitSpec['orientation']>
  }

export type DrawSplitSpecOneAndRest = DrawSplitSpec &
  Brand<'draw.splitSpec.oneAndRest'> & {
    by: 'x'
    groups: Record<string, Array<string | number>>
    restTo: string
    orientation: NonNullable<DrawSplitSpec['orientation']>
  }

export type DrawSegmentSpecThreshold = DrawBarSegmentSpec & Brand<'draw.segmentSpec.threshold'>
export type DrawSumSpecValue = DrawSumSpec & Brand<'draw.sumSpec.value'>
export type DrawSumSpecLabel = DrawSumSpec & Brand<'draw.sumSpec.label'>
export type DrawStackGroupSpecBuild = DrawStackGroupSpec & Brand<'draw.stackGroupSpec.build'>
