import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const includeDirs = [
  path.join(root, 'src/rendering/ops/visual'),
  path.join(root, 'data/expert'),
]
const includeExtensions = new Set(['.ts'])

function listFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return []
  const output = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      output.push(...listFiles(fullPath))
      continue
    }
    if (!includeExtensions.has(path.extname(entry.name))) continue
    output.push(fullPath)
  }
  return output
}

function reportAndExit(files, violations, engine) {
  if (violations.length > 0) {
    console.error(`[authoring-style:${engine}] Found forbidden object-style authoring patterns:`)
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line}:${violation.column} [${violation.id}] ${violation.message}`)
    }
    process.exit(1)
  }
  console.log(`[authoring-style:${engine}] Checked ${files.length} files. No forbidden object-style authoring patterns found.`)
}

function createViolation(filePath, line, column, id, message) {
  return {
    file: path.relative(root, filePath),
    line,
    column,
    id,
    message,
  }
}

function inspectWithTypeScriptAst(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const violations = []

  const isIdentifier = (node, text) => ts.isIdentifier(node) && node.text === text
  const at = (node) => {
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    return { line: pos.line + 1, column: pos.character + 1 }
  }

  const unwrapExpression = (node) => {
    let current = node
    // unwrap common wrappers so `({ ... } as DrawTextSpec)` is still caught
    while (current) {
      if (ts.isParenthesizedExpression(current)) {
        current = current.expression
        continue
      }
      if (ts.isAsExpression(current)) {
        current = current.expression
        continue
      }
      if (ts.isTypeAssertionExpression(current)) {
        current = current.expression
        continue
      }
      if (ts.isNonNullExpression(current)) {
        current = current.expression
        continue
      }
      if (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(current)) {
        current = current.expression
        continue
      }
      break
    }
    return current
  }

  const getOpsDrawMethodName = (call) => {
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return null
    const outer = call.expression
    if (!ts.isIdentifier(outer.name)) return null
    const inner = outer.expression
    if (!ts.isPropertyAccessExpression(inner)) return null
    if (!ts.isIdentifier(inner.name) || inner.name.text !== 'draw') return null
    if (!ts.isIdentifier(inner.expression) || inner.expression.text !== 'ops') return null
    return outer.name.text
  }

  const checkOpsDrawArgs = (node) => {
    const method = getOpsDrawMethodName(node)
    if (!method) return

    const specArgIndexByMethod = {
      highlight: [1],
      dim: [1],
      lineTrace: [1],
      text: [1, 2],
      line: [1],
      rect: [1],
      filter: [1],
      split: [1],
      barSegment: [2],
      sum: [1],
      stackedToGrouped: [1],
      groupedToStacked: [1],
    }

    const indices = specArgIndexByMethod[method]
    if (!indices) return

    for (const index of indices) {
      const arg = node.arguments[index]
      if (!arg) continue
      const unwrapped = unwrapExpression(arg)
      if (unwrapped && ts.isObjectLiteralExpression(unwrapped)) {
        const { line, column } = at(node)
        violations.push(
          createViolation(
            filePath,
            line,
            column,
            'ops.draw-object-args',
            `ops.draw.${method}(...) must not receive object literals. Use authoring builders (draw.*Spec / draw.select.*) instead.`,
          ),
        )
        return
      }
    }
  }

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression
      const firstArg = node.arguments[0]
      if (firstArg && ts.isObjectLiteralExpression(firstArg) && isIdentifier(target, 'drawOps')) {
        const { line, column } = at(node)
        violations.push(
          createViolation(filePath, line, column, 'drawOps-object-args', 'drawOps.*({ ... }) is forbidden in authoring code.'),
        )
      }
      if (firstArg && ts.isObjectLiteralExpression(firstArg) && isIdentifier(target, 'dataOps')) {
        const { line, column } = at(node)
        violations.push(
          createViolation(filePath, line, column, 'dataOps-object-args', 'dataOps.*({ ... }) is forbidden in authoring code.'),
        )
      }
    }

    if (ts.isCallExpression(node)) {
      checkOpsDrawArgs(node)
    }

    if (ts.isVariableDeclaration(node) && node.type && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const typeText = node.type.getText(sourceFile)
      if (/^Draw\w*Spec$/.test(typeText)) {
        const { line, column } = at(node)
        violations.push(
          createViolation(filePath, line, column, 'draw-spec-object', 'Draw*Spec object literals are forbidden in authoring code.'),
        )
      }
      if (/^Op\w*Spec$/.test(typeText)) {
        const { line, column } = at(node)
        violations.push(
          createViolation(filePath, line, column, 'op-spec-object', 'Op*Spec object literals are forbidden in authoring code.'),
        )
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

async function inspectWithTsMorph(files) {
  const mod = await import('ts-morph')
  const { Node, Project } = mod
  const project = new Project({ skipAddingFilesFromTsConfig: true })
  project.addSourceFilesAtPaths(files)
  const violations = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    for (const node of sourceFile.getDescendants()) {
      if (Node.isCallExpression(node) && Node.isPropertyAccessExpression(node.getExpression())) {
        const expression = node.getExpression()
        const target = expression.getExpression()
        const firstArg = node.getArguments()[0]
        const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart())
        if (firstArg && Node.isObjectLiteralExpression(firstArg) && Node.isIdentifier(target) && target.getText() === 'drawOps') {
          violations.push(
            createViolation(filePath, line, column, 'drawOps-object-args', 'drawOps.*({ ... }) is forbidden in authoring code.'),
          )
        }
        if (firstArg && Node.isObjectLiteralExpression(firstArg) && Node.isIdentifier(target) && target.getText() === 'dataOps') {
          violations.push(
            createViolation(filePath, line, column, 'dataOps-object-args', 'dataOps.*({ ... }) is forbidden in authoring code.'),
          )
        }

        // ops.draw.* must not accept object literals for select/spec inputs.
        if (Node.isPropertyAccessExpression(target) && Node.isIdentifier(target.getExpression()) && target.getExpression().getText() === 'ops' && target.getName() === 'draw') {
          const method = expression.getName()
          const specArgIndexByMethod = {
            highlight: [1],
            dim: [1],
            lineTrace: [1],
            text: [1, 2],
            line: [1],
            rect: [1],
            filter: [1],
            split: [1],
            barSegment: [2],
            sum: [1],
            stackedToGrouped: [1],
            groupedToStacked: [1],
          }
          const indices = specArgIndexByMethod[method]
          if (indices) {
            for (const index of indices) {
              const arg = node.getArguments()[index]
              if (arg && Node.isObjectLiteralExpression(arg)) {
                violations.push(
                  createViolation(
                    filePath,
                    line,
                    column,
                    'ops.draw-object-args',
                    `ops.draw.${method}(...) must not receive object literals. Use authoring builders (draw.*Spec / draw.select.*) instead.`,
                  ),
                )
                break
              }
            }
          }
        }
      }
      if (Node.isVariableDeclaration(node) && node.getTypeNode() && node.getInitializer() && Node.isObjectLiteralExpression(node.getInitializer())) {
        const typeText = node.getTypeNode().getText()
        const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart())
        if (/^Draw\w*Spec$/.test(typeText)) {
          violations.push(
            createViolation(filePath, line, column, 'draw-spec-object', 'Draw*Spec object literals are forbidden in authoring code.'),
          )
        }
        if (/^Op\w*Spec$/.test(typeText)) {
          violations.push(
            createViolation(filePath, line, column, 'op-spec-object', 'Op*Spec object literals are forbidden in authoring code.'),
          )
        }
      }
    }
  }
  return violations
}

async function main() {
  const files = includeDirs.flatMap(listFiles)
  try {
    const violations = await inspectWithTsMorph(files)
    reportAndExit(files, violations, 'ts-morph')
    return
  } catch {
    const violations = files.flatMap(inspectWithTypeScriptAst)
    reportAndExit(files, violations, 'typescript-ast-fallback')
  }
}

await main()
