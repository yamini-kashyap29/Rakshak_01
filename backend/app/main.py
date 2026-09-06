from dotenv import load_dotenv

load_dotenv()  # no-op if backend/.env doesn't exist — every setting has a default

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import zones, resources, allocations, simulation, analytics, misc, live
from app.database.store import DB
from app.services import (priority_engine, allocation_engine, simulation_engine,
                           analytics_engine, live_data_service)
from app.ws_manager import MANAGER

app = FastAPI(title="RescueGrid API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(zones.router)
app.include_router(resources.router)
app.include_router(allocations.router)
app.include_router(simulation.router)
app.include_router(analytics.router)
app.include_router(misc.router)
app.include_router(live.router)


@app.on_event("startup")
async def startup():
    simulation_engine.set_broadcaster(MANAGER.broadcast)
    live_data_service.set_broadcaster(MANAGER.broadcast)
    priority_engine.recalculate_all()
    allocation_engine.optimize()
    analytics_engine.capture_baseline()

    # Kick off one immediate fetch so the UI has real weather/earthquake data
    # on first load instead of waiting a full refresh interval, then hand off
    # to the recurring background loop. A failed first fetch just leaves the
    # data source badges at OFFLINE/FALLBACK — it never blocks startup.
    try:
        await live_data_service.refresh_once()
    except Exception:
        pass
    live_data_service.start_background_refresh()


@app.get("/api/health")
def health():
    return {"status": "ok", "disaster": DB.disaster_name, "zones": len(DB.zones),
             "resources": len(DB.resources)}


@app.get("/api/overview")
def overview():
    """Everything the Command Center needs in one call."""
    zones_list = sorted(DB.zones.values(), key=lambda z: z["priority_score"], reverse=True)
    metrics = analytics_engine.compute_metrics()
    return {
        "disaster_name": DB.disaster_name,
        "disaster_type": DB.disaster_type,
        "system_status": DB.system_status,
        "sim_time_min": round(DB.sim_time_min, 1),
        "sim_running": DB.sim_running,
        # "SIMULATION" while the scripted disaster timeline is auto-playing
        # (Section 33's DEMO MODE); "LIVE" the rest of the time, when the
        # scenario is steady and only live data + manual triggers drive change.
        "mode": "SIMULATION" if DB.sim_running else "LIVE",
        "center": DB.center,
        "live": {
            "weather": DB.live_weather,
            "earthquakes": DB.live_earthquakes,
            "data_sources": DB.data_sources,
        },
        "kpis": {
            "affected_population": sum(z["population"] for z in zones_list),
            "critical_cases": sum(z["critical"] for z in zones_list),
            "active_resources": len([r for r in DB.resources.values()
                                      if r["status"] in ("ASSIGNED", "EN ROUTE", "ON SITE")]),
            "total_resources": len(DB.resources),
            "active_zones": len(zones_list),
            "shelter_capacity_pct": metrics["shelter_utilization_pct"],
            "avg_response_time_min": metrics["avg_response_time_min"],
        },
        "zones": zones_list,
        "resources": list(DB.resources.values()),
        "shelters": list(DB.shelters.values()),
        "hospitals": list(DB.hospitals.values()),
        "depots": list(DB.depots.values()),
        "roads": list(DB.roads.values()),
        "assignments": [a for a in DB.assignments.values() if a["status"] == "ASSIGNED"],
        "events": DB.events[-30:],
    }
