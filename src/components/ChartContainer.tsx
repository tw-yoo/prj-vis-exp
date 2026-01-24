import React from 'react'
import useChartRunner from '../hooks/useChartRunner'

type ChartContainerProps = {
  vlSpec: any
  opsSpec?: any
  renderer: (container: HTMLElement, vlSpec: any, opsSpec: any) => Promise<unknown> | unknown
  style?: React.CSSProperties
  className?: string
}

export function ChartContainer({ vlSpec, opsSpec, renderer, style, className }: ChartContainerProps) {
  const containerRef = useChartRunner(vlSpec, opsSpec, renderer)

  return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} className={className} />
}

export default ChartContainer
