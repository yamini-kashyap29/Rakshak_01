import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useAppData } from '../context/AppData'
import DataSourceStatus from '../components/DataSourceStatus'

const DEFAULT_ALLOC = { priority: 40, suitability: 25, distance: 20, urgency: 10, availability: 5 }
const DISASTER_TYPES = ['Flood', 'Cyclone', 'Earthquake', 'Wildfire']

export default function Settings() {
  const { refresh, overview } = useAppData()
  const [weights, setWeights] = useState(DEFAULT_ALLOC)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [disasterType, setDisasterType] = useState('Flood')
  const [numZones, setNumZones] = useState(12)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    api.settings().then((s) => {
      setWeights({
        priority: Math.round(s.allocation_weights.priority * 100),
        suitability: Math.round(s.allocation_weights.suitability * 100),
        distance: Math.round(s.allocation_weights.distance * 100),
        urgency: Math.round(s.allocation_weights.urgency * 100),
        availability: Math.round(s.allocation_weights.availability * 100),
      })
    })
  }, [])

  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  const save = async () => {
    setErr(null)
    setSaved(false)
    try {
      await api.setAllocationWeights({
        priority: weights.priority / 100, suitability: weights.suitability / 100,
        distance: weights.distance / 100, urgency: weights.urgency / 100,
        availability: weights.availability / 100,
      })
      setSaved(true)
      refresh()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      await api.generateScenario({ disaster_type: disasterType, num_zones: numZones })
      refresh()
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-5 h-full overflow-auto max-w-3xl space-y-5">
      <div className="panel p-4">
        <div className="data-label text-xs text-grid-dim mb-3">DATA SOURCES</div>
        {overview ? (
          <DataSourceStatus sources={overview.live.data_sources} />
        ) : (
          <div className="text-xs text-grid-dim">Loading…</div>
        )}
        <div className="text-[11px] text-grid-dim mt-3 leading-relaxed">
          Facility locations (hospitals, shelters) can be sourced from OpenStreetMap; their
          operational capacity — beds, occupancy — is always simulated/operator-entered, since no
          public API exposes real-time hospital bed counts. That distinction is intentional: this
          system never claims real-time capacity data it doesn't have. Weather refreshes every{' '}
          <span className="data-label">WEATHER_REFRESH_SECONDS</span> (default 60s, see{' '}
          <span className="data-label">backend/.env.example</span>).
        </div>
      </div>

      <div className="panel p-4">
        <div className="data-label text-xs text-grid-dim mb-3">ALLOCATION ENGINE WEIGHTS</div>
        <div className="text-xs text-grid-dim mb-4">
          Assignment Score = Priority + Suitability + Distance + Urgency + Availability, weighted below.
        </div>
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
          Total: {total}% {total !== 100 && '— weights must total 100%'}
        </div>
        {err && <div className="text-xs text-grid-critical mb-2">{err}</div>}
        {saved && total === 100 && <div className="text-xs text-grid-safe mb-2">Saved. Re-run optimize to apply.</div>}
        <button
          onClick={save}
          disabled={total !== 100}
          className="px-4 py-2 text-xs rounded border border-grid-accent text-grid-accent hover:bg-grid-accent/10 disabled:opacity-40 data-label"
        >
          SAVE WEIGHTS
        </button>
      </div>

      <div className="panel p-4">
        <div className="data-label text-xs text-grid-dim mb-3">SCENARIO BUILDER</div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs text-grid-dim mb-1">Disaster Type</div>
            <select
              value={disasterType}
              onChange={(e) => setDisasterType(e.target.value)}
              className="w-full bg-grid-panel2 border border-grid-line rounded px-2 py-1.5 text-xs"
            >
              {DISASTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-grid-dim mb-1">Number of Zones</div>
            <input
              type="number" min={4} max={30} value={numZones}
              onChange={(e) => setNumZones(Number(e.target.value))}
              className="w-full bg-grid-panel2 border border-grid-line rounded px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        <div className="text-xs text-grid-dim mb-3">
          Generating a new scenario resets the simulation with a fresh seeded disaster of the
          selected type. The current build uses the standard seeded zone/resource layout as a
          reliable base — future work could vary zone/resource counts directly from this form.
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-2 text-xs rounded border border-grid-line hover:border-grid-accent hover:text-grid-accent disabled:opacity-50 data-label"
        >
          {generating ? 'GENERATING…' : 'GENERATE SCENARIO'}
        </button>
      </div>
    </div>
  )
}
