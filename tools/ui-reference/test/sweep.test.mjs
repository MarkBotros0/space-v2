import { test } from "node:test";
import assert from "node:assert/strict";
import { CELLS, contactSheetHtml, parseArgs, parseNavOverlay, parseNightMode, parseWm, pick, redact } from "../lib/sweep.mjs";

test("the matrix is screen × font × nav × theme, 16 cells", () => {
  assert.equal(CELLS.length, 16);
  assert.equal(CELLS[0].id, "small-1.0-3btn-light");
  assert.equal(new Set(CELLS.map((c) => c.id)).size, 16);
});

test("pick takes prefixes, keeps matrix order, drops repeats", () => {
  const ids = pick(CELLS, ["iphone-1.0-gesture-dark", "small-1.3"], (c) => c.id, "cell").map((c) => c.id);
  assert.deepEqual(ids, [
    "small-1.3-3btn-light",
    "small-1.3-3btn-dark",
    "small-1.3-gesture-light",
    "small-1.3-gesture-dark",
    "iphone-1.0-gesture-dark",
  ]);
  assert.equal(pick(CELLS, null, (c) => c.id, "cell"), CELLS);
  assert.throws(() => pick(CELLS, ["tablet"], (c) => c.id, "cell"), /No cell matches "tablet"/);
});

test("parseArgs rejects unknown flags", () => {
  assert.deepEqual(parseArgs(["--cells=small", "--flows=s01,s02"]), { cells: ["small"], flows: ["s01", "s02"], into: null });
  assert.throws(() => parseArgs(["--ai"]), /Unknown argument/);
});

test("device-state parsers read adb output", () => {
  assert.equal(parseWm("Physical size: 1126x2436\nOverride size: 1125x2436"), "1125x2436");
  assert.equal(parseWm("Physical density: 480"), "480");
  assert.equal(parseNightMode("Night mode: yes"), "yes");
  assert.equal(
    parseNavOverlay("com.android.internal.systemui.navbar.gestural\n    [ ] com.android.internal.systemui.navbar.threebutton\n    [x] com.android.internal.systemui.navbar.gestural"),
    "com.android.internal.systemui.navbar.gestural",
  );
});

test("redact blanks every occurrence of a secret", () => {
  assert.equal(redact('Input text "hunter2" … hunter2', ["hunter2", ""]), 'Input text "••••" … ••••');
});

test("contact sheet marks missing and failed shots", () => {
  const cells = CELLS.slice(0, 2);
  const html = contactSheetHtml({
    title: "t",
    cells,
    shotsByCell: { [cells[0].id]: ["s01-01-login", "s02-zz-FAILED"], [cells[1].id]: [] },
    results: [
      { cell: cells[0].id, flow: "s01-signed-out.yaml", passed: true },
      { cell: cells[1].id, flow: "s01-signed-out.yaml", passed: false },
      { cell: cells[0].id, flow: "s02-x.yaml", passed: false },
    ],
  });
  assert.match(html, /<td class="missing">flow failed<\/td>/);
  assert.match(html, /<tr class="failure"><th class="name">s02-zz-FAILED/);
  assert.match(html, /1\/3 flow runs completed/);
});

test("the contact sheet finds a flow kept in a sub-folder by its file name", () => {
  const cells = CELLS.slice(0, 2);
  const html = contactSheetHtml({
    title: "t",
    cells,
    shotsByCell: { [cells[0].id]: ["s03-01-dashboard"], [cells[1].id]: [] },
    results: [
      { cell: cells[0].id, flow: "student-scenarios/s03-dashboard.yaml", passed: true },
      { cell: cells[1].id, flow: "student-scenarios/s03-dashboard.yaml", passed: false },
    ],
  });
  assert.match(html, /<td class="missing">flow failed<\/td>/);
});
