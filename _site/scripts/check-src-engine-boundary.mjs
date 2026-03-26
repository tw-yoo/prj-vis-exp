import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const srcRoot = path.join(root, 'src')

const violations = []

const walk = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }

    const relPath = path.relative(root, fullPath)
    if (relPath.includes(`${path.sep}renderer${path.sep}`)) {
      // no-op: renderer is a valid engine term when it is inside src/rendering
    }

    if (fullPath.endsWith('.tsx')) {
      violations.push(`${relPath}: .tsx is not allowed under src (web UI must live under web/).`)
    }
    if (fullPath.endsWith('.css')) {
      violations.push(`${relPath}: .css is not allowed under src (web UI styles must live under web/).`)
    }

    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue
    const source = fs.readFileSync(fullPath, 'utf8')
    const reactImportPattern = /from\s+['\"]react(?:-dom)?(?:\/[^'\"]*)?['\"]/g
    if (reactImportPattern.test(source)) {
      violations.push(`${relPath}: React import is not allowed under src.`)
    }
  }
}

if (!fs.existsSync(srcRoot)) {
  console.error('[check-src-engine-boundary] Missing src directory.')
  process.exit(1)
}

walk(srcRoot)

if (violations.length > 0) {
  console.error('[check-src-engine-boundary] Found src boundary violations:')
  violations.forEach((message) => console.error(`- ${message}`))
  process.exit(1)
}

console.log('[check-src-engine-boundary] src boundary check passed.')
