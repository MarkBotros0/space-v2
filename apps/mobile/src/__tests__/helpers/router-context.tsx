import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import type { MockContextConfig } from "expo-router/testing-library";
import type * as NodeFs from "node:fs";
import type * as NodePath from "node:path";
import { Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { APP_DIR, urlOfRouteName } from "./routes";

const fs = require("node:fs") as typeof NodeFs;
const path = require("node:path") as typeof NodePath;

// The route tree for renderRouter, read from disk: every `_layout.tsx` under
// app/(app) is the real module (Stack, Tabs, the anonymous redirect and the
// alumni guard), every screen file a stub that prints its URL path. So tests
// using it follow the files wherever they move, and fail if a move changes a
// URL or a layout stops resolving one. Shared by deep-links.test.tsx and
// more-back.test.tsx.

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

function MockRoot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  // The gesture root, as app/_layout.tsx has it: the tabs layout's swipe needs one above it.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={client}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** renderRouter's in-memory form: file name → module or component. */
type MemoryContext = Exclude<MockContextConfig, string | string[] | { appDir: string }>;

export function appContext(): MemoryContext {
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

export type NavState = { routes: { name: string; state?: NavState }[] } | undefined;

/** The (app) navigator's own routes, bottom of the stack first (it sits under `__root`). */
export function appRouteNames(state: NavState): string[] | undefined {
  for (const route of state?.routes ?? []) {
    if (route.name === "(app)") return route.state?.routes.map((child) => child.name) ?? [];
    const nested = appRouteNames(route.state);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Expo Router 58 warns (dev only, once) that the tabs' anchor is not Back's
 * target with `backBehavior: "history"`. That is deliberate: Back-to-Home
 * comes from historyThenHomeTabsRouter (src/lib/tabs-back-router.ts, ruling
 * R19), and the anchor still seeds Home under a cold link. Call at the top of
 * a test file that renders the real tabs layout; every other warning passes.
 */
export function muteTabsAnchorWarning() {
  const warn = console.warn;
  let spy: jest.SpyInstance | undefined;
  beforeAll(() => {
    spy = jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      const [message] = args;
      if (typeof message === "string" && message.includes('sets the anchor "dashboard", but its `backBehavior` is "history"')) return;
      warn(...args);
    });
  });
  afterAll(() => spy?.mockRestore());
}
