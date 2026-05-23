import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { operationRegistry, type FieldSchema, type OperationSchema } from '../../../src/api/operation-build'

// Single source of truth for ops autocomplete: we derive everything from the
// runtime operationRegistry. Adding/removing an op in the registry flows here
// automatically — never hardcode op names or field keys in this file.

type Slot =
  | { kind: 'op-name' }
  | { kind: 'field-key'; op: OperationSchema }
  | { kind: 'field-value'; field: FieldSchema }
  | { kind: 'none' }

const OP_RE = /"op"\s*:\s*"([^"]*)"?$/

export function opsSpecCompletionSource(context: CompletionContext): CompletionResult | null {
  const slot = detectSlot(context)
  switch (slot.kind) {
    case 'op-name':
      return completeOpName(context)
    case 'field-key':
      return completeFieldKey(context, slot.op)
    case 'field-value':
      return completeFieldValue(context, slot.field)
    case 'none':
      return null
  }
}

function detectSlot(context: CompletionContext): Slot {
  const head = context.state.doc.sliceString(0, context.pos)

  // (1) cursor right inside `"op": "▮"`
  const opMatch = head.match(/"op"\s*:\s*"([^"]*)$/)
  if (opMatch) return { kind: 'op-name' }

  // Find the nearest enclosing object: walk backwards counting braces.
  const objectInfo = findEnclosingObject(head)
  if (!objectInfo) return { kind: 'none' }
  const { sliceFromBrace } = objectInfo

  // What op is this object an instance of? Look for `"op": "..."` inside this object.
  const opNameInObject = sliceFromBrace.match(/"op"\s*:\s*"([a-zA-Z0-9_-]+)"/)?.[1] ?? null
  const op = opNameInObject ? findOpSchema(opNameInObject) : null

  // (3) inside a string value for a known field — heuristic:
  // look for `"<field>"\s*:\s*"<partial>?$`
  const valueMatch = head.match(/"([a-zA-Z0-9_]+)"\s*:\s*"([^"]*)$/)
  if (valueMatch && op) {
    const fieldKey = valueMatch[1]
    if (fieldKey !== 'op') {
      const field = op.fields?.find((f) => f.key === fieldKey)
      if (field) return { kind: 'field-value', field }
    }
  }

  // (2) cursor at a key position inside the object: most recent non-whitespace
  // char before cursor is `{`, `,`, or we're just after another value's `,`.
  // Treat as field-key slot when there's no `:` after the most recent `{` or `,`.
  if (op && isAtKeyPosition(head)) {
    return { kind: 'field-key', op }
  }

  return { kind: 'none' }
}

function findEnclosingObject(head: string): { sliceFromBrace: string } | null {
  let depth = 0
  for (let i = head.length - 1; i >= 0; i--) {
    const ch = head[i]
    if (ch === '}') {
      depth++
    } else if (ch === '{') {
      if (depth === 0) {
        return { sliceFromBrace: head.slice(i) }
      }
      depth--
    }
  }
  return null
}

function isAtKeyPosition(head: string): boolean {
  // Walk back over whitespace; the char before should be `{` or `,`.
  let i = head.length - 1
  // Skip a possibly-open opening quote like `"abc` (still typing the key)
  while (i >= 0 && /[A-Za-z0-9_"]/.test(head[i])) i--
  while (i >= 0 && /\s/.test(head[i])) i--
  if (i < 0) return false
  return head[i] === '{' || head[i] === ','
}

function findOpSchema(name: string): OperationSchema | null {
  return operationRegistry.operations.find((o) => o.op === name) ?? null
}

function completeOpName(context: CompletionContext): CompletionResult | null {
  // Replace from the start of the partial op name.
  const head = context.state.doc.sliceString(0, context.pos)
  const opMatch = head.match(OP_RE)
  const from = context.pos - (opMatch?.[1].length ?? 0)
  const options: Completion[] = operationRegistry.operations.map((op) => ({
    label: op.op,
    detail: op.label,
    type: 'enum',
    apply: op.op,
  }))
  return { from, options, validFor: /^[A-Za-z0-9_]*$/ }
}

function completeFieldKey(context: CompletionContext, op: OperationSchema): CompletionResult | null {
  if (!op.fields?.length) return null
  // Replace from the start of the partial key, including any open quote.
  const head = context.state.doc.sliceString(0, context.pos)
  const partial = head.match(/"?([A-Za-z0-9_]*)$/)?.[1] ?? ''
  const partialWithQuote = head.match(/("[A-Za-z0-9_]*)$/)?.[1]
  const from = context.pos - (partialWithQuote?.length ?? partial.length)
  const options: Completion[] = op.fields.map((f) => ({
    label: `"${f.key}"`,
    detail: `${f.kind}${f.optional ? '?' : ''}`,
    info: f.description ?? f.label,
    type: 'property',
    apply: `"${f.key}": `,
  }))
  return { from, options, validFor: /^"?[A-Za-z0-9_]*"?$/ }
}

function completeFieldValue(context: CompletionContext, field: FieldSchema): CompletionResult | null {
  if (field.kind !== 'enum' || !field.options?.length) return null
  const head = context.state.doc.sliceString(0, context.pos)
  const partial = head.match(/"([^"]*)$/)?.[1] ?? ''
  const from = context.pos - partial.length
  const options: Completion[] = field.options.map((value) => ({
    label: value,
    type: 'constant',
    apply: value,
  }))
  return { from, options, validFor: /^[A-Za-z0-9_-]*$/ }
}
