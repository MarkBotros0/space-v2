import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";

import { ALL_NAV_HREFS, hrefUnion, navByRole, navFor } from "@space/shared";
import type { RoleNav } from "@space/shared";

import { routeNameForHref } from "../../app/(app)/(tabs)/_layout";
import { useSessionStore } from "../store/session";
import { APP_GROUP_DIR, TABS_GROUP_DIR, ambiguousRouteSiblings, duplicateRouteUrls } from "./helpers/routes";

const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null as number | null,
};
const user = (role: "STUDENT" | "ADMIN" | "LEADER") => ({
  id: 1,
  name: "A",
  email: "a@b.test",
  role,
  avatarPath: null,
  hasPassword: true,
});

beforeEach(() => useSessionStore.getState().clear());

describe("role tabs", () => {
  it("shows the student tabs for a student", () => {
    useSessionStore.getState().setSession(user("STUDENT"), scopes);
    expect(useSessionStore.getState().nav()).toBe(navByRole.STUDENT);
  });

  it("shows different tabs for an admin than a student", () => {
    const student = navByRole.STUDENT.tabs.map((t) => t.href);
    const admin = navByRole.ADMIN.tabs.map((t) => t.href);
    expect(admin).not.toEqual(student);
  });

  it("every nav href has a route file in the tabs group", () => {
    // Guards Decision D1: the tab bar is data-driven, so a nav item pointing
    // at a route nobody created is a runtime crash, not a type error.
    // Sourced from ALL_NAV_HREFS (packages/shared/src/navigation.ts) — the
    // single href union the layout itself consumes — rather than re-deriving
    // it here from navByRole + navFor, which is exactly the duplication that
    // let ALUMNI-only routes go unguarded (see the "ALUMNI" describe below).
    const fs = require("node:fs") as typeof NodeFs;
    const path = require("node:path") as typeof NodePath;
    const appDir = TABS_GROUP_DIR;

    const missing = ALL_NAV_HREFS.filter(
      (href) => !fs.existsSync(path.join(appDir, `${href.slice(1)}.tsx`)) &&
        !fs.existsSync(path.join(appDir, href.slice(1), "index.tsx")),
    );
    expect(missing).toEqual([]);
  });

  it("routeNameForHref produces a name that exists on disk for every href", () => {
    // Fix 4: routeNameForHref hardcodes "students" as the one directory
    // route. This test doesn't know that special case — it just checks the
    // function's actual output against the filesystem, so if a future href
    // (e.g. /reports becoming reports/index.tsx) needs the same treatment
    // and doesn't get it, the resulting name silently omits a tab instead of
    // just this test catching it first.
    const fs = require("node:fs") as typeof NodeFs;
    const path = require("node:path") as typeof NodePath;
    const appDir = TABS_GROUP_DIR;

    for (const href of ALL_NAV_HREFS) {
      const name = routeNameForHref(href);
      expect(fs.existsSync(path.join(appDir, `${name}.tsx`))).toBe(true);
    }
  });
});

describe("route file layout (P13)", () => {
  const fs = require("node:fs") as typeof NodeFs;
  const path = require("node:path") as typeof NodePath;
  const appDir = TABS_GROUP_DIR;

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  }

  it("no href has both <href>.tsx and <href>/index.tsx as sibling route files", () => {
    // A students.tsx dropped next to students/ leaves the suite, tsc, and
    // eslint all green (expo-router just picks one silently) — this is the
    // only thing that would catch it.
    for (const href of ALL_NAV_HREFS) {
      const base = href.slice(1);
      const bothExist =
        fs.existsSync(path.join(appDir, `${base}.tsx`)) &&
        fs.existsSync(path.join(appDir, base, "index.tsx"));
      expect(bothExist).toBe(false);
    }
  });

  it("no route directory anywhere has a same-named sibling file (ruling X7)", () => {
    // The href-only check above cannot see dynamic routes: session/[id].tsx
    // beside session/[id]/attendance.tsx is not a nav href, but it is the
    // same ambiguity. Dynamic segments with children use [id]/index.tsx.
    expect(ambiguousRouteSiblings()).toEqual([]);
  });

  it("no two route files answer the same URL", () => {
    // Groups add no URL segment, so `(tabs)/students/index.tsx` beside
    // `students/new.tsx` is fine, but a `seasons.tsx` beside
    // `(tabs)/seasons/index.tsx` would be two files for /seasons.
    expect(duplicateRouteUrls()).toEqual([]);
  });

  it("only the stack and the tabs have a _layout.tsx", () => {
    // A nested _layout.tsx stops expo-router from flattening that
    // directory's routes into the Stack or the Tabs navigator — the routes
    // inside would silently stop being tabs or pushed screens at all.
    const layouts = walk(APP_GROUP_DIR).filter((file) => file.endsWith("_layout.tsx"));
    expect(new Set(layouts)).toEqual(
      new Set([path.join(APP_GROUP_DIR, "_layout.tsx"), path.join(appDir, "_layout.tsx")]),
    );
  });
});

describe("ALL_NAV_HREFS (Fix 2)", () => {
  it("includes a href that only appears in an ALUMNI-shaped nav", () => {
    // Every real ALUMNI href today happens to already be a subset of the
    // other five roles' hrefs, so testing against the real data wouldn't
    // catch a regression to `Object.values(navByRole)` (which omits ALUMNI
    // entirely). Test the actual union mechanism instead, with a synthetic
    // nav carrying a href that exists nowhere else.
    const uniqueHref = "/alumni-only-marker";
    const alumniLike: RoleNav = {
      sidebar: [],
      tabs: [{ href: uniqueHref, label: "Marker", icon: "more" }],
    };

    const union = hrefUnion([navByRole.STUDENT, navByRole.ADMIN, alumniLike]);
    expect(union).toContain(uniqueHref);
  });

  it("is what the layout's route list is built from, not navByRole alone", () => {
    // navByRole is missing ALUMNI by construction (navFor is the only way
    // to reach it) — assert ALL_NAV_HREFS is a strict superset so it can
    // never quietly regress to Object.values(navByRole).
    const fromNavByRoleOnly = new Set(
      Object.values(navByRole).flatMap((nav) => [...nav.tabs, ...nav.sidebar].map((i) => i.href)),
    );
    expect(new Set(ALL_NAV_HREFS)).toEqual(
      new Set([
        ...fromNavByRoleOnly,
        ...navFor({ role: "STUDENT", graduationYear: 2024 }).tabs.map((i) => i.href),
        ...navFor({ role: "STUDENT", graduationYear: 2024 }).sidebar.map((i) => i.href),
      ]),
    );
  });
});
