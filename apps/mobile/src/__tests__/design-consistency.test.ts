/**
 * Guard: every screen draws with the design system's tokens, not literals.
 * Scans the string literals (class strings, style values) and style objects
 * of `app/**` and `src/**` — comments are not code, so a v1 class quoted in a
 * comment is fine — and fails on:
 *   - a hex colour (`#1F3260`) or an `rgb(`/`rgba(` colour: use a token class,
 *     `useThemeColors()` or `palette` (src/design/theme/);
 *   - a `shadow-` class: cards are flat surfaces in the redesign;
 *   - a light-mode `text-brand-teal-50`…`-600`: under 3:1 on a white card, so
 *     neither text nor icons pass (use 700 for icons, 800 for text, and a
 *     `dark:` 300/400). Chips on a navy box (`season-colors.ts`) are exempt;
 * and, outside `src/design/` (which owns the scales):
 *   - any radius but the named shapes: `rounded-full` (chips, discs),
 *     `rounded-group` (16: cards, groups), `rounded-control` (14: buttons,
 *     fields, option rows, callouts), `rounded-none`, each also per side or
 *     corner (`rounded-t-group`); never a step (`rounded-lg`, `rounded-2xl`), a
 *     bare `rounded` or a bracket value (`rounded-[16px]`);
 *   - a raw font size: `fontSize: <number>`, `text-[11px]`, `text-[0.7rem]`,
 *     `leading-[18px]`: use a Text `variant` (never under the caption, 12);
 *   - elevation: `shadowStyle(…)`, `elevation:` or `boxShadow:`; elevation is
 *     the kit's call (overlays), never a screen's. The one exception is the
 *     design catalogue's sections (`src/screens/design-catalogue/`), which may
 *     demonstrate the shadow tokens.
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
const SHOWCASE = `src${sep}screens${sep}design-catalogue${sep}`;

type Scope = { inDesign: boolean; showcase: boolean; paleTealOk?: boolean };

const EVERYWHERE: [RegExp, string][] = [
  [/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/, "hex colour"],
  [/\brgba?\(/, "rgb()/rgba() colour"],
  [/(?:^|[\s:"'`])shadow-/, "shadow- class"],
];

/** Light-mode teal shades too pale for a white card; `dark:` variants are fine. */
const PALE_TEAL = /^text-brand-teal-(?:50|[1-6]00)$/;
const PALE_TEAL_OK = `src${sep}design${sep}sessions${sep}season-colors.ts`;

