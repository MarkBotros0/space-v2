// Moves files inside apps/mobile and rewrites every relative module specifier that points at a
// moved file (imports, export-from, jest.mock / requireActual / doMock, require, import()).
// Usage: node move-mobile.mjs <apps/mobile dir> <mapping.txt> [--dry]
// mapping.txt: "old -> new" per line, paths relative to apps/mobile/.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MOBILE = path.resolve(process.argv[2] ?? "");
if (!existsSync(path.join(MOBILE, "app")) || !existsSync(path.join(MOBILE, "src"))) {
  console.error("usage: node move-mobile.mjs <apps/mobile dir> <mapping.txt> [--dry]");
  process.exit(1);
}
const [, , , mappingFile, flag] = process.argv;
const dry = flag === "--dry";

const moves = new Map(); // abs old -> abs new
for (const line of readFileSync(mappingFile, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const [from, to] = t.split("->").map((s) => s.trim());
  const absFrom = path.join(MOBILE, from);
  if (!existsSync(absFrom)) throw new Error(`missing: ${from}`);
  if (existsSync(path.join(MOBILE, to))) throw new Error(`target exists: ${to}`);
  moves.set(absFrom, path.join(MOBILE, to));
}
const targets = new Set(moves.values());
if (targets.size !== moves.size) throw new Error("two files move to one path");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}
const files = [...walk(path.join(MOBILE, "app")), ...walk(path.join(MOBILE, "src"))];

const EXTS = [".ts", ".tsx", ".js", ".jsx"];
function resolve(base) {
  if (existsSync(base) && statSync(base).isFile()) return { file: base, how: "exact" };
  for (const e of EXTS) if (existsSync(base + e)) return { file: base + e, how: "ext" };
  for (const e of EXTS) {
    const idx = path.join(base, "index" + e);
    if (existsSync(idx)) return { file: idx, how: "index" };
  }
  return null;
}
const newPathOf = (abs) => moves.get(abs) ?? abs;

function specifier(fromDir, target, how, original) {
  let rel;
  if (how === "exact") rel = path.relative(fromDir, target);
  else if (how === "ext") rel = path.relative(fromDir, target).replace(/\.(tsx?|jsx?)$/, "");
  else rel = path.relative(fromDir, path.dirname(target));
  if (!rel.startsWith(".")) rel = "./" + rel;
  if (original.endsWith("/") && !rel.endsWith("/")) rel += "/";
  return rel;
}

const SPEC = /(['"])(\.{1,2}\/[^'"\n]*)\1/g;
let changedFiles = 0;
let rewrites = 0;
const out = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const oldDir = path.dirname(file);
  const newDir = path.dirname(newPathOf(file));
  const next = text.replace(SPEC, (whole, q, spec) => {
    const r = resolve(path.resolve(oldDir, spec));
    if (!r) return whole;
    // An index import whose folder moves only in part can't be expressed as a folder; fail loudly.
    if (r.how === "index" && moves.has(r.file)) throw new Error(`index import of a moved file: ${file}: ${spec}`);
    const target = newPathOf(r.file);
    if (target === r.file && newDir === oldDir) return whole;
    const s = specifier(newDir, target, r.how, spec);
    if (s === spec) return whole;
    rewrites += 1;
    return q + s + q;
  });
  if (next !== text || moves.has(file)) out.set(file, next);
  if (next !== text) changedFiles += 1;
}

console.log(`${moves.size} moves, ${rewrites} specifiers rewritten in ${changedFiles} files`);
if (dry) process.exit(0);

for (const [from, to] of moves) {
  execFileSync("mkdir", ["-p", path.dirname(to)]);
  execFileSync("git", ["-C", MOBILE, "mv", from, to]);
}
for (const [file, text] of out) writeFileSync(newPathOf(file), text);
console.log("done");
