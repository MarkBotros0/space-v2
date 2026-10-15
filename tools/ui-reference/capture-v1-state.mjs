// Screenshots one v1 page after clicking through to a state (a tab, a dialog),
// light and dark, into ~/projects/JPC/.v1-reference/shots/<role>/<theme>/<name>.png.
// node capture-v1-state.mjs --role student --path /student/calendar --click Month --name student__calendar__month
// --click may repeat; each matches a role=button/tab/link by accessible name, else text.
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signInAs } from "./lib/auth.mjs";
import { SHOTS_DIR, USERS_FILE, V1_BASE_URL } from "./lib/paths.mjs";

const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
const clicks = process.argv.flatMap((a, i) => (a === "--click" ? [process.argv[i + 1]] : []));
const role = arg("role");
const user = JSON.parse(readFileSync(USERS_FILE, "utf8"))[role];
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  if (user?.email) await signInAs(ctx, V1_BASE_URL, user.email);
  const page = await ctx.newPage();
  await page.goto(new URL(arg("path"), V1_BASE_URL).toString(), { waitUntil: "networkidle", timeout: 150000 });
  for (const name of clicks) {
    const byRole = page.getByRole("tab", { name, exact: true })
      .or(page.getByRole("button", { name, exact: true }))
      .or(page.getByRole("link", { name, exact: true }));
    const target = (await byRole.count()) > 0 ? byRole.first() : page.getByText(name, { exact: true }).first();
    await target.click();
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  const out = path.join(SHOTS_DIR, role, theme, `${arg("name")}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
  await ctx.close();
}
await browser.close();
