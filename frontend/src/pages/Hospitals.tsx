import { useAppData } from '../context/AppData'
import { StatusDot } from '../components/Badges'

export default function Hospitals() {
  const { overview } = useAppData()
  if (!overview) return null

  return (
    <div className="p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="data-label text-xs text-grid-dim">HOSPITAL NETWORK</div>
        <div className="data-label text-[10px] text-grid-dim">FACILITY LOCATIONS: LIVE-CAPABLE (OSM) · BED COUNTS: SIMULATED</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {overview.hospitals.map((h) => {
          const erPct = Math.round((h.emergency_beds_used / h.emergency_beds_total) * 100)
          const icuPct = Math.round((h.icu_beds_used / h.icu_beds_total) * 100)
          return (
            <div key={h.id} className="panel p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="font-display text-base">{h.name}</div>
                <StatusDot status={h.status} />
              </div>
              <BedRow label="Emergency" used={h.emergency_beds_used} total={h.emergency_beds_total} pct={erPct} />
              <BedRow label="ICU" used={h.icu_beds_used} total={h.icu_beds_total} pct={icuPct} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BedRow({ label, used, total, pct }: { label: string; used: number; total: number; pct: number }) {
  const color = pct >= 90 ? 'bg-grid-critical' : pct >= 70 ? 'bg-grid-warn' : 'bg-grid-safe'
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-grid-dim">{label}</span>
        <span className="data-label">{used} / {total}</span>
      </div>
      <div className="w-full h-1.5 bg-grid-panel2 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}
