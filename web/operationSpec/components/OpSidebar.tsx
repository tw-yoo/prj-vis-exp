import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_COLORS, OP_DOCS } from '../services/opDescriptions'
import { appliesTo } from '../services/opApplicability'
import type { ChartTypeKey } from '../services/opApplicability'

type Props = {
  selectedOp: string
  onSelect: (op: string) => void
  searchText: string
  chartTypeFilter: ChartTypeKey | 'all'
}

export default function OpSidebar({ selectedOp, onSelect, searchText, chartTypeFilter }: Props) {
  const search = searchText.trim().toLowerCase()
  return (
    <nav className="opspec-sidebar" aria-label="Operation list">
      {CATEGORY_ORDER.map((cat) => {
        const ops = OP_DOCS.filter((d) => d.category === cat)
          .filter((d) => !search || d.op.toLowerCase().includes(search) || d.label.toLowerCase().includes(search))
          .filter((d) => {
            if (chartTypeFilter === 'all') return true
            // Data-layer-only ops still pass when "all" is selected; only hide
            // when the user picks a specific chart type and the op has no
            // visual applier for it.
            return appliesTo(d.op).includes(chartTypeFilter)
          })
        if (!ops.length) return null
        return (
          <div key={cat} className="opspec-sidebar-group">
            <div
              className="opspec-sidebar-group-label"
              style={{ borderLeftColor: CATEGORY_COLORS[cat] }}
            >
              {CATEGORY_LABELS[cat]}
            </div>
            <ul className="opspec-sidebar-list">
              {ops.map((d) => (
                <li key={d.op}>
                  <button
                    type="button"
                    className={`opspec-sidebar-item ${
                      d.op === selectedOp ? 'is-active' : ''
                    } ${d.dataLayerOnly ? 'is-data-only' : ''}`}
                    onClick={() => onSelect(d.op)}
                  >
                    <span className="opspec-sidebar-item-name">{d.op}</span>
                    {d.dataLayerOnly ? (
                      <span className="opspec-sidebar-item-flag" title="Data-layer only — no visual applier">
                        data
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
