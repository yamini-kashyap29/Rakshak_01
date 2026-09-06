from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database.store import DB
from app.services import allocation_engine, conflict_engine, routing_engine

router = APIRouter(prefix="/api/allocations", tags=["allocations"])


@router.get("")
def list_assignments(status: str | None = "ASSIGNED"):
    items = list(DB.assignments.values())
    if status:
        items = [a for a in items if a["status"] == status]
    return items


@router.post("/optimize")
async def optimize():
    result = allocation_engine.optimize()
    active = [a for a in DB.assignments.values() if a["status"] == "ASSIGNED"]
    await routing_engine.refine_with_osrm(active)
    return result


@router.get("/{assignment_id}/why")
def why(assignment_id: str):
    a = DB.assignments.get(assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    return {"resource_name": a["resource_name"], "zone_name": a["zone_name"],
            "score": a["score"], "breakdown": a["breakdown"], "route": a["route"],
            "reason": a["reason"]}


class ConflictBody(BaseModel):
    resource_id: str
    zone_id: str


@router.post("/check-conflict")
def check_conflict(body: ConflictBody):
    return conflict_engine.check_conflict(body.resource_id, body.zone_id)


@router.post("/force-assign")
def force_assign(body: ConflictBody):
    result = conflict_engine.force_assign(body.resource_id, body.zone_id)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result
