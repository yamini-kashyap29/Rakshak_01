from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.database.store import DB
from app.services import simulation_engine, analytics_engine, whatif_engine
from app.ws_manager import MANAGER

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.get("/state")
def state():
    return {
        "sim_time_min": round(DB.sim_time_min, 1),
        "sim_running": DB.sim_running,
        "sim_speed": DB.sim_speed,
        "disaster_name": DB.disaster_name,
        "disaster_type": DB.disaster_type,
        "system_status": DB.system_status,
        "events": DB.events[-50:],
        "audit_log": DB.audit_log[-100:],
    }


@router.post("/start")
async def start():
    await simulation_engine.RUNNER.start()
    return {"running": True}


@router.post("/pause")
async def pause():
    await simulation_engine.RUNNER.pause()
    return {"running": False}


@router.post("/reset")
async def reset():
    await simulation_engine.RUNNER.reset()
    return {"reset": True}


class SpeedBody(BaseModel):
    speed: float


@router.post("/speed")
def set_speed(body: SpeedBody):
    simulation_engine.RUNNER.set_speed(body.speed)
    return {"speed": body.speed}


class TriggerBody(BaseModel):
    kind: str
    resource_id: str | None = None
    resource_type: str | None = None
    road_id: str | None = None
    shelter_id: str | None = None
    zone_name: str | None = None


@router.post("/trigger")
async def trigger(body: TriggerBody):
    meta = {k: v for k, v in body.dict().items() if k != "kind" and v is not None}
    return await simulation_engine.trigger_event(body.kind, meta)


@router.post("/preview")
def preview(body: TriggerBody):
    """What-If: applies the event to a scratch copy of state, measures the
    projected plan, then restores the live scenario untouched. Nothing here
    is visible to other clients or persisted until /trigger (APPLY) is called."""
    meta = {k: v for k, v in body.dict().items() if k != "kind" and v is not None}
    return whatif_engine.preview(body.kind, meta)


@router.post("/baseline")
def baseline():
    return analytics_engine.capture_baseline()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await MANAGER.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # ignore inbound; this is a push channel
    except WebSocketDisconnect:
        MANAGER.disconnect(websocket)
