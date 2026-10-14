# UI Plan 00 — v1 Reference Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the reference every later UI task builds against: phone-width screenshots of every v1 page per role in light and dark, v1's resolved design tokens as JSON, and a screen map pairing each v1 page with its v2 screen.

**Architecture:** A copy of v1 runs on the devbox against an isolated Neon branch with its dev user-switcher on. Small Node scripts in `space-v2/tools/ui-reference/` (outside the pnpm workspace, own `package.json`) pick one user per role from the branch, sign in as each through Auth.js's credentials callback, crawl every same-role page with Playwright, screenshot it, read the browser's resolved CSS token values, and generate the screen map.

**Tech Stack:** Node 24 (ESM `.mjs`, `node:test`), Playwright 1.64 (library API, Chromium), `pg` 8, rsync, tmux.

**Spec:** `docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md` (§4)

## Global Constraints

- `~/projects/JPC/jpc-space` is READ-ONLY: never write to it, never run git in it. Reading files (including its `.env`) is allowed.
- v1 runs only from the copy at `~/projects/JPC/.v1-reference/app/`.
- The copy's `DATABASE_URL` is the Neon branch URL in `~/.secrets/jpc-v1-reference-db-url`. Never print it or any secret; scripts read secrets from files.
- Production is never written to. The guard (Task 1) must pass before v1 starts.
- Screenshots and anything naming real users (`users.json`, `manifest.json`) live under `~/projects/JPC/.v1-reference/` only — never committed, never published.
- Viewport 375×812, `deviceScaleFactor` 2, Chromium. Light and dark captured for every page.
- Long-running processes run in tmux, logged to `~/logs/jpc-space-<task>.log`.
- Committed outputs: `tools/ui-reference/**` (no secrets, no data), `docs/superpowers/ui-rebuild/v1-tokens.json`, `docs/superpowers/ui-rebuild/screen-map.md`.

## Review Focus

- **Branch URL accidentally equal to production** (owner pastes the wrong string) → guard refuses to start, naming no URL.
- **A role with no users on the branch** (e.g. no MENTOR) → capture skips that role and the screen map lists it as "no reference user", instead of crashing.
- **Crawl wandering into destructive links** (logout, delete, `/api/…` downloads) → crawler never follows them.
- **Infinite crawl over dynamic ids** (hundreds of submissions) → one capture per route pattern.
- **Theme not applied before first paint** → dark screenshots must actually be dark; verified by token export reading different values per theme.

---

## File Structure

```
tools/ui-reference/
  package.json            # private, type: module, deps: playwright, pg
  README.md               # how to run each step
  setup-v1.sh             # copy v1, write .env.local, guard, npm ci
  start-v1.sh             # run v1 dev server on :3100 in tmux
  lib/guard.mjs           # assertBranchNotProduction()
  lib/route-pattern.mjs   # toPattern(), isCrawlable()
  lib/auth.mjs            # signInAs(context, baseUrl, email)
  lib/paths.mjs           # REF_ROOT, SHOTS_DIR, etc.
  pick-users.mjs          # writes $REF_ROOT/users.json
  capture.mjs             # crawl + screenshots -> $REF_ROOT/manifest.json
  export-tokens.mjs       # -> docs/superpowers/ui-rebuild/v1-tokens.json
  screen-map.mjs          # -> docs/superpowers/ui-rebuild/screen-map.md
  test/guard.test.mjs
  test/route-pattern.test.mjs
  test/screen-map.test.mjs
```

`REF_ROOT` = `~/projects/JPC/.v1-reference`. Layout under it:

```
.v1-reference/app/                       # the v1 copy
.v1-reference/users.json                 # role -> {email, name}
.v1-reference/manifest.json              # captured pages
.v1-reference/shots/<role>/<theme>/<slug>.png
.v1-reference/shots/<role>/<theme>/<slug>__dialog-<n>.png
```

---

### Task 1: Tool package, guard and the v1 copy

**Files:**
- Create: `tools/ui-reference/package.json`, `tools/ui-reference/lib/paths.mjs`, `tools/ui-reference/lib/guard.mjs`, `tools/ui-reference/setup-v1.sh`, `tools/ui-reference/test/guard.test.mjs`
- Modify: `.gitignore` (root) — add `tools/ui-reference/node_modules/`