function paleTeal(text: string): string[] {
  return text
    .split(/[\s"'`]+/)
    .filter((c) => !c.includes("dark:") && PALE_TEAL.test(c.slice(c.lastIndexOf(":") + 1)))
    .map((c) => `pale teal ${c} (under 3:1 on white: 700 icons, 800 text)`);
}

const RADIUS = /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(?:-(.+))?$/;
const SHAPES = new Set(["full", "group", "control", "none"]);
const FONT_SIZE = /^(?:text-\[\d+(?:\.\d+)?(?:px|rem|em)?\]|leading-\[\d+(?:\.\d+)?(?:px|rem|em)?\])$/;
const ELEVATION_PROPS = new Set(["elevation", "boxShadow"]);

/** Class names in a string, without variant prefixes (`dark:`, `active:`). */
function classesOf(text: string): string[] {
  return text
    .split(/[\s"'`]+/)
    .map((c) => c.slice(c.lastIndexOf(":") + 1))
    .filter(Boolean);
}

function classRules(text: string): string[] {
  const hits: string[] = [];
  for (const c of classesOf(text)) {
    const radius = RADIUS.exec(c);
    if (radius && !SHAPES.has(radius[1] ?? "")) hits.push(`radius ${c} (use rounded-group|control|full)`);
    if (FONT_SIZE.test(c)) hits.push(`raw font size ${c} (use a Text variant)`);
  }
  return hits;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Offences in one file, as `label:line what — text`. */
function offences(label: string, text: string, { inDesign, showcase, paleTealOk }: Scope): string[] {
  const source = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
        for (const [pattern, what] of EVERYWHERE) if (pattern.test(node.text)) report(node, what);
        if (!paleTealOk) for (const what of paleTeal(node.text)) report(node, what);
        if (!inDesign) for (const what of classRules(node.text)) report(node, what);
      }
    }
    if (!inDesign && ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source);
      if (name === "fontSize" && ts.isNumericLiteral(node.initializer)) report(node, "raw fontSize");
      if (ELEVATION_PROPS.has(name) && !showcase) report(node, `elevation (${name}:)`);
    }
    if (
      !inDesign &&
      !showcase &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "shadowStyle"
    ) {
      report(node, "elevation (shadowStyle)");
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

  it("flags literals, shadows, radii, font sizes and elevation, and skips comments", () => {
    const sample = [
      "// v1: rounded-lg shadow-sm #fff text-[10px]",
      'const a = "rounded-lg border";',
      'const b = { color: "#1F3260", fontSize: 13 };',
      "const c = `px-2 ${x} shadow-soft`;",
      'const d = "rgba(0, 0, 0, 0.5)";',
      'const e = "rounded-full rounded-group rounded-t-control dark:rounded-none";',
      'const f = "rounded-2xl active:rounded-[16px] rounded";',
      'const g = "text-[9px] leading-[18px] text-caption text-sm";',
      'const h = <View style={shadowStyle("soft")} />;',
      "const i = { elevation: 4, boxShadow: x };",
      'const j = "text-brand-teal-600 active:text-brand-teal-500 dark:text-brand-teal-400 text-brand-teal-700";',
    ].join("\n");
    const out = (scope: Scope) => offences("s.tsx", sample, scope).map((o) => o.split(" — ")[0] ?? o);
    expect(out({ inDesign: false, showcase: false })).toEqual([
      "s.tsx:2 radius rounded-lg (use rounded-group|control|full)",
      "s.tsx:3 hex colour",
      "s.tsx:3 raw fontSize",
      "s.tsx:4 shadow- class",
      "s.tsx:5 rgb()/rgba() colour",
      "s.tsx:7 radius rounded-2xl (use rounded-group|control|full)",
      "s.tsx:7 radius rounded-[16px] (use rounded-group|control|full)",
      "s.tsx:7 radius rounded (use rounded-group|control|full)",
      "s.tsx:8 raw font size text-[9px] (use a Text variant)",
      "s.tsx:8 raw font size leading-[18px] (use a Text variant)",
      "s.tsx:9 elevation (shadowStyle)",
      "s.tsx:10 elevation (elevation:)",
      "s.tsx:10 elevation (boxShadow:)",
      "s.tsx:11 pale teal text-brand-teal-600 (under 3:1 on white: 700 icons, 800 text)",
      "s.tsx:11 pale teal active:text-brand-teal-500 (under 3:1 on white: 700 icons, 800 text)",
    ]);
    // The catalogue may demo elevation; it still follows every other rule.
    const showcase = out({ inDesign: false, showcase: true });
    expect(showcase.filter((l) => l.includes("elevation"))).toEqual([]);
    expect(showcase).toContain("s.tsx:7 radius rounded-2xl (use rounded-group|control|full)");
    // src/design owns the radius, type and elevation scales, not the colours.
    expect(out({ inDesign: true, showcase: false })).toEqual([
      "s.tsx:3 hex colour",
      "s.tsx:4 shadow- class",
      "s.tsx:5 rgb()/rgba() colour",
      "s.tsx:11 pale teal text-brand-teal-600 (under 3:1 on white: 700 icons, 800 text)",
      "s.tsx:11 pale teal active:text-brand-teal-500 (under 3:1 on white: 700 icons, 800 text)",
    ]);
    expect(out({ inDesign: true, showcase: false, paleTealOk: true })).not.toContain(
      "s.tsx:11 pale teal text-brand-teal-600 (under 3:1 on white: 700 icons, 800 text)",
    );
  });

  it("app/ and src/ use tokens, not literals", () => {
    const files = [...sources(join(ROOT, "src")), ...sources(join(ROOT, "app"))];
    const found = files.flatMap((file) => {
      const label = relative(ROOT, file);
      if (label.startsWith(THEME)) return [];
      return offences(label, readFileSync(file, "utf8"), {
        inDesign: label.startsWith(DESIGN),
        showcase: label.startsWith(SHOWCASE),
        paleTealOk: label === PALE_TEAL_OK,
      });
    });
    if (found.length) {
      throw new Error(
        `${found.length} design-consistency offences (use tokens / useThemeColors() / palette, ` +
          `named radii, Text variants and kit elevation):\n${found.join("\n")}`,
      );
    }
  });
});
