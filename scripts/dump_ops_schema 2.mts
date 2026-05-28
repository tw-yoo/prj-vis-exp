// Dumps the canonical operationRegistry as a compact JSON document for use by
// non-TS tooling (e.g. scripts/fill_review_ops.py). Keep the shape minimal —
// just the bits a prompt-builder needs: op name, label, fields with kind /
// options / optionsSource.
//
// Usage: npx tsx scripts/dump_ops_schema.mts > data/review/.ops_schema.json

import { operationRegistry } from '../src/api/operation-build'

const compact = operationRegistry.operations.map((op) => ({
  op: op.op,
  label: op.label,
  fields: (op.fields ?? []).map((field) => ({
    key: field.key,
    kind: field.kind,
    optional: !!field.optional,
    description: field.description ?? null,
    options: field.options ?? null,
    optionsSource: field.optionsSource ?? null,
  })),
}))

process.stdout.write(JSON.stringify({ operations: compact }, null, 2) + '\n')
