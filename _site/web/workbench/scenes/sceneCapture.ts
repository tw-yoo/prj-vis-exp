import type { OperationSpec } from '../../../src/api/types'

type DirectoryPicker = (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>

type PickerWindow = Window & {
  showDirectoryPicker?: DirectoryPicker
}

export type SceneCaptureFinishResult = {
  mode: 'directory' | 'zip'
  label: string
}

export type SceneCaptureWriter = {
  start(planStem: string): Promise<void>
  write(sceneIndex: number, operation: OperationSpec, blob: Blob): Promise<void>
  finish(): Promise<SceneCaptureFinishResult>
}

type ZipDownload = (blob: Blob, filename: string) => void

const sanitizeToken = (value: string) => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized.length > 0 ? normalized : 'op'
}

const toOperationToken = (operation: OperationSpec) => {
  if (operation.op === 'draw') {
    const action = (operation as { action?: unknown }).action
    const actionToken = action == null ? 'unknown' : String(action)
    return sanitizeToken(`draw_${actionToken}`)
  }
  return sanitizeToken(`data_${operation.op}`)
}

const toSceneFileName = (sceneIndex: number, operation: OperationSpec) => {
  const index = String(sceneIndex).padStart(3, '0')
  return `${index}_${toOperationToken(operation)}.png`
}

class DirectorySceneCaptureWriter implements SceneCaptureWriter {
  private readonly pickDirectory: DirectoryPicker
  private planStem = ''
  private planDir: FileSystemDirectoryHandle | null = null

  constructor(pickDirectory: DirectoryPicker) {
    this.pickDirectory = pickDirectory
  }

  async start(planStem: string) {
    this.planStem = planStem
    const root = await this.pickDirectory({ mode: 'readwrite' })
    const scenesDir = await root.getDirectoryHandle('scenes', { create: true })
    const planDir = await scenesDir.getDirectoryHandle(planStem, { create: true })
    await this.clearExistingPng(planDir)
    this.planDir = planDir
  }

  async write(sceneIndex: number, operation: OperationSpec, blob: Blob) {
    if (!this.planDir) {
      throw new Error('Scene capture directory is not initialized.')
    }
    const filename = toSceneFileName(sceneIndex, operation)
    const fileHandle = await this.planDir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
  }

  async finish(): Promise<SceneCaptureFinishResult> {
    return {
      mode: 'directory',
      label: `scenes/${this.planStem}`,
    }
  }

  private async clearExistingPng(dir: FileSystemDirectoryHandle) {
    const iterableDir = dir as FileSystemDirectoryHandle & {
      entries?: () => AsyncIterable<[string, FileSystemHandle]>
    }
    if (!iterableDir.entries) return
    for await (const [name, handle] of iterableDir.entries()) {
      if (handle.kind === 'file' && name.toLowerCase().endsWith('.png')) {
        await dir.removeEntry(name)
      }
    }
  }
}

class ZipSceneCaptureWriter implements SceneCaptureWriter {
  private readonly download: ZipDownload
  private entries: Array<{ path: string; blob: Blob }> = []
  private planStem = ''

  constructor(download: ZipDownload) {
    this.download = download
  }

  async start(planStem: string) {
    this.planStem = planStem
    this.entries = []
  }

  async write(sceneIndex: number, operation: OperationSpec, blob: Blob) {
    const filename = toSceneFileName(sceneIndex, operation)
    this.entries.push({
      path: `scenes/${this.planStem}/${filename}`,
      blob,
    })
  }

  async finish(): Promise<SceneCaptureFinishResult> {
    const zipBlob = await buildZipBlob(this.entries)
    const archiveName = `scenes_${this.planStem}.zip`
    this.download(zipBlob, archiveName)
    return {
      mode: 'zip',
      label: archiveName,
    }
  }
}

