# Signblast UI contract

The website (`web/`) and the app (`mobile/`) must look and behave like **one product**. This file says how.
If something you want to build isn't covered here, add it here first (see `docs/COLLAB.md`), then build it.

**Shared source of truth** (never hard-code a value that lives in one of these):
| File | What it holds |
|---|---|
| `design/tokens.json` | Colours (light + dark), font, type scale, spacing, radius, shadow, sizes, motion, icon names |
| `design/tokens.css` | The same tokens as CSS variables for the website. Generated: `node design/build-tokens.mjs` |
| `design/copy.json` | Every UI string. Both sides use the same words |
| `design/recognizer.json` | Hand-shape templates, rules and thresholds. Both platforms accept exactly the same signs |
| `design/handshapes.json` | How to make each letter (short + long text), used on S7 and in hints |
| `design/words.json` | The word list and the exact Today's five algorithm |
| `design/preview.html` | How each component should look, rendered from the tokens. Open it in a browser and match it |
| `web/` | **The reference build.** When the docs leave something open, match what the website does |
| `docs/PRODUCT.md` | Screens, navigation, the game rules and states |

## 1. Direction
Based on the **Apple Human Interface** recipe from garden-skills (`web-design-engineer` → `style-recipes/apple-hig.md`).

- **White ground, near-black ink, one blue accent.** Dark mode is pure black with grey surfaces.
- **One idea per screen.** Anatomy: eyebrow label → big headline → one short paragraph → one visual or control.
- **One primary action per screen.** Everything else is secondary or a text link.
- **Space does the work.** Elevation comes from whitespace and the soft-grey surface, not borders or shadows.
- **Quiet motion.** Expo-out easing, nothing bouncy, nothing that moves more than it needs to.

