// Pure parts of the UI sweep (ui-sweep.mjs): the device matrix, argument
// selection, device-state parsing and the contact sheet. No adb, no files.
import path from "node:path";

/**
 * The two phones. Small is the 360×640 dp floor; "iphone" is the capture rig's
 * own 375×812 dp (emulator.sh forces 1125x2436 at 480), the width v1's
 * reference shots were taken at and the shape of the iPhones the app ships to.
 */
export const SCREENS = {
  small: { size: "720x1280", density: "320", label: "Small 360×640dp" },
  iphone: { size: "1125x2436", density: "480", label: "375×812dp" },
};

/**
 * The app sets no font-scale cap (no maxFontSizeMultiplier), so 1.3 is not the
 * ceiling, only the largest step common phones offer without accessibility
 * settings. It is the worst case the sweep checks.
 */
export const FONT_SCALES = ["1.0", "1.3"];

export const NAV_OVERLAYS = {
  "3btn": "com.android.internal.systemui.navbar.threebutton",
  gesture: "com.android.internal.systemui.navbar.gestural",
};

/** v1 and v2 follow the system theme until the user picks one in Settings. */
export const THEMES = ["light", "dark"];

export const CELLS = Object.entries(SCREENS).flatMap(([screen, spec]) =>
  FONT_SCALES.flatMap((font) =>
    Object.keys(NAV_OVERLAYS).flatMap((nav) =>
      THEMES.map((theme) => ({
        id: `${screen}-${font}-${nav}-${theme}`,
        screen: spec,
        font,
        nav,
        theme,
        label: `${spec.label} · font ${font} · ${nav === "3btn" ? "3-button" : "gesture"} · ${theme}`,
      })),
    ),
  ),
);

export function parseArgs(argv) {
  const args = { cells: null, flows: null, into: null, module: null };
  for (const arg of argv) {
    if (arg.startsWith("--cells=")) args.cells = arg.slice("--cells=".length).split(",");
    else if (arg.startsWith("--flows=")) args.flows = arg.slice("--flows=".length).split(",");
    else if (arg.startsWith("--into=")) args.into = arg.slice("--into=".length);
    else if (arg.startsWith("--module=")) args.module = arg.slice("--module=".length) || null;
    else throw new Error(`Unknown argument "${arg}". See the header of ui-sweep.mjs.`);
  }
  return args;
}

/**
 * The flows of one module, from their paths under sweep/ ("s01-signed-out.yaml",
 * "leader-scenarios/s03-dashboard.yaml"). A module is the role whose screens a
 * sheet covers (student, leader, admin, super, ...); its flows sit in
 * `<module>-scenarios/`. The flows beside that folder (the signed-out screens
 * and Settings) sign in as a student, so they belong to the student module.
 * No module = every flow.
 */
export function flowsOfModule(rels, module) {
  if (!module) return rels;
  const folders = module === "student" ? [".", "student-scenarios"] : [`${module}-scenarios`];
  const folderOf = (rel) => path.dirname(rel.replaceAll("\\", "/"));
  const picked = rels.filter((rel) => folders.includes(folderOf(rel)));
  if (picked.length === 0) throw new Error(`No sweep flows for module "${module}" (looked in ${folders.join(", ")} under sweep/).`);
  return picked;
}

/** "student" → "Student UI sweep"; no module → "UI sweep". The title of a sheet and the prefix of its file. */
export function sheetName(module) {
  return module ? `${module.charAt(0).toUpperCase()}${module.slice(1)} UI sweep` : "UI sweep";
}

/**
 * Each requested name is a prefix and may match several items
 * (`--cells=small-1.3` is both nav modes and both themes). Keeps the matrix's
 * own order and drops repeats.
 */
export function pick(all, requested, key, what) {
  if (!requested) return all;
  const picked = new Set();
  for (const name of requested) {
    const matches = all.filter((item) => key(item).startsWith(name));
    if (matches.length === 0) throw new Error(`No ${what} matches "${name}". Available: ${all.map(key).join(", ")}`);
    matches.forEach((item) => picked.add(item));
  }
  return all.filter((item) => picked.has(item));
}