**Interfaces:**
- Produces: `assertBranchNotProduction(branchUrl: string, prodUrl: string): void` (throws `Error` whose message never contains either URL); `REF_ROOT`, `APP_DIR`, `SHOTS_DIR`, `USERS_FILE`, `MANIFEST_FILE`, `BRANCH_URL_FILE`, `V1_SOURCE_DIR`, `REPO_ROOT` from `lib/paths.mjs`.

- [ ] **Step 1: Create the package**

`tools/ui-reference/package.json`:

```json
{
  "name": "ui-reference",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "pick-users": "node pick-users.mjs",
    "capture": "node capture.mjs",
    "export-tokens": "node export-tokens.mjs",
    "screen-map": "node screen-map.mjs"
  },
  "dependencies": {
    "pg": "8.20.0",
    "playwright": "1.64.1"
  }
}
```

`tools/ui-reference/lib/paths.mjs`:

```js
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "../../..");
export const V1_SOURCE_DIR = path.join(os.homedir(), "projects/JPC/jpc-space");
export const REF_ROOT = path.join(os.homedir(), "projects/JPC/.v1-reference");
export const APP_DIR = path.join(REF_ROOT, "app");
export const SHOTS_DIR = path.join(REF_ROOT, "shots");
export const USERS_FILE = path.join(REF_ROOT, "users.json");
export const MANIFEST_FILE = path.join(REF_ROOT, "manifest.json");
export const BRANCH_URL_FILE = path.join(os.homedir(), ".secrets/jpc-v1-reference-db-url");
export const V1_BASE_URL = "http://localhost:3100";
export const UI_REBUILD_DOCS = path.join(REPO_ROOT, "docs/superpowers/ui-rebuild");
```

Append to root `.gitignore`:

```
tools/ui-reference/node_modules/
```

- [ ] **Step 2: Write the failing guard test**

`tools/ui-reference/test/guard.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBranchNotProduction } from "../lib/guard.mjs";

const prod = "postgresql://u:p@ep-prod-123.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";
const branch = "postgresql://u:p@ep-branch-456.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";

test("accepts a branch whose host differs from production", () => {
  assert.doesNotThrow(() => assertBranchNotProduction(branch, prod));
});

test("refuses when the branch host equals production's", () => {
  assert.throws(() => assertBranchNotProduction(prod, prod), /production/);
});

test("refuses the pooled form of the production host", () => {
  const pooled = prod.replace("ep-prod-123.", "ep-prod-123-pooler.");
  assert.throws(() => assertBranchNotProduction(pooled, prod), /production/);
});

test("refuses an empty or unparsable branch URL", () => {
  assert.throws(() => assertBranchNotProduction("", prod), /branch URL/);
  assert.throws(() => assertBranchNotProduction("not a url", prod), /branch URL/);
});

test("never puts either URL in the error message", () => {
  try {
    assertBranchNotProduction(prod, prod);
  } catch (err) {
    assert.ok(!err.message.includes("ep-prod-123"));
    assert.ok(!err.message.includes("u:p@"));
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd tools/ui-reference && npm install && npm test`
Expected: FAIL — `Cannot find module '../lib/guard.mjs'`.

- [ ] **Step 4: Implement the guard**

`tools/ui-reference/lib/guard.mjs`:

```js
/**
 * Neon endpoint ids look like `ep-name-123456`; the pooled hostname inserts
 * `-pooler` after the id. Comparing endpoint ids (not raw hosts) catches the
 * pooled and direct forms of the same production endpoint.
 */
function endpointId(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  return host.split(".")[0].replace(/-pooler$/, "");
}

export function assertBranchNotProduction(branchUrl, prodUrl) {
  const branch = endpointId(branchUrl);
  if (!branch) throw new Error("The branch URL is empty or not a valid postgres URL.");
  const prod = endpointId(prodUrl);
  if (!prod) throw new Error("Could not read production's DATABASE_URL to compare against.");
  if (branch === prod) {
    throw new Error("The branch URL points at the production endpoint. Refusing to start.");
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd tools/ui-reference && npm test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the setup script**

`tools/ui-reference/setup-v1.sh`:

```bash
#!/usr/bin/env bash
# Copy v1 into ~/projects/JPC/.v1-reference/app and configure it against the
# Neon branch. Never writes to jpc-space; never prints a secret.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HOME/projects/JPC/jpc-space"
REF="$HOME/projects/JPC/.v1-reference"
APP="$REF/app"
BRANCH_FILE="$HOME/.secrets/jpc-v1-reference-db-url"

[ -s "$BRANCH_FILE" ] || { echo "Missing $BRANCH_FILE (Neon branch URL)."; exit 1; }

