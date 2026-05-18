/**
 * seed-transition-rules.mjs
 *
 * 1회성 시드 스크립트.
 * selected_supported_compositional_questions.csv 의 각 시퀀스에서
 * 인접 op pair (prev_op, next_op) 를 추출해
 * docs/operation-rules/operation_transition_rules.csv 를 생성한다.
 *
 * 사용법:
 *   node scripts/seed-transition-rules.mjs
 *
 * 이미 파일이 존재하면 덮어쓰지 않고 종료한다 (--force 플래그로 강제 덮어쓰기).
 */

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const srcCsv = path.join(root, 'docs/operation-rules/selected_supported_compositional_questions.csv')
const outCsv = path.join(root, 'docs/operation-rules/operation_transition_rules.csv')
const force = process.argv.includes('--force')

// ── CSV 파싱 (multi-line 필드 대응 간단 구현) ──────────────────────────────
function parseCsv(raw) {
  const rows = []
  let field = ''
  let inQuote = false
  let currentRow = []

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const next = raw[i + 1]

    if (ch === '"') {
      if (inQuote && next === '"') {
        field += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      currentRow.push(field)
      field = ''
    } else if (ch === '\n' && !inQuote) {
      currentRow.push(field)
      field = ''
      rows.push(currentRow)
      currentRow = []
    } else if (ch === '\r' && next === '\n' && !inQuote) {
      // skip \r
    } else {
      field += ch
    }
  }
  // 마지막 행
  if (field || currentRow.length > 0) {
    currentRow.push(field)
    rows.push(currentRow)
  }

  const [headerRow, ...dataRows] = rows
  return dataRows.map((cols) =>
    Object.fromEntries(headerRow.map((h, i) => [h.trim(), (cols[i] ?? '').trim()]))
  )
}

// ── op 이름 정규화: "findExtremum(max)" → "findExtremum" ─────────────────
function normalizeOp(raw) {
  return raw.trim().replace(/\(.*$/, '').trim()
}

// ── 시퀀스 → 인접 pair 목록 ─────────────────────────────────────────────
function extractPairs(chartType, sequence, questionId) {
  const ops = sequence.split('->').map((s) => normalizeOp(s))
  const pairs = []
  for (let i = 0; i < ops.length - 1; i++) {
    pairs.push({
      chart_type: chartType,
      prev_op: ops[i],
      next_op: ops[i + 1],
      example_question_id: questionId,
    })
  }
  return pairs
}

// ── CSV 출력 ─────────────────────────────────────────────────────────────
const COLUMNS = [
  'chart_type',
  'prev_op',
  'next_op',
  'state_input_from_prev',
  'visual_layer_policy',
  'annotation_key_collision',
  'stage_order_hint',
  'disallowed_reason',
  'example_question_id',
  'rule_status',
  'researcher_note',
]

function escapeField(val) {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowToCsv(obj) {
  return COLUMNS.map((col) => escapeField(obj[col] ?? '')).join(',')
}

// ── main ────────────────────────────────────────────────────────────────
if (fs.existsSync(outCsv) && !force) {
  console.error(`[seed] ${outCsv} already exists. Use --force to overwrite.`)
  process.exit(1)
}

const raw = fs.readFileSync(srcCsv, 'utf8')
const questions = parseCsv(raw)
console.log(`[seed] parsed ${questions.length} compositional questions`)

// 모든 pair 추출
const allPairs = questions.flatMap((q) =>
  extractPairs(q.chart_type, q.supported_operation_sequence, q.id)
)

// (chart_type, prev_op, next_op) 기준 dedup; example_question_id는 첫 번째만
const seen = new Map()
for (const pair of allPairs) {
  const key = `${pair.chart_type}|${pair.prev_op}|${pair.next_op}`
  if (!seen.has(key)) {
    seen.set(key, { ...pair, rule_status: 'todo' })
  }
  // 같은 pair가 여러 question에 등장하면 id를 ;로 이어붙임
  else {
    const existing = seen.get(key)
    if (!existing.example_question_id.includes(pair.example_question_id)) {
      existing.example_question_id += `;${pair.example_question_id}`
    }
  }
}

const deduped = [...seen.values()]

// chart_type 순서로 정렬
const CHART_ORDER = ['simple-bar', 'stacked-bar', 'grouped-bar', 'simple-line', 'multi-line']
deduped.sort((a, b) => {
  const ci = CHART_ORDER.indexOf(a.chart_type) - CHART_ORDER.indexOf(b.chart_type)
  if (ci !== 0) return ci
  return `${a.prev_op}${a.next_op}`.localeCompare(`${b.prev_op}${b.next_op}`)
})

const lines = [COLUMNS.join(','), ...deduped.map(rowToCsv)]
fs.writeFileSync(outCsv, lines.join('\n') + '\n', 'utf8')

console.log(`[seed] wrote ${deduped.length} transition pairs → ${outCsv}`)
console.log('[seed] rule_status=todo 행을 열어 각 컬럼을 채우고 rule_status=defined 로 변경하세요.')
