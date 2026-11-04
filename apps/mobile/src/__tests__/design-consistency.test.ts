/**
 * Guard: every screen draws with the design system's tokens, not literals.
 * Scans the string literals (class strings, style values) of `app/**` and
 * `src/**` — comments are not code, so a v1 class quoted in a comment is
 * fine — and fails on:
 *   - a hex colour (`#1F3260`) or an `rgb(`/`rgba(` colour: use a token class,
 *     `useThemeColors()` or `palette` (src/design/theme/);
 *   - a `shadow-` class: cards are flat surfaces in the redesign; elevation is
 *     the design kit's call (`design/lib/shadow.ts`), never a screen's;
 * and, outside `src/design/` (which owns the scale):
 *   - a `rounded-sm|md|lg|xl` class (also per side/corner): groups are 16,
 *     buttons 14, chips full — take the shape from a component;
 *   - a raw `fontSize: <number>`: use a Text `variant`.
 * `src/design/theme/` (the token source and its generated output) and tests
 * are not scanned. Plans 02–05 keep this green and delete each legacy
 * component when its last user migrates.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..", "..");
const DESIGN = `src${sep}design${sep}`;
const THEME = `src${sep}design${sep}theme${sep}`;

const EVERYWHERE: [RegExp, string][] = [
  [/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/, "hex colour"],
  [/\brgba?\(/, "rgb()/rgba() colour"],
  [/(?:^|[\s:"'`])shadow-/, "shadow- class"],
];
const OUTSIDE_DESIGN: [RegExp, string][] = [
  [/(?:^|[\s:"'`])rounded(?:-[trblse]{1,2})?-(?:sm|md|lg|xl)(?![\w-])/, "rounded-sm|md|lg|xl class"],
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Offences in one file, as `label:line what — text`. */
function offences(label: string, text: string, inDesign: boolean): string[] {
  const source = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rules = inDesign ? EVERYWHERE : [...EVERYWHERE, ...OUTSIDE_DESIGN];
  const found: string[] = [];
  const report = (node: ts.Node, what: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const snippet = node.getText(source).replace(/\s+/g, " ").slice(0, 90);
    found.push(`${label}:${line + 1} ${what} — ${snippet}`);
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      // `import "x"` / `require("x")` paths are not styles.
      if (!ts.isImportDeclaration(node.parent) && !ts.isExternalModuleReference(node.parent)) {
        for (const [pattern, what] of rules) if (pattern.test(node.text)) report(node, what);
      }
    }
    if (
      !inDesign &&
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === "fontSize" &&
      ts.isNumericLiteral(node.initializer)
    ) {
      report(node, "raw fontSize");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("design consistency", () => {
  it("scans real source trees", () => {
    expect(sources(join(ROOT, "src")).length).toBeGreaterThan(100);
    expect(sources(join(ROOT, "app")).length).toBeGreaterThan(50);
  });

  it("flags literals, shadows, radii and font sizes, and skips comments", () => {
    const sample = [
      "// v1: rounded-lg shadow-sm #fff",
      'const a = "rounded-lg border";',
      'const b = { color: "#1F3260", fontSize: 13 };',
      "const c = `px-2 ${x} shadow-soft`;",
      'const d = "rgba(0, 0, 0, 0.5)";',
      'const e = "rounded-2xl rounded-full rounded-[14px] rounded-t-md";',
    ].join("\n");
    const lines = offences("s.tsx", sample, false).map((o) => o.split(" — ")[0]);
    expect(lines).toEqual([
      "s.tsx:2 rounded-sm|md|lg|xl class",
      "s.tsx:3 hex colour",
      "s.tsx:3 raw fontSize",
      "s.tsx:4 shadow- class",
      "s.tsx:5 rgb()/rgba() colour",
      "s.tsx:6 rounded-sm|md|lg|xl class",
    ]);
    // src/design owns the radius and type scales, not the colours.
    expect(offences("s.tsx", sample, true).map((o) => o.split(" — ")[0])).toEqual([
      "s.tsx:3 hex colour",
      "s.tsx:4 shadow- class",
      "s.tsx:5 rgb()/rgba() colour",
    ]);
  });

  it("app/ and src/ use tokens, not literals", () => {
    const files = [...sources(join(ROOT, "src")), ...sources(join(ROOT, "app"))];
    const found = files.flatMap((file) => {
      const label = relative(ROOT, file);
      if (label.startsWith(THEME)) return [];
      return offences(label, readFileSync(file, "utf8"), label.startsWith(DESIGN));
    });
    if (found.length) {
      throw new Error(
        `${found.length} design-consistency offences (use tokens / useThemeColors() / palette, ` +
          `component shapes and Text variants):\n${found.join("\n")}`,
      );
    }
  });
});
