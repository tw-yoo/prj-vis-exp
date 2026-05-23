import { useEffect, useRef, useState } from 'react'
import { renderChart } from '../../../src/api/rendering'
import { runChartOps } from '../../../src/api/operation-run'
import type { ChartSpec, OpsSpecInput } from '../../../src/api/types'
import { resolveSpec } from '../../review/services/chartSpecResolver'
import type { OpExample } from '../services/opExamples'
import { CHART_TYPE_LABELS } from '../services/opApplicability'

type Props = {
  example: OpExample
}

type ChartStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'spec-error'; message: string }
  | { kind: 'render-error'; message: string }
  | { kind: 'ready' }

export default function ExampleCard({ example }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<ChartStatus>({ kind: 'idle' })
  const [runToken, setRunToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return
    // Indicate loading before the async render kicks off — intentional cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus({ kind: 'loading' })
    host.innerHTML = ''
    void (async () => {
      const resolution = await resolveSpec(example.chartId)
      if (cancelled) return
      if (!resolution.ok) {
        setStatus({ kind: 'spec-error', message: resolution.error })
        return
      }
      const spec: ChartSpec = resolution.spec
      try {
        await renderChart(host, spec)
        if (cancelled) return
        await runChartOps(host, spec, example.opsSpec as OpsSpecInput)
        if (cancelled) return
        setStatus({ kind: 'ready' })
      } catch (err) {
        if (cancelled) return
        setStatus({
          kind: 'render-error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [runToken, example.chartId, example.opsSpec])

  const jsonText = JSON.stringify(example.opsSpec, null, 2)

  return (
    <div className="opspec-example">
      <div className="opspec-example-header">
        <span className="opspec-example-chip">{CHART_TYPE_LABELS[example.chartType]}</span>
        <span className="opspec-example-caption">{example.caption}</span>
        <span className="opspec-example-chartid" title={example.chartId}>
          {example.chartId}
        </span>
        <button
          type="button"
          className="opspec-example-rerun"
          onClick={() => setRunToken((t) => t + 1)}
          disabled={status.kind === 'loading'}
        >
          ↻ Re-run
        </button>
      </div>
      {example.note ? <div className="opspec-example-note">{example.note}</div> : null}
      <div className="opspec-example-body">
        <pre className="opspec-example-json">
          <code>{highlightJson(jsonText)}</code>
        </pre>
        <div className="opspec-example-chart">
          <div ref={hostRef} className="opspec-example-host" />
          {status.kind === 'spec-error' ? (
            <div className="opspec-example-overlay is-error">spec not found: {status.message}</div>
          ) : null}
          {status.kind === 'render-error' ? (
            <div className="opspec-example-overlay is-error">render failed: {status.message}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Minimal JSON syntax highlighting: wrap quoted keys/strings, numbers,
// booleans, null in spans. Output is a React element tree, not raw HTML.
function highlightJson(json: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b)/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(json)) !== null) {
    if (match.index > lastIndex) {
      parts.push(json.slice(lastIndex, match.index))
    }
    const tok = match[0]
    let cls = 'tok-default'
    if (tok.endsWith(':')) cls = 'tok-key'
    else if (tok.startsWith('"')) cls = 'tok-string'
    else if (tok === 'true' || tok === 'false') cls = 'tok-bool'
    else if (tok === 'null') cls = 'tok-null'
    else cls = 'tok-number'
    parts.push(
      <span key={key++} className={cls}>
        {tok}
      </span>,
    )
    lastIndex = match.index + tok.length
  }
  if (lastIndex < json.length) {
    parts.push(json.slice(lastIndex))
  }
  return parts
}
