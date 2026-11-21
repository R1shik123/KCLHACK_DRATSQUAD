"""Validate game/journeys.json against the live TfL Journey Planner.

Run:  .venv/bin/python -m game.validate_journeys
Prints, per journey: baseline minutes (our route), the planner's own best, and how many
distinct options each leg / change point has. Saves the answers to game/tfl_snapshot.json,
which the game uses only if TfL stops answering mid-demo.
"""
import asyncio
import json
import os
import sys
import time

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game import planner  # noqa: E402
from game.engine import CHANGE_MIN, load_journeys, build_options, base_route, route_total  # noqa: E402


async def best(client, j):
    a, b = j["stops"][0]["ll"], j["stops"][-1]["ll"]
    try:
        r = await client.get(planner.TFL.format(f=planner.ll_str(a), t=planner.ll_str(b)), timeout=20)
        js = r.json().get("journeys") or []
        return min(x["duration"] for x in js) if js else None
    except Exception:
        return None


async def main():
    journeys = load_journeys()
    planner.TIMEOUT = 30
    planner.MAX_WAIT = 90
    planner.ATTEMPTS = 6
    planner._sem = asyncio.Semaphore(3)
    old = planner.snapshot()
    if "--fresh" not in sys.argv:  # reruns only fill the gaps
        now = time.time()
        for k, v in old.items():
            planner._cache[k] = (now, v)
    table = await planner.precompute(journeys)
    print("request errors:", planner.ERRORS)
    async with httpx.AsyncClient() as c:
        bests = await asyncio.gather(*(best(c, j) for j in journeys))
    print(f"Validated {time.strftime('%Y-%m-%d %H:%M')} London, {len(table)} leg answers, +{CHANGE_MIN} min per change\n")
    print(f"{'journey':40} {'base':>5} {'best':>5}  options (legs | change points)")
    for j, b in zip(journeys, bests):
        r = base_route(j)
        tot = route_total(j, r, table)
        opts = build_options(j, r, table)
        legs = "/".join(str(len(o)) for o in opts["legs"])
        ch = "/".join(str(len(o)) for o in opts["changes"])
        labels = []
        for i in range(len(j["legs"])):
            leg = planner_leg(j, r, i, table)
            labels.append(f"{leg['label']} {leg['minutes']}" if leg else "MISSING")
        print(f"{j['title'][:40]:40} {str(tot):>5} {str(b):>5}  {legs} | {ch}   [{' + '.join(labels)}]")
    merged = dict(old)
    merged.update(table)
    json.dump(merged, open(planner.SNAPSHOT, "w"), indent=0)


def planner_leg(j, r, i, table):
    from game.engine import leg_key
    return table.get(leg_key(j, r, i))


if __name__ == "__main__":
    asyncio.run(main())
