import { router } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";

import { useSessionStore } from "../store/session";
import { appContext, appRouteNames, muteTabsAnchorWarning, type NavState } from "./helpers/router-context";
import { makeScopes, makeUser } from "./helpers/session";

// Routing through the real navigators, on the route tree read from disk
// (helpers/router-context.tsx): these tests follow the files wherever they
// move, and fail if a move changes a URL or a layout stops resolving one.

muteTabsAnchorWarning();

jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

beforeEach(() => {
  useSessionStore.getState().clear();
  useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes());
});

describe("deep links land on their own screen (URLs unchanged)", () => {
  it.each([
    ["/settings", "screen:/settings"],
    ["/season", "screen:/season"],
    ["/calendar", "screen:/calendar"],
    ["/student/1", "screen:/student/[id]"],
    ["/past-season/5", "screen:/past-season/[seasonId]"],
    ["/past-season/5/quizzes", "screen:/past-season/[seasonId]/quizzes"],
    ["/students/new", "screen:/students/new"],
    ["/seasons", "screen:/seasons"],
    // Task 12 moved these out of (tabs) onto the stack; their URLs stay.
    ["/notifications", "screen:/notifications"],
    ["/events", "screen:/events"],
    ["/users", "screen:/users"],
    ["/students/alumni", "screen:/students/alumni"],
    ["/students/dropped", "screen:/students/dropped"],
    ["/attendance", "screen:/attendance"],
    ["/students", "screen:/students"],
  ])("%s", async (url, text) => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), makeScopes());
    const result = await renderRouter(appContext(), { initialUrl: url });
    expect(await screen.findByText(text)).toBeTruthy();
    expect(result.getPathname()).toBe(url);
  });
});

describe("detail screens push on a stack above the tabs", () => {
  it("a cold deep link to a detail screen has the tabs underneath, and back returns to them", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/student/1" });
    expect(await screen.findByText("screen:/student/[id]")).toBeTruthy();
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", "student/[id]/index"]);

    await act(() => router.back());
    // Home: the tabs' anchor, not whichever tab sorts first in the route tree.
    expect(result.getPathname()).toBe("/dashboard");
  });

  it("a cold deep link to a pushed nav destination (/settings) also has Home underneath", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/settings" });
    expect(await screen.findByText("screen:/settings")).toBeTruthy();
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", "settings/index"]);

    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
  });

  it("back from a detail screen returns to the tab it was pushed from, not the first tab", async () => {
    // Work is neither the first tab nor the tabs' anchor, so only the
    // stack can bring Back here.
    const result = await renderRouter(appContext(), { initialUrl: "/work" });
    expect(await screen.findByText("screen:/work")).toBeTruthy();

    await act(() => router.push("/student/1"));
    expect(result.getPathname()).toBe("/student/1");
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", "student/[id]/index"]);

    await act(() => router.back());
    expect(result.getPathname()).toBe("/work");
  });

  // P2-2: a tab for no role now, so an old link (a notification) pushes above Home.
  it.each([
    ["/assignments", "assignments"],
    ["/quizzes", "quizzes"],
  ])("a student's cold link to %s stays on the stack, and Back goes Home", async (url, route) => {
    const result = await renderRouter(appContext(), { initialUrl: url });
    expect(await screen.findByText(`screen:${url}`)).toBeTruthy();
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", route]);

    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
  });
});

describe("the tabs are one navigator, however a tab route is reached", () => {
  // Home's bell and user menu, and detail screens linking to lists, push
  // tab routes. Each push must land in the one Tabs at the bottom of
  // the stack, never stack a second (tabs) above the detail.
  const tabsCount = (state: NavState) => appRouteNames(state)?.filter((name) => name === "(tabs)").length;

  it("pushing /history from a cold-linked detail switches the one Tabs to History", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/student/1" });
    expect(await screen.findByText("screen:/student/[id]")).toBeTruthy();

    await act(() => router.push("/history"));
    expect(result.getPathname()).toBe("/history");
    expect(tabsCount(result.getRouterState() as NavState)).toBe(1);
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)"]);
  });

  it("pushing /settings (a tab for no role) from a detail stacks it, and Back returns to the detail", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/student/1" });
    expect(await screen.findByText("screen:/student/[id]")).toBeTruthy();

    await act(() => router.push("/settings"));
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", "student/[id]/index", "settings/index"]);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/student/1");
  });

  it("pushing /calendar from a detail pushed off /work lands in the same Tabs", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/work" });
    expect(await screen.findByText("screen:/work")).toBeTruthy();
    await act(() => router.push("/student/1"));

    await act(() => router.push("/calendar"));
    expect(result.getPathname()).toBe("/calendar");
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)"]);
  });

  it("pushing a tab route from a tab stays in the Tabs", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();

    await act(() => router.push("/history"));
    expect(result.getPathname()).toBe("/history");
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)"]);
  });

  it("Home's bell pushes /notifications above the tabs, and Back returns Home", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/dashboard" });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();

    await act(() => router.push("/notifications"));
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", "notifications"]);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/dashboard");
  });

  it("a detail pushed from a detail still stacks, and Back walks down", async () => {
    const result = await renderRouter(appContext(), { initialUrl: "/student/1" });
    expect(await screen.findByText("screen:/student/[id]")).toBeTruthy();

    await act(() => router.push("/student/1/edit"));
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual([
      "(tabs)",
      "student/[id]/index",
      "student/[id]/edit",
    ]);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/student/1");
  });
});

describe("guards on the stack layout cover tabs and detail routes", () => {
  it("sends an anonymous visitor to login from a detail link", async () => {
    useSessionStore.setState({ status: "anonymous", user: null, scopes: null });
    const result = await renderRouter(appContext(), { initialUrl: "/student/1" });
    expect(await screen.findByText("screen:/login")).toBeTruthy();
    expect(result.getPathname()).toBe("/login");
  });

  it.each(["/work", "/assignments", "/quizzes", "/season", "/attendance"])("sends an alumnus from %s to the dashboard (REG-81)", async (url) => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ activeSeasonId: null, graduationYear: 2024 }));
    const result = await renderRouter(appContext(), { initialUrl: url });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();
    expect(result.getPathname()).toBe("/dashboard");
  });
});
