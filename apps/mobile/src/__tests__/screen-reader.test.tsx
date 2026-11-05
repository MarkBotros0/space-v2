import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useScreenReaderEnabled } from "../design/lib/screen-reader";

// The pill stays up while VoiceOver/TalkBack is on (final review M7).
describe("useScreenReaderEnabled", () => {
  afterEach(() => jest.restoreAllMocks());

  it("starts false and turns true when the OS says a screen reader is on", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    const { result } = renderHook(() => useScreenReaderEnabled());
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it("follows screenReaderChanged", async () => {
    let listener: ((on: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((
      _e: string,
      cb: (on: boolean) => void,
    ) => {
      listener = cb;
      return { remove: jest.fn() };
    }) as never);
    const { result } = renderHook(() => useScreenReaderEnabled());
    await act(async () => {});
    act(() => listener?.(true));
    expect(result.current).toBe(true);
    act(() => listener?.(false));
    expect(result.current).toBe(false);
  });
});
