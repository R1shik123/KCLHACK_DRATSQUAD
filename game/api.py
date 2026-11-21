"""Game Mode API (Agent 3). Mounted by server.py at /api/game. State is in memory.

Rooms are built for N players (MAX_PLAYERS), the UI ships as 1v1. The server computes every
time; clients only send ids of options the server offered them.
"""
import asyncio
import random
import re
import secrets
import struct
import time
import zlib

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import Response

from . import engine, planner

router = APIRouter(prefix="/api/game")

MAX_PLAYERS = 2
ROUNDS = 3
EDITS = 2
ROUND_SECONDS = 90
ROOM_TTL = 2 * 3600
ROOMS = {}
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"


def _now():
    return time.time()


def _clean_name(name):
    name = re.sub(r"[^A-Za-z0-9 _\-'.]", "", str(name or "")).strip()[:12]
    return name or "Player"


def _room(code):
    _expire()
    room = ROOMS.get(str(code or "").upper())
    if not room:
        raise HTTPException(404, "No game with that code")
    return room


def _expire():
    for c in [c for c, r in ROOMS.items() if _now() - r["created"] > ROOM_TTL]:
        ROOMS.pop(c, None)


def _player(room, pid):
    p = room["players"].get(pid)
    if not p:
        raise HTTPException(403, "You're not in this game")
    return p


def _origin(request):
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto.split(',')[0].strip()}://{host.split(',')[0].strip()}"


def _journey(room):
    return room["journeys"][room["round"]]


async def _prepare(room, local_base):
    """Precompute every option for the room's journeys; swap in spares for journeys that fail."""
    try:
        pool = room["pool"]
        chosen = []
        while len(chosen) < ROUNDS and pool:
            need = ROUNDS - len(chosen)
            batch, pool = pool[:need], pool[need:]
            table = await planner.precompute(batch, local_base)
            room["table"].update(table)
            chosen += [j for j in batch if engine.journey_ok(j, room["table"])]
        if len(chosen) < ROUNDS:
            room["error"] = "TfL Journey Planner isn't answering. Try creating the game again in a minute."
            return
        room["journeys"] = chosen
        room["ready"] = True
    except Exception as e:  # never leave a room stuck in 'preparing'
        room["error"] = f"Couldn't prepare journeys: {e}"


def _start_round(room):
    j = _journey(room)
    for p in room["players"].values():
        p["route"] = engine.base_route(j)
        p["history"] = []
        p["submitted"] = False
    room["phase"] = "editing"
    room["deadline"] = _now() + ROUND_SECONDS


def _tick(room):
    """Server-side timer: auto-submit at the deadline; reveal once everyone has submitted."""
    if room["phase"] != "editing":
        return
    if _now() >= room["deadline"]:
        for p in room["players"].values():
            p["submitted"] = True
    if all(p["submitted"] for p in room["players"].values()):
        _score_round(room)


def _score_round(room):
    j = _journey(room)
    base = engine.base_route(j)
    t = room["table"]
    base_total = engine.route_total(j, base, t)
    res = {"round": room["round"] + 1, "title": j["title"], "from": j["stops"][0]["name"], "to": j["stops"][-1]["name"],
           "base": engine.describe(j, base, t, True), "players": []}
    for pid in room["order"]:
        p = room["players"][pid]
        total = engine.route_total(j, p["route"], t)
        delta = total - base_total
        p["score"] += delta
        p["rounds"].append({"round": room["round"] + 1, "title": j["title"], "base": base_total, "total": total, "points": delta})
        res["players"].append({"id": pid, "name": p["name"], "route": engine.describe(j, p["route"], t, True),
                               "total": total, "delta": delta, "edits": len(p["history"]),
                               "why": engine.why(j, base, p["route"], t)})
    room["results"].append(res)
    room["phase"] = "reveal"


async def _save_results(room):
    try:
        from snow import client as snow
    except Exception:
        return
    for pid in room["order"]:
        p = room["players"][pid]
        for rd, res in zip(p["rounds"], room["results"]):
            try:
                await asyncio.to_thread(snow.save_game_result, p["name"], rd["round"], res["from"], res["to"],
                                        rd["base"], rd["total"], rd["points"], room["code"], {"title": rd["title"]})
            except Exception as e:
                room["saveError"] = str(e)


