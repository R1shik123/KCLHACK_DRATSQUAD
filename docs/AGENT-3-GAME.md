# Agent 3 — Game Mode (1v1, played on phones through the website)

Read `docs/TEAM.md` first (rules, ownership, contracts, timeline). The project folder is shared with
two other agents: stay on `main`, edit and commit only your paths, and test on port 8767
(`.venv/bin/python server.py --port 8767`).
You own: `game/`, `play/`, `js/pages-game.js` (replace the placeholder). Edit nothing else.

## The game
**"Slow Lane"** (working name): a 1v1 London knowledge game.
- Both players get the **same real journey**, e.g. Goodmayes → South Kensington. It's a sensible but
  **deliberately non-optimal** route with at least two different lines or modes: a walk plus two lines,
  a train plus a bus, a drive plus a train, and so on.
- Each player secretly makes **2 edits** to the route on their phone. Every edit picks from a list of
  **pre-validated options only**: travel a leg a different way (another line, a bus, walking if short,
  driving if it's a driving leg), or change where you change trains.
- **Times are hidden while editing.** Players choose from knowledge of London, not by picking the biggest number.
- Score = **new journey time − original time**, in minutes. Make it slower and you gain points. Make it
  faster by accident and you **lose** points.
- 3 rounds (a different journey each round), then a leaderboard. The all-time leaderboard is stored in Snowflake.
- **Foolproof:** no station blocking, origin and destination are fixed, nothing invalid can be chosen,
  and the server computes every time (clients never send times). For the pitch: rooms are built for N
  players; the UI ships as 1v1.

## Where the times come from (our accuracy answer)
- **TfL legs:** TfL Journey Planner (no key): `GET https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?mode=...`.
  `from`/`to` can be NaPTAN ids (e.g. `910GGODMAYS`, `940GZZLUSKS`) or `lat,lon`.
  Use the journey `duration` (it includes walking to the stop and waiting). Tested today: Goodmayes → South
  Kensington is 48–51 min (Elizabeth line 21 → District 22); a Whitechapel → Bank bus leg is 20 min (walk 2 + bus 25).
- **Known API behaviour:**
  - The planner's 3 alternatives are often the *same* route at different times, so generate options by **restricting `mode` per leg**: `tube,walking`, `elizabeth-line,walking`, `overground,walking`, `dlr,walking`, `bus,walking`, `walking`.
  - `via` was ignored in testing; don't rely on it.
  - `mode=car` returns **400**.
  - Read the lines actually used from `legs[].routeOptions[0].name` and label options with them (e.g. "Tube · Central then Jubilee").
- **Driving legs:** Agent 2's `GET /api/roads/drive?from=lat,lon&to=lat,lon` → `{minutes, km, roads, simulated:true}`.
  Until it exists, use a stub `minutes = km / 14 * 60` (London average traffic speed, assumption labelled)
  and switch over when Agent 2's endpoint answers.
- **Total time** = sum of leg durations + **3 min per change between legs**. This is a documented,
  consistent allowance applied to both the original and edited routes, so scoring is fair.
- Cache every planner call for 10 minutes. **Precompute all options for all 3 rounds when the room is
  created** (parallel, with a concurrency limit of about 6), so play is instant and we stay under TfL's anonymous rate limit.
  If a call fails, that option isn't offered. If a whole journey fails, swap in a spare journey.

## Journeys (curate 8; each round draws a random unused one)
Write them in `game/journeys.json` as waypoints with a mode per leg. Each must have ≥2 legs and ≥2
distinct lines or modes, and real options to change. Suggested pairs (validate and adjust):
1. Goodmayes → South Kensington (Elizabeth line + District; options via Stratford, Liverpool Street, bus legs)
2. KCL Strand campus (51.5115,-0.1160) → Greenwich: walk + bus + DLR
3. Brixton → Canary Wharf: Victoria + Jubilee, or Overground options
4. Ealing Broadway → Tower of London: **drive + Tube** (drive to a station car park, then train)
5. Walthamstow Central → Battersea Power Station: Victoria + Northern
6. Wembley Park → Shoreditch High Street: Metropolitan/Jubilee + Overground
7. Heathrow T2&3 → King's Cross: Elizabeth/Piccadilly + bus
8. Stratford → Hampstead: Overground or Central + Northern
Starting routes should be 10–30% slower than the planner's best, so players can make them faster *or* slower.
Write `game/validate_journeys.py` to print, per journey: baseline minutes, the planner's best minutes,
and how many options each leg has. Run it and paste the output into `game/README.md`.

## Edits (exactly these two types)
1. **Re-mode a leg:** replace leg *i* with another validated way between the same two points.
2. **Move a change point:** replace an intermediate waypoint with one of 2–4 curated alternatives
   (e.g. change at Stratford instead of Whitechapel). This re-plans the two legs that touch it.
Each edit uses 1 of 2 edits. Undo gives the edit back. Submit locks it in. A server timer
(90 s per round) auto-submits.

## API — `game/api.py` (FastAPI `router = APIRouter(prefix="/api/game")`), state in memory
| Endpoint | Purpose |
|---|---|
| `POST /api/game/rooms` | `{name}` → `{code, playerId}` (creator is player 1; precompute starts) |
| `POST /api/game/rooms/{code}/join` | `{name}` → `{playerId}` (max 2 players for now; names ≤12 chars, sanitised) |
| `GET /api/game/rooms/{code}/state?player=ID` | Phase `lobby | preparing | editing | reveal | final`, round, players `[{name, submitted, score}]`, the route (legs **without** times while editing), my edits/options, deadline, reveal results |
| `POST /api/game/rooms/{code}/start` | Player 1 starts once 2 have joined and precompute is done |
| `POST /api/game/rooms/{code}/edit` | `{player, kind:"leg"|"change", index, optionId}`, validated server-side |
| `POST /api/game/rooms/{code}/undo` | `{player}` |
| `POST /api/game/rooms/{code}/submit` | `{player}` |
| `POST /api/game/rooms/{code}/next` | Next round / final |
| `GET /api/game/rooms/{code}/qr.png` | QR code of `{origin}/play/?room=CODE` (`qrcode` lib; origin comes from the request's Host / X-Forwarded headers) |
- Clients **poll** `state` every 1 s (robust through the tunnel). Rooms expire after 2 hours.
- On `final`, call `snow.client.save_game_result(...)` for each player and round (safe if Snowflake is off).
- The player id is stored in `localStorage`, so refreshing the phone rejoins the game.

## Phone UI — `play/index.html`, `play.js`, `play.css` (the most important part)
Players use only their phone's browser. Make it **very clean**:
- One screen per phase:
  1. **Join:** name + code, or "Create game"
  2. **Lobby:** who's here; Start (player 1)
  3. **Your journey:** the edit screen
  4. **Waiting**
  5. **Reveal**
  6. **Final**
- **Journey screen:** a vertical timeline of legs. Each leg card shows a mode icon, a line-colour stripe,
  from → to, and the line names. Tap a leg → bottom sheet of options (mode + lines, no times) → confirm.
  Tap a change point (between legs) → sheet of alternative change stations.
- Top bar: round x/3 · "2 edits left" · countdown. Big **Submit** button at the bottom; **Undo** beside it.
- **Reveal:** both players' routes side by side (stacked on narrow screens) with every leg time, the
  totals, the score delta (green +, red −) and a one-line "why", e.g. "Bus 25 is 9 min slower than the Central line here".
- Mobile first: 360 px wide with no horizontal scroll, ≥44 px touch targets, system font, high
  contrast, works on iOS Safari and Android Chrome, respects reduced motion.
  Teletext colours (`#0000ff` blue, `#ffff00` yellow, `#00ffff` cyan) as accents only.
- No login, no install, no external fonts. If you load a library from a CDN, pin an exact version.

## TV view — `js/pages-game.js` (teletext pages on `window.LFExtra`)
- **600 GAME MODE:** big block-letter title (`banner`), "PLAY ON YOUR PHONE", the room code in big
  letters, the join URL (`location.origin + '/play'`), and the QR code shown via `s.media = { image: '/api/game/rooms/CODE/qr.png', r: 6, c: 26, w: 13, h: 10 }`.
  If no room exists, show "OPEN <origin>/play TO START A GAME".
- **601:** live round view: the journey, who has submitted, countdown (`s.tick`).
- **602:** reveal: both totals and deltas, in teletext style.
- **603:** final leaderboard, plus all-time top 5 from `GET /api/leaderboard`.
- The TV page should follow the most recent active room automatically (poll `/api/game/rooms/latest`
  or similar; add that endpoint).

## Done means (by 16:20)
- Two phones (or two browser windows) can play 3 full rounds end to end through `server.py`.
- `game/README.md` has the validation output, the rules, the time sources and the 3-min change allowance.
- No horizontal scroll at 360 px; reveal looks good on a phone and on the TV page.
- Commit your paths on `main` (see TEAM.md). Tell Agent 1 which journeys are most fun for the demo.
