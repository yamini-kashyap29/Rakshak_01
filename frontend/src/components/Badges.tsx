const RISK_COLOR: Record<string, string> = {
  CRITICAL: 'text-grid-critical border-grid-critical/40 bg-grid-critical/10',
  HIGH: 'text-grid-high border-grid-high/40 bg-grid-high/10',
  ELEVATED: 'text-grid-warn border-grid-warn/40 bg-grid-warn/10',
  GUARDED: 'text-grid-safe border-grid-safe/40 bg-grid-safe/10',
  LOW: 'text-grid-dim border-grid-line bg-grid-panel2',
}

export function RiskBadge({ level }: { level: string }) {
  const cls = RISK_COLOR[level] || RISK_COLOR.LOW
  return (
    <span className={`data-label text-[10px] px-1.5 py-0.5 border rounded ${cls}`}>
      {level}
    </span>
  )
}

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'text-grid-safe',
  ASSIGNED: 'text-grid-accent',
  'EN ROUTE': 'text-grid-accent',
  'ON SITE': 'text-grid-safe',
  UNAVAILABLE: 'text-grid-dim',
  MAINTENANCE: 'text-grid-critical',
  OPERATIONAL: 'text-grid-safe',
  'NEAR CAPACITY': 'text-grid-warn',
  FULL: 'text-grid-critical',
}

export function StatusDot({ status }: { status: string }) {
  const cls = STATUS_COLOR[status] || 'text-grid-dim'
  return <span className={`data-label text-[11px] ${cls}`}>● {status}</span>
}

export function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="panel px-4 py-3 flex flex-col gap-1 min-w-[140px]">
      <div className="data-label text-[10px] text-grid-dim">{label}</div>
      <div className="font-display text-2xl font-600 text-grid-text leading-none">{value}</div>
      {sub && <div className="text-[11px] text-grid-dim">{sub}</div>}
    </div>
  )
}
