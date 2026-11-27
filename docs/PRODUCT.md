# Sign Max product spec (website + app)

Both platforms build **the same screens, with the same names, the same flow and the same rules**.
How things look is in `design/DESIGN.md`; the words are in `design/copy.json`.

## The idea
Learn ASL fingerspelling by spelling real words with your hand. A word appears, you sign it letter by letter to the
camera, and each letter is accepted when you hold the right handshape. Clean and calm, not an arcade:
the challenge comes from the clock and your streak, not from things exploding.

## Navigation
Three tabs, always in this order: **Play · Learn · Progress**. Settings is an icon (top right), not a tab.

```
Play (Home) ──► Camera setup (first time only) ──► Play screen ──► Results ──► Play (Home)
Learn ──► Letter detail ──► Check my sign
Progress
Settings
```

## Screens
Use these IDs in code, file names and commit messages (e.g. `web: S4 hold ring`).

| ID | Screen | What's on it, top to bottom |
|---|---|---|
| **S1** | Home (Play tab) | Hero (eyebrow, headline, body + live hero tile) · featured card: Today's five · "Games" grid: Sign Sprint, Spell It, Echo, Mystery Word, Duel, Practice (icon badge, title, line, best) · streak |
| **S2** | Camera setup | Shown once before the first game, or if the camera is off. Camera icon, title, body (`copy.camera`) · primary "Allow camera" · text button "Use keyboard instead" |
| **S1b** | Game intro | Back · icon badge + title + best · description · numbered rules · options (Sprint: all 26 letters) · Start |
| **S3** | Practice setup | Letter tiles to choose from (multi-select, all on by default) · primary "Start" |
| **S4** | Game | Bar: game name, timer (Sprint, Spell It, Duel), pause · 3 stat chips · the game area (target / word / slots / mystery word / duel score) · flash line · camera frame with the reading pill · game buttons (Hint, Skip, Peek) |
| **S5** | Results | Game name · score in `display` (+ New best) · 3 stats for that game · detail lines (Echo sequence, Mystery word) · Practise next tiles · Play again / Done |
| **S6** | Learn | Eyebrow, title, body · letter grid (4 columns on phones, 6 on the website) |
| **S7** | Letter detail | Big letter tile with hold ring · badges (Mastered, Personalised) · how to make it · camera · "Check my sign" · "Teach it my hand" card (records 30 samples, Forget my samples) |
| **S8** | Progress | Stats row: Day streak, Letters mastered (x/26), Best sprint · last 7 days as a simple bar row · letter grid showing mastery |
| **S9** | Settings | Appearance (System/Light/Dark) · Accent colour swatches · Signing hand · Sign with (Camera/Keyboard) · Sound · Reset progress · privacy note |
| **P1** | Pause sheet | Resume (primary) · End game (text) |

## Games (same set on both platforms)
Ids match the app's `GameKind` and `copy.json` → `games`. Rules are ported one-to-one from `mobile/Sign Max/Games/*.swift`;
the website versions are in `web/js/games.js`.

| Id | Game | Rules |
|---|---|---|
| `sprint` | Sign Sprint | Single letters, 60 s. Reliable letters by default (option: all 26). +100 × multiplier per letter; multiplier = min(5, 1 + combo ÷ 3). A wrong stable sign resets the combo. 8 s per letter, then it's a miss. Hint after 3 s only if the letter's box ≤ 2 |
| `spell` | Spell It | Words, 90 s, first word always CAB, then `words.json → spell` shuffled. +50 per letter (+25 if hinted), +200 per word, 0.9 s pause after a word. Skip = miss on the current letter |
| `echo` | Echo | A level path: watch a sequence, sign it back from memory. Letters first, then words. 3 hearts and one Show again per level, 1–3 stars, boss every 5th level. Full rules in **Echo levels** below. Best = highest level cleared |
| `mystery` | Mystery Word | Hidden word + clue (`words.json → mystery`). Sign letters to guess, 6 wrong guesses per word. Solve = 100 + 20 × lives left. Game ends when a word isn't solved |
| `blast` | Signblast | The original falling-letters shooter, brought back at the human's request. Letters fall in 5 lanes; hold a sign to shoot the lowest matching one. 3 lives, levels, words. Full rules in **Signblast** below. Best = highest score |
| `duel` | Duel | Two players, one camera: Player 1 signs on the left half, Player 2 on the right. Same target for both; first to hold it gets the point. First to 10, or most after 60 s. Keyboard: P1 types, P2 holds Shift |
| `daily` | Today's five | Spell It rules on the 5 seeded words of the day, no clock, once a day |
| `practice` | Practice | Spell It rules on words made only of the letters you picked, no clock |

Flow: Home → game intro (rules, best, Start) → camera setup if not chosen yet → game → Results.

