"""Control Room + driving times API (Agent 2). Mounted by server.py at /api/roads.

Python-only road engine (roads/engine.py) on the OSM road graph. Never returns a 500 to the UI:
if the graph isn't built or is still loading, endpoints answer {"available": false, "reason": ...}.
"""
import asyncio
import time

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from roads.engine import ENGINE, SAMPLE_TRIPS

router = APIRouter(prefix="/api/roads")
_drive_cache = {}
DRIVE_TTL = 600


def _unavailable(status=200):
    ENGINE.ensure()
    reason = "road graph loading" if ENGINE.loading else (ENGINE.error or "road graph not loaded")
    return JSONResponse({"available": False, "reason": reason}, status_code=status)


def _ll(s):
    lat, lon = (float(x) for x in s.split(","))
    return lat, lon


@router.get("/status")
async def status():
    if not ENGINE.ready or ENGINE.trips is None:
        return _unavailable()
    return {
        "available": True, "running": True, "engine": "python-reroute",
        "sampleTrips": len(ENGINE.trips), "seededFrom": "default-speeds",
        "closures": [{"id": c["id"], "label": c["label"], "km": c["km"]} for c in ENGINE.closures.values()],
        "stoppedLines": [], "roadEdges": len(ENGINE.g.edges),
        "baselineAt": ENGINE.baseline_at, "updated": time.time(), "simulated": True,
    }


@router.get("/search")
async def search(q: str = ""):
    if not ENGINE.ready:
        return _unavailable()
    return {"available": True, "results": ENGINE.search(q)}


class CloseBody(BaseModel):
    name: str
    near: list[float] | None = None  # [lat, lon]


@router.post("/close")
async def close(body: CloseBody):
    if not ENGINE.ready:
        return _unavailable()
    try:
        res = ENGINE.close(body.name, body.near)
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    _drive_cache.clear()
    return res


@router.delete("/close/{cid}")
async def reopen(cid: str):
    if not ENGINE.ready:
        return _unavailable()
    _drive_cache.clear()
    return {"ok": ENGINE.reopen(cid)}


@router.post("/reset")
async def reset():
    if not ENGINE.ready:
        return _unavailable()
    ENGINE.reset()
    _drive_cache.clear()
    return {"ok": True}


@router.get("/impact")
async def impact():
    if not ENGINE.ready or ENGINE.trips is None:
        return _unavailable()
    return await asyncio.to_thread(ENGINE.impact)


@router.get("/drive")
async def drive(from_: str = Query(..., alias="from"), to: str = Query(...)):
    if not ENGINE.ready:
        return _unavailable(503)
    try:
        f, t = _ll(from_), _ll(to)
    except ValueError:
        return JSONResponse({"error": "use from=lat,lon&to=lat,lon"}, status_code=422)
    key = (round(f[0], 4), round(f[1], 4), round(t[0], 4), round(t[1], 4), tuple(sorted(ENGINE.closures)))
    hit = _drive_cache.get(key)
    if hit and time.time() - hit[0] < DRIVE_TTL:
        return hit[1]
    try:
        res = await asyncio.to_thread(ENGINE.drive, f, t)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=422)
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    _drive_cache[key] = (time.time(), res)
    return res


@router.get("/method")
async def method():
    return {"engine": "python-reroute", "sampleTrips": SAMPLE_TRIPS, "assumptions": ENGINE.assumptions()}


ENGINE.ensure()
