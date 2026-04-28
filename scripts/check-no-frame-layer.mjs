// Dead-code guard: ensure the removed visualization-frame architecture is not
// reintroduced by accident. The frame layer (VisualizationFrame, frameRenderer,
// planFrames, the parallel src/rendering/primitives/ family, OperationNode tree)
// was deleted as part of the operation-next correction work because it ran in
// parallel to the legacy rendering path without contributing to actual drawing.
//
// If you genuinely need to reintroduce a frame-style architecture, do it as a
// dedicated initiative with a clear migration plan rather than letting these
// terms creep back in alongside the legacy primitives.

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const srcRoot = path.join(root, 'src')
const IGNORED_DIRS = new Set(['.claude', '.cache', 'node_modules', 'dist'])

const FORBIDDEN_PATHS = [
  // Module paths (relative to src/)
  'operation-next/visualizationFrame.ts',
  'operation-next/visualizationPlanner.ts',
  'operation-next/frameRenderer.ts',
  'operation-next/syntheticMark.ts',
  'operation-next/operationTree.ts',
]

const FORBIDDEN_DIRS = [
  // Parallel primitive family that coexisted with src/operation-next/primitives/.
  'rendering/primitives',
]

const FORBIDDEN_IDENTIFIERS = [
  // Any reintroduction of these symbols anywhere under src/ should fail the build.
  'VisualizationFrame',
  'createVisualizationFrame',
  'createFrameAfterOperation',
  'renderFrameTransition',
  'planFrames',
  'OperationNode',
  'buildTreeFromList',
  'topologicalLinearize',
  'SyntheticMark',
  'TensionFrameConfig',
  'resolveFrameConfig',
  'OPERATION_TRANSFORM_RECOMMENDATIONS',
]

const violations = []

const walk = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue
    inspectFile(fullPath)
  }
}

const inspectFile = (filePath) => {
  const relPath = path.relative(root, filePath).split(path.sep).join('/')
  for (const forbiddenPath of FORBIDDEN_PATHS) {
    if (relPath === `src/${forbiddenPath}`) {
      violations.push(`${relPath}: removed frame-layer file is back; delete it or open a dedicated migration plan.`)
    }
  }
  for (const forbiddenDir of FORBIDDEN_DIRS) {
    if (relPath.startsWith(`src/${forbiddenDir}/`)) {
      violations.push(`${relPath}: parallel primitive directory is back (src/${forbiddenDir}); the legacy path is src/operation-next/primitives.`)
    }
  }
  const text = fs.readFileSync(filePath, 'utf8')
  for (const identifier of FORBIDDEN_IDENTIFIERS) {
    const pattern = new RegExp(`\\b${identifier}\\b`)
    if (pattern.test(text)) {
      violations.push(`${relPath}: forbidden identifier "${identifier}" reintroduced.`)
    }
  }
}

walk(srcRoot)

if (violations.length > 0) {
  console.error('[check-no-frame-layer] removed frame-layer architecture has crept back in:')
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}

console.log('[check-no-frame-layer] no frame-layer regression detected.')