node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { assertBranchNotProduction } from '$HERE/lib/guard.mjs';
  const branch = readFileSync('$BRANCH_FILE', 'utf8').trim();
  const env = readFileSync('$SRC/.env', 'utf8');
  const m = env.match(/^DATABASE_URL\s*=\s*\"?([^\"\n]+)\"?/m);
  assertBranchNotProduction(branch, m ? m[1] : '');
  console.log('guard: branch is not production');
"

mkdir -p "$APP"
umask 077
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude .next \
  --exclude '.env*' --exclude .vercel --exclude uploads \
  "$SRC/" "$APP/"

{
  printf 'DATABASE_URL="%s"\n' "$(cat "$BRANCH_FILE")"
  printf 'AUTH_SECRET="%s"\n' "$(openssl rand -base64 32)"
  printf 'AUTH_URL="http://localhost:3100"\n'
  printf 'AUTH_TRUST_HOST="true"\n'
  printf 'DEV_USER_SWITCHER="1"\n'
  printf 'STORAGE_DRIVER="local"\n'
  printf 'LOCAL_UPLOADS_DIR="./uploads"\n'
} > "$APP/.env.local"
chmod 600 "$APP/.env.local"

cd "$APP"
npm ci
echo "setup complete: $APP"
```

`AUTH_SECRET` is fresh and local: tokens this copy issues are trusted by nothing else. Gmail credentials are deliberately absent, so the copy sends no email.

- [ ] **Step 7: Run setup**

Run: `chmod +x tools/ui-reference/setup-v1.sh && tmux new -d -s jpc-space-v1-setup "tools/ui-reference/setup-v1.sh 2>&1 | tee ~/logs/jpc-space-v1-setup.log"`
Then: `tail -5 ~/logs/jpc-space-v1-setup.log` until it shows `setup complete`.
Expected: `guard: branch is not production`, then `npm ci` output, then `setup complete`. Check that the original was not touched (no git commands — read-only rule): run `ls -a ~/projects/JPC/jpc-space` before Step 7 and again after, and confirm the two listings are identical.

- [ ] **Step 8: Commit**

```bash
git add .gitignore tools/ui-reference/package.json tools/ui-reference/package-lock.json tools/ui-reference/lib tools/ui-reference/setup-v1.sh tools/ui-reference/test/guard.test.mjs
git commit -m "chore(ui-reference): v1 copy setup with production guard"
```

---

### Task 2: Run v1 and sign in as any user

**Files:**
- Create: `tools/ui-reference/start-v1.sh`, `tools/ui-reference/lib/auth.mjs`, `tools/ui-reference/pick-users.mjs`

**Interfaces:**
- Consumes: paths from Task 1.
- Produces: `signInAs(context: BrowserContext, baseUrl: string, email: string): Promise<void>`; `users.json` shaped `{ "<role>": { "email": string, "name": string } | null }` for roles `student, alumni, leader, admin, super, mentor`.

- [ ] **Step 1: Start script**

`tools/ui-reference/start-v1.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
APP="$HOME/projects/JPC/.v1-reference/app"
tmux kill-session -t jpc-space-v1-ref 2>/dev/null || true
mkdir -p "$HOME/logs"
tmux new -d -s jpc-space-v1-ref "cd '$APP' && npx next dev -p 3100 2>&1 | tee $HOME/logs/jpc-space-v1-ref.log"
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/login || true)
  [ "$code" = "200" ] && { echo "v1 up on :3100"; exit 0; }
  sleep 2
done
echo "v1 did not answer /login with 200 within 180s; see ~/logs/jpc-space-v1-ref.log"; exit 1
```

Run: `chmod +x tools/ui-reference/start-v1.sh && tools/ui-reference/start-v1.sh`
Expected: `v1 up on :3100`.

- [ ] **Step 2: Pick one user per role from the branch**

`tools/ui-reference/pick-users.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { BRANCH_URL_FILE, REF_ROOT, USERS_FILE } from "./lib/paths.mjs";

// The user with the most attached rows per role, so lists are populated.
const ACTIVITY = `(
  (select count(*) from "Submission" s where s."studentId" = u.id) +
  (select count(*) from "Attendance" a where a."studentId" = u.id) +
  (select count(*) from "GroupLeader" gl where gl."userId" = u.id) * 50 +
  (select count(*) from "SeasonAdmin" sa where sa."userId" = u.id) * 50
)`;

