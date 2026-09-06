const BASE = '/api'

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  overview: () => req('/overview'),
  health: () => req('/health'),

  zones: () => req('/zones'),
  zone: (id: string) => req(`/zones/${id}`),
  recalcPriorities: (weights?: any) =>
    req('/zones/recalculate', { method: 'POST', body: weights ? JSON.stringify(weights) : undefined }),

  resources: (params?: { type?: string; status?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : ''
    return req(`/resources${qs}`)
  },

  assignments: () => req('/allocations'),
  optimize: () => req('/allocations/optimize', { method: 'POST' }),
  why: (id: string) => req(`/allocations/${id}/why`),
  checkConflict: (resource_id: string, zone_id: string) =>
    req('/allocations/check-conflict', { method: 'POST', body: JSON.stringify({ resource_id, zone_id }) }),
  forceAssign: (resource_id: string, zone_id: string) =>
    req('/allocations/force-assign', { method: 'POST', body: JSON.stringify({ resource_id, zone_id }) }),

  simState: () => req('/simulation/state'),
  simStart: () => req('/simulation/start', { method: 'POST' }),
  simPause: () => req('/simulation/pause', { method: 'POST' }),
  simReset: () => req('/simulation/reset', { method: 'POST' }),
  simSpeed: (speed: number) => req('/simulation/speed', { method: 'POST', body: JSON.stringify({ speed }) }),
  trigger: (kind: string, extra: Record<string, any> = {}) =>
    req('/simulation/trigger', { method: 'POST', body: JSON.stringify({ kind, ...extra }) }),
  previewEvent: (kind: string, extra: Record<string, any> = {}) =>
    req('/simulation/preview', { method: 'POST', body: JSON.stringify({ kind, ...extra }) }),
  baseline: () => req('/simulation/baseline', { method: 'POST' }),

  liveData: () => req('/live-data'),
  liveWeather: () => req('/weather'),
  liveEarthquakes: () => req('/earthquakes'),
  liveDataStatus: () => req('/live-data/status'),
  liveDataRefresh: () => req('/live-data/refresh', { method: 'POST' }),

  metrics: () => req('/analytics/metrics'),
  compare: () => req('/analytics/compare'),

  shelters: () => req('/shelters'),
  hospitals: () => req('/hospitals'),
  depots: () => req('/depots'),
  roads: () => req('/roads'),
  settings: () => req('/settings'),
  setAllocationWeights: (w: any) => req('/settings/allocation-weights', { method: 'POST', body: JSON.stringify(w) }),
  generateScenario: (body: any) => req('/scenario/generate', { method: 'POST', body: JSON.stringify(body) }),
}
