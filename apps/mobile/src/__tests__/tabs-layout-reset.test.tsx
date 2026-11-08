import { render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const mockReset = jest.fn();
jest.mock("../design/layout/use-reset-tab-bar-on-focus", () => ({ useResetTabBarOnFocus: () => mockReset() }));
jest.mock("expo-router", () => {
  const Tabs = ({ children }: { children?: unknown }) => children ?? null;
  Tabs.Screen = () => null;
  return { Tabs };
});

import TabsLayout from "../../app/(app)/(tabs)/_layout";

it("the tabs layout registers the pill reset on focus", () => {
  render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TabsLayout />
    </GestureHandlerRootView>,
  );
  expect(mockReset).toHaveBeenCalled();
});
