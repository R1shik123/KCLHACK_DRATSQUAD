"""Shared TfL Unified API access for every server-side module.

Why: anonymous TfL access is rate limited per IP address, and the venue's Wi-Fi gives every team the
same public IP. All TfL calls therefore go through here, which:
  - adds the team's free TfL app key from .env (TFL_APP_KEY=..., from api-portal.tfl.gov.uk), if present
  - caches responses (default 20 s) so many phones / pages share one upstream request
  - serves the last good copy if TfL answers 429 (rate limited) or fails

Usage (async):  from tfl import get_json
                lines = await get_json("/Line/Mode/tube/Status", ttl=60)
"""
import asyncio
import os
import time

import httpx

BASE = "https://api.tfl.gov.uk"
ROOT = os.path.dirname(os.path.abspath(__file__))
_cache = {}
_client = None
_lock = asyncio.Lock()


def app_key():
    key = os.environ.get("TFL_APP_KEY")
    path = os.path.join(ROOT, ".env")
    if not key and os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if line.strip().startswith("TFL_APP_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key or None


def _http():
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=BASE, timeout=20, headers={"User-Agent": "Londonfax/1.0"})
    return _client


class TflError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(f"TfL {status}: {message}")
        self.status = status


async def get_json(path, params=None, ttl=20):
    """GET a TfL API path (e.g. "/StopPoint/940GZZLUTMP/Arrivals") and return parsed JSON."""
    params = {k: v for k, v in (params or {}).items() if k != "app_key"}
    key = (path, tuple(sorted(params.items())))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    query = dict(params)
    if app_key():
        query["app_key"] = app_key()
    try:
        r = await _http().get(path, params=query)
        data = r.json() if r.content else None
        if r.status_code != 200:
            raise TflError(r.status_code, (data or {}).get("message", r.text[:120]) if isinstance(data, dict) else r.text[:120])
        _cache[key] = (time.time(), data)
        return data
    except Exception:
        if hit:  # serve the last good copy rather than failing
            return hit[1]
        raise
