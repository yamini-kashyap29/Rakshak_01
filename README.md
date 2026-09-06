# RescueGrid

A real-time disaster response decision engine: a continuously adapting
resource-allocation platform, not a one-time planning tool.

**"RescueGrid doesn't create a disaster response plan once. It continuously
adapts the plan as the disaster changes."**

The core loop:

```
DISASTER → ASSESS → PRIORITIZE → ALLOCATE → ROUTE → MONITOR
   ↑                                                    ↓
   └──────── REROUTE ← REALLOCATE ← REASSESS ← EVENT OCCURS
```

Every decision is deterministic — weighted scoring, constraint checking,
route calculation, resource suitability, optimization. No AI/ML, no LLMs,
no chatbots, no blockchain.

---

## Features

**Live data, honestly labeled**
- Real weather (Open-Meteo) and real recent earthquakes (USGS), refreshed on
  a background interval — never fetched synchronously on page render.
- A visible **Data Sources** panel shows exactly which feeds are
  `LIVE`, `FALLBACK` (using last known good data), `OFFLINE`, or intentionally
  `SIMULATION` (population, resource fleet, shelter/hospital bed counts —
  nothing here claims to be real hospital capacity data, because no public
  API provides that).
- Best-effort real road routing via OSRM for map display and distance
  refinement, with instant, offline-safe fallback to the deterministic
  named-road model that also drives the block/reroute demo mechanic.

**Live data → decision engine, not just a widget**
- Rainfall and wind gusts feed directly into the **priority engine**'s
  accessibility-risk score. When that happens, the affected zone's priority
  breakdown includes an explicit `change_reason` ("Live weather (18.2mm
  rainfall, 61km/h gusts) increased accessibility risk from 60 to 78.") —
  so the system is explainable, not just reactive.
- A meaningful live-data change (weather delta ≥ 5, or a new earthquake)
  triggers a real re-optimization of the allocation plan, broadcast to every
  connected client over WebSocket.

**Deterministic engines (unchanged core, now live-data-aware)**
- **Priority engine** — 30/25/20/15/10 weighted scoring (population, critical
  patients, trapped population, accessibility/risk, waiting time),
  configurable, normalized 0–100 per scenario.
- **Allocation engine** — 40/25/20/10/5 weighted scoring (priority,
  suitability, distance, urgency, availability); hard constraints
  (availability, capability match, no double-booking, reachable route,
  maintenance exclusion); every assignment is explainable via a "WHY?" panel.
- **Routing engine** — primary/alternate named roads per zone; a blocked
  road forces an automatic re-route or an explicit "no usable route"
  fallback; optionally refined with real OSRM geometry/ETA.
- **Simulation engine** — a scripted disaster timeline plus manual demo
  triggers (fail a resource, block a road, population surge, shelter
  overflow, new emergency), each following
  DETECT → REASSESS → REALLOCATE → REROUTE.
- **Conflict engine** — detects a resource already committed elsewhere;
  supports forced reassignment.
- **What-If engine** — genuinely non-destructive preview. It snapshots live
  state, runs the *real* allocation engine against a hypothetical event,
  measures the projected metrics, then restores the snapshot. Nothing
  changes in the live scenario until you click **APPLY**.
- **Analytics engine** — every metric (response time, critical coverage,
  resource utilization, unserved population, shelter utilization, route
  failures, reallocations) is computed live from current state; nothing is
  hard-coded.

**UI — command-center redesign**
- Premium header: brand · disaster name + LIVE/SIMULATION mode indicator ·
  system status + live clock.
- Sidebar regrouped into OPERATIONS / LOGISTICS / ANALYSIS / SYSTEM.
- Map is the centerpiece: zones, resources, shelters, hospitals, real
  earthquake markers, and assignment routes (drawn with real OSRM geometry
  when available, a clean dashed line otherwise), with a floating layer
  toggle panel.
