# Agent prompts

Each prompt is **complete on its own**: paste the whole block into one agent running in **JetBrains Air**.
- Agent 2 and Agent 3 run on the friend's laptop, both in the same IntelliJ / JetBrains Air project.
- Agent 1 is currently the Claude session on the hosting Mac. Use the Agent 1 prompt only if that role
  moves into JetBrains Air (open `~/Downloads/londonfax` on the hosting Mac, which already has the
  Snowflake key and Python environment).

**Where work is uploaded:** GitHub repo **https://github.com/R1shik123/KCLHACK_DRATSQUAD**, branch **`main`**.
Each agent pushes only its own folders (below), straight to `main`, no other branches.

---

## Agent 2 — road traffic engine + Control Room

```text
You are Agent 2 of 3 building "Londonfax" at KCL Tech First Year Hack today (London). You are running in
JetBrains Air, which the competition requires. Londonfax is a website that looks like 1980s Teletext and
shows live London transport data. You build CONTROL ROOM: a road-traffic "what happens if we close this?"
decision tool, plus driving times that Game Mode needs.

DEADLINES (London time): status update 16:20 · feature freeze 17:00 · team submits 17:30 · hard stop 18:00.

GET THE CODE
- Repo: https://github.com/R1shik123/KCLHACK_DRATSQUAD (branch main). If the project isn't cloned yet:
  git clone https://github.com/R1shik123/KCLHACK_DRATSQUAD.git ; otherwise: git pull origin main
- Read docs/TEAM.md (rules, ownership, shared APIs) and docs/AGENT-2-ROADS.md (your full plan) before coding.
- Python env (once, shared with Agent 3; never recreate it if it exists):
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
- Test on YOUR port: .venv/bin/python server.py --port 8766 (the road engine itself uses port 3000).

YOU OWN (edit only these): vendor/livelondon/  roads/  control/  js/pages-control.js (replace the placeholder)
Do not touch anything else. Leave src/Main.java, .idea/ and the .iml file alone.

WHERE AND HOW TO UPLOAD YOUR WORK
- Upload = push to the repo above, branch main, only your paths:
    git add vendor/livelondon roads control js/pages-control.js
    git commit -m "roads: <what changed>"
    git pull --rebase --autostash origin main && git push origin main
- Push after every working step, at least every 30 minutes, and definitely at 16:20 and before 17:00.
- If the push is rejected, run the pull/push line once more. Never force-push. Never git add -A / . / commit -a.
- Agent 3 shares your project folder: stay on main; never checkout/switch branches, stash, reset --hard,
  clean or restore. Never upload: .env files, keys, .venv/, node_modules/, vendor/livelondon/data/ (road
  data is big and is rebuilt by roads/setup.sh). Check `git status` before every commit.

BUILD, IN THIS ORDER (finish each before the next)
1. Driving times: GET /api/roads/drive?from=lat,lon&to=lat,lon in roads/api.py (FastAPI
   `router = APIRouter(prefix="/api/roads")`; server.py loads it automatically). Get the road graph by
   vendoring https://github.com/t-strachota/livelondon into vendor/livelondon (reuse approved by an admin
   and the author): delete its .git and its committed .env (someone else's keys; never use them), add
   vendor/livelondon/CREDIT.md (source, commit, "used with the author's permission"). Build
   data/network/roads.json with its Python road builder (Greater London OSM extract, ~100 MB download).
   Do A* in Python on travel time = length / speed limit, avoiding closed roads. Return
   {minutes, km, roads:[top road names], method, simulated:true}. Sanity-check it (Strand to King's Cross by
   car is roughly 15-30 min in daytime) and document any congestion factor you apply.
   Agent 3 is waiting on this endpoint: push it as soon as it works.
2. Run their engine headless on port 3000 with Node 24.5+. Use a laptop-friendly 20-40k cars. The human
   adds a TomTom key in a new, uncommitted vendor/livelondon/.env. Without it, label everything
   "DEFAULT SPEEDS (NOT LIVE)". Write roads/setup.sh so the hosting Mac can repeat the setup.
3. Bridge endpoints under /api/roads: status, search (road names), close/reopen a road, stop/reopen a
   Tube/rail line, reset, impact. Impact = slowed roads, delay, displaced people, extra cars, and cost as a
   low/central/high RANGE, with every assumption listed. If the engine is down, return {available:false},
   never a 500.
4. control/index.html (+ control.js, control.css): a clean panel for phone and laptop (no horizontal
   scroll at 360 px, big buttons):
   - search and close a road; stop a line
   - "Load today's real disruptions" (TfL https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,overground,dlr/Status, no key)
   - live impact refreshing every 10 s
   - "Brief me" -> POST /api/briefing with {title, closures, metrics, assumptions}. This is Agent 1's
     Snowflake Cortex endpoint; when it returns source:"fallback", show "Automatic summary"
   - Reset
5. Teletext TV pages on window.LFExtra (see docs/TEAM.md for the Screen API):
   - 800 CONTROL ROOM: status, closures, headline impact
   - 801: slowed roads
   - 802: stopped lines and displaced people
   - 803 HOW THIS WORKS: method, sources, assumptions, car population, limits. This is the team's answer when judges ask "is it accurate?"

RULES THAT MATTER
- Never invent a number. Every simulated figure says SIMULATED or EST, and uncertain inputs are shown as ranges.
- Impact needs a few minutes after a closure to appear: show "MEASURING..." until then.
- Never mention "Live London" anywhere on screen. Credit goes only in CREDIT.md / README.
- Everything runs on the website; build links from location.origin.
- Test in a real browser, including a 360 px phone view, before calling anything done.

STATUS UPDATES (at 16:20 and when done), written for the human to pass on:
- what works and what doesn't
- how to run it on the hosting Mac
- commits pushed
- when /api/roads/drive went live
- how many minutes a closure needs before impact shows (Agent 1 starts a scenario before recording the demo)
```

