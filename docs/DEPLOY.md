# Putting Signblast online (free)

**Hosting:** GitHub Pages (free, HTTPS, which the camera needs). `.github/workflows/pages.yml` publishes `web/` + `design/`
on every push to `main` that touches them.
**Domain:** a free domain from DigitalPlat FreeDomain (https://github.com/DigitalPlatDev/FreeDomain), for example
`signblast.dpdns.org`. FreeDomain only registers the name; DNS is handled by a free Cloudflare account.

## 1. Turn on Pages (once, repo admin only)
1. GitHub → `R1shik123/KCLHACK_DRATSQUAD` → **Settings → Pages**.
2. **Source: GitHub Actions.**
3. Go to **Actions → Deploy website → Run workflow** (or push a change to `web/`).
4. The site appears at `https://r1shik123.github.io/KCLHACK_DRATSQUAD/` within a minute or two.

## 2. Get the free domain
1. Go to https://dashboard.digitalplat.org and create an account (you do this; it needs your own details).
2. Register a name on one of the free extensions: `.dpdns.org`, `.us.kg`, `.qzz.io`, `.xx.kg` or `.qd.je`.
   Suggested: `signblast.dpdns.org`.
3. FreeDomain asks for **nameservers**. Create a free Cloudflare account, choose **Add a domain**, enter the domain, pick the
   Free plan, and copy the two nameservers Cloudflare gives you into the FreeDomain dashboard.
   Their tutorial covers this step: https://github.com/DigitalPlatDev/FreeDomain (Read the tutorial).

## 3. Point the domain at GitHub Pages
1. In Cloudflare → DNS → **Add record**: type `CNAME`, name `@`, target `r1shik123.github.io`, proxy status **DNS only** (grey cloud).
2. GitHub → Settings → Pages → **Custom domain**: enter the domain (e.g. `signblast.dpdns.org`) → Save.
3. Wait for the DNS check to pass (minutes to a few hours), then tick **Enforce HTTPS**.

## Checking it
- Open the domain: the Home screen should load with the game hub.
- Open Learn → any letter → Check my sign: the browser should ask for the camera (only works over HTTPS).
- If styles or text are missing, open the browser console: the deploy rewrites `../design/` to `design/`, so a 404 there
  means a new file in `design/` isn't copied by the workflow. Add it to the `cp design/...` line.
