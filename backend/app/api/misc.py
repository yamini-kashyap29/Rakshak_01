from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database.store import DB

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/shelters")
def shelters():
    out = []
    for s in DB.shelters.values():
        pct = round(s["occupancy"] / s["capacity"] * 100, 1)
        status = "NEAR CAPACITY" if pct >= 85 else ("FULL" if pct >= 98 else "OPERATIONAL")
        out.append({**s, "occupancy_pct": pct, "status": status})
    return out


@router.get("/hospitals")
def hospitals():
    return list(DB.hospitals.values())


@router.get("/depots")
def depots():
    return list(DB.depots.values())


@router.get("/roads")
def roads():
    return list(DB.roads.values())


@router.get("/settings")
def get_settings():
    return {
        "priority_weights": DB.priority_weights,
        "allocation_weights": DB.allocation_weights,
        "sim_speed": DB.sim_speed,
    }


class AllocationWeightsBody(BaseModel):
    priority: float
    suitability: float
    distance: float
    urgency: float
    availability: float


@router.post("/settings/allocation-weights")
def set_allocation_weights(body: AllocationWeightsBody):
    total = sum(body.dict().values())
    if abs(total - 1.0) > 0.01:
        raise HTTPException(400, f"Weights must total 100% (got {round(total*100,1)}%).")
    DB.allocation_weights = body.dict()
    return DB.allocation_weights


class ScenarioBody(BaseModel):
    disaster_type: str = "Flood"
    num_zones: int = 12
    num_ambulances: int = 8
    num_rescue_teams: int = 8
    num_boats: int = 6


@router.post("/scenario/generate")
def generate_scenario(body: ScenarioBody):
    DB.reset()
    DB.disaster_type = body.disaster_type
    DB.disaster_name = f"{body.disaster_type.upper()} RESPONSE — CUSTOM SCENARIO"
    DB.log_event("SYSTEM", f"Custom {body.disaster_type} scenario generated.")
    return {"ok": True, "disaster_name": DB.disaster_name}
