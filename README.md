# Signblast

> **The website (`web/`) is the main project.** The app follows its UI; new games built in the app get ported to the website.
>
> **Start here (Nov 2026 rebuild).** Signblast is being rebuilt as a clean, non-retro ASL fingerspelling game, with a
> **website** (`web/`) and an **app** (`mobile/`) built in parallel by two Claude sessions that share one UI.
> Read `docs/COLLAB.md` first, then `docs/HANDOFF.md`, `design/DESIGN.md` and `docs/PRODUCT.md`.
> **Live site:** https://signmax.pages.dev (Cloudflare Pages). Deploy and free-domain steps: `docs/DEPLOY.md`.
> Everything below this box describes the hackathon version (legacy code, don't build on it).

**Learn the ASL alphabet by playing an arcade classic.** Letters fall like an arcade wave; make each letter's
handshape at your webcam to shoot it down. Built for the **Retro Remix** track at KCL Tech First Year Hack.

- **Play** (`/#play`): the retro falling-letters shooter, controlled by your hand (or the keyboard if there's no camera)
- **Learn** (`/#learn`): plain-English handshapes with a live "check my sign" camera mode
- **Progress** (`/#progress`): streak, accuracy, reaction time, mastery per letter

**Why it works:** every shot is a retrieval-practice rep done with your body, scheduled by spaced repetition
(Leitner boxes) and kept in your challenge zone by adaptive speed. See [docs/LEARNING-SCIENCE.md](docs/LEARNING-SCIENCE.md).

**Run it:** `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python server.py`,
then open http://localhost:8765 in Chrome and allow the camera. Video stays on your device: hand tracking
(MediaPipe Hand Landmarker) runs in the browser.

**Code:** `app/recognizer.js` (handshape recogniser), `app/game.js` (game + learning loop), `app/app.js` (screens, camera,
progress), `app/style.css` (design).

**Limits:** 8 static letters (A B C D I L V Y); J and Z need motion; lighting affects accuracy; it complements
Deaf-led teaching rather than replacing it.
