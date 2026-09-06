import { useAppData } from '../context/AppData'
import { StatusDot } from '../components/Badges'

export default function Shelters() {
  const { overview } = useAppData()
  if (!overview) return null

  return (
    <div className="p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="data-label text-xs text-grid-dim">SHELTER NETWORK</div>
        <div className="data-label text-[10px] text-grid-dim">FACILITY LOCATIONS: LIVE-CAPABLE (OSM) · CAPACITY: SIMULATED</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {overview.shelters.map((s) => {
          const pct = Math.round((s.occupancy / s.capacity) * 100)
          const status = pct >= 98 ? 'FULL' : pct >= 85 ? 'NEAR CAPACITY' : 'OPERATIONAL'
          const barColor = pct >= 98 ? 'bg-grid-critical' : pct >= 85 ? 'bg-grid-warn' : 'bg-grid-safe'
          return (
            <div key={s.id} className="panel p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="font-display text-base">{s.name}</div>
                <StatusDot status={status} />
              </div>
              <div className="text-xs text-grid-dim mb-1">
                {s.occupancy.toLocaleString()} / {s.capacity.toLocaleString()} occupants
              </div>
              <div className="w-full h-1.5 bg-grid-panel2 rounded overflow-hidden mb-3">
                <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="flex gap-3 text-[11px] text-grid-dim">
                <span>{s.medical_support ? '✓' : '✗'} Medical</span>
                <span>{s.water ? '✓' : '✗'} Water</span>
                <span>{s.food ? '✓' : '✗'} Food</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
