import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockSet = jest.fn();
let mockSystem: "light" | "dark" = "dark";
jest.mock("nativewind", () => ({
  colorScheme: { set: (v: string) => mockSet(v) },
  useColorScheme: () => ({ colorScheme: mockSystem }),
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { THEME_STORAGE_KEY, applyStoredThemeMode, useThemeMode } from "../design/theme/theme-mode";

beforeEach(async () => {
  mockSet.mockClear();
  mockSystem = "dark";
  await AsyncStorage.clear();
});

it("defaults to system when nothing is stored", async () => {
  const { result } = renderHook(() => useThemeMode());
  await waitFor(() => expect(result.current.mode).toBe("system"));
  expect(result.current.resolved).toBe("dark");
});

it("applies system on first launch with no preference", async () => {
  await applyStoredThemeMode();
  expect(mockSet).toHaveBeenCalledWith("system");
});

it("persists and applies an explicit choice", async () => {
  const { result } = renderHook(() => useThemeMode());
  await act(() => result.current.setMode("light"));
  expect(await AsyncStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  expect(mockSet).toHaveBeenLastCalledWith("light");
});

it("ignores a corrupt stored value", async () => {
  await AsyncStorage.setItem(THEME_STORAGE_KEY, "purple");
  await applyStoredThemeMode();
  expect(mockSet).toHaveBeenCalledWith("system");
});
