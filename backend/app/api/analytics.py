from fastapi import APIRouter

from app.services import analytics_engine

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/metrics")
def metrics():
    return analytics_engine.compute_metrics()


@router.get("/compare")
def compare():
    return analytics_engine.compare_to_baseline()
