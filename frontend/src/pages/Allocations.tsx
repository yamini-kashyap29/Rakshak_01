import { useState } from 'react'
import { useAppData } from '../context/AppData'
import { api } from '../services/api'
import type { Assignment } from '../types'

export default function Allocations() {
  const { overview, refresh } = useAppData()
  const [selected, setSelected] = useState<Assignment | null>(null)

  if (!overview) return null

  const optimize = async () => { await api.optimize(); refresh() }

  return (
    <div className="p-5 flex gap-4 h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="data-label text-xs text-grid-dim">ACTIVE ASSIGNMENTS ({overview.assignments.length})</div>
          <button
            onClick={optimize}
            className="px-3 py-1.5 text-xs rounded border border-grid-accent text-grid-accent hover:bg-grid-accent/10 data-label"
          >
            RE-OPTIMIZE ALL
          </button>
        </div>
        <div className="flex-1 overflow-auto panel divide-y divide-grid-line">
          {overview.assignments.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={`w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-grid-panel2 transition-colors ${
                selected?.id === a.id ? 'bg-grid-panel2' : ''
              }`}
            >
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-medium">{a.resource_name}</span>
                <span className="text-grid-dim"> → </span>
                <span className="font-medium">{a.zone_name}</span>
              </div>
              <div className="data-label text-xs text-grid-dim">ETA {a.route?.eta_min ?? '—'} min</div>
              <div className="font-display text-lg w-12 text-right">{a.score}</div>
            </button>
          ))}
          {overview.assignments.length === 0 && (
            <div className="p-4 text-xs text-grid-dim">No active assignments. Run RE-OPTIMIZE ALL.</div>
          )}
        </div>
      </div>

      <div className="w-96 shrink-0">
        {selected ? (
          <div className="panel p-4">
            <div className="data-label text-xs text-grid-dim mb-1">
              {selected.resource_name} → {selected.zone_name}
            </div>
            <div className="font-display text-3xl mb-3">{selected.score}</div>

            <div className="data-label text-[10px] text-grid-dim mb-2">WHY?</div>
            <div className="space-y-1.5 text-xs mb-4">
              <Row label="Zone Priority" value={selected.breakdown.zone_priority} />
              <Row label="Distance" value={`${selected.breakdown.distance_km} km`} />
              <Row label="Suitability" value={`${selected.breakdown.suitability_pct}%`} />
              <Row label="Urgency" value={`${selected.breakdown.urgency}%`} />
              <Row label="Availability" value={`${selected.breakdown.availability}%`} />
            </div>

            <div className="data-label text-[10px] text-grid-dim mb-1">ROUTE</div>
            <div className="text-xs text-grid-dim mb-1">
              {selected.route?.route_label} · {selected.route?.distance_km} km · ETA {selected.route?.eta_min} min
              {!selected.route?.usable_named_route && (
                <span className="text-grid-critical"> · off-road fallback (named roads blocked)</span>
              )}
            </div>
            {selected.real_route ? (
              <div className="text-xs text-grid-accent mb-4">
                ● LIVE ROAD NETWORK (OSRM): {selected.real_route.distance_km} km ·{' '}
                {selected.real_route.duration_min} min drive time
              </div>
            ) : (
              <div className="text-xs text-grid-dim mb-4">
                ● Road Network: FALLBACK — using simulated distance model
              </div>
            )}

            <div className="data-label text-[10px] text-grid-dim mb-1">REASON</div>
            <p className="text-xs text-grid-text leading-relaxed">{selected.reason}</p>
          </div>
        ) : (
          <div className="panel p-4 text-xs text-grid-dim">Select an assignment to see why it was made.</div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-grid-dim">{label}</span>
      <span className="data-label">{value}</span>
    </div>
  )
}
