import { spawn } from 'node:child_process'
import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const validationRoot = path.join(projectRoot, 'validation')
const validationUrlPrefix = '/validation'
const evaluationRoot = path.join(projectRoot, 'evaluation')
const evaluationUrlPrefix = '/evaluation'
const evaluationViewerEntry = path.join(projectRoot, 'src/evaluation/viewer.ts')
const evaluationEntryEntry = path.join(projectRoot, 'src/evaluation/entry.ts')
const evaluationAllEntry = path.join(projectRoot, 'src/evaluation/all.ts')
const evaluationViewerUrlSuffix = '/run'
const evaluationAllUrlSuffix = '/all'

const validationMimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}
const staticViewerMimeTypes = validationMimeTypes

type ValidationChartInfo = {
  question?: string
  explanation?: Record<string, string>
}

type ValidationChartMap = Record<string, Record<string, ValidationChartInfo>>

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function getValidationStaticPath(urlPathname: string) {
  if (!urlPathname.startsWith(`${validationUrlPrefix}/`)) {
    return null
  }

  const relativePath = decodeURIComponent(urlPathname.slice(validationUrlPrefix.length + 1))
  if (!relativePath) {
    return null
  }

  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '')
  const staticPath = path.join(validationRoot, normalizedPath)
  const validationRootWithSep = `${validationRoot}${path.sep}`

  if (!staticPath.startsWith(validationRootWithSep)) {
    return null
  }

  return staticPath
}

function isValidationViewerRoute(urlPathname: string) {
  if (urlPathname === validationUrlPrefix || urlPathname === `${validationUrlPrefix}/`) {
    return true
  }

  if (!urlPathname.startsWith(`${validationUrlPrefix}/`)) {
    return false
  }

  const relativeParts = urlPathname
    .slice(validationUrlPrefix.length + 1)
    .split('/')
    .filter(Boolean)

  return relativeParts.length === 1 || (relativeParts.length === 2 && relativeParts[1] === 'index.html')
}

function sendValidationFile(response: ServerResponse, filePath: string) {
  response.statusCode = 200
  response.setHeader('Content-Type', validationMimeTypes[path.extname(filePath)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  response.end(fs.readFileSync(filePath))
}

function inferValidationFunctions(filePath: string) {
  const source = fs.readFileSync(filePath, 'utf8')
  const functionNames = Array.from(source.matchAll(/export\s+function\s+(function\d+)\s*\(/g))
    .map((match) => match[1])

  return Object.fromEntries(functionNames.map((functionName) => [functionName, functionName]))
}

function buildValidationChartMap(): ValidationChartMap {
  const chartMapPath = path.join(validationRoot, 'chart_map.json')
  const chartMap = fs.existsSync(chartMapPath)
    ? JSON.parse(fs.readFileSync(chartMapPath, 'utf8')) as ValidationChartMap
    : {}
  const dataRoot = path.join(validationRoot, 'data')

  if (!fs.existsSync(dataRoot)) {
    return chartMap
  }

  for (const expertEntry of fs.readdirSync(dataRoot, { withFileTypes: true })) {
    if (!expertEntry.isDirectory() || expertEntry.name.startsWith('.')) {
      continue
    }

    const expertId = expertEntry.name
    const expertDir = path.join(dataRoot, expertId)
    const chartEntries = fs.readdirSync(expertDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => entry.name.replace(/\.js$/, ''))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    if (!chartEntries.length) {
      continue
    }

    chartMap[expertId] ??= {}

    for (const chartId of chartEntries) {
      chartMap[expertId][chartId] ??= {
        question: '',
        explanation: inferValidationFunctions(path.join(expertDir, `${chartId}.js`)),
      }
    }
  }

  return chartMap
}

function sendValidationChartMap(response: ServerResponse) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(buildValidationChartMap(), null, 2))
}

function installValidationMiddleware(middlewares: Connect.Server) {
  middlewares.use((request, response, next) => {
    const requestUrl = request.url ?? '/'
    const url = new URL(requestUrl, 'http://localhost')

    if (url.pathname === `${validationUrlPrefix}/chart_map.json`) {
      sendValidationChartMap(response)
      return
    }

    const staticPath = getValidationStaticPath(url.pathname)

    if (staticPath && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      sendValidationFile(response, staticPath)
      return
    }

    if (isValidationViewerRoute(url.pathname)) {
      sendValidationFile(response, path.join(validationRoot, 'index.html'))
      return
    }

    next()
  })
}

function collectValidationFiles(dir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue
    }

    const entryPath = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      collectValidationFiles(entryPath, files)
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

function getValidationExpertIds() {
  return Object.keys(buildValidationChartMap())
}

function validationViewerPlugin(): Plugin {
  return {
    name: 'validation-viewer',
    configureServer(server) {
      installValidationMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      installValidationMiddleware(server.middlewares)
    },
    generateBundle() {
      const indexPath = path.join(validationRoot, 'index.html')
      const indexSource = fs.readFileSync(indexPath)
      const skippedBuildFiles = new Set(['index.js', 'load_data.py', 'load_data.sh', 'server.js'])

      for (const filePath of collectValidationFiles(validationRoot)) {
        const relativePath = path.relative(validationRoot, filePath)
        if (skippedBuildFiles.has(relativePath)) {
          continue
        }

        this.emitFile({
          type: 'asset',
          fileName: `validation/${toPosixPath(relativePath)}`,
          source: relativePath === 'chart_map.json'
            ? JSON.stringify(buildValidationChartMap(), null, 2)
            : fs.readFileSync(filePath),
        })
      }

      for (const expertId of getValidationExpertIds()) {
        this.emitFile({
          type: 'asset',
          fileName: `validation/${expertId}/index.html`,
          source: indexSource,
        })
      }
    },
  }
}

function getEvaluationStaticPath(urlPathname: string) {
  if (!urlPathname.startsWith(`${evaluationUrlPrefix}/`)) {
    return null
  }

  const relativePath = decodeURIComponent(urlPathname.slice(evaluationUrlPrefix.length + 1))
  if (!relativePath) {
    return null
  }

  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '')
  const staticPath = path.join(evaluationRoot, normalizedPath)
  const evaluationRootWithSep = `${evaluationRoot}${path.sep}`

  if (!staticPath.startsWith(evaluationRootWithSep)) {
    return null
  }

  return staticPath
}

