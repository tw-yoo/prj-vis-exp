import { toDatumValuesFromRaw, type DatumValue, type RawRow } from '../src/api/types'

export function getFileName(moduleUrl: string): string {
  if (!moduleUrl) return ''
  const withoutQuery = moduleUrl.split('?')[0]
  const parts = withoutQuery.split('/')
  return parts[parts.length - 1] ?? ''
}

export function getFileBaseName(moduleUrl: string): string {
  const fileName = getFileName(moduleUrl)
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) return fileName
  return fileName.slice(0, dotIndex)
}

export type DatumBuildOptions = {
  xField?: string
  yField?: string
  groupField?: string
  idField?: string
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out
}

function parseCsv(text: string): Array<Record<string, string>> {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      row[header] = (cols[idx] ?? '').trim()
    })
    return row
  })
}

function inferFieldConfig(
  rows: Array<Record<string, string>>,
  filePath: string,
  options: DatumBuildOptions,
): { xField: string; yField: string; groupField?: string; idField?: string } {
  const sample = rows[0] ?? {}
  const headers = Object.keys(sample)
  if (headers.length < 2) {
    throw new Error('CSV must have at least two columns.')
  }

  if (options.xField && options.yField) {
    return {
      xField: options.xField,
      yField: options.yField,
      groupField: options.groupField,
      idField: options.idField,
    }
  }

  const normalizedPath = filePath.toLowerCase()
  const isGroupedShape =
    normalizedPath.includes('/bar/grouped/') ||
    normalizedPath.includes('/bar/stacked/') ||
    normalizedPath.includes('/line/multiple/')

  if (isGroupedShape && headers.length >= 3) {
    return {
      xField: options.xField ?? headers[0],
      groupField: options.groupField ?? headers[1],
      yField: options.yField ?? headers[2],
      idField: options.idField,
    }
  }

  const numericCandidates = headers.filter((header) =>
    rows.some((row) => Number.isFinite(Number(row[header]))),
  )
  const xField = options.xField ?? headers[0]
  const yField =
    options.yField ??
    numericCandidates.find((header) => header !== xField) ??
    headers[Math.min(1, headers.length - 1)]

  return {
    xField,
    yField,
    groupField: options.groupField,
    idField: options.idField,
  }
}

export function rowsToDatumValues(
  rows: Array<Record<string, string | number | null | undefined>>,
  options: DatumBuildOptions & { filePathHint?: string } = {},
): DatumValue[] {
  const normalizedRows: RawRow[] = rows.map((row) => {
    const next: RawRow = {}
    Object.entries(row).forEach(([key, value]) => {
      if (value === undefined) return
      next[key] = value
    })
    return next
  })
  if (!normalizedRows.length) return []

  const fields = inferFieldConfig(
    normalizedRows as unknown as Array<Record<string, string>>,
    options.filePathHint ?? '',
    options,
  )

  return toDatumValuesFromRaw(
    normalizedRows,
    {
      xField: fields.xField,
      yField: fields.yField,
      groupField: fields.groupField,
    },
    {
      idField: fields.idField,
      groupFallback: (row: RawRow) => {
        const candidate = row.group ?? row.color ?? row.series ?? null
        return candidate == null ? null : String(candidate)
      },
    },
  ).filter((datum: DatumValue) => Number.isFinite(datum.value))
}

export async function loadDatumValuesFromFilePath(
  filePath: string,
  options: DatumBuildOptions = {},
): Promise<DatumValue[]> {
  const response = await fetch(filePath)
  if (!response.ok) {
    throw new Error(`Failed to load file: ${filePath} (${response.status})`)
  }
  const text = await response.text()
  const rows = parseCsv(text)
  return rowsToDatumValues(rows, { ...options, filePathHint: filePath })
}

export function getFileCsvPath(filePath: string): string {
  const baseName = getFileBaseName(filePath)
  const match = /^\d+_(bar|line)_(simple|stacked|grouped|multiple)_[ab]_([a-z0-9]+)/i.exec(baseName)
  if (!match) return ''

  const chartKind = match[1]
  const chartVariant = match[2]
  const chartId = match[3]
  return `ChartQA/data/csv/${chartKind}/${chartVariant}/${chartId}.csv`
}
