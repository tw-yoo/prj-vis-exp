import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChartTypeValue } from '../utils/chartRenderer'
import type { OperationSpec } from '../types'
import { OperationOp } from '../types'
import { operationRegistry } from './registry'
import type {
  FieldOptionsSource,
  FieldSchema,
  OpsBuilderBlock,
  OpsBuilderGroup,
  OpsBuilderOptionSources,
  OpsBuilderState,
  OperationSchema,
} from './types'
import { useUndoState } from './useUndo'
import { exportOps } from './serialize'
import { importOpsBuilderStateFromJsonText } from './importer'
import { validateOps } from './validate'
import { makeId } from './id'
import './OpsBuilder.css'

type OpsBuilderProps = {
  chartType: ChartTypeValue | null
  optionSources?: OpsBuilderOptionSources
  onExportChange: (groups: OperationSpec[][], errors: Record<string, string>) => void
  validationTick?: number
}

const defaultState = (): OpsBuilderState => ({
  groups: [{ id: makeId('group'), name: 'ops', disabled: false, blocks: [] }],
})

const emptyOptionSources: OpsBuilderOptionSources = {
  targets: [],
  series: [],
  ids: [],
  values: [],
  fields: [],
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const uniqueOptions = (items: Array<string> | undefined) => {
  if (!items || items.length === 0) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  items.forEach((item) => {
    const normalized = String(item).trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  })
  return out.length ? out : undefined
}

const resolveOptionsForSource = (source: FieldOptionsSource | undefined, sources: OpsBuilderOptionSources) => {
  if (!source) return undefined
  switch (source) {
    case 'target':
      return sources.targets
    case 'series':
      return sources.series
    case 'id':
      return sources.ids.length ? sources.ids : sources.targets
    case 'value':
      return sources.values
    case 'field':
      return sources.fields
    case 'dataKey':
      return [...sources.targets, ...sources.series, ...sources.ids, ...sources.values]
    default:
      return undefined
  }
}

const resolveSchemaOptions = (
  options: Array<string> | undefined,
  optionsSource: FieldOptionsSource | undefined,
  sources: OpsBuilderOptionSources,
) => {
  const explicit = uniqueOptions(options)
  if (explicit && explicit.length) return explicit
  const fromSource = uniqueOptions(resolveOptionsForSource(optionsSource, sources))
  return fromSource && fromSource.length ? fromSource : undefined
}

const sanitizeJsonInput = (value: string) => {
  if (!value) return value
  let text = value
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const isBlankLine = (line: string) => line.trim() === ''
  const isMarkerLine = (line: string) => {
    const trimmed = line.trim()
    return trimmed === '---' || trimmed.startsWith('```')
  }

  let start = 0
  let end = lines.length

  const dropLeadingWhitespace = () => {
    while (start < end && isBlankLine(lines[start])) {
      start++
    }
  }
  const dropTrailingWhitespace = () => {
    while (start < end && isBlankLine(lines[end - 1])) {
      end--
    }
  }

  dropLeadingWhitespace()
  while (start < end && isMarkerLine(lines[start])) {
    start++
    dropLeadingWhitespace()
  }
  dropTrailingWhitespace()
  while (start < end && isMarkerLine(lines[end - 1])) {
    end--
    dropTrailingWhitespace()
  }

  return lines.slice(start, end).join('\n')
}

const getOperationSchema = (op: string | null): OperationSchema | null =>
  operationRegistry.operations.find((entry) => entry.op === op) ?? null

const isAllowedForChart = (allowedCharts: ChartTypeValue[] | undefined, chartType: ChartTypeValue | null) => {
  if (!allowedCharts || allowedCharts.length === 0) return true
  if (!chartType) return true
  return allowedCharts.includes(chartType)
}

const getAllowedOps = (chartType: ChartTypeValue | null) =>
  operationRegistry.operations.filter((op) => isAllowedForChart(op.allowedCharts, chartType))

const getAllowedActions = (chartType: ChartTypeValue | null) => {
  const drawSchema = getOperationSchema('draw')
  return (drawSchema?.actions ?? []).filter((action) => isAllowedForChart(action.allowedCharts, chartType))
}

const defaultValueForSchema = (schema: FieldSchema) => {
  switch (schema.kind) {
    case 'string':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'enum':
      return schema.options?.[0] ?? ''
    case 'stringOrNumber':
      return ''
    case 'stringOrMap':
      return ''
    case 'stringArray':
    case 'numberArray':
    case 'stringOrNumberArray':
      return []
    case 'object':
      return {}
    case 'map':
      return {}
    default:
      return ''
  }
}

const ensureRequiredDefaults = (schema: FieldSchema, current: unknown): unknown => {
  if (schema.optional) return current

  if (schema.kind === 'object') {
    const base = isPlainObject(current) ? { ...current } : {}
    ;(schema.fields ?? []).forEach((field) => {
      const next = ensureRequiredDefaults(field, (base as Record<string, unknown>)[field.key])
      if (next !== undefined) (base as Record<string, unknown>)[field.key] = next
    })
    return base
  }

  if (schema.kind === 'map') {
    return isPlainObject(current) ? current : {}
  }

  if (current !== undefined) return current
  return defaultValueForSchema(schema)
}

const buildEnabledValue = (schema: FieldSchema) => {
  if (schema.kind === 'object') {
    const out: Record<string, unknown> = {}
    ;(schema.fields ?? []).forEach((field) => {
      const next = ensureRequiredDefaults(field, undefined)
      if (next !== undefined) out[field.key] = next
    })
    return out
  }
  return defaultValueForSchema(schema)
}

const setNestedValue = (obj: Record<string, unknown>, path: string[], value: unknown) => {
  const next = { ...obj }
  let cursor: Record<string, unknown> = next
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      if (value === undefined) {
        delete cursor[key]
      } else {
        cursor[key] = value
      }
      return
    }
    const existing = cursor[key]
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  })
  return next
}

