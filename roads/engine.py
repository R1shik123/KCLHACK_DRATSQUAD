"""Londonfax road engine (Python-only).

Works on vendor/livelondon/data/network/roads.json, the road graph built from OpenStreetMap by the
vendored road builder (see roads/README.md). Everything here is a SIMULATION / ESTIMATE:

- Driving time: A* on free-flow travel time (edge length / posted or class-default speed limit),
  plus SIGNAL_DELAY_S per signalised junction passed, times a congestion factor
  (CONGESTION_CENTRAL inside the central zone, CONGESTION_OUTER elsewhere). Closed roads are skipped.
- Control Room: a fixed, seeded sample of SAMPLE_TRIPS car trips between main-road junctions in the
  sample area. Closing a road reroutes only the trips whose route used it; we report the extra
  minutes, the worst-hit roads (roads that gain the most rerouted trips) and a cost RANGE.
"""
import heapq
import json
import math
import os
import random
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROADS_JSON = os.environ.get("ROADS_JSON", os.path.join(ROOT, "vendor", "livelondon", "data", "network", "roads.json"))

SIGNAL_DELAY_S = 15.0          # average wait per signalised junction (assumption)
CENTRAL_BOX = (-0.20, 51.48, -0.05, 51.54)  # lon/lat box treated as central London
CONGESTION_CENTRAL = 1.9       # daytime factor vs free flow in central London (calibrated, see README)
CONGESTION_OUTER = 1.4         # daytime factor elsewhere
SNAP_LIMIT_M = 400
SAMPLE_TRIPS = 300
SAMPLE_SEED = 2026
SAMPLE_BOX = (-0.22, 51.47, -0.02, 51.55)
MAIN_CLASSES = {"motorway", "trunk", "primary", "secondary"}
# Cost assumptions (central values match vendor/livelondon/lib/assumptions.mjs).
VALUE_OF_TIME = {"low": 10.0, "central": 12.5, "high": 15.0}       # £ per person-hour
PEOPLE_PER_CAR = {"low": 1.2, "central": 1.3, "high": 1.5}
TRIPS_PER_HOUR_PER_SAMPLE = {"low": 20, "central": 30, "high": 50}  # real car trips each sample trip stands for, per hour


def haversine(lon1, lat1, lon2, lat2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(a))


def in_box(lon, lat, box):
    return box[0] <= lon <= box[2] and box[1] <= lat <= box[3]


