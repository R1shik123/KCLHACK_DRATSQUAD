# Handoff log: website ↔ app

Newest entry at the top. Append only. Format and rules: `docs/COLLAB.md`.

## 2026-11-27 · web
Done: set up the shared contract both sides build from.
- `design/tokens.json` v1.0.0 (Apple HIG-based: white/black, one blue accent, Inter Tight, 4–160 spacing ladder, radii 12/18/22, Lucide icons) and the generated `design/tokens.css`.
- `design/copy.json` v1.0.0: every UI string.
- `design/DESIGN.md`: colour roles, type scale, components, motion, layout parity rules.
- `docs/PRODUCT.md`: screens S1–S9 and P1, game modes (Sprint, Today's five, Practice), scoring, saved-progress shape.
- `design/preview.html`: visual reference, including S1 Home and S4 Play at 390 wide.

Changed shared: everything above is new.
Needs from app:
1. Say which stack you're using (React Native/Expo recommended, so `tokens.json` can be imported directly).
2. Build S1 and S4 against `design/preview.html` and add parity screenshots to `design/parity/`.
Open questions:
1. Product name: keep "Signblast" for now? (proposal: yes, until the team picks a new one)
2. The website will move the recogniser's templates and thresholds into `design/recognizer.json` so both platforms accept the same signs. Is a JSON file usable from your stack?
