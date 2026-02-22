import { promises as fs } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const publicDir = path.join(projectRoot, 'public')

const isExternalModulePath = (src) =>
  src.startsWith('http://') ||
  src.startsWith('https://') ||
  src.startsWith('//') ||
  src.startsWith('data:')

const getHtmlFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return getHtmlFiles(resolved)
      }
      return entry.isFile() && entry.name.endsWith('.html') ? [resolved] : []
    }),
  )
  return files.flat()
}

const extractModuleSrcs = (html) => {
  const results = []
  const scriptTagRegex = /<script\b[^>]*>/gi
  for (const tag of html.match(scriptTagRegex) ?? []) {
    if (!/type\s*=\s*['"]module['"]/i.test(tag)) continue
    const srcMatch = tag.match(/src\s*=\s*['"]([^'"]+)['"]/i)
    if (!srcMatch) continue
    results.push(srcMatch[1])
  }
  return results
}

const resolveModuleFilePath = (htmlFilePath, src) => {
  if (src.startsWith('/')) {
    return path.join(publicDir, src.slice(1))
  }
  return path.resolve(path.dirname(htmlFilePath), src)
}

const main = async () => {
  const htmlFiles = await getHtmlFiles(publicDir)
  const missing = []
  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf8')
    const moduleSrcs = extractModuleSrcs(html)
    for (const src of moduleSrcs) {
      if (isExternalModulePath(src)) continue
      const resolved = resolveModuleFilePath(htmlFile, src)
      try {
        const stat = await fs.stat(resolved)
        if (!stat.isFile()) {
          missing.push({ htmlFile, src, resolved })
        }
      } catch {
        missing.push({ htmlFile, src, resolved })
      }
    }
  }

  if (missing.length > 0) {
    console.error('Missing module script targets found in public HTML files:')
    for (const item of missing) {
      console.error(`- ${path.relative(projectRoot, item.htmlFile)} -> ${item.src}`)
      console.error(`  resolved path: ${path.relative(projectRoot, item.resolved)}`)
    }
    process.exit(1)
  }

  console.log(`Checked ${htmlFiles.length} HTML file(s): all module script targets are valid.`)
}

await main()
