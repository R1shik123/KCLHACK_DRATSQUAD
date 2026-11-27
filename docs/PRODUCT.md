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
| **S1** | Home (Play tab) | Eyebrow, headline, one paragraph (`copy.home`) · primary button "Start sprint" · two mode cards: Today's five, Practice · streak stat (small, `muted`) |
| **S2** | Camera setup | Shown once before the first game, or if the camera is off. Camera icon, title, body (`copy.camera`) · primary "Allow camera" · text button "Use keyboard instead" |
| **S3** | Practice setup | Letter tiles to choose from (multi-select, all on by default) · primary "Start" |
| **S4** | Play | Top: timer (Sprint only), pause icon · word display with hold ring on the current letter · camera frame · text buttons "Show hint" and "Skip" |
| **S5** | Results | Eyebrow · score in `display` · stats row: Words, Letters, Accuracy · "Practise next": the 3 letters missed most, as tiles · primary "Play again" · text "Done" |
| **S6** | Learn | Eyebrow, title, body · letter grid (4 columns on phones, 6 on the website) |
| **S7** | Letter detail | Big letter tile · how to make it (one sentence) · camera frame with live confidence · primary "Check my sign" |
| **S8** | Progress | Stats row: Day streak, Letters mastered (x/26), Best sprint · last 7 days as a simple bar row · letter grid showing mastery |
| **S9** | Settings | Rows: Signing hand (segmented Left/Right), Sound (toggle), Reset progress (`danger`, opens a confirm sheet) · privacy note |
| **P1** | Pause sheet | Resume (primary) · End game (text) |

## Game rules
**Modes**
| Mode | Rules |
|---|---|
| Sprint | 60 seconds. Words come one after another. Game ends when time runs out |
| Today's five | 5 fixed words per day, the same for everyone (chosen from the word list by date). No timer, but sign time is recorded. Can be played once per day |
| Practice | Letters or words using only the letters you picked. No timer, hints always available, doesn't affect best scores |

**Spelling a letter**
1. The current letter is highlighted with the hold ring.
2. Show the handshape. While the recogniser reads that letter steadily, the ring fills.
3. Hold for **8 frames in a row** (about a quarter of a second) and the letter is accepted: ring turns green, haptic (app), move to the next letter.
4. No penalty for wrong shapes. The ring just doesn't fill.
5. After **4 seconds** on one letter, "Show hint" pulses once. A hint shows the handshape and costs the bonus for that letter.
6. "Skip" moves to the next word. The skipped letters count as misses.

**Scoring**
- Each accepted letter: **10 points**, **+5** if signed within 1.5 seconds.
- Finished word: **+20**.
- Streak: every 3 words in a row without a skip or hint adds **×1** to the multiplier (max ×3). A skip or hint resets it.
- Accuracy = accepted letters ÷ (accepted + skipped).

**Word list** (`design/words.json`)
- Sprint and Practice pick words weighted towards the letters you find hardest: a word's weight is its weakest letter's
  Leitner weight (box 1 → 3, box 2 → 2, box 3 → 1.4, box 4–5 → 1), × 0.4 for beta letters. The last 6 words aren't repeated.
- Practice only uses words made entirely of the picked letters. If fewer than 3 fit, it practises the single letters.
- Today's five uses the exact seeded shuffle described in `words.json` (FNV-1a + mulberry32), so everyone gets the same words.
- Leitner updates: a letter signed in under 3 s without a hint moves up one box; a hinted or skipped letter goes back to box 1.

## Recogniser parity
The website and the app must accept the **same handshapes with the same thresholds**, or scores won't match.
- Everything lives in `design/recognizer.json`: the model, 26 templates, the extra rules, weights, `accept` 0.30,
  `margin` 0.05 and `stableFrames` 8. The feature formulas are written out in its `features.notes`.
- Reference implementation: `web/js/recognizer.js` (`features()`, `classify()`, rule `penalty()`).
- Hold logic on S4: a frame counts when the recognised letter equals the target; otherwise the counter drops by 2
  (forgiving flicker). Accept at 8. No hand in view resets it to 0.
- Reliable letters (`solid`): A B C D F I L U V W Y. The rest are beta (shown `muted` in Learn).
- With no camera, keyboard mode accepts the target letter's key instantly.

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
  "best": { "sprint": 340 },
  "daily": { "2026-11-27": { "score": 180, "timeMs": 41200 } },
  "history": [ { "date": "2026-11-27", "mode": "sprint", "score": 340, "words": 7, "letters": 31, "accuracy": 0.89 } ]
}
```
`boxes` are Leitner boxes 1–5 per letter (1 = needs work, 5 = mastered). "Letters mastered" counts letters in box 5.
`input` is `"camera"`, `"keyboard"` or `null` (not chosen yet, so S2 is shown before the first game).
The streak counts consecutive days with at least one finished game; it shows 0 if the last game was before yesterday.

## Not in scope (for now)
Accounts, cloud sync, leaderboards, Snowflake or any backend, two-handed signs, BSL, motion letters J and Z as real motion.
