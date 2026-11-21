# Londonfax Game Mode — "Slow Lane"

A 1v1 London knowledge game played in the phone browser (no install). The TV shows teletext pages 600–603.

## How to play
1. Open `<site>/play` on a phone (or scan the QR on teletext page 600). Enter a name, tap **Create a new game**.
2. The second player enters the 4-letter code (or scans the QR). The host taps **Start**.
3. Both players get the **same real London journey** (≥2 legs, ≥2 different lines/modes, deliberately not the fastest).
4. Each player makes **2 secret edits**, picking only from options the server has already validated:
   - **Re-mode a leg**: travel it another way (another line, a bus, walking if short, driving vs bus/tube for drive legs).
   - **Move a change point**: change at one of 2–4 curated alternative stations; both legs touching it are re-planned.
5. Times are **hidden while editing**. **Score = new total − original total** (minutes). Faster by accident = negative points.
6. 90 seconds per round (server timer auto-submits). 3 rounds with different journeys, then the final leaderboard.

Foolproof by design: start and end are fixed, no station blocking, nothing invalid can be picked (the server only
accepts option ids it offered for that player's current route), the **server computes all times** (clients never
send times), and refreshing the phone rejoins (`playerId` in `localStorage`).

## Where the times come from
- **TfL legs:** TfL Journey Planner `GET /Journey/JourneyResults/{lat,lon}/to/{lat,lon}?mode=...`.
  Options are made by restricting the mode per leg (`tube,walking`, `elizabeth-line,walking`, `overground,walking`,
  `dlr,walking`, `bus,walking`, `national-rail,walking`, `walking`). We take the quickest journey returned and label it
  with the lines actually used (`legs[].routeOptions[0].name`). Options that come back identical to another are dropped.
- **Driving legs:** Agent 2's `GET /api/roads/drive` (road simulation, labelled SIMULATED). Until it answers we use a
  stub, labelled **ESTIMATE**: `km = straight-line distance × 1.3 (road detour)`, `minutes = km / 14 km/h × 60`
  (14 km/h = assumed average London traffic speed).
- **Change allowance:** total = sum of legs **+ 3 min per change between legs**. It's the same for the original and
  every edited route (the number of changes never changes), so it never affects the score.
- All options for the room's 3 journeys are **precomputed when the room is created** (≤6 requests in parallel) and
  cached for 10 minutes, so play is instant. A room's times are frozen at creation, so both players are scored on the
  same numbers.
- **Rate limits:** the venue shares one public IP and TfL's anonymous limit is low. On HTTP 429 we pause all TfL calls
  for `Retry-After`. If a live call can't be made, we use `game/tfl_snapshot.json`: real Journey Planner answers saved
  by `validate_journeys.py` today, labelled "TfL Journey Planner (saved HH:MM)" in the reveal. Anything with no answer
  at all is not offered. If the team TfL app key is in `.env` (`TFL_APP_KEY`), it is used automatically.

## Files
| File | What |
|---|---|
| `game/api.py` | FastAPI router `/api/game/*`: rooms, join, state, start, edit, undo, submit, next, qr.png, rooms/latest |
| `game/engine.py` | Pure rules: routes, validated options, totals, scoring, the one-line "why" |
| `game/planner.py` | TfL Journey Planner + drive times, cache, rate-limit gate, snapshot fallback |
| `game/journeys.json` | 8 curated journeys: stops (with alternative change stations) and a base mode + alternatives per leg |
| `game/validate_journeys.py` | Checks every journey against TfL and refreshes the snapshot |
| `play/` | Phone UI (join → lobby → journey → waiting → reveal → final) |
| `js/pages-game.js` | Teletext pages 600 (join + QR, follows the live room), 601 live round, 602 reveal, 603 leaderboard |

Rooms are built for N players (`MAX_PLAYERS` in `api.py`); the UI ships as 1v1. Rooms live in memory for 2 hours.
On the final screen each player's rounds are saved with `snow.client.save_game_result(...)` (no-op without Snowflake)
and the all-time top 5 comes from `GET /api/leaderboard`.

## Run
```bash
.venv/bin/python server.py --port 8767          # then open http://localhost:8767/play and http://localhost:8767/#600
.venv/bin/python -m game.validate_journeys      # re-check journeys (add --fresh to ignore the saved snapshot)
```

## Validation output
`base` = our starting route (legs + 3 min per change). `best` = the planner's own quickest answer with all modes (None = that one request was rate-limited during validation). `options` = alternative ways for leg 1 / leg 2 | alternative change stations. `request errors` are TfL 429s (rate limit, retried) and 4xx answers for impossible mode combinations (e.g. Overground from Brixton), which are simply not offered. All 8 journeys have complete original routes.

```
request errors: {'HTTPStatusError': 162, '429': 62}
Validated 2026-11-21 15:56 London, 152 leg answers, +3 min per change

journey                                   base  best  options (legs | change points)
Goodmayes to South Kensington               68    55  1/1 | 3   [Elizabeth line 35 + Circle line 30]
KCL Strand to Greenwich                     66    44  1/2 | 3   [Bus 15 31 + DLR 32]
Brixton to Canary Wharf                     63  None  1/2 | 3   [Victoria line 23 + Jubilee line 37]
Ealing Broadway to Tower of London          73  None  2/1 | 3   [Drive 32 + District line 38]
Walthamstow to Battersea Power Station      65  None  1/1 | 3   [Victoria line 30 + Northern line 32]
Wembley Park to Shoreditch High Street      62    47  1/1 | 3   [Metropolitan line then Victoria line 39 + Windrush 20]
Heathrow T2&3 to King's Cross               93    61  2/1 | 2   [Elizabeth line 55 + Bus 27 then Bus 205 35]
Stratford to Hampstead                      63    47  2/1 | 3   [Central line 31 + Northern line 29]

[exited with code 0]
```