function isEvaluationEntryRoute(urlPathname: string) {
  if (urlPathname === evaluationUrlPrefix || urlPathname === `${evaluationUrlPrefix}/`) {
    return true
  }
  return urlPathname === `${evaluationUrlPrefix}/index.html`
}

function isEvaluationViewerRoute(urlPathname: string) {
  const viewerPrefix = `${evaluationUrlPrefix}${evaluationViewerUrlSuffix}`
  if (urlPathname === viewerPrefix || urlPathname === `${viewerPrefix}/`) {
    return true
  }
  return urlPathname === `${viewerPrefix}/index.html`
}

// /evaluation/all — internal all-charts review page (not the participant flow).
function isEvaluationAllRoute(urlPathname: string) {
  const allPrefix = `${evaluationUrlPrefix}${evaluationAllUrlSuffix}`
  if (urlPathname === allPrefix || urlPathname === `${allPrefix}/`) {
    return true
  }
  return urlPathname === `${allPrefix}/index.html`
}

function evaluationEntrySource(scriptSrc: string) {
  return fs.readFileSync(path.join(evaluationRoot, 'entry.html'), 'utf8')
    .replace('__EVALUATION_ENTRY_SCRIPT__', scriptSrc)
}

function evaluationViewerSource(scriptSrc: string) {
  return fs.readFileSync(path.join(evaluationRoot, 'index.html'), 'utf8')
    .replace('__EVALUATION_VIEWER_SCRIPT__', scriptSrc)
}

function evaluationAllSource(scriptSrc: string) {
  return fs.readFileSync(path.join(evaluationRoot, 'all.html'), 'utf8')
    .replace('__EVALUATION_ALL_SCRIPT__', scriptSrc)
}

