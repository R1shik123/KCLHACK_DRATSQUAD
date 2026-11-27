# Working together: website Claude + app Claude

Two Claude sessions build Sign Max in this one repo: one builds the **website**, the other builds the **app**.
**The website is the main project** (the human's decision, 2026-11-27): it owns the UI, and the website side pulls the app's new
games and features into `web/` regularly. The app side owns game logic and specs new games in `docs/PRODUCT.md`.
They never talk directly. **The repo is the only channel**, so everything below is about keeping it clear.

## Read these at the start of every session, in this order
1. `docs/HANDOFF.md`: the message log between the two sides. Newest entry at the top.
2. `design/DESIGN.md`: the UI contract.
3. `docs/PRODUCT.md`: screens, game rules, saved data.
4. `design/tokens.json` and `design/copy.json`: the actual values and words.

Open `design/preview.html` in a browser to see what everything should look like.

## Who owns what
| Path | Owner | Rule |
|---|---|---|
| `web/` | Website Claude | Only the website side edits it |
| `mobile/` | App Claude | Only the app side edits it |
| `design/`, `docs/PRODUCT.md` | **Shared** | Change only through the proposal steps below |
| `docs/HANDOFF.md` | Shared | Append only. Never edit or delete someone else's entry |
| Everything else (`app/`, `js/`, `game/`, `roads/`, `snow/`, `vendor/`, `server.py`…) | Legacy hackathon code | **Don't touch.** Read `app/recognizer.js` and `app/game.js` for logic to port, but don't import from them. The team will delete or archive it later |

## Changing something shared
Shared files are the contract, so a change on one side has to reach the other.
1. Make the change in `design/` or `docs/PRODUCT.md` in its **own commit**, prefixed `design:` or `product:`. Don't mix it with `web/` or `mobile/` code.
2. If you changed `tokens.json`, run `node design/build-tokens.mjs` and commit the regenerated `tokens.css` in the same commit.
3. Bump `version` in `tokens.json` or `copy.json`: patch for a tweak (1.0.1), minor for something added (1.1.0), major if something was renamed or removed (2.0.0).
4. Add an entry to `docs/HANDOFF.md` saying what changed, why, and what the other side must update.
5. Push straight away.

Small things that don't need a proposal: a new string in `copy.json` (just add it, bump patch, log it).
Big things that need the human's OK first: a new screen, a new colour, a change to scoring or game rules.

## HANDOFF.md entries
Add new entries at the top, in this format:

```
## 2026-11-27 14:05 · web
Done: S1 Home and S4 Play built, matching preview.html.
Changed shared: copy.json 1.0.1, added play.paused.
Needs from app: use copy.play.paused on the Pause sheet title.
Open questions: should Today's five lock after one play on both platforms? (proposal: yes)
```
- Use `web` or `app` as the author.
- Answer the other side's open questions in your next entry, quoting the question.
- If you're blocked on the other side, say exactly what you need and carry on with something else.

## Git rules
- Work on `main`. Before you start: `git pull --rebase`. Before you push: `git pull --rebase` again, then `git push`.
- **Never** force-push, `reset --hard`, `stash` or `checkout` someone else's files.
- Stage only your own paths: `git add web/` (or `mobile/`), never `git add -A` or `git add .`.
- Commit prefixes: `web:`, `app:`, `design:`, `product:`, `docs:`. Put the screen ID in the message when it applies: `web: S4 hold ring fills while sign is held`.
- Commit small and often, and push at least every hour so the other side sees your progress.
- Never commit secrets, `.env`, `node_modules/` or build output.

## Keeping the UI identical
- Never hard-code a colour, size, font or string that exists in `tokens.json` or `copy.json`. Read it from there (the website uses `design/tokens.css`; the app reads `tokens.json`).
- Use the component names from `DESIGN.md` §5 and the screen IDs from `PRODUCT.md` (S1–S9, P1) in code, so both codebases map one-to-one.
- **Parity check** when a screen is finished: screenshot it at 390 wide, save it as `design/parity/<screen-id>-web.png` or `-app.png`, and compare with the other side's. Note any difference in `HANDOFF.md`.
- Spot a mismatch? Don't silently copy the other side. Check `DESIGN.md`: whoever differs from the contract fixes it. If the contract is unclear, propose a fix in `HANDOFF.md`.

## Prompt to start the app Claude
Paste this as the first message in the app Claude's session:

> You're building the **Signblast mobile app**, an ASL fingerspelling game, in the GitHub repo
> `R1shik123/KCLHACK_DRATSQUAD`. Another Claude is building the **website** in the same repo at the same time, and both must
> look and behave like one product. Before writing any code, read in order: `docs/COLLAB.md`, `docs/HANDOFF.md`,
> `design/DESIGN.md`, `docs/PRODUCT.md`, `design/tokens.json`, `design/copy.json`, and open `design/preview.html`.
> Rules: only create or edit files in `mobile/`; never touch `web/`, the legacy hackathon folders, or shared files except
> through the proposal steps in `COLLAB.md`. Read every colour, size, font and string from `design/tokens.json` and
> `design/copy.json`; never hard-code them. Use the screen IDs (S1–S9, P1) and component names from the docs.
> Start by telling me which stack you'll use and why, and add your first `HANDOFF.md` entry (author `app`) saying so.
> Then build S1 Home and S4 Play first, run a parity check against `design/preview.html`, commit with the `app:` prefix,
> pull with rebase, and push.