class Graph:
    def __init__(self, path):
        t0 = time.time()
        data = json.load(open(path, encoding="utf-8"))
        self.bbox = data["bbox"]
        self.classes = data["classes"]
        self.names = data["names"]
        signals = set(data.get("signals") or [])
        n = data["nodes"]
        self.lon = [0.0] * n
        self.lat = [0.0] * n
        self.out = [[] for _ in range(n)]
        self.edges = []  # (frm, to, cls, seconds, length, name_idx, mid_lon, mid_lat, coords)
        self.vmax = 1.0
        for i, e in enumerate(data["edges"]):
            frm, to, cls, _lanes, speed, _inf, _two, length, coords = e[:9]
            name = e[10]
            self.lon[frm], self.lat[frm] = coords[0], coords[1]
            self.lon[to], self.lat[to] = coords[-2], coords[-1]
            speed = max(speed, 1.0)
            self.vmax = max(self.vmax, speed)
            mid = (len(coords) // 4) * 2
            secs = length / speed + (SIGNAL_DELAY_S if to in signals else 0.0)
            self.edges.append((frm, to, cls, secs, length, name, coords[mid], coords[mid + 1], coords))
            self.out[frm].append(i)
        # Spatial grid for snapping (~0.005 deg cells).
        self.grid = {}
        for v in range(n):
            self.grid.setdefault((int(self.lon[v] / 0.005), int(self.lat[v] / 0.005)), []).append(v)
        self.by_name = {}
        for i, e in enumerate(self.edges):
            if self.names[e[5]]:
                self.by_name.setdefault(e[5], []).append(i)
        self.load_seconds = round(time.time() - t0, 1)

    def snap(self, lat, lon):
        cx, cy = int(lon / 0.005), int(lat / 0.005)
        best, bd = None, 1e18
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for v in self.grid.get((cx + dx, cy + dy), ()):
                    d = haversine(lon, lat, self.lon[v], self.lat[v])
                    if d < bd:
                        best, bd = v, d
        return (best, bd) if bd <= SNAP_LIMIT_M else (None, bd)

    def route(self, s, t, closed=frozenset()):
        """A* on free-flow seconds. Returns (seconds, [edge indices]) or None."""
        if s == t:
            return 0.0, []
        tl, tt = self.lon[t], self.lat[t]
        h = lambda v: haversine(self.lon[v], self.lat[v], tl, tt) / self.vmax
        dist = {s: 0.0}
        prev = {}
        pq = [(h(s), 0.0, s)]
        while pq:
            _, d, v = heapq.heappop(pq)
            if v == t:
                path = []
                while v != s:
                    i = prev[v]
                    path.append(i)
                    v = self.edges[i][0]
                return d, path[::-1]
            if d > dist.get(v, 1e18):
                continue
            for i in self.out[v]:
                if i in closed:
                    continue
                e = self.edges[i]
                nd = d + e[3]
                w = e[1]
                if nd < dist.get(w, 1e18):
                    dist[w] = nd
                    prev[w] = i
                    heapq.heappush(pq, (nd + h(w), nd, w))
        return None

    def congestion(self, path):
        """Length-weighted congestion factor along a path."""
        tot = sum(self.edges[i][4] for i in path) or 1.0
        c = sum(self.edges[i][4] for i in path if in_box(self.edges[i][6], self.edges[i][7], CENTRAL_BOX))
        return (c * CONGESTION_CENTRAL + (tot - c) * CONGESTION_OUTER) / tot

    def top_roads(self, path, k=4):
        lengths = {}
        for i in path:
            nm = self.names[self.edges[i][5]]
            if nm:
                lengths[nm] = lengths.get(nm, 0) + self.edges[i][4]
        return [n for n, _ in sorted(lengths.items(), key=lambda x: -x[1])[:k]]


class Engine:
    def __init__(self):
        self.g = None
        self.error = None
        self.loading = False
        self.lock = threading.Lock()
        self.closures = {}   # id -> {id, label, edges:set, at}
        self.next_id = 1
        self.trips = None    # [(s, t, base_seconds, base_path_set)]
        self.baseline_at = None
        self._impact_cache = None

    # ---------- loading ----------
    def ensure(self):
        if self.g or self.loading:
            return
        if not os.path.exists(ROADS_JSON):
            self.error = "roads.json not built yet (run roads/setup.sh)"
            return
        self.loading = True
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        try:
            g = Graph(ROADS_JSON)
            self.g = g
            self.error = None
            self._build_sample()
        except Exception as e:  # keep the UI alive
            self.error = f"road graph failed to load: {e}"
        finally:
            self.loading = False

    def _build_sample(self):
        g = self.g
        rnd = random.Random(SAMPLE_SEED)
        main = set(i for i, c in enumerate(g.classes) if c in MAIN_CLASSES)
        nodes = sorted({e[0] for e in g.edges if e[2] in main and in_box(e[6], e[7], SAMPLE_BOX)})
        trips = []
        tries = 0
        while len(trips) < SAMPLE_TRIPS and tries < SAMPLE_TRIPS * 3 and nodes:
            tries += 1
            s, t = rnd.choice(nodes), rnd.choice(nodes)
            if haversine(g.lon[s], g.lat[s], g.lon[t], g.lat[t]) < 1500:
                continue
            r = g.route(s, t)
            if r:
                trips.append((s, t, r[0] * g.congestion(r[1]), frozenset(r[1])))
        self.trips = trips
        self.baseline_at = time.time()

    @property
    def ready(self):
        return self.g is not None

    def closed_edges(self):
        out = set()
        for c in self.closures.values():
            out |= c["edges"]
        return frozenset(out)

    # ---------- driving ----------
    def drive(self, f, t):
        g = self.g
        s, ds = g.snap(*f)
        e, de = g.snap(*t)
        if s is None or e is None:
            which = "from" if s is None else "to"
            raise ValueError(f"'{which}' point is {int(ds if s is None else de)} m from the nearest main road (limit {SNAP_LIMIT_M} m)")
        r = g.route(s, e, self.closed_edges())
        if r is None:
            raise LookupError("no open route between these points")
        secs, path = r
        factor = g.congestion(path)
        km = sum(g.edges[i][4] for i in path) / 1000
        return {
            "minutes": round(secs * factor / 60, 1),
            "freeFlowMinutes": round(secs / 60, 1),
            "km": round(km, 1),
            "roads": g.top_roads(path),
            "congestionFactor": round(factor, 2),
            "method": "road graph, speed limits + open closures",
            "simulated": True,
        }

    # ---------- search / closures ----------
    def search(self, q, limit=8):
        g = self.g
        q = q.strip().lower()
        if len(q) < 2:
            return []
        hits = [(k, n) for k, n in enumerate(g.names) if n and q in n.lower() and k in g.by_name]
        hits.sort(key=lambda x: (not x[1].lower().startswith(q), -len(g.by_name[x[0]])))
        out = []
        for k, name in hits[:limit]:
            idx = g.by_name[k]
            # Representative cluster: the edges near the most central edge of this name.
            mids = sorted(idx, key=lambda i: haversine(g.edges[i][6], g.edges[i][7], -0.1276, 51.5072))
            c = g.edges[mids[0]]
            near = [i for i in idx if haversine(g.edges[i][6], g.edges[i][7], c[6], c[7]) < 1200]
            pts = sorted({(round(g.edges[i][7], 5), round(g.edges[i][6], 5)) for i in near})
            step = max(1, len(pts) // 5)
            out.append({"name": name, "near": [round(c[7], 5), round(c[6], 5)],
                        "km": round(sum(g.edges[i][4] for i in near) / 2000, 1),  # two directions
                        "points": [list(p) for p in pts[::step][:6]]})
        return out

    def close(self, name, near=None):
        g = self.g
        k = next((k for k, n in enumerate(g.names) if n.lower() == name.lower()), None)
        if k is None or k not in g.by_name:
            raise LookupError(f"no road called {name!r}")
        idx = g.by_name[k]
        if near is None:
            near = self.search(g.names[k], 50)
            near = next(r["near"] for r in near if r["name"] == g.names[k])
        lat, lon = near
        edges = {i for i in idx if haversine(g.edges[i][6], g.edges[i][7], lon, lat) < 1200}
        with self.lock:
            cid = str(self.next_id)
            self.next_id += 1
            self.closures[cid] = {"id": cid, "label": g.names[k], "edges": frozenset(edges), "at": time.time(),
                                  "km": round(sum(g.edges[i][4] for i in edges) / 2000, 1)}
            self._impact_cache = None
        return {"id": cid, "label": g.names[k], "km": self.closures[cid]["km"]}

    def reopen(self, cid):
        with self.lock:
            ok = self.closures.pop(cid, None) is not None
            self._impact_cache = None
        return ok

    def reset(self):
        with self.lock:
            self.closures.clear()
            self._impact_cache = None

    # ---------- impact ----------
    def impact(self):
        if self._impact_cache and self._impact_cache[0] == tuple(sorted(self.closures)):
            return self._impact_cache[1]
        g = self.g
        closed = self.closed_edges()
        affected = 0
        unreachable = 0
        extra = 0.0
        gained = {}
        for s, t, base, used in self.trips or []:
            if not (used & closed):
                continue
            affected += 1
            r = g.route(s, t, closed)
            if r is None:
                unreachable += 1
                continue
            new = r[0] * g.congestion(r[1])
            extra += max(0.0, new - base)
            for nm in {g.names[g.edges[i][5]] for i in set(r[1]) - used}:
                if nm:
                    gained[nm] = gained.get(nm, 0) + 1
        n = len(self.trips or [])
        extra_min = extra / 60
        worst = sorted(gained.items(), key=lambda x: -x[1])[:6]
        cost = {}
        vehicle_hours = {}
        for band in ("low", "central", "high"):
            vh = extra_min / 60 * TRIPS_PER_HOUR_PER_SAMPLE[band]
            vehicle_hours[band] = round(vh, 1)
            cost[band] = round(vh * PEOPLE_PER_CAR[band] * VALUE_OF_TIME[band])
        res = {
            "simulated": True,
            "available": True,
            "closures": [{"id": c["id"], "label": c["label"], "km": c["km"]} for c in self.closures.values()],
            "sampleTrips": n,
            "affectedTrips": affected,
            "unreachableTrips": unreachable,
            "extraMinutesTotal": round(extra_min, 1),
            "extraMinutesPerAffectedTrip": round(extra_min / max(1, affected - unreachable), 1),
            "slowedRoads": [{"name": nm, "extraTrips": c, "sharePercent": round(100 * c / max(1, affected))} for nm, c in worst],
            "delayVehicleHoursPerHour": vehicle_hours,
            "costPerHour": cost,
            "since": min((c["at"] for c in self.closures.values()), default=None),
            "assumptions": self.assumptions(),
        }
        self._impact_cache = (tuple(sorted(self.closures)), res)
        return res

    def assumptions(self):
        return {
            "sampleTrips": f"{SAMPLE_TRIPS} seeded car trips (seed {SAMPLE_SEED}) between main-road junctions in lon {SAMPLE_BOX[0]}..{SAMPLE_BOX[2]}, lat {SAMPLE_BOX[1]}..{SAMPLE_BOX[3]}",
            "speeds": "OpenStreetMap posted speed limits, else class defaults (20-70 mph); not live traffic",
            "signalDelaySeconds": SIGNAL_DELAY_S,
            "congestionFactor": {"central": CONGESTION_CENTRAL, "outer": CONGESTION_OUTER},
            "drivers": "every rerouted driver picks the fastest open route; no one cancels or changes mode",
            "tripsPerHourPerSampleTrip": TRIPS_PER_HOUR_PER_SAMPLE,
            "peoplePerCar": PEOPLE_PER_CAR,
            "valueOfTimePerHour": VALUE_OF_TIME,
            "notModelled": "queues and capacity limits on detour roads, buses, pedestrians",
        }


ENGINE = Engine()