---

## Agent 3 — 1v1 Game Mode on phones

```text
You are Agent 3 of 3 building "Londonfax" at KCL Tech First Year Hack today (London). You are running in
JetBrains Air, which the competition requires. Londonfax is a website that looks like 1980s Teletext and
shows live London transport data. You build GAME MODE: a 1v1 journey game played in the phone browser.

DEADLINES (London time): status update 16:20 · feature freeze 17:00 · team submits 17:30 · hard stop 18:00.

GET THE CODE
- Repo: https://github.com/R1shik123/KCLHACK_DRATSQUAD (branch main). If the project isn't cloned yet:
  git clone https://github.com/R1shik123/KCLHACK_DRATSQUAD.git ; otherwise: git pull origin main
- Read docs/TEAM.md (rules, ownership, shared APIs) and docs/AGENT-3-GAME.md (your full plan) before coding.
- Python env (once, shared with Agent 2; never recreate it if it exists):
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
- Test on YOUR port: .venv/bin/python server.py --port 8767

YOU OWN (edit only these): game/  play/  js/pages-game.js (replace the placeholder)
Do not touch anything else. Leave src/Main.java, .idea/ and the .iml file alone.

WHERE AND HOW TO UPLOAD YOUR WORK
- Upload = push to the repo above, branch main, only your paths:
    git add game play js/pages-game.js
    git commit -m "game: <what changed>"
    git pull --rebase --autostash origin main && git push origin main
- Push after every working step, at least every 30 minutes, and definitely at 16:20 and before 17:00.
- If the push is rejected, run the pull/push line once more. Never force-push. Never git add -A / . / commit -a.
- Agent 2 shares your project folder: stay on main; never checkout/switch branches, stash, reset --hard,
  clean or restore. Never upload .env files, keys or .venv/. Check `git status` before every commit.

THE GAME
- 1v1. Rooms are built for N players so the pitch can say "more players", but the UI ships as 1v1.
- Both players get the SAME real London journey with at least 2 different lines/modes: a walk plus 2
  lines, a train plus a bus, a drive plus a train, and so on. It's deliberately NOT the fastest route.
- Each player secretly makes 2 edits on their phone, choosing ONLY from options the server has already
  validated:
  (a) travel a leg a different way (another line, a bus, walking if short, driving if it's a driving leg)
  (b) change where you change (2-4 curated alternative interchange stations)
- Times stay HIDDEN while editing. Score = new total minutes - original total minutes. Making the journey
  faster by accident gives negative points.
- 3 rounds with a different journey each, then a leaderboard. A 90 s timer per round auto-submits.
- Foolproof: no station blocking; start and end are fixed; nothing invalid can be picked; the SERVER
  computes all times (clients never send times); refreshing the phone rejoins (playerId in localStorage).

WHERE TIMES COME FROM (the team's accuracy answer)
- TfL legs come from the TfL Journey Planner (no key):
  https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?mode=...
  `from`/`to` are NaPTAN ids (e.g. 910GGODMAYS, 940GZZLUSKS) or "lat,lon". Use the journey `duration`.
  Tested today: Goodmayes -> South Kensington is 48-51 min (Elizabeth line 21 + District 22).
- Make different options by restricting `mode` per leg: tube,walking / elizabeth-line,walking /
  overground,walking / dlr,walking / bus,walking / walking. The planner's own alternatives are often the
  same route, `via` is ignored, and mode=car returns 400. Label options with legs[].routeOptions[0].name.
- Driving legs: Agent 2's GET /api/roads/drive?from=lat,lon&to=lat,lon -> {minutes, km}. Until it
  answers, use stub minutes = km / 14 * 60 (labelled assumption), then switch.
- Total = sum of legs + a fixed, documented 3 min per change (applied to both routes, so scoring is fair).
- Precompute ALL options for all 3 rounds when the room is created (about 6 requests in parallel), and
  cache for 10 min. Drop any option whose request fails.

BUILD, IN THIS ORDER
1. game/api.py: FastAPI `router = APIRouter(prefix="/api/game")`; server.py loads it automatically. In-memory rooms:
   - POST /rooms
   - POST /rooms/{code}/join
   - GET /rooms/{code}/state?player=ID (phones poll every 1 s)
   - POST /rooms/{code}/start
   - POST /rooms/{code}/edit {player, kind, index, optionId}
   - POST /rooms/{code}/undo
   - POST /rooms/{code}/submit
   - POST /rooms/{code}/next
   - GET /rooms/{code}/qr.png (qrcode library; build the join URL from the request's host)
   - GET /rooms/latest (for the TV view)
   Plus game/journeys.json with at least 3 validated journeys (8 by the end; ideas in your plan file),
   and game/validate_journeys.py, whose output goes in game/README.md.
2. play/index.html, play.js, play.css: the PHONE UI, the most important part. One clean screen per step:
   join/create -> lobby -> your journey (vertical timeline of leg cards with mode icon, line colour,
   from -> to; tap a leg or a change point -> bottom sheet of options with no times) -> waiting -> reveal
   (both routes, every leg time, totals, +/- score, one-line why) -> final. Top bar: round x/3, edits left,
   countdown. Big Submit and Undo. 360 px wide with no horizontal scroll, touch targets of 44 px or more,
   system font, works on iOS Safari and Android Chrome.
3. On final, save each player's rounds with snow.client.save_game_result(...) (safe if Snowflake is off),
   and show the all-time top 5 from GET /api/leaderboard.
4. Teletext TV pages on window.LFExtra (see docs/TEAM.md for the Screen API):
   - 600: GAME MODE title, room code, join URL from location.origin, and the QR via
     s.media = {image: '/api/game/rooms/CODE/qr.png', r: 6, c: 26, w: 13, h: 10}
   - 601: live round
   - 602: reveal
   - 603: leaderboard

RULES THAT MATTER
- Never invent a number. Assumptions (stub driving speed, 3 min per change) are written in game/README.md.
- Everything runs on the website. Players only need a phone browser; no installs.
- Test a full 3-round game in two browser windows (one at 360 px wide) before calling it done.

STATUS UPDATES (at 16:20 and when done), written for the human to pass on:
- what works and what doesn't
- how to run it
- commits pushed
- which journeys are most fun for the demo video
```

