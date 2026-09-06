import type { DataSources } from '../types'

const STATUS_STYLE: Record<string, string> = {
  LIVE: 'text-grid-safe',
  FALLBACK: 'text-grid-warn',
  OFFLINE: 'text-grid-critical',
  SIMULATION: 'text-grid-dim',
}

const LABELS: Record<string, string> = {
  weather: 'Weather', earthquakes: 'Earthquakes', road_network: 'Road Network',
  facilities: 'Facilities', resources: 'Resources', population: 'Population',
  shelter_beds: 'Shelter Beds',
}

export default function DataSourceStatus({ sources, compact }: { sources: DataSources; compact?: boolean }) {
  const entries = Object.entries(sources) as [keyof DataSources, DataSources[keyof DataSources]][]
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {entries.map(([key, s]) => (
        <div key={key} className="flex items-center justify-between text-xs">
          <span className="text-grid-dim">{LABELS[key] || key}</span>
          <div className="flex items-center gap-2">
            {!compact && <span className="data-label text-[10px] text-grid-dim">{s.provider}</span>}
            <span className={`data-label text-[10px] ${STATUS_STYLE[s.status] || 'text-grid-dim'}`}>
              ● {s.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
