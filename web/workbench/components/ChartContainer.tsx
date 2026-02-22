import React from 'react'
import useChartRunner from '../hooks/useChartRunner'
import type { OperationSpec, VegaLiteSpec } from '../../../src/api/legacy'

type ChartContainerProps<TSpec, TOps, TResult> = {
  vlSpec: TSpec
  opsSpec?: TOps
  renderer: (container: HTMLElement, vlSpec: TSpec, opsSpec: TOps | undefined) => Promise<TResult> | TResult
  style?: React.CSSProperties
  className?: string
}

type DefaultOpsSpec = OperationSpec[] | { ops: OperationSpec[] } | null

export function ChartContainer<TSpec = VegaLiteSpec, TOps = DefaultOpsSpec, TResult = void>({
  vlSpec,
  opsSpec,
  renderer,
  style,
  className,
}: ChartContainerProps<TSpec, TOps, TResult>) {
  const containerRef = useChartRunner<TSpec, TOps | undefined, TResult>(vlSpec, opsSpec, renderer)

  return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} className={className} />
}

export default ChartContainer
