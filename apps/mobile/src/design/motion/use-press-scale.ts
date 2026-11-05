import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SPRING } from "./tokens";

/** Spring scale-down on press. Spread `animatedStyle` onto an Animated view. */
export function usePressScale(scale = 0.97) {
  const value = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));
  return {
    animatedStyle,
    onPressIn: () => {
      value.value = withSpring(scale, SPRING.snappy);
    },
    onPressOut: () => {
      value.value = withSpring(1, SPRING.snappy);
    },
  };
}
