import { useState } from 'react'
import OpSidebar from '../components/OpSidebar'
import OpDetail from '../components/OpDetail'
import { CHART_TYPES, CHART_TYPE_LABELS, type ChartTypeKey } from '../services/opApplicability'
import '../operationSpec.css'

export default function OperationSpecPage() {
  const [selectedOp, setSelectedOp] = useState<string>('filter')
  const [searchText, setSearchText] = useState('')
  const [chartTypeFilter, setChartTypeFilter] = useState<ChartTypeKey | 'all'>('all')

  return (
    <div className="opspec-shell">
      <header className="opspec-topbar">
        <div className="opspec-topbar-title">
          <span className="opspec-topbar-title-main">Operation Spec Reference</span>
          <span className="opspec-topbar-title-sub">
            Browse each op, its parameters, and live chart-by-chart examples.
          </span>
        </div>
        <div className="opspec-topbar-controls">
          <input
            type="search"
            className="opspec-search"
            placeholder="Search ops…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <div className="opspec-chart-filter">
            <button
              type="button"
              className={`opspec-chart-chip ${chartTypeFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setChartTypeFilter('all')}
            >
              All
            </button>
            {CHART_TYPES.map((ct) => (
              <button
                key={ct}
                type="button"
                className={`opspec-chart-chip ${chartTypeFilter === ct ? 'is-active' : ''}`}
                onClick={() => setChartTypeFilter(ct)}
              >
                {CHART_TYPE_LABELS[ct]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="opspec-body">
        <OpSidebar
          selectedOp={selectedOp}
          onSelect={setSelectedOp}
          searchText={searchText}
          chartTypeFilter={chartTypeFilter}
        />
        <main className="opspec-main">
          <OpDetail op={selectedOp} chartTypeFilter={chartTypeFilter} />
        </main>
      </div>
    </div>
  )
}
