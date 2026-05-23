import { useMemo } from 'react'
import opsSchemaJson from '../../../data/review/.ops_schema.json'
import { getOpDoc, CATEGORY_COLORS, CATEGORY_LABELS } from '../services/opDescriptions'
import { appliesTo, CHART_TYPE_LABELS, CHART_TYPES, type ChartTypeKey } from '../services/opApplicability'
import { getExamplesByChartType } from '../services/opExamples'
import ExampleCard from './ExampleCard'

type SchemaField = {
  key: string
  kind: string
  optional: boolean
  description: string | null
  options: string[] | null
  optionsSource: string | null
}

type SchemaOp = {
  op: string
  label: string
  fields: SchemaField[]
}

const SCHEMA: { operations: SchemaOp[] } = opsSchemaJson as unknown as { operations: SchemaOp[] }

type Props = {
  op: string
  chartTypeFilter: ChartTypeKey | 'all'
}

export default function OpDetail({ op, chartTypeFilter }: Props) {
  const doc = getOpDoc(op)
  const schema = useMemo(() => SCHEMA.operations.find((o) => o.op === op), [op])
  const applies = appliesTo(op)
  const examplesByType = useMemo(() => getExamplesByChartType(op), [op])

  if (!doc) {
    return (
      <div className="opspec-detail opspec-detail--missing">
        <p>Unknown op: <code>{op}</code></p>
      </div>
    )
  }

  const visibleChartTypes: ChartTypeKey[] = (
    chartTypeFilter === 'all' ? CHART_TYPES : [chartTypeFilter]
  ).filter((ct) => applies.includes(ct))

  return (
    <article className="opspec-detail">
      <header className="opspec-detail-header">
        <div
          className="opspec-detail-category"
          style={{ color: CATEGORY_COLORS[doc.category] }}
        >
          {CATEGORY_LABELS[doc.category]}
        </div>
        <h1 className="opspec-detail-title">{doc.op}</h1>
        <p className="opspec-detail-summary">{doc.summary}</p>
        <div className="opspec-detail-meta">
          <span className="opspec-detail-meta-item">
            <span className="opspec-detail-meta-key">output</span>
            <span className="opspec-detail-meta-val">{doc.outputKind}</span>
          </span>
          {doc.dataLayerOnly ? (
            <span className="opspec-detail-meta-item opspec-detail-meta-item--warn">
              data-layer only
            </span>
          ) : null}
          <span className="opspec-detail-meta-item">
            <span className="opspec-detail-meta-key">applies to</span>
            <span className="opspec-detail-meta-val">
              {applies.length ? applies.map((c) => CHART_TYPE_LABELS[c]).join(' · ') : '—'}
            </span>
          </span>
        </div>
      </header>

      <section className="opspec-detail-section">
        <p className="opspec-detail-body">{doc.body}</p>
      </section>

      {schema ? (
        <section className="opspec-detail-section">
          <h2 className="opspec-detail-h2">Parameters</h2>
          {schema.fields.length ? (
            <div className="opspec-params">
              {schema.fields.map((f) => (
                <div key={f.key} className="opspec-param">
                  <div className="opspec-param-row">
                    <code className="opspec-param-name">{f.key}</code>
                    <span className="opspec-param-kind">{f.kind}</span>
                    <span
                      className={`opspec-param-req ${f.optional ? 'is-opt' : 'is-req'}`}
                    >
                      {f.optional ? 'optional' : 'required'}
                    </span>
                  </div>
                  {f.options && f.options.length ? (
                    <div className="opspec-param-options">
                      {f.options.map((opt) => (
                        <span key={opt} className="opspec-param-option">
                          {opt}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {f.optionsSource ? (
                    <div className="opspec-param-hint">values come from chart {f.optionsSource}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="opspec-detail-empty">No parameters.</p>
          )}
        </section>
      ) : null}

      <section className="opspec-detail-section">
        <h2 className="opspec-detail-h2">Examples</h2>
        {doc.dataLayerOnly ? (
          <p className="opspec-detail-empty">
            This op runs at the data layer only — no visual applier exists, so there are no chart
            previews. It is typically used as input to a downstream op via <code>meta.inputs</code>.
          </p>
        ) : null}
        {!doc.dataLayerOnly && visibleChartTypes.length === 0 ? (
          <p className="opspec-detail-empty">
            No examples for the current chart-type filter. Switch the filter to&nbsp;
            <em>All</em> to see what this op supports.
          </p>
        ) : null}
        {!doc.dataLayerOnly && visibleChartTypes.length > 0 ? (
          <div className="opspec-examples">
            {visibleChartTypes.map((ct) => {
              const list = examplesByType.get(ct) ?? []
              if (!list.length) {
                return (
                  <div key={ct} className="opspec-examples-group">
                    <h3 className="opspec-examples-h3">{CHART_TYPE_LABELS[ct]}</h3>
                    <div className="opspec-detail-empty opspec-examples-empty">
                      No curated example yet for this chart type — applier exists but no spec was
                      sampled. Try the workbench for ad-hoc cases.
                    </div>
                  </div>
                )
              }
              return (
                <div key={ct} className="opspec-examples-group">
                  <h3 className="opspec-examples-h3">{CHART_TYPE_LABELS[ct]}</h3>
                  {list.map((ex, i) => (
                    <ExampleCard key={`${ex.chartId}-${i}`} example={ex} />
                  ))}
                </div>
              )
            })}
          </div>
        ) : null}
      </section>
    </article>
  )
}
