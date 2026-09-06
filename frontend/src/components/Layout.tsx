import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppData } from '../context/AppData'

const NAV_GROUPS = [
  { section: null, items: [{ to: '/', label: 'Command Center', icon: '◈' }] },
  {
    section: 'OPERATIONS',
    items: [
      { to: '/zones', label: 'Zones', icon: '▲' },
      { to: '/resources', label: 'Resources', icon: '●' },
      { to: '/allocations', label: 'Allocations', icon: '↔' },
    ],
  },
  {
    section: 'LOGISTICS',
    items: [
      { to: '/shelters', label: 'Shelters', icon: '⌂' },
      { to: '/hospitals', label: 'Hospitals', icon: '✚' },
    ],
  },
  {
    section: 'ANALYSIS',
    items: [
      { to: '/analytics', label: 'Analytics', icon: '▤' },
      { to: '/whatif', label: 'What-If', icon: '?' },
    ],
  },
  { section: 'SYSTEM', items: [{ to: '/settings', label: 'Settings', icon: '⚙' }] },
]

function useClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t.toUTCString().slice(17, 25) // HH:MM:SS
}

export default function Layout() {
  const { overview } = useAppData()
  const clock = useClock()
  const status = overview?.system_status || 'OPERATIONAL'
  const mode = overview?.mode || 'LIVE'

  return (
    <div className="h-screen w-screen flex bg-grid-bg text-grid-text font-body overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-grid-line bg-grid-panel flex flex-col">
        <div className="px-4 py-4 border-b border-grid-line">
          <div className="font-display font-700 text-xl tracking-tight text-grid-text">RescueGrid</div>
          <div className="data-label text-[10px] text-grid-dim mt-0.5">DISASTER RESPONSE GRID</div>
        </div>
        <nav className="flex-1 py-2 overflow-auto">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="mb-1">
              {group.section && (
                <div className="px-4 pt-3 pb-1 data-label text-[9px] text-grid-dim/70 tracking-wider">
                  {group.section}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 text-sm border-l-2 transition-colors ${
                      isActive
                        ? 'border-grid-accent text-grid-text bg-grid-panel2'
                        : 'border-transparent text-grid-dim hover:text-grid-text hover:bg-grid-panel2/60'
                    }`
                  }
                >
                  <span className="w-4 text-center opacity-70">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-grid-line data-label text-[10px] text-grid-dim">
          SIMULATION PROTOTYPE
          <br />no live dispatch data
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-grid-line bg-grid-panel flex items-center justify-between px-5">
          <div className="flex flex-col leading-none">
            <span className="font-display text-sm font-600">RESCUEGRID</span>
            <span className="data-label text-[9px] text-grid-dim">DISASTER RESPONSE GRID</span>
          </div>

          <div className="flex flex-col items-center leading-none">
            <span className="font-display text-sm font-600">{overview?.disaster_name || '—'}</span>
            <span className="data-label text-[9px] text-grid-dim flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${mode === 'SIMULATION' ? 'bg-grid-warn' : 'bg-grid-accent'}`} />
              {mode === 'SIMULATION' ? 'DEMO SIMULATION RUNNING' : 'LIVE RESPONSE OPERATION'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 data-label text-xs">
              <span
                className={`w-2 h-2 rounded-full pulse-dot ${
                  status === 'OPERATIONAL' ? 'bg-grid-safe' : 'bg-grid-critical'
                }`}
              />
              <span className="text-grid-dim">SYSTEM {status}</span>
            </div>
            <div className="data-label text-xs text-grid-text tabular-nums">{clock} UTC</div>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
