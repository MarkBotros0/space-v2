/**
 * Guard (owner, 2026-11-07): motion is calm and quick in an educational app,
 * never cartoonish. No springs (they overshoot and bounce), no entrance or
 * layout animations (list cascades, fades on mount), no looping beyond the
 * loading skeleton, no scale on press. Anything that moves uses withTiming
 * with EASE_OUT and stops dead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const BANNED: [RegExp, string][] = [
  [/\bwithSpring\b/, "withSpring (use withTiming + EASE_OUT)"],
  [/\bentering=|\bexiting=|\blayout=\{/, "an entering/exiting/layout animation"],
  [
    /\b(FadeIn|FadeInDown|FadeInUp|SlideIn\w*|ZoomIn\w*|BounceIn\w*|LinearTransition)\b/,
    "a Reanimated layout animation",
  ],
  [/\bwithSequence\b/, "a sequenced (pulse) animation"],
  [/\bscale:\s*\w+\.value\b/, "a scale animation"],
];
// The skeleton's shimmer is the one loop allowed.
const LOOP_ALLOWED = new Set(["src/design/ui/skeleton.tsx"]);

it("uses no springs, entrance animations, pulses or scale animations", () => {
  const offences: string[] = [];
  for (const file of [...sources(join(ROOT, "app")), ...sources(join(ROOT, "src"))]) {
    const rel = relative(ROOT, file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.trim().startsWith("*") || line.trim().startsWith("//")) return;
        for (const [re, what] of BANNED) if (re.test(line)) offences.push(`${rel}:${i + 1} ${what}`);
        if (/\bwithRepeat\b/.test(line) && !LOOP_ALLOWED.has(rel)) offences.push(`${rel}:${i + 1} a looping animation`);
      });
  }
  expect(offences).toEqual([]);
});
