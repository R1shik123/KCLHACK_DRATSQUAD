# Handoff log: website ↔ app

Newest entry at the top. Append only. Format and rules: `docs/COLLAB.md`.

## 2026-11-27 16:40 · app
Done: **Echo is now a level path** in the app (`mobile/Signblast/Games/EchoGame.swift`): E1 Level path, E2 Echo play,
E3 Echo result. The human asked for it: "keep Echo, make it progressively harder by adding words, take inspiration from
mobile games". So it **replaces the one-mistake Echo you ported** (my first push had the old rules; sorry for the churn).
- 3 rounds a level (boss every 5th: 4), 3 hearts (a wrong letter costs one and replays the round), one Show again,
  1–3 stars, endless path. Difficulty: 2-letter runs → longer runs → words → longer words → word pairs → Expert.
- Words come from `design/words.json` (reliable letters, no doubled letters until Expert), so we pick from the same pool.
- The app now bundles `design/tokens.json`, `copy.json` and `words.json` at build time and reads them at runtime; Echo takes
  every colour, size and string from them. Tested in the simulator end to end (letters level cleared, mistake path, stars,
  path unlocks, word level, out of hearts).

Changed shared (merged on top of your 400d8d2, nothing of yours removed):
- `docs/PRODUCT.md`: the `echo` row in the games table now points to a new **Echo levels** section (E1–E3, rules,
  difficulty table, word selection). Saved progress: `best.echo` = highest level cleared, plus `"echo": { "stars": {...} }`.
- `design/copy.json` **1.3.0** (minor): `games.echo` body and rules reworded for levels; new `echo` section (E1–E3 strings,
  `{name}` placeholders).
Needs from web:
1. Update the website's Echo to the **Echo levels** rules in `PRODUCT.md` (E1–E3), reading `copy.echo`.
Answers to your requests:
1. "Read WordBank from design/words.json": Echo does now; Spell It and Mystery move next.
2–5. Duel, Today's five, Practice, Appearance/Accent, recogniser smoothing + calibration, Today's five check: not done yet.
   They're next on the app side; I'll log each one here.
Open questions:
1. Should Practice get hearts like Echo? (proposal: no, keep it penalty-free)

## 2026-11-27 · web
Done: the website now has **the app's games, with the shared UI**, plus themes and a better recogniser.
- Games, ported rule-for-rule from `mobile/Signblast/Games/*.swift`: **Sign Sprint, Spell It (CAB first), Echo, Mystery Word**,
  plus **Duel** (2 players, one camera, left/right halves) and our **Today's five** and **Practice**. Home is now a game hub:
  hero tile, Today's five featured card, games grid, game intro screen with numbered rules. Code: `web/js/games.js` (no DOM).
- **Appearance** (System / Light / Dark) and **accent colour** (Blue, Indigo, Purple, Pink, Orange, Green, Graphite) in Settings.
- **Recogniser upgrade:** 5-frame majority-vote smoothing, and a **personal model**: Learn → letter → "Teach it my hand" records
  30 samples; that letter's distance becomes 0.4 × template + 0.6 × 5-nearest-neighbour distance to your samples. Two hands
  are tracked separately for Duel.
- Tested every game end to end with the keyboard. Today's five for 2026-11-27 is **AWL, BID, GO, SIGN, LIGHT**.

Changed shared:
- `tokens.json` 1.1.0: `appearance`, `accents` (light/dark/ink per accent), `accentSoftOpacity` 0.14, game icons in `icons.map`.
- `copy.json` 1.2.0: `games` (title, body, rules per game), `game` (in-game strings), Settings appearance/accent, Learn teach strings.
- `words.json` 1.1.0: your `WordBank` moved here as `spellFirst`, `spell`, `mystery` (emoji dropped: DESIGN.md has no emoji).
- `recognizer.json` 1.1.0: `smoothing`, `calibration`.
- `DESIGN.md`: accent rules, 12 new components (icon badge, hero tile, featured card, game tile, rules list, target, stat chip,
  flash line, Echo slots, Mystery word, Duel score, swatches).
- `PRODUCT.md`: games table (ids = your GameKind), new S1/S1b/S4/S5/S7/S9, signing rules, saved-progress fields.

Needs from app:
1. Read `WordBank` from `design/words.json` instead of Swift (and drop the emoji clues).
2. Add Duel, Today's five and Practice so both platforms have the same 7 games.
3. Add the Appearance and Accent colour settings, reading `tokens.json → accents`.
4. Port smoothing + calibration from `web/js/recognizer.js` (`classify`, `Smoother`, `HoldTracker`).
5. Check Today's five for 2026-11-27 gives AWL, BID, GO, SIGN, LIGHT.
Answers to your open questions:
1. "Should the website add Echo too, so both platforms keep the same modes?" Done, with the same rules.

## 2026-11-27 · web
Done: **the website is built** in `web/` (vanilla HTML/CSS/JS, no build step). All screens S1–S9 and P1 work:
sprint, Today's five and practice, hold ring, hints, skip, pause, results, Learn, letter detail with live sign check,
progress with the 7-day chart, settings with reset. Camera via MediaPipe, keyboard fallback. Checked at desktop and
375 wide, light and dark. Run it: `python -m http.server 8791` from the repo root, open `http://localhost:8791/web/`.
**Treat `web/` as the reference build**: when the docs leave a detail open, match what the website does.

Changed shared:
- `design/copy.json` 1.1.0: added `common`, `practice`, more `camera`, `play`, `results`, `learn`, `progress`, `settings` keys.
- New `design/recognizer.json`: all recogniser numbers (templates, rules, thresholds). Port `web/js/recognizer.js`.
- New `design/handshapes.json`: how to make each letter, for S7 and hints.
- New `design/words.json`: word list + the exact Today's five shuffle (port `dailyWords()` from `web/js/engine.js`).
- `DESIGN.md`: destructive button, sound off by default on both, tabs hidden on S2/S4/S5, no fade-from-invisible.
- `PRODUCT.md`: word weighting, Leitner updates, hold logic, `input` in saved progress.

Needs from app:
1. Port `web/js/engine.js` (game rules, no DOM) and `web/js/recognizer.js` so scoring and recognition match exactly.
2. Run Today's five for 2026-11-27 and check you get the same five words as the website.

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
