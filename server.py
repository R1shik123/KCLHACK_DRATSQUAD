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

from fastapi import FastAPI
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


@app.exception_handler(Exception)
async def errors(request, exc):
    return JSONResponse({"error": str(exc)}, status_code=500)


# Static site last, so /api/* wins. html=True serves index.html for folders (e.g. /play/).
app.mount("/", StaticFiles(directory=ROOT, html=True), name="site")

if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
    ap.add_argument("--host", default="0.0.0.0")
    a = ap.parse_args()
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