def _public(room, pid=None):
    _tick(room)
    me = room["players"].get(pid) if pid else None
    out = {
        "code": room["code"], "phase": "preparing" if room["phase"] == "lobby" and not room["ready"] else room["phase"],
        "ready": room["ready"], "error": room.get("error"), "round": room["round"] + 1, "rounds": ROUNDS,
        "maxPlayers": MAX_PLAYERS, "editsPerRound": EDITS, "roundSeconds": ROUND_SECONDS, "changeMinutes": engine.CHANGE_MIN,
        "players": [{"name": room["players"][i]["name"], "submitted": room["players"][i]["submitted"],
                     "score": room["players"][i]["score"], "host": i == room["order"][0], "you": i == pid}
                    for i in room["order"]],
    }
    if room["phase"] == "editing":
        out["secondsLeft"] = max(0, int(room["deadline"] - _now() + 0.999))
    if room["phase"] in ("editing", "reveal") and room["ready"]:
        j = _journey(room)
        out["journey"] = {"title": j["title"], "from": j["stops"][0]["name"], "to": j["stops"][-1]["name"],
                          "base": engine.describe(j, engine.base_route(j), room["table"], False)}
    if me:
        out["you"] = {"name": me["name"], "host": pid == room["order"][0], "submitted": me["submitted"],
                      "editsLeft": EDITS - len(me["history"]), "canUndo": bool(me["history"]) and not me["submitted"]}
        if room["phase"] == "editing":
            j = _journey(room)
            out["route"] = engine.describe(j, me["route"], room["table"], False)
            out["route"]["edited"] = _edited_flags(j, me["route"])
            if not me["submitted"] and len(me["history"]) < EDITS:
                out["options"] = engine.build_options(j, me["route"], room["table"])
    if room["phase"] in ("reveal", "final") and room["results"]:
        out["reveal"] = room["results"][-1]
    if room["phase"] == "final":
        out["standings"] = sorted(
            [{"name": room["players"][i]["name"], "score": room["players"][i]["score"], "rounds": room["players"][i]["rounds"],
              "you": i == pid} for i in room["order"]], key=lambda x: -x["score"])
        out["history"] = [{"round": r["round"], "title": r["title"], "base": r["base"]["total"],
                           "players": [{"name": p["name"], "total": p["total"], "delta": p["delta"]} for p in r["players"]]}
                          for r in room["results"]]
    return out


def _edited_flags(j, r):
    base = engine.base_route(j)
    return {"legs": [r["modes"][i] != base["modes"][i] or r["stops"][i] != base["stops"][i] or r["stops"][i + 1] != base["stops"][i + 1]
                     for i in range(len(j["legs"]))],
            "changes": [r["stops"][i] != 0 for i in range(1, len(j["stops"]) - 1)]}


# ---------------- endpoints ----------------

@router.post("/rooms")
async def create_room(request: Request, body: dict = Body(default={})):
    _expire()
    code = "".join(random.choice(CODE_CHARS) for _ in range(4))
    while code in ROOMS:
        code = "".join(random.choice(CODE_CHARS) for _ in range(4))
    pid = secrets.token_urlsafe(9)
    pool = engine.load_journeys()
    random.shuffle(pool)
    room = {"code": code, "created": _now(), "phase": "lobby", "round": 0, "ready": False, "error": None,
            "pool": pool, "journeys": [], "table": {}, "results": [], "deadline": 0, "order": [pid], "saved": False,
            "players": {pid: {"name": _clean_name(body.get("name")), "score": 0, "rounds": [], "route": None,
                              "history": [], "submitted": False}}}
    ROOMS[code] = room
    server = request.scope.get("server") or ("127.0.0.1", 8765)
    asyncio.create_task(_prepare(room, f"http://127.0.0.1:{server[1]}"))
    return {"code": code, "playerId": pid}


@router.get("/rooms/latest")
async def latest_room():
    _expire()
    if not ROOMS:
        return {"code": None}
    room = max(ROOMS.values(), key=lambda r: r["created"])
    return _public(room)


