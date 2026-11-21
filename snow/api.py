"""Snowflake-backed endpoints.

POST /api/briefing           {title, closures, metrics, assumptions} -> {text, model, source}
GET  /api/disruptions/today  -> line-status history logged today (for Control Room replay + audit)
GET  /api/leaderboard        -> all-time Game Mode leaderboard
GET  /api/snowflake          -> is Snowflake connected, and what has been logged
Without Snowflake every endpoint still answers (source: "fallback") so the UI never breaks.
"""
import asyncio
import datetime as dt
import json

import httpx
from fastapi import APIRouter, Body

from . import client as snow

router = APIRouter()
TFL_STATUS = "https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,overground,dlr,tram/Status"
LOG_EVERY_SECONDS = 120
_last_log = {"at": None, "rows": 0, "error": None}


def _fallback_briefing(p):
    """Plain template used when Cortex isn't available: restates the given numbers, nothing more."""
    closed = ", ".join(p.get("closures", [])[:6]) or "no closures"
    facts = "; ".join(f"{k.replace('_', ' ')}: {v}" for k, v in (p.get("metrics") or {}).items()
                      if isinstance(v, (int, float, str)))
    return f"Scenario: {closed}. Simulated estimates — {facts or 'no impact measured yet'}."


@router.post("/api/briefing")
def briefing(payload: dict = Body(...)):
    """Turn computed Control Room numbers into a short plain-English briefing.
    The model only words the numbers it is given; it never computes them."""
    prompt = (
        "You are writing a 3-sentence operational briefing for a London transport control room. "
        "Use ONLY the numbers in the JSON below; do not invent any figure, cause or date. "
        "Mention the closures, the scale of impact, the worst-hit journeys and which lines absorb diverted passengers. "
        "Plain English, no headings, no bullet points, under 90 words.\n\nJSON:\n" + json.dumps(payload)[:6000]
    )
    try:
        text, model = snow.cortex(prompt)
        if text:
            try:
                snow.query("insert into scenarios(title, payload, briefing, model) select %s, parse_json(%s), %s, %s",
                           (payload.get("title", "scenario"), json.dumps(payload), text, model))
            except Exception:
                pass
            return {"text": text, "model": model, "source": "snowflake-cortex"}
    except Exception as e:
        return {"text": _fallback_briefing(payload), "model": None, "source": "fallback", "error": str(e)}
    return {"text": _fallback_briefing(payload), "model": None, "source": "fallback"}


@router.get("/api/disruptions/today")
def disruptions_today():
    rows = None
    try:
        rows = snow.query(
            "select line_id, line_name, mode, min(severity) as worst_severity, any_value(status) as status, "
            "count(*) as samples, min(captured_at) as first_seen, max(captured_at) as last_seen "
            "from line_status where captured_at >= dateadd('hour', -24, current_timestamp()) and severity <> 10 "
            "group by line_id, line_name, mode order by samples desc")
    except Exception as e:
        return {"source": "error", "error": str(e), "lines": []}
    if rows is None:
        return {"source": "fallback", "lines": []}
    for r in rows:
        for k in ("first_seen", "last_seen"):
            if r.get(k) is not None:
                r[k] = r[k].isoformat()
    return {"source": "snowflake", "lines": rows}


@router.get("/api/leaderboard")
def leaderboard():
    try:
        rows = snow.leaderboard()
    except Exception as e:
        return {"source": "error", "error": str(e), "players": []}
    return {"source": "snowflake" if rows is not None else "fallback", "players": rows or []}


@router.get("/api/snowflake")
def status():
    info = {"configured": snow.configured(), "lastLog": _last_log}
    if snow.configured():
        try:
            info["counts"] = snow.query(
                "select (select count(*) from line_status) as status_rows, (select count(*) from scenarios) as scenarios, "
                "(select count(*) from game_results) as game_rows")[0]
        except Exception as e:
            info["error"] = str(e)
    return info


async def status_logger():
    """Every 2 minutes, copy TfL's line status into Snowflake: an audit trail of exactly what TfL said, when."""
    async with httpx.AsyncClient(timeout=20) as http:
        while True:
            if snow.configured():
                try:
                    lines = (await http.get(TFL_STATUS)).json()
                    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    rows = []
                    for l in lines:
                        for s in l.get("lineStatuses", []):
                            rows.append((now, l["id"], l["name"], l.get("modeName"), s.get("statusSeverity"),
                                         s.get("statusSeverityDescription"), (s.get("reason") or "")[:2000]))
                    if rows:
                        await asyncio.to_thread(_insert_status, rows)
                    _last_log.update(at=now, rows=len(rows), error=None)
                except Exception as e:  # keep logging even if one attempt fails
                    _last_log.update(error=str(e))
            await asyncio.sleep(LOG_EVERY_SECONDS)


def _insert_status(rows):
    values = ",".join(["(%s,%s,%s,%s,%s,%s,%s)"] * len(rows))
    flat = [v for r in rows for v in r]
    snow.query("insert into line_status(captured_at, line_id, line_name, mode, severity, status, reason) values " + values, flat)
