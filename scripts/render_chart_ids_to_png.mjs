#!/usr/bin/env node
/**
 * Render ChartQA Vega-Lite specs by chart id via existing Workbench render flow,
 * then save chart-host screenshots as PNG.
 *
 * Usage examples:
 *   node scripts/render_chart_ids_to_png.mjs --ids 10x2rgiqw97wdspi,0o12tngadmjjux2n
 *   node scripts/render_chart_ids_to_png.mjs --ids-file /tmp/chart_ids.json
 *
 * Notes:
 * - This script uses the existing Workbench "Render Chart" button path.
 * - Run `npm run dev` first (default base-url: http://127.0.0.1:5173).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

function parseArgs(argv) {
  const args = {
    ids: [],
    idsFile: '',
    outDir: 'data/rendered_png',
    baseUrl: 'http://localhost:5173',
    specRoot: 'ChartQA/data/vlSpec',
    waitMs: 250,
    navTimeoutMs: 30000,
    renderTimeoutMs: 20000,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--ids') {
      const value = argv[i + 1] ?? ''
      args.ids = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      i += 1
      continue
    }
    if (token === '--ids-file') {
      args.idsFile = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token === '--out-dir') {
      args.outDir = argv[i + 1] ?? args.outDir
      i += 1
      continue
    }
    if (token === '--base-url') {
      args.baseUrl = argv[i + 1] ?? args.baseUrl
      i += 1
      continue
    }
    if (token === '--spec-root') {
      args.specRoot = argv[i + 1] ?? args.specRoot
      i += 1
      continue
    }
    if (token === '--wait-ms') {
      const parsed = Number(argv[i + 1] ?? '')
      if (Number.isFinite(parsed) && parsed >= 0) args.waitMs = parsed
      i += 1
      continue
    }
    if (token === '--nav-timeout-ms') {
      const parsed = Number(argv[i + 1] ?? '')
      if (Number.isFinite(parsed) && parsed > 0) args.navTimeoutMs = parsed
      i += 1
      continue
    }
    if (token === '--render-timeout-ms') {
      const parsed = Number(argv[i + 1] ?? '')
      if (Number.isFinite(parsed) && parsed > 0) args.renderTimeoutMs = parsed
      i += 1
      continue
    }
  }

  return args
}

async function loadIdsFromFile(filePath) {
  const text = await fs.readFile(filePath, 'utf-8')
  const trimmed = text.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      throw new Error(`ids file must be a JSON array: ${filePath}`)
    }
    return parsed.map((entry) => String(entry).trim()).filter(Boolean)
  }

  return trimmed
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function walkJsonFiles(rootDir) {
  const out = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(nextPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        out.push(nextPath)
      }
    }
  }
  return out
}

async function buildIdToSpecPathMap(specRoot) {
  const files = await walkJsonFiles(specRoot)
  const map = new Map()
  for (const file of files) {
    const id = path.basename(file, '.json')
    if (!map.has(id)) {
      map.set(id, file)
    }
  }
  return map
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const outDir = path.resolve(cwd, args.outDir)
  const specRoot = path.resolve(cwd, args.specRoot)

  let ids = [...args.ids]
  if (args.idsFile) {
    const fromFile = await loadIdsFromFile(path.resolve(cwd, args.idsFile))
    ids = ids.length > 0 ? ids : fromFile
  }
  ids = Array.from(new Set(ids))

  if (ids.length === 0) {
    throw new Error('No chart ids provided. Use --ids or --ids-file.')
  }

  const idToSpecPath = await buildIdToSpecPathMap(specRoot)
  await ensureDir(outDir)

  process.stdout.write(`[render_chart_ids_to_png] ids=${ids.length} specRoot=${path.relative(cwd, specRoot)} outDir=${path.relative(cwd, outDir)}\n`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const manifest = []

  try {
    process.stdout.write(`[render_chart_ids_to_png] opening ${args.baseUrl}\n`)
    await page.goto(args.baseUrl, { waitUntil: 'domcontentloaded', timeout: args.navTimeoutMs })
    await page.locator('[data-testid="vl-spec-input"]').waitFor({ state: 'visible', timeout: args.renderTimeoutMs })

    for (let idx = 0; idx < ids.length; idx += 1) {
      const id = ids[idx]
      const specPath = idToSpecPath.get(id)
      process.stdout.write(`[render_chart_ids_to_png] [${idx + 1}/${ids.length}] id=${id}\n`)
      if (!specPath) {
        manifest.push({ id, status: 'missing_spec', message: 'spec json not found under specRoot' })
        process.stdout.write(`[render_chart_ids_to_png] [${idx + 1}/${ids.length}] missing spec\n`)
        continue
      }

      try {
        const specText = await fs.readFile(specPath, 'utf-8')
        await page.locator('[data-testid="vl-spec-input"]').fill(specText)
        await page.locator('[data-testid="render-chart-button"]').click()

        const host = page.locator('[data-testid="chart-host"]')
        await host.waitFor({ state: 'visible', timeout: args.renderTimeoutMs })
        await host.locator('svg, canvas').first().waitFor({ state: 'visible', timeout: args.renderTimeoutMs })
        if (args.waitMs > 0) await page.waitForTimeout(args.waitMs)

        const outputPath = path.join(outDir, `${id}.png`)
        await host.screenshot({ path: outputPath })
        manifest.push({ id, status: 'ok', specPath: path.relative(cwd, specPath), outputPath: path.relative(cwd, outputPath) })
        process.stdout.write(`[render_chart_ids_to_png] [${idx + 1}/${ids.length}] saved ${path.relative(cwd, outputPath)}\n`)
      } catch (error) {
        manifest.push({
          id,
          status: 'render_failed',
          specPath: path.relative(cwd, specPath),
          message: error instanceof Error ? error.message : String(error),
        })
        process.stdout.write(
          `[render_chart_ids_to_png] [${idx + 1}/${ids.length}] failed: ${error instanceof Error ? error.message : String(error)}\n`,
        )
      }
    }
  } finally {
    await browser.close()
  }

  const manifestPath = path.join(outDir, 'manifest.json')
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

  const summary = {
    total: manifest.length,
    ok: manifest.filter((m) => m.status === 'ok').length,
    failed: manifest.filter((m) => m.status !== 'ok').length,
    manifest: path.relative(cwd, manifestPath),
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`[render_chart_ids_to_png] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
