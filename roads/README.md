# Roads: driving times + Control Room (Agent 2)

Road traffic simulation adapted from t-strachota/livelondon, used with the author's permission
(see `vendor/livelondon/CREDIT.md`).

## Run
```bash
# once per machine: builds vendor/livelondon/data/network/roads.json (~17 MB, not committed)
SSL_CERT_FILE="$(.venv/bin/python -m certifi)" roads/setup.sh
# then the normal server; roads/api.py is mounted automatically at /api/roads
.venv/bin/python server.py --port 8765
```
The graph loads in a background thread at startup (a few seconds), then builds the 300-trip sample.
Until then every endpoint answers `{"available": false, "reason": ...}` (`/drive` with HTTP 503, so
Game Mode falls back to its labelled estimate). Override the graph path with `ROADS_JSON=...`.

`SSL_CERT_FILE` is needed on macOS python.org builds, which otherwise can't verify Geofabrik's HTTPS.
The Geofabrik URL changed upstream; `vendor/livelondon/sim/config.json` has the current one.

## Endpoints (`roads/api.py`)
| Endpoint | Returns |
|---|---|
| `GET /status` | `{available, running, engine:"python-reroute", sampleTrips, seededFrom:"default-speeds", closures, ...}` |
| `GET /search?q=` | up to 8 named roads: `{name, near:[lat,lon], km, points}` |
| `POST /close {name, near?}` | closes that road's edges within 1.2 km of `near` → `{id, label, km}` |
| `DELETE /close/{id}`, `POST /reset` | reopen one / all |
| `GET /impact` | rerouted sample trips, extra minutes, roads taking detours, vehicle-hours and cost as low/central/high, assumptions |
| `GET /drive?from=lat,lon&to=lat,lon` | `{minutes, freeFlowMinutes, km, roads, congestionFactor, method, simulated:true}` |
| `GET /method` | assumptions for page 803 |

## Method (everything is SIMULATED)
- **Graph:** OSM motorway → unclassified roads in Greater London, posted speed limit or class default.
- **Driving time:** A* on free-flow seconds + 15 s per signalised junction, times a length-weighted
  congestion factor: 1.9 inside lon -0.20..-0.05 / lat 51.48..51.54, 1.4 elsewhere. Snap limit 400 m.
  Calibration check: Strand → King's Cross = 12.8–15.9 min free flow → **24–30 min**, 4.0–4.1 km (depends on the Strand start point); daytime
  reality is roughly 15–30 min, so the model sits in the upper half of that range. Cached for 10 min, cleared on any closure.
- **Control Room:** 300 seeded (seed 2026) car trips between main-road junctions in lon -0.22..-0.02,
  lat 51.47..51.55, at least 1.5 km apart. A closure reroutes only the trips that used it.
- **Cost range:** extra vehicle-hours per hour = extra minutes × real trips per sample trip
  (20/30/50 per hour) ÷ 60; × people per car (1.2/1.3/1.5) × value of time (£10/£12.50/£15).
  £12.50/h and 1.3 people per car come from the vendored engine's `lib/assumptions.mjs`.
- **Not modelled:** queues and capacity on detour roads, buses, pedestrians, cancelled trips, live speeds.

## Why not the Node engine
It needs Node 24 + `npm ci` and a TomTom key to seed live speeds; without the key it runs on the same
default speeds. For a reliable demo we shipped the Python model on the same road graph instead.
To try it anyway: `export PATH=~/.local/node/bin:$PATH; cd vendor/livelondon && npm ci && PORT=3000 node server.mjs`.
