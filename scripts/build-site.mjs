// Builds the deployable website into dist/: web/ at the root, plus the shared design files in dist/design/.
// Locally the site lives in web/ and loads ../design/; deployed, design/ sits beside it, so the paths are rewritten.
// Usage (repo root):  node scripts/build-site.mjs   then   npx wrangler pages deploy dist --project-name sign-max
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "design"), { recursive: true });
cpSync("web", out, { recursive: true, filter: (p) => !p.endsWith("README.md") });
for (const f of readdirSync("design")) if (f.endsWith(".json") || f === "tokens.css") cpSync(join("design", f), join(out, "design", f));
cpSync(join("design", "assets"), join(out, "design", "assets"), { recursive: true });

const rewrite = (file) => writeFileSync(file, readFileSync(file, "utf8").replaceAll("../design/", "design/"));
rewrite(join(out, "index.html"));
for (const f of readdirSync(join(out, "js"))) rewrite(join(out, "js", f));

// Cloudflare Pages headers: cache static files briefly, never cache the HTML shell.
writeFileSync(join(out, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=()
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
`);
console.log("Built dist/ (web + design). Deploy: npx wrangler pages deploy dist --project-name sign-max");
