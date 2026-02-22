import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const violations = []

function walk(dirPath, visitor) {
  if (!fs.existsSync(dirPath)) return
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, visitor)
      continue
    }
    visitor(fullPath)
  }
}

function read(fullPath) {
  return fs.readFileSync(fullPath, 'utf8')
}

function rel(fullPath) {
  return path.relative(root, fullPath)
}

function checkDomain() {
  const domainRoot = path.join(root, 'src', 'domain')
  walk(domainRoot, (fullPath) => {
    if (!/\.(ts|tsx)$/.test(fullPath)) return
    const source = read(fullPath)
    const r = rel(fullPath)

    const forbiddenImports = [
      /from\s+['"]react(?:\/[^'"]*)?['"]/g,
      /from\s+['"]react-dom(?:\/[^'"]*)?['"]/g,
      /from\s+['"]d3(?:\/[^'"]*)?['"]/g,
      /from\s+['"]vega(?:\/[^'"]*)?['"]/g,
      /from\s+['"]vega-lite(?:\/[^'"]*)?['"]/g,
      /from\s+['"]vega-embed(?:\/[^'"]*)?['"]/g,
    ]
    forbiddenImports.forEach((pattern) => {
      if (pattern.test(source)) {
        violations.push(`${r}: forbidden import in domain (${pattern})`)
      }
    })

    const forbiddenTokens = [/\bwindow\s*\./g, /\bdocument\s*\./g, /\bHTMLElement\b/g]
    forbiddenTokens.forEach((pattern) => {
      if (pattern.test(source)) {
        violations.push(`${r}: forbidden browser token in domain (${pattern})`)
      }
    })
  })
}

function checkApplication() {
  const appRoot = path.join(root, 'src', 'application')
  walk(appRoot, (fullPath) => {
    if (!/\.(ts|tsx)$/.test(fullPath)) return
    const source = read(fullPath)
    const r = rel(fullPath)

    const importMatches = source.matchAll(/from\s+['"]([^'"]+)['"]/g)
    for (const match of importMatches) {
      const value = match[1]
      if (value.includes('/adapters/') || value.endsWith('/adapters') || value.startsWith('../adapters') || value.startsWith('../../adapters')) {
        violations.push(`${r}: application must not import adapters directly (${value})`)
      }
    }
  })
}

function checkWebApiBoundary() {
  const webRoot = path.join(root, 'web')
  walk(webRoot, (fullPath) => {
    if (!/\.(ts|tsx)$/.test(fullPath)) return
    const source = read(fullPath)
    const r = rel(fullPath)

    const importMatches = source.matchAll(/from\s+['"]([^'"]+)['"]/g)
    for (const match of importMatches) {
      const value = match[1]
      if (!value.includes('src')) continue
      const normalized = value.replace(/\\/g, '/')
      if (
        normalized.endsWith('/src/api') ||
        normalized.includes('/src/api/') ||
        normalized === 'src/api' ||
        normalized.startsWith('src/api/')
      ) {
        continue
      }
      violations.push(`${r}: web must import engine only via src/api/* (${value})`)
    }
  })
}

checkDomain()
checkApplication()
checkWebApiBoundary()

if (violations.length > 0) {
  console.error('[check-architecture-boundary] Found architecture boundary violations:')
  violations.forEach((v) => console.error(`- ${v}`))
  process.exit(1)
}

console.log('[check-architecture-boundary] architecture boundary check passed.')