export function createSceneCaptureWriter(download: ZipDownload): SceneCaptureWriter {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (typeof picker === 'function') {
    return new DirectorySceneCaptureWriter(picker)
  }
  return new ZipSceneCaptureWriter(download)
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let j = 0; j < 8; j += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value >>> 8) ^ crcTable[(value ^ bytes[i]) & 0xff]
  }
  return (value ^ 0xffffffff) >>> 0
}

function writeU16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeU32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function concatChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function toDosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  return {
    dosDate: dosDate & 0xffff,
    dosTime: dosTime & 0xffff,
  }
}

type ZipBinaryEntry = {
  pathBytes: Uint8Array
  data: Uint8Array
  crc: number
  offset: number
}

function createLocalHeader(entry: ZipBinaryEntry, dosDate: number, dosTime: number) {
  const header = new Uint8Array(30 + entry.pathBytes.length)
  writeU32(header, 0, 0x04034b50)
  writeU16(header, 4, 20)
  writeU16(header, 6, 0)
  writeU16(header, 8, 0)
  writeU16(header, 10, dosTime)
  writeU16(header, 12, dosDate)
  writeU32(header, 14, entry.crc)
  writeU32(header, 18, entry.data.length)
  writeU32(header, 22, entry.data.length)
  writeU16(header, 26, entry.pathBytes.length)
  writeU16(header, 28, 0)
  header.set(entry.pathBytes, 30)
  return header
}

function createCentralHeader(entry: ZipBinaryEntry, dosDate: number, dosTime: number) {
  const header = new Uint8Array(46 + entry.pathBytes.length)
  writeU32(header, 0, 0x02014b50)
  writeU16(header, 4, 20)
  writeU16(header, 6, 20)
  writeU16(header, 8, 0)
  writeU16(header, 10, 0)
  writeU16(header, 12, dosTime)
  writeU16(header, 14, dosDate)
  writeU32(header, 16, entry.crc)
  writeU32(header, 20, entry.data.length)
  writeU32(header, 24, entry.data.length)
  writeU16(header, 28, entry.pathBytes.length)
  writeU16(header, 30, 0)
  writeU16(header, 32, 0)
  writeU16(header, 34, 0)
  writeU16(header, 36, 0)
  writeU32(header, 38, 0)
  writeU32(header, 42, entry.offset)
  header.set(entry.pathBytes, 46)
  return header
}

function createEndOfCentralDirectory(entryCount: number, centralDirSize: number, centralDirOffset: number) {
  const eocd = new Uint8Array(22)
  writeU32(eocd, 0, 0x06054b50)
  writeU16(eocd, 4, 0)
  writeU16(eocd, 6, 0)
  writeU16(eocd, 8, entryCount)
  writeU16(eocd, 10, entryCount)
  writeU32(eocd, 12, centralDirSize)
  writeU32(eocd, 16, centralDirOffset)
  writeU16(eocd, 20, 0)
  return eocd
}

async function buildZipBlob(entries: Array<{ path: string; blob: Blob }>) {
  const encoder = new TextEncoder()
  const binaryEntries: ZipBinaryEntry[] = []
  let offset = 0

  for (const entry of entries) {
    const pathBytes = encoder.encode(entry.path)
    const data = new Uint8Array(await entry.blob.arrayBuffer())
    const binaryEntry: ZipBinaryEntry = {
      pathBytes,
      data,
      crc: crc32(data),
      offset,
    }
    offset += 30 + pathBytes.length + data.length
    binaryEntries.push(binaryEntry)
  }

  const now = new Date()
  const { dosDate, dosTime } = toDosDateTime(now)
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  for (const entry of binaryEntries) {
    localChunks.push(createLocalHeader(entry, dosDate, dosTime), entry.data)
    centralChunks.push(createCentralHeader(entry, dosDate, dosTime))
  }

  const localData = concatChunks(localChunks)
  const centralData = concatChunks(centralChunks)
  const eocd = createEndOfCentralDirectory(binaryEntries.length, centralData.length, localData.length)
  return new Blob([localData, centralData, eocd], { type: 'application/zip' })
}
