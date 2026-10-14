import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signInAs } from "./lib/auth.mjs";
import { isCrawlable, slugFor, toPattern } from "./lib/route-pattern.mjs";
import { MANIFEST_FILE, SHOTS_DIR, USERS_FILE, V1_BASE_URL } from "./lib/paths.mjs";

const VIEWPORT = { width: 375, height: 812 };
const MAX_PAGES_PER_ROLE = 120;
const MAX_DIALOGS_PER_PAGE = 4;
const PAGE_DEADLINE_MS = 420000;
// Pages not reachable by links but part of the reference.
const EXTRA_PATHS = { super: ["/dev/design-system"] };

const allUsers = JSON.parse(readFileSync(USERS_FILE, "utf8"));
// `--role <name>` captures one role into manifest.<role>.json so roles can run
// in parallel and a failure costs one role, not the run. merge-manifest.mjs
// combines the parts into manifest.json.
const roleArg = process.argv.indexOf("--role");
const onlyRole = roleArg > 0 ? process.argv[roleArg + 1] : null;
const users = onlyRole ? { [onlyRole]: allUsers[onlyRole] } : allUsers;
const browser = await chromium.launch();
const manifest = {
  capturedAt: new Date().toISOString(),
  viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
  roles: {},
};

// One slow page must not end the run: navigation errors are recorded, not thrown.
async function visit(page, pathname) {
  try {
    await page.goto(new URL(pathname, V1_BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 150000 });
    await settle(page);
    return null;
  } catch (err) {
    return String(err.message).split("\n")[0].slice(0, 200);
  }
}

// Rejects instead of resolving: used as a per-page watchdog.
function deadline(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} exceeded ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  // No browser call may wait forever: a hang here once stalled a whole run.
  await withTimeout(page.evaluate(() => document.fonts.ready).catch(() => {}), 5000);
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
  pages.light.setDefaultTimeout(15000);
  pages.dark.setDefaultTimeout(15000);

  const seen = new Set();
  const queue = ["/", ...(EXTRA_PATHS[role] ?? [])];
  const results = [];

  while (queue.length && results.length < MAX_PAGES_PER_ROLE) {
    const target = queue.shift();
    // Nav links repeat on every page; a slow page must cost one visit, not one per link.
    if (seen.has(toPattern(target))) continue;
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
      await deadline(capturePage(), PAGE_DEADLINE_MS, "page capture");
    } catch (err) {
      entry.error = String(err.message).slice(0, 200);
      if (err.message.includes("page capture exceeded")) {
        // A frozen tab ignores further calls: replace both tabs.
        for (const theme of ["light", "dark"]) {
          await withTimeout(pages[theme].close().catch(() => {}), 5000);
          pages[theme] = await contexts[theme].newPage();
          pages[theme].setDefaultTimeout(15000);
        }
      }
    }
    async function capturePage() {
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
    }
    results.push(entry);
    console.log(`${role}: ${pattern}`);

    // Re-read links from a fresh load: dialogs opened above may have navigated.
    if (await deadline(visit(pages.light, landed), 200000, "link reload").catch((e) => e.message)) continue;
    const hrefs = await withTimeout(
      pages.light.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []),
      15000,
    ) ?? [];
    for (const href of hrefs) {
      if (!isCrawlable(href, V1_BASE_URL)) continue;
      const next = new URL(href, V1_BASE_URL).pathname;
      if (!seen.has(toPattern(next))) queue.push(next);
    }
  }

  manifest.roles[role] = { pages: results };
  await contexts.light.close();
  await contexts.dark.close();
  const part = MANIFEST_FILE.replace(/\.json$/, `.${role}.json`);
  const body = { capturedAt: manifest.capturedAt, viewport: manifest.viewport, role, ...manifest.roles[role] };
  writeFileSync(part, JSON.stringify(body, null, 2), { mode: 0o600 });
  console.log(`${role}: done (${results.length} pages)`);
}

await browser.close();
if (!onlyRole) {
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log("manifest written");
}
