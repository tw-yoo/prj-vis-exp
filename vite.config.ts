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

function isEvaluationViewerRoute(urlPathname: string) {
  if (urlPathname === evaluationUrlPrefix || urlPathname === `${evaluationUrlPrefix}/`) {
    return true
  }

  if (!urlPathname.startsWith(`${evaluationUrlPrefix}/`)) {
    return false
  }

  const relativeParts = urlPathname
    .slice(evaluationUrlPrefix.length + 1)
    .split('/')
    .filter(Boolean)

  return relativeParts.length === 1 || (relativeParts.length === 2 && relativeParts[1] === 'index.html')
}

function evaluationIndexSource(scriptSrc: string) {
  return fs.readFileSync(path.join(evaluationRoot, 'index.html'), 'utf8')
    .replace('__EVALUATION_VIEWER_SCRIPT__', scriptSrc)
}

function sendEvaluationFile(response: ServerResponse, filePath: string) {
  response.statusCode = 200
  response.setHeader('Content-Type', staticViewerMimeTypes[path.extname(filePath)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  response.end(fs.readFileSync(filePath))
}

function sendEvaluationIndex(response: ServerResponse, scriptSrc: string) {
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(evaluationIndexSource(scriptSrc))
}

function installEvaluationMiddleware(middlewares: Connect.Server, scriptSrc: string) {
  middlewares.use((request, response, next) => {
    const requestUrl = request.url ?? '/'
    const url = new URL(requestUrl, 'http://localhost')

    const staticPath = getEvaluationStaticPath(url.pathname)

    if (staticPath && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      if (path.basename(staticPath) === 'index.html') {
        sendEvaluationIndex(response, scriptSrc)
        return
      }
      sendEvaluationFile(response, staticPath)
      return
    }

    if (isEvaluationViewerRoute(url.pathname)) {
      sendEvaluationIndex(response, scriptSrc)
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

function getEvaluationExpertIds() {
  const chartMapPath = path.join(evaluationRoot, 'chart_map.json')
  if (!fs.existsSync(chartMapPath)) return []
  const chartMap = JSON.parse(fs.readFileSync(chartMapPath, 'utf8')) as Record<string, unknown>
  return Object.keys(chartMap)
}

function evaluationViewerPlugin(): Plugin {
  let isBuild = false

  return {
    name: 'evaluation-viewer',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    configureServer(server) {
      installEvaluationMiddleware(server.middlewares, '/src/evaluation/viewer.ts')
    },
    configurePreviewServer(server) {
      installEvaluationMiddleware(server.middlewares, '/evaluation/viewer.js')
    },
    buildStart() {
      if (!isBuild) return
      this.emitFile({
        type: 'chunk',
        id: evaluationViewerEntry,
        fileName: 'evaluation/viewer.js',
      })
    },
    generateBundle() {
      const indexSource = evaluationIndexSource('/evaluation/viewer.js')
      for (const filePath of collectStaticFiles(evaluationRoot)) {
        const relativePath = path.relative(evaluationRoot, filePath)
        if (relativePath === 'index.html') {
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
        source: indexSource,
      })

      for (const expertId of getEvaluationExpertIds()) {
        this.emitFile({
          type: 'asset',
          fileName: `evaluation/${expertId}/index.html`,
          source: indexSource,
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), validationViewerPlugin(), evaluationViewerPlugin()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
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
})
