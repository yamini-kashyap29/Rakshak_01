import { useState } from 'react'
import { useAppData } from '../context/AppData'
import { api } from '../services/api'
import type { Metrics } from '../types'

type EventKind = 'resource_fail' | 'road_block' | 'population_increase' | 'shelter_full' | 'new_zone' | 'resource_available'

const EVENTS: { kind: EventKind; label: string }[] = [
  { kind: 'resource_fail', label: 'Ambulance / Resource Failure' },
  { kind: 'road_block', label: 'Road Closure' },
  { kind: 'population_increase', label: 'Population Increase' },
  { kind: 'shelter_full', label: 'Shelter Becomes Full' },
  { kind: 'new_zone', label: 'New Emergency Appears' },
  { kind: 'resource_available', label: 'Resource Becomes Available' },
]

export default function WhatIf() {
  const { overview, refresh } = useAppData()
  const [kind, setKind] = useState<EventKind>('resource_fail')
  const [resourceId, setResourceId] = useState<string>('')
  const [roadId, setRoadId] = useState<string>('')
  const [preview, setPreview] = useState<{ before: Metrics; after: Metrics; applied: boolean } | null>(null)
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  if (!overview) return null

  const meta: Record<string, any> = {}
  if (kind === 'resource_fail' && resourceId) meta.resource_id = resourceId
  if (kind === 'resource_available' && resourceId) meta.resource_id = resourceId
  if (kind === 'road_block' && roadId) meta.road_id = roadId

  const runPreview = async () => {
    setRunning(true)
    setApplied(false)
    try {
      const result = await api.previewEvent(kind, meta)
      setPreview(result)
    } finally {
      setRunning(false)
    }
  }

  const apply = async () => {
    setApplying(true)
    try {
      await api.trigger(kind, meta)
      setApplied(true)
      await refresh()
    } finally {
      setApplying(false)
    }
  }

  const failableResources = overview.resources.filter((r) => r.status !== 'MAINTENANCE')
  const availableRoads = overview.roads.filter((r) => !r.blocked)

  return (
    <div className="p-5 h-full overflow-auto">
      <div className="data-label text-xs text-grid-dim mb-3">WHAT-IF SIMULATOR</div>

      <div className="panel p-4 mb-4 max-w-xl">
        <div className="data-label text-[10px] text-grid-dim mb-2">EVENT</div>
        <div className="space-y-1 mb-4">
          {EVENTS.map((e) => (
            <label key={e.kind} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio" name="event" checked={kind === e.kind}
                onChange={() => { setKind(e.kind); setPreview(null); setApplied(false) }}
                className="accent-grid-accent"
              />
              {e.label}
            </label>
          ))}
        </div>

        {(kind === 'resource_fail' || kind === 'resource_available') && (
          <div className="mb-4">
            <div className="text-xs text-grid-dim mb-1">Select resource (optional — random if blank)</div>
            <select
              value={resourceId} onChange={(e) => setResourceId(e.target.value)}
              className="w-full bg-grid-panel2 border border-grid-line rounded px-2 py-1.5 text-xs"
            >
              <option value="">Any compatible resource</option>
              {failableResources.map((r) => (
                <option key={r.id} value={r.id}>{r.name} · {r.status}</option>
              ))}
            </select>
          </div>
        )}

        {kind === 'road_block' && (
          <div className="mb-4">
            <div className="text-xs text-grid-dim mb-1">Select road (optional — random if blank)</div>
            <select
              value={roadId} onChange={(e) => setRoadId(e.target.value)}
              className="w-full bg-grid-panel2 border border-grid-line rounded px-2 py-1.5 text-xs"
            >
              <option value="">Any unblocked road</option>
              {availableRoads.map((r) => (
                <option key={r.id} value={r.id}>{r.label} ({r.distance_km} km)</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={runPreview}
          disabled={running}
          className="px-4 py-2 text-xs rounded border border-grid-accent text-grid-accent hover:bg-grid-accent/10 disabled:opacity-50 data-label"
        >
          {running ? 'SIMULATING…' : 'RUN REOPTIMIZATION'}
        </button>
        <div className="data-label text-[9px] text-grid-dim mt-2">
          This does not change the live scenario. Nothing is applied until you click APPLY below.
        </div>
      </div>

      {preview && (
        <div className="max-w-2xl">
          {!preview.applied ? (
            <div className="panel p-3 mb-4 text-sm text-grid-dim">
              No eligible target for this event right now.
            </div>
          ) : (
            <>
              <div className="panel p-3 mb-4 text-sm">
                <span className="data-label text-grid-accent">PROJECTED IMPACT</span> — CURRENT PLAN vs PROJECTED PLAN
                if this event occurs.
              </div>
              <div className="panel overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-grid-panel2 data-label text-[10px] text-grid-dim">
                    <tr>
                      <th className="text-left px-4 py-2">METRIC</th>
                      <th className="text-left px-4 py-2">CURRENT PLAN</th>
                      <th className="text-left px-4 py-2">PROJECTED PLAN</th>
                      <th className="text-left px-4 py-2">CHANGE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grid-line">
                    <MetricRow label="Avg response time (min)" before={preview.before.avg_response_time_min} after={preview.after.avg_response_time_min} lowerBetter />
                    <MetricRow label="Critical zone coverage (%)" before={preview.before.critical_zone_coverage_pct} after={preview.after.critical_zone_coverage_pct} />
                    <MetricRow label="Resource utilization (%)" before={preview.before.resource_utilization_pct} after={preview.after.resource_utilization_pct} />
                    <MetricRow label="Unserved population" before={preview.before.unserved_population} after={preview.after.unserved_population} lowerBetter />
                  </tbody>
                </table>
              </div>

              {!applied ? (
                <button
                  onClick={apply}
                  disabled={applying}
                  className="px-4 py-2 text-xs rounded border border-grid-critical text-grid-critical hover:bg-grid-critical/10 disabled:opacity-50 data-label"
                >
                  {applying ? 'APPLYING…' : 'APPLY TO LIVE SCENARIO'}
                </button>
              ) : (
                <div className="text-xs text-grid-safe">✓ Applied. The live scenario now reflects this event.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MetricRow({ label, before, after, lowerBetter }: { label: string; before: number; after: number; lowerBetter?: boolean }) {
  const delta = Math.round((after - before) * 100) / 100
  const improved = lowerBetter ? delta < 0 : delta > 0
  const color = delta === 0 ? 'text-grid-dim' : improved ? 'text-grid-safe' : 'text-grid-critical'
  return (
    <tr>
      <td className="px-4 py-2 text-grid-dim">{label}</td>
      <td className="px-4 py-2 data-label">{before}</td>
      <td className="px-4 py-2 data-label">{after}</td>
      <td className={`px-4 py-2 data-label ${color}`}>
        {delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : '—'}
      </td>
    </tr>
  )
}
