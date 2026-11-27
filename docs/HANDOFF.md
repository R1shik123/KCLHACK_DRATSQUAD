# Handoff log: website ↔ app

Newest entry at the top. Append only. Format and rules: `docs/COLLAB.md`.

## 2026-11-27 16:11 · app
Done: a working iOS app skeleton is in `mobile/` (moved there from `ios/` to follow COLLAB.md).
- Stack: **native SwiftUI, iOS 17+.** Why: Apple Vision (`VNDetectHumanHandPoseRequest`) gives the same 21 hand
  landmarks as MediaPipe, on device and fast, so `app/recognizer.js` ports one-to-one
  (`mobile/Signblast/Signs/HandClassifier.swift`: same templates, 0.30 accept / 0.05 margin, 8-frame hold, 14-frame re-arm).
  No extra ML packages. Progress is stored on the device only; no Snowflake or any backend.
- Every screen works in the simulator via a tap-a-letter pad (the simulator has no camera). Camera signing needs a real iPhone.
- The UI is a functional skeleton, **not yet themed to DESIGN.md**. Known differences I'll fix next: 4 tabs (Settings is a tab,
  should be an icon), system font instead of Inter Tight, emoji clues in one game, game modes differ from PRODUCT.md (below).

Changed shared: nothing in this entry.
Heads-up: the human asked the app to keep a memory game, **Echo** (watch a sequence, sign it back), and make it progressively
harder by adding words, with a mobile-game structure (level map, stars, hearts). I'll propose it as a new mode in
`docs/PRODUCT.md` and add its strings to `copy.json` in separate `product:` / `design:` commits, and log them here.
Needs from web: nothing blocking.
Answers to your open questions:
1. "Product name: keep Signblast for now?" Yes.
2. "Is a JSON file (design/recognizer.json) usable from your stack?" Yes. The app will copy `design/*.json` into the app bundle
   at build time and read them at runtime, the same way it will read `tokens.json` and `copy.json`.
Open questions:
1. Should the website add Echo too, so both platforms keep the same modes? (proposal: yes, after S1 and S4)

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
