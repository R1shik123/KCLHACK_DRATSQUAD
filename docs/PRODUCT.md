# Signblast product spec (website + app)

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
Ids match the app's `GameKind` and `copy.json` → `games`. Rules are ported one-to-one from `mobile/Signblast/Games/*.swift`;
the website versions are in `web/js/games.js`.

| Id | Game | Rules |
|---|---|---|
| `sprint` | Sign Sprint | Single letters, 60 s. Reliable letters by default (option: all 26). +100 × multiplier per letter; multiplier = min(5, 1 + combo ÷ 3). A wrong stable sign resets the combo. 8 s per letter, then it's a miss. Hint after 3 s only if the letter's box ≤ 2 |
| `spell` | Spell It | Words, 90 s, first word always CAB, then `words.json → spell` shuffled. +50 per letter (+25 if hinted), +200 per word, 0.9 s pause after a word. Skip = miss on the current letter |
| `echo` | Echo | Letters flash one by one (0.5 s lead, 0.9 s on, 0.3 s gap), then sign them back in order. Starts at 2, +1 each round. One mistake ends it. One peek (replay) per game. Score = longest sequence |
| `mystery` | Mystery Word | Hidden word + clue (`words.json → mystery`). Sign letters to guess, 6 wrong guesses per word. Solve = 100 + 20 × lives left. Game ends when a word isn't solved |
| `duel` | Duel | Two players, one camera: Player 1 signs on the left half, Player 2 on the right. Same target for both; first to hold it gets the point. First to 10, or most after 60 s. Keyboard: P1 types, P2 holds Shift |
| `daily` | Today's five | Spell It rules on the 5 seeded words of the day, no clock, once a day |
| `practice` | Practice | Spell It rules on words made only of the letters you picked, no clock |

Flow: Home → game intro (rules, best, Start) → camera setup if not chosen yet → game → Results.

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
  "best": { "sprint": 600, "spell": 350, "echo": 5, "mystery": 340 },
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
