import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../services/api'
import { useAppData } from '../context/AppData'
import type { Metrics } from '../types'

export default function Analytics() {
  const { lastSignal } = useAppData()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [compare, setCompare] = useState<{ initial_plan: Metrics; adaptive_plan: Metrics } | null>(null)

  const load = async () => {
    setMetrics(await api.metrics())
    setCompare(await api.compare())
  }

  useEffect(() => { load() }, [lastSignal])

  if (!metrics || !compare) return <div className="p-5 text-grid-dim data-label text-sm">LOADING…</div>

  const chartData = [
    { name: 'Response Time (min)', Initial: compare.initial_plan.avg_response_time_min, Adaptive: compare.adaptive_plan.avg_response_time_min },
    { name: 'Critical Coverage (%)', Initial: compare.initial_plan.critical_zone_coverage_pct, Adaptive: compare.adaptive_plan.critical_zone_coverage_pct },
    { name: 'Resource Util (%)', Initial: compare.initial_plan.resource_utilization_pct, Adaptive: compare.adaptive_plan.resource_utilization_pct },
  ]

  return (
    <div className="p-5 h-full overflow-auto space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Population Served" value={metrics.population_served.toLocaleString()} />
        <Stat label="Unserved Population" value={metrics.unserved_population.toLocaleString()} />
        <Stat label="Shelter Utilization" value={`${metrics.shelter_utilization_pct}%`} />
        <Stat label="Reallocations" value={metrics.reallocations} />
      </div>

      <div className="panel p-4 h-72">
        <div className="data-label text-xs text-grid-dim mb-2">INITIAL PLAN vs ADAPTIVE PLAN</div>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={chartData}>
            <CartesianGrid stroke="#233041" strokeDasharray="3 3" />
            <XAxis dataKey="name" stroke="#7c8ba1" tick={{ fontSize: 11 }} />
            <YAxis stroke="#7c8ba1" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#111820', border: '1px solid #233041', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Initial" fill="#7c8ba1" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Adaptive" fill="#2dd4bf" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-grid-panel2 data-label text-[10px] text-grid-dim">
            <tr>
              <th className="text-left px-4 py-2">METRIC</th>
              <th className="text-left px-4 py-2">INITIAL PLAN</th>
              <th className="text-left px-4 py-2">ADAPTIVE PLAN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-grid-line">
            <Row label="Response Time (min)" a={compare.initial_plan.avg_response_time_min} b={compare.adaptive_plan.avg_response_time_min} />
            <Row label="Critical Coverage (%)" a={compare.initial_plan.critical_zone_coverage_pct} b={compare.adaptive_plan.critical_zone_coverage_pct} />
            <Row label="Resource Utilization (%)" a={compare.initial_plan.resource_utilization_pct} b={compare.adaptive_plan.resource_utilization_pct} />
            <Row label="Unserved Population" a={compare.initial_plan.unserved_population} b={compare.adaptive_plan.unserved_population} />
            <Row label="Route Failures" a={compare.initial_plan.route_failures} b={compare.adaptive_plan.route_failures} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel px-4 py-3">
      <div className="data-label text-[10px] text-grid-dim mb-1">{label}</div>
      <div className="font-display text-2xl">{value}</div>
    </div>
  )
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <tr>
      <td className="px-4 py-2 text-grid-dim">{label}</td>
      <td className="px-4 py-2 data-label">{a}</td>
      <td className="px-4 py-2 data-label text-grid-accent">{b}</td>
    </tr>
  )
}
