import type { ComponentType } from "react";
import { screen } from "@testing-library/react-native";

// Task-7 fix round, Fix 5: nothing before this file ever rendered any of
// the 19 placeholder screens. A bare `render()` of one throws
// "No safe area value available..." because `Screen` calls
// `useSafeAreaInsets()`, which needs a `SafeAreaProvider` that has actually
// fired `onLayout` — a bare provider never does that under the test
// renderer (see the note in `helpers/render.tsx`). This is also the worked
// example of `renderWithProviders`, so the first Phase 1 author to build a
// real screen has something to copy instead of hitting that error cold.
//
// Rows are deleted as screens are built; the first test derives the expected
// set from disk, so there is no count to maintain (ruling X9).
import { renderWithProviders } from "./helpers/render";
import { listRouteNames, readRouteSource } from "./helpers/routes";

import EventsScreen from "../../app/(app)/events";
import ReportsScreen from "../../app/(app)/reports";

const PLACEHOLDER_SCREENS: Array<[string, ComponentType, string]> = [
  ["events", EventsScreen, "JPC Events"],
  ["reports", ReportsScreen, "Reports"],
];

const PLACEHOLDER_MESSAGE = "This screen isn't built yet.";

describe("placeholder screens", () => {
  it("lists exactly the route files that still render the placeholder message", () => {
    // Derived from disk, not pinned (ruling X9). A plan that builds a screen
    // deletes its row below and nothing else; forgetting to delete it fails
    // here, and so does adding a placeholder file without a row.
    const onDisk = listRouteNames()
      .filter((name) => readRouteSource(name).includes(PLACEHOLDER_MESSAGE))
      .sort();
    expect(PLACEHOLDER_SCREENS.map(([route]) => route).sort()).toEqual(onDisk);
  });

  // When the last row is deleted, delete this whole file: `it.each` refuses
  // an empty table.
  it.each(PLACEHOLDER_SCREENS)("renders %s with its title and placeholder message", (_route, Component, title) => {
    renderWithProviders(<Component />);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(PLACEHOLDER_MESSAGE)).toBeTruthy();
  });
});
