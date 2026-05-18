import type { VegaLiteSpec } from '../domain/chart'
import type { DatumValue, OperationSpec } from '../domain/operation/types'
import type { OperationRuntimeSnapshot, SerializableChainState } from '../operation-next/executionState'

export const CHUNKED_CHART_OUTPUT_VERSION = 'workbench-chunked-output/v1' as const

export type ChunkedChartOutput = {
  version: typeof CHUNKED_CHART_OUTPUT_VERSION
  createdAt: string
  input: {
    spec: VegaLiteSpec
    question?: string
    explanation?: string
    baseSvg?: string
  }
  chunks: ChunkedChartScene[]
}

export type ChunkedChartScene = {
  id: string
  scene_number: number
  text_chunk: string
  ops: OperationSpec[]
  chartType?: string
  svg_code: string
  checkpoint?: ChunkExecutionCheckpoint
}

export type ChunkExecutionCheckpoint = {
  version: 'operation-next-checkpoint/v1'
  spec: VegaLiteSpec
  chartType?: string
  runtimeSnapshot: OperationRuntimeSnapshot
  chainState: SerializableChainState | null
  dom: {
    layoutType: 'single' | 'split-horizontal' | 'split-vertical'
    rootSvg?: string
    surfaces?: Array<{
      id: string
      spec: VegaLiteSpec
      chartType?: string
      svg_code: string
      data?: DatumValue[]
    }>
  }
}

export type BaselineSvgScene = {
  scene_number: number
  text_chunk: string
  svg_code: string
}

export type BaselineSvgResultJson = Record<string, Record<string, BaselineSvgScene[]>>

export type BaselineSvgInputJson = Record<
  string,
  {
    question: string
    explanation: string
    svg: string
  }
>

export type BaselineSvgExport = {
  resultJson: BaselineSvgResultJson
  inputJson: BaselineSvgInputJson
}

export function toBaselineSvgExport(
  output: ChunkedChartOutput,
  options: {
    modelName: string
    chartId: string
  },
): BaselineSvgExport {
  const modelName = options.modelName.trim() || 'workbench'
  const chartId = options.chartId.trim() || 'workbench'
  const scenes = [...output.chunks]
    .sort((a, b) => a.scene_number - b.scene_number)
    .map((chunk) => ({
      scene_number: chunk.scene_number,
      text_chunk: chunk.text_chunk,
      svg_code: chunk.svg_code,
    }))
  const explanation = output.input.explanation?.trim() || scenes.map((scene) => scene.text_chunk).join(' ')

  return {
    resultJson: {
      [modelName]: {
        [chartId]: scenes,
      },
    },
    inputJson: {
      [chartId]: {
        question: output.input.question ?? '',
        explanation,
        svg: output.input.baseSvg ?? '',
      },
    },
  }
}
