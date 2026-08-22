import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";

import { navByRole, navFor } from "@space/shared";

import { useSessionStore } from "../store/session";

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

  it("every tab href has a route file", () => {
    // Guards Decision D1: the tab bar is data-driven, so a nav item pointing
    // at a route nobody created is a runtime crash, not a type error.
    const fs = require("node:fs") as typeof NodeFs;
    const path = require("node:path") as typeof NodePath;
    const appDir = path.resolve(__dirname, "../../app/(app)");

    const hrefs = new Set<string>();
    for (const nav of Object.values(navByRole)) {
      for (const item of [...nav.tabs, ...nav.sidebar]) hrefs.add(item.href);
    }
    for (const item of navFor({ role: "STUDENT", graduationYear: 2024 }).tabs) {
      hrefs.add(item.href);
    }

    const missing = [...hrefs].filter(
      (href) => !fs.existsSync(path.join(appDir, `${href.slice(1)}.tsx`)) &&
        !fs.existsSync(path.join(appDir, href.slice(1), "index.tsx")),
    );
    expect(missing).toEqual([]);
  });
});
