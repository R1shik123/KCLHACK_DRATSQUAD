# Londonfax: Devpost submission text

**Tagline:** Teletext, rebuilt as a live London travel tool. Retro on the outside, genuinely useful inside.

**Track:** Retro Remix (Old Tech, New Tricks)

## Inspiration
Before apps, Britain checked the trains and the weather on teletext: chunky coloured text pages, found by typing a three-digit number on the TV remote. It was switched off in 2012. We wanted to bring back its look and feel, but make it something you'd actually open before leaving the house in 2026.

## What it does
Londonfax is a working teletext service for getting around London, powered by live TfL data:
- **Near Me (110):** shares your location and lists the nearest stations with walking times, bus stops and their routes, cycle hire docks and traffic cameras. Every line is clickable
- **Live buses (150):** arrivals for any stop. Tap one nearby, or search the 5-digit code on any bus stop sign
- **Any station (330):** search any Tube, Elizabeth line, Overground, DLR or tram station for live departures from every platform
- **Line status (300/310):** every Tube line plus the Elizabeth line, Overground, DLR and trams, with full disruption details
- **Cycle hire (450):** live bikes, e-bikes and free spaces at the nearest docks
- **Traffic cameras (500–599):** the 99 TfL cameras nearest to you, each playing its latest live video clip. Press REVEAL to redraw the view as 1980s teletext block graphics
- **Weather (400)** and the **First Year Hack schedule (199)** with a live countdown

It still behaves like real teletext: type a page number and the header rolls through pages until yours "arrives", with Fastext colour keys, HOLD, REVEAL, flashing alerts and rotating subpages, on a CRT TV with a remote. It also works on a phone, and every page has a shareable link.

## How we built it
Plain HTML, CSS and JavaScript, with no build step and no API keys. We wrote a small teletext engine: a 40 × 25 grid in the eight broadcast colours, with double-height and flashing text, 2 × 3 block graphics and clickable row links, drawn on a canvas behind CRT scanlines. Live camera video plays in a layer exactly aligned to the teletext grid. Data comes from the TfL Unified API (status, arrivals, nearby stops, search, BikePoint, JamCams) and Open-Meteo. Station "hubs" like Paddington are expanded into their Tube and Elizabeth line platforms so one search shows everything.

## Challenges
- Our first version only showed cameras as block-graphic art. It looked retro but wasn't useful, so we made live video the default and moved the art behind REVEAL.
- Making real photos readable in 8 colours. Full-colour dithering turned grey streets into rainbow noise, so we switched to brightness-only dithering with selective colour.
- Fitting long TfL disruption notices into 38 characters with word wrap and rotating subpages.

## What we learned
How teletext really worked, how TfL's open data fits together (stops, hubs, platforms, arrivals), geolocation in the browser, and image dithering.

## What's next
Journey planning between two places, saved favourite stops, push alerts when your line is disrupted, and a Snowflake-backed archive of the day's disruptions.

## Built with
html, css, javascript, canvas, tfl-api, open-meteo, geolocation, playwright

**Credits:** Powered by TfL Open Data. Weather by Open-Meteo.com (CC BY 4.0).
