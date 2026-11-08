import { act, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Screen } from "../design/layout/screen";
import { TabBarPresenceContext } from "../design/layout/shell-context";
import { emitTabReselect } from "../design/layout/tab-bar-scroll";
import { renderWithProviders } from "./helpers/render";

// Owner 2026-11-08, as Instagram does: pressing the open tab scrolls to the top, or reloads there.
describe("Screen: the open tab pressed again", () => {
  it("reloads a tab screen that is already at the top", async () => {
    const onRefresh = jest.fn();
    renderWithProviders(
      <Screen title="Calendar" onRefresh={onRefresh}>
        <Text>Body</Text>
      </Screen>,
    );
    await screen.findByText("Body");
    act(() => emitTabReselect());
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("leaves a screen with no tab bar alone (a detail screen on the stack)", async () => {
    const onRefresh = jest.fn();
    renderWithProviders(
      <TabBarPresenceContext.Provider value={false}>
        <Screen title="Session" onRefresh={onRefresh}>
          <Text>Body</Text>
        </Screen>
      </TabBarPresenceContext.Provider>,
    );
    await screen.findByText("Body");
    act(() => emitTabReselect());
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
