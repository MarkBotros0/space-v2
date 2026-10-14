// Combines manifest.<role>.json parts (capture.mjs --role) into manifest.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MANIFEST_FILE, USERS_FILE } from "./lib/paths.mjs";
import { toPattern } from "./lib/route-pattern.mjs";

// Re-derive patterns with the current rules (parts may predate a rule fix) and
// keep one entry per pattern, preferring one that captured without error.
function normalise(pages) {
  const byPattern = new Map();
  for (const page of pages) {
    const pattern = toPattern(page.exampleUrl);
    const prev = byPattern.get(pattern);
    if (!prev || (prev.error && !page.error)) byPattern.set(pattern, { ...page, pattern });
  }
  return [...byPattern.values()];
}

const users = JSON.parse(readFileSync(USERS_FILE, "utf8"));
const manifest = { capturedAt: null, viewport: null, roles: {} };
for (const [role, user] of Object.entries(users)) {
  const part = MANIFEST_FILE.replace(/\.json$/, `.${role}.json`);
  if (!user) { manifest.roles[role] = { skipped: "no reference user", pages: [] }; continue; }
  if (!existsSync(part)) { manifest.roles[role] = { skipped: "capture missing", pages: [] }; console.log(`${role}: MISSING`); continue; }
  const p = JSON.parse(readFileSync(part, "utf8"));
  manifest.capturedAt ??= p.capturedAt;
  manifest.viewport ??= p.viewport;
  const pages = normalise(p.pages);
  manifest.roles[role] = { pages };
  console.log(`${role}: ${pages.length} pages (${p.pages.length - pages.length} duplicates dropped)`);
}
writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log("manifest written");
