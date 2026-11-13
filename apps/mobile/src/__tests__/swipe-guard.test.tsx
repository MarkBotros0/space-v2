import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SWIPE_TAP_GRACE_MS, swipeBlocksTap, swipeEnded, swipeStarted } from "../design/lib/swipe-guard";
import { Pressable } from "../design/ui/pressable";

describe("swipe guard (owner 2026-11-14: a swipe across a row changes tab, never opens it)", () => {
  it("blocks taps while a swipe runs and for the grace after it", () => {
    swipeStarted();
    expect(swipeBlocksTap(0)).toBe(true);
    swipeEnded(1000);
    expect(swipeBlocksTap(1000 + SWIPE_TAP_GRACE_MS - 1)).toBe(true);
    expect(swipeBlocksTap(1000 + SWIPE_TAP_GRACE_MS)).toBe(false);
  });

  it("the kit's Pressable drops a press that ends a swipe and keeps an ordinary tap", () => {
    const onPress = jest.fn();
    render(
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>Row</Text>
      </Pressable>,
    );
    swipeStarted();
    fireEvent.press(screen.getByText("Row"));
    expect(onPress).not.toHaveBeenCalled();
    swipeEnded(Date.now() - SWIPE_TAP_GRACE_MS);
    fireEvent.press(screen.getByText("Row"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
