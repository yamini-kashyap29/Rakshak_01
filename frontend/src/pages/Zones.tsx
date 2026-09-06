import { useState } from 'react'
import { useAppData } from '../context/AppData'
import { api } from '../services/api'
import { RiskBadge } from '../components/Badges'
import type { Zone } from '../types'

const DEFAULT_WEIGHTS = { population: 30, critical: 25, trapped: 20, accessibility: 15, waiting: 10 }

export default function Zones() {
  const { overview, refresh } = useAppData()
  const [selected, setSelected] = useState<Zone | null>(null)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [err, setErr] = useState<string | null>(null)

  if (!overview) return null
  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  const recalc = async () => {
    setErr(null)
    try {
      await api.recalcPriorities({
        population: weights.population / 100, critical: weights.critical / 100,
        trapped: weights.trapped / 100, accessibility: weights.accessibility / 100,
        waiting: weights.waiting / 100,
      })
      refresh()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  return (
    <div className="p-5 flex gap-4 h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="data-label text-xs text-grid-dim mb-2">ZONES · RANKED BY PRIORITY SCORE</div>
        <div className="flex-1 overflow-auto panel divide-y divide-grid-line">
          {overview.zones.map((z) => (
            <button
              key={z.id}
              onClick={() => setSelected(z)}
              className={`w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-grid-panel2 transition-colors ${
                selected?.id === z.id ? 'bg-grid-panel2' : ''
              }`}
            >
              <div className="w-24 shrink-0">
                <div className="font-display text-lg leading-none">{z.priority_score}</div>
                <div className="data-label text-[10px] text-grid-dim">PRIORITY</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{z.name}</div>
                <div className="text-xs text-grid-dim">
                  Pop {z.population.toLocaleString()} · Critical {z.critical} · Trapped {z.trapped} · {z.accessibility}
                </div>
              </div>
              <RiskBadge level={z.risk_level} />
            </button>
          ))}
        </div>
      </div>

      <div className="w-96 shrink-0 flex flex-col gap-4 overflow-auto">
        <div className="panel p-4">
          <div className="data-label text-xs text-grid-dim mb-3">PRIORITY WEIGHTS</div>
          {(Object.keys(weights) as (keyof typeof weights)[]).map((key) => (
            <div key={key} className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="capitalize text-grid-dim">{key}</span>
                <span className="data-label">{weights[key]}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                className="w-full accent-grid-accent"
              />
            </div>
          ))}
          <div className={`text-xs mb-2 ${total === 100 ? 'text-grid-safe' : 'text-grid-critical'}`}>
            Total: {total}% {total !== 100 && '(must equal 100%)'}
          </div>
          {err && <div className="text-xs text-grid-critical mb-2">{err}</div>}
          <button
            onClick={recalc}
            disabled={total !== 100}
            className="w-full py-2 text-xs rounded border border-grid-accent text-grid-accent hover:bg-grid-accent/10 disabled:opacity-40 data-label"
          >
            RECALCULATE PRIORITIES
          </button>
        </div>

        {selected && (
          <div className="panel p-4">
            <div className="data-label text-xs text-grid-dim mb-2">{selected.name} · BREAKDOWN</div>
            {selected.priority_breakdown && (
              <div className="space-y-1.5 text-xs">
                <Row label="Population Impact" value={selected.priority_breakdown.population_impact} />
                <Row label="Critical Patients" value={selected.priority_breakdown.critical_patients} />
                <Row label="Trapped Population" value={selected.priority_breakdown.trapped_population} />
                <Row label="Accessibility / Risk" value={selected.priority_breakdown.accessibility_risk} />
                <Row label="Waiting Time" value={selected.priority_breakdown.waiting_time} />
                <div className="border-t border-grid-line pt-1.5 mt-1.5 flex justify-between font-medium">
                  <span>Final Priority</span><span>{selected.priority_score}</span>
                </div>
                {selected.priority_breakdown.change_reason && (
                  <div className="mt-2 pt-2 border-t border-grid-line">
                    <div className="data-label text-[9px] text-grid-warn mb-1">CHANGE</div>
                    <div className="text-grid-text">{selected.priority_breakdown.change_reason}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-grid-dim">{label}</span>
      <span className="data-label">{value}</span>
    </div>
  )
}
