import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const outPath = path.join(root, '.cache/typedoc-authoring.json')
const entryDraw = path.join(root, 'src/operation/build/authoring/draw.ts')
const entryData = path.join(root, 'src/operation/build/authoring/data.ts')
const tsconfig = path.join(root, 'tsconfig.json')
const localTypedoc = path.join(root, 'node_modules/.bin/typedoc')

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function runTypeDoc(bin) {
  const args = [
    '--entryPoints',
    entryDraw,
    entryData,
    '--tsconfig',
    tsconfig,
    '--json',
    outPath,
    '--logLevel',
    'Error',
  ]
  const result = spawnSync(bin, args, { stdio: 'inherit', shell: false })
  return result.status === 0
}

ensureDir(outPath)

if (!fs.existsSync(localTypedoc)) {
  console.warn('[docs:draw-authoring-typedoc-json] typedoc is not installed. Skip JSON generation.')
  process.exit(0)
}

const ok = runTypeDoc(localTypedoc)
if (!ok) {
  console.warn('[docs:draw-authoring-typedoc-json] TypeDoc generation failed. Existing JSON (if any) will be reused.')
  process.exit(0)
}

console.log(`[docs:draw-authoring-typedoc-json] Wrote ${path.relative(root, outPath)}`)
