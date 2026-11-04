import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { act, renderRouter, screen, type MockContextConfig } from "expo-router/testing-library";
import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";
import { Text } from "react-native";

import { useSessionStore } from "../store/session";
import { APP_DIR, urlOfRouteName } from "./helpers/routes";
import { makeScopes, makeUser } from "./helpers/session";

const fs = require("node:fs") as typeof NodeFs;
const path = require("node:path") as typeof NodePath;

// Routing through the real navigators. The route tree is read from disk:
// every `_layout.tsx` under app/(app) is the real module (Stack, Tabs, the
// anonymous redirect and the alumni guard), every screen file a stub that
// prints its URL path. So these tests follow the files wherever they move,
// and fail if a move changes a URL or a layout stops resolving one.

jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 0 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: () => [],
}));

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

function MockRoot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}

/** renderRouter's in-memory form: file name → module or component. */
type MemoryContext = Exclude<MockContextConfig, string | string[] | { appDir: string }>;

function appContext(): MemoryContext {
  const context: MemoryContext = {
    _layout: MockRoot,
    login: () => <Text>screen:/login</Text>,
  };
  for (const file of routeFiles(path.join(APP_DIR, "(app)"))) {
    const name = path.relative(APP_DIR, file).replace(/\.tsx$/, "").split(path.sep).join("/");
    if (path.basename(file) === "_layout.tsx") {
      context[name] = require(file) as MemoryContext[string];
    } else {
      const label = `screen:${urlOfRouteName(name)}`;
      context[name] = () => <Text>{label}</Text>;
    }
  }
  return context;
}

type NavState = { routes: { name: string; state?: NavState }[] } | undefined;

/** The (app) navigator's own routes, bottom of the stack first (it sits under `__root`). */
function appRouteNames(state: NavState): string[] | undefined {
  for (const route of state?.routes ?? []) {
    if (route.name === "(app)") return route.state?.routes.map((child) => child.name) ?? [];
    const nested = appRouteNames(route.state);
    if (nested) return nested;
  }
  return undefined;
}

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
    ["/students/new", "screen:/students/new"],
    ["/seasons", "screen:/seasons"],
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

  it("back from a detail screen returns to the tab it was pushed from, not the first tab", async () => {
    // Quizzes is neither the first tab nor the tabs' anchor, so only the
    // stack can bring Back here.
    const result = await renderRouter(appContext(), { initialUrl: "/quizzes" });
    expect(await screen.findByText("screen:/quizzes")).toBeTruthy();

    await act(() => router.push("/student/1"));
    expect(result.getPathname()).toBe("/student/1");
    expect(appRouteNames(result.getRouterState() as NavState)).toEqual(["(tabs)", "student/[id]/index"]);

    await act(() => router.back());
    expect(result.getPathname()).toBe("/quizzes");
  });
});

describe("guards on the stack layout cover tabs and detail routes", () => {
  it("sends an anonymous visitor to login from a detail link", async () => {
    useSessionStore.setState({ status: "anonymous", user: null, scopes: null });
    const result = await renderRouter(appContext(), { initialUrl: "/student/1" });
    expect(await screen.findByText("screen:/login")).toBeTruthy();
    expect(result.getPathname()).toBe("/login");
  });

  it.each(["/assignments", "/assignment/1"])("sends an alumnus from %s to the dashboard (REG-81)", async (url) => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ graduationYear: 2024 }));
    const result = await renderRouter(appContext(), { initialUrl: url });
    expect(await screen.findByText("screen:/dashboard")).toBeTruthy();
    expect(result.getPathname()).toBe("/dashboard");
  });
});
