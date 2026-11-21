# Agent 2 — Road traffic engine + Control Room

Read `docs/TEAM.md` first (rules, ownership, contracts, timeline). The project folder is shared with
two other agents: stay on `main`, edit and commit only your paths, and test on port 8766
(`.venv/bin/python server.py --port 8766`).
You own: `vendor/livelondon/`, `roads/`, `control/`, `js/pages-control.js` (replace the placeholder). Edit nothing else.

## Goal
**Control Room** is Londonfax's decision-making flagship: close a road or stop a Tube/rail line and
see the knock-on effect on London's roads, with every figure honestly labelled as a simulation
estimate. You also provide **driving times** that Game Mode uses for its driving legs.

We reuse the road simulation from `t-strachota/livelondon` (an admin approved reuse, and the author
gave permission). It simulates cars on London's main roads, seeded from live traffic speeds, and
measures slowdowns around closures. Its limits are known; your job is to run it reliably and present
it truthfully.

## 1. Vendor and run their engine (target: running by 15:55)
1. `git clone https://github.com/t-strachota/livelondon vendor/livelondon`, then:
   - delete `vendor/livelondon/.git`
   - **delete the committed `vendor/livelondon/.env`.** It may contain someone's keys; never use or ship them
   - add `vendor/livelondon/CREDIT.md`: source URL, the commit you cloned, and "used with the author's permission"
2. Install **Node 24.5+**. The official nodejs.org macOS tarball is fine; keep it outside the repo.
   Then `cd vendor/livelondon && npm ci`.
3. Build the road network once:
   `python3.12 -m venv .venv && .venv/bin/pip install -r sim/requirements.txt && npm run build-roads`.
   This downloads the Geofabrik Greater London extract (~100 MB) and writes `data/network/roads.json`.
   Don't commit `data/`. Write `roads/setup.sh` that repeats steps 2–3, because the hosting Mac must run it too.
4. Run it headless: `PORT=3000 node server.mjs`. Keys go in a **new, uncommitted** `vendor/livelondon/.env`:
   - `TOMTOM_KEY`: free from developer.tomtom.com. **Strongly recommended:** it's what seeds the simulation from live traffic.
     Without it the engine falls back to default speeds, and the UI must say "DEFAULT SPEEDS (NOT LIVE)".
   - `BODS_API_KEY`: optional (live buses on their map; not needed by us).
5. Keep it light enough for a laptop. Find the population setting (`sim/config.json` `timeOfDay`,
   or the `SIM_POPULATION` env var mentioned in their PROJECT_SUMMARY.md) and use 20–40k cars.
   Record the number you choose in the method page.
6. Read their `server.mjs`, `lib/simulation.mjs`, `lib/sim-worker.mjs` and `lib/stop-control.mjs`.
   Endpoints we know: `GET /api/simulation/status` (includes `delay`, `closures`, population, average speed),
   `POST /api/simulation/closures {points:[[lon,lat],...]}`, `DELETE /api/simulation/closures/{id}`,
   `POST /api/stops {action:'stop-line'|'reopen', ...}`, `POST /api/simulation/reinitialize`,
   `/api/history`, WebSocket `/api/simulation/stream` (which carries the `impact` GeoJSON of slowed roads).
   If slowed-road impact isn't available over HTTP, add **one small read-only endpoint** in the vendor
   server (for example `GET /api/simulation/impact` returning the latest impact GeoJSON). Note the patch in CREDIT.md.

