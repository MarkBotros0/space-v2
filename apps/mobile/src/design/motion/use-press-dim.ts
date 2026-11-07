import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DURATION } from "./tokens";

/** How far a pressed control dims. */
export const PRESS_OPACITY = 0.7;
/** Dimming on touch is near-instant, so the press reads as immediate. */
const PRESS_IN_MS = 60;

/**
 * Press feedback: the control dims while held and fades back on release, as
 * native iOS controls do (owner, 2026-11-07: no shrink-and-spring). Spread
 * `animatedStyle` onto an Animated view.
 */
export function usePressDim() {
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return {
    animatedStyle,
    onPressIn: () => {
      opacity.value = withTiming(PRESS_OPACITY, { duration: PRESS_IN_MS });
    },
    onPressOut: () => {
      opacity.value = withTiming(1, { duration: DURATION.fast });
    },
  };
}
