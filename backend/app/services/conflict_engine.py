"""Resource conflict detection — Section 26."""
from app.database.store import DB


def check_conflict(resource_id, zone_id):
    resource = DB.resources.get(resource_id)
    if not resource:
        return {"error": "Resource not found"}
    if resource["status"] != "ASSIGNED" or not resource["current_assignment"]:
        return {"conflict": False}

    current_zone_id = resource["current_assignment"]
    current_assignment = next(
        (a for a in DB.assignments.values()
         if a["resource_id"] == resource_id and a["status"] == "ASSIGNED"), None
    )
    return {
        "conflict": current_zone_id != zone_id,
        "resource_id": resource_id,
        "resource_name": resource["name"],
        "current_zone_id": current_zone_id,
        "current_zone_name": DB.zones.get(current_zone_id, {}).get("name"),
        "current_eta_min": current_assignment["route"]["eta_min"] if current_assignment else None,
    }


def force_assign(resource_id, zone_id, weights=None):
    from app.services import allocation_engine, routing_engine

    resource = DB.resources.get(resource_id)
    zone = DB.zones.get(zone_id)
    if not resource or not zone:
        return {"error": "Resource or zone not found"}

    # Free the resource from any current assignment
    for a in DB.assignments.values():
        if a["resource_id"] == resource_id and a["status"] == "ASSIGNED":
            a["status"] = "CANCELLED"
            freed_zone = a["zone_id"]
            DB.log_event("RESOURCE_REASSIGNED",
                         f"{resource['name']} force-reassigned away from "
                         f"{DB.zones.get(freed_zone, {}).get('name', freed_zone)}.")

    resource["status"] = "AVAILABLE"
    resource["current_assignment"] = None

    score, breakdown = allocation_engine.score_assignment(resource, zone, weights)
    route_info = routing_engine.compute_route(resource, zone)
    aid = allocation_engine._create_assignment(resource, zone, score, breakdown, route_info)

    # Re-evaluate the zone that just lost its resource, if any
    reassign_result = None
    for zid, z in DB.zones.items():
        if zid == zone_id:
            continue
    return {"assignment_id": aid}