## 2. Bridge API — `roads/api.py` (FastAPI `router = APIRouter(prefix="/api/roads")`)
`server.py` mounts it automatically. Call the engine at `http://127.0.0.1:3000` (env `ROADS_ENGINE`)
using `httpx`, with 5 s timeouts. If the engine is down, return `{"available": false}`; never return a 500 to the UI.
| Endpoint | Returns |
|---|---|
| `GET /api/roads/status` | `{available, running, cars, avgSpeedKmh, seededFrom: "tomtom-live"|"default-speeds", closures:[{id,label}], stoppedLines:[...], updated}` |
| `GET /api/roads/search?q=strand` | Up to 8 named roads from `roads.json` with a representative polyline (2–6 points along the road, inside the bbox) |
| `POST /api/roads/close {name}` or `{points}` | Closes it in the engine → `{id, label}` |
| `DELETE /api/roads/close/{id}` | Reopens |
| `POST /api/roads/stop-line {line}` / `POST /api/roads/reopen-line {line}` | Uses the engine's stop-control (Tube/Elizabeth/Overground/DLR) |
| `POST /api/roads/reset` | Reopens everything |
| `GET /api/roads/impact` | `{simulated:true, minutesSinceBaseline, slowedRoads:[{name, slowerPercent, extraQueue}], delayVehicleHours, displacedPeople, extraCars, cost:{low, central, high}, assumptions:{...}}` |
| `GET /api/roads/drive?from=lat,lon&to=lat,lon` | `{minutes, km, roads:[top 4 road names], method:"road graph, speed limits + open closures", simulated:true}` |

**Cost ranges, not single numbers:** `central` uses the engine's own `lib/assumptions.mjs`. `low` and
`high` vary the uncertain inputs: car switching 5% / 10% / 20%, passenger delay 10 / 20 / 30 min, and
value of time from the engine's £12.50/hr. Put every input in `assumptions`.

**Driving times:** load `roads.json` once in Python. Snap `from`/`to` to the nearest graph nodes
(within 400 m, else return 422 with a clear message). Run A* on travel time = length / speed limit
(their per-edge speeds), skipping edges closed in the engine. Add a fixed junction delay per
signalised junction if the data has it; otherwise document "free-flow". Cache results for 10 minutes.
Sanity check against reality and write the numbers into the method page: Strand → King's Cross
should be roughly 15–30 min by car in daytime. If free-flow is far quicker than reality, apply a
documented central-London congestion factor (state the factor and why).

## 3. Control Room UI — website only
- **`control/index.html` (+ `control.js`, `control.css`)**: a clean page that works on phone and laptop.
  - Search a road and close it. Pick a Tube/rail line and stop it.
  - "Load today's real disruptions": TfL `GET https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,overground,dlr/Status` (no key). Lines whose status isn't Good Service become one-tap "stop this line in the simulation" buttons.
  - Live impact panel refreshing every 10 s: slowed roads, delay, displaced people, cost **range**, each with a `SIMULATED` badge and "since HH:MM".
  - **"Brief me"**: `POST /api/briefing` (Agent 1) with your numbers. Show the text, labelled "Written by Snowflake Cortex from the numbers above" or "Automatic summary" when `source:"fallback"`.
  - Reset button. Large touch targets, no horizontal scroll at 360 px.
- **`js/pages-control.js`**: teletext pages registered on `window.LFExtra`:
  - **800 CONTROL ROOM**: engine status, current closures and stopped lines, headline impact (ranges), "OPEN THE CONTROL PANEL AT /control" (show the URL from `location.origin`)
  - **801**: slowed roads list (name, % slower)
  - **802**: stopped lines, displaced people, extra cars
  - **803 HOW THIS WORKS**: method, data sources, assumptions, chosen car population, what it can't tell you. This is our accuracy answer for judges
  - Fastext between 800–803. Every simulated number carries the word `EST` or `SIMULATED`.

## 4. Honesty checklist (judges will probe this)
- [ ] Status says whether the engine was seeded from live TomTom data or default speeds
- [ ] Impact appears only after the engine's baseline has formed. Show "MEASURING… (≈3 MIN)" until then
- [ ] Costs are ranges, and every assumption is listed on 803
- [ ] Nothing on screen says "Live London"; `CREDIT.md` and the README carry the credit
- [ ] Engine down → friendly "Control Room offline" state, no crashes

## 5. Hand-off (by 16:20)
Commit your paths on `main` (see TEAM.md). Include `roads/setup.sh`, `roads/README.md` (how to start the engine on the
hosting Mac, which keys go where, expected RAM/CPU), and a 30-second test recipe: close the Strand,
wait 3 minutes, check `/api/roads/impact`. **Important for the demo:** impact needs a few minutes to
appear, so Agent 1 will start a scenario before recording. Tell Agent 1 the earliest it can be started.