function sendEvaluationFile(response: ServerResponse, filePath: string) {
  response.statusCode = 200
  response.setHeader('Content-Type', staticViewerMimeTypes[path.extname(filePath)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  response.end(fs.readFileSync(filePath))
}

function sendEvaluationHtml(response: ServerResponse, html: string) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(html)
}

function installEvaluationMiddleware(
  middlewares: Connect.Server,
  entryScriptSrc: string,
  viewerScriptSrc: string,
  allScriptSrc: string,
) {
  middlewares.use((request, response, next) => {
    const requestUrl = request.url ?? '/'
    const url = new URL(requestUrl, 'http://localhost')

    if (isEvaluationEntryRoute(url.pathname)) {
      sendEvaluationHtml(response, evaluationEntrySource(entryScriptSrc))
      return
    }

    if (isEvaluationViewerRoute(url.pathname)) {
      sendEvaluationHtml(response, evaluationViewerSource(viewerScriptSrc))
      return
    }

    if (isEvaluationAllRoute(url.pathname)) {
      sendEvaluationHtml(response, evaluationAllSource(allScriptSrc))
      return
    }

    const staticPath = getEvaluationStaticPath(url.pathname)
    if (staticPath && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      const basename = path.basename(staticPath)
      if (basename === 'entry.html') {
        sendEvaluationHtml(response, evaluationEntrySource(entryScriptSrc))
        return
      }
      if (basename === 'index.html') {
        sendEvaluationHtml(response, evaluationViewerSource(viewerScriptSrc))
        return
      }
      if (basename === 'all.html') {
        sendEvaluationHtml(response, evaluationAllSource(allScriptSrc))
        return
      }
      sendEvaluationFile(response, staticPath)
      return
    }

    next()
  })
}

function collectStaticFiles(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue
    }

    const entryPath = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      collectStaticFiles(entryPath, files)
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

function evaluationViewerPlugin(): Plugin {
  let isBuild = false
  let base = '/'

  return {
    name: 'evaluation-viewer',
    configResolved(config) {
      isBuild = config.command === 'build'
      base = config.base
    },
    configureServer(server) {
      installEvaluationMiddleware(
        server.middlewares,
        '/src/evaluation/entry.ts',
        '/src/evaluation/viewer.ts',
        '/src/evaluation/all.ts',
      )
    },
    configurePreviewServer(server) {
      installEvaluationMiddleware(
        server.middlewares,
        '/evaluation/entry.js',
        '/evaluation/viewer.js',
        '/evaluation/all.js',
      )
    },
    buildStart() {
      if (!isBuild) return
      this.emitFile({
        type: 'chunk',
        id: evaluationViewerEntry,
        fileName: 'evaluation/viewer.js',
      })
      this.emitFile({
        type: 'chunk',
        id: evaluationEntryEntry,
        fileName: 'evaluation/entry.js',
      })
      this.emitFile({
        type: 'chunk',
        id: evaluationAllEntry,
        fileName: 'evaluation/all.js',
      })
    },
    generateBundle() {
      // `base` ends with '/', so this yields e.g. '/prj-vis-exp/evaluation/entry.js'
      // (or '/evaluation/entry.js' when base is '/'). Matches the chunk fileNames
      // emitted in buildStart, which Pages serves under the same base.
      const entrySource = evaluationEntrySource(`${base}evaluation/entry.js`)
      const viewerSource = evaluationViewerSource(`${base}evaluation/viewer.js`)
      const allSource = evaluationAllSource(`${base}evaluation/all.js`)

      for (const filePath of collectStaticFiles(evaluationRoot)) {
        const relativePath = path.relative(evaluationRoot, filePath)
        if (relativePath === 'index.html' || relativePath === 'entry.html' || relativePath === 'all.html') {
          continue
        }

        this.emitFile({
          type: 'asset',
          fileName: `evaluation/${toPosixPath(relativePath)}`,
          source: fs.readFileSync(filePath),
        })
      }

      this.emitFile({
        type: 'asset',
        fileName: 'evaluation/index.html',
        source: entrySource,
      })

      this.emitFile({
        type: 'asset',
        fileName: 'evaluation/run/index.html',
        source: viewerSource,
      })

      this.emitFile({
        type: 'asset',
        fileName: 'evaluation/all/index.html',
        source: allSource,
      })
    },
  }
}

// Copy the ChartQA runtime data (CSV + Vega-Lite specs fetched at runtime) into
// the build so GitHub Pages can serve <base>/ChartQA/data/**. In dev these are
// served straight from the project root by Vite, so this only runs on build.
// Only `data/` (csv + vlSpec, ~2 MB) is emitted; the large `used_for_study/`
// images are not fetched at runtime and are intentionally excluded.
function chartQaDataPlugin(): Plugin {
  const chartQaDataRoot = path.join(projectRoot, 'ChartQA/data')
  return {
    name: 'chartqa-data',
    generateBundle() {
      for (const filePath of collectStaticFiles(chartQaDataRoot)) {
        const relativePath = path.relative(chartQaDataRoot, filePath)
        this.emitFile({
          type: 'asset',
          fileName: `ChartQA/data/${toPosixPath(relativePath)}`,
          source: fs.readFileSync(filePath),
        })
      }
    },
  }
}

const reviewDirPath = path.join(projectRoot, 'data/review')
// Default file shown when the review page first opens. Falls back to
// review_cases.csv if the preferred file is missing.
const reviewDefaultFile = 'review_cases_updated.csv'
const reviewLegacyDefaultFile = 'review_cases.csv'
// Note: legacy CSVs may still have a single `status` / `feedback` column
// instead of the two-axis form. The FE service auto-migrates on load
// (status value propagates to both axes; feedback value migrates to
// op_feedback only). This header is for brand-new files created here.
const reviewHeaderLine =
  'chart_id,chart_type,op_status,viz_status,question,explanation,operation_spec,op_feedback,viz_feedback,updated_at\n'
// Whitelist regex: simple filename, .csv extension, no path traversal.
const REVIEW_FILENAME_RE = /^[A-Za-z0-9_.-]+\.csv$/

function resolveReviewCsvName(req: { url?: string }): string | null {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const raw = url.searchParams.get('file')?.trim() ?? ''
  if (!raw) return null
  if (!REVIEW_FILENAME_RE.test(raw)) return null
  // Final safety: must not contain a path separator after regex (defensive).
  if (raw.includes('/') || raw.includes('\\')) return null
  return raw
}

async function chooseDefaultFile(): Promise<string> {
  // Prefer review_cases_updated.csv if present; then review_cases.csv;
  // then any existing CSV in the directory; only fall back to the preferred
  // name (for first-PUT creation) when the directory has no CSVs at all.
  try {
    await fs.promises.access(path.join(reviewDirPath, reviewDefaultFile))
    return reviewDefaultFile
  } catch {
    // ignored
  }
  try {
    await fs.promises.access(path.join(reviewDirPath, reviewLegacyDefaultFile))
    return reviewLegacyDefaultFile
  } catch {
    // ignored
  }
  // Fallback: pick the first existing CSV so the page mounts with rows visible.
  // Without this, deleting the preferred files leaves clients loading a phantom
  // filename → the GET returns only the header line → 0 rows on page reload.
  const files = await listReviewFiles()
  if (files.length > 0) return files[0]
  return reviewDefaultFile
}

async function listReviewFiles(): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(reviewDirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
      .map((entry) => entry.name)
      .filter((name) => REVIEW_FILENAME_RE.test(name))
      .sort()
  } catch {
    return []
  }
}