## Echo levels (replaces the one-mistake Echo)
Updated on 2026-11-27 at the human's request: "keep Echo, make it progressively harder by adding words, take
inspiration from mobile games". This replaces the earlier rules in the games table (one mistake ends it, one peek). Structure borrowed from mobile puzzle games
(a level path, stars, hearts, boss levels), styled with the same calm rules as everything else: no confetti, no red, no emoji.

**Screens:** E1 Level path · E2 Echo play · E3 Echo result. Navigation: Home → Echo tile → E1 (instead of S1b) → E2 → E3 → E2 (next level) or E1.

| ID | Screen | What's on it, top to bottom |
|---|---|---|
| **E1** | Level path | Eyebrow, title, body (`copy.echo`) · stats row: Stars, Best level · a winding path of level nodes grouped under stage headings. Cleared nodes show their stars, the next level uses `accent`, locked ones show a lock in `muted`, boss levels (every 5th) are larger with a crown icon |
| **E2** | Echo play | Top: hearts (3), "Round n of N", Show again (text button) · the sequence area: during Watch each item appears in `display`, one at a time; during Your turn, one slot per letter (done `ink`, current `accent` outline, upcoming `surface`) · camera frame |
| **E3** | Echo result | Eyebrow (Level cleared / Out of hearts) · level title · 3 stars · stats row: Hearts left, Show again used · primary "Next level" (or "Try again") · text "Play again" / "Back to path" |

**Rules**
1. A level has **3 rounds** (boss levels, every 5th: **4**). Each round: the items flash one at a time (a letter alone, a word whole), then the player signs every letter back in order, with the normal 8-frame hold.
2. **Hearts:** 3 per level. Signing a wrong letter costs a heart and replays that round from its start. No hearts left: the level is failed and can be retried.
3. **Show again:** once per level, replays the current round.
4. **Stars:** 3 = no heart lost and Show again not used; 2 = one of those; 1 = cleared otherwise. A level keeps its best stars.
5. Clearing a level unlocks the next. The path never ends: levels after 30 are generated with the Expert rules.

**Difficulty**
| Levels | Stage | Each round | Each item shows for |
|---|---|---|---|
| 1–5 | Letters | 2, 2, 3, 3 letters (boss 4) | 1.0 s |
| 6–10 | Longer letter runs | 4, 4, 5, 5 letters (boss 6) | 0.90 s, down to 0.76 s |
| 11–15 | Words | one 3-letter word (boss: two) | 0.5 s per letter, at least 1.2 s |
| 16–20 | Longer words | one 4–5-letter word (boss: two) | 0.45 s per letter |
| 21–25 | Word pairs | two 3-letter words (boss: three) | 0.45 s per letter |
| 26+ | Expert | two words of 3–5 letters, any letters (boss: three) | 0.4 s per letter, down to 0.3 s |

Words come from `design/words.json`. Until Expert, only words made of the reliable letters (`recognizer.json` → `solid`) with
no letter doubled in a row: Words and Word pairs use the 3-letter ones, Longer words the 4–6-letter ones. Expert uses any 3–5-letter
word. A word isn't repeated within a level. Letter runs use the reliable letters, weighted by the Leitner boxes like everything
else, and never repeat a letter twice in a row. Echo does not change Sprint scores.

**Saved:** add `"echo": { "stars": { "1": 3, "2": 2 } }` to saved progress (best stars per cleared level). Best level = the
highest cleared level.

## Signblast (the original game, back by request)
Added on 2026-11-27 because the human asked to "include the original space invasion game as well". It's the first Signblast
(`app/game.js`), ported to `web/js/blast.js`. The board keeps the original pixel-arcade look (Press Start 2P, dark grid,
invader-style blocks with little legs, green cannon, pink laser). That's a deliberate exception to the "no retro" rule in
`DESIGN.md`. Everything around the board (play bar, score chips, camera, results) uses the normal design system.

- **Levels** (8 hits clears one; the intro lets you start at any level): 1 Starter shapes `ABCDILVY` · 2 Open hands
  `FUWKRXO` · 3 Fists + sideways `ESTMNGHPQJZ` · 4 Speed A–Z (+8 speed) · 5 Words (`CAB` always first, then `HI NO YES BYE CAT
  DOG SUN FUN WOW LOVE HELP COOL NAME KIND PLAY SIGN`). Letter levels 1–3 add up (level 2 spawns from levels 1 and 2).
- **Spawning:** up to 2 + level letters on screen; one every clamp(110 ÷ speed, 1.4, 6) s, ×1.6 on the Words level. A free
  lane is preferred. The letter is picked Leitner-weighted (box 1→3, 2→2, 3→1.4, 4–5→1); a word weighs as its weakest letter.
- **Speed:** starts at 14 + 3 × (level − 1) (+8 on level 4), +3 on each level-up. Adaptive: every 5 outcomes, more than 80%
  hits gives ×1.1, under 60% gives ×0.9, clamped 8–45 px/s on a 240 × 300 board. Words fall at 0.75× speed.
