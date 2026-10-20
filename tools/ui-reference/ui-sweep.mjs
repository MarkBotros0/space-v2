#!/usr/bin/env node
/**
 * The UI sweep: drives screens through apps/mobile/.maestro/sweep/s*.yaml
 * across a device matrix and screenshots each state into a contact sheet.
 *
 * Not a pass/fail test, and not the v1 comparison (capture-v2.sh). Matching
 * v1 at one 375dp phone says nothing about a 360×640 phone at font 1.3, a
 * 3-button nav bar under the floating tab bar, or a keyboard over a form —
 * v1 is a web page and never had those. The sweep exists so a person (or an
 * agent) can *look* at every state at the sizes, font scales, nav modes and
 * themes real phones use.
 *
 *   node ui-sweep.mjs
 *   node ui-sweep.mjs --cells=small-1.3-3btn-light,iphone-1.0-gesture-dark --flows=s03
 *   node ui-sweep.mjs --into=2026-10-19_02-10-00 --cells=small --flows=s03
 *                                    # re-run into an earlier run's folder
 *   node ui-sweep.mjs --restore      # put the device back after a crashed run
 *
 * Needs the capture rig (README.md "v2 capture rig"): emulator.sh, Metro on
 * 8095, and for signed-in flows backend.sh and set-reference-passwords.mjs.
 * Writes to ~/projects/JPC/.v2-captures/ui-sweep/<timestamp>/ — real test-
 * database users, so private: never commit or publish it.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { REPO_ROOT, USERS_FILE as REFERENCE_USERS_FILE } from "./lib/paths.mjs";
import {
  CELLS,
  NAV_OVERLAYS,
  contactSheetHtml,
  flowTitle,
  parseArgs,
  parseNavOverlay,
  parseNightMode,
  parseWm,
  pick,
  redact,
} from "./lib/sweep.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SWEEP_DIR = path.join(REPO_ROOT, "apps/mobile/.maestro/sweep");
// Defaults are the devbox capture rig; .github/workflows/ui-sweep.yml overrides
// them with UI_SWEEP_* for a GitHub Actions emulator.
const OUTPUT_ROOT = process.env.UI_SWEEP_OUTPUT ?? path.join(os.homedir(), "projects/JPC/.v2-captures/ui-sweep");
/** Written before the first cell is applied, deleted once the device is restored. */
const DEVICE_STATE_FILE = path.join(OUTPUT_ROOT, ".device-before.json");

// Same files as set-reference-passwords.mjs / restore-reference-passwords.mjs.
const PASSWORD_FILE = path.join(os.homedir(), ".secrets/jpc-v1-reference-password");
const BACKUP_FILE = path.join(os.homedir(), ".secrets/jpc-reference-password-backup.json");
// CI signs in as fake users seeded into a throwaway database
// (apps/backend/scripts/seed-sweep.ts), so it passes their users.json and
// password directly and skips the reference-password check, which only
// guards the real accounts on the shared test database.
const USERS_FILE = process.env.UI_SWEEP_USERS_FILE ?? REFERENCE_USERS_FILE;
const FAKE_USERS_PASSWORD = process.env.UI_SWEEP_PASSWORD;

const ADB = process.env.UI_SWEEP_ADB ?? path.join(os.homedir(), "Android/Sdk/platform-tools/adb");
const MAESTRO = process.env.UI_SWEEP_MAESTRO ?? path.join(os.homedir(), ".maestro/bin/maestro");
const DEVICE = process.env.UI_SWEEP_DEVICE ?? "emulator-5558";
/** A release APK carries its own JS bundle, so CI runs without Metro. */
const NEEDS_METRO = process.env.UI_SWEEP_NO_METRO !== "1";
const METRO_PORT = 8095;
const BACKEND = "http://localhost:4100";
const APP_ID = "com.jpc.space";

function fail(message) {
  console.error(`\n[sweep] ✗ ${message}`);
  process.exit(1);
}

const sh = (...command) => spawnSync(ADB, ["-s", DEVICE, "shell", ...command], { encoding: "utf8" }).stdout?.trim() ?? "";

async function reachable(url, expect) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return (await res.text()).includes(expect);
  } catch {
    return false;
  }
}

function readDeviceState() {
  return {
    size: parseWm(sh("wm", "size")),
    density: parseWm(sh("wm", "density")),
    fontScale: sh("settings", "get", "system", "font_scale"),
    showImeWithHardKeyboard: sh("settings", "get", "secure", "show_ime_with_hard_keyboard"),
    navOverlay: parseNavOverlay(sh("cmd", "overlay", "list")),
    night: parseNightMode(sh("cmd", "uimode", "night")),
  };
}