---

## Agent 1 — hosting, Snowflake, integration, demo (only if this role moves into JetBrains Air)

```text
You are Agent 1 of 3 building "Londonfax" at KCL Tech First Year Hack today (London), running in JetBrains
Air on the HOSTING Mac. Open the folder ~/Downloads/londonfax. It is a clone of
https://github.com/R1shik123/KCLHACK_DRATSQUAD (main) and already contains .venv/ and .secrets/ (the
Snowflake private key). Never upload either. Read docs/TEAM.md first.

DEADLINES (London time): integrate by 16:45 · freeze 17:00 · demo recorded by 17:15 · submit by 17:30 · hard stop 18:00.

YOU OWN: server.py, snow/, index.html, style.css, js/app.js, js/pages.js, js/data.js, js/teletext.js,
requirements.txt, README.md, DEVPOST.md, demo/, docs/

UPLOAD: same repo, branch main, only your paths:
  git add <your paths> && git commit -m "host: ..." && git pull --rebase --autostash origin main && git push origin main
Pull every 15 minutes to pick up Agents 2 and 3. Never force-push.

DO:
1. Run the main server on port 8765 (.venv/bin/python server.py) and give phones a public HTTPS link with a
   Cloudflare quick tunnel (cloudflared tunnel --url http://localhost:8765); eduroam blocks phone-to-laptop.
2. Snowflake: once the human has run snow/setup.sql, write SNOWFLAKE_ACCOUNT=<orgname-accountname> to .env and
   check GET /api/snowflake. The server logs TfL line status every 2 min. POST /api/briefing uses Cortex.
3. Existing pages:
   - remove the First Year Hack page 199 and the "hacking ends" countdown on 101
   - make 199 a "DATA CHECK" page: each feed's freshness and record count
   - walking times x1.3 (real routes vs straight line)
   - departure countdowns tick every second
   - camera "updated" time taken from the clip
   - weather labelled as a model estimate for the Strand
   - tagline must not say "Live London"
4. Home page: Game Mode (600) and Control Room (800) as the two big flagship entries, plus big buttons
   outside the TV linking to /play and /control.
5. README: add the credit "Road traffic simulation adapted from t-strachota/livelondon, used with the
   author's permission". DEVPOST.md: describe both modes and the accuracy answer.
6. Record the narrated demo (demo/record_demo.py) at about 17:00: start a Control Room scenario a few minutes
   before. Upload the video (YouTube unlisted, or a public Drive link) for the submission.
7. Submit at mlh.link/first-year-hack with the repo URL and the demo link by 17:30.
```
