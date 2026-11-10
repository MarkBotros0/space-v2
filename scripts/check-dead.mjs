// pnpm check:dead — the dead-code guardrail (refactor Wave 7, DC-*). No dependency beyond the
// TypeScript compiler already in the repo (owner, Q10).
//
// Lists every exported declaration in production source whose name appears in no other tracked
// file: either nothing uses it (delete it) or only its own file does (drop the `export`). Names are
// matched as whole words across every tracked .ts/.tsx/.js/.mjs/.cjs/.json/.yaml file, tests and
// Maestro flows included, so a symbol only a test or a string reaches is not reported.
// Exits 1 when it finds any. An export that must stay goes in scripts/check-dead.allow with a reason.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...globs) =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...globs], { cwd: root })
    .toString()
    .split("\n")
    .filter((f) => f && !f.includes("/generated/") && existsSync(path.join(root, f)));

const SOURCES = [
  "apps/backend/src/*.ts",
  "apps/backend/scripts/*.ts",
  "apps/mobile/app/*.ts",
  "apps/mobile/app/*.tsx",
  "apps/mobile/src/*.ts",
  "apps/mobile/src/*.tsx",
  "packages/shared/src/*.ts",
];
const isTest = (f) => /(^|\/)(__tests__|__mocks__)\//.test(f) || /\.test\.tsx?$/.test(f);
// expo-router reads these named exports off a route file itself.
const ROUTER_EXPORTS = new Set(["unstable_settings", "ErrorBoundary", "generateStaticParams"]);

const allowPath = path.join(root, "scripts/check-dead.allow");
const allow = new Set(
  existsSync(allowPath)
    ? readFileSync(allowPath, "utf8")
        .split("\n")
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean)
    : [],
);

const sources = git(...SOURCES).filter((f) => !isTest(f));
const corpus = git("*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs", "*.json", "*.yaml", "*.yml");
const text = new Map(corpus.map((f) => [f, readFileSync(path.join(root, f), "utf8")]));

function exportedNames(file, src) {
  const names = [];
  const add = (node, name) => names.push({ name, line: src.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
  for (const st of src.statements) {
    if (ts.isExportDeclaration(st)) {
      // `export { a, b }` re-exports and lists; `export *` names nothing.
      if (st.exportClause && ts.isNamedExports(st.exportClause))
        for (const el of st.exportClause.elements) add(el, el.name.text);
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) add(d, d.name.text);
    } else if (st.name && ts.isIdentifier(st.name)) add(st, st.name.text);
  }
  return names;
}

const found = [];
for (const file of sources) {
  const src = ts.createSourceFile(file, text.get(file), ts.ScriptTarget.Latest, true);
  const isRoute = file.startsWith("apps/mobile/app/");
  for (const { name, line } of exportedNames(file, src)) {
    if (isRoute && ROUTER_EXPORTS.has(name)) continue;
    if (allow.has(`${file}:${name}`)) continue;
    const re = new RegExp(`(^|[^A-Za-z0-9_$])${name.replace(/\$/g, "\\$")}($|[^A-Za-z0-9_$])`);
    let elsewhere = false;
    for (const [g, body] of text)
      if (g !== file && re.test(body)) {
        elsewhere = true;
        break;
      }
    if (!elsewhere) found.push(`${file}:${line}  ${name}`);
  }
}

console.log(`check:dead: ${sources.length} source files, ${found.length} export(s) nothing else names.`);
if (found.length) {
  console.log(found.join("\n"));
  console.log("Delete each, drop its `export` if only its own file uses it, or list it in scripts/check-dead.allow.");
  process.exit(1);
}
