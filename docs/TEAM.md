# Londonfax — team plan (read this first)

Three agents build in parallel. **Agent 1** runs on the hosting Mac (server, phone access, Snowflake,
existing pages, integration, demo). **Agent 2** builds the road-traffic engine and Control Room
(`docs/AGENT-2-ROADS.md`). **Agent 3** builds 1v1 Game Mode (`docs/AGENT-3-GAME.md`).

## Competition rules (KCL Tech First Year Hack) — non-negotiable
1. **Build with JetBrains Air (required).** Run each agent session inside JetBrains Air and make commits from there. If an agent can't run in Air, ask an organiser before relying on it.
2. Teams of up to 3 people.
3. **All project work happens today.** Reused third-party code is allowed only because an admin approved it, and it must be credited (see "Credit" below).
4. Any language, framework or API.
5. MLH Code of Conduct: mlh.io/code-of-conduct.
6. **Draft by 17:30, hard deadline 18:00** (late entries aren't judged). Submit at mlh.link/first-year-hack: team, project name, **repo**, **demo**.
7. Tracks: Creative Tech, Retro Remix (ours). Extra: MLH Best Use of Snowflake.

## Product rules
- **Everything runs on the website.** The TV view, Control Room and the players' game controls are all web pages served by one server. Phones join by opening a URL / scanning a QR code. No app installs.
- **Never invent a number.** Live data comes from the provider's feed and shows its source and time. Anything modelled or simulated is labelled `SIMULATED` / `ESTIMATE`, shows its assumptions, and is given as a range where the assumption is uncertain.
- **On screen, never mention "Live London".** Brand is Londonfax.
- **Credit (required, README only):** "Road traffic simulation adapted from t-strachota/livelondon, used with the author's permission." Hiding reused code would break the competition rules and MLH's honesty expectations.
- Teletext look for TV pages (40×25, 8 colours). Phone UIs are modern, clean and legible, with teletext colours as accents.

## Timeline (London time, today)
| By | Milestone |
|---|---|
| 15:40 | Plans read, branches created, agents started |
| 16:20 | Each feature works end to end on its own (with stubs where needed) |
| 16:45 | Merged into `main`, running on the hosting Mac, reachable from a phone |
| 17:00 | **Feature freeze.** Only bug fixes after this |
| 17:15 | Demo video recorded (Agent 1) |
| 17:30 | Draft submitted (repo + demo) |
| 18:00 | Hard deadline |

## Ownership (only edit your own paths)
| Path | Owner |
|---|---|
| `server.py`, `snow/`, `index.html`, `style.css`, `js/app.js`, `js/pages.js`, `js/data.js`, `js/teletext.js`, `README.md`, `DEVPOST.md`, `demo/` | Agent 1 |
| `vendor/livelondon/`, `roads/`, `control/`, `js/pages-control.js` | Agent 2 |
| `game/`, `play/`, `js/pages-game.js` | Agent 3 |

Need a change in someone else's file? Ask the owner (through the human) with the exact change.

## Git workflow
Repo: **https://github.com/R1shik123/KCLHACK_DRATSQUAD** (branch `main`). Agents 2 and 3 share one
IntelliJ / JetBrains Air project folder on one laptop; Agent 1 works in its own clone on the hosting Mac.
- **Stay on `main`. Never** run `git checkout`/`switch` (to another branch), `stash`, `reset --hard`,
  `clean` or `restore` on paths you don't own. In a shared folder they change files under the other agent's feet.
- **Commit only your own paths:** `git add game/ play/ js/pages-game.js && git commit -m "..."`.
  Never `git add -A`, `git add .` or `git commit -a`.
- **Push your commits** so the hosting Mac can pull them, at least every 30 minutes and at 16:20:
  `git pull --rebase --autostash origin main && git push origin main`. If the push is rejected, run the same command once more. **Never force-push.**
- Leave `src/Main.java`, `.idea/` and `KCLHACK_DRATSQUAD.iml` (the original IntelliJ project files) alone.
- Commit small and often, with clear messages ("game: reveal screen").
- Never commit `.env`, `.secrets/`, `.venv/`, `node_modules/`, `vendor/livelondon/data/` or anything with a key in it (`.gitignore` covers these; check `git status` before committing).
- Shared Python environment: use the existing `.venv` and only *add* packages (`.venv/bin/pip install x`), never recreate it. Record any package you add in `requirements.txt` (Agent 1 owns it; tell Agent 1).
- **Ports on this machine:** Agent 1's main server 8765 · Agent 2 dev server 8766 and road engine 3000 · Agent 3 dev server 8767.

## Running the project
```bash
cd londonfax
python3 -m venv .venv && .venv/bin/pip install fastapi "uvicorn[standard]" httpx qrcode snowflake-connector-python cryptography
.venv/bin/python server.py --port 8765        # http://localhost:8765
```
`server.py` (FastAPI) serves the site and mounts `game/api.py` (`router`, prefix `/api/game`) and
`roads/api.py` (`router`, prefix `/api/roads`) if they exist. Use your own port while developing.
Agent 1 exposes the final server to phones with a Cloudflare quick tunnel (public HTTPS URL), because
eduroam blocks phones from reaching a laptop directly. **Build join links from `location.origin`,
never a hard-coded host.**

## Shared contracts
### Teletext pages (TV view)
Register pages without touching `js/pages.js`:
```js
// js/pages-game.js or js/pages-control.js (plain script, loaded before js/app.js)
window.LFExtra[600] = async (data) => {
  const s = new TT.Screen();
  s.band(1, 'B', 2).text(1, 1, 'GAME MODE', { fg: 'Y', bg: 'B', dh: true }); // dh = double height
  s.text(4, 1, 'SCAN TO PLAY', { fg: 'C' });
  s.link(4, 601);                    // row 4 is clickable -> page 601
  s.tick = (sc) => { /* called ~20x/s for live rows */ };
  return { subs: [s], fastext: [{ label: 'INDEX', page: 100 }], refresh: 5000 };
};
```
- Screen API: `text(r,c,str,{fg,bg,dh,flash})`, `center`, `right`, `band(r,bg,rows)`, `fill`, `banner(r,c,w,h,str,{fg,bg})` (big block letters), `image(r,c,w,h,canvas)`, `link(r, pageOrObj)`, `media` (live video/image over the grid), `tick`.
- Colours: `K R G Y B M C W`. Rows 1–23 are yours. Row 0 (header) and row 24 (Fastext) are drawn by the app.
- Page numbers: **600–609 Game Mode**, **800–809 Control Room**, 199 Data Check (Agent 1).
- `LFData`, `LFPages.london()` and `TT.wrap(text, width)` are available.

### Server APIs
| Endpoint | Owner | Purpose |
|---|---|---|
| `POST /api/briefing` | Agent 1 | Snowflake Cortex turns Control Room numbers into a 3-sentence briefing. Body: `{title, closures:[str], metrics:{...}, assumptions:{...}}` → `{text, model, source}`. `source` is `snowflake-cortex` or `fallback` |
| `GET /api/leaderboard` | Agent 1 | All-time Game Mode leaderboard from Snowflake |
| `snow.client.save_game_result(player, round_no, origin, destination, base_minutes, new_minutes, points, room, detail)` | Agent 1 | Python helper; does nothing safely if Snowflake isn't set up |
| `GET /api/roads/drive?from=lat,lon&to=lat,lon` | Agent 2 | Driving time on the road graph → `{minutes, km, roads:[names], method, simulated:true}` |
| `/api/roads/*` (see Agent 2 plan) | Agent 2 | Control Room: close roads, stop lines, impact |
| `/api/game/*` (see Agent 3 plan) | Agent 3 | Rooms, rounds, edits, scoring |

## What the server publishes (security)
`server.py` serves ONLY: `/`, `/index.html`, `/style.css`, `/js/`, `/play/`, `/control/`, and `/api/*`.
Everything else (`.env`, `.secrets/`, `.git/`, Python source, docs) returns 404. If you need another
public folder, ask Agent 1 to add it to `PUBLIC_DIRS`. Never put secrets inside `js/`, `play/` or `control/`.
The server listens on 127.0.0.1 only; phones reach the hosting Mac through the tunnel.

## TfL rate limit — read this
The venue's Wi-Fi gives every team one public IP, and TfL's no-key limit is per IP; we already hit
`429 Rate limit is exceeded`. So:
- **Server-side Python:** never call `api.tfl.gov.uk` directly. Use the shared client:
  `from tfl import get_json` then `data = await get_json("/Journey/JourneyResults/910GGODMAYS/to/940GZZLUSKS", {"mode": "tube,walking"}, ttl=300)`.
  It adds the team's TfL app key from `.env` (`TFL_APP_KEY=`), caches results and serves the last good copy on a 429.
- **Browser code:** fetch `/api/tfl/<path>` (same path and query as TfL), never TfL directly.
- Cache aggressively and precompute; never call TfL in a per-second loop.

## Snowflake status (tested 15:50)
Connected: the service user signs in with the key on the hosting Mac, and the tables `LINE_STATUS`,
`SCENARIOS` and `GAME_RESULTS` exist. **Snowflake AI functions (AI_COMPLETE etc.) are blocked on
trial accounts**, so `/api/briefing` currently returns `source:"fallback"` (a plain summary of the
numbers). Build the UI to show either.

## Accuracy answer (everyone must be able to say this)
"Live data is shown exactly as TfL and Open-Meteo publish it, with the time on screen. Page 199
shows each feed's freshness. Game journey times come from TfL's own Journey Planner. Road traffic is
a **simulation**, clearly labelled, seeded from live traffic speeds, with its assumptions shown on
page 803 as ranges. We log what TfL reported, every two minutes, to Snowflake as an audit trail."