const QUERIES = {
  student: `role = 'STUDENT' and "graduationYear" is null`,
  alumni: `role = 'STUDENT' and "graduationYear" is not null`,
  leader: `role = 'LEADER'`,
  admin: `role = 'ADMIN'`,
  super: `role = 'SUPER'`,
  mentor: `role = 'MENTOR'`,
};

const client = new pg.Client({ connectionString: readFileSync(BRANCH_URL_FILE, "utf8").trim() });
await client.connect();
await client.query("SET default_transaction_read_only = on");
const users = {};
for (const [role, where] of Object.entries(QUERIES)) {
  const { rows } = await client.query(
    `select u.email, u.name from "User" u where ${where} and u."deletedAt" is null
     order by ${ACTIVITY} desc, u.id asc limit 1`,
  );
  users[role] = rows[0] ?? null;
  console.log(`${role}: ${rows[0] ? "found" : "NO USER"}`);
}
await client.end();
mkdirSync(REF_ROOT, { recursive: true });
writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
```

The column names (`studentId`, `userId`) come from `apps/backend/prisma/schema.prisma`; if a query errors with "column does not exist", open the schema, fix the column name, and re-run. Output prints only `found` / `NO USER`, never names or emails.

Run: `cd tools/ui-reference && npm run pick-users`
Expected: one line per role; any `NO USER` role is carried as `null`.

- [ ] **Step 3: Sign-in helper**

`tools/ui-reference/lib/auth.mjs`:

```js
/**
 * Auth.js v5 credentials sign-in without the UI: fetch a CSRF token, then
 * POST the dev-switch provider's form. The session cookie lands in the
 * browser context, so every page opened from it is signed in.
 */
export async function signInAs(context, baseUrl, email) {
  const req = context.request;
  const csrfRes = await req.get(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const res = await req.post(`${baseUrl}/api/auth/callback/dev-switch`, {
    form: { csrfToken, email, callbackUrl: `${baseUrl}/` },
    maxRedirects: 0,
  });
  if (res.status() >= 400) throw new Error(`dev-switch sign-in failed with HTTP ${res.status()}`);
  const cookies = await context.cookies(baseUrl);
  if (!cookies.some((c) => c.name.includes("session-token"))) {
    throw new Error("dev-switch sign-in returned no session cookie");
  }
}
```

- [ ] **Step 4: Smoke-check sign-in**

Run:

```bash
cd tools/ui-reference && npx playwright install chromium && node --input-type=module -e "
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { signInAs } from './lib/auth.mjs';
import { USERS_FILE, V1_BASE_URL } from './lib/paths.mjs';
const users = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
const browser = await chromium.launch();
const ctx = await browser.newContext();
await signInAs(ctx, V1_BASE_URL, users.student.email);
const page = await ctx.newPage();
await page.goto(V1_BASE_URL + '/');
console.log('landed on', new URL(page.url()).pathname);
await browser.close();
"
```

Expected: `landed on /student/...` (a student path, not `/login`).

- [ ] **Step 5: Commit**

```bash
git add tools/ui-reference/start-v1.sh tools/ui-reference/lib/auth.mjs tools/ui-reference/pick-users.mjs
git commit -m "chore(ui-reference): start v1 copy and sign in as any role"
```

---

### Task 3: Route patterns and crawl rules

**Files:**
- Create: `tools/ui-reference/lib/route-pattern.mjs`, `tools/ui-reference/test/route-pattern.test.mjs`

**Interfaces:**
- Produces: `toPattern(pathname: string): string`; `isCrawlable(href: string, baseUrl: string): boolean`; `slugFor(pattern: string): string`.

- [ ] **Step 1: Write the failing tests**

`tools/ui-reference/test/route-pattern.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPattern, isCrawlable, slugFor } from "../lib/route-pattern.mjs";

const base = "http://localhost:3100";

test("numeric segments become [id]", () => {
  assert.equal(toPattern("/admin/groups/42"), "/admin/groups/[id]");
  assert.equal(toPattern("/leader/sessions/7/attendance"), "/leader/sessions/[id]/attendance");
});

test("10-char public ids with a digit become [publicId]", () => {
  assert.equal(toPattern("/student/submissions/aB3dE6gH9k"), "/student/submissions/[publicId]");
});

test("a segment after seasons/season becomes [code]", () => {
  assert.equal(toPattern("/admin/seasons/spring-2026"), "/admin/seasons/[code]");
  assert.equal(toPattern("/admin/seasons/spring-2026/roster"), "/admin/seasons/[code]/roster");
});

