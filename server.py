"""Londonfax server: serves the site, the Game Mode API and the Snowflake features.

Run:  .venv/bin/python server.py            (port 8765)
      .venv/bin/python server.py --port 8766
Everything in the browser still works without this server except Game Mode
(needs shared rooms) and the Snowflake features (need private credentials).
"""
import argparse
import asyncio
import contextlib
import os
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from snow import client as snow  # noqa: E402
from snow import api as snow_api  # noqa: E402


@contextlib.asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(snow_api.status_logger())  # logs TfL line status to Snowflake every 2 min
    yield
    task.cancel()


app = FastAPI(title="Londonfax", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"ok": True, "snowflake": snow.configured(), "modules": LOADED}


app.include_router(snow_api.router)


@app.post("/api/rounds")
async def save_round(request: Request):
    """Signblast round analytics -> Snowflake table SIGNBLAST_ROUNDS."""
    body = await request.json()
    try:
        ok = await asyncio.to_thread(snow.save_round, body)
        return {"saved": ok}
    except Exception as e:  # never break the game over analytics
        return JSONResponse({"saved": False, "error": str(e)[:200]}, status_code=200)


@app.post("/api/duels")
async def save_duel(request: Request):
    """Signblast 1v1 results -> Snowflake table SIGNBLAST_DUELS."""
    body = await request.json()
    try:
        ok = await asyncio.to_thread(snow.save_duel, body)
        return {"saved": ok}
    except Exception as e:  # never break the game over analytics
        return JSONResponse({"saved": False, "error": str(e)[:200]}, status_code=200)


@app.get("/api/rounds/hardest")
async def hardest():
    rows = await asyncio.to_thread(snow.hardest_letters)
    return {"rows": rows}

# Browser pages fetch TfL through here, so the venue's shared IP doesn't exhaust TfL's anonymous limit:
# one cached upstream request serves every phone and page, with the team's app key added.
import tfl  # noqa: E402
from fastapi import Request  # noqa: E402

TFL_ALLOWED = ("Line/", "StopPoint", "Journey/", "Place/", "BikePoint", "Mode/")
TFL_TTL = {"Arrivals": 15, "Status": 45, "BikePoint": 45, "Journey/": 300, "Place/": 600, "Search": 3600}


@app.get("/api/tfl/{path:path}")
async def tfl_proxy(path: str, request: Request):
    if not path.startswith(TFL_ALLOWED):
        return JSONResponse({"error": "not allowed"}, status_code=404)
    ttl = next((t for k, t in TFL_TTL.items() if k in path), 60)
    try:
        return await tfl.get_json("/" + path, dict(request.query_params), ttl=ttl)
    except tfl.TflError as e:
        return JSONResponse({"error": str(e)}, status_code=e.status)

# Feature routers owned by the other agents (see docs/TEAM.md):
#   game/api.py  -> router, prefix /api/game   (Agent 3, Game Mode)
#   roads/api.py -> router, prefix /api/roads  (Agent 2, Control Room + driving times)
LOADED = {}
for name in ("game", "roads"):
    try:
        module = __import__(f"{name}.api", fromlist=["router"])
        app.include_router(module.router)
        LOADED[name] = True
    except ImportError as e:  # module not built yet: the rest of the site still works
        LOADED[name] = False
        print(f"{name} module not loaded:", e)


@app.middleware("http")
async def always_revalidate(request, call_next):
    """Make browsers re-check site files on every load, so phones never run stale JS/CSS mid-demo."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.exception_handler(Exception)
async def errors(request, exc):
    return JSONResponse({"error": str(exc)}, status_code=500)


# Static site LAST so /api/* wins. Only an allowlist of public files and folders is served:
# never the project root itself, which holds .env, .secrets/ (Snowflake key), .git/ and source.
from fastapi.responses import FileResponse  # noqa: E402

PUBLIC_FILES = {"": "app/index.html", "index.html": "app/index.html", "londonfax": "index.html", "style.css": "style.css"}
PUBLIC_DIRS = ("js", "play", "control", "app")  # add new public folders here (Agent 1 owns this list)


def _public_file(name):
    async def serve():
        return FileResponse(os.path.join(ROOT, PUBLIC_FILES[name]))
    return serve


for _name in PUBLIC_FILES:
    app.add_api_route("/" + _name, _public_file(_name), methods=["GET", "HEAD"], include_in_schema=False)
for _d in PUBLIC_DIRS:
    app.mount(f"/{_d}", StaticFiles(directory=os.path.join(ROOT, _d), html=True, check_dir=False), name=_d)

if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
    # Local only by default; phones reach it through the tunnel, never directly over the Wi-Fi.
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
