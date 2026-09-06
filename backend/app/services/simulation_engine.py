"""
Live simulation engine — Sections 16-19, 28-29.

Runs a scripted disaster timeline (T+0, T+5, T+8 ...). Each scripted or
manually-triggered event follows DETECT -> REASSESS -> REALLOCATE -> REROUTE:
we mutate state, log a structured event, then re-run the allocation engine so
the whole plan adapts, and finally broadcast the new state to every
connected client over the WebSocket.

Every event handler is split into two layers:
  - `_apply_*(meta)`  — synchronous, pure state mutation + DB.log_event.
                        Reused by the What-If preview engine (whatif_engine.py)
                        which snapshots/restores DB state around a call to
                        apply_event_sync() so a preview never touches the
                        live scenario.
  - `_<name>(meta)`    — async wrapper: calls the sync layer, then broadcasts.
"""
import asyncio
import random

from app.database.store import DB, next_id
from app.services import allocation_engine, priority_engine, routing_engine

_broadcast_cb = None  # set by main.py: async fn(dict) -> None


def set_broadcaster(cb):
    global _broadcast_cb
    _broadcast_cb = cb


async def _broadcast(payload):
    if _broadcast_cb:
        await _broadcast_cb(payload)


SCRIPT = [
    (5, "population_increase", {"zone_name": "Zone B"}),
    (8, "road_block", {}),
    (10, "resource_fail", {"resource_type": "ambulance"}),
    (15, "shelter_full", {}),
    (20, "new_zone", {}),
]


class SimulationRunner:
    def __init__(self):
        self.task = None
        self.fired = set()

    async def start(self):
        DB.sim_running = True
        DB.log_event("SYSTEM", "Simulation started.")
        await _broadcast({"type": "SIM_STATE", "running": True, "sim_time": DB.sim_time_min})
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._loop())

    async def pause(self):
        DB.sim_running = False
        DB.log_event("SYSTEM", "Simulation paused.")
        await _broadcast({"type": "SIM_STATE", "running": False, "sim_time": DB.sim_time_min})

    async def reset(self):
        DB.sim_running = False
        if self.task:
            self.task.cancel()
        self.fired = set()
        DB.reset()
        priority_engine.recalculate_all()
        DB.log_event("SYSTEM", "Simulation reset.")
        await _broadcast({"type": "SIM_RESET", "sim_time": 0})

    def set_speed(self, speed: float):
        DB.sim_speed = speed

    async def _loop(self):
        try:
            while DB.sim_running:
                await asyncio.sleep(1.0)  # 1 real second == 1 sim minute at 1x
                DB.sim_time_min += DB.sim_speed
                for t, kind, meta in SCRIPT:
                    if t not in self.fired and DB.sim_time_min >= t:
                        self.fired.add(t)
                        await trigger_event(kind, meta)
                await _broadcast({"type": "TICK", "sim_time": round(DB.sim_time_min, 1)})
        except asyncio.CancelledError:
            pass


RUNNER = SimulationRunner()


# --------------------------------------------------------------------- #
# Live (broadcasting) entry point — used by the /trigger API and the
# scripted timeline. Actually commits the change to DB and notifies clients.
# --------------------------------------------------------------------- #
async def trigger_event(kind: str, meta: dict | None = None):
    meta = meta or {}
    if kind == "road_block":
        await _road_block(meta)
    elif kind == "resource_fail":
        await _resource_fail(meta)
    elif kind == "population_increase":
        await _population_increase(meta)
    elif kind == "shelter_full":
        await _shelter_full(meta)
    elif kind == "new_zone":
        await _new_zone(meta)
    elif kind == "resource_available":
        await _resource_available(meta)
    else:
        return {"error": f"Unknown event kind: {kind}"}
    return {"ok": True}


