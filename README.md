# Londonfax

**Teletext, rebuilt as a live London travel tool.** Retro on the outside, genuinely useful inside.

Built for the **Retro Remix** track at KCL Tech First Year Hack: *take something old and rebuild it for 2026.*

Teletext (1974–2012) put news, travel and weather on every TV as pages of 40 × 25 coloured characters, chosen by typing a three-digit page number on the remote. Londonfax keeps that look and feel, and fills it with live data you can actually use to get around London today.

## What you can do with it

| Page | What's on it | Live source |
|---|---|---|
| **110 Near me** | Uses your location to list the nearest stations (with walking times), bus stops and their routes, cycle hire docks, and the nearest traffic camera. Every line is clickable | TfL |
| **150 Bus stop** | Live bus arrivals for any stop. Click one on page 110, or search the 5-digit code printed on every London bus stop sign | TfL |
| **330 Any station** | Search any Tube, Elizabeth line, Overground, DLR or tram station for live departures from every platform | TfL |
| 320–325 | Quick boards for Temple (KCL Strand), Embankment, Waterloo, King's Cross, Oxford Circus and Bank | TfL |
| 300 / 310 | Status of every Tube line, plus the Elizabeth line, all six Overground lines, the DLR and trams, with full disruption details on subpages | TfL |
| **450 Cycle hire** | The nearest Santander Cycles docks, with live bikes, e-bikes and free spaces | TfL |
| **500–599 Traffic cameras** | The 99 TfL cameras nearest to you, each playing its latest **live video clip**. Search any road to jump to cameras there | TfL JamCams |
| 400 | Weather now, a 12-hour chart and a 5-day forecast | Open-Meteo |
| 101 | London now: one-page summary | all |
| 199 | First Year Hack schedule with a live deadline countdown | built in |

## How to use it
- **Click anything.** Every listed station, stop, camera and page number on screen is a link. The coloured bar at the bottom is clickable too.
- **Search** (or press `/`): a station name, a road name, or a 5-digit bus stop code.
- **◎ Near Me** uses your phone's or laptop's location. If you decline, it uses KCL Strand.
- **Share a page:** the address updates as you go, e.g. `#150:490008932T:Lancaster Place` reopens that bus stop.
- **Or use it like 1985:** type a page number on the remote or keyboard and watch the header roll.

| Key | Does |
|---|---|
| `1`–`9`, `0` | Type a page number (100–899) |
| `R` `G` `Y` `C` | Fastext red / green / yellow / cyan |
| `V` | Reveal: on a camera page, swap the live video for a teletext block-graphics version |
| `H` | Hold (stop subpages rotating) |
| `←` `→` | Previous / next subpage |
| `I` | Index (page 100) |
| `/` | Jump to search |

## The retro part
- A 40 × 25 grid in the 8 broadcast teletext colours, double-height and flashing text, and 2 × 3 block "mosaic" graphics
- The header counter rolls through page numbers while your page is "found", like the real thing
- Fastext colour keys, HOLD, REVEAL and rotating subpages
- A CRT television and a remote you can click, with full phone support
- REVEAL on a camera redraws the live view as teletext art, converted in the browser using auto-levels, 1-bit dithering and selective colour

## Run it
No build step, no API keys, no dependencies.

```bash
cd londonfax
python3 -m http.server 8765
```

Open http://localhost:8765. It's a static site, so it can go on GitHub Pages as is. Near Me needs `localhost` or HTTPS for the browser to allow location.

## How it's built
- `js/teletext.js`: the teletext engine. 40 × 25 cells, a canvas renderer (shown 4:3 with pixelated scaling and CRT scanlines), clickable row links, a picture-to-mosaic converter, and big block-graphic headlines.
- `js/data.js`: keyless feeds with short caches. TfL Unified API (line status, arrivals, nearby stops, search, BikePoint, JamCams) and Open-Meteo. Station "hubs" such as Paddington are expanded into their Tube and Elizabeth line platforms.
- `js/pages.js`: one builder per page, returning subpages, links and Fastext.
- `js/app.js`: navigation, the rolling search, live video over the grid, click handling, search, Near Me, shareable links, refresh timers, remote and keyboard.
- `demo/record_demo.py`: records the narrated demo with Playwright and Chrome, macOS `say` and ffmpeg.

## Data and credits
- Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016, and Geomni UK Map data © and database rights 2019.
- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
- Idea sparked by OxHack 2026 winner Live London, which also used TfL's live feeds. Londonfax's code is new.

## Demo video
`demo/londonfax-demo.mp4`, 1 minute 25 seconds with narration. To re-record it: start the server, then run `python demo/record_demo.py`. This needs `pip install playwright imageio-ffmpeg` and Google Chrome.
