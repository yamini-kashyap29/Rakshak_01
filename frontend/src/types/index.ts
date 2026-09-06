export interface Zone {
  id: string; name: string; lat: number; lng: number;
  population: number; injured: number; critical: number; trapped: number;
  water_level: number; accessibility: 'FULL' | 'PARTIAL' | 'BLOCKED';
  waiting_time: number; status: string;
  priority_score: number; risk_level: string;
  priority_breakdown?: Record<string, any>;
}

export interface Resource {
  id: string; name: string; type: string; lat: number; lng: number;
  status: string; capacity: number; capabilities: string[];
  current_assignment: string | null;
}

export interface Assignment {
  id: string; resource_id: string; resource_name: string;
  zone_id: string; zone_name: string; score: number;
  breakdown: Record<string, any>; route: any; reason: string; status: string;
  real_route?: { distance_km: number; duration_min: number; geometry: [number, number][] } | null;
}

export interface Shelter {
  id: string; name: string; lat: number; lng: number;
  capacity: number; occupancy: number; occupancy_pct: number; status: string;
  medical_support: boolean; water: boolean; food: boolean;
}

export interface Hospital {
  id: string; name: string; lat: number; lng: number;
  emergency_beds_total: number; emergency_beds_used: number;
  icu_beds_total: number; icu_beds_used: number; status: string;
}

export interface RoadT { id: string; label: string; blocked: boolean; distance_km: number; }

export interface EventT {
  id: string; type: string; message: string; meta: Record<string, any>;
  sim_time: number; ts: number;
}

export interface Weather {
  temperature_c: number; precipitation_mm: number; rain_mm: number;
  wind_speed_kmh: number; wind_gusts_kmh: number; humidity_pct: number;
  weather_code: number; severity: 'LOW' | 'MODERATE' | 'HIGH'; fetched_at: string;
}

export interface Earthquake {
  id: string; magnitude: number; place: string; lat: number; lng: number;
  depth_km: number; time_ms: number; alert: string | null; distance_km: number;
}

export interface DataSourceEntry {
  status: 'LIVE' | 'FALLBACK' | 'OFFLINE' | 'SIMULATION';
  provider: string; updated: string | null;
}

export interface DataSources {
  weather: DataSourceEntry; earthquakes: DataSourceEntry; road_network: DataSourceEntry;
  facilities: DataSourceEntry; resources: DataSourceEntry; population: DataSourceEntry;
  shelter_beds: DataSourceEntry;
}

export interface LiveBlock {
  weather: Weather | null; earthquakes: Earthquake[]; data_sources: DataSources;
}

export interface Overview {
  disaster_name: string; disaster_type: string; system_status: string;
  sim_time_min: number; sim_running: boolean; mode: 'LIVE' | 'SIMULATION';
  center: [number, number]; live: LiveBlock;
  kpis: {
    affected_population: number; critical_cases: number;
    active_resources: number; total_resources: number; active_zones: number;
    shelter_capacity_pct: number; avg_response_time_min: number;
  };
  zones: Zone[]; resources: Resource[]; shelters: Shelter[];
  hospitals: Hospital[]; depots: any[]; roads: RoadT[];
  assignments: Assignment[]; events: EventT[];
}

export interface Metrics {
  avg_response_time_min: number; critical_zone_coverage_pct: number;
  resource_utilization_pct: number; population_served: number;
  unserved_population: number; shelter_utilization_pct: number;
  route_failures: number; reallocations: number; active_assignments: number;
  total_zones: number; total_resources: number;
}