function restoreDevice(before) {
  console.log("\n[sweep] restoring the device…");
  if (before.size) sh("wm", "size", before.size);
  if (before.density) sh("wm", "density", before.density);
  sh("settings", "put", "system", "font_scale", before.fontScale === "null" ? "1.0" : before.fontScale);
  if (before.showImeWithHardKeyboard === "null") sh("settings", "delete", "secure", "show_ime_with_hard_keyboard");
  else sh("settings", "put", "secure", "show_ime_with_hard_keyboard", before.showImeWithHardKeyboard);
  if (before.navOverlay) sh("cmd", "overlay", "enable-exclusive", "--category", before.navOverlay);
  sh("cmd", "uimode", "night", before.night);
  const now = readDeviceState();
  if (now.size !== before.size || now.density !== before.density) {
    console.log(`[sweep] ⚠ could not restore the device (adb gone?). When it is back: node ${path.relative(process.cwd(), path.join(here, "ui-sweep.mjs"))} --restore`);
    return false;
  }
  rmSync(DEVICE_STATE_FILE, { force: true });
  return true;
}

function applyCell(cell) {
  console.log(`\n[sweep] ══ cell ${cell.id} — ${cell.label} ══`);
  sh("wm", "size", cell.screen.size);
  sh("wm", "density", cell.screen.density);
  sh("settings", "put", "system", "font_scale", cell.font);
  sh("cmd", "overlay", "enable-exclusive", "--category", NAV_OVERLAYS[cell.nav]);
  sh("cmd", "uimode", "night", cell.theme === "dark" ? "yes" : "no");
  // SystemUI redraws its bar after an overlay switch; let it settle, or the
  // first shots catch the old bar mid-swap.
  spawnSync("sleep", ["5"]);
}

/**
 * Runs one flow, streaming Maestro's output line by line with the password
 * blanked: Maestro echoes `inputText` values, so a raw log would hold it.
 */
