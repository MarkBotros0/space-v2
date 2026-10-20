#!/usr/bin/env node
/**
 * Merges one or more ui-sweep.mjs run folders into a single self-contained
 * contact sheet: every screenshot embedded (shrunk to a 360px-wide JPEG when
 * ImageMagick's `convert` is there, the PNG as is otherwise), so the page
 * opens on its own, with no folder beside it.
 *
 *   node build-sheet.mjs [--module=<role>] <out.html> <run folder>...
 *
 * The CI workflow sweeps the 16 cells in parallel jobs, one run folder each,
 * and joins them here. On the devbox the shots are real users: never publish
 * the result.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./lib/paths.mjs";
import { CELLS, contactSheetHtml, flowTitle, flowsOfModule } from "./lib/sweep.mjs";

const argv = process.argv.slice(2);
const module = argv.find((a) => a.startsWith("--module="))?.slice("--module=".length) || null;
const [out, ...runDirs] = argv.filter((a) => !a.startsWith("--module="));
if (!out || runDirs.length === 0) {
  console.error("usage: node build-sheet.mjs [--module=<role>] <out.html> <run folder>...");
  process.exit(1);
}

const results = [];
const dirOfCell = {};
for (const dir of runDirs) {
  const file = path.join(dir, "results.json");
  if (existsSync(file)) results.push(...JSON.parse(readFileSync(file, "utf8")));
  for (const cell of CELLS) if (existsSync(path.join(dir, cell.id))) dirOfCell[cell.id] = path.join(dir, cell.id);
}
const cells = CELLS.filter((cell) => dirOfCell[cell.id]);
const shotsByCell = Object.fromEntries(
  cells.map((cell) => [
    cell.id,
    readdirSync(dirOfCell[cell.id])
      .filter((n) => n.endsWith(".png"))
      .map((n) => n.replace(/\.png$/, "")),
  ]),
);

const sweepDir = path.join(REPO_ROOT, "apps/mobile/.maestro/sweep");
const flowTitles = {};
const flowFiles = readdirSync(sweepDir, { recursive: true })
  .map(String)
  .filter((rel) => /^s\d+.*\.yaml$/.test(path.basename(rel)));
for (const rel of flowsOfModule(flowFiles, module)) {
  flowTitles[path.basename(rel).split("-")[0]] = flowTitle(readFileSync(path.join(sweepDir, rel), "utf8").split("\n")[0]);
}

const hasConvert = spawnSync("convert", ["-version"]).status === 0;
const srcFor = (cellId, name) => {
  const png = path.join(dirOfCell[cellId], `${name}.png`);
  if (hasConvert) {
    const jpg = spawnSync("convert", [png, "-resize", "360x", "-quality", "72", "jpg:-"], { maxBuffer: 64 * 1024 * 1024 });
    if (jpg.status === 0) return `data:image/jpeg;base64,${jpg.stdout.toString("base64")}`;
  }
  return `data:image/png;base64,${readFileSync(png).toString("base64")}`;
};

writeFileSync(out, contactSheetHtml({ title: "contact sheet", module, cells, shotsByCell, results, flowTitles, srcFor }));
const shots = Object.values(shotsByCell).flat().length;
console.log(`[sheet] ${cells.length} cells, ${shots} screenshots, ${results.length} flow runs -> ${out}`);