test("static segments are kept", () => {
  assert.equal(toPattern("/student/calendar"), "/student/calendar");
  assert.equal(toPattern("/"), "/");
});

test("query strings and trailing slashes are dropped", () => {
  assert.equal(toPattern("/admin/groups/"), "/admin/groups");
});

test("only same-origin page links are crawlable", () => {
  assert.equal(isCrawlable("/student/calendar", base), true);
  assert.equal(isCrawlable("https://example.com/x", base), false);
  assert.equal(isCrawlable("/api/exports/roster.xlsx", base), false);
  assert.equal(isCrawlable("/api/auth/signout", base), false);
  assert.equal(isCrawlable("/logout", base), false);
  assert.equal(isCrawlable("mailto:a@b.c", base), false);
  assert.equal(isCrawlable("#section", base), false);
  assert.equal(isCrawlable("/uploads/x.pdf", base), false);
});

test("slugs are filesystem-safe and unique per pattern", () => {
  assert.equal(slugFor("/admin/seasons/[code]/roster"), "admin__seasons__code__roster");
  assert.equal(slugFor("/"), "root");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tools/ui-reference && npm test`
Expected: FAIL — `Cannot find module '../lib/route-pattern.mjs'`.

- [ ] **Step 3: Implement**

`tools/ui-reference/lib/route-pattern.mjs`:

```js
const PUBLIC_ID = /^[A-Za-z0-9_-]{10}$/;
const CODE_PARENTS = new Set(["seasons", "season"]);
const NEVER_FOLLOW = [/^\/api\//, /^\/uploads\//, /\/logout$/, /\/signout$/, /\/delete(\/|$)/];

export function toPattern(pathname) {
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return "/";
  const parts = clean.split("/").slice(1);
  return (
    "/" +
    parts
      .map((seg, i) => {
        if (/^\d+$/.test(seg)) return "[id]";
        if (i > 0 && CODE_PARENTS.has(parts[i - 1])) return "[code]";
        if (PUBLIC_ID.test(seg) && /\d/.test(seg)) return "[publicId]";
        return seg;
      })
      .join("/")
  );
}

export function isCrawlable(href, baseUrl) {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/.test(href)) return false;
  let url;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return false;
  }
  if (url.origin !== new URL(baseUrl).origin) return false;
  return !NEVER_FOLLOW.some((re) => re.test(url.pathname));
}

export function slugFor(pattern) {
  if (pattern === "/") return "root";
  return pattern.slice(1).replace(/[[\]]/g, "").split("/").join("__");
}
```

- [ ] **Step 4: Run the tests**

Run: `cd tools/ui-reference && npm test`
Expected: PASS (guard + route-pattern suites).

- [ ] **Step 5: Commit**

```bash
git add tools/ui-reference/lib/route-pattern.mjs tools/ui-reference/test/route-pattern.test.mjs
git commit -m "chore(ui-reference): route patterns and crawl rules"
```

---

### Task 4: Crawl and screenshot every page per role

**Files:**
- Create: `tools/ui-reference/capture.mjs`

**Interfaces:**
- Consumes: `signInAs`, `toPattern`, `isCrawlable`, `slugFor`, paths.
- Produces: `manifest.json` shaped:

```ts
type Manifest = {
  capturedAt: string;
  viewport: { width: 375; height: 812; deviceScaleFactor: 2 };
  roles: Record<string, {
    skipped?: "no reference user";
    pages: Array<{
      pattern: string;          // e.g. "/admin/seasons/[code]"
      exampleUrl: string;       // the concrete path captured
      shots: { light: string; dark: string };          // paths relative to SHOTS_DIR
      dialogs: Array<{ light: string; dark: string; trigger: string }>;
      error?: string;
    }>;
  }>;
};
```

- [ ] **Step 1: Write the capture script**

`tools/ui-reference/capture.mjs`:

```js
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
    const label = ((await trigger.getAttribute("aria-label")) ?? (await trigger.innerText()).trim()).slice(0, 40);
    try {
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
    await pages.light.goto(new URL(target, V1_BASE_URL).toString());
    await settle(pages.light);
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
          await page.goto(new URL(landed, V1_BASE_URL).toString());
          await settle(page);
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
```

- [ ] **Step 2: Run the capture**

Run: `tmux new -d -s jpc-space-v1-capture "cd ~/projects/JPC/space-v2/tools/ui-reference && npm run capture 2>&1 | tee ~/logs/jpc-space-v1-capture.log"`
Watch: `tail -f ~/logs/jpc-space-v1-capture.log` until `manifest written`.
Expected: one line per captured route pattern per role.

- [ ] **Step 3: Verify the capture**

Run:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync(process.env.HOME + '/projects/JPC/.v1-reference/manifest.json', 'utf8'));
for (const [role, r] of Object.entries(m.roles)) {
  const errs = r.pages.filter(p => p.error).length;
  console.log(role, r.skipped ?? '', 'pages', r.pages.length, 'errors', errs);
}"
```

Expected: every role with a user has pages > 0. For each role, open two screenshots with the Read tool — one light, one dark — and confirm: a 375px-wide phone layout, the floating pill tab bar visible at the bottom, and the dark one actually dark. If dark shots render light, the theme init script did not apply: check v1's `theme-provider.tsx` key (`THEME_STORAGE_KEY`) and fix `newThemedContext`, then re-run.

Pages with `error` are retried once by re-running the script; if still failing, they are listed in the screen map (Task 6) as "capture failed: <message>".

- [ ] **Step 4: Commit**

```bash
git add tools/ui-reference/capture.mjs
git commit -m "chore(ui-reference): crawl and screenshot v1 per role and theme"
```

---

### Task 5: Export v1's resolved tokens

**Files:**
- Create: `tools/ui-reference/export-tokens.mjs`
- Create (generated, committed): `docs/superpowers/ui-rebuild/v1-tokens.json`

**Interfaces:**
- Produces: `v1-tokens.json` shaped:

```ts
type V1Tokens = {
  source: "jpc-space src/app/globals.css, resolved by Chromium";
  light: Record<string, string>;   // css var name (no leading --) -> "#RRGGBB" or "rgba(r, g, b, a)"
  dark: Record<string, string>;
  radius: Record<string, number>;  // "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" -> px
  shadows: Record<string, string>; // "soft" | "pop" | "lift" -> CSS box-shadow, as written
  fontFamily: { sans: string; mono: string };
};
```

Plan 01 builds the NativeWind theme from this file, so the browser's own gamut-mapped colours (e.g. `--primary: oklch(0.35 0.15 250)`) are used instead of a hand conversion.

- [ ] **Step 1: Write the exporter**

`tools/ui-reference/export-tokens.mjs`:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signInAs } from "./lib/auth.mjs";
import { UI_REBUILD_DOCS, USERS_FILE, V1_BASE_URL } from "./lib/paths.mjs";

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
      out[v] = getComputedStyle(probe).color; // browser converts oklch/color-mix to sRGB rgb()
    }
    probe.remove();
    return out;
  }, names);
}

