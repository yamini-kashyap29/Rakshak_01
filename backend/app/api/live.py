from fastapi import APIRouter

from app.database.store import DB
from app.services import live_data_service

router = APIRouter(prefix="/api", tags=["live-data"])


@router.get("/weather")
def weather():
    return DB.live_weather or {"status": "no data yet"}


@router.get("/earthquakes")
def earthquakes():
    return DB.live_earthquakes


@router.get("/live-data")
def live_data():
    return {
        "weather": DB.live_weather,
        "earthquakes": DB.live_earthquakes,
        "data_sources": DB.data_sources,
    }


@router.get("/live-data/status")
def live_data_status():
    return DB.data_sources


@router.post("/live-data/refresh")
async def force_refresh():
    """Manual refresh — mainly useful for demoing the live-data pipeline
    without waiting for the background interval."""
    await live_data_service.refresh_once()
    return {"weather": DB.live_weather, "data_sources": DB.data_sources}
