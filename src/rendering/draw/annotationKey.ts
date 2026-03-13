import { DrawAction, DrawRectModes, DrawTextModes, type DrawOp } from './types'

const ANNOTATION_KEY_PRECISION = 4
const ANNOTATION_KEYABLE_ACTIONS = new Set<DrawAction>([
  DrawAction.Line,
  DrawAction.Text,
  DrawAction.Rect,
  DrawAction.Band,
  DrawAction.BarSegment,
])

type NormalizedValue = null | boolean | number | string | NormalizedValue[] | { [key: string]: NormalizedValue }

function normalizeNumber(value: number) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** ANNOTATION_KEY_PRECISION
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

function normalizeValue(value: unknown): NormalizedValue {
  if (value == null) return null
  if (typeof value === 'number') return normalizeNumber(value)
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry))
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, normalizeValue(entry)] as const)
    const out: Record<string, NormalizedValue> = {}
    entries.forEach(([key, entry]) => {
      out[key] = entry
    })
    return out
  }
  return String(value)
}

function readMetaAnnotationKey(op: DrawOp) {
  const raw = op.meta && typeof op.meta === 'object'
    ? (op.meta as Record<string, unknown>).annotationKey
    : null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length ? trimmed : null
}

function normalizeSelectForKey(op: DrawOp) {
  const select = op.select
  if (!select) return null
  return {
    mark: select.mark ?? null,
    field: typeof select.field === 'string' ? select.field : null,
    keys: Array.isArray(select.keys) ? select.keys.map((key) => String(key)).sort() : [],
  }
}

function payloadForKey(op: DrawOp): NormalizedValue | null {
  const chartId = typeof op.chartId === 'string' ? op.chartId : null

  if (op.action === DrawAction.Line) {
    if (!op.line) return null
    const inferredMode =
      op.line.mode ??
      (op.line.hline?.x != null ? 'horizontal-from-x' : op.line.hline?.y != null ? 'horizontal-from-y' : null)
    return {
      chartId,
      mode: inferredMode,
      line: op.line,
    }
  }

  if (op.action === DrawAction.Text) {
    if (!op.text) return null
    const mode = op.text.mode ?? (op.select?.keys?.length ? DrawTextModes.Anchor : DrawTextModes.Normalized)
    if (mode !== DrawTextModes.Normalized) return null
    if (typeof op.text.value !== 'string') return null
    if (!op.text.position) return null
    return {
      chartId,
      mode,
      value: op.text.value,
      position: op.text.position,
      offset: op.text.offset ?? null,
      style: op.text.style ?? null,
    }
  }

  if (op.action === DrawAction.Rect) {
    if (!op.rect) return null
    return {
      chartId,
      mode: op.rect.mode ?? DrawRectModes.Normalized,
      rect: op.rect,
    }
  }

  if (op.action === DrawAction.Band) {
    if (!op.band) return null
    return {
      chartId,
      band: op.band,
    }
  }

  if (op.action === DrawAction.BarSegment) {
    if (!op.segment) return null
    return {
      chartId,
      select: normalizeSelectForKey(op),
      segment: op.segment,
    }
  }

  return null
}

export function computeAnnotationKeyForDrawOp(op: DrawOp): string | null {
  if (!ANNOTATION_KEYABLE_ACTIONS.has(op.action)) return null
  const payload = payloadForKey(op)
  if (!payload) return null
  return `${op.action}:${JSON.stringify(normalizeValue(payload))}`
}

export function resolveAnnotationKeyForDrawOp(op: DrawOp): string | null {
  return readMetaAnnotationKey(op) ?? computeAnnotationKeyForDrawOp(op)
}

