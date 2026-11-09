import { act, fireEvent, screen } from "@testing-library/react-native";
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet, Text as RNText, TextInput } from "react-native";

import { keyboardTopInWindow } from "../design/lib/keyboard-offset";
import { Screen } from "../design/layout/screen";
import { renderStacked, renderWithProviders } from "./helpers/render";

// Screen's keyboard handling (final review I2): the scroll content pads by
// how far the keyboard reaches up from the window's bottom, which on Android
// is RN's keyboard height PLUS the nav bar under it (keyboardBottomOffset),
// and the focused field is scrolled above that same edge.

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../lib/online", () => ({ useIsOnline: () => true }));

type ShowEvent = { endCoordinates: { height: number; screenY: number } };

const body = <RNText>body</RNText>;

function withKeyboard(run: (show: (e: ShowEvent) => void) => void) {
  jest.useFakeTimers();
  const listeners: Record<string, (e: ShowEvent) => void> = {};
  const spy = jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, cb: never) => {
    listeners[event] = cb;
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
  // The scroll view's own top, which the focused field is kept below (keyboard-inset's clamp):
  // at the window's top here, so these cases have room and scroll by the whole overlap.
  const proto = ScrollView.prototype as unknown as Record<string, unknown>;
  const measure = proto.measureInWindow;
  proto.measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 0, 390, 800);
  try {
    run((e) => (listeners.keyboardWillShow ?? listeners.keyboardDidShow)!(e));
  } finally {
    proto.measureInWindow = measure;
    spy.mockRestore();
    jest.useRealTimers();
  }
}

function withOS(os: "ios" | "android", run: () => void) {
  const replaced = jest.replaceProperty(Platform, "OS", os);
  try {
    run();
  } finally {
    replaced.restore();
  }
}

const paddingBottom = () =>
  StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom;

describe("keyboardTopInWindow", () => {
  it("is RN's screenY when it agrees with the window less the offset", () => {
    expect(keyboardTopInWindow({ screenY: 500, windowHeight: 800, offset: 300 })).toBe(500);
  });

  it("takes the higher edge when screenY leaves out the Android nav bar", () => {
    // 282 keyboard + 48 nav bar = 330 up from an 800 window: the top is at 470, not 518.
    expect(keyboardTopInWindow({ screenY: 518, windowHeight: 800, offset: 330 })).toBe(470);
  });
});

describe("Screen: keyboard", () => {
  it("scrolls a focused field above the keyboard from the current scroll offset", () => {
    const focused = jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 600, 300, 40),
    } as never);
    try {
      withKeyboard((show) => {
        renderWithProviders(<Screen title="Edit">{body}</Screen>);
        fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
          nativeEvent: {
            contentOffset: { x: 0, y: 200 },
            contentSize: { width: 390, height: 2000 },
            layoutMeasurement: { width: 390, height: 600 },
          },
        });
        act(() => show({ endCoordinates: { height: 300, screenY: 500 } }));
        act(() => jest.advanceTimersByTime(0));
        // Field bottom 640 + the 96 gap - keyboard top 500 = 236 past the offset of 200.
        const scrollToSpy = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
        expect(scrollToSpy).toHaveBeenCalledWith({ y: 436, animated: false });
        // iOS: the keyboard covers the home indicator, so its height is the whole reach.
        expect(paddingBottom()).toBe(316);
      });
    } finally {
      focused.mockRestore();
    }
  });

  it("Android: pads by the keyboard plus the nav bar under it, so the last field clears it", () => {
    withOS("android", () =>
      withKeyboard((show) => {
        // renderStacked: a detail screen, insets.bottom 34 from the test provider.
        renderStacked(<Screen title="Edit">{body}</Screen>);
        act(() => show({ endCoordinates: { height: 282, screenY: 500 } }));
        expect(paddingBottom()).toBe(282 + 34 + 16);
      }),
    );
  });

  it("Android: measures the focused field against the keyboard's real top, nav bar included", () => {
    const windowHeight = Dimensions.get("window").height;
    // RN's screenY here ignores the nav bar: 282 up from the bottom instead of 282 + 34.
    const reportedTop = windowHeight - 282;
    // Field bottom at reportedTop - 106: 10dp clear of the 96 gap by screenY,
    // 24dp inside it by the real top (34 higher).
    const focused = jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, reportedTop - 146, 300, 40),
    } as never);
    try {
      withOS("android", () =>
        withKeyboard((show) => {
          renderStacked(<Screen title="Edit">{body}</Screen>);
          act(() => show({ endCoordinates: { height: 282, screenY: reportedTop } }));
          act(() => jest.advanceTimersByTime(0));
          const scrollToSpy = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
          expect(scrollToSpy).toHaveBeenCalledWith({ y: 24, animated: false });
        }),
      );
    } finally {
      focused.mockRestore();
    }
  });
});
