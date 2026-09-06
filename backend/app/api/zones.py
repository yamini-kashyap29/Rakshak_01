from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database.store import DB
from app.services import priority_engine

router = APIRouter(prefix="/api/zones", tags=["zones"])


class WeightsBody(BaseModel):
    population: float
    critical: float
    trapped: float
    accessibility: float
    waiting: float


@router.get("")
def list_zones():
    return sorted(DB.zones.values(), key=lambda z: z["priority_score"], reverse=True)


@router.get("/{zone_id}")
def get_zone(zone_id: str):
    zone = DB.zones.get(zone_id)
    if not zone:
        raise HTTPException(404, "Zone not found")
    routes = DB.zone_routes.get(zone_id, [])
    roads = [{**DB.roads[rid]} for r in routes for rid in r["road_ids"]]
    assignment = next((a for a in DB.assignments.values()
                        if a["zone_id"] == zone_id and a["status"] == "ASSIGNED"), None)
    return {**zone, "routes": routes, "roads": roads, "assignment": assignment}


@router.post("/recalculate")
def recalculate(weights: WeightsBody | None = None):
    if weights:
        total = sum(weights.dict().values())
        if abs(total - 1.0) > 0.01:
            raise HTTPException(400, f"Weights must total 100% (got {round(total*100,1)}%).")
        DB.priority_weights = weights.dict()
    ranked = priority_engine.recalculate_all()
    return {"zones": ranked, "weights": DB.priority_weights}
