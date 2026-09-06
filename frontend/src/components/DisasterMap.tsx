import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import type { Zone, Resource, Shelter, Hospital, Assignment, Earthquake } from '../types'

const RISK_HEX: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', ELEVATED: '#eab308',
  GUARDED: '#22c55e', LOW: '#7c8ba1',
}

const RESOURCE_HEX: Record<string, string> = {
  AVAILABLE: '#22c55e', ASSIGNED: '#2dd4bf', 'EN ROUTE': '#2dd4bf',
  'ON SITE': '#22c55e', MAINTENANCE: '#ef4444', UNAVAILABLE: '#7c8ba1',
}

function quakeIcon(magnitude: number) {
  const size = 16 + Math.min(14, magnitude * 2)
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:rgba(239,68,68,0.25);
      border:1.5px solid #ef4444;
      transform:rotate(45deg);
      display:flex;align-items:center;justify-content:center;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export interface MapLayers {
  zones: boolean; resources: boolean; routes: boolean;
  hospitals: boolean; shelters: boolean; earthquakes: boolean;
}

export default function DisasterMap({
  center, zones, resources, shelters, hospitals, assignments, earthquakes = [],
  layers, onZoneClick, onResourceClick,
}: {
  center: [number, number]; zones: Zone[]; resources: Resource[];
  shelters: Shelter[]; hospitals: Hospital[]; assignments: Assignment[];
  earthquakes?: Earthquake[]; layers: MapLayers;
  onZoneClick?: (z: Zone) => void; onResourceClick?: (r: Resource) => void
}) {
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]))
  const resById = Object.fromEntries(resources.map((r) => [r.id, r]))

  return (
    <MapContainer center={center} zoom={12} className="w-full h-full" zoomControl={true}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />

      {layers.routes && assignments.map((a) => {
        const z = zoneById[a.zone_id]
        const r = resById[a.resource_id]
        if (!z || !r) return null
        // Real OSRM geometry when available (Section 5), else a simple
        // straight line between resource and zone as a reliable fallback.
        const geometry = (a as any).real_route?.geometry as [number, number][] | undefined
        const positions: [number, number][] = geometry
          ? geometry.map(([lon, lat]) => [lat, lon])
          : [[r.lat, r.lng], [z.lat, z.lng]]
        return (
          <Polyline
            key={a.id}
            positions={positions}
            pathOptions={{
              color: '#2dd4bf', weight: geometry ? 2.5 : 1.5, opacity: geometry ? 0.8 : 0.55,
              dashArray: geometry ? undefined : '4 4',
            }}
          />
        )
      })}

      {layers.zones && zones.map((z) => (
        <CircleMarker
          key={z.id}
          center={[z.lat, z.lng]}
          radius={8 + Math.min(14, z.population / 200)}
          pathOptions={{
            color: RISK_HEX[z.risk_level] || RISK_HEX.LOW,
            fillColor: RISK_HEX[z.risk_level] || RISK_HEX.LOW,
            fillOpacity: 0.35, weight: 2,
          }}
          eventHandlers={{ click: () => onZoneClick?.(z) }}
        >
          <Tooltip direction="top">
            {z.name} · priority {z.priority_score} · {z.risk_level}
          </Tooltip>
          <Popup>
            <div className="text-xs space-y-0.5">
              <div className="font-semibold">{z.name}</div>
              <div>Population: {z.population.toLocaleString()}</div>
              <div>Critical: {z.critical} · Trapped: {z.trapped}</div>
              <div>Priority score: {z.priority_score}</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {layers.resources && resources.map((r) => (
        <CircleMarker
          key={r.id}
          center={[r.lat, r.lng]}
          radius={4}
          pathOptions={{
            color: RESOURCE_HEX[r.status] || '#7c8ba1',
            fillColor: RESOURCE_HEX[r.status] || '#7c8ba1',
            fillOpacity: 0.9, weight: 1,
          }}
          eventHandlers={{ click: () => onResourceClick?.(r) }}
        >
          <Tooltip direction="top">{r.name} · {r.status}</Tooltip>
        </CircleMarker>
      ))}

      {layers.shelters && shelters.map((s) => {
        const pct = Math.round((s.occupancy / s.capacity) * 100)
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={6}
            pathOptions={{ color: '#a78bfa', fillColor: '#a78bfa', fillOpacity: 0.6, weight: 1 }}
          >
            <Tooltip direction="top">{s.name} · {pct}% full</Tooltip>
          </CircleMarker>
        )
      })}

      {layers.hospitals && hospitals.map((h) => (
        <CircleMarker
          key={h.id}
          center={[h.lat, h.lng]}
          radius={6}
          pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.6, weight: 1 }}
        >
          <Tooltip direction="top">{h.name}</Tooltip>
        </CircleMarker>
      ))}

      {layers.earthquakes && earthquakes.map((q) => (
        <Marker key={q.id} position={[q.lat, q.lng]} icon={quakeIcon(q.magnitude)}>
          <Tooltip direction="top">
            EARTHQUAKE · M {q.magnitude} · {q.depth_km} km depth · {q.distance_km} km away
          </Tooltip>
          <Popup>
            <div className="text-xs space-y-0.5">
              <div className="font-semibold">M {q.magnitude} — {q.place}</div>
              <div>Depth: {q.depth_km} km</div>
              <div>{q.distance_km} km from command area</div>
              {q.alert && <div>Alert: {q.alert}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
