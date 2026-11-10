// pnpm check:size — the 400-line rule over every tracked source file (refactor Wave 7), including
// what ESLint's max-lines never sees (backend scripts/, tools/, root scripts/, .js/.mjs files).
// Generated code, migrations, lockfiles and Markdown are out of scope. Exits 1 on any file over.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX = 400;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs"],
  { cwd: root },
)
  .toString()
  .split("\n")
  .filter((f) => f && !/(^|\/)(generated|migrations|node_modules|dist)\//.test(f) && !f.endsWith(".d.ts"))
  .filter((f) => existsSync(path.join(root, f)));

const over = files
  .map((f) => ({ f, lines: readFileSync(path.join(root, f), "utf8").split("\n").length - 1 }))
  .filter(({ lines }) => lines > MAX)
  .sort((a, b) => b.lines - a.lines);

console.log(`check:size: ${files.length} files, ${over.length} over ${MAX} lines.`);
for (const { f, lines } of over) console.log(`${lines}\t${f}`);
if (over.length) process.exit(1);