- **Command Center** — KPI strip, live weather panel with deterministic
  "impact on response" readout, live event feed, one-click demo buttons,
  compact data-source status.
- **Zones** — ranked list, click-through priority breakdown including the
  live-weather change explanation when relevant, live weight sliders.
- **Resources** — filterable fleet table.
- **Allocations** — assignment list with a full "WHY?" panel: score
  breakdown, named-road route, real OSRM route when available, and a
  plain-language reason.
- **Shelters** / **Hospitals** — capacity/occupancy and bed-availability views
  (new this pass).
- **What-If** — radio-button event picker with optional resource/road
  targeting, a **RUN REOPTIMIZATION** preview (current vs. projected plan,
  live scenario untouched), and an explicit **APPLY** step to commit.
- **Analytics** — live metrics, Initial Plan vs Adaptive Plan chart and table.
- **Settings** — Data Sources status, configurable allocation weights,
  scenario builder.

---

## Architecture notes

### In-memory state, not Postgres

All state lives in a single in-process Python store
(`backend/app/database/store.py`). This is a deliberate reliability
trade-off explicitly endorsed by the original brief ("reliability is more
important than algorithmic sophistication"): the app boots and runs
deterministically with zero external services, no migrations, and no
connection failures during a live demo. Every module only talks to the
store through its methods, so swapping in a real Postgres repository later
is a contained, mechanical change.

### Live data is additive, never load-bearing

Nothing in the core decision loop *requires* a successful external API call:
- Weather/earthquake fetch failures leave `DB.data_sources[...]` at
  `FALLBACK`/`OFFLINE` and simply skip that refresh cycle — the UI reflects
  this honestly rather than pretending.
- OSRM routing failures fall back instantly to the deterministic named-road
  model, which is what the road-block demo mechanic actually depends on.
- The public Open-Meteo, USGS, and OSRM demo endpoints require no API keys.
  If you deploy somewhere with restricted outbound network access, the app
  runs exactly as before — this pass was built and tested in a sandboxed
  environment with no access to those domains, which is precisely what
  exercises and confirms the fallback paths.

### What-If preview is a real preview, not a guess

`whatif_engine.preview()` snapshots the mutable parts of `DB`, applies the
event using the *same* deterministic mutation functions the live `/trigger`
path uses (just without the WebSocket broadcast), re-runs the real
allocation engine, measures metrics, and restores the snapshot — verified
by test to leave zero roads blocked / zero resources in maintenance after a
preview. It is not a second, simplified implementation of the decision
logic.

### Scope notes (unchanged from prior pass)

- Supply depots are modeled and exposed via the API but don't have a
  dedicated management page yet.
- The audit log is tracked server-side (`/api/simulation/state`) but not
  rendered as its own timeline view — the Command Center's live event feed
  covers the demo need.
- Authentication/roles were intentionally left out, per the brief's own
  instruction not to spend time on enterprise security for a hackathon demo.
- Facility *locations* (hospitals/shelters) can be sourced from
  OpenStreetMap in principle; this build seeds them so the demo has a
  reliable, self-contained layout. Their operational capacity (beds,
  occupancy) is always simulated — no public API exposes real-time hospital
  bed counts, and the Settings page says so explicitly rather than implying
  otherwise.

---

## Project structure

```
rescuegrid/
├── backend/
│   ├── .env.example                # live-data config template — copy to .env
│   └── app/
│       ├── main.py                 # FastAPI app, startup live-data fetch, /api/overview
│       ├── api/                    # zones, resources, allocations, simulation, analytics,
│       │                           # misc, live (weather/earthquakes/status)
│       ├── services/
│       │   ├── priority_engine.py      # weighted scoring + live-weather accessibility delta
│       │   ├── allocation_engine.py    # resource↔zone scoring, constraints, explainability
│       │   ├── routing_engine.py       # named-road model (authoritative) + OSRM refinement
│       │   ├── simulation_engine.py    # scripted timeline + sync/async event handlers
│       │   ├── whatif_engine.py        # non-destructive preview (snapshot/apply/restore)
│       │   ├── conflict_engine.py      # resource double-booking detection
│       │   ├── analytics_engine.py     # live metrics, initial-vs-adaptive comparison
│       │   └── live_data_service.py    # Open-Meteo + USGS fetch, cache, background loop
│       ├── database/store.py       # in-memory data store + seed data + live-data fields
│       └── ws_manager.py           # WebSocket connection manager
└── frontend/
    └── src/
        ├── pages/                  # CommandCenter, Zones, Resources, Allocations,
        │                           # Shelters, Hospitals, WhatIf, Analytics, Settings
        ├── components/             # Layout, DisasterMap, LiveConditions, DataSourceStatus,
        │                           # Badges/KPI
        ├── context/AppData.tsx     # polling + WebSocket data provider
        ├── services/               # api.ts (REST client), websocket.ts
        └── types/                  # shared TypeScript types
```

---

## Setup & running locally

Requires **Python 3.10+** and **Node.js 18+**. No API keys needed anywhere.

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # optional — every setting has a working default
uvicorn app.main:app --reload --port 8000
```

The API is live at `http://localhost:8000` (health check: `/api/health`).
On startup it immediately attempts one live-data fetch (weather +
earthquakes), then hands off to a 60-second background refresh loop.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*`
(including the WebSocket at `/api/simulation/ws`) to the backend on port
8000 — no CORS configuration or extra env vars needed.

### Environment variables (`backend/.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `LIVE_DATA_ENABLED` | `true` | Master switch for weather/earthquake fetching |
| `WEATHER_REFRESH_SECONDS` | `60` | Background refresh interval |
| `EARTHQUAKE_RADIUS_KM` | `500` | Only earthquakes within this radius of the scenario center are kept |
| `ROUTING_PROVIDER` | `osrm` | `osrm` enables real-route refinement; anything else disables it |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | Public OSRM demo server |

### 3. Testing LIVE mode

With normal internet access, within ~60 seconds of startup the Command
Center's **Live Conditions** panel and the **Settings → Data Sources**
panel should show `weather: LIVE` and `earthquakes: LIVE` with a real
temperature/rainfall/wind reading for the scenario's location. If your
network blocks those domains (as this project's own sandboxed dev/test
environment does), the badges correctly show `OFFLINE`/`FALLBACK` and the
app continues to function entirely on simulated data — that fallback
behavior is itself part of what to demo.

You can force an immediate refresh without waiting for the interval:

```bash
curl -X POST http://localhost:8000/api/live-data/refresh
```

### 4. Testing DEMO mode / the killer demo sequence

1. Open the **Command Center** — the cyclone scenario is pre-seeded (18
   zones, 45 resources, 4 shelters, 3 hospitals).
2. Click **OPTIMIZE RESPONSE** to generate the initial plan.
3. Click **TRIGGER ROAD COLLAPSE** — watch the event feed and the map
   update as assignments are invalidated and reassigned.
4. Click **FAIL AMBULANCE** — same loop, different failure.
5. Go to **Allocations**, click any assignment, and show the **WHY?** panel
   (and the real-route line if OSRM succeeded).
6. Go to **What-If**, pick an event, click **RUN REOPTIMIZATION** to preview
   the projected impact, then **APPLY** to commit it for real.
7. Go to **Analytics** for the Initial Plan vs Adaptive Plan comparison.
8. Or press **START SIMULATION** on the Command Center to let the scripted
   timeline (population surge → road block → resource failure → shelter
   overflow → new emergency) play out on its own.

### Production build

```bash
cd frontend
npm run build      # outputs static assets to frontend/dist
```

Serve `frontend/dist` with any static file server, pointed at a deployed
backend (update the API base URL / proxy target accordingly).
