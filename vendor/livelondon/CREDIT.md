# Credit

Road traffic simulation adapted from **t-strachota/livelondon**
(https://github.com/t-strachota/livelondon), used with the author's permission.
Reuse approved by a KCL Tech First Year Hack admin.

- Vendored from commit `a964acd20c32b4ba97b7bf1f34b7bd694b218470` (21 Nov 2026).
- Removed: the upstream `.git` folder, the committed `.env` (deleted unread; never used) and three screenshots.
- Changed: `sim/config.json` `network.source` now points at Geofabrik's current Greater London path
  (`.../england/greater-london/greater-london-latest.osm.pbf`); the old URL no longer resolves.
- Londonfax uses only the road-network builder (`build_roads.py`, `sim/roads.py`) to produce
  `data/network/roads.json` (not committed). Routing and the Control Room model are Londonfax's own
  Python code in `roads/`. The Node engine (`server.mjs`) is included unmodified but not run.

Map data © OpenStreetMap contributors (ODbL), via Geofabrik.

## Changes made for Londonfax
- Removed the original author's hard-coded TomTom and MapTiler browser keys from `public/config.js` and `public/app.js` (not redistributed; Londonfax does not use this frontend).
