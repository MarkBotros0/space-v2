import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("embeds v1 and a stack of v2 shots per pair, self-contained", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "compare-"));
  for (const f of ["v1.png", "a.png", "b.png"]) writeFileSync(path.join(dir, f), PNG);
  const out = path.join(dir, "out.html");
  execFileSync("node", ["compare.mjs", "--out", out, "--pair", "Light", path.join(dir, "v1.png"), `${path.join(dir, "a.png")},${path.join(dir, "b.png")}`]);
  const html = readFileSync(out, "utf8");
  assert.match(html, /<h2>Light<\/h2>/);
  assert.equal((html.match(/data:image\/png;base64,/g) ?? []).length, 3);
  assert.doesNotMatch(html, /src="\//);
});
