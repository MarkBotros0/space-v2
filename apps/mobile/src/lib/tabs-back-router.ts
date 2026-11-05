import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";

type RouterOverride = NonNullable<ComponentProps<typeof Tabs>["UNSTABLE_router"]>;

/** The tab every role has: the tabs' anchor (`unstable_settings` in `(tabs)/_layout.tsx`). */
export const HOME_TAB = "dashboard";

/**
 * Back on the tabs (ruling R19): through the tabs visited, newest first
 * (`backBehavior="history"`), so More → My notes → Back is More again; and
 * when that history is spent on any tab but Home, to Home (ruling R11), so a
 * cold link to /quizzes, or a tab reached by popping a detail, never
 * backs out of the app from there.
 *
 * Expo Router 58 cannot do both on its own: the anchor is only Back's target
 * with `backBehavior="initialRoute"`, which forgets every tab but the
 * anchor (TabRouter's GO_BACK and getRouteHistory). A seeded or cold state has
 * no tab history, so "history" alone reports nothing to go back to and the
 * hardware button leaves the app. This adds the fallback: whatever GO_BACK the
 * tab router leaves unhandled (its history has one entry) jumps to Home
 * instead, unless Home is already focused, with nothing behind Home: one more
 * Back from there exits. `canGoBack()` asks the router the same question, so
 * the Android back button follows it.
 */
export const historyThenHomeTabsRouter: RouterOverride = (original) => ({
  getStateForAction(state, action, options) {
    const result = original.getStateForAction(state, action, options);
    if (action.type !== "GO_BACK" || isHandled(result)) return result;
    if (!state.routeNames.includes(HOME_TAB) || state.routes[state.index]?.name === HOME_TAB) return result;
    if (action.target && action.target !== state.key) return result;
    // With "history", a jump APPENDS to the tab history ([X] → [X, Home]), so
    // the next Back on Home would return to X and fall back here again: an
    // endless loop with `canGoBack()` stuck true. Home replaces the spent
    // history instead ([Home]), so the Back after it is unhandled and leaves the app.
    const spent = { ...state, history: (state.history ?? []).filter((item) => item.type !== "route") };
    const jumpHome = { type: "JUMP_TO", payload: { name: HOME_TAB } };
    return original.getStateForAction(spent, jumpHome as typeof action, options);
  },
});

/** Unhandled is `null` in react-navigation and the `"UNHANDLED"` marker in expo-router 58's fork. */
function isHandled(result: unknown): boolean {
  return result !== null && result !== undefined && result !== "UNHANDLED";
}
