import type { IR } from '../src/llm/irTypes.js'
import { validateIr } from '../src/llm/validateIr.js'

const ok: IR = {
  meta: { chartType: 'simple_bar', knownFields: { x: 'country', y: 'rating' }, assumptions: [], warnings: [] },
  question: { type: 'demo' },
  steps: [
    {
      id: 's1',
      type: 'average',
      scope: { chartId: 'Europe' },
      dependsOn: [],
      params: { field: 'rating', outVar: 'avg' },
    },
    {
      id: 's2',
      type: 'draw',
      scope: { chartId: 'Europe' },
      dependsOn: ['s1'],
      params: { action: 'bar-segment', segment: { threshold: '$var:avg' as any, when: 'gt' } as any },
    },
  ],
  result: { possible: true, answerType: 'unknown', answer: null, reason: '' },
}

const badScope: IR = {
  ...ok,
  steps: [
    ok.steps[0]!,
    {
      ...ok.steps[1]!,
      id: 's2b',
      scope: { chartId: 'Asia' },
    } as any,
  ],
}

const badForwardRef: IR = {
  ...ok,
  steps: [ok.steps[1] as any, ok.steps[0] as any],
}

for (const [name, ir] of [
  ['ok', ok],
  ['badScope', badScope],
  ['badForwardRef', badForwardRef],
] as const) {
  const issues = validateIr(ir)
  const errors = issues.filter((i) => i.level === 'error')
  console.log(`\n[${name}] issues=${issues.length} errors=${errors.length}`)
  for (const i of issues) {
    console.log(`- ${i.level} ${i.code} ${i.stepId} ${i.path}: ${i.message}`)
  }
}
