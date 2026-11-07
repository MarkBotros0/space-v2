import { navByRole, navFor, type RoleNav } from "@space/shared";
import { router } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";

import { moreItemsFor, navHref } from "../lib/nav-routes";
import { useSessionStore } from "../store/session";
import { appContext, muteTabsAnchorWarning } from "./helpers/router-context";
import { makeScopes, makeUser } from "./helpers/session";

// Ruling R19 (spec goal 7, "Back returns where you came from"): a destination
// opened from More (MENTOR: from Profile) returns there on Back, for every
// role. Two mechanisms, both walked here through the real navigators:
//   - a nav href that is a tab for NO role (Settings, Events, …) lives on the
//     stack above the tabs, so Back pops it;
//   - one that is a tab for another role (My notes, Reports, History, …)
//     stays in the Tabs, and the tabs go Back through their history
//     (backBehavior "history"), falling back to Home (lib/tabs-back-router.ts).

muteTabsAnchorWarning();

jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

beforeEach(() => useSessionStore.getState().clear());

type Role = "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR";

function signIn(role: Role | "ALUMNI") {
  if (role === "ALUMNI") {
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ graduationYear: 2024, activeSeasonId: null }));
  } else {
    useSessionStore.getState().setSession(makeUser(role), makeScopes());
  }
}

/** Open each entry the way MoreScreen does (`router.push(navHref(href))`), then Back. */
async function openEachAndComeBack(result: Awaited<ReturnType<typeof renderRouter>>, hrefs: string[], from: string) {
  const visited: string[][] = [];
  for (const href of hrefs) {
    const target = navHref(href);
    if (!target) throw new Error(`no route for ${href}`);
    await act(() => router.push(target));
    const opened = result.getPathname();
    await act(() => router.back());
    visited.push([href, opened, result.getPathname()]);
  }
  expect(visited).toEqual(hrefs.map((href) => [href, href, from]));
}

describe("Back from a More destination returns to More (R19)", () => {
  it.each<[Role | "ALUMNI", RoleNav]>([
    ["SUPER", navByRole.SUPER],
    ["ADMIN", navByRole.ADMIN],
    ["LEADER", navByRole.LEADER],
    ["STUDENT", navByRole.STUDENT],
    ["ALUMNI", navFor({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null })],
  ])("%s: every entry More lists", async (role, nav) => {
    signIn(role);
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();
    await act(() => router.navigate("/more"));
    expect(result.getPathname()).toBe("/more");

    const items = moreItemsFor(nav).map((item) => item.href);
    expect(items.length).toBeGreaterThan(0);
    await openEachAndComeBack(result, items, "/more");

    // And More itself goes Back to the tab it was opened from.
    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
  });

  it("MENTOR (no More tab): Notifications opened from Profile returns to Profile", async () => {
    signIn("MENTOR");
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();
    await act(() => router.navigate("/profile"));

    // Profile's Notifications row (Notification settings opens from the bell).
    await openEachAndComeBack(result, ["/notifications"], "/profile");
    // The rest of the mentor's sidebar is the mentor's own tabs.
    expect(moreItemsFor(navByRole.MENTOR).map((item) => item.href)).toEqual(["/notifications"]);
  });
});

/**
 * On Home with nothing behind it, the hardware button must leave the app:
 * `canGoBack()` (what useBackButton asks) is false, and a Back changes nothing.
 */
async function expectBackLeavesTheApp(result: Awaited<ReturnType<typeof renderRouter>>) {
  expect(result.getPathname()).toBe("/dashboard");
  expect(router.canGoBack()).toBe(false);
  await act(() => router.back());
  expect(result.getPathname()).toBe("/dashboard");
  expect(router.canGoBack()).toBe(false);
}

describe("tab switches and Back (Android back between tabs)", () => {
  it("walks back through the tabs visited, then Home, then out", async () => {
    signIn("ADMIN");
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();
    expect(router.canGoBack()).toBe(false);

    await act(() => router.navigate("/calendar"));
    await act(() => router.navigate("/groups"));
    await act(() => router.back());
    expect(result.getPathname()).toBe("/calendar");
    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
    // Home with nothing behind it: the hardware back button leaves the app.
    expect(router.canGoBack()).toBe(false);
  });

  it("keeps one entry per tab: Today → Calendar → Today goes Back to Calendar, then Home", async () => {
    signIn("ADMIN");
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();

    await act(() => router.navigate("/calendar"));
    await act(() => router.navigate("/dashboard"));
    await act(() => router.back());
    expect(result.getPathname()).toBe("/calendar");
    // Calendar's history is spent; Back falls back to Home rather than leaving.
    expect(router.canGoBack()).toBe(true);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
    await expectBackLeavesTheApp(result);
  });

  it("Today → Calendar, Back, Back: Home, then out of the app", async () => {
    signIn("ADMIN");
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();

    await act(() => router.navigate("/calendar"));
    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
    await expectBackLeavesTheApp(result);
  });

  it("a cold link to a tab goes Back to Home, not out of the app (R11)", async () => {
    signIn("STUDENT");
    const result = await renderRouter(appContext(), { initialUrl: "/work" });
    expect(await screen.findByText("screen:/work")).toBeTruthy();
    expect(router.canGoBack()).toBe(true);

    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
    // The fallback to Home leaves nothing behind it: the next Back exits.
    await expectBackLeavesTheApp(result);
  });

  it("a tab reached from a detail goes Back through the tabs, not to the popped detail", async () => {
    signIn("STUDENT");
    const result = await renderRouter(appContext(), { initialUrl: "/work" });
    expect(await screen.findByText("screen:/work")).toBeTruthy();
    await act(() => router.push("/student/1"));
    await act(() => router.push("/history"));
    expect(result.getPathname()).toBe("/history");

    await act(() => router.back());
    expect(result.getPathname()).toBe("/work");
  });
});
