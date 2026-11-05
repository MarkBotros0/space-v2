import type { UserRole } from "@space/shared";
import { router } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";

import { useSessionStore } from "../store/session";
import {
  appContext,
  appRouteNames,
  muteTabsAnchorWarning,
  type NavState,
} from "./helpers/router-context";
import { makeScopes, makeUser } from "./helpers/session";

// The navigation actions screens dispatch after a save or a delete, walked
// through the real (app) Stack and Tabs (final review I1). `replace` from a
// stacked screen used to stack a second `(tabs)`, and "deleted, go to the
// list" left the deleted record's detail under Back. CLAUDE.md's
// "Navigation actions we support" table is the contract these pin.

muteTabsAnchorWarning();

jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

type Rendered = Awaited<ReturnType<typeof renderRouter>>;

const stack = (result: Rendered) => appRouteNames(result.getRouterState() as NavState);

async function open(role: UserRole, url: string, label: string) {
  useSessionStore.getState().clear();
  useSessionStore.getState().setSession(makeUser(role), makeScopes());
  const result = await renderRouter(appContext(), { initialUrl: url });
  expect(await screen.findByText(label)).toBeTruthy();
  return result;
}

describe("replace into a tab from a stacked screen keeps one (tabs)", () => {
  it("/students → /student/1 → replace(/students) pops back to the one Tabs", async () => {
    const result = await open("ADMIN", "/students", "screen:/students");
    await act(() => router.push("/student/1"));

    await act(() => router.replace("/students"));
    expect(result.getPathname()).toBe("/students");
    expect(stack(result)).toEqual(["(tabs)"]);
  });

  it("replace to a different tab from a two-deep stack also lands in the one Tabs", async () => {
    const result = await open("ADMIN", "/groups", "screen:/groups");
    await act(() => router.push("/group/1"));
    await act(() => router.push("/group/1/edit"));

    await act(() => router.replace("/students"));
    expect(result.getPathname()).toBe("/students");
    expect(stack(result)).toEqual(["(tabs)"]);
  });

  it("replace to a detail from a detail still swaps just that screen", async () => {
    const result = await open("SUPER", "/seasons", "screen:/seasons");
    await act(() => router.push("/seasons/new"));

    await act(() => router.replace({ pathname: "/seasons/[code]", params: { code: "S9" } }));
    expect(result.getPathname()).toBe("/seasons/S9");
    expect(stack(result)).toEqual(["(tabs)", "seasons/[code]/index"]);
  });
});

describe("deleted, go to the list: nothing of the deleted record stays under Back", () => {
  it("group: /groups → detail → edit → dismissTo(/groups)", async () => {
    const result = await open("ADMIN", "/groups", "screen:/groups");
    await act(() => router.push("/group/1"));
    await act(() => router.push("/group/1/edit"));

    await act(() => router.dismissTo("/groups"));
    expect(result.getPathname()).toBe("/groups");
    expect(stack(result)).toEqual(["(tabs)"]);
  });

  it("student: a detail opened from a group, deleted, lands on the Students tab", async () => {
    const result = await open("ADMIN", "/groups", "screen:/groups");
    await act(() => router.push("/group/1"));
    await act(() => router.push("/student/5"));

    await act(() => router.dismissTo("/students"));
    expect(result.getPathname()).toBe("/students");
    expect(stack(result)).toEqual(["(tabs)"]);
  });

  it("season: /seasons → detail → edit → dismissTo(/seasons)", async () => {
    const result = await open("SUPER", "/seasons", "screen:/seasons");
    await act(() => router.push("/seasons/S1"));
    await act(() => router.push("/seasons/S1/edit"));

    await act(() => router.dismissTo("/seasons"));
    expect(result.getPathname()).toBe("/seasons");
    expect(stack(result)).toEqual(["(tabs)"]);
  });

  it("assignment: a cold-linked detail → dismissTo(/assignments)", async () => {
    const result = await open("ADMIN", "/assignment/4", "screen:/assignment/[id]");

    await act(() => router.dismissTo("/assignments"));
    expect(result.getPathname()).toBe("/assignments");
    expect(stack(result)).toEqual(["(tabs)"]);
  });

  it("session from a season: dismissAll then push the season leaves one season detail", async () => {
    const result = await open("SUPER", "/seasons", "screen:/seasons");
    await act(() => router.push("/seasons/S1"));
    await act(() => router.push("/session/5"));
    await act(() => router.push("/session/5/edit"));

    await act(() => {
      router.dismissAll();
      router.push({ pathname: "/seasons/[code]", params: { code: "S1" } });
    });
    expect(result.getPathname()).toBe("/seasons/S1");
    expect(stack(result)).toEqual(["(tabs)", "seasons/[code]/index"]);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/seasons");
  });

  it("session from the calendar: the deleted session's detail is gone too", async () => {
    const result = await open("ADMIN", "/calendar", "screen:/calendar");
    await act(() => router.push("/session/5"));
    await act(() => router.push("/session/5/edit"));

    await act(() => {
      router.dismissAll();
      router.push({ pathname: "/seasons/[code]", params: { code: "S1" } });
    });
    expect(stack(result)).toEqual(["(tabs)", "seasons/[code]/index"]);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/calendar");
  });
});

describe("save, then show the record", () => {
  it("user: /users → /user/3 → dismissTo(/users) leaves one users list", async () => {
    const result = await open("SUPER", "/users", "screen:/users");
    await act(() => router.push("/user/3"));

    await act(() => router.dismissTo("/users"));
    expect(result.getPathname()).toBe("/users");
    expect(stack(result)).toEqual(["(tabs)", "users/index"]);
  });

  it("user opened cold: dismissTo(/users) swaps the detail for the list", async () => {
    const result = await open("SUPER", "/user/3", "screen:/user/[id]");

    await act(() => router.dismissTo("/users"));
    expect(stack(result)).toEqual(["(tabs)", "users/index"]);
  });

  it("season saved under a new code: one detail, at the new URL, and Back goes to the list", async () => {
    const result = await open("SUPER", "/seasons", "screen:/seasons");
    await act(() => router.push("/seasons/S1"));
    await act(() => router.push("/seasons/S1/edit"));

    await act(() => router.dismissTo({ pathname: "/seasons/[code]", params: { code: "S2" } }));
    expect(result.getPathname()).toBe("/seasons/S2");
    expect(stack(result)).toEqual(["(tabs)", "seasons/[code]/index"]);
    await act(() => router.back());
    expect(result.getPathname()).toBe("/seasons");
  });

  it("season edit opened cold: dismissTo the detail swaps the edit for it", async () => {
    const result = await open("SUPER", "/seasons/S1/edit", "screen:/seasons/[code]/edit");

    await act(() => router.dismissTo({ pathname: "/seasons/[code]", params: { code: "S1" } }));
    expect(result.getPathname()).toBe("/seasons/S1");
    expect(stack(result)).toEqual(["(tabs)", "seasons/[code]/index"]);
  });
});
