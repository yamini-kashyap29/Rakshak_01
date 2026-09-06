import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppData'
import { StatusDot } from '../components/Badges'

export default function Resources() {
  const { overview } = useAppData()
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const types = useMemo(
    () => ['ALL', ...Array.from(new Set(overview?.resources.map((r) => r.type) || []))],
    [overview],
  )
  const statuses = ['ALL', 'AVAILABLE', 'ASSIGNED', 'EN ROUTE', 'ON SITE', 'MAINTENANCE']

  if (!overview) return null

  const zoneName = (id: string | null) => overview.zones.find((z) => z.id === id)?.name || '—'

  const filtered = overview.resources.filter(
    (r) => (typeFilter === 'ALL' || r.type === typeFilter) && (statusFilter === 'ALL' || r.status === statusFilter),
  )

  return (
    <div className="p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="data-label text-xs text-grid-dim">RESOURCE FLEET</div>
        <div className="flex gap-2">
          <Select value={typeFilter} onChange={setTypeFilter} options={types} />
          <Select value={statusFilter} onChange={setStatusFilter} options={statuses} />
        </div>
      </div>

      <div className="flex-1 overflow-auto panel">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-grid-panel2 data-label text-[10px] text-grid-dim">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Capacity</th>
              <th className="text-left px-3 py-2">Capabilities</th>
              <th className="text-left px-3 py-2">Assignment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-grid-line">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-grid-panel2/60">
                <td className="px-3 py-2 data-label text-grid-dim">{r.id}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 capitalize">{r.type.replace('_', ' ')}</td>
                <td className="px-3 py-2"><StatusDot status={r.status} /></td>
                <td className="px-3 py-2">{r.capacity}</td>
                <td className="px-3 py-2 text-grid-dim">{r.capabilities.join(', ')}</td>
                <td className="px-3 py-2">{zoneName(r.current_assignment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-grid-panel2 border border-grid-line rounded px-2 py-1 text-xs data-label text-grid-text"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
