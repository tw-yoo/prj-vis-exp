import fs from 'node:fs'
import path from 'node:path'

function parseCsv(input) {
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cur += '"'
        i += 1
        continue
      }
      if (ch === '"') {
        inQuotes = false
        continue
      }
      cur += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cur)
      cur = ''
      continue
    }
    if (ch === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
      continue
    }
    if (ch === '\r') {
      continue
    }
    cur += ch
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

function formatCell(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed === 'NA' || trimmed === 'TODO') return trimmed
  try {
    const obj = JSON.parse(trimmed)
    return JSON.stringify(obj, null, 2)
  } catch {
    return trimmed
  }
}

const csvPath = path.resolve(process.cwd(), 'draw_test_cases.csv')
const outPath = path.resolve(process.cwd(), 'guide/draw/DRAW_TEST_CASES.generated.md')
const indexPath = path.resolve(process.cwd(), 'guide/draw/README.md')

const raw = fs.readFileSync(csvPath, 'utf8').trim()
const rows = parseCsv(raw)
if (rows.length === 0) {
  throw new Error('draw_test_cases.csv is empty')
}

const headers = rows[0]
const chartHeaders = headers.slice(2)
const content = []
content.push('# Draw Test Cases (Generated)')
content.push('')
content.push('이 문서는 `draw_test_cases.csv`에서 자동 생성됩니다.')
content.push('')

for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i]
  if (!row || row.length < 2) continue
  const action = row[0] || ''
  const option = row[1] || ''
  content.push(`## ${action}${option ? ` / ${option}` : ''}`)
  content.push('')
  chartHeaders.forEach((chart, idx) => {
    const cell = row[idx + 2] ?? ''
    const formatted = formatCell(cell)
    content.push(`### ${chart}`)
    if (!formatted) {
      content.push('_empty_')
      content.push('')
      return
    }
    if (formatted === 'NA' || formatted === 'TODO') {
      content.push(`_${formatted}_`)
      content.push('')
      return
    }
    content.push('```json')
    content.push(formatted)
    content.push('```')
    content.push('')
  })
}

fs.writeFileSync(outPath, content.join('\n'))
console.log(`Wrote ${outPath}`)

const drawDir = path.resolve(process.cwd(), 'guide/draw')
const mdFiles = fs
  .readdirSync(drawDir)
  .filter((file) => file.endsWith('.md') && file !== 'README.md')
  .sort((a, b) => a.localeCompare(b))

const indexLines = [
  '# Draw Guide Index',
  '',
  '자동 생성: `scripts/generate-draw-test-cases.mjs`',
  '',
  '## Documents',
  ...mdFiles.map((file) => `- [${file}](${file})`),
  '',
]

fs.writeFileSync(indexPath, indexLines.join('\n'))
console.log(`Wrote ${indexPath}`)
