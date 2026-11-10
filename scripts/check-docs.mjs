#!/usr/bin/env node
// Fails when a path written in a Claude guide (CLAUDE.md files, docs/rules/) no longer exists, so
// the code maps that point Claude at the right file can't go stale silently. Only backticked
// tokens that start with a known prefix are checked; anything with a placeholder (<x>, *, …) is
// skipped. Run as `pnpm check:docs` (part of `pnpm check`).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rulesDir = path.join(root, "docs/rules");
const files = [
  "CLAUDE.md",
  "apps/backend/CLAUDE.md",
  "apps/mobile/CLAUDE.md",
  ...readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/rules/${f}`),
];

const REPO = ["apps/", "packages/", "docs/", "scripts/", "tools/", ".github/", ".claude/"];
// Prefixes relative to an app, per guide. docs/rules mixes both apps, so a path there passes if
// either app has it.
const BACKEND = {
  "src/": "apps/backend/",
  "lib/": "apps/backend/src/",
  "routes/": "apps/backend/src/",
  "scripts/": "apps/backend/",
};
const MOBILE = {
  "src/": "apps/mobile/",
  "app/": "apps/mobile/",
  "(tabs)/": "apps/mobile/app/(app)/",
  "design/": "apps/mobile/src/",
  "screens/": "apps/mobile/src/",
};
const RULES = [
  { "lib/": "apps/backend/src/", "routes/": "apps/backend/src/", "scripts/": "apps/backend/" },
  { "lib/": "apps/mobile/src/", "design/": "apps/mobile/src/", "screens/": "apps/mobile/src/" },
];
const basesFor = (file) =>
  file === "apps/backend/CLAUDE.md"
    ? [BACKEND]
    : file === "apps/mobile/CLAUDE.md"
      ? [MOBILE]
      : file.startsWith("docs/rules/")
        ? RULES
        : [];

// Written on purpose about something that doesn't exist, or about the other app's file.
const ALLOW = new Map([
  ["CLAUDE.md: apps/admin", '"There is no apps/admin"'],
  ["apps/mobile/CLAUDE.md: src/ui/", '"The legacy kit (src/ui/, src/theme/) is gone"'],
  ["apps/mobile/CLAUDE.md: src/theme/", "same"],
  ["apps/backend/CLAUDE.md: src/lib/app-config.ts", "the mobile app's Sentry config, named in the env section"],
  ["apps/mobile/CLAUDE.md: seasons/new", "an href in the navigation table, not a file"],
  ["apps/mobile/CLAUDE.md: text-muted-foreground/70", "a class name"],
]);

function candidates(token, file) {
  const mapped = basesFor(file).flatMap((bases) =>
    Object.entries(bases)
      .filter(([prefix]) => token.startsWith(prefix))
      .map(([, base]) => base + token),
  );
  if (REPO.some((p) => token.startsWith(p))) return [token, ...mapped];
  // The mobile maps write routes, hooks and screens relative to their folder; check anything there
  // that looks like a file path.
  if (mapped.length === 0 && file === "apps/mobile/CLAUDE.md" && /\/|\.tsx?$/.test(token)) {
    return [
      "app/(app)/",
      "app/",
      "src/hooks/",
      "src/screens/",
      "src/design/",
      "src/design/ui/",
      "src/components/",
      "src/__tests__/",
      "src/",
    ]
      .map((dir) => `apps/mobile/${dir}${token}`)
      .concat(`packages/shared/src/${token}`);
  }
  return mapped;
}

const missing = [];
let checked = 0;
for (const file of files) {
  const text = readFileSync(path.join(root, file), "utf8");
  for (const [, raw] of text.matchAll(/`([^`\n]+)`/g)) {
    const token = raw.replace(/[.,;:]$/, "").replace(/:\d+(-\d+)?$/, "");
    if (/[<>*…{}\s]|\.\.\.|^\/|:\/\//.test(token)) continue;
    const paths = candidates(token, file);
    if (paths.length === 0 || ALLOW.has(`${file}: ${token}`)) continue;
    checked += 1;
    if (!paths.some((p) => existsSync(path.join(root, p)))) missing.push(`${file}: \`${token}\``);
  }
}

if (missing.length > 0) {
  console.error(`check:docs: ${missing.length} path(s) in the Claude guides don't exist:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`check:docs: ${checked} paths in ${files.length} guides all exist.`);
