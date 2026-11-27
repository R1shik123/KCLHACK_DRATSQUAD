// Generates design/tokens.css from design/tokens.json for the website.
// Run from the repo root: node design/build-tokens.mjs
// The app reads tokens.json directly (or converts it the same way for its own stack).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));

const kebab = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const px = (n) => `${n}px`;
const colors = (set) => Object.entries(set).map(([k, v]) => `  --color-${kebab(k)}: ${v};`).join("\n");

const fontStack = [`"${t.font.family}"`, ...t.font.fallback.map((f) => (f.includes(" ") ? `"${f}"` : f))].join(", ");

const type = Object.entries(t.type).map(([k, v]) => [
  `  --type-${kebab(k)}-size: ${px(v.size)};`,
  `  --type-${kebab(k)}-line: ${px(v.line)};`,
  `  --type-${kebab(k)}-weight: ${v.weight};`,
  `  --type-${kebab(k)}-tracking: ${v.tracking}em;`,
].join("\n")).join("\n");

const scalar = (prefix, obj) => Object.entries(obj).map(([k, v]) => `  --${prefix}-${kebab(k)}: ${typeof v === "number" ? px(v) : v};`).join("\n");
const sh = (mode) => Object.entries(t.shadow[mode]).map(([k, v]) => `  --shadow-${k}: ${v};`).join("\n");

const css = `/* GENERATED from design/tokens.json by design/build-tokens.mjs. Do not edit by hand. Tokens v${t.version} */
:root {
  color-scheme: light;
${colors(t.color.light)}
  --font: ${fontStack};
${type}
${scalar("space", t.space)}
${scalar("radius", t.radius)}
${scalar("size", Object.fromEntries(Object.entries(t.size).filter(([, v]) => typeof v === "number" && !String(v).includes("."))))}
  --size-icon-stroke: ${t.size.iconStroke};
${sh("light")}
  --shadow-card: var(--shadow-sm);
  --ease: ${t.motion.easing};
  --dur-fast: ${t.motion.fast}ms;
  --dur-base: ${t.motion.base}ms;
  --dur-slow: ${t.motion.slow}ms;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${colors(t.color.dark).replace(/^/gm, "  ")}
${sh("dark").replace(/^/gm, "  ")}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
${colors(t.color.dark)}
${sh("dark")}
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}
${accentCss()}`;

// Selectable accents (Settings). :root[data-accent] beats the base palette; the dark variants beat it again in dark mode.
function accentCss() {
  if (!t.accents) return "";
  const soft = Math.round((t.accentSoftOpacity ?? 0.14) * 100);
  let out = `:root { --color-accent-soft: color-mix(in srgb, var(--color-accent) ${soft}%, transparent); }\n`;
  for (const [id, a] of Object.entries(t.accents)) {
    if (id.startsWith("$") || id === "default") continue;
    out += `:root[data-accent="${id}"] { --color-accent: ${a.light}; --color-accent-ink: ${a.inkLight}; }\n`;
    out += `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])[data-accent="${id}"] { --color-accent: ${a.dark}; --color-accent-ink: ${a.inkDark}; } }\n`;
    out += `:root[data-theme="dark"][data-accent="${id}"] { --color-accent: ${a.dark}; --color-accent-ink: ${a.inkDark}; }\n`;
  }
  return out;
}

writeFileSync(join(here, "tokens.css"), css);
console.log(`design/tokens.css written (tokens v${t.version})`);