function reviewApiPlugin(): Plugin {
  const handle: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // List endpoint: GET /api/review/files → { files: string[], default: string }
    if (url.pathname === '/api/review/files') {
      try {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Allow', 'GET')
          res.end()
          return
        }
        const files = await listReviewFiles()
        const chosenDefault = await chooseDefaultFile()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ files, default: chosenDefault }))
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: message }))
        return
      }
    }

    if (url.pathname !== '/api/review/csv') {
      next()
      return
    }
    try {
      const requested = resolveReviewCsvName(req)
      const filename = requested ?? (await chooseDefaultFile())
      const reviewCsvPath = path.join(reviewDirPath, filename)
      // Defensive: ensure the resolved path stays inside reviewDirPath.
      if (!reviewCsvPath.startsWith(reviewDirPath + path.sep)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'invalid file' }))
        return
      }
      if (req.method === 'GET') {
        await fs.promises.mkdir(reviewDirPath, { recursive: true })
        let body: string
        try {
          body = await fs.promises.readFile(reviewCsvPath, 'utf8')
        } catch {
          body = reviewHeaderLine
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Review-File', filename)
        res.end(body)
        return
      }
      if (req.method === 'PUT') {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        const body = Buffer.concat(chunks).toString('utf8')
        await fs.promises.mkdir(reviewDirPath, { recursive: true })
        const tmpPath = `${reviewCsvPath}.tmp`
        await fs.promises.writeFile(tmpPath, body, 'utf8')
        await fs.promises.rename(tmpPath, reviewCsvPath)
        const stat = await fs.promises.stat(reviewCsvPath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true, file: filename, updatedAt: stat.mtime.toISOString() }))
        return
      }
      res.statusCode = 405
      res.setHeader('Allow', 'GET, PUT')
      res.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: message }))
    }
  }
  return {
    name: 'review-api',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

// Gold-spec review tool (scratch). Served at /techeval straight from
// data/review so the standalone HTML + its embedded data JS need no copy.
// Dev + preview only; not emitted in production builds.
const techEvalRoot = path.join(projectRoot, 'data/review')
const techEvalUrlPrefix = '/techeval'

function installTechEvalMiddleware(middlewares: Connect.Server) {
  middlewares.use((request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (url.pathname === techEvalUrlPrefix || url.pathname === `${techEvalUrlPrefix}/`) {
      const html = fs.readFileSync(path.join(techEvalRoot, 'scratch_gold_review.html'), 'utf8')
        .replace('scratch_gold_review_data.js', `${techEvalUrlPrefix}/data.js`)
      response.statusCode = 200
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end(html)
      return
    }

    if (url.pathname === `${techEvalUrlPrefix}/data.js`) {
      response.statusCode = 200
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end(fs.readFileSync(path.join(techEvalRoot, 'scratch_gold_review_data.js')))
      return
    }

    // Verdict persistence so the review survives across reloads AND is readable on disk
    // (data/review/scratch_techeval_verdicts.json). GET restores; PUT/POST saves.
    if (url.pathname === `${techEvalUrlPrefix}/verdicts`) {
      const verdictsPath = path.join(techEvalRoot, 'scratch_techeval_verdicts.json')
      if (request.method === 'GET') {
        let body = '{}'
        try { body = fs.readFileSync(verdictsPath, 'utf8') } catch { /* none yet */ }
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(body)
        return
      }
      if (request.method === 'PUT' || request.method === 'POST') {
        const chunks: Buffer[] = []
        request.on('data', (c) => chunks.push(c as Buffer))
        request.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8')
            JSON.parse(text) // validate
            fs.writeFileSync(verdictsPath, text, 'utf8')
            response.statusCode = 200
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }))
          } catch (e) {
            response.statusCode = 400
            response.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
        return
      }
    }

    // Merge the saved verdicts into review_sheet_*.csv (my_gold_verdict/my_gen_verdict/my_note).
    // Triggered on prev/next navigation so the CSVs stay in sync per chart.
    if (url.pathname === `${techEvalUrlPrefix}/commit-csv` && (request.method === 'POST' || request.method === 'GET')) {
      const py = spawn('python3', [path.join(techEvalRoot, 'scratch_merge_verdicts_to_sheets.py')], {
        cwd: projectRoot,
        stdio: 'ignore',
      })
      py.on('error', () => { /* python missing — JSON store still has the data */ })
      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ ok: true, committed: true }))
      return
    }

    next()
  })
}