@router.post("/rooms/{code}/join")
async def join_room(code: str, body: dict = Body(default={})):
    room = _room(code)
    pid = body.get("player")
    if pid and pid in room["players"]:  # rejoin after refresh
        return {"code": room["code"], "playerId": pid}
    if room["phase"] != "lobby":
        raise HTTPException(409, "This game has already started")
    if len(room["players"]) >= MAX_PLAYERS:
        raise HTTPException(409, "This game is full")
    name = _clean_name(body.get("name"))
    taken = {p["name"].lower() for p in room["players"].values()}
    base, n = name, 2
    while name.lower() in taken:
        name = f"{base[:10]} {n}"
        n += 1
    pid = secrets.token_urlsafe(9)
    room["players"][pid] = {"name": name, "score": 0, "rounds": [], "route": None, "history": [], "submitted": False}
    room["order"].append(pid)
    return {"code": room["code"], "playerId": pid}


@router.get("/rooms/{code}/state")
async def room_state(code: str, request: Request, player: str = ""):
    room = _room(code)
    out = _public(room, player or None)
    out["joinUrl"] = f"{_origin(request)}/play/?room={room['code']}"
    if player and player not in room["players"]:
        out["notInRoom"] = True
    return out


@router.post("/rooms/{code}/start")
async def start(code: str, body: dict = Body(default={})):
    room = _room(code)
    pid = body.get("player")
    _player(room, pid)
    if room["phase"] != "lobby":
        return _public(room, pid)
    if pid != room["order"][0]:
        raise HTTPException(403, "Only the host can start")
    if len(room["players"]) < 2:
        raise HTTPException(409, "Waiting for a second player")
    if not room["ready"]:
        raise HTTPException(409, "Still fetching journey times from TfL")
    room["round"] = 0
    _start_round(room)
    return _public(room, pid)


@router.post("/rooms/{code}/edit")
async def edit(code: str, body: dict = Body(...)):
    room = _room(code)
    pid = body.get("player")
    p = _player(room, pid)
    _tick(room)
    if room["phase"] != "editing" or p["submitted"]:
        raise HTTPException(409, "Editing is closed for this round")
    if len(p["history"]) >= EDITS:
        raise HTTPException(409, "No edits left")
    try:
        new = engine.apply_edit(_journey(room), p["route"], body.get("kind"), int(body.get("index", -1)),
                                str(body.get("optionId")), room["table"])
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    p["history"].append(p["route"])
    p["route"] = new
    return _public(room, pid)


@router.post("/rooms/{code}/undo")
async def undo(code: str, body: dict = Body(...)):
    room = _room(code)
    pid = body.get("player")
    p = _player(room, pid)
    _tick(room)
    if room["phase"] == "editing" and not p["submitted"] and p["history"]:
        p["route"] = p["history"].pop()
    return _public(room, pid)


@router.post("/rooms/{code}/submit")
async def submit(code: str, body: dict = Body(...)):
    room = _room(code)
    pid = body.get("player")
    p = _player(room, pid)
    if room["phase"] == "editing":
        p["submitted"] = True
    return _public(room, pid)


@router.post("/rooms/{code}/next")
async def next_round(code: str, body: dict = Body(...)):
    room = _room(code)
    pid = body.get("player")
    _player(room, pid)
    # idempotent: both phones may press Next; only the press for the current round counts
    if room["phase"] == "reveal" and int(body.get("round", room["round"] + 1)) == room["round"] + 1:
        if room["round"] + 1 >= ROUNDS:
            room["phase"] = "final"
            if not room["saved"]:
                room["saved"] = True
                asyncio.create_task(_save_results(room))
        else:
            room["round"] += 1
            _start_round(room)
    return _public(room, pid)


@router.get("/rooms/{code}/qr.png")
async def qr(code: str, request: Request):
    room = _room(code)
    import qrcode
    q = qrcode.QRCode(border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    q.add_data(f"{_origin(request)}/play/?room={room['code']}")
    q.make(fit=True)
    return Response(_png(q.get_matrix(), 8), media_type="image/png", headers={"Cache-Control": "no-store"})


def _png(matrix, scale):
    """Minimal black-on-white PNG encoder, so the QR needs no imaging library."""
    rows = []
    for row in matrix:
        line = b"".join((b"\x00" if cell else b"\xff") * scale for cell in row)
        rows += [b"\x00" + line] * scale
    w = len(matrix[0]) * scale

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, w, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))
