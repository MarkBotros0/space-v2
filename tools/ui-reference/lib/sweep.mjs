// Pure parts of the UI sweep (ui-sweep.mjs): the device matrix, argument
// selection, device-state parsing and the contact sheet. No adb, no files.

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
  const args = { cells: null, flows: null, into: null };
  for (const arg of argv) {
    if (arg.startsWith("--cells=")) args.cells = arg.slice("--cells=".length).split(",");
    else if (arg.startsWith("--flows=")) args.flows = arg.slice("--flows=".length).split(",");
    else if (arg.startsWith("--into=")) args.into = arg.slice("--into=".length);
    else throw new Error(`Unknown argument "${arg}". See the header of ui-sweep.mjs.`);
  }
  return args;
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
 * One row per screen, one column per cell. `shotsByCell` maps a cell id to
 * the shot names (no extension) it holds. A screen missing from a cell is
 * marked with why, and a failed flow's last screen gets a row of its own.
 */
export function contactSheetHtml({ title, cells, shotsByCell, results }) {
  const names = [...new Set(Object.values(shotsByCell).flat())].sort();

  const whyMissing = (cellId, name) => {
    const flow = name.split("-")[0];
    const result = results.find((r) => r.cell === cellId && r.flow.startsWith(`${flow}-`));
    if (!result) return "not run";
    return result.passed ? "not reached" : "flow failed";
  };

  const header = cells.map((cell) => `<th>${escapeHtml(cell.label)}</th>`).join("");
  const rows = names
    .map((name) => {
      const isFailure = name.endsWith("FAILED");
      const cellsHtml = cells
        .map((cell) => {
          if (!(shotsByCell[cell.id] ?? []).includes(name)) {
            return isFailure ? "<td></td>" : `<td class="missing">${whyMissing(cell.id, name)}</td>`;
          }
          const src = `${cell.id}/${name}.png`;
          return `<td><a href="${src}" target="_blank"><img loading="lazy" src="${src}" alt="${escapeHtml(name)} — ${escapeHtml(cell.label)}"></a></td>`;
        })
        .join("");
      return `<tr${isFailure ? ' class="failure"' : ""}><th class="name">${escapeHtml(name)}</th>${cellsHtml}</tr>`;
    })
    .join("\n");

  const failures = results.filter((r) => !r.passed);
  const summary =
    `${names.filter((n) => !n.endsWith("FAILED")).length} screens · ${cells.length} cells · ` +
    `${results.length - failures.length}/${results.length} flow runs completed` +
    (failures.length ? ` · failed: ${failures.map((f) => `${f.flow} @ ${f.cell}`).join(", ")}` : "");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI sweep</title>
<style>
  :root { --bg: #f8fafc; --fg: #0f172a; --muted: #64748b; --line: #e2e8f0; --bad: #b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b1220; --fg: #e2e8f0; --muted: #94a3b8; --line: #1e293b; --bad: #fca5a5; } }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: var(--muted); }
  .wrap { overflow: auto; max-height: calc(100vh - 90px); }
  table { border-collapse: separate; border-spacing: 0; }
  th, td { border-bottom: 1px solid var(--line); padding: 6px; vertical-align: top; }
  thead th { position: sticky; top: 0; background: var(--bg); z-index: 2; font-size: 12px; text-align: left; min-width: 180px; }
  th.name { position: sticky; left: 0; background: var(--bg); z-index: 1; text-align: left; font: 12px ui-monospace, monospace; white-space: nowrap; }
  img { width: 180px; display: block; border: 1px solid var(--line); border-radius: 6px; }
  td.missing { color: var(--muted); font-size: 12px; text-align: center; }
  tr.failure th.name { color: var(--bad); }
  tr.failure td img { border-color: var(--bad); }
</style></head>
<body>
<h1>UI sweep — ${escapeHtml(title)}</h1>
<p>${escapeHtml(summary)}</p>
<div class="wrap"><table>
<thead><tr><th class="name">screen</th>${header}</tr></thead>
<tbody>
${rows}
</tbody></table></div>
</body></html>
`;
}
