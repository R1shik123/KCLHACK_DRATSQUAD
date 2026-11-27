# Putting Sign Max online (free)

**Live:** https://signmax.pages.dev (Cloudflare Pages, free, HTTPS so the camera works).

## Deploying an update (website side)
From the repo root, on a machine signed in to Cloudflare (`npx wrangler login`, once):

```bash
node scripts/build-site.mjs
cd dist
npx wrangler@4 pages deploy . --project-name=signmax --branch=main --commit-dirty=true
```
`build-site.mjs` copies `web/` to `dist/`, copies the shared `design/*.json` and `tokens.css` into `dist/design/`, rewrites
`../design/` to `design/`, and adds Cloudflare `_headers`. Run the deploy **from inside `dist/`**: at the repo root, newer
Wrangler versions try to turn the project into a Worker and create a stray `wrangler.jsonc`.

The Cloudflare project `signmax` already exists (created once with `--force` to use classic Pages).
Never pass `--force` again.

## Free custom domain (DigitalPlat FreeDomain)
FreeDomain (https://github.com/DigitalPlatDev/FreeDomain) gives a free name on `.dpdns.org`, `.us.kg`, `.qzz.io`, `.xx.kg`
or `.qd.je`. It only registers the name; DNS runs on the same Cloudflare account that hosts the site.

1. Sign in at https://dashboard.digitalplat.org (your own account) and register the name, e.g. `signmax.dpdns.org`.
2. Cloudflare dashboard → **Add a domain** → enter the name → Free plan. Cloudflare shows two nameservers.
3. Back in the FreeDomain dashboard, set the domain's nameservers to those two.
4. Cloudflare → **Workers & Pages → signmax → Custom domains → Set up a custom domain** → enter the name. Cloudflare adds the
   DNS record and the HTTPS certificate itself once the nameservers are active (minutes to a few hours).

## GitHub Pages (not used)
`.github/workflows/pages.yml` is kept for manual use only. It needs Pages enabled by the repo owner (Settings → Pages →
Source: GitHub Actions); until then a run fails at `configure-pages`.
