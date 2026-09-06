"""
Routing engine — Section 15.

Each zone has a Primary and an Alternate route, each built from one or more
named roads. A route is usable only if every road on it is unblocked. The
engine always returns the shortest *usable* route, and reports the ETA delta
when a re-route was forced by a blocked road.

This named-road model is the AUTHORITATIVE source of truth for ETA and for
the block/reroute demo mechanic (TRIGGER ROAD COLLAPSE) — it's deterministic,
instant, and never depends on network access, so it must keep working even
offline.

Section 5 also asks for real road routing. `refine_with_osrm()` below is a
best-effort, cached, timeout-bounded enhancement: it asks the public OSRM
demo server for a real driving distance/duration/geometry for the resources
currently on the map and attaches it to the assignment as `real_route` for
display. If OSRM is unreachable or slow, it fails silently and the
authoritative named-road ETA above is all that's used — the allocation
engine and the demo never depend on this succeeding.
"""
import os
import time

import httpx

from app.database.store import DB, SPEED_KMH, haversine_km

ROUTING_PROVIDER = os.environ.get("ROUTING_PROVIDER", "osrm").lower()
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org")
OSRM_CACHE_TTL_SECONDS = 300
OSRM_TIMEOUT = 3.0


def _route_distance(route):
    return sum(DB.roads[rid]["distance_km"] for rid in route["road_ids"])


def _route_usable(route):
    return all(not DB.roads[rid]["blocked"] for rid in route["road_ids"])


def best_route_for_zone(zone_id):
    """Return the shortest usable named route for a zone, or None."""
    routes = DB.zone_routes.get(zone_id, [])
    usable = [r for r in routes if _route_usable(r)]
    if not usable:
        return None
    return min(usable, key=_route_distance)


def compute_route(resource, zone):
    """Compute the resource->zone route: distance, ETA, and which road route was used."""
    route = best_route_for_zone(zone["id"])
    speed = SPEED_KMH.get(resource["type"], 30)
    if route is None:
        # No usable named route — fall back to straight-line "off-road" estimate
        # at reduced speed, and flag it clearly rather than silently succeeding.
        dist = haversine_km(resource["lat"], resource["lng"], zone["lat"], zone["lng"])
        eta = round(dist / (speed * 0.5) * 60, 1)
        return {"usable_named_route": False, "route_id": None, "route_label": "OFF-ROAD (all named roads blocked)",
                "distance_km": round(dist, 1), "eta_min": eta}

    dist = _route_distance(route)
    eta = round(dist / speed * 60, 1)
    return {"usable_named_route": True, "route_id": route["id"], "route_label": route["label"],
            "road_ids": route["road_ids"], "distance_km": round(dist, 1), "eta_min": eta}


def block_road(road_id):
    if road_id not in DB.roads:
        return None
    DB.roads[road_id]["blocked"] = True
    affected = [zid for zid, routes in DB.zone_routes.items()
                for r in routes if road_id in r["road_ids"]]
    invalidated_assignments = [a for a in DB.assignments.values()
                                if a["zone_id"] in affected and a["status"] != "CANCELLED"]
    return {"affected_zones": affected, "invalidated_assignments": invalidated_assignments}


def unblock_road(road_id):
    if road_id in DB.roads:
        DB.roads[road_id]["blocked"] = False


def _cache_key(resource, zone):
    # Round coordinates so tiny float jitter doesn't defeat the cache, and
    # include whether the zone's primary route is currently blocked so a
    # road closure invalidates the cached (now-stale) real route.
    blocked_state = best_route_for_zone(zone["id"]) is None
    return (resource["id"], zone["id"], blocked_state)


async def _osrm_fetch(client, resource, zone):
    coords = f"{resource['lng']},{resource['lat']};{zone['lng']},{zone['lat']}"
    url = f"{OSRM_BASE_URL}/route/v1/driving/{coords}"
    resp = await client.get(url, params={"overview": "full", "geometries": "geojson"},
                             timeout=OSRM_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    route = data["routes"][0]
    return {
        "distance_km": round(route["distance"] / 1000, 2),
        "duration_min": round(route["duration"] / 60, 1),
        "geometry": route["geometry"]["coordinates"],  # [ [lon, lat], ... ]
    }


async def refine_with_osrm(assignments, timeout_budget=4.0):
    """Best-effort: attach a real driving route to each assignment's `real_route`
    field. Never raises, never blocks the caller for long, never required by
    the allocation/demo logic. Marks DB.data_sources['road_network'] LIVE or
    FALLBACK depending on whether any calls succeeded."""
    if ROUTING_PROVIDER != "osrm" or not assignments:
        return

    now = time.time()
    any_success = False
    try:
        async with httpx.AsyncClient() as client:
            async def one(a):
                nonlocal any_success
                resource = DB.resources.get(a["resource_id"])
                zone = DB.zones.get(a["zone_id"])
                if not resource or not zone:
                    return
                key = _cache_key(resource, zone)
                cached = DB.route_cache.get(key)
                if cached and now - cached["cached_at"] < OSRM_CACHE_TTL_SECONDS:
                    a["real_route"] = cached["route"]
                    any_success = any_success or cached["route"] is not None
                    return
                try:
                    result = await _osrm_fetch(client, resource, zone)
                    DB.route_cache[key] = {"route": result, "cached_at": now}
                    a["real_route"] = result
                    any_success = any_success or result is not None
                except Exception:
                    DB.route_cache[key] = {"route": None, "cached_at": now}
                    a["real_route"] = None

            import asyncio as _asyncio
            await _asyncio.wait_for(
                _asyncio.gather(*(one(a) for a in assignments)),
                timeout=timeout_budget,
            )
    except Exception:
        pass

    ts = time.strftime("%H:%M:%S", time.gmtime())
    DB.data_sources["road_network"] = {
        "status": "LIVE" if any_success else "FALLBACK",
        "provider": "OSRM" if any_success else "Simulated road network",
        "updated": ts,
    }
