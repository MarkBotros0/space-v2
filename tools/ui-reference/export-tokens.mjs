import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { UI_REBUILD_DOCS, V1_BASE_URL } from "./lib/paths.mjs";

const SEMANTIC = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
  "muted-foreground", "accent", "accent-foreground", "destructive", "border", "input", "ring",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];
const RAMPS = ["brand-navy", "brand-teal", "neutral", "success", "warning", "error", "info", "purple"];
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const ROLES = ["super", "admin", "leader", "student", "mentor"];
const RADII = ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
const RADIUS_FACTORS = { sm: 0.6, md: 0.8, lg: 1, xl: 1.4, "2xl": 1.8, "3xl": 2.2, "4xl": 2.6 };

const names = [
  ...SEMANTIC,
  ...RAMPS.flatMap((r) => STEPS.map((s) => `color-${r}-${s}`)),
  ...ROLES.flatMap((r) => [`color-role-${r}`, `color-role-${r}-foreground`]),
];

function toHex(rgb) {
  const m = rgb.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgb;
  const [r, g, b] = m.slice(1, 4).map((v) => Math.round(Number(v)));
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${a})`;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function resolve(page) {
  return page.evaluate((vars) => {
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const out = {};
    for (const v of vars) {
      probe.style.color = "";
      probe.style.color = `var(--${v})`;
      // Computed colours may serialise as lab()/oklch(); painting them onto a
      // canvas yields the exact sRGB pixel the browser renders.
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(probe).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      out[v] = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
    }
    probe.remove();
    return out;
  }, names);
}

const browser = await chromium.launch();
const tokens = { source: "jpc-space src/app/globals.css, resolved by Chromium", light: {}, dark: {} };

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: theme });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  // Tokens are global CSS: the signed-out login page carries all of them and
  // is the cheapest page to load while a capture is running.
  const page = await ctx.newPage();
  await page.goto(V1_BASE_URL + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const raw = await resolve(page);
  tokens[theme] = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.replace(/^color-/, ""), toHex(v)]));
  if (theme === "light") {
    // v1's @theme inline folds --radius-* into utilities, so derive them from
    // --radius with globals.css's own multipliers.
    const base = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      probe.style.borderRadius = "var(--radius)";
      const px = parseFloat(getComputedStyle(probe).borderTopLeftRadius);
      probe.remove();
      return px;
    });
    tokens.radius = Object.fromEntries(RADII.map((r) => [r, Math.round(base * RADIUS_FACTORS[r] * 100) / 100]));
    tokens.shadows = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return Object.fromEntries(["soft", "pop", "lift"].map((n) => [n, s.getPropertyValue(`--shadow-${n}`).trim()]));
    });
    tokens.fontFamily = await page.evaluate(() => ({
      sans: getComputedStyle(document.body).fontFamily,
      mono: getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim(),
    }));
  }
  await ctx.close();
}
await browser.close();

if (tokens.light.background === tokens.dark.background) {
  throw new Error("light and dark backgrounds are identical — the theme switch did not apply");
}
mkdirSync(UI_REBUILD_DOCS, { recursive: true });
const out = path.join(UI_REBUILD_DOCS, "v1-tokens.json");
writeFileSync(out, JSON.stringify(tokens, null, 2) + "\n");
console.log("wrote", out);
