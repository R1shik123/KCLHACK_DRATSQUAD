"""Leg times for Game Mode. Every minute shown in the game comes from here.

- TfL legs: TfL Journey Planner (no key), one request per (from, to, mode), mode restricted
  so each option is a genuinely different way to travel. We take the quickest journey returned.
- Drive legs: Agent 2's /api/roads/drive (simulated road graph). Until it answers we use a
  labelled stub: km = straight line x 1.3, minutes = km / 14 km/h * 60.
- Results are cached for 10 minutes. If TfL fails, we fall back to game/tfl_snapshot.json
  (real planner answers saved by validate_journeys.py, with their timestamp). Otherwise the
  option is dropped.
"""
import asyncio
import json
import math
import os
import time

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
SNAPSHOT = os.path.join(HERE, "tfl_snapshot.json")
TFL = "https://api.tfl.gov.uk/Journey/JourneyResults/{f}/to/{t}"
CACHE_TTL = 600
STUB_KMH = 14.0
STUB_DETOUR = 1.3
MODES = {  # our key -> TfL mode parameter
    "tube": "tube,walking",
    "elizabeth-line": "elizabeth-line,walking",
    "overground": "overground,walking",
    "dlr": "dlr,walking",
    "bus": "bus,walking",
    "national-rail": "national-rail,walking",
    "walking": "walking",
}
MODE_NAME = {"tube": "Tube", "elizabeth-line": "Elizabeth line", "overground": "Overground", "dlr": "DLR",
             "bus": "Bus", "national-rail": "Rail", "walking": "Walk", "drive": "Drive", "tram": "Tram"}

_cache = {}
_sem = asyncio.Semaphore(6)
_snapshot = None


def ll_str(ll):
    return f"{ll[0]:.4f},{ll[1]:.4f}"


def key(f, t, mode):
    return f"{ll_str(f)}|{ll_str(t)}|{mode}"


def snapshot():
    global _snapshot
    if _snapshot is None:
        try:
            _snapshot = json.load(open(SNAPSHOT, encoding="utf-8"))
        except Exception:
            _snapshot = {}
    return _snapshot


def _describe(journey):
    """Turn a TfL journey into {minutes, label, parts:[{mode, name}]}."""
    parts = []
    for leg in journey.get("legs", []):
        m = leg.get("mode", {}).get("id") or leg.get("mode", {}).get("name") or "walking"
        if m == "walking":
            continue
        ro = leg.get("routeOptions") or []
        name = (ro[0].get("name") if ro else "") or MODE_NAME.get(m, m)
        if not parts or parts[-1]["name"] != name:
            parts.append({"mode": m, "name": name})
    if not parts:
        label = "Walk"
    else:
        chunks = []
        for i, p in enumerate(parts):
            if p["mode"] == "bus":
                if i and parts[i - 1]["mode"] == "bus":
                    chunks[-1] = chunks[-1].replace("Bus ", "Buses ", 1) + f", {p['name']}"
                else:
                    chunks.append(f"Bus {p['name']}")
            elif p["mode"] == "tube":
                chunks.append(p["name"] + (" line" if "line" not in p["name"].lower() else ""))
            else:
                chunks.append(p["name"] if p["name"] != p["mode"] else MODE_NAME.get(p["mode"], p["mode"]))
        label = " then ".join(chunks)
    return {"minutes": int(journey["duration"]), "label": label, "parts": parts}


ERRORS = {}
TIMEOUT = 15
ATTEMPTS = 3
MAX_WAIT = 4  # seconds a room will wait out TfL's rate limit before using the saved snapshot
_gate = {"until": 0.0}  # TfL anonymous rate limit: after a 429 we pause all calls for Retry-After


async def tfl_leg(client, f, t, mode):
    url = TFL.format(f=ll_str(f), t=ll_str(t))
    params = {"mode": MODES[mode]}
    async with _sem:
        for attempt in range(ATTEMPTS):
            wait = _gate["until"] - time.time()
            if wait > 0:
                if wait > MAX_WAIT:
                    ERRORS["rate-limited-skip"] = ERRORS.get("rate-limited-skip", 0) + 1
                    return None
                await asyncio.sleep(wait)
            try:
                r = await client.get(url, params=params, timeout=TIMEOUT)
                if r.status_code == 429:
                    ERRORS["429"] = ERRORS.get("429", 0) + 1
                    try:
                        ra = float(r.headers.get("retry-after", 15))
                    except ValueError:
                        ra = 15.0
                    _gate["until"] = max(_gate["until"], time.time() + ra)
                    continue
                r.raise_for_status()
                js = r.json().get("journeys") or []
                if not js:
                    return None
                best = min(js, key=lambda j: j.get("duration", 9999))
                d = _describe(best)
                d["source"] = "TfL Journey Planner"
                d["at"] = time.strftime("%H:%M")
                return d
            except Exception as e:
                ERRORS[type(e).__name__] = ERRORS.get(type(e).__name__, 0) + 1
                await asyncio.sleep(1)
    return None


def haversine_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


async def drive_leg(client, f, t, local_base=None):
    if local_base:
        try:
            r = await client.get(f"{local_base}/api/roads/drive", params={"from": ll_str(f), "to": ll_str(t)}, timeout=8)
            if r.status_code == 200:
                d = r.json()
                if d.get("minutes") is not None:
                    roads = [x for x in (d.get("roads") or []) if x][:2]
                    return {"minutes": int(round(d["minutes"])), "label": "Drive" + (" via " + ", ".join(roads) if roads else ""),
                            "parts": [{"mode": "drive", "name": "Drive"}], "source": "Londonfax road simulation (SIMULATED)",
                            "km": d.get("km"), "at": time.strftime("%H:%M")}
        except Exception:
            pass
    km = haversine_km(f, t) * STUB_DETOUR
    return {"minutes": int(round(km / STUB_KMH * 60)), "label": "Drive", "km": round(km, 1),
            "parts": [{"mode": "drive", "name": "Drive"}],
            "source": f"ESTIMATE: {km:.1f} km at {STUB_KMH:.0f} km/h average London traffic",
            "at": time.strftime("%H:%M")}


async def leg(client, f, t, mode, local_base=None):
    k = key(f, t, mode)
    hit = _cache.get(k)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    if mode == "drive":
        res = await drive_leg(client, f, t, local_base)
    else:
        res = await tfl_leg(client, f, t, mode)
        if res is None and k in snapshot():
            res = dict(snapshot()[k])
            res["source"] = f"TfL Journey Planner (saved {res.get('at', 'earlier')})"
    if res is not None:
        _cache[k] = (time.time(), res)
    return res


def leg_requests(j):
    """Every (from, to, mode) the journey can ever need, given change-point alternatives."""
    stops = j["stops"]
    choices = [[s["ll"]] + [a["ll"] for a in s.get("alts", [])] for s in stops]
    out = []
    for i, lg in enumerate(j["legs"]):
        for f in choices[i]:
            for t in choices[i + 1]:
                for m in [lg["mode"]] + lg.get("alts", []):
                    out.append((f, t, m))
    return out


async def precompute(journeys, local_base=None):
    """Returns {key: result} for every leg combination of these journeys (failed ones absent)."""
    reqs = {}
    for j in journeys:
        for f, t, m in leg_requests(j):
            reqs[key(f, t, m)] = (f, t, m)
    async with httpx.AsyncClient(headers={"User-Agent": "Londonfax-game"}) as client:
        ks = list(reqs)
        res = await asyncio.gather(*(leg(client, *reqs[k], local_base=local_base) for k in ks))
    return {k: r for k, r in zip(ks, res) if r is not None}
