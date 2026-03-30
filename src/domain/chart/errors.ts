import type { ChartSpec } from './types'

function describeMarks(spec: ChartSpec) {
  const marks = new Set<string>()
  const collectMark = (mark: unknown) => {
    if (typeof mark === 'string' && mark.trim().length > 0) {
      marks.add(mark.trim())
      return
    }
    if (mark && typeof mark === 'object' && !Array.isArray(mark)) {
      const type = (mark as { type?: unknown }).type
      if (typeof type === 'string' && type.trim().length > 0) {
        marks.add(type.trim())
      }
    }
  }
  collectMark(spec.mark)
  if (Array.isArray(spec.layer)) {
    spec.layer.forEach((layer) => collectMark(layer?.mark))
  }
  return Array.from(marks)
}

export class UnsupportedChartSpecError extends Error {
  readonly spec: ChartSpec

  constructor(spec: ChartSpec, reason?: string) {
    const marks = describeMarks(spec)
    const markText = marks.length > 0 ? `marks=${marks.join(',')}` : 'marks=unknown'
    const detail = reason ? `${reason}; ${markText}` : markText
    super(`Unsupported chart spec: ${detail}`)
    this.name = 'UnsupportedChartSpecError'
    this.spec = spec
  }
}
