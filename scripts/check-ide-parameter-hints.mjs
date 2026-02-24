import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.app.json')
if (!configPath) {
  console.error('[check:ide-hints] tsconfig.app.json not found.')
  process.exit(1)
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
  console.error('[check:ide-hints] Failed to read tsconfig:', configFile.error.messageText)
  process.exit(1)
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))
if (parsedConfig.errors && parsedConfig.errors.length > 0) {
  console.error('[check:ide-hints] Failed to parse tsconfig:')
  for (const error of parsedConfig.errors) {
    console.error(`- ${error.messageText}`)
  }
  process.exit(1)
}

const program = ts.createProgram({ rootNames: parsedConfig.fileNames, options: parsedConfig.options })
const checker = program.getTypeChecker()

const drawFilePath = path.resolve(root, 'src/operation/build/authoring/draw.ts')
const sourceFile = program.getSourceFile(drawFilePath)
if (!sourceFile) {
  console.error('[check:ide-hints] Source file not found:', drawFilePath)
  process.exit(1)
}

function findVariableDeclaration(name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue
      if (decl.name.text === name) return decl
    }
  }
  return null
}

const drawActionsDecl = findVariableDeclaration('drawActions')
if (!drawActionsDecl) {
  console.error('[check:ide-hints] `drawActions` declaration not found in draw.ts.')
  process.exit(1)
}

const drawActionsType = checker.getTypeAtLocation(drawActionsDecl.name)
const textSymbol = drawActionsType.getProperty('text')
if (!textSymbol) {
  console.error('[check:ide-hints] `drawActions.text` symbol not found.')
  process.exit(1)
}

const textType = checker.getTypeOfSymbolAtLocation(textSymbol, drawActionsDecl.name)
const signatures = textType.getCallSignatures()
if (!signatures || signatures.length === 0) {
  console.error('[check:ide-hints] `drawActions.text` has no call signatures.')
  process.exit(1)
}

const signatureStrings = signatures.map((sig) => checker.signatureToString(sig))
const first = signatureStrings[0] ?? ''

const requiredInFirst = [
  'DrawSelectKeys',
  'DrawSelectMarkKeys',
  'DrawTextSpecAnchor',
  'DrawTextSpecNormalized',
]

const missingInFirst = requiredInFirst.filter((token) => !first.includes(token))
if (missingInFirst.length > 0) {
  console.error('[check:ide-hints] First overload does not expose required variant types:', missingInFirst.join(', '))
  console.error('[check:ide-hints] Observed overloads:')
  for (const sig of signatureStrings) console.error(`- ${sig}`)
  process.exit(1)
}

console.log('[check:ide-hints] IDE signature exposure check passed.')

