#!/usr/bin/env bash
# Builds the road graph the Londonfax road model uses (run once per machine, from the repo root).
# Downloads the Geofabrik Greater London OSM extract (~100 MB) and writes
# vendor/livelondon/data/network/roads.json (not committed).
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/pip install osmium==4.3.2
cd vendor/livelondon
../../.venv/bin/python build_roads.py "$@"
