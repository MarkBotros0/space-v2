import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

type RouterOverride = NonNullable<ComponentProps<typeof Stack>["UNSTABLE_router"]>;

/** The (app) stack's route for the tabs group. */
export const TABS_ROUTE = "(tabs)";

/**
 * The tabs are one navigator. A push, navigate or replace to any route in the
 * tabs group (Home's bell and user menu, a detail screen linking to a list,
 * `replace("/students")` after a delete) would otherwise stack a second
 * `(tabs)` above the detail — a replace swaps only the top screen, so it
 * lands on top of the details below it. This turns each into "navigate back
 * to the one `(tabs)`": the details above it pop, and the action's nested
 * state switches it to the requested tab (final review I1).
 * `dangerouslySingular` is not enough: it moves the existing `(tabs)` to the
 * top of the stack, leaving the detail underneath it and nothing under that.
 */
export const singularTabsRouter: RouterOverride = (original) => ({
  getStateForAction(state, action, options) {
    if (
      (action.type === "PUSH" || action.type === "NAVIGATE" || action.type === "REPLACE") &&
      action.payload &&
      typeof action.payload === "object" &&
      "name" in action.payload &&
      action.payload.name === TABS_ROUTE &&
      state.routes.slice(0, state.index + 1).some((route) => route.name === TABS_ROUTE)
    ) {
      const popTo = { ...action, type: "NAVIGATE", payload: { ...action.payload, pop: true } };
      return original.getStateForAction(state, popTo as typeof action, options);
    }
    return original.getStateForAction(state, action, options);
  },
});
