# Signblast website

The reference build of Signblast. The app in `mobile/` matches this UI (see `docs/COLLAB.md`).

## Run it
No build step and no dependencies. Serve the **repo root** (the site loads `../design/*.json` and `../design/tokens.css`):

```bash
python -m http.server 8791
```
Open http://localhost:8791/web/. The camera needs `localhost` or HTTPS. Hand tracking loads MediaPipe from jsDelivr,
so the first camera start needs internet.

## Files
| File | What it does |
|---|---|
| `index.html` | Shell: top bar, view, toast and sheet hosts |
| `css/app.css` | All styles, built only from `design/tokens.css` variables. Class names follow `DESIGN.md` §5 |
| `js/main.js` | Router (`#play`, `#learn`, `#letter-A`, `#progress`, `#settings`, `#practice`, `#camera`, `#game`, `#results`) and screens S1–S9, P1 |
| `js/engine.js` | Game rules: word picking, scoring, streak multiplier, Leitner updates, Today's five shuffle. No DOM |
| `js/recognizer.js` | Camera + MediaPipe + letter classification from `design/recognizer.json` |
| `js/store.js` | Saved progress in localStorage, shape from `docs/PRODUCT.md` |
| `js/icons.js` | Lucide icons used by the UI |

## Testing without a camera
On the camera screen choose **Use keyboard instead** (or Settings → Sign with → Keyboard), then type the highlighted letter.