- **Shooting:** a held sign (or a typed key) hits the lowest matching letter. No match: "No X on screen", nothing lost. A word
  is spelled letter by letter, +25 per letter; finishing a letter or word = +100 × multiplier, multiplier = min(5, 1 + combo ÷ 3).
- **Missing:** a letter that reaches the line costs a life, resets the combo and puts that letter back in box 1. 3 lives.
- **Hints:** once a letter is 60% of the way down, its `handshapes.json → short` text shows above it. Hint strength fades with
  its box (1 → full, 2 → 75%, 3 → 45%, 4 → 20%, 5 → none).
- **Pause:** pause button, Space or Esc, or leaving the tab. **Results:** score, level reached, hits, best combo, accuracy,
  average sign time, and the letters that escaped (to practise). Saved as `best.blast`.

## Signing a letter (all games)
1. The letter you need is highlighted with the hold ring (Sprint, Spell It, Today's five, Practice).
2. While the recogniser reads that letter steadily, the ring fills. The camera pill shows the letter it currently reads.
3. Hold for **8 frames** (about a quarter of a second) and it's accepted: ring turns green, haptic (app), next letter.
4. A wrong shape never costs points in Spell It, Today's five or Practice. In Sprint a wrong stable sign resets the combo.
5. Hints show the handshape card. Leitner: signed under 3 s moves the letter up a box; a hint, skip or miss sends it to box 1.

**Word lists** (`design/words.json`): `spellFirst` + `spell` for Spell It, `mystery` for Mystery Word, `words` for Today's five
and Practice. Today's five uses the exact seeded shuffle in `words.json` (FNV-1a + mulberry32), so everyone gets the same words.
Practice only uses words made entirely of the picked letters; if fewer than 3 fit, it practises the single letters.
Sprint picks letters weighted by Leitner box (box 1 → 3, 2 → 2, 3 → 1.4, 4–5 → 1), never the same letter twice in a row.

## Recogniser parity
The website and the app must accept the **same handshapes with the same thresholds**, or scores won't match.
- Everything lives in `design/recognizer.json`: the model, 26 templates, the extra rules, weights, `accept` 0.30,
  `margin` 0.05 and `stableFrames` 8. The feature formulas are written out in its `features.notes`.
- Reference implementation: `web/js/recognizer.js` (`features()`, `classify()`, rule `penalty()`).
- Hold logic on S4: a frame counts when the recognised letter equals the target; otherwise the counter drops by 2
  (forgiving flicker). Accept at 8. No hand in view resets it to 0.
- Reliable letters (`solid`): A B C D F I L U V W Y. The rest are beta (shown `muted` in Learn).
- With no camera, keyboard mode accepts the target letter's key instantly.
- **Smoothing:** the reported letter is a majority vote over the last 5 frames (at least 3 votes). See `recognizer.json → smoothing`.
- **Personal model:** Learn → letter → "Teach it my hand" records 30 feature vectors of the player's own sign. For that letter,
  distance = 0.4 × template + 0.6 × mean of the 5 nearest recorded samples. See `recognizer.json → calibration`.
- **Discrete signs** (Sprint wrong-letter combo reset, Echo, Mystery, Duel): a sign fires after 8 stable frames and again every
  14 frames while held (`stableFrames`, `rearmFrames`). Duel tracks the left and right halves separately.

## Saved progress
Stored on the device only (localStorage on the website, AsyncStorage or equivalent in the app), **same shape on both**:

```json
{
  "version": 1,
  "hand": "right",
  "sound": false,
  "input": "camera",
  "boxes": { "A": 3, "B": 1 },
  "streak": { "days": 4, "lastPlayed": "2026-11-27" },
  "best": { "sprint": 600, "spell": 350, "echo": 12, "mystery": 340, "blast": 3600 },
  "echo": { "stars": { "1": 3, "2": 2 } },
  "appearance": "system",
  "accent": "blue",
  "calibration": { "B": [[0.15, 1, 1, 1, 1, 0.1]] },
  "daily": { "2026-11-27": { "score": 180, "timeMs": 41200 } },
  "history": [ { "date": "2026-11-27", "mode": "sprint", "score": 340, "words": 7, "letters": 31, "accuracy": 0.89 } ]
}
```
`boxes` are Leitner boxes 1–5 per letter (1 = needs work, 5 = mastered). "Letters mastered" counts letters in box 5.
`input` is `"camera"`, `"keyboard"` or `null` (not chosen yet, so S2 is shown before the first game).
The streak counts consecutive days with at least one finished game; it shows 0 if the last game was before yesterday.

## Not in scope (for now)
Accounts, cloud sync, leaderboards, Snowflake or any backend, two-handed signs, BSL, motion letters J and Z as real motion.