/** `wm size` / `wm density` output → the override if there is one, else the physical value. */
export function parseWm(output) {
  const override = output.match(/Override \w+: (\S+)/);
  const physical = output.match(/Physical \w+: (\S+)/);
  return override?.[1] ?? physical?.[1] ?? null;
}

/** `cmd uimode night` output ("Night mode: yes") → "yes" | "no" | "auto". */
export function parseNightMode(output) {
  return output.match(/Night mode: (\w+)/)?.[1] ?? "no";
}

/** The enabled navbar overlay from `cmd overlay list`, or null. */
export function parseNavOverlay(output) {
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("[x]") && l.includes("systemui.navbar."));
  return line ? line.replace(/^\[x\]\s*/, "") : null;
}

/** Hides every occurrence of each secret in a line of Maestro output. */
export function redact(line, secrets) {
  return secrets.filter(Boolean).reduce((out, s) => out.split(s).join("••••"), line);
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * A flow's title from the first line of its YAML header:
 * "# UI sweep s04 — Season and calendar as a student. Read-only: …" → "Season and calendar as a student".
 */
export function flowTitle(firstLine) {
  const m = String(firstLine).match(/—\s*(.+)$/);
  if (!m) return "";
  const title = m[1].split(/[.:](\s|$)/)[0].trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** "s02-03-settings-password-kbd" → { code: "s02-03", label: "settings password kbd" }. */
function rowLabel(name) {
  if (name.endsWith("-zz-FAILED")) return { code: name.split("-")[0], label: "where the flow stopped" };
  const [flow, step, ...rest] = name.split("-");
  return /^\d+$/.test(step ?? "") ? { code: `${flow}-${step}`, label: rest.join(" ") } : { code: flow, label: [step, ...rest].join(" ") };
}

/**
 * One section per flow, one row per screen, one column per cell (the layout of
 * the NannyApp sweep sheet). `shotsByCell` maps a cell id to the shot names
 * (no extension) it holds. A screen missing from a cell is marked with why,
 * and a failed flow's last screen gets a row of its own. `flowTitles` maps a
 * flow prefix ("s02") to its title; `srcFor(cellId, name)` gives each image's
 * src (default: the PNG beside index.html; build-sheet.mjs embeds them).
 */
export function contactSheetHtml({ title, module = null, cells, shotsByCell, results, flowTitles = {}, srcFor }) {
  const src = srcFor ?? ((cellId, name) => `${cellId}/${name}.png`);
  const names = [...new Set(Object.values(shotsByCell).flat())].sort();
  const flows = [...new Set(names.map((n) => n.split("-")[0]))];

  const whyMissing = (cellId, name) => {
    const flow = name.split("-")[0];
    const result = results.find((r) => r.cell === cellId && r.flow.split("/").pop().startsWith(`${flow}-`));
    if (!result) return "not run";
    return result.passed ? "not reached" : "flow failed";
  };

  const row = (name) => {
    const isFailure = name.endsWith("FAILED");
    const { code, label } = rowLabel(name);
    const cellsHtml = cells
      .map((cell) => {
        if (!(shotsByCell[cell.id] ?? []).includes(name)) {
          return isFailure ? "<td></td>" : `<td class="missing">${whyMissing(cell.id, name)}</td>`;
        }
        const alt = `${escapeHtml(name)} — ${escapeHtml(cell.label)}`;
        return `<td><img loading="lazy" src="${src(cell.id, name)}" alt="${alt}" title="${escapeHtml(`${cell.id}/${name}.png`)}"></td>`;
      })
      .join("");
    return `<tr${isFailure ? ' class="failure"' : ""}><th class="name" scope="row"><code>${escapeHtml(code)}</code>${escapeHtml(label)}</th>${cellsHtml}</tr>`;
  };

  const sections = flows
    .map((flow) => {
      const heading = `<tr class="flow" id="${escapeHtml(flow)}"><th colspan="${cells.length + 1}"><span>${escapeHtml(flow)}</span> ${escapeHtml(flowTitles[flow] ?? "")}</th></tr>`;
      return [heading, ...names.filter((n) => n.split("-")[0] === flow).map(row)].join("\n");
    })
    .join("\n");
  const nav = flows.map((f) => `<a href="#${escapeHtml(f)}" title="${escapeHtml(flowTitles[f] ?? "")}">${escapeHtml(f)}</a>`).join("");

  const failures = results.filter((r) => !r.passed);
  const shotCount = Object.values(shotsByCell).flat().filter((n) => !n.endsWith("FAILED")).length;
  const summary =
    `<b>${names.filter((n) => !n.endsWith("FAILED")).length}</b> screens · <b>${cells.length}</b> device cells · ` +
    `<b>${shotCount}</b> screenshots · <b>${results.length - failures.length}/${results.length}</b> flow runs completed.` +
    (failures.length ? ` Stopped early: ${escapeHtml(failures.map((f) => `${f.flow.split("/").pop()} @ ${f.cell}`).join(", "))}.` : "");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(sheetName(module))}</title>
<style>
  /* A darkroom light table: frames on a dark ground, cells as columns, flows as sections. */
  :root { --ground: #16181a; --frame: #222528; --rule: #33373b; --ink: #e9ece6; --muted: #9aa198;
    --sage: #a9bea0; --chip: #2b3029; --bad: #f19a8e; color-scheme: dark;
    --mono: ui-monospace, "SFMono-Regular", Menlo, monospace; }
  body { margin: 0; background: var(--ground); color: var(--ink); font: 14px/1.45 system-ui, "Segoe UI", sans-serif; }
  .page { padding: 20px 16px 40px; display: grid; gap: 14px; }
  h1 { font-size: 22px; font-weight: 800; margin: 0; }
  .meta { color: var(--muted); margin: 0; max-width: 80ch; }
  .meta b { color: var(--ink); font-variant-numeric: tabular-nums; }
  nav { display: flex; flex-wrap: wrap; gap: 6px; }
  nav a { font: 500 12px var(--mono); color: var(--sage); background: var(--chip); padding: 6px 10px; border-radius: 999px; text-decoration: none; }
  nav a:hover, nav a:focus-visible { color: var(--ground); background: var(--sage); outline: none; }
  .wrap { overflow: auto; max-height: calc(100vh - 150px); border: 1px solid var(--rule); border-radius: 10px; }
  table { border-collapse: separate; border-spacing: 0; }
  thead th { position: sticky; top: 0; z-index: 3; background: var(--ground); font: 500 11px var(--mono); color: var(--muted);
    text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--rule); min-width: 180px; white-space: nowrap; }
  thead th:first-child { left: 0; z-index: 4; }
  th.name { position: sticky; left: 0; z-index: 2; background: var(--ground); text-align: left; vertical-align: top;
    font-weight: 500; font-size: 12px; color: var(--muted); padding: 10px 10px 10px 12px; width: 150px; min-width: 150px; border-right: 1px solid var(--rule); }
  th.name code { display: block; font: 500 12px var(--mono); color: var(--ink); margin-bottom: 2px; }
  tr.flow th { position: sticky; left: 0; text-align: left; background: var(--frame); padding: 14px 12px; font-size: 15px; font-weight: 700; border-block: 1px solid var(--rule); }
  tr.flow th span { font: 500 12px var(--mono); color: var(--sage); margin-right: 6px; }
  td { padding: 8px; vertical-align: top; }
  td img { display: block; width: 180px; max-width: none; border-radius: 6px; background: var(--frame); }
  td.missing { color: var(--muted); font: 11px var(--mono); text-align: center; vertical-align: middle; }
  tr.failure th.name, tr.failure th.name code { color: var(--bad); }
  tr.failure td img { outline: 2px solid var(--bad); }
  @media (max-width: 600px) { th.name { width: 110px; min-width: 110px; } td img { width: 140px; } thead th { min-width: 140px; } }
</style></head>
<body><div class="page">
<h1>${escapeHtml(sheetName(module))} — ${escapeHtml(title)}</h1>
<p class="meta">${summary} Small = 360×640 dp; iPhone size = 375×812 dp. 1.0 / 1.3 = Android font scale. Hover a screenshot for its file name in the run folder.</p>
<nav aria-label="Flows">${nav}</nav>
<div class="wrap"><table>
<thead><tr><th>screen</th>${cells.map((cell) => `<th>${escapeHtml(cell.label)}</th>`).join("")}</tr></thead>
<tbody>
${sections}
</tbody></table></div>
</div></body></html>
`;
}
