import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";

// Same require-with-type pattern role-tabs.test.tsx uses for node built-ins.
const fs = require("node:fs") as typeof NodeFs;
const path = require("node:path") as typeof NodePath;

/** `apps/mobile/app/(app)` — the Tabs group every authenticated screen lives in. */
export const APP_GROUP_DIR = path.resolve(__dirname, "../../../app/(app)");

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

function walkDirs(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return [full, ...walkDirs(full)];
    });
}

function toRouteName(file: string): string {
  return path.relative(APP_GROUP_DIR, file).replace(/\.tsx$/, "").split(path.sep).join("/");
}

/**
 * The route name (the `name` `Tabs.Screen` takes) of every screen file under
 * app/(app): path relative to the group, extension dropped, `/`-separated.
 * `_layout.tsx` is the navigator, not a screen.
 */
export function listRouteNames(): string[] {
  return walkFiles(APP_GROUP_DIR)
    .filter((file) => file.endsWith(".tsx") && path.basename(file) !== "_layout.tsx")
    .map(toRouteName);
}

export function readRouteSource(routeName: string): string {
  return fs.readFileSync(path.join(APP_GROUP_DIR, `${routeName}.tsx`), "utf8");
}

/**
 * Directories that have a same-named sibling file (`x.tsx` beside `x/`).
 * expo-router resolves that pair ambiguously; ruling X7 mandates the
 * directory form `x/index.tsx` instead. Returned as route names.
 */
export function ambiguousRouteSiblings(): string[] {
  return walkDirs(APP_GROUP_DIR)
    .filter((dir) => fs.existsSync(`${dir}.tsx`))
    .map((dir) => toRouteName(`${dir}.tsx`));
}