function techEvalPlugin(): Plugin {
  return {
    name: 'tech-eval-review',
    configureServer(server) {
      installTechEvalMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      installTechEvalMiddleware(server.middlewares)
    },
  }
}

// GitHub Pages has no server-side SPA rewrite, so a deep link like
// /prj-vis-exp/pre-registration 404s. Copying the built index.html to 404.html
// makes Pages serve the SPA for any unknown path; the client router (web/App.tsx)
// then resolves the pathname. Build-only.
function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const indexPath = path.join(projectRoot, 'dist', 'index.html')
      const fallbackPath = path.join(projectRoot, 'dist', '404.html')
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, fallbackPath)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project site under /prj-vis-exp/. Production builds
  // must prefix every asset URL with it; dev + e2e stay at root '/' so the
  // existing middleware routes (/evaluation, /validation, /api/review) keep working.
  base: command === 'build' ? '/prj-vis-exp/' : '/',
  plugins: [react(), validationViewerPlugin(), evaluationViewerPlugin(), chartQaDataPlugin(), reviewApiPlugin(), techEvalPlugin(), spaFallbackPlugin()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@codemirror') || id.includes('/codemirror/') || id.includes('/lezer/')) {
            return 'vendor-codemirror'
          }
          if (id.includes('/vega') || id.includes('/vega-lite') || id.includes('/vega-embed')) {
            return 'vendor-vega'
          }
          if (id.includes('/d3')) {
            return 'vendor-d3'
          }
          if (id.includes('/firebase')) {
            return 'vendor-firebase'
          }
          if (id.includes('/react')) {
            return 'vendor-react'
          }
          return 'vendor-misc'
        },
      },
    },
  },
}))
