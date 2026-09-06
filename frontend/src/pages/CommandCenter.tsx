import { useState } from 'react'
import { useAppData } from '../context/AppData'
import { api } from '../services/api'
import { Kpi } from '../components/Badges'
import DisasterMap, { type MapLayers } from '../components/DisasterMap'
import LiveConditions from '../components/LiveConditions'
import DataSourceStatus from '../components/DataSourceStatus'

const DEFAULT_LAYERS: MapLayers = {
  zones: true, resources: true, routes: true, hospitals: true, shelters: true, earthquakes: true,
}

export default function CommandCenter() {
  const { overview, liveEvents, refresh } = useAppData()
  const [busy, setBusy] = useState<string | null>(null)
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS)
  const [showLayers, setShowLayers] = useState(false)

  if (!overview) {
    return <div className="p-6 text-grid-dim data-label text-sm">LOADING SCENARIO...</div>
  }

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label)
    try { await fn() } finally { setBusy(null); refresh() }
  }

  const k = overview.kpis
  const toggleLayer = (key: keyof MapLayers) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-grid-line flex items-center justify-between bg-grid-panel">
        <div className="data-label text-[11px] text-grid-dim">
          {overview.disaster_type.toUpperCase()} RESPONSE · T+{overview.sim_time_min} MIN
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run('start', overview.sim_running ? api.simPause : api.simStart)}
            className="px-3 py-1.5 text-xs rounded border border-grid-line hover:border-grid-accent hover:text-grid-accent transition-colors"
          >
            {overview.sim_running ? '⏸ PAUSE' : '▶ START'} SIMULATION
          </button>
          <button
            onClick={() => run('reset', api.simReset)}
            className="px-3 py-1.5 text-xs rounded border border-grid-line hover:border-grid-critical hover:text-grid-critical transition-colors"
          >
            RESET
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3 px-5 py-3">
        <Kpi label="AFFECTED" value={k.affected_population.toLocaleString()} />
        <Kpi label="CRITICAL" value={k.critical_cases} />
        <Kpi label="RESOURCES" value={`${k.active_resources} / ${k.total_resources}`} />
        <Kpi label="ACTIVE ZONES" value={k.active_zones} />
        <Kpi label="SHELTER LOAD" value={`${k.shelter_capacity_pct}%`} />
        <Kpi label="AVG RESPONSE" value={`${k.avg_response_time_min} MIN`} />
      </div>

      <div className="flex-1 min-h-0 flex gap-3 px-5 pb-3">
        <div className="flex-1 panel overflow-hidden relative">
          <DisasterMap
            center={overview.center}
            zones={overview.zones}
            resources={overview.resources}
            shelters={overview.shelters}
            hospitals={overview.hospitals}
            assignments={overview.assignments}
            earthquakes={overview.live.earthquakes}
            layers={layers}
          />

          <div className="absolute top-3 right-3 z-[1000]">
            <button
              onClick={() => setShowLayers((v) => !v)}
              className="panel px-3 py-1.5 text-[11px] data-label text-grid-dim hover:text-grid-text bg-grid-panel/95"
            >
              LAYERS ▾
            </button>
            {showLayers && (
              <div className="panel mt-1 p-2 bg-grid-panel/95 w-40">
                {(Object.keys(layers) as (keyof MapLayers)[]).map((k2) => (
                  <label key={k2} className="flex items-center gap-2 text-xs py-1 cursor-pointer capitalize">
                    <input type="checkbox" checked={layers[k2]} onChange={() => toggleLayer(k2)} className="accent-grid-accent" />
                    {k2}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-80 shrink-0 flex flex-col gap-3">
          <LiveConditions weather={overview.live.weather} updated={overview.live.data_sources.weather.updated} />

          <div className="panel p-3">
            <div className="data-label text-[10px] text-grid-dim mb-2">DEMO CONTROLS</div>
            <div className="grid grid-cols-1 gap-1.5">
              <DemoButton busy={busy === 'optimize'} onClick={() => run('optimize', api.optimize)}>
                OPTIMIZE RESPONSE
              </DemoButton>
              <DemoButton busy={busy === 'road'} onClick={() => run('road', () => api.trigger('road_block'))}>
                TRIGGER ROAD COLLAPSE
              </DemoButton>
              <DemoButton busy={busy === 'ambulance'} onClick={() => run('ambulance', () => api.trigger('resource_fail', { resource_type: 'ambulance' }))}>
                FAIL AMBULANCE
              </DemoButton>
              <DemoButton busy={busy === 'pop'} onClick={() => run('pop', () => api.trigger('population_increase'))}>
                INCREASE ZONE POPULATION
              </DemoButton>
              <DemoButton busy={busy === 'shelter'} onClick={() => run('shelter', () => api.trigger('shelter_full'))}>
                FILL SHELTER
              </DemoButton>
            </div>
          </div>

          <div className="panel p-3 flex-1 min-h-0 flex flex-col">
            <div className="data-label text-[10px] text-grid-dim mb-2">LIVE EVENTS</div>
            <div className="flex-1 overflow-auto space-y-2 pr-1">
              {[...liveEvents].reverse().map((e) => (
                <div key={e.id} className="text-xs border-l-2 border-grid-line pl-2 py-0.5">
                  <div className="data-label text-[10px] text-grid-dim">T+{e.sim_time} MIN · {e.type}</div>
                  <div className="text-grid-text">{e.message}</div>
                </div>
              ))}
              {liveEvents.length === 0 && (
                <div className="text-xs text-grid-dim">No events yet. Start the simulation or use demo controls.</div>
              )}
            </div>
          </div>

          <div className="panel p-3">
            <div className="data-label text-[10px] text-grid-dim mb-2">DATA SOURCES</div>
            <DataSourceStatus sources={overview.live.data_sources} compact />
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoButton({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-left px-3 py-2 text-xs rounded border border-grid-line bg-grid-panel2 hover:border-grid-accent hover:text-grid-accent transition-colors disabled:opacity-50 data-label"
    >
      {busy ? 'WORKING…' : children}
    </button>
  )
}
