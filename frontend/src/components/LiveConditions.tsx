import type { Weather } from '../types'

const SEVERITY_STYLE: Record<string, string> = {
  LOW: 'text-grid-safe', MODERATE: 'text-grid-warn', HIGH: 'text-grid-critical',
}

export default function LiveConditions({ weather, updated }: { weather: Weather | null; updated: string | null }) {
  if (!weather) {
    return (
      <div className="panel p-3">
        <div className="data-label text-[10px] text-grid-dim mb-1">LIVE CONDITIONS</div>
        <div className="text-xs text-grid-dim">No weather data yet.</div>
      </div>
    )
  }

  // Mirrors the accessibility-risk delta the backend's priority engine applies
  // (see priority_engine._weather_access_delta) so the displayed "impact"
  // always matches what actually changed the score.
  const rain = weather.precipitation_mm || 0
  const gusts = weather.wind_gusts_kmh || 0
  const rainComponent = Math.min(30, (rain / 20) * 30)
  const windComponent = Math.min(15, (Math.max(0, gusts - 30) / 40) * 15)
  const accessibilityDelta = Math.round((rainComponent + windComponent) * 10) / 10
  const floodRiskDelta = Math.round(Math.min(40, rain * 2) * 10) / 10

  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="data-label text-[10px] text-grid-dim">LIVE CONDITIONS</div>
        <span className={`data-label text-[10px] ${SEVERITY_STYLE[weather.severity]}`}>
          SEVERITY {weather.severity}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-y-1 text-sm mb-2">
        <div>{weather.temperature_c}°C</div>
        <div className="text-right text-grid-dim">{weather.humidity_pct}% humidity</div>
        <div>{weather.precipitation_mm} mm rain</div>
        <div className="text-right text-grid-dim">{weather.wind_speed_kmh} km/h wind</div>
        <div>{weather.wind_gusts_kmh} km/h gusts</div>
      </div>
      {accessibilityDelta >= 3 && (
        <div className="border-t border-grid-line pt-2 mt-1">
          <div className="data-label text-[10px] text-grid-dim mb-1">IMPACT ON RESPONSE</div>
          <div className="flex justify-between text-xs">
            <span className="text-grid-dim">Accessibility risk</span>
            <span className="text-grid-critical">+{accessibilityDelta}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-grid-dim">Flood risk</span>
            <span className="text-grid-critical">+{floodRiskDelta}</span>
          </div>
        </div>
      )}
      <div className="data-label text-[9px] text-grid-dim mt-2">Updated {updated || weather.fetched_at}</div>
    </div>
  )
}
