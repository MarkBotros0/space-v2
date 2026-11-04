import { renderHook } from "@testing-library/react-native";

import { resetTabBarScroll, useTabBarScroll, useTabBarVisible } from "../design/layout/tab-bar-scroll";
import { useResetTabBarOnFocus } from "../design/layout/use-reset-tab-bar-on-focus";

// useFocusEffect runs its effect when the screen gains focus; here, on mount.
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

afterEach(resetTabBarScroll);

it("shows the pill when the tabs regain focus, e.g. back from a detail screen", () => {
  useTabBarScroll().onScrollDirection("down", false);
  expect(renderHook(() => useTabBarVisible()).result.current).toBe(false);
  renderHook(() => useResetTabBarOnFocus());
  expect(renderHook(() => useTabBarVisible()).result.current).toBe(true);
});