function runMaestro(flow, env, outputDir, secrets) {
  const args = ["--device", DEVICE, "test", `--test-output-dir=${outputDir}`];
  for (const [key, value] of Object.entries(env)) args.push("-e", `${key}=${value}`);
  args.push(flow);
  return new Promise((resolve) => {
    const child = spawn(MAESTRO, args, { stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on("line", (line) => console.log(redact(line, secrets)));
    }
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Maestro writes takeScreenshot files under its own output folder; move this flow's into the cell's. */
function collectShots(scratchDir, cellDir, prefix) {
  let entries = [];
  try {
    entries = readdirSync(scratchDir, { recursive: true }).map(String);
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = path.basename(entry);
    if (name.endsWith(".png") && name.startsWith(prefix)) renameSync(path.join(scratchDir, entry), path.join(cellDir, name));
  }
  rmSync(scratchDir, { recursive: true, force: true });
}

function captureFailure(file) {
  const result = spawnSync(ADB, ["-s", DEVICE, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status === 0 && result.stdout?.length) writeFileSync(file, result.stdout);
}

function writeSheet(runDir, cells, results) {
  const shotsByCell = {};
  for (const cell of cells) {
    try {
      shotsByCell[cell.id] = readdirSync(path.join(runDir, cell.id))
        .filter((name) => name.endsWith(".png"))
        .map((name) => name.replace(/\.png$/, ""));
    } catch {
      shotsByCell[cell.id] = [];
    }
  }
  const flowTitles = {};
  for (const rel of readdirSync(SWEEP_DIR, { recursive: true }).map(String)) {
    const base = path.basename(rel);
    if (/^s\d+.*\.yaml$/.test(base)) flowTitles[base.split("-")[0]] = flowTitle(readFileSync(path.join(SWEEP_DIR, rel), "utf8").split("\n")[0]);
  }
  writeFileSync(
    path.join(runDir, "index.html"),
    contactSheetHtml({ title: path.basename(runDir), cells, shotsByCell, results, flowTitles }),
  );
  writeFileSync(path.join(runDir, "results.json"), JSON.stringify(results, null, 2));
}

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

/** One email per role (users.json) plus the shared password, for flows that sign in. */
function signInEnv(flows) {
  // Most flows sign in through _sign-in.yaml and only name ${<ROLE>_EMAIL}
  // themselves, so look for any of the three, not just ${PASSWORD}.
  const needsPassword = flows.some((f) =>
    /\$\{(PASSWORD|[A-Z]+_EMAIL)\}|_sign-in\.yaml/.test(readFileSync(path.join(SWEEP_DIR, f), "utf8")),
  );
  if (!needsPassword) return { env: {}, secrets: [], signsIn: false };
  if (!existsSync(USERS_FILE)) fail(`No ${USERS_FILE}. Run \`npm run pick-users\` (README.md).`);
  if (!FAKE_USERS_PASSWORD && (!existsSync(PASSWORD_FILE) || !existsSync(BACKUP_FILE))) {
    fail(
      "The reference users don't have the known password. Run `node set-reference-passwords.mjs` first " +
        "(it changes six users on the shared test database) and `node restore-reference-passwords.mjs` when done.",
    );
  }
  const users = JSON.parse(readFileSync(USERS_FILE, "utf8"));
  const env = {};
  for (const [role, user] of Object.entries(users)) if (user?.email) env[`${role.toUpperCase()}_EMAIL`] = user.email;
  const password = FAKE_USERS_PASSWORD ?? readFileSync(PASSWORD_FILE, "utf8").trim();
  env.PASSWORD = password;
  return { env, secrets: [password], signsIn: true };
}

async function main() {
  const argv = process.argv.slice(2);
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const devices = spawnSync(ADB, ["devices"], { encoding: "utf8" }).stdout ?? "";
  if (!new RegExp(`^${DEVICE}\\s+device`, "m").test(devices)) fail(`${DEVICE} is not up. Run ./emulator.sh.`);

  if (argv[0] === "--restore") {
    if (!existsSync(DEVICE_STATE_FILE)) return console.log("[sweep] nothing to restore.");
    if (restoreDevice(JSON.parse(readFileSync(DEVICE_STATE_FILE, "utf8")))) console.log("[sweep] device restored.");
    return;
  }

  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    fail(err.message);
  }
  let cells;
  let flows;
  try {
    cells = pick(CELLS, args.cells, (cell) => cell.id, "cell");
    flows = pick(
      // Flows may sit in sub-folders (sweep/student-scenarios/); they are
      // named, picked and sorted by file name alone.
      readdirSync(SWEEP_DIR, { recursive: true })
        .map(String)
        .filter((rel) => /^s\d+.*\.yaml$/.test(path.basename(rel)))
        .sort((a, b) => path.basename(a).localeCompare(path.basename(b))),
      args.flows,
      (rel) => path.basename(rel),
      "sweep flow",
    );
  } catch (err) {
    fail(err.message);
  }

  // An earlier run that never restored the device: reading its state now
  // would "restore" to that run's last cell.
  if (existsSync(DEVICE_STATE_FILE)) fail("An earlier sweep left a matrix cell applied. Run `node ui-sweep.mjs --restore` first.");
  if (!sh("pm", "list", "packages", APP_ID).includes(APP_ID)) fail(`${APP_ID} is not installed on ${DEVICE} (README.md: debug APK).`);
  if (NEEDS_METRO && !(await reachable(`http://localhost:${METRO_PORT}/status`, "packager-status:running"))) {
    fail(`Metro is not running on ${METRO_PORT}. Start it as README.md says (port 8095, EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4100).`);
  }
  const { env: roleEnv, secrets, signsIn } = signInEnv(flows);
  if (!(await reachable(`${BACKEND}/health`, '"up"'))) {
    if (signsIn) fail(`The backend is not up on ${BACKEND}. Run ./backend.sh.`);
    console.log(`[sweep] ⚠ backend not up on ${BACKEND}; fine for signed-out screens only.`);
  }

  const before = readDeviceState();
  writeFileSync(DEVICE_STATE_FILE, JSON.stringify(before));
  console.log(`[sweep] device ${DEVICE}, was ${JSON.stringify(before)}`);
  // The AVD reports a hardware keyboard, which hides the soft one — and the
  // keyboard-open shots are half the point.
  sh("settings", "put", "secure", "show_ime_with_hard_keyboard", "1");

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    restoreDevice(before);
  };
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });

  const runDir = path.join(OUTPUT_ROOT, args.into ?? timestamp());
  if (args.into && !existsSync(runDir)) fail(`No earlier run at ${runDir}.`);
  mkdirSync(runDir, { recursive: true });
  console.log(`[sweep] writing to ${runDir}`);

  const results =
    args.into && existsSync(path.join(runDir, "results.json")) ? JSON.parse(readFileSync(path.join(runDir, "results.json"), "utf8")) : [];
  const sheetCells = CELLS.filter((cell) => cells.includes(cell) || results.some((r) => r.cell === cell.id));
  try {
    for (const cell of cells) {
      const cellDir = path.join(runDir, cell.id);
      mkdirSync(cellDir, { recursive: true });
      applyCell(cell);
      for (const flow of flows) {
        console.log(`\n[sweep] ── ${cell.id} / ${flow} ──`);
        const started = Date.now();
        const prefix = `${path.basename(flow).split("-")[0]}-`;
        for (const old of readdirSync(cellDir).filter((name) => name.startsWith(prefix))) rmSync(path.join(cellDir, old));
        const scratchDir = path.join(runDir, ".maestro");
        const passed = await runMaestro(path.join(SWEEP_DIR, flow), { ...roleEnv, THEME: cell.theme }, scratchDir, secrets);
        collectShots(scratchDir, cellDir, prefix);
        if (!passed) captureFailure(path.join(cellDir, `${prefix}zz-FAILED.png`));
        const previous = results.findIndex((r) => r.cell === cell.id && r.flow === flow);
        if (previous !== -1) results.splice(previous, 1);
        results.push({ cell: cell.id, flow, passed, seconds: Math.round((Date.now() - started) / 1000) });
        writeSheet(runDir, sheetCells, results);
      }
    }
  } finally {
    restore();
    writeSheet(runDir, sheetCells, results);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n[sweep] ${results.length - failed.length}/${results.length} flow runs completed.`);
  if (failed.length) console.log(`[sweep] incomplete: ${failed.map((f) => `${f.flow} @ ${f.cell}`).join(", ")}`);
  console.log(`[sweep] contact sheet: ${path.join(runDir, "index.html")}`);
}

await main();
