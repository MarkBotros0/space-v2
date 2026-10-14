const { boxShadow } = require("../theme/tailwind-theme.js") as { boxShadow: Record<string, string> };

export type ShadowName = "xs" | "sm" | "md" | "lg" | "xl" | "soft" | "pop" | "lift";

export const SHADOWS = boxShadow as Record<ShadowName, string>;

/**
 * Fallback for when NativeWind's shadow classes do not render (Task 2,
 * question 5). React Native 0.81 accepts CSS box-shadow strings natively.
 */
export function shadowStyle(name: ShadowName): { boxShadow: string } {
  return { boxShadow: SHADOWS[name] };
}
