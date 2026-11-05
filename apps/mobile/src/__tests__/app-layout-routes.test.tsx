import { useSessionStore } from "../store/session";
import { captured, resetCaptured } from "./helpers/layout-mock";
import { renderWithProviders } from "./helpers/render";
import { listDetailRouteNames, listTabRouteNames } from "./helpers/routes";
import { makeScopes, makeUser } from "./helpers/session";

// The route-declaration half of app-layout.test.tsx (split at 400 lines):
// what each layout declares, checked against the files on disk.
jest.mock("expo-router", () => require("./helpers/layout-mock").expoRouterMock());

import { PUSHED_NAV_ROUTE_NAMES } from "../lib/route-names";
import AppLayout, { DETAIL_ROUTE_NAMES } from "../../app/(app)/_layout";
import TabsLayout, { ALL_ROUTE_NAMES, routeNameForHref } from "../../app/(app)/(tabs)/_layout";

const scopes = makeScopes();

beforeEach(() => {
  useSessionStore.getState().clear();
  resetCaptured();
});

describe("route declarations", () => {
  it("declares every route file: tabs in (tabs)/, detail routes beside it", () => {
    // `Tabs` and `Stack` auto-register every file in their directory, and one
    // a layout does not declare still renders. The left sides are read from disk,
    // not from the layouts, so a new route file without a list entry fails
    // here even though the derived totals in app-layout.test.tsx would not notice.
    // A nav destination in the wrong folder fails too: the tabs side holds
    // exactly the hrefs that are a tab for some role, the stack side the rest.
    expect(new Set(listTabRouteNames())).toEqual(new Set(ALL_ROUTE_NAMES));
    expect(new Set(listDetailRouteNames())).toEqual(new Set([...DETAIL_ROUTE_NAMES, ...PUSHED_NAV_ROUTE_NAMES]));
  });

  it("keeps the detail list and the pushed nav destinations apart", () => {
    // DETAIL_ROUTE_NAMES is hand-listed; a nav href never belongs in it.
    expect(DETAIL_ROUTE_NAMES.filter((name) => PUSHED_NAV_ROUTE_NAMES.includes(name))).toEqual([]);
    expect(ALL_ROUTE_NAMES.filter((name) => PUSHED_NAV_ROUTE_NAMES.includes(name))).toEqual([]);
  });

  it("declares users/import and the group importer as detail routes", () => {
    expect(DETAIL_ROUTE_NAMES).toContain("users/import");
    expect(DETAIL_ROUTE_NAMES).toContain("seasons/[code]/roster/import");
  });

  it("never declares a screen href: null or hidden — expo-router 58 redirects a focused hidden tab to the first tab", () => {
    for (const role of ["STUDENT", "ADMIN", "SUPER", "LEADER", "MENTOR"] as const) {
      captured.screens = [];
      captured.stackScreens = [];
      useSessionStore.getState().setSession(makeUser(role), scopes);
      const tabs = renderWithProviders(<TabsLayout />);
      tabs.unmount();
      const stack = renderWithProviders(<AppLayout />);
      stack.unmount();
      expect(captured.screens.length).toBeGreaterThan(0);
      expect(captured.stackScreens.length).toBeGreaterThan(0);
      const all = [...captured.screens, ...captured.stackScreens];
      expect(all.filter((s) => s.href !== undefined || s.hidden !== undefined).map((s) => s.name)).toEqual([]);
    }
  });

  it("declares every detail route and pushed nav destination without a tab title", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);

    for (const name of [...DETAIL_ROUTE_NAMES, ...PUSHED_NAV_ROUTE_NAMES]) {
      const declared = captured.stackScreens.find((s) => s.name === name);
      expect(declared).toBeDefined();
      expect(declared?.title).toBeUndefined();
    }
  });

  it("registers the assignment detail, edit and new routes as detail routes (X7)", () => {
    const names = ["assignment/[id]/index", "assignment/[id]/edit", "assignment/new"];
    for (const name of names) expect(DETAIL_ROUTE_NAMES).toContain(name);
    // The file form must be gone: x/[id].tsx beside x/[id]/ is the ambiguity X7 forbids.
    expect(DETAIL_ROUTE_NAMES).not.toContain("assignment/[id]");
  });

  it("registers the leader-path, session, quiz and student detail routes", () => {
    for (const name of [
      "group/[id]/index",
      "submission/[publicId]",
      "session/[id]/attendance",
      "session/[id]/index",
      "quiz/[id]/index",
      "quiz/[id]/grade",
      "quiz/[id]/edit",
      "quiz/new",
      "student/[id]/index",
      "student/[id]/edit",
      "students/new",
      "users/new",
      "event/[id]",
    ]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
  });

  it("registers Plan 6's detail routes, in the directory form where they have children (X7)", () => {
    for (const name of [
      "seasons/[code]/index",
      "seasons/[code]/edit",
      "seasons/[code]/roster/index",
      "group/new",
      "group/[id]/index",
      "group/[id]/edit",
      "session/new",
      "session/[id]/edit",
    ]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
    expect(DETAIL_ROUTE_NAMES).not.toContain("group/[id]");
  });

  it("maps directory hrefs to their index route (/seasons, /students, /users)", () => {
    expect(routeNameForHref("/seasons")).toBe("seasons/index");
    expect(routeNameForHref("/students")).toBe("students/index");
    expect(routeNameForHref("/users")).toBe("users/index");
    expect(routeNameForHref("/calendar")).toBe("calendar");
  });
});