const users = JSON.parse(readFileSync(USERS_FILE, "utf8"));
const anyUser = Object.values(users).find(Boolean);
const browser = await chromium.launch();
const tokens = { source: "jpc-space src/app/globals.css, resolved by Chromium", light: {}, dark: {} };

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: theme });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  await signInAs(ctx, V1_BASE_URL, anyUser.email);
  const page = await ctx.newPage();
  await page.goto(V1_BASE_URL + "/");
  await page.waitForLoadState("networkidle");
  const raw = await resolve(page);
  tokens[theme] = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.replace(/^color-/, ""), toHex(v)]));
  if (theme === "light") {
    tokens.radius = await page.evaluate((rs) => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const out = {};
      for (const r of rs) {
        probe.style.borderRadius = `var(--radius-${r})`;
        out[r] = parseFloat(getComputedStyle(probe).borderTopLeftRadius);
      }
      probe.remove();
      return out;
    }, RADII);
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
```

- [ ] **Step 2: Run it**

Run: `cd tools/ui-reference && npm run export-tokens`
Expected: `wrote …/docs/superpowers/ui-rebuild/v1-tokens.json`, no "identical" error.

- [ ] **Step 3: Sanity-check values**

Run: `node -e "const t=require('$HOME/projects/JPC/space-v2/docs/superpowers/ui-rebuild/v1-tokens.json'); console.log(t.light['brand-navy-900'], t.light['brand-teal-500'], t.light.card, t.dark.background, t.radius.lg, t.radius['2xl'])"`
Expected: `#1F3260 #7DCED1 #FFFFFF <a dark hex> 10 18`.

- [ ] **Step 4: Commit**

```bash
git add tools/ui-reference/export-tokens.mjs docs/superpowers/ui-rebuild/v1-tokens.json
git commit -m "chore(ui-reference): export v1 resolved design tokens"
```

