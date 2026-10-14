import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signInAs } from "./lib/auth.mjs";
import { isCrawlable, slugFor, toPattern } from "./lib/route-pattern.mjs";
import { MANIFEST_FILE, SHOTS_DIR, USERS_FILE, V1_BASE_URL } from "./lib/paths.mjs";

const VIEWPORT = { width: 375, height: 812 };
const MAX_PAGES_PER_ROLE = 120;
const MAX_DIALOGS_PER_PAGE = 4;
// Pages not reachable by links but part of the reference.
const EXTRA_PATHS = { super: ["/dev/design-system"] };

const users = JSON.parse(readFileSync(USERS_FILE, "utf8"));
const browser = await chromium.launch();
const manifest = {
  capturedAt: new Date().toISOString(),
  viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
  roles: {},
};

// One slow page must not end the run: navigation errors are recorded, not thrown.
async function visit(page, pathname) {
  try {
    await page.goto(new URL(pathname, V1_BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page);
    return null;
  } catch (err) {
    return String(err.message).split("\n")[0].slice(0, 200);
  }
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300); // let entrance animations finish
}

async function newThemedContext(theme, storageState) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme,
    storageState,
  });
  // v1's ThemeProvider reads localStorage "theme" before first paint.
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  return ctx;
}

async function captureDialogs(page, dir, slug, theme) {
  const triggers = page.locator('[aria-haspopup="dialog"], [aria-haspopup="menu"]');
  const count = Math.min(await triggers.count(), MAX_DIALOGS_PER_PAGE);
  const out = [];
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    try {
      const label = ((await trigger.getAttribute("aria-label")) ?? (await trigger.innerText({ timeout: 1000 })).trim()).slice(0, 40);
      await trigger.click({ timeout: 3000 });
      await page.waitForTimeout(400);
      const file = path.join(dir, `${slug}__dialog-${i}.png`);
      await page.screenshot({ path: file });
      out.push({ [theme]: path.relative(SHOTS_DIR, file), trigger: label });
    } catch {
      // trigger hidden or disabled at this size — skip it
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
  return out;
}

for (const [role, user] of Object.entries(users)) {
  if (!user) {
    manifest.roles[role] = { skipped: "no reference user", pages: [] };
    console.log(`${role}: skipped (no reference user)`);
    continue;
  }
  // Sign in once, reuse the cookies for both themes.
  const authCtx = await browser.newContext();
  await signInAs(authCtx, V1_BASE_URL, user.email);
  const storageState = await authCtx.storageState();
  await authCtx.close();

  const contexts = {
    light: await newThemedContext("light", storageState),
    dark: await newThemedContext("dark", storageState),
  };
  const pages = { light: await contexts.light.newPage(), dark: await contexts.dark.newPage() };

  const seen = new Set();
  const queue = ["/", ...(EXTRA_PATHS[role] ?? [])];
  const results = [];

  while (queue.length && results.length < MAX_PAGES_PER_ROLE) {
    const target = queue.shift();
    const navError = await visit(pages.light, target);
    if (navError) {
      const pattern = toPattern(target);
      if (!seen.has(pattern)) {
        seen.add(pattern);
        results.push({ pattern, exampleUrl: target, shots: {}, dialogs: [], error: navError });
        console.log(`${role}: ${pattern} (failed: ${navError})`);
      }
      continue;
    }
    const landed = new URL(pages.light.url()).pathname;
    const pattern = toPattern(landed);
    if (seen.has(pattern) || landed.startsWith("/login")) continue;
    seen.add(pattern);

    const slug = slugFor(pattern);
    const entry = { pattern, exampleUrl: landed, shots: {}, dialogs: [] };
    try {
      for (const theme of ["light", "dark"]) {
        const page = pages[theme];
        if (theme === "dark") {
          const darkError = await visit(page, landed);
          if (darkError) throw new Error(darkError);
        }
        const dir = path.join(SHOTS_DIR, role, theme);
        mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${slug}.png`);
        await page.screenshot({ path: file, fullPage: true });
        entry.shots[theme] = path.relative(SHOTS_DIR, file);
        const dialogs = await captureDialogs(page, dir, slug, theme);
        dialogs.forEach((d, i) => {
          entry.dialogs[i] = { ...(entry.dialogs[i] ?? {}), ...d };
        });
      }
    } catch (err) {
      entry.error = String(err.message).slice(0, 200);
    }
    results.push(entry);
    console.log(`${role}: ${pattern}`);

    // Re-read links from a fresh load: dialogs opened above may have navigated.
    if (await visit(pages.light, landed)) continue;
    const hrefs = await pages.light.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    for (const href of hrefs) {
      if (!isCrawlable(href, V1_BASE_URL)) continue;
      const next = new URL(href, V1_BASE_URL).pathname;
      if (!seen.has(toPattern(next))) queue.push(next);
    }
  }

  manifest.roles[role] = { pages: results };
  await contexts.light.close();
  await contexts.dark.close();
}

await browser.close();
writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log("manifest written");
