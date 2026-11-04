/**
 * Guard: no Reanimated `Animated.*` element takes a className (or any
 * `*ClassName`) prop. On a device, NativeWind's css-interop flattens the class
 * styles and every inline style into ONE object; when that object also holds a
 * useAnimatedStyle handle, Reanimated's PropsFilter swaps the whole object for
 * the handle's initial value, so the classes (and any plain inline style beside
 * the handle) vanish: the Sign in button lost its background, the tab pill its
 * `absolute`. Jest cannot see it (global.css is mocked, Reanimated runs its web
 * build), hence this source scan. Put the classes on a plain View inside or
 * around the Animated one, and give the Animated one only `style`.
 * `Animated.ScrollView` (Screen) is exempt: it takes classes but never an
 * animated style.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..", "..");
const EXEMPT = new Set(["Animated.ScrollView"]);
const RULE =
  "Reanimated Animated.* elements must not take className: css-interop merges the classes with the " +
  "animated style and Reanimated drops them on device. Put the classes on a plain View instead.";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function offenders(label: string, text: string): string[] {
  const source = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag.startsWith("Animated.") && !EXEMPT.has(tag)) {
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr)) continue;
          const name = attr.name.getText(source);
          if (name === "className" || name.endsWith("ClassName")) {
            const { line } = source.getLineAndCharacterOfPosition(attr.getStart(source));
            found.push(`${label}:${line + 1} <${tag} ${name}=…>`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("no className on Reanimated components", () => {
  it("scans a real source tree", () => {
    expect(sources(join(ROOT, "src")).length).toBeGreaterThan(50);
  });

  it("flags className and *ClassName on Animated.*, but not on plain Views or Animated.ScrollView", () => {
    const sample = [
      '<Animated.View className="a" style={s} />;',
      '<Animated.View style={s}><View className="b" /></Animated.View>;',
      '<Animated.ScrollView className="c" contentContainerClassName="d" />;',
      '<Animated.FlatList contentContainerClassName="e" />;',
    ].join("\n");
    expect(offenders("sample.tsx", sample)).toEqual([
      "sample.tsx:1 <Animated.View className=…>",
      "sample.tsx:4 <Animated.FlatList contentContainerClassName=…>",
    ]);
  });

  it("no source registers an Animated.* component with css-interop", () => {
    // A registration routes EVERY use of that component through css-interop, so even a
    // className-free `style={[plain, animated]}` loses `plain` on device.
    const files = [...sources(join(ROOT, "src")), ...sources(join(ROOT, "app"))];
    const found = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => {
          const name = /\b(?:cssInterop|remapProps)\(\s*(Animated\.\w+)/.exec(line)?.[1];
          return name && !EXEMPT.has(name) ? [`${relative(ROOT, file)}:${i + 1} ${name}`] : [];
        }),
    );
    if (found.length) throw new Error(`${RULE}\n${found.join("\n")}`);
  });

  it("no Animated.* element carries a className", () => {
    const files = [...sources(join(ROOT, "src")), ...sources(join(ROOT, "app"))];
    const found = files.flatMap((file) => offenders(relative(ROOT, file), readFileSync(file, "utf8")));
    if (found.length) throw new Error(`${RULE}\n${found.join("\n")}`);
  });
});