# --------------------------------------------------------------------- #
# Preview (non-broadcasting) entry point — used by whatif_engine to apply
# an event to a scratch copy of DB state with no side effects visible to
# any connected client.
# --------------------------------------------------------------------- #
def apply_event_sync(kind: str, meta: dict | None = None):
    meta = meta or {}
    handlers = {
        "road_block": _apply_road_block,
        "resource_fail": _apply_resource_fail,
        "population_increase": _apply_population_increase,
        "shelter_full": _apply_shelter_full,
        "new_zone": _apply_new_zone,
        "resource_available": _apply_resource_available,
    }
    handler = handlers.get(kind)
    if not handler:
        return {"error": f"Unknown event kind: {kind}"}
    return handler(meta)


async def _reoptimize_and_broadcast(headline):
    result = allocation_engine.optimize()
    DB.log_event("SYSTEM", "Response plan updated: "
                            f"{len(result['assignments'])} assignments active, "
                            f"{len(result['infeasible'])} zones unresolved.")
    active = [a for a in DB.assignments.values() if a["status"] == "ASSIGNED"]
    await routing_engine.refine_with_osrm(active)
    await _broadcast({"type": "REOPTIMIZED", "headline": headline,
                       "assignments": len(result["assignments"]),
                       "infeasible": result["infeasible"]})


# --------------------------------------------------------------------- #
# ROAD BLOCK
# --------------------------------------------------------------------- #
def _apply_road_block(meta):
    road_id = meta.get("road_id")
    if not road_id:
        unblocked = [rid for rid, r in DB.roads.items() if not r["blocked"]]
        if not unblocked:
            return {"skipped": True}
        road_id = random.choice(unblocked)
    result = routing_engine.block_road(road_id)
    affected_zones = result["affected_zones"] if result else []
    invalidated = result["invalidated_assignments"] if result else []
    DB.log_event("ROAD_BLOCKED",
                 f"Road {road_id} blocked. {len(invalidated)} assignments affected, "
                 f"{len(invalidated)} routes invalid.",
                 {"road_id": road_id, "affected_zones": affected_zones})
    return {"road_id": road_id, "affected_assignments": len(invalidated)}


async def _road_block(meta):
    summary = _apply_road_block(meta)
    if summary.get("skipped"):
        return
    await _broadcast({"type": "ROAD_BLOCKED", "road_id": summary["road_id"],
                       "affected_assignments": summary["affected_assignments"]})
    await _reoptimize_and_broadcast(f"Road {summary['road_id']} blocked")


# --------------------------------------------------------------------- #
# RESOURCE FAIL
# --------------------------------------------------------------------- #
def _apply_resource_fail(meta):
    rtype = meta.get("resource_type")
    resource_id = meta.get("resource_id")
    resource = None
    if resource_id:
        resource = DB.resources.get(resource_id)
    else:
        pool = [r for r in DB.resources.values()
                if r["status"] != "MAINTENANCE" and (not rtype or r["type"] == rtype)]
        resource = random.choice(pool) if pool else None
    if not resource:
        return {"skipped": True}
    resource["status"] = "MAINTENANCE"
    resource["current_assignment"] = None
    DB.log_event("RESOURCE_FAILED", f"{resource['name']} became unavailable.",
                 {"resource_id": resource["id"]})
    return {"resource_id": resource["id"], "resource_name": resource["name"]}


async def _resource_fail(meta):
    summary = _apply_resource_fail(meta)
    if summary.get("skipped"):
        return
    await _broadcast({"type": "RESOURCE_FAILED", "resource_id": summary["resource_id"],
                       "resource_name": summary["resource_name"]})
    await _reoptimize_and_broadcast(f"{summary['resource_name']} failed")


# --------------------------------------------------------------------- #
# RESOURCE AVAILABLE
# --------------------------------------------------------------------- #
def _apply_resource_available(meta):
    resource_id = meta.get("resource_id")
    resource = DB.resources.get(resource_id)
    if not resource:
        pool = [r for r in DB.resources.values() if r["status"] == "MAINTENANCE"]
        resource = random.choice(pool) if pool else None
    if not resource:
        return {"skipped": True}
    resource["status"] = "AVAILABLE"
    DB.log_event("RESOURCE_AVAILABLE", f"{resource['name']} is back in service.")
    return {"resource_id": resource["id"], "resource_name": resource["name"]}