---

### Task 6: Screen map

**Files:**
- Create: `tools/ui-reference/screen-map.mjs`, `tools/ui-reference/test/screen-map.test.mjs`
- Create (generated, then hand-reviewed, committed): `docs/superpowers/ui-rebuild/screen-map.md`

**Interfaces:**
- Consumes: `manifest.json`; v2 route files under `apps/mobile/app/`.
- Produces: `v2RouteFor(pattern: string, v2Routes: string[]): string | null`; `screen-map.md`.

- [ ] **Step 1: Write the failing test**

`tools/ui-reference/test/screen-map.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { v2RouteFor } from "../screen-map.mjs";

const v2 = [
  "(app)/calendar", "(app)/dashboard", "(app)/groups", "(app)/group/[id]/index",
  "(app)/seasons/[code]/index", "(app)/seasons/[code]/roster/index", "(app)/students/index",
  "(app)/submission/[publicId]", "login", "forgot-password",
];

test("strips the role prefix and matches a flat route", () => {
  assert.equal(v2RouteFor("/student/calendar", v2), "(app)/calendar");
});

test("maps a plural list + id detail onto v2's singular detail route", () => {
  assert.equal(v2RouteFor("/admin/groups/[id]", v2), "(app)/group/[id]/index");
});

test("matches directory routes through their index", () => {
  assert.equal(v2RouteFor("/admin/seasons/[code]/roster", v2), "(app)/seasons/[code]/roster/index");
  assert.equal(v2RouteFor("/mentor/students", v2), "(app)/students/index");
});

test("role home maps to dashboard", () => {
  assert.equal(v2RouteFor("/student", v2), "(app)/dashboard");
  assert.equal(v2RouteFor("/", v2), "(app)/dashboard");
});

test("public pages match without the (app) group", () => {
  assert.equal(v2RouteFor("/login", v2), "login");
});

test("returns null when nothing matches", () => {
  assert.equal(v2RouteFor("/super/audit-log", v2), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tools/ui-reference && npm test`
Expected: FAIL — `Cannot find module '../screen-map.mjs'` or `v2RouteFor is not a function`.

- [ ] **Step 3: Implement**

`tools/ui-reference/screen-map.mjs`:

