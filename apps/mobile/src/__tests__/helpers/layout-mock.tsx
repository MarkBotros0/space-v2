import type { ReactNode } from "react";

/**
 * The expo-router stand-in the layout tests render `(app)/_layout.tsx` and
 * `(app)/(tabs)/_layout.tsx` against: `Tabs`/`Stack` and their `.Screen`s
 * become markers that record the `name`/`options` each screen receives,
 * `Redirect` renders its href. Shared by app-layout.test.tsx and
 * app-layout-routes.test.tsx (one file would pass 400 lines):
 *
 *   jest.mock("expo-router", () => require("./helpers/layout-mock").expoRouterMock());
 *
 * Tests read and set `captured`; `resetCaptured()` goes in `beforeEach`.
 */
export type CapturedScreen = {
  name: string;
  title?: string;
  href?: string | null;
  hidden?: unknown;
  options?: Record<string, unknown>;
};

export const captured = {
  screens: [] as CapturedScreen[],
  stackScreens: [] as CapturedScreen[],
  segments: ["(app)", "(tabs)", "dashboard"] as string[],
  // When set, the Tabs mock also renders the layout's tabBar (the pill), which
  // needs providers the routing tests do without.
  renderChrome: false,
  tabsProps: {} as Record<string, unknown>,
  stackProps: {} as Record<string, unknown>,
  // What each navigator sees of TabBarPresenceContext (ruling R15).
  presence: {} as { tabs?: boolean; stack?: boolean },
};

export function resetCaptured() {
  captured.screens = [];
  captured.stackScreens = [];
  captured.segments = ["(app)", "(tabs)", "dashboard"];
  captured.renderChrome = false;
  captured.tabsProps = {};
  captured.stackProps = {};
  captured.presence = {};
}

export function expoRouterMock() {
  const { Text } = require("react-native");
  const { useContext } = require("react");
  const usePresence = () => useContext(require("../../design/layout/shell-context").TabBarPresenceContext);
  const capture = (into: () => CapturedScreen[]) =>
    function Screen({ name, options }: { name: string; options?: Record<string, unknown> }) {
      into().push({
        name,
        title: options?.title as string | undefined,
        href: options && "href" in options ? (options.href as string | null) : undefined,
        hidden: options && "hidden" in options ? options.hidden : undefined,
        options,
      });
      return null;
    };
  const Tabs = ({ children, tabBar, ...rest }: { children: ReactNode; tabBar?: (props: unknown) => ReactNode }) => (
    (captured.tabsProps = rest),
    (captured.presence.tabs = usePresence()),
    (
      <>
        {children}
        {captured.renderChrome && tabBar
          ? tabBar({
              state: { index: 0, routes: [{ key: "dashboard", name: "dashboard" }] },
              navigation: { navigate: () => {} },
              descriptors: {},
              insets: { top: 0, bottom: 0, left: 0, right: 0 },
            })
          : null}
      </>
    )
  );
  Tabs.Screen = capture(() => captured.screens);
  const Stack = ({ children, ...rest }: { children: ReactNode }) => (
    (captured.stackProps = rest),
    (captured.presence.stack = usePresence()),
    (<>{children}</>)
  );
  Stack.Screen = capture(() => captured.stackScreens);
  return {
    Tabs,
    Stack,
    useSegments: () => captured.segments,
    useRouter: () => ({ push: () => {} }),
    useFocusEffect: () => {},
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
}