## 1b. v2 look (tokens 2.0): canvas and cards
The first version looked flat. v2 is what both platforms build now:
- **Canvas + cards.** The page (`bg`) is soft grey (#F5F5F7) in light mode and black in dark. Content sits on white `surface`
  cards that float on it. Inset areas inside a card (stat chips, the camera frame, segmented tracks, Echo slots) use the new
  `fill` role (#EFEFF3 / #26262B).
- **Layered shadows** (`tokens.json → shadow`): `sm` for resting cards, `md` for hover / raised panels / the game stage,
  `lg` for the hero demo, sheets and toasts. Dark mode replaces drop shadows with a hairline ring + a 1px top highlight.
  Accent things (primary button, featured card, lit Echo letter, week bars) get a soft glow in their own accent colour.
- **Bigger radii:** 14 / 20 / 28, pills for buttons. **Tighter type:** new `hero` style (56, 80 on desktop, 44 on small phones,
  −0.04em), headlines at −0.02em.
- **Hover lift:** cards rise 2–3px and step from `sm` to `md` shadow. Press = scale 0.97–0.985.
- **Home is a product page:** hero (note chip, two-line headline with the second line `muted`, body, Start sprint + Learn the
  alphabet), a live demo card that spells SIGN with the hold ring, a 3-fact strip, the Today's five featured card, the games
  grid, and a site footer. A faint radial `accentSoft` aura sits behind the hero (the only gradient).
- **Navigation:** brand mark (accent squircle with "S") + name; tabs in a pill-shaped segmented track with a raised active tab.
- **Game screens:** the game sits in one raised white **stage** card (`md` shadow): stat chips, game area, flash line, camera, buttons.

## 2. Colour
Use roles, never raw hex. Names match `tokens.json` → `color.light` / `color.dark`.

| Role | Light | Dark | Use for |
|---|---|---|---|
| `bg` | #FFFFFF | #000000 | Page / screen background |
| `surface` | #F5F5F7 | #1C1C1E | Cards, letter tiles, input fields, the camera frame |
| `surfaceHigh` | #FFFFFF | #2C2C2E | Things that sit on a surface (a sheet, a popover) |
| `ink` | #1D1D1F | #F5F5F7 | Main text and icons |
| `muted` | #86868B | #98989D | Secondary text, captions, inactive tabs |
| `hairline` | #D2D2D7 | #38383A | 1px dividers between rows and sections. The only lines allowed |
| `accent` | #0071E3 | #0A84FF | Primary buttons, links, the active tab, the hold ring |
| `success` / `successFill` | #248A3D / #34C759 | #30D158 | Correct letter, completed word. Text uses `success`, fills use `successFill` |
| `danger` | #D70015 | #FF453A | Destructive actions only (Reset progress). **Never** for a wrong sign |

Rules:
- The accent is the player's choice (Settings → Accent colour, `tokens.json` → `accents`: Blue, Indigo, Purple, Pink, Orange, Green, Graphite). Never hard-code blue.
- `accentSoft` = the accent at 14% opacity. Use it for icon badges, tinted tiles and the current Echo slot.
- Full accent fills are limited to: the primary button, the Home hero tile, the Home featured card (Today's five) and the lit Echo letter.
- Appearance: System / Light / Dark (Settings). System follows the device.
- No gradients, glows, coloured backgrounds or tinted cards. Ever.
- A missed or wrong sign is **neutral**: the letter stays `ink`, nothing turns red. We don't punish learners.

## 3. Type
One family everywhere: **Inter Tight**, weights 400 / 500 / 600 only. Load it on both platforms so they render the same.
Every changing number (timer, score, counts) uses tabular figures.

| Style | Size / line (px = pt) | Weight | Used for |
|---|---|---|---|
| `display` | 64 / 68, −0.02em | 600 | The current word on the Play screen, big stats on Results |
| `largeTitle` | 34 / 41 | 600 | Screen titles (Home headline, Learn, Progress) |
| `title1` | 28 / 34 | 600 | Results score, letter on Letter detail |
| `title2` | 22 / 28 | 600 | Section headings, mode card titles |
| `headline` | 17 / 22 | 600 | Button labels, row titles |
| `body` | 17 / 25 | 400 | Paragraphs |
| `callout` | 16 / 21 | 400 | Mode card descriptions |
| `subhead` | 15 / 20 | 400 | Secondary row text |
| `footnote` | 13 / 18 | 400 | Captions, stat labels (in `muted`) |
| `eyebrow` | 12 / 16, +0.06em, UPPERCASE | 600 | The small label above every headline (in `muted`) |

On the website, `display` scales to 88px (Play word) and 96px (Results score) on screens wider than 900px. Nothing else scales.

## 4. Space, radius, shadow
- **Spacing ladder:** 4 · 8 · 16 · 24 · 40 · 64 · 96 · 160. Use nothing in between.
- **Screen padding:** 16 on phones, 24 on tablets, 40 on desktop. Content column max **680** (Play: **560**), centred.
- **Between sections:** 64 on phones, 96–160 on the website.
- **Radius:** `sm` 12 (tiles, small buttons, inputs) · `md` 18 (cards, camera frame) · `lg` 22 (sheets, big panels) · `pill` (primary buttons, chips).
- **Shadow:** only `card` (0 1 2, 4% black), only on `surfaceHigh` things floating over content. Cards on `bg` use the `surface` fill, no shadow.
- **Tap targets:** at least 44 × 44.

## 5. Components
Build these once per platform, with these names, so both codebases speak the same language.
`design/preview.html` shows each one.

| Component | Spec |
|---|---|
| **Button / primary** | Height 50, `pill` radius, `accent` fill, `accentInk` label in `headline`. Full width on phones, auto width (min 200) on the website. One per screen |
| **Button / secondary** | Same shape, `surface` fill, `ink` label |
| **Button / destructive** | Same shape as secondary, `danger` label. Only for the Reset progress confirmation |
| **Button / text** | No fill, `accent` label in `headline`. For "Show hint", "Skip", "Use keyboard instead" |
| **Button / icon** | 44 × 44 hit area, 22px Lucide icon, stroke 1.75, `ink` |
| **Card** | `surface` fill, `md` radius, 24 padding, no border, no shadow. Title in `title2`, text in `callout`/`muted` |
| **Mode card** | A Card that is a button: title, one-line description, `chevron-right` icon on the right. Pressed state: `hairline` fill |
| **List row** | Height 56, 16 side padding, `headline` title, optional `subhead`/`muted` value on the right, `hairline` divider between rows (inset 16) |
| **Segmented control** | `surface` track, `pill` radius, selected segment `surfaceHigh` with `card` shadow. For Settings → Signing hand |
| **Tab bar** | 3 tabs: Play, Learn, Progress (always this order). App: bottom bar, 56 high, icon above `footnote` label. Website: top bar, labels only, centred. Active = `accent`, inactive = `muted` |
| **Camera frame** | `surface` fill (shown before video arrives), `md` radius, 4:3, mirrored video. Hand landmarks drawn as 4px dots in `accent` (sign found) or white (searching) |
| **Hold ring** | Circle around the current letter, 6px stroke. Track `hairline`, progress `accent`, fills while a sign is held, turns `successFill` for 300ms when the letter is accepted |
| **Word display** | The target word in `display`, letters spaced 0.04em. Done letters `ink`, the current letter `accent` with the hold ring, upcoming letters `muted` |
| **Letter tile** | Square, `surface` fill, `sm` radius, letter in `title2` centred. Mastered: 6px `accent` dot top-right. Beta letters: `muted` letter |
| **Stat** | Number in `title1` (or `display` on Results), label under it in `footnote`/`muted`. Stats sit in a row of 2 or 3, never a grid of cards |
| **Timer** | `title2`, tabular, top-right of Play. Last 10 seconds turn `ink` → `accent`. No flashing |
| **Icon badge** | 44 × 44, `sm` radius, `accentSoft` fill, 22px Lucide icon in `accent`. Used on game tiles and the game intro (56 × 56 there) |
| **Hero tile** | Home only. 132 (phone 96, desktop 168) square, radius 32, `accent` fill, `accentInk` letter, soft accent glow. Cycles A→Z with the hold ring filling around it |
| **Featured card** | Home only. Full-width, `lg` radius, `accent` fill, eyebrow "Today", title, body, round chevron. When played: `surface` fill + check |
| **Game tile** | `surface`, `lg` radius, icon badge, title (`headline`), one-line description, best score top-right in `footnote`. 2 columns on phones, 3 on the website |
| **Rules list** | Numbered list on the game intro: `surface` card, `accentSoft` number dots, hairline dividers |
| **Target** | The big single letter (Sprint, Duel, Echo while showing): 168 square (desktop 200), radius 44, `surface`, letter 104px, hold ring around it. Echo lights it with `accent` |
| **Stat chip** | Small `surface` tile, value in `title2`, label in `footnote`. Rows of 3 at the top of every game. The score chip uses `accent` text |
| **Flash line** | One line under the game area for feedback ("That looks like Z", "Nice. B"). `muted`, or `success` when good. Clears after 1.6s |
| **Echo slots** | 48 × 58 tiles: signed letters in `ink`, the current one `accentSoft` with an accent outline, the rest "?" |
| **Mystery word** | One underlined box per letter, filled letters get an `accent` underline. Clue pill (`accentSoft`), 6 hearts, tried letters struck through |
| **Duel score** | Two `surface` panels (Player 1 left, Player 2 right); the one that just scored gets `accentSoft`. A white divider splits the camera |
| **Swatches** | Settings accent picker: 32px circles, selected one gets a 2px ring in its own colour |
| **Stage** | The raised white card a game is played in. `surface`, `lg` radius, `md` shadow, 24 padding (16 on phones) |
| **Demo card** | Home hero only: `surface`, radius 32, `lg` shadow, slight −1.2° tilt on desktop. Mini Spell It round on a loop |
| **Fact** | Home 3-up strip: `surface` card, `sm` shadow, value in `title1`, label in `footnote` |
| **Score card** | Results: `surface`, `md` shadow, eyebrow, the score in `display` (104 on desktop), New best badge, faint accent aura |
| **Site footer** | Website only: brand, one-line tagline, links (Alphabet, Progress, Settings, GitHub). Hidden during games |
| **Toast** | `surfaceHigh`, `md` radius, `card` shadow, `subhead` text, bottom centre, 2.5s |
| **Sheet / dialog** | `surfaceHigh`, `lg` top radius, `overlay` behind. Used for Pause and Reset confirmation |

## 6. Motion
- Easing `cubic-bezier(0.16, 1, 0.3, 1)` everywhere. Durations: 200 (presses, hovers) · 350 (screen elements, rings) · 600 (screen transitions).
- Letter accepted: hold ring completes → turns green → letter settles to `ink` (350). Word done: whole word fades up 8px and out, next word fades in (350).
- No bounces, no confetti, no shaking. Reduced motion: fades only.
- **App:** light haptic on letter accepted, medium on word done. **Sound is off by default on both**; Settings → Sound turns on a soft tick per letter and a two-note chime per word.
- Screens never fade in from invisible. Entrance is an 8-unit slide only, so a screen is readable even if the animation doesn't run.

## 7. Icons and imagery
- **Lucide** only, stroke 1.75, size 22. The exact icon names are in `tokens.json` → `icons.map`.
- **No emoji** anywhere in the UI.
- Handshape images: one consistent set for both platforms, stored in `design/assets/handshapes/` (to be added). Until then, show the letter large in a tile; don't draw fake hands.

## 8. Writing
- All strings come from `design/copy.json`. Need a new one? Add the key there first.
- Sentence case. Short. Buttons are verbs: "Start sprint", "Check my sign".
- No exclamation marks. No "Oops". Errors say what happened and what to do.

## 9. Layout parity
Phones are the reference. The website is the same screens, centred in the content column, with larger spacing.

| | App (phone, 390 wide) | Website (desktop) |
|---|---|---|
| Navigation | Bottom tab bar | Top bar: app name left, tabs centre, settings icon right |
| Tabs during a game | Hidden on S2, S4 and S5 | Same: the tab links hide, the app name and settings stay |
| Play | Word on top, camera below | Same order, same column (max 560). Camera does not go side by side |
| Learn grid | 4 columns | 6 columns (max 680) |
| Results stats | Row of 3 | Row of 3 |

**Parity check before merging a screen:** screenshot the website at 390 px wide and the app on a 390 pt phone, side by side. Same order, same text, same colours, same spacing ladder. If they differ, one of them is wrong.

## 10. Don't
Gradients (the hero glow is the only soft shadow) · glassmorphism · coloured card borders or edge stripes · emoji · Inter/Roboto/system font as the display face · more than one primary button · red for wrong answers · confetti · fake stats or testimonials · retro/pixel styling (we've left that behind).