```js
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_FILE, REPO_ROOT, SHOTS_DIR, UI_REBUILD_DOCS } from "./lib/paths.mjs";

const ROLE_PREFIXES = new Set(["student", "alumni", "leader", "admin", "super", "mentor"]);
const SINGULAR = { groups: "group", sessions: "session", assignments: "assignment", quizzes: "quiz",
  events: "event", submissions: "submission", users: "user" };

export function v2RouteFor(pattern, v2Routes) {
  const parts = pattern.split("/").filter(Boolean);
  if (parts.length && ROLE_PREFIXES.has(parts[0])) parts.shift();
  if (parts.length === 0) return v2Routes.includes("(app)/dashboard") ? "(app)/dashboard" : null;

  const candidates = [];
  const joined = parts.join("/");
  candidates.push(joined);
  // list/[id] -> singular/[id] (v2 detail routes are singular, ruling X7)
  if (parts.length >= 2 && SINGULAR[parts[0]] && parts[1].startsWith("[")) {
    candidates.push([SINGULAR[parts[0]], ...parts.slice(1)].join("/"));
  }
  for (const c of candidates) {
    for (const form of [`(app)/${c}`, `(app)/${c}/index`, c, `${c}/index`]) {
      if (v2Routes.includes(form)) return form;
    }
  }
  return null;
}

function listRoutes(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRoutes(full, `${prefix}${name}/`));
    else if (name.endsWith(".tsx") && !name.startsWith("_")) out.push(`${prefix}${name.replace(/\.tsx$/, "")}`);
  }
  return out;
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8"));
  const v2Routes = listRoutes(path.join(REPO_ROOT, "apps/mobile/app"));
  const matched = new Set();
  const lines = [
    "# Screen map — v1 page → v2 screen",
    "",
    `Generated by \`tools/ui-reference/screen-map.mjs\` from the capture of ${manifest.capturedAt}, then hand-reviewed.`,
    `Screenshot paths are relative to \`~/projects/JPC/.v1-reference/shots/\` (devbox only — never committed).`,
    "",
    "Status: `match v1` · `v2-only` · `v1-only (not in v2)` · `no reference user` · `capture failed`.",
    "",
  ];
  for (const [role, r] of Object.entries(manifest.roles)) {
    lines.push(`## ${role}`, "");
    if (r.skipped) { lines.push(`_${r.skipped}_`, ""); continue; }
    lines.push("| v1 pattern | v2 route | status | light | dark | dialogs |", "|---|---|---|---|---|---|");
    for (const p of r.pages) {
      const v2 = v2RouteFor(p.pattern, v2Routes);
      if (v2) matched.add(v2);
      const status = p.error ? `capture failed: ${p.error.replace(/\|/g, "/")}` : v2 ? "match v1" : "v1-only (not in v2)";
      lines.push(`| \`${p.pattern}\` | ${v2 ? `\`${v2}\`` : "—"} | ${status} | ${p.shots.light ?? "—"} | ${p.shots.dark ?? "—"} | ${p.dialogs.length} |`);
    }
    lines.push("");
  }
  const v2Only = v2Routes.filter((r) => !matched.has(r));
  lines.push("## v2 screens with no v1 page (`v2-only`)", "", ...v2Only.map((r) => `- \`${r}\``), "");
  mkdirSync(UI_REBUILD_DOCS, { recursive: true });
  writeFileSync(path.join(UI_REBUILD_DOCS, "screen-map.md"), lines.join("\n"));
  console.log(`screen map: ${matched.size} matched, ${v2Only.length} v2-only`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run tests, then generate**

Run: `cd tools/ui-reference && npm test && npm run screen-map`
Expected: tests PASS; `screen map: N matched, M v2-only`.

- [ ] **Step 5: Hand-review the map**

Open `docs/superpowers/ui-rebuild/screen-map.md`. For every `v1-only (not in v2)` and every `v2-only` row, open the v1 page component in `~/projects/JPC/.v1-reference/app/src/app/<pattern>/page.tsx` and the v2 file, and correct the row where the heuristic missed a real pairing (e.g. a v1 page whose content v2 shows inside another screen — write the v2 route and add "(section of)" after it). Do not invent pairings: if v2 truly has no equivalent, leave `v1-only (not in v2)`. The map must not contain any user name or email — patterns and paths only.

- [ ] **Step 6: Commit**

```bash
git add tools/ui-reference/screen-map.mjs tools/ui-reference/test/screen-map.test.mjs docs/superpowers/ui-rebuild/screen-map.md
git commit -m "docs(ui-rebuild): v1 to v2 screen map"
```

---

### Task 7: README, verification and hand-off

**Files:**
- Create: `tools/ui-reference/README.md`

- [ ] **Step 1: README**

`tools/ui-reference/README.md`:

````markdown
# ui-reference — v1 screenshots and tokens

Reference material for the mobile UI rebuild
(`docs/superpowers/specs/2026-10-14-mobile-ui-v1-match-design.md`).
Not part of the pnpm workspace; install with `npm install` here.

Prerequisite: the Neon branch URL in `~/.secrets/jpc-v1-reference-db-url`.

```
./setup-v1.sh          # copy jpc-space -> ~/projects/JPC/.v1-reference/app, guard, npm ci
./start-v1.sh          # v1 on http://localhost:3100 (tmux: jpc-space-v1-ref)
npm run pick-users     # one user per role -> .v1-reference/users.json
npm run capture        # screenshots -> .v1-reference/shots, manifest.json
npm run export-tokens  # -> docs/superpowers/ui-rebuild/v1-tokens.json (committed)
npm run screen-map     # -> docs/superpowers/ui-rebuild/screen-map.md (committed, hand-reviewed)
npm test
```

Everything under `~/projects/JPC/.v1-reference/` contains real user data:
never commit it, never publish it. `jpc-space` itself is read-only — these
scripts only read it.
````

- [ ] **Step 2: Full verification**

Run: `cd tools/ui-reference && npm test` → PASS.
Run: `git status --short` → only intended files; nothing under `.v1-reference` (it is outside the repo).
Run: `grep -E "@|postgresql" docs/superpowers/ui-rebuild/screen-map.md docs/superpowers/ui-rebuild/v1-tokens.json` → no output (no emails, no URLs).

- [ ] **Step 3: Commit and report**

```bash
git add tools/ui-reference/README.md
git commit -m "docs(ui-reference): how to run the capture"
```

Report to the owner: pages captured per role, roles skipped, count of `match v1` / `v2-only` / `v1-only` rows, and the path of the screen map. Leave the `jpc-space-v1-ref` tmux session running — Plan 01's showcase comparison and every screen batch compare against it. Ask before pushing.
