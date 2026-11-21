# Londonfax

**Teletext, rebuilt for 2026.** London's transport, live, in 40 columns and 8 colours, plus two flagship modes:

- **Game Mode (page 600, `/play`)**: a 1v1 London knowledge game played on your phones. Both players get the same real journey and make 2 secret edits; every minute slower is a point, and making it faster by accident costs points. Times come from TfL's own Journey Planner.
- **Control Room (page 800, `/control`)**: close a road and see the simulated knock-on effect on London's traffic, with every figure labelled as an estimate, costs given as ranges, and the method on page 803.

Built for the **Retro Remix** track at KCL Tech First Year Hack (and MLH Best Use of Snowflake).

## Everyday pages
| Page | What's on it | Source |
|---|---|---|
| 101 | London now: weather, Tube problems, next trains from Temple | TfL, Open-Meteo |
| 110 | Near Me: nearest stations (walk times), bus stops, cycle docks, camera | TfL |
| 150 | Live bus arrivals for any stop (search its 5-digit code) | TfL |
| 199 | **Data Check**: every feed's freshness, plus today's disruptions **queried from Snowflake** | TfL, Snowflake |
| 300 / 310 | Tube, Elizabeth line, Overground, DLR and tram status with full details | TfL |
| 320–325, 330 | Live departures (preset stations, or any station you search) | TfL |
| 400 | Weather (model estimate for the Strand) and 5-day forecast | Open-Meteo |
| 450 | Santander Cycles: bikes, e-bikes and free spaces nearby | TfL |
| 500–599 | The 99 nearest TfL traffic cameras, each with its latest live video clip (REVEAL = teletext art) | TfL JamCams |

Click any line or page number, search stations, roads or bus stop codes, use **Near Me**, or type page numbers on the remote like it's 1985.

## Is it accurate?
- Live data is shown exactly as TfL and Open-Meteo publish it, with its time on screen. Countdowns tick from TfL's own predictions.
- Page 199 shows each feed's freshness. Every TfL line-status report is **archived in Snowflake every 2 minutes**, an audit trail of exactly what TfL said and when.
- Game Mode times come from TfL's Journey Planner, plus a fixed, documented 3 minutes per change, applied equally to every route.
- Control Room is a **simulation**: labelled SIMULATED/EST, with assumptions and ranges on page 803.
- Approximations are stated: walking time = straight-line distance × 1.3 at 80 m/min; weather is a model estimate.

## Snowflake
A key-pair service user (no password) writes to three tables: `LINE_STATUS` (TfL audit log), `GAME_RESULTS`
(all-time leaderboard) and `SCENARIOS`. Page 199 and `/api/disruptions/today` query today's disruptions from it with SQL.
Snowflake's AI functions are blocked on trial accounts, so Control Room briefings use a plain template instead.
Setup: run `snow/setup.sql` as ACCOUNTADMIN, put `SNOWFLAKE_ACCOUNT=<org-account>` in `.env`, and keep the private key in `.secrets/`.

## Run it (hosting Mac)
```bash
cd londonfax
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python server.py                      # http://localhost:8765
~/.local/bin/cloudflared tunnel --url http://localhost:8765   # public HTTPS link for phones
```
Optional `.env` (never committed): `TFL_APP_KEY=` (free from api-portal.tfl.gov.uk; avoids TfL's shared rate limit) and the Snowflake settings above.
The server publishes only `/`, `js/`, `play/`, `control/` and `/api/*`; secrets and source are never served.
Control Room's road engine has its own setup: see `roads/README.md`.

## How it's built
- `js/teletext.js`: 40×25 teletext engine (8 colours, double height, mosaics, clickable rows, live video layer)
- `js/data.js`, `js/pages.js`, `js/app.js`: live feeds, pages, navigation, search, Near Me
- `server.py`: FastAPI site + APIs; `tfl.py`: shared cached TfL client; `snow/`: Snowflake
- `game/`, `play/`, `js/pages-game.js`: Game Mode
- `roads/`, `control/`, `js/pages-control.js`, `vendor/livelondon/`: Control Room

## Credits
- **Road traffic simulation adapted from [t-strachota/livelondon](https://github.com/t-strachota/livelondon), used with the author's permission** (approved by the event admins).
- Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016, and Geomni UK Map data © and database rights 2019.
- Weather by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
- Built with JetBrains tools and Claude.