const getNestedValue = (obj: Record<string, unknown>, path: string[]) => {
  let cursor: unknown = obj
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  const next = items.slice()
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

const pruneStateByChart = (state: OpsBuilderState, chartType: ChartTypeValue | null) => {
  if (!chartType) return { state, removed: 0 }
  let removed = 0
  const allowedOps = new Set(getAllowedOps(chartType).map((op) => op.op))
  const allowedActions = new Set(getAllowedActions(chartType).map((action) => action.value))

  const groups = state.groups.map((group) => {
    const blocks = group.blocks.filter((block) => {
      if (!block.op) return true
      if (!allowedOps.has(block.op)) {
        removed += 1
        return false
      }
      if (block.op === OperationOp.Draw) {
        const action = block.fields.action
        if (typeof action === 'string' && !allowedActions.has(action)) {
          removed += 1
          return false
        }
      }
      return true
    })
    return { ...group, blocks }
  })

  return { state: { groups }, removed }
}

const collectKnownChartIds = (state: OpsBuilderState) => {
  const ids = new Set<string>()
  state.groups.forEach((group) => {
    group.blocks.forEach((block) => {
      if (block.op !== OperationOp.Draw) return
      if (block.fields.action !== 'split') return
      const split = block.fields.split
      if (!isPlainObject(split)) return
      const groups = split.groups
      if (isPlainObject(groups)) {
        Object.keys(groups).forEach((key) => ids.add(String(key)))
      }
      if (typeof split.restTo === 'string' && split.restTo.trim()) {
        ids.add(String(split.restTo))
      }
    })
  })
  return Array.from(ids)
}

export default function OpsBuilder({ chartType, onExportChange, optionSources, validationTick }: OpsBuilderProps) {
  const undo = useUndoState<OpsBuilderState>(defaultState(), { debounceMs: 300 })
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const chartTypeRef = useRef<ChartTypeValue | null>(null)
  const resolvedOptionSources = optionSources ?? emptyOptionSources

  const state = undo.present
  const allowedOps = useMemo(() => getAllowedOps(chartType), [chartType])
  const allowedActions = useMemo(() => getAllowedActions(chartType), [chartType])
  const knownChartIds = useMemo(() => collectKnownChartIds(state), [state])

  useEffect(() => {
    if (chartTypeRef.current === chartType) return
    chartTypeRef.current = chartType
    const { state: nextState, removed } = pruneStateByChart(state, chartType)
    if (removed > 0) {
      console.info(`[OpsBuilder] Removed ${removed} ops not supported by ${chartType ?? 'current chart'}.`)
      undo.setPresentImmediate(() => nextState)
    }
  }, [chartType, state, undo])

  const errors = useMemo(() => validateOps(state, chartType), [state, chartType, validationTick])
  const exported = useMemo(() => exportOps(state, chartType), [state, chartType])

  useEffect(() => {
    onExportChange(exported.runnableGroups, errors)
  }, [errors, exported, onExportChange])

  useEffect(() => {
    if (!selectedBlockId) return
    const exists = state.groups.some((group) => group.blocks.some((block) => block.id === selectedBlockId))
    if (!exists) setSelectedBlockId(null)
  }, [selectedBlockId, state.groups])

  const applyImportedState = useCallback(
    (nextState: OpsBuilderState) => {
      undo.setPresentImmediate(() => nextState)
      setImportText('')
      setImportError(null)
      setImportOpen(false)
    },
    [undo],
  )

  const handleAddGroup = () => {
    undo.setPresentImmediate((current) => ({
      groups: [...current.groups, { id: makeId('group'), name: `ops_${current.groups.length + 1}`, disabled: false, blocks: [] }],
    }))
  }

  const handleAddBlock = (groupId: string) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, blocks: [...group.blocks, { id: makeId('block'), op: null, disabled: false, fields: {} }] }
          : group,
      ),
    }))
  }

  const handleRemoveGroup = (groupId: string) => {
    undo.setPresentImmediate((current) => {
      const nextGroups = current.groups.filter((group) => group.id !== groupId)
      return { groups: nextGroups.length ? nextGroups : defaultState().groups }
    })
  }

  const handleRemoveBlock = (blockId: string) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) => ({
        ...group,
        blocks: group.blocks.filter((block) => block.id !== blockId),
      })),
    }))
  }

  const handleToggleGroup = (groupId: string) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, disabled: !group.disabled } : group,
      ),
    }))
  }

  const handleToggleBlock = (blockId: string) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) => ({
        ...group,
        blocks: group.blocks.map((block) =>
          block.id === blockId ? { ...block, disabled: !block.disabled } : block,
        ),
      })),
    }))
  }

  const handleMoveGroup = (groupId: string, direction: -1 | 1) => {
    undo.setPresentImmediate((current) => {
      const index = current.groups.findIndex((group) => group.id === groupId)
      if (index < 0) return current
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.groups.length) return current
      return { groups: moveItem(current.groups, index, nextIndex) }
    })
  }

  const handleMoveBlock = (groupId: string, blockId: string, direction: -1 | 1) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) => {
        if (group.id !== groupId) return group
        const index = group.blocks.findIndex((block) => block.id === blockId)
        if (index < 0) return group
        const nextIndex = index + direction
        if (nextIndex < 0 || nextIndex >= group.blocks.length) return group
        return { ...group, blocks: moveItem(group.blocks, index, nextIndex) }
      }),
    }))
  }

  const handleGroupNameChange = (groupId: string, name: string) => {
    undo.setPresentDebounced((current) => ({
      groups: current.groups.map((group) => (group.id === groupId ? { ...group, name } : group)),
    }))
  }

  const handleOpChange = (groupId: string, blockId: string, op: string) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) => {
        if (group.id !== groupId) return group
        return {
          ...group,
          blocks: group.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  op,
                  fields: (() => {
                    if (op !== OperationOp.Draw) {
                      return (getOperationSchema(op)?.fields ?? []).reduce((acc, field) => {
                        const next = ensureRequiredDefaults(field, undefined)
                        if (next !== undefined) acc[field.key] = next
                        return acc
                      }, {} as Record<string, unknown>)
                    }
                    const action = allowedActions[0]?.value ?? ''
                    const schema = getOperationSchema(op)
                    const actionSchema = schema?.actions?.find((entry) => entry.value === action)
                    const nextFields: Record<string, unknown> = { action }
                    ;(schema?.fields ?? []).forEach((field) => {
                      const required = ensureRequiredDefaults(field, undefined)
                      if (required !== undefined) nextFields[field.key] = required
                    })
                    ;(actionSchema?.fields ?? []).forEach((field) => {
                      const required = ensureRequiredDefaults(field, undefined)
                      if (required !== undefined) nextFields[field.key] = required
                    })
                    return nextFields
                  })(),
                }
              : block,
          ),
        }
      }),
    }))
  }

  const handleActionChange = (blockId: string, action: string) => {
    undo.setPresentImmediate((current) => ({
      groups: current.groups.map((group) => ({
        ...group,
        blocks: group.blocks.map((block) => {
          if (block.id !== blockId) return block
          const schema = getOperationSchema(block.op)
          const actionSchema = schema?.actions?.find((entry) => entry.value === action)
          const nextFields: Record<string, unknown> = { action }
          ;(schema?.fields ?? []).forEach((field) => {
            if (field.key in block.fields) nextFields[field.key] = block.fields[field.key]
            const required = ensureRequiredDefaults(field, nextFields[field.key])
            if (required !== undefined) nextFields[field.key] = required
          })
          ;(actionSchema?.fields ?? []).forEach((field) => {
            if (field.key in block.fields) nextFields[field.key] = block.fields[field.key]
            const required = ensureRequiredDefaults(field, nextFields[field.key])
            if (required !== undefined) nextFields[field.key] = required
          })
          return { ...block, fields: nextFields }
        }),
      })),
    }))
  }

  const handleFieldChange = useCallback(
    (blockId: string, path: string[], value: unknown, commit: 'immediate' | 'debounced' = 'debounced') => {
      const update = (current: OpsBuilderState) => ({
        groups: current.groups.map((group) => ({
          ...group,
          blocks: group.blocks.map((block) => {
            if (block.id !== blockId) return block
            return { ...block, fields: setNestedValue(block.fields, path, value) }
          }),
        })),
      })
      if (commit === 'immediate') {
        undo.setPresentImmediate(update)
      } else {
        undo.setPresentDebounced(update)
      }
    },
    [undo],
  )

  const handleToggleOptional = (blockId: string, path: string[], schema: FieldSchema, nextEnabled: boolean) => {
    const nextValue = nextEnabled ? buildEnabledValue(schema) : undefined
    handleFieldChange(blockId, path, nextValue, 'immediate')
  }

  const handleImport = () => {
    try {
      const sanitized = sanitizeJsonInput(importText).trim()
      if (!sanitized) return
      const nextState = importOpsBuilderStateFromJsonText(sanitized, chartType)
      applyImportedState(nextState)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON'
      setImportError(message)
    }
  }

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(exported.json)
      console.info('[OpsBuilder] JSON copied to clipboard')
    } catch {
      window.prompt('Copy JSON', exported.json)
    }
  }

  return (
    <div className="ops-builder">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <button type="button" className="ops-btn ops-btn-primary" onClick={() => setImportOpen(true)}>
            Import JSON…
          </button>
          <button type="button" className="ops-btn" onClick={handleCopyJson}>
            Copy JSON
          </button>
          <button type="button" className="ops-btn" onClick={handleAddGroup}>
            + Group
          </button>
        </div>
        <div className="ops-toolbar-right">
          <button type="button" className="ops-btn" onClick={undo.undo} disabled={!undo.canUndo}>
            Undo
          </button>
          <button type="button" className="ops-btn" onClick={undo.redo} disabled={!undo.canRedo}>
            Redo
          </button>
        </div>
      </div>

      {state.groups.map((group, groupIndex) => (
        <div key={group.id} className="ops-group">
          <div className="ops-group-header">
            <div className="ops-group-title">
              <input
                className="ops-input"
                value={group.name}
                onChange={(event) => handleGroupNameChange(group.id, event.target.value)}
                placeholder="Group name"
              />
              <label className="ops-switch">
                <input type="checkbox" checked={!!group.disabled} onChange={() => handleToggleGroup(group.id)} />
                Disable
              </label>
            </div>
            <div className="ops-inline">
              <button type="button" className="ops-btn" onClick={() => handleAddBlock(group.id)}>
                + Block
              </button>
              <button type="button" className="ops-btn" onClick={() => handleMoveGroup(group.id, -1)}>
                ↑
              </button>
              <button type="button" className="ops-btn" onClick={() => handleMoveGroup(group.id, 1)}>
                ↓
              </button>
              <button type="button" className="ops-btn ops-btn-danger" onClick={() => handleRemoveGroup(group.id)}>
                Delete
              </button>
            </div>
          </div>

          <div className="ops-blocks">
            {group.blocks.length === 0 ? <div className="ops-note">No blocks in this group yet.</div> : null}

            {group.blocks.map((block) => {
              const schema = getOperationSchema(block.op)
              const isDraw = block.op === OperationOp.Draw
              const action = typeof block.fields.action === 'string' ? block.fields.action : ''
              const actionSchema = schema?.actions?.find((entry) => entry.value === action)
              const blockError = errors[block.id]

              return (
                <div
                  key={block.id}
                  className="ops-block"
                  onClick={() => setSelectedBlockId(block.id)}
                >
                  <div className="ops-block-header">
                    <div className={`ops-badge ${block.disabled ? 'ops-badge-muted' : ''}`}>
                      <span>{schema?.icon ?? '⚙️'}</span>
                      <span>{schema?.label ?? 'Operation'}</span>
                    </div>
                    <div className="ops-inline">
                      <button type="button" className="ops-btn" onClick={() => handleMoveBlock(group.id, block.id, -1)}>
                        ↑
                      </button>
                      <button type="button" className="ops-btn" onClick={() => handleMoveBlock(group.id, block.id, 1)}>
                        ↓
                      </button>
                      <label className="ops-switch">
                        <input type="checkbox" checked={!!block.disabled} onChange={() => handleToggleBlock(block.id)} />
                        Disable
                      </label>
                      <button type="button" className="ops-btn ops-btn-danger" onClick={() => handleRemoveBlock(block.id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="ops-fields">
                    <div className="ops-field">
                      <div className="ops-field-label">Operation</div>
                      <select
                        className="ops-input"
                        value={block.op ?? ''}
                        onChange={(event) => handleOpChange(group.id, block.id, event.target.value)}
                      >
                        <option value="" disabled>
                          Select operation
                        </option>
                        {allowedOps.map((op) => (
                          <option key={op.op} value={op.op}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isDraw ? (
                      <div className="ops-field">
                        <div className="ops-field-label">Action</div>
                        <select
                          className="ops-input"
                          value={action}
                          onChange={(event) => handleActionChange(block.id, event.target.value)}
                        >
                          <option value="" disabled>
                            Select action
                          </option>
                          {allowedActions.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {(schema?.fields ?? []).map((field) => (
                      <FieldRenderer
                        key={field.key}
                        block={block}
                        schema={field}
                        value={getNestedValue(block.fields, [field.key])}
                        onChange={handleFieldChange}
                        onToggle={handleToggleOptional}
                        knownChartIds={knownChartIds}
                        optionSources={resolvedOptionSources}
                      />
                    ))}

                    {(actionSchema?.fields ?? []).map((field) => (
                      <FieldRenderer
                        key={field.key}
                        block={block}
                        schema={field}
                        value={getNestedValue(block.fields, [field.key])}
                        onChange={handleFieldChange}
                        onToggle={handleToggleOptional}
                        knownChartIds={knownChartIds}
                        optionSources={resolvedOptionSources}
                      />
                    ))}
                  </div>

                  {blockError ? <div className="ops-error">{blockError}</div> : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {importOpen ? (
        <div className="ops-modal-backdrop">
          <div className="ops-modal">
            <div className="ops-field-label">Import Operations JSON</div>
            <textarea
              className="ops-input"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste JSON"
            />
            {importError ? <div className="ops-error">{importError}</div> : null}
            <div className="ops-inline" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="ops-btn ops-btn-primary" onClick={handleImport}>
                Import
              </button>
              <button type="button" className="ops-btn" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FieldRenderer({
  block,
  schema,
  value,
  onChange,
  onToggle,
  knownChartIds,
  optionSources,
  pathPrefix = [],
}: {
  block: OpsBuilderBlock
  schema: FieldSchema
  value: unknown
  onChange: (blockId: string, path: string[], value: unknown, commit?: 'immediate' | 'debounced') => void
  onToggle: (blockId: string, path: string[], schema: FieldSchema, enabled: boolean) => void
  knownChartIds: string[]
  optionSources: OpsBuilderOptionSources
  pathPrefix?: string[]
}) {
  const path = [...pathPrefix, schema.key]
  const isOptional = !!schema.optional
  const enabled = !isOptional || value !== undefined

  if (schema.kind === 'object') {
    return (
      <div className="ops-subblock">
        <div className="ops-field">
          <div className="ops-field-label">
            {schema.label}
            {isOptional ? (
              <button
                type="button"
                className={`ops-optional-toggle ${enabled ? 'is-enabled' : ''}`}
                onClick={() => onToggle(block.id, path, schema, !enabled)}
              >
                Optional
              </button>
            ) : null}
          </div>
        </div>
        {enabled
          ? (schema.fields ?? []).map((child) => (
              <FieldRenderer
                key={child.key}
                block={block}
                schema={child}
                value={getNestedValue(block.fields, [...path, child.key])}
                onChange={onChange}
                onToggle={onToggle}
                knownChartIds={knownChartIds}
                optionSources={optionSources}
                pathPrefix={path}
              />
            ))
          : null}
      </div>
    )
  }

  if (schema.kind === 'map') {
    return (
      <div className="ops-subblock">
        <div className="ops-field">
          <div className="ops-field-label">
            {schema.label}
            {isOptional ? (
              <button
                type="button"
                className={`ops-optional-toggle ${enabled ? 'is-enabled' : ''}`}
                onClick={() => onToggle(block.id, path, schema, !enabled)}
              >
                Optional
              </button>
            ) : null}
          </div>
        </div>
        {enabled ? (
          <MapEditor
            valueSchema={schema.valueSchema}
            value={isPlainObject(value) ? value : {}}
            onChange={(next) => onChange(block.id, path, next, 'immediate')}
            itemOptions={resolveSchemaOptions(
              schema.valueSchema?.options,
              schema.valueSchema?.optionsSource,
              optionSources,
            )}
          />
        ) : null}
      </div>
    )
  }

  return (
    <FieldInput
      label={schema.label}
      optional={isOptional}
      enabled={enabled}
      kind={schema.kind}
      value={value}
      options={schema.options}
      optionsSource={schema.optionsSource}
      onToggle={(next) => onToggle(block.id, path, schema, next)}
      onChange={(next, commit) => onChange(block.id, path, next, commit)}
      knownChartIds={knownChartIds}
      optionSources={optionSources}
      ui={schema.ui}
    />
  )
}

function FieldInput({
  label,
  optional,
  enabled,
  kind,
  value,
  options,
  optionsSource,
  onToggle,
  onChange,
  knownChartIds,
  optionSources,
  ui,
}: {
  label: string
  optional: boolean
  enabled: boolean
  kind: FieldSchema['kind']
  value: unknown
  options?: Array<string>
  optionsSource?: FieldOptionsSource
  onToggle: (enabled: boolean) => void
  onChange: (value: unknown, commit?: 'immediate' | 'debounced') => void
  knownChartIds: string[]
  optionSources: OpsBuilderOptionSources
  ui?: FieldSchema['ui']
}) {
  const [arrayMode, setArrayMode] = useState<'string' | 'number'>('string')
  const [scalarMode, setScalarMode] = useState<'string' | 'number'>('string')
  const [mapMode, setMapMode] = useState<'string' | 'map'>('string')
  const resolvedOptions = resolveSchemaOptions(options, optionsSource, optionSources)

  useEffect(() => {
    if (kind === 'stringOrNumber' && typeof value === 'number') {
      setScalarMode('number')
    }
    if (kind === 'stringOrMap') {
      if (isPlainObject(value)) setMapMode('map')
      if (typeof value === 'string') setMapMode('string')
    }
    if (kind === 'stringOrNumberArray' && Array.isArray(value) && value.some((item) => typeof item === 'number')) {
      setArrayMode('number')
    }
  }, [kind, value])

  const renderInput = () => {
    if (!enabled) return null

    if (ui === 'chartId') {
      if (knownChartIds.length) {
        return (
          <select className="ops-input ops-small" value={(value as string) ?? ''} onChange={(event) => onChange(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {knownChartIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )
      }
      return (
        <input
          className="ops-input ops-small"
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }

    switch (kind) {
      case 'string':
        if (resolvedOptions && resolvedOptions.length > 0) {
          return (
            <select
              className="ops-input ops-small"
              value={(value as string) ?? ''}
              onChange={(event) => onChange(event.target.value)}
            >
              <option value="" disabled>
                Select
              </option>
              {resolvedOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )
        }
        return (
          <input
            className="ops-input ops-small"
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      case 'number':
        return (
          <input
            className="ops-input ops-small"
            type="number"
            value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
            onChange={(event) => {
              const next = event.target.value === '' ? undefined : Number(event.target.value)
              onChange(Number.isFinite(next as number) ? next : undefined)
            }}
          />
        )
      case 'boolean':
        return (
          <label className="ops-switch">
            <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
            {Boolean(value) ? 'True' : 'False'}
          </label>
        )
      case 'enum':
        return (
          <select className="ops-input ops-small" value={(value as string) ?? ''} onChange={(event) => onChange(event.target.value)}>
            <option value="" disabled>
              Select
            </option>
            {(options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      case 'stringOrNumber':
        if (resolvedOptions && resolvedOptions.length > 0) {
          return (
            <select
              className="ops-input ops-small"
              value={(value as string) ?? ''}
              onChange={(event) => onChange(event.target.value)}
            >
              <option value="" disabled>
                Select
              </option>
              {resolvedOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )
        }
        return (
          <div className="ops-inline">
            <select value={scalarMode} onChange={(event) => setScalarMode(event.target.value as 'string' | 'number')}>
              <option value="string">String</option>
              <option value="number">Number</option>
            </select>
            {scalarMode === 'number' ? (
              <input
                className="ops-input ops-small"
                type="number"
                value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
                onChange={(event) => {
                  const next = event.target.value === '' ? undefined : Number(event.target.value)
                  onChange(Number.isFinite(next as number) ? next : undefined)
                }}
              />
            ) : (
              <input
                className="ops-input ops-small"
                type="text"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(event.target.value)}
              />
            )}
          </div>
        )
      case 'stringOrMap':
        return (
          <div className="ops-inline">
            <select
              value={mapMode}
              onChange={(event) => {
                const nextMode = event.target.value as 'string' | 'map'
                setMapMode(nextMode)
                if (nextMode === 'map') {
                  onChange({}, 'immediate')
                } else {
                  onChange('', 'immediate')
                }
              }}
            >
              <option value="string">String</option>
              <option value="map">Map</option>
            </select>
            {mapMode === 'map' ? (
              <MapStringEditor
                value={isPlainObject(value) ? (value as Record<string, string>) : {}}
                onChange={(next) => onChange(next, 'immediate')}
              />
            ) : (
              <input
                className="ops-input ops-small"
                type="text"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(event.target.value)}
              />
            )}
          </div>
        )
      case 'stringArray':
        return (
          <ArrayEditor
            kind="string"
            value={Array.isArray(value) ? value : []}
            onChange={(next) => onChange(next, 'immediate')}
            options={resolvedOptions}
          />
        )
      case 'numberArray':
        return <ArrayEditor kind="number" value={Array.isArray(value) ? value : []} onChange={(next) => onChange(next, 'immediate')} />
      case 'stringOrNumberArray':
        if (resolvedOptions && resolvedOptions.length > 0) {
          return (
            <ArrayEditor
              kind="string"
              value={Array.isArray(value) ? value : []}
              onChange={(next) => onChange(next, 'immediate')}
              options={resolvedOptions}
            />
          )
        }
        return (
          <ArrayEditor
            kind={arrayMode}
            value={Array.isArray(value) ? value : []}
            onChange={(next) => onChange(next, 'immediate')}
            onModeChange={setArrayMode}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="ops-field">
      <div className="ops-field-label">
        {label}
        {optional ? (
          <button
            type="button"
            className={`ops-optional-toggle ${enabled ? 'is-enabled' : ''}`}
            onClick={() => onToggle(!enabled)}
          >
            Optional
          </button>
        ) : null}
      </div>
      {renderInput()}
    </div>
  )
}

function ArrayEditor({
  kind,
  value,
  onChange,
  onModeChange,
  options,
}: {
  kind: 'string' | 'number'
  value: Array<unknown>
  onChange: (value: Array<unknown>) => void
  onModeChange?: (mode: 'string' | 'number') => void
  options?: string[]
}) {
  const [input, setInput] = useState('')
  const [selectedOption, setSelectedOption] = useState('')

  const handleAdd = () => {
    if (options && options.length > 0) {
      const pick = selectedOption.trim()
      if (!pick) return
      onChange([...(value as Array<unknown>), pick])
      setSelectedOption('')
      return
    }
    if (input.trim() === '') return
    if (kind === 'number') {
      const num = Number(input)
      if (!Number.isFinite(num)) return
      onChange([...(value as number[]), num])
      setInput('')
      return
    }
    onChange([...(value as string[]), input])
    setInput('')
  }

  const handleRemove = (index: number) => {
    const next = value.slice()
    next.splice(index, 1)
    onChange(next)
  }

  const normalizedValueSet = useMemo(() => new Set(value.map((item) => String(item))), [value])
  const availableOptions = useMemo(() => {
    if (!options || options.length === 0) return []
    return options.filter((option) => !normalizedValueSet.has(option))
  }, [options, normalizedValueSet])

  return (
    <div className="ops-inline">
      {onModeChange ? (
        <select value={kind} onChange={(event) => onModeChange(event.target.value as 'string' | 'number')}>
          <option value="string">String</option>
          <option value="number">Number</option>
        </select>
      ) : null}
      <div className="ops-inline">
        {options && options.length > 0 ? (
          <select
            className="ops-input ops-small"
            value={selectedOption}
            onChange={(event) => setSelectedOption(event.target.value)}
          >
            <option value="">Select</option>
            {availableOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="ops-input ops-small"
            type={kind === 'number' ? 'number' : 'text'}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        )}
        <button type="button" className="ops-btn" onClick={handleAdd} disabled={options && options.length > 0 && !selectedOption}>
          Add
        </button>
      </div>
      <div className="ops-inline">
        {value.map((item, index) => (
          <span key={`${item}-${index}`} className="ops-badge ops-badge-muted">
            {String(item)}
            <button type="button" className="ops-btn" onClick={() => handleRemove(index)}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function MapStringEditor({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const handleAdd = () => {
    const key = newKey.trim()
    if (!key) return
    if (key in value) return
    onChange({ ...value, [key]: newValue })
    setNewKey('')
    setNewValue('')
  }

  const handleRemove = (key: string) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="ops-subblock">
      <div className="ops-inline">
        <input
          className="ops-input ops-small"
          type="text"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          placeholder="Key"
        />
        <input
          className="ops-input ops-small"
          type="text"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          placeholder="Value"
        />
        <button type="button" className="ops-btn" onClick={handleAdd}>
          Add
        </button>
      </div>
      {Object.entries(value).map(([key, entry]) => (
        <div key={key} className="ops-inline">
          <span className="ops-badge ops-badge-muted">{key}</span>
          <input
            className="ops-input ops-small"
            type="text"
            value={entry}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
          <button type="button" className="ops-btn ops-btn-danger" onClick={() => handleRemove(key)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

function MapEditor({
  valueSchema,
  value,
  onChange,
  itemOptions,
}: {
  valueSchema?: FieldSchema
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  itemOptions?: string[]
}) {
  const [newKey, setNewKey] = useState('')
  const [mode, setMode] = useState<'string' | 'number'>('string')

  const isStringNumberArray = valueSchema?.kind === 'stringOrNumberArray'
  const arrayKind = valueSchema?.kind === 'numberArray' ? 'number' : 'string'
  const hasItemOptions = !!(itemOptions && itemOptions.length > 0)
  const effectiveKind = isStringNumberArray && hasItemOptions ? 'string' : (isStringNumberArray ? mode : arrayKind)
  const allowModeChange = isStringNumberArray && !hasItemOptions ? setMode : undefined

  const handleAdd = () => {
    if (!newKey.trim()) return
    if (newKey in value) return
    const nextValue = { ...value, [newKey]: [] }
    onChange(nextValue)
    setNewKey('')
  }

  const handleRemove = (key: string) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="ops-subblock">
      <div className="ops-inline">
        <input
          className="ops-input ops-small"
          type="text"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          placeholder="Group key"
        />
        <button type="button" className="ops-btn" onClick={handleAdd}>
          Add
        </button>
      </div>

      {Object.entries(value).map(([key, entry]) => (
        <div key={key} className="ops-inline">
          <span className="ops-badge ops-badge-muted">{key}</span>
          {valueSchema ? (
            <ArrayEditor
              kind={effectiveKind}
              value={Array.isArray(entry) ? entry : []}
              onChange={(next) => onChange({ ...value, [key]: next })}
              onModeChange={allowModeChange}
              options={itemOptions}
            />
          ) : null}
          <button type="button" className="ops-btn ops-btn-danger" onClick={() => handleRemove(key)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
