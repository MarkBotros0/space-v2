import { act, render } from "@testing-library/react-native";
import { Keyboard, ScrollView, TextInput } from "react-native";

import { useKeyboardInset } from "../design/lib/keyboard-inset";

// A sheet's scroll view reaches under the keyboard but its top sits under the
// title: the 96dp field gap must not push a tall field above the viewport top.

function Harness({ clamp, cover }: { clamp?: boolean; cover?: number }) {
  const { scrollProps } = useKeyboardInset({
    clampToViewport: clamp,
    getTopCover: cover === undefined ? undefined : () => cover,
  });
  return <ScrollView {...scrollProps} />;
}

function open(clamp?: boolean, { fieldTop = 300, cover, from = 0 }: { fieldTop?: number; cover?: number; from?: number } = {}) {
  jest.useFakeTimers();
  const listeners: Record<string, (e: unknown) => void> = {};
  jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, cb: never) => {
    listeners[event] = cb;
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
  // Field top 300, height 120; keyboard top 400: overlap = 420 + 96 - 400 = 116.
  jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, fieldTop, 300, 120),
  } as never);
  const scrollTo = jest.fn();
  const proto = ScrollView.prototype as unknown as Record<string, unknown>;
  proto.scrollTo = scrollTo;
  // Scroll view top at 200: only 88 of room above the field once 12 of margin is kept.
  proto.measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 200, 360, 400);
  const view = render(<Harness clamp={clamp} cover={cover} />);
  if (from) view.UNSAFE_getByType(ScrollView).props.onScroll({ nativeEvent: { contentOffset: { y: from } } });
  act(() => {
    (listeners.keyboardWillShow ?? listeners.keyboardDidShow)!({ endCoordinates: { height: 400, screenY: 400 } });
    jest.advanceTimersByTime(500);
  });
  return scrollTo;
}

describe("useKeyboardInset clampToViewport", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("scrolls by the whole overlap without the clamp", () => {
    expect(open(false)).toHaveBeenCalledWith({ y: 116, animated: false });
  });

  it("with the clamp never scrolls the field's top above the viewport top", () => {
    const scrollTo = open(true);
    expect(scrollTo).toHaveBeenCalledWith({ y: 88, animated: false });
    expect(scrollTo).not.toHaveBeenCalledWith({ y: 116, animated: false });
  });

  it("clamps by default (every Screen form, not only sheets)", () => {
    expect(open(undefined)).toHaveBeenCalledWith({ y: 88, animated: false });
  });

  // A tab's collapsed title is drawn over the scroll view's top (sweep: search fields behind it).
  it("keeps the field below a header drawn over the scroll view (getTopCover)", () => {
    // Visible top = 200 + 44: room = 300 - 244 - 12 = 44.
    expect(open(undefined, { cover: 44 })).toHaveBeenCalledWith({ y: 44, animated: false });
  });

  // Android's own focus scroll can leave the field under that header: bring it back down.
  it("scrolls back down when the field already sits under the header", () => {
    // Field top 210, visible top 244: room = 210 - 244 - 12 = -46, from 100 -> 54.
    expect(open(undefined, { fieldTop: 210, cover: 44, from: 100 })).toHaveBeenCalledWith({ y: 54, animated: false });
  });
});
