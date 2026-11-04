import type { WithSpringConfig } from "react-native-reanimated";

/** Animation durations in ms. */
export const DURATION = { fast: 150, base: 220, slow: 320 } as const;

/** Spring presets: snappy for presses and toggles, gentle for larger movement. */
export const SPRING: { snappy: WithSpringConfig; gentle: WithSpringConfig } = {
  snappy: { damping: 18, stiffness: 260 },
  gentle: { damping: 22, stiffness: 160 },
};
