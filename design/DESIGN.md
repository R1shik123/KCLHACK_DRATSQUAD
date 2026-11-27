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
- The accent appears **at most twice** on any screen (e.g. the primary button and the active tab).
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
Purple/blue gradients · glassmorphism · coloured card borders or edge stripes · emoji · Inter/Roboto/system font as the display face · more than one primary button · red for wrong answers · confetti · fake stats or testimonials · retro/pixel styling (we've left that behind).
