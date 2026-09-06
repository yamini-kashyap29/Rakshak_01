"""
Allocation engine — Sections 12-14.

Assignment Score = 40% Zone Priority + 25% Resource Suitability
                  + 20% Distance Score + 10% Urgency + 5% Availability

Hard constraints (Section 13), enforced before any score is even computed:
  - a resource must be AVAILABLE
  - a resource must have a capability the zone actually needs
  - a resource cannot be double-booked
  - a zone must have at least one usable (unblocked) route, otherwise it is
    reported as NO_FEASIBLE_ASSIGNMENT instead of silently skipped
"""
from app.database.store import DB, haversine_km
from app.services import priority_engine, routing_engine


def _suitability(resource, needed_caps):
    have = set(resource["capabilities"])
    if not needed_caps:
        return 50.0
    overlap = len(have & needed_caps) / len(needed_caps)
    return round(overlap * 100, 1)


def _distance_score(resource, zone):
    dist = haversine_km(resource["lat"], resource["lng"], zone["lat"], zone["lng"])
    # 0km -> 100, 30km+ -> ~0, linear falloff
    score = max(0.0, 100 - (dist / 30) * 100)
    return round(score, 1), round(dist, 1)


def _urgency(zone):
    total = max(zone["injured"] + zone["critical"] + zone["trapped"], 1)
    urgent = zone["critical"] * 2 + zone["trapped"]
    return round(min(100.0, urgent / total * 100), 1)


def score_assignment(resource, zone, weights=None):
    w = weights or DB.allocation_weights
    needed = DB.zone_needed_capabilities(zone)
    suitability = _suitability(resource, needed)
    dist_score, dist_km = _distance_score(resource, zone)
    urgency = _urgency(zone)
    availability = 100.0 if resource["status"] == "AVAILABLE" else 0.0
    priority = zone["priority_score"]

    final = (
        w["priority"] * priority
        + w["suitability"] * suitability
        + w["distance"] * dist_score
        + w["urgency"] * urgency
        + w["availability"] * availability
    )
    breakdown = {
        "zone_priority": priority, "suitability_pct": suitability,
        "distance_km": dist_km, "distance_score": dist_score,
        "urgency": urgency, "availability": availability,
        "final_score": round(final, 1), "needed_capabilities": sorted(needed),
    }
    return round(final, 1), breakdown


def _compatible(resource, zone):
    needed = DB.zone_needed_capabilities(zone)
    return bool(needed & set(resource["capabilities"]))


def optimize(weights=None):
    """Greedy global optimization: process zones by priority desc, assign the
    best still-available compatible resource with a usable route."""
    priority_engine.recalculate_all()
    zones = sorted(DB.zones.values(), key=lambda z: z["priority_score"], reverse=True)

    # Clear previous non-cancelled assignments and free resources
    for a in DB.assignments.values():
        a["status"] = "CANCELLED"
    for r in DB.resources.values():
        if r["status"] in ("ASSIGNED", "EN ROUTE"):
            r["status"] = "AVAILABLE"
            r["current_assignment"] = None

    new_assignments = []
    infeasible = []
    used_resources = set()

    for zone in zones:
        route = routing_engine.best_route_for_zone(zone["id"])
        if route is None:
            infeasible.append({"zone_id": zone["id"], "zone_name": zone["name"],
                                "reason": "All named roads to this zone are blocked."})
            continue

        candidates = [
            r for r in DB.resources.values()
            if r["id"] not in used_resources
            and r["status"] == "AVAILABLE"
            and _compatible(r, zone)
        ]
        if not candidates:
            needed = sorted(DB.zone_needed_capabilities(zone))
            infeasible.append({"zone_id": zone["id"], "zone_name": zone["name"],
                                "reason": f"No available compatible resource for capability: {', '.join(needed)}."})
            continue

        scored = []
        for r in candidates:
            score, breakdown = score_assignment(r, zone, weights)
            scored.append((score, r, breakdown))
        scored.sort(key=lambda t: t[0], reverse=True)
        best_score, best_resource, breakdown = scored[0]

        route_info = routing_engine.compute_route(best_resource, zone)
        assignment_id = _create_assignment(best_resource, zone, best_score, breakdown, route_info)
        used_resources.add(best_resource["id"])
        new_assignments.append(assignment_id)

    DB.log_event("ALLOCATION", f"Response plan generated: {len(new_assignments)} assignments, "
                                f"{len(infeasible)} zones unresolved.")
    return {"assignments": new_assignments, "infeasible": infeasible}


def _create_assignment(resource, zone, score, breakdown, route_info):
    from app.database.store import next_id
    aid = next_id("AS")
    reason = _build_reason(resource, zone, breakdown, route_info)
    DB.assignments[aid] = {
        "id": aid, "resource_id": resource["id"], "resource_name": resource["name"],
        "zone_id": zone["id"], "zone_name": zone["name"], "score": score,
        "breakdown": breakdown, "route": route_info, "reason": reason,
        "status": "ASSIGNED",
    }
    resource["status"] = "ASSIGNED"
    resource["current_assignment"] = zone["id"]
    DB.log_event("RESOURCE_REASSIGNED", f"{resource['name']} assigned to {zone['name']} "
                                         f"(score {score}).")
    return aid


def _build_reason(resource, zone, breakdown, route_info):
    bits = [f"{zone['name']} had a priority score of {breakdown['zone_priority']}"]
    if breakdown["distance_score"] >= 70:
        bits.append(f"{resource['name']} was the closest available compatible resource "
                     f"({breakdown['distance_km']} km away)")
    else:
        bits.append(f"{resource['name']} was the best compatible match available "
                     f"({breakdown['distance_km']} km away)")
    if not route_info["usable_named_route"]:
        bits.append("all named roads were blocked, so an off-road estimate was used")
    return "; ".join(bits) + "."


def force_reassign(zone_id, weights=None):
    zone = DB.zones.get(zone_id)
    if not zone:
        return None
    # cancel any existing assignment for this zone
    for a in DB.assignments.values():
        if a["zone_id"] == zone_id and a["status"] == "ASSIGNED":
            a["status"] = "CANCELLED"
            res = DB.resources.get(a["resource_id"])
            if res:
                res["status"] = "AVAILABLE"
                res["current_assignment"] = None

    used_resources = {a["resource_id"] for a in DB.assignments.values() if a["status"] == "ASSIGNED"}
    candidates = [r for r in DB.resources.values()
                  if r["id"] not in used_resources and r["status"] == "AVAILABLE"
                  and _compatible(r, zone)]
    if not candidates:
        return {"reassigned": False, "reason": "No compatible resource currently available."}

    scored = sorted((score_assignment(r, zone, weights) + (r,) for r in candidates),
                     key=lambda t: t[0], reverse=True)
    best_score, breakdown, resource = scored[0]
    route_info = routing_engine.compute_route(resource, zone)
    aid = _create_assignment(resource, zone, best_score, breakdown, route_info)
    return {"reassigned": True, "assignment_id": aid}
