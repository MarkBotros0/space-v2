import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";

// Same require-with-type pattern role-tabs.test.tsx uses for node built-ins.
const fs = require("node:fs") as typeof NodeFs;
const path = require("node:path") as typeof NodePath;

/** `apps/mobile/app` — every route file. */
export const APP_DIR = path.resolve(__dirname, "../../../app");

/** `apps/mobile/app/(app)` — the signed-in Stack: detail routes, with the tabs group at its bottom. */
export const APP_GROUP_DIR = path.join(APP_DIR, "(app)");

/** `apps/mobile/app/(app)/(tabs)` — the Tabs group every nav destination lives in. */
export const TABS_GROUP_DIR = path.join(APP_GROUP_DIR, "(tabs)");

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

function toRouteName(file: string, base = APP_GROUP_DIR): string {
  return path.relative(base, file).replace(/\.tsx$/, "").split(path.sep).join("/");
}

function screenFiles(dir: string): string[] {
  return walkFiles(dir).filter((file) => file.endsWith(".tsx") && path.basename(file) !== "_layout.tsx");
}

/**
 * The route name (the `name` `Tabs.Screen` takes) of every screen file under
 * app/(app)/(tabs): path relative to the group, extension dropped,
 * `/`-separated. `_layout.tsx` is the navigator, not a screen.
 */
export function listTabRouteNames(): string[] {
  return screenFiles(TABS_GROUP_DIR).map((file) => toRouteName(file, TABS_GROUP_DIR));
}

/**
 * The route name (the `name` `Stack.Screen` takes) of every screen file under
 * app/(app) outside the tabs group: the detail routes.
 */
export function listDetailRouteNames(): string[] {
  return screenFiles(APP_GROUP_DIR)
    .filter((file) => !file.startsWith(TABS_GROUP_DIR + path.sep))
    .map((file) => toRouteName(file));
}

/** "(app)/(tabs)/students/index" → "/students": groups add no URL segment, `index` is its directory. */
export function urlOfRouteName(routeName: string): string {
  const parts = routeName.split("/").filter((part) => !/^\(.*\)$/.test(part));
  if (parts[parts.length - 1] === "index") parts.pop();
  return `/${parts.join("/")}`;
}

/**
 * The URL pattern a route answers: dynamic segments normalised (`[id]` and
 * `[publicId]` both → `[]`), since `/student/1` matches either name.
 */
export function urlPatternOfRouteName(routeName: string): string {
  return urlOfRouteName(routeName).replace(/\[[^\]/]+\]/g, "[]");
}

/**
 * URLs that more than one route file under app/ resolves to. Splitting a
 * directory across groups (`(tabs)/students/index.tsx` beside
 * `students/new.tsx`) is fine; two files answering the same URL is not —
 * expo-router silently picks one. `student/[id]` in one group and
 * `student/[publicId]` in another count as the same URL.
 */
export function duplicateRouteUrls(): string[] {
  const seen = new Map<string, string[]>();
  for (const file of screenFiles(APP_DIR)) {
    const url = urlPatternOfRouteName(toRouteName(file, APP_DIR));
    seen.set(url, [...(seen.get(url) ?? []), toRouteName(file, APP_DIR)]);
  }
  return [...seen.values()].filter((files) => files.length > 1).map((files) => files.join(" + "));
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