async def _resource_available(meta):
    summary = _apply_resource_available(meta)
    if summary.get("skipped"):
        return
    await _broadcast({"type": "RESOURCE_AVAILABLE", "resource_id": summary["resource_id"]})
    await _reoptimize_and_broadcast(f"{summary['resource_name']} available")


# --------------------------------------------------------------------- #
# POPULATION INCREASE
# --------------------------------------------------------------------- #
def _apply_population_increase(meta):
    zone_name = meta.get("zone_name")
    zone = next((z for z in DB.zones.values() if z["name"] == zone_name), None) \
        or random.choice(list(DB.zones.values()))
    bump = int(zone["population"] * 0.25)
    zone["population"] += bump
    zone["injured"] += int(bump * 0.05)
    DB.log_event("POPULATION_INCREASED", f"{zone['name']} population increased by {bump}.",
                 {"zone_id": zone["id"]})
    return {"zone_id": zone["id"], "zone_name": zone["name"]}


async def _population_increase(meta):
    summary = _apply_population_increase(meta)
    await _broadcast({"type": "POPULATION_INCREASED", "zone_id": summary["zone_id"]})
    await _reoptimize_and_broadcast(f"{summary['zone_name']} population increased")


# --------------------------------------------------------------------- #
# SHELTER FULL
# --------------------------------------------------------------------- #
def _apply_shelter_full(meta):
    shelter_id = meta.get("shelter_id")
    shelter = DB.shelters.get(shelter_id) or random.choice(list(DB.shelters.values()))
    shelter["occupancy"] = int(shelter["capacity"] * 0.98)
    others = [s for s in DB.shelters.values() if s["id"] != shelter["id"]
              and s["capacity"] - s["occupancy"] > 0]
    others.sort(key=lambda s: s["capacity"] - s["occupancy"], reverse=True)
    recommendation = others[0] if others else None
    DB.log_event("SHELTER_FULL", f"{shelter['name']} reached "
                                  f"{int(shelter['occupancy']/shelter['capacity']*100)}% capacity.",
                 {"shelter_id": shelter["id"],
                  "recommended_shelter_id": recommendation["id"] if recommendation else None})
    return {"shelter_id": shelter["id"],
            "recommended_shelter_id": recommendation["id"] if recommendation else None}


async def _shelter_full(meta):
    summary = _apply_shelter_full(meta)
    await _broadcast({"type": "SHELTER_FULL", "shelter_id": summary["shelter_id"],
                       "recommended_shelter_id": summary["recommended_shelter_id"]})


# --------------------------------------------------------------------- #
# NEW EMERGENCY ZONE
# --------------------------------------------------------------------- #
def _apply_new_zone(meta):
    lat, lng = DB._offset("new_zone")
    zid = next_id("Z")
    zone = {
        "id": zid, "name": f"Zone {chr(ord('A') + len(DB.zones) % 26)}*",
        "lat": lat, "lng": lng,
        "population": random.randint(200, 900),
        "injured": random.randint(10, 80), "critical": random.randint(2, 20),
        "trapped": random.randint(0, 150), "water_level": round(random.uniform(0, 2), 1),
        "accessibility": random.choice(["PARTIAL", "BLOCKED"]),
        "waiting_time": random.randint(5, 40), "status": "ACTIVE",
        "priority_score": 0, "priority_breakdown": {}, "risk_level": "LOW",
    }
    DB.zones[zid] = zone
    r1 = next_id("R")
    DB.roads[r1] = {"id": r1, "label": f"Road {r1}", "blocked": False,
                    "distance_km": round(random.uniform(3, 10), 1)}
    DB.zone_routes[zid] = [{"id": next_id("RT"), "label": "Primary", "road_ids": [r1]}]
    DB.log_event("NEW_EMERGENCY", f"New emergency zone detected: {zone['name']}.",
                 {"zone_id": zid})
    return {"zone_id": zid, "zone_name": zone["name"]}


async def _new_zone(meta):
    summary = _apply_new_zone(meta)
    await _broadcast({"type": "NEW_EMERGENCY", "zone_id": summary["zone_id"]})
    await _reoptimize_and_broadcast(f"New emergency zone {summary['zone_name']}")
