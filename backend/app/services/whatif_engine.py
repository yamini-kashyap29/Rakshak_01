"""
What-If preview engine — Section 23.

The spec requires: "Do not modify the actual scenario until the user chooses
APPLY." We achieve that without a parallel copy of every algorithm by:

  1. snapshotting the mutable parts of DB
  2. applying the event with simulation_engine.apply_event_sync() (the same
     deterministic logic the live "trigger" path uses, just without the
     WebSocket broadcast)
  3. re-running the real allocation engine so the projected plan is genuine,
     not guessed
  4. measuring metrics before restoring the snapshot

Nothing here is a second implementation of the decision engine — it's the
same engine, sandboxed.
"""
import copy

from app.database.store import DB
from app.services import allocation_engine, analytics_engine, priority_engine, simulation_engine

_SNAPSHOT_FIELDS = ["zones", "resources", "roads", "zone_routes", "assignments",
                    "shelters", "events", "audit_log"]


def _snapshot():
    return {f: copy.deepcopy(getattr(DB, f)) for f in _SNAPSHOT_FIELDS}


def _restore(snap):
    for f, v in snap.items():
        setattr(DB, f, v)


def preview(kind: str, meta: dict | None = None):
    meta = meta or {}
    before = analytics_engine.compute_metrics()
    snap = _snapshot()
    try:
        result = simulation_engine.apply_event_sync(kind, meta)
        if result and result.get("skipped"):
            return {"applied": False, "reason": "No eligible target for this event right now.",
                    "before": before, "after": before}
        priority_engine.recalculate_all()
        alloc_result = allocation_engine.optimize()
        after = analytics_engine.compute_metrics()
        return {
            "applied": True,
            "event_summary": result,
            "before": before,
            "after": after,
            "infeasible": alloc_result["infeasible"],
        }
    finally:
        _restore(snap)
