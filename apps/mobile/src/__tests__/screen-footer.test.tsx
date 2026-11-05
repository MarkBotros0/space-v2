import { act, fireEvent, screen, within } from "@testing-library/react-native";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
} from "react-native";

import { SaveBar } from "../design/layout/save-bar";
import { Screen } from "../design/layout/screen";
import { resetTabBarScroll, useTabBarScroll } from "../design/layout/tab-bar-scroll";
import { renderStacked, renderWithProviders } from "./helpers/render";

// Screen's `footer` slot (final review I4): a SaveBar pinned outside the
// scroll view, above the pill on a tab and on the bottom inset on a detail
// screen, riding the keyboard; the scroll content pads by its measured height.
// The test provider's bottom inset is 34, so a tab's shell padding is 114.

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../lib/online", () => ({ useIsOnline: () => true }));

type ShowEvent = { endCoordinates: { height: number; screenY: number } };

function withKeyboard(run: (show: (e: ShowEvent) => void) => void) {
  jest.useFakeTimers();
  const listeners: Record<string, (e: ShowEvent) => void> = {};
  const spy = jest.spyOn(Keyboard, "addListener").mockImplementation(((
    event: string,
    cb: never,
  ) => {
    listeners[event] = cb;
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
  try {
    run((e) => (listeners.keyboardWillShow ?? listeners.keyboardDidShow)!(e));
  } finally {
    spy.mockRestore();
    jest.useRealTimers();
  }
}

const form = (
  <Screen title="Edit" footer={<SaveBar label="Save" onPress={() => {}} />}>
    <RNText>fields</RNText>
  </Screen>
);

const contentPadding = () =>
  StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom;
const footerStyle = () => StyleSheet.flatten(screen.getByTestId("screen-footer").props.style);
const layoutFooter = (height: number) =>
  fireEvent(screen.getByTestId("screen-footer"), "layout", { nativeEvent: { layout: { height } } });

describe("Screen footer", () => {
  afterEach(() => act(() => resetTabBarScroll()));

  it("renders outside the scroll view, so it never scrolls with the content", () => {
    renderStacked(form);
    expect(screen.getByTestId("save-bar")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
  });

  it("inside the footer, SaveBar draws only its body; the slot does the pinning", () => {
    renderStacked(form);
    expect(
      StyleSheet.flatten(screen.getByTestId("save-bar").props.style)?.position,
    ).toBeUndefined();
    expect(footerStyle().position).toBe("absolute");
  });

  it("on a detail screen sits on the bottom inset, and the content pads by its height", () => {
    renderStacked(form);
    layoutFooter(70);
    expect(footerStyle().bottom).toBe(34);
    expect(contentPadding()).toBe(70 + 34 + 16);
  });

  it("on a tab sits above the pill (the shell padding)", () => {
    renderWithProviders(form);
    layoutFooter(70);
    expect(footerStyle().bottom).toBe(114);
    expect(contentPadding()).toBe(70 + 114 + 16);
  });

  it("rides the keyboard (iOS: the keyboard's height)", () => {
    withKeyboard((show) => {
      renderStacked(form);
      layoutFooter(70);
      act(() => show({ endCoordinates: { height: 300, screenY: 500 } }));
      expect(footerStyle().bottom).toBe(300);
      expect(contentPadding()).toBe(70 + 300 + 16);
    });
  });

  it("rides the keyboard on Android with the nav bar under it added back", () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      withKeyboard((show) => {
        renderStacked(form);
        layoutFooter(70);
        act(() => show({ endCoordinates: { height: 282, screenY: 500 } }));
        expect(footerStyle().bottom).toBe(282 + 34);
      });
    } finally {
      os.restore();
    }
  });

  it("keeps the focused field above the bar as well as the keyboard", () => {
    const focused = jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
        cb(0, 300, 300, 40),
    } as never);
    try {
      withKeyboard((show) => {
        renderStacked(form);
        layoutFooter(70);
        act(() => show({ endCoordinates: { height: 300, screenY: 500 } }));
        act(() => jest.advanceTimersByTime(0));
        // Field bottom 340 + 96 gap + 70 bar - keyboard top 500 = 6.
        const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
        expect(scrollTo).toHaveBeenCalledWith({ y: 6, animated: false });
      });
    } finally {
      focused.mockRestore();
    }
  });

  it("on a tab drops to the inset while the pill is hidden, and the scroll padding holds", () => {
    renderWithProviders(form);
    layoutFooter(70);
    act(() => useTabBarScroll().onScrollDirection("down", false));
    expect(footerStyle().bottom).toBe(34);
    expect(contentPadding()).toBe(70 + 114 + 16);

    act(() => useTabBarScroll().onScrollDirection("up", false));
    expect(footerStyle().bottom).toBe(114);
  });

  it("without a footer the padding is unchanged", () => {
    renderStacked(
      <Screen title="Plain">
        <RNText>x</RNText>
      </Screen>,
    );
    expect(screen.queryByTestId("screen-footer")).toBeNull();
    expect(contentPadding()).toBe(34 + 16);
  });
});
