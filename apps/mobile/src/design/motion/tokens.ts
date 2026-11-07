import { Easing } from "react-native-reanimated";

/** Animation durations in ms. */
export const DURATION = { fast: 150, base: 220, slow: 320 } as const;

/**
 * The one easing for anything that moves (owner, 2026-11-07: calm and quick,
 * an educational app, not a cartoon). Decelerates and stops dead: no springs,
 * no overshoot, no bounce anywhere in the app.
 */
export const EASE_OUT = Easing.out(Easing.cubic);
