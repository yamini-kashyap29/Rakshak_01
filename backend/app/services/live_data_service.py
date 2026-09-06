"""
Live data service — Sections 3, 4, 30.

Fetches real external data (weather, earthquakes) on a background interval
and normalizes it into DB.live_weather / DB.live_earthquakes. Never called
synchronously from a request handler — requests always read the last cached
value via get_weather()/get_earthquakes(), so a slow or failing upstream API
never blocks the UI.

Every source's health is tracked in DB.data_sources so the frontend can show
an honest LIVE / FALLBACK / OFFLINE badge instead of pretending simulated
data is live.
"""
import asyncio
import os
import time

import httpx

from app.database.store import DB, haversine_km

WEATHER_REFRESH_SECONDS = int(os.environ.get("WEATHER_REFRESH_SECONDS", "60"))
LIVE_DATA_ENABLED = os.environ.get("LIVE_DATA_ENABLED", "true").lower() != "false"
EARTHQUAKE_RADIUS_KM = float(os.environ.get("EARTHQUAKE_RADIUS_KM", "500"))
HTTP_TIMEOUT = 6.0

_broadcast_cb = None  # async fn(dict) -> None, set by main.py
_task = None


def set_broadcaster(cb):
    global _broadcast_cb
    _broadcast_cb = cb


def _now_iso():
    return time.strftime("%H:%M:%S", time.gmtime())


def _mark(source: str, status: str, provider: str):
    DB.data_sources[source] = {"status": status, "provider": provider, "updated": _now_iso()}


async def _fetch_weather(client: httpx.AsyncClient):
    lat, lon = DB.center
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,precipitation,rain,wind_speed_10m,"
                   "wind_gusts_10m,relative_humidity_2m,weather_code",
        "timezone": "auto",
    }
    resp = await client.get(url, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    cur = data.get("current", {})
    reading = {
        "temperature_c": cur.get("temperature_2m"),
        "precipitation_mm": cur.get("precipitation"),
        "rain_mm": cur.get("rain"),
        "wind_speed_kmh": cur.get("wind_speed_10m"),
        "wind_gusts_kmh": cur.get("wind_gusts_10m"),
        "humidity_pct": cur.get("relative_humidity_2m"),
        "weather_code": cur.get("weather_code"),
        "fetched_at": _now_iso(),
    }
    reading["severity"] = _weather_severity(reading)
    return reading


def _weather_severity(r):
    rain = r.get("precipitation_mm") or 0
    gusts = r.get("wind_gusts_kmh") or 0
    if rain >= 15 or gusts >= 60:
        return "HIGH"
    if rain >= 5 or gusts >= 35:
        return "MODERATE"
    return "LOW"


async def _fetch_earthquakes(client: httpx.AsyncClient):
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
    resp = await client.get(url, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    lat0, lon0 = DB.center
    out = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        coords = feat.get("geometry", {}).get("coordinates", [None, None, None])
        lon, lat, depth = (coords + [None, None, None])[:3]
        if lat is None or lon is None:
            continue
        dist = haversine_km(lat0, lon0, lat, lon)
        if dist > EARTHQUAKE_RADIUS_KM:
            continue
        out.append({
            "id": feat.get("id"),
            "magnitude": props.get("mag"),
            "place": props.get("place"),
            "lat": lat, "lng": lon, "depth_km": depth,
            "time_ms": props.get("time"),
            "alert": props.get("alert"),
            "distance_km": round(dist, 1),
        })
    out.sort(key=lambda e: e["distance_km"])
    return out


async def refresh_once():
    """One fetch cycle for both sources. Safe to call directly for testing."""
    if not LIVE_DATA_ENABLED:
        return
    prev_quake_count = len(DB.live_earthquakes)

    async with httpx.AsyncClient() as client:
        try:
            DB.live_weather = await _fetch_weather(client)
            _mark("weather", "LIVE", "Open-Meteo")
        except Exception:
            _mark("weather", "FALLBACK" if DB.live_weather else "OFFLINE", "Open-Meteo")

        try:
            DB.live_earthquakes = await _fetch_earthquakes(client)
            _mark("earthquakes", "LIVE", "USGS")
        except Exception:
            _mark("earthquakes", "FALLBACK" if DB.live_earthquakes else "OFFLINE", "USGS")

    from app.services import priority_engine, allocation_engine

    weather_delta, _ = priority_engine._weather_access_delta()
    meaningful_change = weather_delta >= 5 or len(DB.live_earthquakes) != prev_quake_count

    priority_engine.recalculate_all()
    reoptimized = False
    if meaningful_change and DB.zones:
        allocation_engine.optimize()
        DB.log_event("SYSTEM", "Live conditions changed — response plan re-evaluated.",
                     {"weather_delta": weather_delta})
        reoptimized = True

    if _broadcast_cb:
        await _broadcast_cb({
            "type": "LIVE_DATA_UPDATED",
            "weather": DB.live_weather,
            "earthquake_count": len(DB.live_earthquakes),
            "data_sources": DB.data_sources,
            "reoptimized": reoptimized,
            "timestamp": _now_iso(),
        })


async def _loop():
    while True:
        try:
            await refresh_once()
        except Exception:
            pass
        await asyncio.sleep(WEATHER_REFRESH_SECONDS)


def start_background_refresh():
    global _task
    if not LIVE_DATA_ENABLED:
        return
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


def get_weather():
    return DB.live_weather


def get_earthquakes():
    return DB.live_earthquakes


def get_status():
    return DB.data_sources
