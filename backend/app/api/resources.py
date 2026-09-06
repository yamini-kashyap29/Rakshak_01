from fastapi import APIRouter, HTTPException

from app.database.store import DB

router = APIRouter(prefix="/api/resources", tags=["resources"])


@router.get("")
def list_resources(type: str | None = None, status: str | None = None):
    items = list(DB.resources.values())
    if type:
        items = [r for r in items if r["type"] == type]
    if status:
        items = [r for r in items if r["status"] == status]
    return items


@router.get("/{resource_id}")
def get_resource(resource_id: str):
    r = DB.resources.get(resource_id)
    if not r:
        raise HTTPException(404, "Resource not found")
    assignment = next((a for a in DB.assignments.values()
                        if a["resource_id"] == resource_id and a["status"] == "ASSIGNED"), None)
    return {**r, "assignment": assignment}
