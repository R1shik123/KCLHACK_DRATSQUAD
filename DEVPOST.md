# Londonfax: Devpost submission text

**Tagline:** Teletext, rebuilt for 2026: live London transport, a 1v1 phone game, and a road-closure Control Room.

**Track:** Retro Remix (Old Tech, New Tricks) · also entering MLH Best Use of Snowflake

## Inspiration
Before apps, Britain checked trains and weather on teletext: chunky coloured pages found by typing a three-digit
number on the TV remote. We rebuilt it faithfully, then asked what teletext would be if it were invented today:
live, social and useful for decisions.

## What it does
- **Live London in 40 columns:** Tube, Elizabeth line, Overground, DLR and tram status; live departures for any
  station; bus arrivals by stop code; Santander Cycles; weather; and 99 TfL traffic cameras playing live video.
  Near Me uses your location. Everything is clickable and searchable, and it works on a phone.
- **Game Mode (flagship):** a 1v1 London knowledge game on two phones. Both players get the same real journey and
  secretly make 2 edits (take a bus instead, change at a different station). Times stay hidden until the reveal.
  Every minute slower scores a point; making it faster by accident costs points. 3 rounds, then a leaderboard
  stored in Snowflake.
- **Control Room (flagship):** close a road and watch the simulated knock-on effect: slowed roads, extra delay and
  a cost range, with the method and assumptions on page 803.
- **Data Check (page 199):** freshness of every feed, and today's disruptions queried live from Snowflake.

## How we built it
- **The site:** a teletext engine in plain JavaScript (40×25 grid, 8 colours, mosaic graphics, double height, Fastext) behind a FastAPI server.
- **TfL data:** all TfL calls go through one cached client, so a room full of hackers sharing one IP doesn't exhaust the rate limit.
- **Game Mode:** times come from TfL's Journey Planner, with a different mode filter per leg to generate real alternatives. The server validates every edit and computes every time.
- **Control Room:** built on an open-source London traffic simulation (credited, used with permission), wrapped in our own API with ranges and honest labels.
- **Snowflake:** a key-pair service user logs every TfL status report every 2 minutes as an audit trail, stores game results, and serves today's disruption history with SQL.

## Challenges
- Making it accurate enough to defend: we show provider data unchanged with timestamps, label simulations, give ranges instead of single numbers, and archive TfL's reports so we can prove what was shown when.
- TfL's anonymous rate limit at a busy venue: solved with a shared cache and proxy.
- Snowflake AI functions are blocked on trial accounts, so we used Snowflake for storage, auditing and SQL analytics instead.
- Keeping the game skill-based: hidden times and only server-validated options.

## What we learned
How teletext really worked, TfL's open data model (stops, hubs, platforms, journeys), Snowflake key-pair auth and
SQL analytics, and how to coordinate three AI coding agents on one codebase.

## What's next
Journey planning with live disruption avoidance, alerts for your lines, a 4-player Game Mode, and AI-written
Control Room briefings once Snowflake AI is enabled on a full account.

## Built with
javascript, python, fastapi, snowflake, tfl-api, open-meteo, canvas, cloudflare-tunnel, jetbrains, claude

**Credits:** Road simulation adapted from t-strachota/livelondon (with the author's permission). Powered by TfL Open Data. Weather by Open-Meteo.com (CC BY 4.0).
