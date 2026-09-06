"""Analytics — Section 23. Every number below is derived live from DB state,
never hard-coded, so it always reflects the current scenario."""
from app.database.store import DB


def compute_metrics():
    zones = list(DB.zones.values())
    assignments = [a for a in DB.assignments.values() if a["status"] == "ASSIGNED"]
    resources = list(DB.resources.values())
    shelters = list(DB.shelters.values())

    critical_zones = [z for z in zones if z["risk_level"] == "CRITICAL"]
    covered_critical = [z for z in critical_zones
                         if any(a["zone_id"] == z["id"] for a in assignments)]
    critical_coverage = (round(len(covered_critical) / len(critical_zones) * 100, 1)
                          if critical_zones else 100.0)

    avg_response = (round(sum(a["route"]["eta_min"] for a in assignments) / len(assignments), 1)
                    if assignments else 0.0)

    utilization = (round(len([r for r in resources if r["status"] in ("ASSIGNED", "EN ROUTE")])
                          / len(resources) * 100, 1) if resources else 0.0)

    served_zone_ids = {a["zone_id"] for a in assignments}
    population_served = sum(z["population"] for z in zones if z["id"] in served_zone_ids)
    unserved_population = sum(z["population"] for z in zones if z["id"] not in served_zone_ids)

    shelter_util = (round(sum(s["occupancy"] for s in shelters)
                           / sum(s["capacity"] for s in shelters) * 100, 1)
                    if shelters else 0.0)

    route_failures = len([a for a in DB.assignments.values()
                           if not a["route"]["usable_named_route"]])
    reallocations = len([e for e in DB.events if e["type"] == "RESOURCE_REASSIGNED"])

    return {
        "avg_response_time_min": avg_response,
        "critical_zone_coverage_pct": critical_coverage,
        "resource_utilization_pct": utilization,
        "population_served": population_served,
        "unserved_population": unserved_population,
        "shelter_utilization_pct": shelter_util,
        "route_failures": route_failures,
        "reallocations": reallocations,
        "active_assignments": len(assignments),
        "total_zones": len(zones),
        "total_resources": len(resources),
    }


def capture_baseline():
    DB.baseline_metrics = compute_metrics()
    return DB.baseline_metrics


def compare_to_baseline():
    current = compute_metrics()
    baseline = DB.baseline_metrics or current
    return {"initial_plan": baseline, "adaptive_plan": current}
